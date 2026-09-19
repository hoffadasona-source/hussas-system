// يختبر الإشعارات الآلية: إضافة الرسائل للطابور عند الأحداث، التذكير قبل الموعد، الإلغاء عند التغيير،
// حجز الدفعات وإعادة المحاولة، والصلاحيات.
// التشغيل: npm run test:notifications
import { bootDb } from './pglite.mjs';

const db = await bootDb({ quiet: true });
let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};
async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const qa = async (sql, params) => (await db.query(sql, params)).rows;
async function expectError(label, fn) {
  try { await fn(); failures++; console.log(`  ✗ متوقع رفض: ${label}`); }
  catch (e) { console.log(`  ✓ ممنوع: ${label} → ${e.message}`); }
}
const messages = (appId) => qa(`select template_key, status, body, send_after, attempts, dedupe_key from outbound_messages
  where application_id = $1 order by created_at, send_after`, [appId]);

const SUPER = '11111111-1111-1111-1111-111111111111';
const CLERK = '44444444-4444-4444-4444-444444444444';
const EXMU = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users (id) values ('${SUPER}'), ('${CLERK}'), ('${EXMU}');
  insert into profiles (id, full_name, username, role, can_final_approve, can_issue_certificates) values
    ('${SUPER}', 'مدير', 'admin', 'super_admin', false, false),
    ('${CLERK}', 'إداري', 'clerk', 'admin', true, true),
    ('${EXMU}', 'محفّظ', 'exm', 'examiner', false, false);
  insert into examiners (user_id, full_name, office_id) select '${EXMU}', 'محفّظ', id from offices limit 1;
  insert into grade_scales (name, min_score, max_score, is_passing) values ('ممتاز', 90, 100, true), ('جيد جداً', 80, 89.99, true);
