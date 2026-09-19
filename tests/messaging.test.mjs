// يختبر مزودي الإرسال (supabase/functions/_shared/messaging.ts) بطلبات HTTP وهمية.
// التشغيل: npm run test:messaging   (يتطلب Node 22.6+ لتشغيل TypeScript مباشرة)
import { buildWhatsAppPayload, providerStatus, sendMessage, toInternational } from '../supabase/functions/_shared/messaging.ts';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

const base = {
  id: 'm1', channel: 'whatsapp', recipient: '0912345678', body: 'السلام عليكم\nموعد الامتحان غداً',
  params: { student_name: 'عمر سالم', date: '2026-09-20', time: '10:00', org_name: 'برنامج حُفّاظ السُّنة' },
  template_key: 'appointment_scheduled', title: 'موعد الامتحان', whatsapp_template: null, whatsapp_params: [], attempts: 1,
};
const waEnv = { WHATSAPP_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '123456' };

console.log('— أرقام الهاتف');
ok(toInternational('0912345678') === '218912345678', '09X → 2189X');
ok(toInternational('+218 91-234-5678') === '218912345678', '+218 مع مسافات وشرطات');
ok(toInternational('00201001234567') === '201001234567', 'مفتاح دولي 00');

console.log('\n— القنوات المربوطة');
ok(JSON.stringify(providerStatus({})) === JSON.stringify({ whatsapp: false, sms: false, email: false }), 'لا قنوات بلا مفاتيح');
ok(providerStatus(waEnv).whatsapp === true, 'واتساب مربوط بالمفتاح ورقم الهاتف');
const notLinked = await sendMessage(base, {}, mockFetch([]));
ok(!notLinked.ok && notLinked.error.includes('غير مربوطة'), 'قناة غير مربوطة ترجع خطأ واضحاً دون اتصال');

console.log('\n— واتساب');
ok(buildWhatsAppPayload(base, waEnv).type === 'text', 'بلا قالب معتمد: رسالة نصية');
const templated = { ...base, whatsapp_template: 'exam_appointment', whatsapp_params: ['student_name', 'date', 'time', 'missing'] };
const tp = buildWhatsAppPayload(templated, { ...waEnv, WHATSAPP_TEMPLATE_LANG: 'ar' });
ok(tp.type === 'template' && tp.template.name === 'exam_appointment' && tp.template.language.code === 'ar', 'قالب معتمد باسمه ولغته');
ok(JSON.stringify(tp.template.components[0].parameters.map((p) => p.text)) === JSON.stringify(['عمر سالم', '2026-09-20', '10:00', '—']),
  'متغيرات القالب بالترتيب، والناقص يُستبدل بشرطة (واتساب يرفض القيم الفارغة)');

const waFetch = mockFetch([{ status: 200, body: { messages: [{ id: 'wamid.ABC' }] } }]);
const waRes = await sendMessage(templated, waEnv, waFetch);
ok(waRes.ok && waRes.providerId === 'wamid.ABC', 'إرسال ناجح يعيد معرّف الرسالة');
ok(waFetch.calls[0].url === 'https://graph.facebook.com/v23.0/123456/messages' && waFetch.calls[0].init.headers.Authorization === 'Bearer tok',
  'العنوان والترويسة صحيحان');
ok(waFetch.calls[0].body.to === '218912345678', 'الرقم يُرسل بالصيغة الدولية');

const waFail = await sendMessage(base, waEnv, mockFetch([{ status: 400, body: { error: { message: '(#131047) Re-engagement message' } } }]));
ok(!waFail.ok && waFail.error.includes('131047'), `رسالة خطأ المزود تُحفظ: ${waFail.error}`);
const thrown = await sendMessage(base, waEnv, async () => { throw new Error('network down'); });
ok(!thrown.ok && thrown.error === 'network down', 'انقطاع الشبكة لا يوقف العامل');

console.log('\n— SMS والبريد');
const smsFetch = mockFetch([{ status: 200, body: { id: 'sms-1' } }]);
const sms = await sendMessage({ ...base, channel: 'sms' }, { SMS_API_URL: 'https://sms.example.ly/send', SMS_API_KEY: 'k', SMS_SENDER: 'HUFFAZ' }, smsFetch);
ok(sms.ok && smsFetch.calls[0].body.to === '218912345678' && smsFetch.calls[0].body.sender === 'HUFFAZ', 'SMS عبر المزود العام');
const mailFetch = mockFetch([{ status: 200, body: { id: 'email-1' } }]);
const mail = await sendMessage({ ...base, channel: 'email', recipient: 'parent@example.com' },
  { RESEND_API_KEY: 're_x', EMAIL_FROM: 'noreply@hussas.ly' }, mailFetch);
ok(mail.ok && mailFetch.calls[0].body.subject === 'برنامج حُفّاظ السُّنة — موعد الامتحان' && mailFetch.calls[0].body.to[0] === 'parent@example.com',
  'البريد عبر Resend بعنوان من اسم الجهة والقالب');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
