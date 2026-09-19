// يرسل الرسائل المستحقة من طابور outbound_messages.
// يُستدعى كل دقيقة من pg_cron (بالترويسة x-cron-secret)، أو يدوياً من لوحة الإدارة (بجلسة إداري).
//   POST { action: 'run' }     → إرسال دفعة
//   POST { action: 'status' }  → القنوات المربوطة
import { createClient } from 'npm:@supabase/supabase-js@2';
import { providerStatus, sendMessage, type QueuedMessage } from '../_shared/messaging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const BATCH_SIZE = Number(Deno.env.get('MESSAGE_BATCH_SIZE') || 25);

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = () => Deno.env.toObject();

async function isAuthorized(req: Request, admin: ReturnType<typeof createClient>) {
  const secret = req.headers.get('x-cron-secret');
  if (CRON_SECRET && secret && secret === CRON_SECRET) return true;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data } = await admin.from('profiles').select('role, status').eq('id', user.id).single();
  return data?.status === 'active' && ['super_admin', 'admin'].includes(data.role);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  if (!(await isAuthorized(req, admin))) return json({ error: 'غير مصرح' }, 401);

  let action = 'run';
  try {
    action = (await req.json())?.action || 'run';
  } catch {
    /* طلب بلا جسم = تشغيل */
  }

  if (action === 'status') {
    return json({ channels: providerStatus(env()), cron: Boolean(CRON_SECRET) });
  }

  const { data: batch, error } = await admin.rpc('claim_messages', { p_limit: BATCH_SIZE });
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const msg of (batch || []) as QueuedMessage[]) {
    const result = await sendMessage(msg, env());
    if (result.ok) sent++;
    else failed++;
    await admin.rpc('finish_message', {
      p_id: msg.id, p_ok: result.ok, p_error: result.error ?? null, p_provider_id: result.providerId ?? null,
    });
  }
  return json({ processed: batch?.length ?? 0, sent, failed });
});