`);
const exm = (await q1(`select id from examiners limit 1`)).id;
const lk = await q1(`select (select id from offices order by sort_order limit 1) office, (select id from levels limit 1) level,
  (select json_agg(id) from (select id from matns order by sort_order limit 2) t) matns`);
const payload = (nid) => JSON.stringify({
  first_name: 'عمر', father_name: 'سالم', family_name: 'الاختبار', birth_date: '2006-01-01', gender: 'male', national_id: nid,
  residence: 'طرابلس', phone: '0912345678', whatsapp: '0923456789', section: 'men', circle_name: 'حلقة', center_name: 'مركز',
  office_id: lk.office, level_id: lk.level, memorized_amount: 'كامل', matn_ids: lk.matns,
});

console.log('— الإشعارات معطّلة افتراضياً');
const first = await as('anon', null, () => q1(`select submit_application($1::jsonb) r`, [payload('120000000001')]));
const firstApp = (await q1(`select id from applications where reg_no = $1`, [first.r.reg_no])).id;
ok((await messages(firstApp)).length === 0, 'لا تُضاف رسائل قبل تفعيل الإشعارات');

await as('authenticated', SUPER, () => db.query(`update settings set notify_enabled = true, public_site_url = 'https://exams.hussas.ly/', reminder_hours = '{24,2}' where id = 1`));
await expectError('الإداري يفعّل الإشعارات (لمدير النظام فقط)', async () => {
  const r = await as('authenticated', CLERK, () => db.query(`update settings set notify_enabled = false where id = 1`));
  if (r.affectedRows === 0) throw new Error('0 rows (RLS)');
});

console.log('\n— التسجيل والمراجعة');
const sub = await as('anon', null, () => q1(`select submit_application($1::jsonb) r`, [payload('120000000002')]));
const appId = (await q1(`select id from applications where reg_no = $1`, [sub.r.reg_no])).id;
let msgs = await messages(appId);
ok(msgs.length === 1 && msgs[0].template_key === 'application_received', 'رسالة استلام الطلب');
ok(msgs[0].body.includes(sub.r.reg_no) && msgs[0].body.includes('الأربعون') === false || msgs[0].body.includes(sub.r.reg_no),
  'النص يتضمن رقم الطلب');
const matnNames = (await qa(`select name from matns order by sort_order limit 2`)).map((m) => m.name);
ok(matnNames.every((n) => msgs[0].body.includes(n)), `المتون تظهر في الرسالة رغم إضافتها بعد الطلب (مشغّل مؤجَّل): ${matnNames.join('، ')}`);
ok(msgs[0].body.includes(`https://exams.hussas.ly/application-status?q=${sub.r.reg_no}`), 'رابط المتابعة مبني من رابط الموقع');
ok(!/\{\{/.test(msgs[0].body), 'لا توجد متغيرات غير مستبدلة');
const recipient = (await q1(`select recipient from outbound_messages where application_id = $1`, [appId])).recipient;
ok(recipient === '0923456789', 'الإرسال إلى رقم واتساب لا رقم الهاتف');

await as('authenticated', CLERK, () => q1(`select approve_application($1)`, [appId]));
await as('authenticated', CLERK, () => q1(`select assign_application($1, $2, null)`, [appId, exm]));
msgs = await messages(appId);
ok(msgs.filter((m) => m.template_key === 'application_approved').length === 1, 'رسالة قبول واحدة فقط رغم القبول ثم التحويل');

console.log('\n— الموعد والتذكير');
const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const aptId = (await as('authenticated', EXMU, () => q1(`select save_appointment($1, $2, '10:00', 'whatsapp_room', 'https://chat.whatsapp.com/abc', 'أحضر المصحف', null) id`, [appId, day(3)]))).id;
msgs = await messages(appId);
const scheduled = msgs.filter((m) => m.template_key === 'appointment_scheduled');
const reminders = msgs.filter((m) => m.template_key === 'appointment_reminder' && m.status === 'queued');
ok(scheduled.length === 1 && scheduled[0].body.includes(day(3)) && scheduled[0].body.includes('10:00') && scheduled[0].body.includes('https://chat.whatsapp.com/abc'),
  'رسالة الموعد بالتاريخ والوقت والرابط');
ok(reminders.length === 2, 'تذكيران مجدولان (قبل 24 ساعة وقبل ساعتين)');
const startUtc = Date.parse(`${day(3)}T10:00:00+02:00`); // توقيت طرابلس UTC+2
const offsets = reminders.map((r) => (startUtc - new Date(r.send_after).getTime()) / 3600e3).sort((a, b) => b - a);
ok(offsets[0] === 24 && offsets[1] === 2, `وقت التذكير محسوب بتوقيت ليبيا: قبل ${offsets.join(' و ')} ساعة`);

await as('authenticated', EXMU, () => q1(`select save_appointment($1, $2, '18:30', 'whatsapp_call', null, null, $3)`, [appId, day(5), aptId]));
msgs = await messages(appId);
ok(msgs.filter((m) => m.template_key === 'appointment_reminder' && m.status === 'cancelled').length === 2, 'تغيير الموعد يُلغي التذكيرات القديمة');
ok(msgs.filter((m) => m.template_key === 'appointment_reminder' && m.status === 'queued').length === 2, 'وتُجدول تذكيرات للموعد الجديد');
ok(msgs.filter((m) => m.template_key === 'appointment_scheduled').length === 2, 'وتُرسل رسالة بالموعد الجديد');

console.log('\n— العامل: الحجز والإرسال وإعادة المحاولة');
const batch = await as('service_role', null, () => qa(`select * from claim_messages(50)`));
// المستحق: الاستلام، القبول، الموعد الجديد. (إشعار الموعد القديم أُلغي عند التغيير، والتذكيرات مستقبلية)
ok(batch.length === 3 && batch.every((m) => m.attempts === 1) && batch.map((m) => m.template_key).sort().join() === 'application_approved,application_received,appointment_scheduled',
  `حجز الرسائل المستحقة فقط (${batch.map((m) => m.template_key).join('، ')})`);
ok(batch[0].title && Array.isArray(batch[0].whatsapp_params), 'الدفعة تتضمن عنوان القالب وإعدادات واتساب');
const again = await as('service_role', null, () => qa(`select * from claim_messages(50)`));
ok(again.length === 0, 'لا تُحجز الرسالة مرتين');

const latestScheduled = batch.find((m) => m.template_key === 'appointment_scheduled' && m.body.includes('18:30'));
await as('service_role', null, () => q1(`select finish_message($1, true, null, 'wamid.TEST')`, [latestScheduled.id]));
ok((await q1(`select notified_at from appointments where id = $1`, [aptId])).notified_at !== null, 'إرسال رسالة الموعد يحدّث «أُرسل الإشعار»');
ok((await q1(`select status, provider_message_id from outbound_messages where id = $1`, [latestScheduled.id])).provider_message_id === 'wamid.TEST', 'حفظ معرّف الرسالة لدى المزود');
const remindersAfter = await qa(`select status from outbound_messages where appointment_id = $1 and template_key = 'appointment_reminder' and status = 'queued'`, [aptId]);
ok(remindersAfter.length === 2, 'تحديث حالة الإشعار لا يلغي التذكيرات');

const failing = batch.find((m) => m.template_key === 'application_received');
for (let attempt = 1; attempt <= 3; attempt++) {
  await as('service_role', null, () => q1(`select finish_message($1, false, 'HTTP 500', null)`, [failing.id]));
  const row = await q1(`select status, attempts, send_after from outbound_messages where id = $1`, [failing.id]);
  if (attempt < 3) {
    ok(row.status === 'queued' && new Date(row.send_after) > new Date(), `فشل المحاولة ${attempt}: تُعاد للطابور بعد ${5 * attempt} دقائق`);
    await db.query(`update outbound_messages set send_after = now() - interval '1 second' where id = $1`, [failing.id]);
    const re = await as('service_role', null, () => qa(`select * from claim_messages(50)`));
    ok(re.some((m) => m.id === failing.id && m.attempts === attempt + 1), `إعادة الحجز (المحاولة ${attempt + 1})`);
  } else {
    ok(row.status === 'failed', 'بعد 3 محاولات تُعلَّم «فشل»');
  }
}
await as('authenticated', CLERK, () => q1(`select retry_message($1)`, [failing.id]));
ok((await q1(`select status, attempts from outbound_messages where id = $1`, [failing.id])).status === 'queued', 'الإداري يعيد إرسال رسالة فاشلة');

await db.query(`update outbound_messages set status = 'sending', claimed_at = now() - interval '11 minutes' where id = $1`, [failing.id]);
const recovered = await as('service_role', null, () => qa(`select * from claim_messages(50)`));
ok(recovered.some((m) => m.id === failing.id), 'رسالة عالقة في «جارٍ الإرسال» أكثر من 10 دقائق تُستعاد');

console.log('\n— الغياب والنتيجة والشهادة');
await as('authenticated', EXMU, () => q1(`select set_appointment_status($1, 'absent', null)`, [aptId]));
ok((await qa(`select 1 from outbound_messages where appointment_id = $1 and status = 'queued'`, [aptId])).length === 0, 'تسجيل الغياب يُلغي التذكيرات');

await as('authenticated', EXMU, () => q1(`select save_appointment($1, $2, '09:00', 'whatsapp_room', null, null, null)`, [appId, day(1)]));
const examId = (await as('authenticated', EXMU, () => q1(`select start_exam($1) id`, [appId]))).id;
const cfg = (await q1(`select config from exams where id = $1`, [examId])).config;
await as('authenticated', EXMU, () => db.query(`update exam_questions set criteria_scores = $1::jsonb, touched = true where exam_id = $2`, [JSON.stringify({ [cfg.criteria[0].id]: 9 }), examId]));
await as('authenticated', EXMU, () => q1(`select submit_exam($1)`, [examId]));
ok((await messages(appId)).every((m) => m.template_key !== 'result_published'), 'لا رسالة نتيجة قبل اعتماد الإدارة');
await as('authenticated', CLERK, () => q1(`select approve_exam($1, null)`, [examId]));
const result = (await messages(appId)).find((m) => m.template_key === 'result_published');
ok(result?.body.includes('98') && result.body.includes('ممتاز') && result.body.includes('https://exams.hussas.ly/result'), 'رسالة النتيجة بالدرجة والتقدير والرابط');
const certNo = (await as('authenticated', CLERK, () => q1(`select issue_certificate($1) no`, [examId]))).no;
const cert = (await messages(appId)).find((m) => m.template_key === 'certificate_issued');
ok(cert?.body.includes(certNo) && cert.body.includes(`certificate-verification?no=${certNo}`), `رسالة الشهادة برقمها ورابط التحقق (${certNo})`);

console.log('\n— القوالب والصلاحيات');
await as('authenticated', SUPER, () => db.query(`update message_templates set enabled = false where key = 'application_received'`));
const third = await as('anon', null, () => q1(`select submit_application($1::jsonb) r`, [payload('120000000003')]));
const thirdApp = (await q1(`select id from applications where reg_no = $1`, [third.r.reg_no])).id;
ok((await messages(thirdApp)).length === 0, 'القالب الموقوف لا يُرسل');
ok((await q1(`select render_template('مرحبا {{student_name}} {{unknown}}', '{"student_name":"عمر"}') r`)).r === 'مرحبا عمر', 'حذف المتغيرات غير المعروفة');

await expectError('المحفّظ يقرأ الرسائل', async () => {
  const r = await as('authenticated', EXMU, () => qa(`select * from outbound_messages`));
  if (!r.length) throw new Error('0 rows (RLS)');
});
await expectError('الزائر يقرأ الرسائل', () => as('anon', null, () => qa(`select * from outbound_messages`)));
await expectError('المستخدم يستدعي claim_messages', () => as('authenticated', SUPER, () => qa(`select * from claim_messages(5)`)));
await expectError('الإداري يعدّل القوالب', async () => {
  const r = await as('authenticated', CLERK, () => db.query(`update message_templates set body = 'x' where key = 'test'`));
  if (r.affectedRows === 0) throw new Error('0 rows (RLS)');
});
await expectError('الإداري يرسل رسالة تجريبية', () => as('authenticated', CLERK, () => q1(`select send_test_message('0911111111')`)));
const testId = (await as('authenticated', SUPER, () => q1(`select send_test_message('+218 91 111 1111') id`))).id;
ok((await q1(`select recipient from outbound_messages where id = $1`, [testId])).recipient === '+218911111111', 'مدير النظام يرسل رسالة تجريبية');
const adminView = await as('authenticated', CLERK, () => qa(`select * from v_outbound_messages`));
ok(adminView.length > 5 && adminView.some((m) => m.template_title === 'موعد الامتحان'), 'الإداري يرى سجل الرسائل');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
