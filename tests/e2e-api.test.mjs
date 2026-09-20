// اختبار شامل على Supabase حقيقي (محلي أو سحابي تجريبي): Auth + PostgREST + RLS + Edge Function.
// المتطلبات: npx supabase start، وملف .env.local فيه VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY و SUPABASE_SERVICE_ROLE_KEY.
// التشغيل: npm run test:e2e
// تنبيه: ينشئ حسابات وبيانات اختبارية بأسماء فريدة؛ لا تشغّله على قاعدة الإنتاج.
import { createClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../supabase/functions/_shared/username.js';

const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOMAIN = process.env.VITE_USERNAME_EMAIL_DOMAIN || 'users.hussas.local';
if (!URL_ || !ANON || !SERVICE) {
  console.error('أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY و SUPABASE_SERVICE_ROLE_KEY إلى .env.local');
  process.exit(1);
}

const run = Date.now().toString(36);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);

let failures = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};
const must = ({ data, error }, label) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const blocked = async (label, promise) => {
  const { data, error } = await promise;
  const isBlocked = !!error || data === null || (Array.isArray(data) && data.length === 0);
  ok(isBlocked, `ممنوع: ${label}`, error?.message || 'لا بيانات');
};

async function signIn(username, password) {
  const client = createClient(URL_, ANON, opts);
  const { error } = await client.auth.signInWithPassword({ email: await usernameToEmail(username, DOMAIN), password });
  if (error) throw new Error(`دخول ${username}: ${error.message}`);
  return client;
}
async function invokeUsers(client, body) {
  const { data, error } = await client.functions.invoke('manage-users', { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* ignore */ }
    return { data: null, error: msg };
  }
  return { data, error: null };
}

console.log('— الإعداد');
const superName = `e2e_super_${run}`;
const superPass = `Super-${run}-Pass!`;
{
  const created = must(await service.auth.admin.createUser({ email: `${superName}@${DOMAIN}`, password: superPass, email_confirm: true }), 'createUser');
  must(await service.from('profiles').insert({ id: created.user.id, username: superName, full_name: 'مدير اختبار', role: 'super_admin' }), 'profile');
}
const superC = await signIn(superName, superPass);
ok(true, 'دخول مدير النظام');

const signUp = await anon.auth.signUp({ email: `hacker_${run}@${DOMAIN}`, password: 'Hacker-12345' });
ok(!!signUp.error, 'التسجيل الذاتي معطّل في Auth', signUp.error?.message);

const lookups = {
  office: must(await anon.from('offices').select('id').order('sort_order').limit(1).single(), 'office').id,
  level: must(await anon.from('levels').select('id').order('sort_order').limit(1).single(), 'level').id,
};

console.log('\n— إدارة الحسابات عبر Edge Function');
const clerk = await invokeUsers(superC, { action: 'create_user', role: 'admin', username: `e2e_clerk_${run}`, full_name: 'إداري اختبار', can_final_approve: true, can_issue_certificates: true });
ok(!clerk.error && clerk.data.password?.length >= 12, 'إنشاء إداري بكلمة مؤقتة', clerk.error || '');
const ex1 = await invokeUsers(superC, { action: 'create_user', role: 'examiner', username: `e2e_exm1_${run}`, full_name: 'محفّظ أول', password: 'Examiner-One-1', examiner: { office_id: lookups.office, employee_no: `E1-${run}` } });
const ex2 = await invokeUsers(superC, { action: 'create_user', role: 'examiner', username: `e2e_exm2_${run}`, full_name: 'محفّظ ثانٍ', password: 'Examiner-Two-2', examiner: { office_id: lookups.office, employee_no: `E2-${run}` } });
ok(!ex1.error && !ex2.error, 'إنشاء محفّظَين', ex1.error || ex2.error || '');
const dup = await invokeUsers(superC, { action: 'create_user', role: 'examiner', username: `e2e_exm1_${run}`, full_name: 'مكرر', password: 'Examiner-One-1' });
ok(!!dup.error, 'رفض اسم مستخدم مكرر', dup.error);

const clerkC = await signIn(`e2e_clerk_${run}`, clerk.data.password);
const exm1C = await signIn(`e2e_exm1_${run}`, 'Examiner-One-1');
const exm2C = await signIn(`e2e_exm2_${run}`, 'Examiner-Two-2');
ok(true, 'دخول الإداري والمحفّظَين');

const exmAttempt = await invokeUsers(exm1C, { action: 'create_user', role: 'super_admin', username: `evil_${run}`, full_name: 'x' });
ok(!!exmAttempt.error, 'المحفّظ لا يستطيع إنشاء حسابات', exmAttempt.error);
const clerkAttempt = await invokeUsers(clerkC, { action: 'create_user', role: 'super_admin', username: `evil2_${run}`, full_name: 'x' });
ok(!!clerkAttempt.error, 'الإداري لا يستطيع إنشاء مدير نظام', clerkAttempt.error);

