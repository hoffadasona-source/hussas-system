// يطبّق ملفات migrations على Postgres داخل الذاكرة (PGlite) ويختبر سير العمل والصلاحيات كاملاً.
// التشغيل: npm run test:db
import { bootDb } from './pglite.mjs';

process.on('unhandledRejection', (e) => {
  console.error('\nFATAL:', e.message, '\n', e.where || '', '\n', e.query || '');
  process.exit(1);
});
const db = await bootDb();

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };

async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const qa = async (sql, params) => (await db.query(sql, params)).rows;
async function expectError(label, fn) {
  try { await fn(); failures++; console.log('  ✗ expected error:', label); }
  catch (e) { console.log('  ✓ blocked:', label, '→', e.message); }
}

// ---- الحسابات (كمفتاح الخدمة) ----
const ADMIN = '11111111-1111-1111-1111-111111111111';
const EXM1U = '22222222-2222-2222-2222-222222222222';
const EXM2U = '33333333-3333-3333-3333-333333333333';
const CLERK = '44444444-4444-4444-4444-444444444444';
await db.exec(`
  insert into auth.users (id) values ('${ADMIN}'), ('${EXM1U}'), ('${EXM2U}'), ('${CLERK}');
  insert into profiles (id, full_name, username, role) values
    ('${ADMIN}', 'مصطفى الهادي', 'admin', 'super_admin'),
    ('${EXM1U}', 'عبدالسلام الفيتوري', 'a.fituri', 'examiner'),
    ('${EXM2U}', 'محمد الزروق', 'm.zarrouq', 'examiner'),
    ('${CLERK}', 'نورالدين الساعدي', 'n.saedi', 'admin');
  insert into examiners (user_id, full_name, employee_no, office_id)
    select '${EXM1U}', 'عبدالسلام الفيتوري', '1024', id from offices where active order by sort_order limit 1;
  insert into examiners (user_id, full_name, employee_no, office_id)
    select '${EXM2U}', 'محمد الزروق', '1031', id from offices where active order by sort_order limit 1;
`);
const exm1 = (await q1(`select id from examiners where user_id = $1`, [EXM1U])).id;
const lookups = await q1(`select (select id from offices where active order by sort_order limit 1) office,
  (select id from levels where active order by sort_order limit 1) level,
  (select name from levels where active order by sort_order limit 1) level_name`);

console.log('\n— الواجهة العامة (anon)');
const payload = {
  first_name: 'محمد', father_name: 'أحمد', grandfather_name: 'عبدالله', family_name: 'الشريف',
  birth_date: '2005-03-01', gender: 'male', national_id: '119870001234', residence: 'طرابلس',
  phone: '091-234-5678', whatsapp: '0912345678', email: '', section: 'men',
  circle_name: 'حلقة النور', center_name: 'مركز الفتح', office_id: lookups.office, level_id: lookups.level,
  memorized_amount: 'المستوى كاملاً',
};
const sub = await as('anon', null, () => q1(`select submit_application($1::jsonb) r`, [JSON.stringify(payload)]));
ok(/^REG-\d{4}-00001$/.test(sub.r.reg_no), `submit_application → ${sub.r.reg_no} / ${sub.r.student_no}`);
await expectError('طلب ثانٍ في نفس الدورة', () => as('anon', null, () => q1(`select submit_application($1::jsonb)`, [JSON.stringify(payload)])));
await expectError('رقم وطني مسجَّل ببيانات مختلفة', () => as('anon', null, () =>
  q1(`select submit_application($1::jsonb)`, [JSON.stringify({ ...payload, first_name: 'منتحل' })])));
await expectError('رقم هاتف غير صحيح', () => as('anon', null, () =>
  q1(`select submit_application($1::jsonb)`, [JSON.stringify({ ...payload, national_id: '120000000001', phone: '123' })])));
await expectError('anon يقرأ جدول الطلبة', () => as('anon', null, () => qa(`select * from students`)));
await expectError('anon يستدعي approve_application', () => as('anon', null, () => qa(`select approve_application(gen_random_uuid())`)));
const tr = await as('anon', null, () => q1(`select track_application($1) r`, [sub.r.reg_no]));
ok(tr.r.status === 'pending' && tr.r.student_name === 'محمد أحمد عبدالله الشريف', 'track_application بالرقم ' + tr.r.student_name);
const tr2 = await as('anon', null, () => q1(`select track_application($1) r`, ['119870001234']));
ok(tr2.r?.reg_no === sub.r.reg_no, 'track_application بالرقم الوطني');
const pubs = await as('anon', null, () => qa(`select * from settings`));
ok(pubs.length === 1, 'anon يقرأ الإعدادات العامة');

