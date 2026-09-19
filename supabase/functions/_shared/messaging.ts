// مزودو الإرسال: WhatsApp Cloud API، ومزود SMS عام عبر HTTP، و Resend للبريد.
// دوال خالية من الاعتماد على Deno حتى تُختبر في Node (tests/messaging.test.mjs).

export type Channel = 'whatsapp' | 'sms' | 'email';

export interface QueuedMessage {
  id: string;
  channel: Channel;
  recipient: string;
  body: string;
  params: Record<string, string>;
  template_key: string;
  title: string;
  whatsapp_template: string | null;
  whatsapp_params: string[];
  attempts: number;
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

export type Env = Record<string, string | undefined>;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function providerStatus(env: Env) {
  return {
    whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    sms: Boolean(env.SMS_API_URL),
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
  };
}

/** رقم دولي بأرقام فقط كما يطلبه واتساب: 0912345678 → 218912345678 */
export function toInternational(phone: string, defaultCountry = '218'): string {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return defaultCountry + digits.slice(1);
  return digits;
}

export function buildWhatsAppPayload(msg: QueuedMessage, env: Env) {
  const to = toInternational(msg.recipient, env.DEFAULT_COUNTRY_CODE || '218');
  if (msg.whatsapp_template) {
    // الرسائل الأولى للطالب يجب أن تكون قالباً معتمداً من Meta
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: msg.whatsapp_template,
        language: { code: env.WHATSAPP_TEMPLATE_LANG || 'ar' },
        components: msg.whatsapp_params.length
          ? [{
            type: 'body',
            parameters: msg.whatsapp_params.map((key) => ({ type: 'text', text: String(msg.params?.[key] ?? '').slice(0, 1024) || '—' })),
          }]
          : [],
      },
    };
  }
  // نص حر: يُقبل فقط خلال 24 ساعة من آخر رسالة من الطالب (نافذة خدمة العملاء)
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.body.slice(0, 4096), preview_url: true } };
}

async function readError(res: Response): Promise<string> {
  let detail = '';
  try {
    const data = await res.json();
    detail = data?.error?.message || data?.message || JSON.stringify(data);
  } catch {
    try {
      detail = await res.text();
    } catch {
      /* لا تفاصيل */
    }
  }
  return `HTTP ${res.status}${detail ? `: ${detail}` : ''}`.slice(0, 1000);
}

export async function sendWhatsApp(msg: QueuedMessage, env: Env, fetchFn: Fetch): Promise<SendResult> {
  const version = env.WHATSAPP_API_VERSION || 'v23.0';
  const res = await fetchFn(`https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildWhatsAppPayload(msg, env)),
  });
  if (!res.ok) return { ok: false, error: await readError(res) };
  const data = await res.json();
  return { ok: true, providerId: data?.messages?.[0]?.id };
}

/**
 * مزود SMS عام: يرسل JSON إلى SMS_API_URL بالشكل { to, message, sender }.
 * عدّل الحقول بحسب مزود الرسائل المعتمد (ليبيانا، المدار، أو مجمّع رسائل).
 */
export async function sendSms(msg: QueuedMessage, env: Env, fetchFn: Fetch): Promise<SendResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.SMS_API_KEY) headers.Authorization = `Bearer ${env.SMS_API_KEY}`;
  const res = await fetchFn(env.SMS_API_URL as string, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to: toInternational(msg.recipient, env.DEFAULT_COUNTRY_CODE || '218'), message: msg.body, sender: env.SMS_SENDER }),
  });
  if (!res.ok) return { ok: false, error: await readError(res) };
  let providerId: string | undefined;
  try {
    const data = await res.json();
    providerId = data?.id ?? data?.message_id;
  } catch {
    /* بعض المزودين لا يعيدون JSON */
  }
  return { ok: true, providerId };
}

export async function sendEmail(msg: QueuedMessage, env: Env, fetchFn: Fetch): Promise<SendResult> {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.recipient], subject: `${msg.params?.org_name || ''} — ${msg.title}`.trim(), text: msg.body }),
  });
  if (!res.ok) return { ok: false, error: await readError(res) };
  const data = await res.json();
  return { ok: true, providerId: data?.id };
}

export async function sendMessage(msg: QueuedMessage, env: Env, fetchFn: Fetch = fetch): Promise<SendResult> {
  const status = providerStatus(env);
  if (!status[msg.channel]) {
    return { ok: false, error: `قناة «${msg.channel}» غير مربوطة: أضف مفاتيح المزود إلى أسرار Edge Functions` };
  }
  try {
    if (msg.channel === 'whatsapp') return await sendWhatsApp(msg, env, fetchFn);
    if (msg.channel === 'sms') return await sendSms(msg, env, fetchFn);
    return await sendEmail(msg, env, fetchFn);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
