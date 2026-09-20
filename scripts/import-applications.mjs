// استيراد طلبات قائمة من ملف CSV (يُحفظ من Excel بصيغة «CSV UTF-8»).
//
// الاستخدام:
//   npm run import -- <ملف.csv> --user <اسم مستخدم إداري> --password <كلمة المرور> [--dry-run]
//
// - يدخل بحساب إداري حقيقي، فتمر كل الطلبات عبر نفس التحقق وسجل العمليات كالتسجيل اليدوي.
// - --dry-run: يتحقق من الملف ويطابق المكاتب والمستويات دون إنشاء أي طلب.
// - يكتب تقريراً بجانب الملف: <الملف>.result.csv فيه نتيجة كل صف ورقم الطلب أو سبب الرفض.
// - قالب الأعمدة: scripts/import-template.csv
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildPayload, mapHeader, parseCsv, toCsv } from './import-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_FLAGS = ['--user', '--password'];
const file = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
const dryRun = args.includes('--dry-run');
const username = flag('user');
const password = flag('password');

if (!file || !username || !password) {
  console.error('الاستخدام: npm run import -- data.csv --user admin --password "..." [--dry-run]');
  process.exit(1);
}
const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const domain = process.env.VITE_USERNAME_EMAIL_DOMAIN || 'users.hussas.local';
if (!url || !anonKey) {
  console.error('أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY إلى .env.local');
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
const { error: loginError } = await supabase.auth.signInWithPassword({
  email: username.includes('@') ? username : `${username.toLowerCase()}@${domain}`,
  password,
});
if (loginError) {
  console.error('تعذّر الدخول:', loginError.message);
  process.exit(1);
}
const { data: isAdmin } = await supabase.rpc('is_admin');
if (!isAdmin) {
  console.error('الحساب ليس حساباً إدارياً فعّالاً.');
  process.exit(1);
}

const [offices, levels] = await Promise.all(
  ['offices', 'levels'].map((t) => supabase.from(t).select('*')),
);
const lookups = { offices: offices.data.filter((x) => x.active), levels: levels.data.filter((x) => x.active) };

const { header, rows } = parseCsv(fs.readFileSync(file, 'utf8'));
const { index, missing } = mapHeader(header);
if (missing.length) {
  console.error(`أعمدة إلزامية ناقصة في الملف: ${missing.join('، ')}`);
  console.error('راجع القالب: scripts/import-template.csv');
  process.exit(1);
}

console.log(`${dryRun ? 'فحص' : 'استيراد'} ${rows.length} صف من ${file}…`);
const report = [['الصف', 'الاسم', 'الرقم الوطني', 'النتيجة', 'رقم الطلب', 'رقم الطالب', 'الملاحظة']];
const seen = new Set();
let okCount = 0;
for (const [i, cells] of rows.entries()) {
  const line = i + 2; // الصف 1 للعناوين
  const { payload, errors } = buildPayload(cells, index, lookups);
  const name = [payload.first_name, payload.father_name, payload.family_name].filter(Boolean).join(' ');
  if (payload.national_id && seen.has(payload.national_id)) errors.push('الرقم الوطني مكرر داخل الملف');
  seen.add(payload.national_id);

  if (errors.length) {
    report.push([line, name, payload.national_id, 'مرفوض', '', '', errors.join(' · ')]);
    console.log(`  ✗ ${line}: ${name} — ${errors.join(' · ')}`);
    continue;
  }
  if (dryRun) {
    okCount++;
    report.push([line, name, payload.national_id, 'صالح', '', '', '']);
    continue;
  }
  const { data, error } = await supabase.rpc('submit_application', { p: payload });
  if (error) {
    report.push([line, name, payload.national_id, 'مرفوض', '', '', error.message]);
    console.log(`  ✗ ${line}: ${name} — ${error.message}`);
  } else {
    okCount++;
    report.push([line, name, payload.national_id, 'أُضيف', data.reg_no, data.student_no, '']);
    console.log(`  ✓ ${line}: ${name} → ${data.reg_no}`);
  }
}

const out = file.replace(/\.csv$/i, '') + '.result.csv';
fs.writeFileSync(out, toCsv(report));
console.log(`\n${dryRun ? 'صالح' : 'أُضيف'}: ${okCount} · مرفوض: ${rows.length - okCount}`);
console.log(`التقرير: ${out}`);
await supabase.auth.signOut();
process.exit(okCount === rows.length ? 0 : 2);