const appId = (await q1(`select id from applications where reg_no = $1`, [sub.r.reg_no])).id;
const notifs = await q1(`select count(*)::int c from notifications where recipient_id in ('${ADMIN}', '${CLERK}')`);
ok(notifs.c === 2, 'إشعار الإداريين بالطلب الجديد');

console.log('\n— الإدارة');
await expectError('المحفّظ يقبل الطلب', () => as('authenticated', EXM1U, () => qa(`select approve_application($1)`, [appId])));
await as('authenticated', CLERK, () => qa(`select mark_application_under_review($1)`, [appId]));
await as('authenticated', CLERK, () => qa(`select approve_application($1)`, [appId]));
await as('authenticated', CLERK, () => qa(`select assign_application($1, $2, 'ملاحظة')`, [appId, exm1]));
const va = await as('authenticated', CLERK, () => q1(`select status, examiner_name, level_name from v_applications where id = $1`, [appId]));
ok(va.status === 'assigned' && va.examiner_name === 'عبدالسلام الفيتوري' && va.level_name === lookups.level_name, 'assign → ' + va.status);
await expectError('الإداري يعدّل حالة الطلب مباشرة', () => as('authenticated', CLERK, () => qa(`update applications set status = 'published' where id = $1`, [appId])));
await expectError('الإداري يعدّل الإعدادات (لمدير النظام فقط)', async () => {
  const r = await as('authenticated', CLERK, () => db.query(`update settings set org_name = 'x' where id = 1`));
  if (r.affectedRows === 0) throw new Error('0 rows (RLS)');
});

console.log('\n— المحفّظ');
const seen1 = await as('authenticated', EXM1U, () => qa(`select id from v_applications`));
const seen2 = await as('authenticated', EXM2U, () => qa(`select id from v_applications`));
ok(seen1.length === 1 && seen2.length === 0, `عزل المحفّظين: الأول يرى ${seen1.length} والثاني يرى ${seen2.length}`);
const stud2 = await as('authenticated', EXM2U, () => qa(`select id from students`));
ok(stud2.length === 0, 'المحفّظ الآخر لا يرى بيانات الطالب');
await expectError('بدء امتحان قبل تحديد موعد', () => as('authenticated', EXM1U, () => q1(`select start_exam($1)`, [appId])));
const apt = await as('authenticated', EXM1U, () => q1(`select save_appointment($1, '2026-09-20', '10:00', 'whatsapp_room', null, null, null) id`, [appId]));
ok(!!apt.id, 'save_appointment');
await as('authenticated', EXM1U, () => qa(`select mark_appointment_notified($1)`, [apt.id]));
await expectError('المحفّظ الآخر يبدأ الامتحان', () => as('authenticated', EXM2U, () => q1(`select start_exam($1)`, [appId])));
const ex = await as('authenticated', EXM1U, () => q1(`select start_exam($1) id`, [appId]));
const again = await as('authenticated', EXM1U, () => q1(`select start_exam($1) id`, [appId]));
ok(ex.id === again.id, 'start_exam يستأنف نفس الجلسة');
const cfg = (await q1(`select config from exams where id = $1`, [ex.id])).config;
const voice = cfg.criteria[0].id;
const tanbih = cfg.deductions.find(d => d.name === 'التنبيه').id;
const lahn = cfg.deductions.find(d => d.name === 'اللحن الخفي').id;
const qs = await as('authenticated', EXM1U, () => qa(`select q_index, score from exam_questions where exam_id = $1 order by q_index`, [ex.id]));
ok(qs.length === 3 && Number(qs[0].score) === 18, `3 أسئلة، الدرجة الابتدائية بالصوت 5 = ${qs[0].score} من 20 (المتوقع 18)`);

// أساس السؤال 20 · الصوت من 10 بمعامل 0.4 · التنبيه درجة و«اللحن الخفي» ربع درجة
// س1: صوت 8 + تنبيه×1 = 20 − 0.8 − 1 = 18.2 · س2: صوت 9 = 19.6 · س3: صوت 7 + لحن خفي×2 = 20 − 1.2 − 0.5 = 18.3
const upd = (i, c, d) => as('authenticated', EXM1U, () => db.query(
  `update exam_questions set criteria_scores = $1::jsonb, deductions = $2::jsonb, touched = true where exam_id = $3 and q_index = $4`,
  [JSON.stringify(c), JSON.stringify(d), ex.id, i]));