const exm1Row = must(await exm1C.from('v_examiners').select('id, office_name, username').single(), 'v_examiners');
ok(exm1Row.username === `e2e_exm1_${run}`, 'المحفّظ يقرأ ملفه فقط', exm1Row.office_name);

console.log('\n— الموقع العام');
const nid = String(Math.floor(1e11 + Math.random() * 8.9e11));
const payload = {
  first_name: 'عمر', father_name: 'سالم', grandfather_name: 'علي', family_name: 'الاختبار', birth_date: '2006-05-10',
  gender: 'male', national_id: nid, residence: 'طرابلس', phone: '0912345678', whatsapp: '+218912345678', email: '',
  section: 'men', circle_name: 'حلقة الاختبار', center_name: 'مركز الاختبار', office_id: lookups.office,
  level_id: lookups.level, memorized_amount: 'المستوى كاملاً',
};
const receipt = must(await anon.rpc('submit_application', { p: payload }), 'submit_application');
ok(/^REG-\d{4}-\d{5}$/.test(receipt.reg_no), 'تسجيل طالب من الموقع العام', `${receipt.reg_no} / ${receipt.student_no}`);
const again = await anon.rpc('submit_application', { p: payload });
ok(!!again.error, 'منع التسجيل المكرر في نفس الدورة', again.error?.message);
await blocked('الزائر يقرأ جدول الطلبة', anon.from('students').select('*'));
await blocked('الزائر يقرأ عرض الطلبات', anon.from('v_applications').select('*'));
const tracked = must(await anon.rpc('track_application', { p_query: receipt.reg_no }), 'track');
ok(tracked.status === 'pending', 'متابعة الطلب', tracked.student_name);

console.log('\n— الإدارة');
const app = must(await clerkC.from('v_applications').select('*').eq('reg_no', receipt.reg_no).single(), 'v_applications');
ok(!!app.level_name, 'الإداري يرى الطلب بمستواه: ' + app.level_name);
const exm1Id = must(await clerkC.from('examiners').select('id').eq('employee_no', `E1-${run}`).single(), 'examiner id').id;
await blocked('المحفّظ يقبل الطلب', exm1C.rpc('approve_application', { p_application_id: app.id }));
must(await clerkC.rpc('approve_application', { p_application_id: app.id }), 'approve');
must(await clerkC.rpc('assign_application', { p_application_id: app.id, p_examiner_id: exm1Id, p_note: 'اختبار' }), 'assign');
const direct = await clerkC.from('applications').update({ status: 'published' }).eq('id', app.id);
ok(!!direct.error, 'تعديل الحالة مباشرة مرفوض', direct.error?.message);

console.log('\n— المحفّظ');
const seen1 = must(await exm1C.from('v_applications').select('id').eq('id', app.id), 'exm1 list');
const seen2 = must(await exm2C.from('v_applications').select('id'), 'exm2 list');
ok(seen1.length === 1 && seen2.length === 0, 'عزل المحفّظين', `الأول ${seen1.length} · الثاني ${seen2.length}`);
const notif = must(await exm1C.from('notifications').select('title'), 'notifications');
ok(notif.some((n) => n.title.includes('عمر')), 'وصول إشعار الإحالة للمحفّظ');
const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
const aptId = must(await exm1C.rpc('save_appointment', { p_application_id: app.id, p_date: tomorrow, p_time: '10:00', p_mode: 'whatsapp_room', p_location: null, p_notes: null, p_appointment_id: null }), 'appointment');
must(await exm1C.rpc('mark_appointment_notified', { p_appointment_id: aptId }), 'notified');
const examId = must(await exm1C.rpc('start_exam', { p_application_id: app.id }), 'start_exam');
const exam = must(await exm1C.from('exams').select('config').eq('id', examId).single(), 'exam');
const voice = exam.config.criteria[0].id;
const tanbih = exam.config.deductions.find((d) => d.name === 'التنبيه')?.id;
must(await exm1C.from('exam_questions').update({ criteria_scores: { [voice]: 8 }, deductions: { [tanbih]: 1 }, touched: true }).eq('exam_id', examId).eq('q_index', 0), 'q0');
must(await exm1C.from('exam_questions').update({ criteria_scores: { [voice]: 9 }, deductions: {}, touched: true }).eq('exam_id', examId).eq('q_index', 1), 'q1');
must(await exm1C.from('exam_questions').update({ criteria_scores: { [voice]: 10 }, deductions: {}, touched: true }).eq('exam_id', examId).eq('q_index', 2), 'q2');
const hack = await exm1C.from('exam_questions').update({ score: 100 }).eq('exam_id', examId);
ok(!!hack.error, 'المحفّظ لا يكتب الدرجة مباشرة', hack.error?.message);
const other = await exm2C.from('exam_questions').update({ deductions: {} }).eq('exam_id', examId).select();
ok(!other.error && other.data.length === 0, 'المحفّظ الآخر لا يعدّل الأسئلة');
const score = must(await exm1C.rpc('submit_exam', { p_exam_id: examId }), 'submit_exam');
ok(Number(score) === 96.33, 'احتساب الدرجة على الخادم بمقياس الدليل (18.2، 19.6، 20 من 20 ← 96.33%)', String(score));
const pending = must(await anon.rpc('lookup_result', { p_query: nid }), 'lookup pending');
ok(pending.state === 'pending', 'النتيجة مخفية قبل الاعتماد');