await upd(0, { [voice]: 8 }, { [tanbih]: 1 });
await upd(1, { [voice]: 9 }, {});
await upd(2, { [voice]: 7 }, { [lahn]: 2 });
const qs2 = await as('authenticated', EXM1U, () => qa(`select score from exam_questions where exam_id = $1 order by q_index`, [ex.id]));
ok(qs2.map(r => Number(r.score)).join(',') === '18.2,19.6,18.3', 'درجات الأسئلة بكسور الدليل ' + qs2.map(r => r.score).join(','));
ok((await q1(`select status from exams where id = $1`, [ex.id])).status === 'in_progress', 'الامتحان صار «جارٍ»');
await expectError('المحفّظ الآخر يعدّل الأسئلة', async () => {
  const r = await as('authenticated', EXM2U, () => db.query(`update exam_questions set deductions = '{}' where exam_id = $1`, [ex.id]));
  if (r.affectedRows === 0) throw new Error('0 rows (RLS)');
});
await expectError('المحفّظ يعدّل عمود score مباشرة', () => as('authenticated', EXM1U, () => db.query(`update exam_questions set score = 100 where exam_id = $1`, [ex.id])));
const score = await as('authenticated', EXM1U, () => q1(`select submit_exam($1) s`, [ex.id]));
ok(Number(score.s) === 93.5, `submit_exam → ${score.s} (المتوقع 93.5 = متوسط 18.7 من 20)`);
await expectError('تعديل الأسئلة بعد الإرسال', async () => {
  const r = await as('authenticated', EXM1U, () => db.query(`update exam_questions set deductions = '{}' where exam_id = $1`, [ex.id]));
  if (r.affectedRows === 0) throw new Error('0 rows (RLS)');
});
const pend = await as('anon', null, () => q1(`select lookup_result($1) r`, [sub.r.student_no]));
ok(pend.r.state === 'pending', 'النتيجة لا تظهر قبل الاعتماد: ' + pend.r.state);

console.log('\n— الاعتماد والشهادة');
await expectError('إداري بلا صلاحية يعتمد النتيجة', () => as('authenticated', CLERK, () => qa(`select approve_exam($1, null)`, [ex.id])));
await as('authenticated', ADMIN, () => qa(`select return_exam($1, 'راجع السؤال الثالث')`, [ex.id]));
ok((await q1(`select status from exams where id = $1`, [ex.id])).status === 'rejected', 'إرجاع للمحفّظ');
await upd(2, { [voice]: 7 }, { [lahn]: 1 });
const score2 = await as('authenticated', EXM1U, () => q1(`select submit_exam($1) s`, [ex.id]));
ok(Number(score2.s) === 93.92, `إعادة الإرسال بعد التصحيح → ${score2.s} (متوسط 18.783… من 20 بمنزلتين)`);
await db.exec(`update profiles set can_final_approve = true, can_issue_certificates = true where id = '${CLERK}'`);
await as('authenticated', CLERK, () => qa(`select approve_exam($1, 'ممتاز')`, [ex.id]));
await as('authenticated', ADMIN, () => db.query(`insert into grade_scales (name, min_score, max_score, is_passing) values ('ممتاز', 90, 100, true), ('راسب', 0, 59.99, false)`));
const cert = await as('authenticated', CLERK, () => q1(`select issue_certificate($1) no`, [ex.id]));
ok(/^CERT-\d{4}-00001$/.test(cert.no), 'issue_certificate → ' + cert.no);
await expectError('إصدار شهادة مكررة', () => as('authenticated', CLERK, () => q1(`select issue_certificate($1)`, [ex.id])));

const res = await as('anon', null, () => q1(`select lookup_result($1) r`, ['119870001234']));
ok(res.r.state === 'published' && Number(res.r.score) === 93.92 && res.r.grade === 'ممتاز' && res.r.questions.length === 3,
  `lookup_result → ${res.r.score} ${res.r.grade}, cert ${res.r.certificate?.cert_no}`);
const ver = await as('anon', null, () => q1(`select verify_certificate($1) r`, [cert.no.toLowerCase()]));
ok(ver.r.status === 'valid' && ver.r.student_name.includes('الشريف'), 'verify_certificate');
const nf = await as('anon', null, () => q1(`select verify_certificate('CERT-0000-99999') r`));
ok(nf.r === null, 'شهادة غير موجودة → null');

console.log('\n— اللوحات والتقارير');
const dash = await as('authenticated', ADMIN, () => q1(`select admin_dashboard() d`));
ok(dash.d.students === 1 && dash.d.certificates === 1 && dash.d.monthly.length === 6, 'admin_dashboard ' + JSON.stringify(dash.d).slice(0, 160));
const edash = await as('authenticated', EXM1U, () => q1(`select examiner_dashboard() d`));
ok(edash.d.submitted === 1, 'examiner_dashboard ' + JSON.stringify(edash.d));
const rep = await as('authenticated', ADMIN, () => q1(`select report_summary(null, null, null, null) r`));
ok(rep.r.exams === 1 && Number(rep.r.average) === 93.9 && Number(rep.r.pass_rate) === 100 && rep.r.deductions.length === 2,
  'report_summary ' + JSON.stringify(rep.r).slice(0, 220));
await expectError('المحفّظ يطلب التقارير', () => as('authenticated', EXM1U, () => q1(`select report_summary(null, null, null, null)`)));
const audit = await as('authenticated', CLERK, () => qa(`select action from audit_log order by id`));
ok(audit.length >= 10, 'سجل العمليات: ' + audit.map(a => a.action).join(' · '));
await expectError('المحفّظ يقرأ سجل العمليات', async () => {
  const r = await as('authenticated', EXM1U, () => qa(`select * from audit_log`));
  if (r.length === 0) throw new Error('0 rows (RLS)');
});
const views = await as('authenticated', ADMIN, () => Promise.all(
  ['v_students', 'v_appointments', 'v_exams', 'v_certificates', 'v_examiners'].map(v => qa(`select * from ${v}`))));
ok(views.every(v => v.length >= 1), 'كل العروض تُرجع بيانات: ' + views.map(v => v.length).join(','));
const exmNotifs = await as('authenticated', EXM1U, () => qa(`select title from notifications`));
ok(exmNotifs.length === 3, 'إشعارات المحفّظ: ' + exmNotifs.map(n => n.title).join(' | '));

console.log('\n— إجراءات استثنائية');
await expectError('إداري يلغي نتيجة معتمدة', () => as('authenticated', CLERK, () => qa(`select return_exam($1, 'سبب')`, [ex.id])));
await as('authenticated', ADMIN, () => qa(`select return_exam($1, 'خطأ في الرصد')`, [ex.id]));
const rv = await as('anon', null, () => q1(`select verify_certificate($1) r`, [cert.no]));
ok(rv.r.status === 'revoked', 'إعادة فتح النتيجة تُلغي الشهادة');

await as('authenticated', ADMIN, () => db.query("update settings set org_phone = '021 111 1111' where id = 1"));
await as('authenticated', ADMIN, () => db.query("update deduction_types set value = 2 where name = 'التلعثم'"));
const cfgAudit = await q1("select count(*)::int c from audit_log where action = 'settings.update'");
ok(cfgAudit.c >= 3, 'تعديلات الإعدادات تُسجَّل في سجل العمليات: ' + cfgAudit.c);

console.log('\n— التحصين');
await db.exec(`select set_config('request.headers', '{"x-forwarded-for": "41.254.1.9, 10.0.0.1"}', false)`);
let limited = null;
for (let i = 1; i <= 61; i++) {
  try {
    await as('anon', null, () => q1(`select track_application('REG-0000-00000') r`));
  } catch (e) {
    limited = { i, message: e.message };
    break;
  }
}
ok(limited?.i === 61, 'تحديد المعدل: المحاولة 61 خلال 10 دقائق مرفوضة → ' + limited?.message);
const staffOk = await as('authenticated', CLERK, () => q1(`select track_application('REG-0000-00000') r`));
ok(staffOk.r === null, 'الموظفون مستثنون من تحديد المعدل');
await db.exec(`select set_config('request.headers', '', false)`);

await db.exec(`update profiles set must_change_password = true where id = '${EXM1U}'`);
await as('authenticated', EXM1U, () => q1(`select password_changed()`));
ok((await q1(`select must_change_password m from profiles where id = '${EXM1U}'`)).m === false, 'password_changed يلغي إلزام تغيير كلمة المرور');
await expectError('anon يستدعي password_changed', () => as('anon', null, () => q1(`select password_changed()`)));
await expectError('الإداري يرفع صلاحياته بنفسه', async () => {
  const r = await as('authenticated', CLERK, () => db.query(`update profiles set role = 'super_admin' where id = '${CLERK}'`));
  if (r.affectedRows === 0) throw new Error('0 rows (RLS)');
});
const trgm = await q1(`select count(*)::int c from pg_indexes where indexname like '%_trgm'`);
ok(trgm.c === 3, 'فهارس البحث النصي: ' + trgm.c);