console.log('\n— الاعتماد والشهادة');
must(await clerkC.rpc('approve_exam', { p_exam_id: examId, p_notes: 'اختبار' }), 'approve_exam');
const certNo = must(await clerkC.rpc('issue_certificate', { p_exam_id: examId }), 'issue_certificate');
ok(/^CERT-/.test(certNo), 'إصدار الشهادة', certNo);
const result = must(await anon.rpc('lookup_result', { p_query: receipt.student_no }), 'lookup');
ok(result.state === 'published' && Number(result.score) === 96.33 && result.certificate?.cert_no === certNo, 'الاستعلام عن النتيجة المعتمدة');
const verified = must(await anon.rpc('verify_certificate', { p_cert_no: certNo }), 'verify');
ok(verified.status === 'valid', 'التحقق من الشهادة');
const report = must(await clerkC.rpc('report_summary', { p_office_id: null, p_from: null, p_to: null }), 'report');
ok(report.exams >= 1, 'التقارير', `امتحانات معتمدة: ${report.exams}`);
const audit = must(await clerkC.from('audit_log').select('action, ip').in('entity_id', [receipt.reg_no, certNo]), 'audit');
ok(audit.length >= 3, 'سجل العمليات', audit.map((a) => a.action).join(' · '));
await blocked('المحفّظ يقرأ سجل العمليات', exm1C.from('audit_log').select('*'));

console.log('\n— كلمات المرور وإيقاف الحسابات');
const exm2Profile = must(await superC.from('profiles').select('id').eq('username', `e2e_exm2_${run}`).single(), 'profile id');
const reset = await invokeUsers(clerkC, { action: 'reset_password', user_id: exm2Profile.id });
ok(!reset.error && reset.data.password, 'الإداري يعيد تعيين كلمة مرور محفّظ', reset.error || '');
const oldLogin = await createClient(URL_, ANON, opts).auth.signInWithPassword({ email: await usernameToEmail(`e2e_exm2_${run}`, DOMAIN), password: 'Examiner-Two-2' });
ok(!!oldLogin.error, 'كلمة المرور القديمة لم تعد تعمل');
await signIn(`e2e_exm2_${run}`, reset.data.password);
ok(true, 'الدخول بكلمة المرور المؤقتة');
const deact = await invokeUsers(superC, { action: 'set_status', user_id: exm2Profile.id, status: 'inactive' });
ok(!deact.error, 'إيقاف الحساب', deact.error || '');
const bannedLogin = await createClient(URL_, ANON, opts).auth.signInWithPassword({ email: await usernameToEmail(`e2e_exm2_${run}`, DOMAIN), password: reset.data.password });
ok(!!bannedLogin.error, 'الحساب الموقوف لا يدخل', bannedLogin.error?.message);
const clerkReset = await invokeUsers(clerkC, { action: 'reset_password', user_id: (await superC.from('profiles').select('id').eq('username', superName).single()).data.id });
ok(!!clerkReset.error, 'الإداري لا يعيد تعيين كلمة مرور مدير النظام', clerkReset.error);

console.log('\n— اسم مستخدم عربي بلا إجبار تغيير كلمة المرور');
const arabicName = `عبدالرحيم أحمد شيتة ${run}`;
const arabicPass = 'Hussas-2026-Pass';
const created = await invokeUsers(superC, {
  action: 'create_user', role: 'examiner', username: arabicName, full_name: 'عبدالرحيم أحمد شيتة',
  password: arabicPass, examiner: { office_id: lookups.office, employee_no: `E3-${run}` },
});
ok(!created.error, 'إنشاء حساب باسم مستخدم عربي', created.error || '');
const arabicClient = await signIn(arabicName, arabicPass);
ok(true, 'الدخول بالاسم العربي وكلمة المرور التي وضعها الإداري');
const arabicProfile = must(await arabicClient.from('profiles').select('username, must_change_password').eq('username', arabicName).single(), 'arabic profile');
ok(arabicProfile.must_change_password === false, 'لا إجبار على تغيير كلمة المرور عند أول دخول');
// كتابة الاسم بهمزات وتاء مربوطة مختلفة تؤدي إلى البريد نفسه
const loose = arabicName.replace('أحمد', 'احمد').replace('شيتة', 'شيته');
await signIn(loose, arabicPass);
ok(true, `الدخول يتساهل مع اختلاف الهمزات والتاء المربوطة: ${loose}`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