console.log('\n— إلغاء المتون والاعتماد على المستويات');
const gone = await q1(`select to_regclass('public.matns') m, to_regclass('public.application_matns') am`);
ok(gone.m === null && gone.am === null, 'جدولا المتون وربطها محذوفان');
const cols = await qa(`select table_name, column_name from information_schema.columns
  where table_schema = 'public' and column_name like '%matn%'`);
ok(cols.length === 0, 'لا يوجد أي عمود باسم المتون في المخطط');
const levelCount = await q1(`select count(*)::int c from levels where active`);
ok(levelCount.c === 5, `المستويات الفعّالة خمسة: ${levelCount.c}`);

// طلب جديد بلا أي ذكر للمتون، ومع تجاهل أي حقل matn_ids قديم قد يرسله عميل غير محدَّث
const level5 = await q1(`select id, name from levels where active order by sort_order desc limit 1`);
const newApp = await as('anon', null, () => q1(`select submit_application($1::jsonb) r`, [JSON.stringify({
  ...payload, national_id: '120000009999', first_name: 'يوسف', family_name: 'المبروك',
  level_id: level5.id, matn_ids: [],
})]));
ok(/^REG-\d{4}-\d{5}$/.test(newApp.r.reg_no), `طلب جديد بلا متون → ${newApp.r.reg_no}`);
const newAppRow = await as('authenticated', CLERK, () => q1(
  `select level_name, status from v_applications where reg_no = $1`, [newApp.r.reg_no]));
ok(newAppRow.level_name === level5.name && newAppRow.status === 'pending', `الطلب مسجَّل في ${newAppRow.level_name}`);
const certLevel = await as('authenticated', CLERK, () => q1(`select level_name from certificates where cert_no = $1`, [cert.no]));
ok(certLevel.level_name === lookups.level_name, `الشهادة تحمل اسم المستوى: ${certLevel.level_name}`);
const verLevel = await as('anon', null, () => q1(`select verify_certificate($1) r`, [cert.no]));
ok(verLevel.r.level === lookups.level_name && verLevel.r.matns === undefined, 'التحقق من الشهادة يعرض المستوى لا المتون');

console.log('\n— إعدادات الهوية والقالب والمكاتب');
const setCols = await qa(`select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'settings'
    and column_name in ('logo_url', 'logo_scale', 'cert_bg_pdf_url', 'cert_layout_config')`);
ok(setCols.length === 4, 'أعمدة الشعار وقالب الشهادة مضافة');
await as('authenticated', ADMIN, () => db.query(
  `update settings set logo_url = 'https://x/logo.png', logo_scale = 1.4, cert_bg_pdf_url = 'https://x/cert.pdf',
     cert_layout_config = '{"page":{"w":842,"h":595},"fields":{"student_name":{"x":50,"y":46}}}'::jsonb where id = 1`));
const brand = await q1(`select logo_scale, cert_layout_config from settings where id = 1`);
ok(Number(brand.logo_scale) === 1.4 && brand.cert_layout_config.fields.student_name.x === 50, 'حفظ الشعار وإحداثيات القالب');
await expectError('حجم شعار خارج الحدود', () => db.query(`update settings set logo_scale = 9 where id = 1`));

const imp = await as('authenticated', ADMIN, () => q1(
  `select import_offices($1::text[], false) r`, [['مكتب أوقاف صبراتة', 'مكتب أوقاف الجديد']]));
ok(imp.r.added === 1 && imp.r.updated === 1, `استيراد المكاتب: أُضيف ${imp.r.added} وحُدّث ${imp.r.updated}`);
await expectError('الإداري يستورد المكاتب (لمدير النظام فقط)', () => as('authenticated', CLERK, () =>
  q1(`select import_offices($1::text[], false)`, [['مكتب تجريبي']])));
await expectError('anon يستورد المكاتب', () => as('anon', null, () =>
  q1(`select import_offices($1::text[], false)`, [['مكتب تجريبي']])));
const officeStillThere = await q1(`select count(*)::int c from offices where name = 'مكتب أوقاف تاورغاء'`);
ok(officeStillThere.c === 1, 'الاستيراد لا يحذف المكاتب الموجودة');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
