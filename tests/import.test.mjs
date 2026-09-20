// يختبر أداة الاستيراد: قراءة CSV بصيغ Excel المختلفة، ومطابقة الأسماء، وإنشاء الطلبات عبر submit_application.
// التشغيل: npm run test:import
import { bootDb } from './pglite.mjs';
import { buildPayload, mapHeader, normalize, parseCsv, parseDate } from '../scripts/import-lib.mjs';

const db = await bootDb({ quiet: true });
let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

console.log('— قراءة الملف والتواريخ');
ok(parseDate('12/03/2005') === '2005-03-12', 'تاريخ بصيغة يوم/شهر/سنة');
ok(parseDate('2005-3-12') === '2005-03-12', 'تاريخ بصيغة سنة-شهر-يوم');
ok(parseDate('٢٠٠٥/٠٣/١٢') === '2005-03-12', 'تاريخ بأرقام عربية');
ok(parseDate('31/02/2005') === null, 'رفض تاريخ غير موجود (31 فبراير)');
ok(normalize('مَكتَب أوقاف طرابلُس المركز') === normalize('مكتب اوقاف طرابلس المركز'), 'مطابقة الأسماء مع التشكيل');
ok(normalize('الإقامة') === normalize('الاقامه'), 'مطابقة الهمزات والتاء المربوطة');

// ملف بفاصلة منقوطة (إعداد Excel العربي) وخلايا بين علامات اقتباس وسطر داخل خلية
const csv = [
  'الاسم الأول;اسم الأب;اللقب;تاريخ الميلاد;الرقم الوطني;الجنس;محل الإقامة;الهاتف;القسم;الحلقة;المركز;المكتب;المستوى;مقدار الحفظ;ملاحظات',
  'محمد;أحمد;الشريف;12/03/2005;١١٩٨٧٠٠٠١٢٣٤;ذكر;طرابلس;091-234-5678;قسم الرجال;حلقة النور;مركز الفتح;مكتب أوقاف طرابلس المركز;المستوى الأول;المستوى كاملاً;"سطر أول',
  'سطر ثانٍ"',
  'فاطمة;علي;المبروك;2008-01-20;120080001111;أنثى;تاجوراء;0923334444;;حلقة الهدى;مركز التوحيد;مكتب أوقاف تاجوراء;المستوى الثاني;نصف المستوى;',
  'خالد;سالم;القمودي;01/01/2004;120040002222;ذكر;جنزور;0945556666;قسم الرجال;حلقة البيان;مركز الرسالة;مكتب غير موجود;مستوى غير موجود;الجزء الأول;',
  'مكرر;في;الملف;01/01/2004;119870001234;ذكر;طرابلس;0912345678;قسم الرجال;حلقة;مركز;مكتب أوقاف طرابلس المركز;المستوى الأول;كامل;',
  '',
].join('\r\n');

const { header, rows } = parseCsv('﻿' + csv);
ok(rows.length === 4, `قراءة 4 صفوف (الفاصلة المنقوطة، الاقتباس، سطر داخل خلية) → ${rows.length}`);
ok(rows[0][14] === 'سطر أول\r\nسطر ثانٍ', 'سطر جديد داخل خلية مقتبسة');
const { index, missing } = mapHeader(header);
ok(missing.length === 0, 'كل الأعمدة الإلزامية موجودة');
ok(mapHeader(['الاسم الأول', 'اللقب']).missing.includes('الرقم الوطني'), 'اكتشاف الأعمدة الناقصة');

console.log('\n— تحويل الصفوف');
const lookup = async (t) => (await db.query(`select id, name from ${t} where active`)).rows;
const lookups = { offices: await lookup('offices'), levels: await lookup('levels') };
const built = rows.map((cells) => buildPayload(cells, index, lookups));
ok(built[0].errors.length === 0 && built[0].payload.national_id === '119870001234' && !!built[0].payload.level_id,
  'الصف 1: أرقام عربية ومستوى مطابق بالاسم');
ok(built[1].errors.length === 0 && built[1].payload.gender === 'female' && built[1].payload.section === 'women',
  'الصف 2: القسم يُستنتج «حافظات السنة» من الجنس عند تركه فارغاً');
ok(built[2].errors.some((e) => e.includes('المكتب غير معروف')) && built[2].errors.some((e) => e.includes('المستوى غير معروف')),
  `الصف 3 مرفوض: ${built[2].errors.join(' · ')}`);

console.log('\n— الإنشاء عبر قاعدة البيانات بحساب إداري');
const ADMIN = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users (id) values ('${ADMIN}');
  insert into profiles (id, full_name, username, role) values ('${ADMIN}', 'مدير', 'admin', 'admin');
  update settings set registration_open = false where id = 1;`);
await db.exec(`select set_config('request.jwt.claim.sub', '${ADMIN}', false); set role authenticated;`);
const results = [];
for (const { payload, errors } of built) {
  if (errors.length) { results.push({ skipped: errors }); continue; }
  try {
    const { rows: r } = await db.query('select submit_application($1::jsonb) r', [JSON.stringify(payload)]);
    results.push({ reg: r[0].r.reg_no });
  } catch (e) {
    results.push({ error: e.message });
  }
}
await db.exec('reset role;');
ok(!!results[0].reg && !!results[1].reg, `أُنشئ طلبان رغم إغلاق التسجيل العام (الإداري مستثنى): ${results[0].reg}، ${results[1].reg}`);
ok(results[3].error?.includes('يوجد طلب قيد المعالجة'), `الصف 4 (رقم وطني مكرر) مرفوض من قاعدة البيانات: ${results[3].error}`);
const saved = (await db.query(`select s.full_name, a.section, a.student_notes, l.name level_name
  from applications a join students s on s.id = a.student_id join levels l on l.id = a.level_id order by a.created_at`)).rows;
ok(saved.length === 2 && saved[0].level_name === 'المستوى الأول' && saved[1].section === 'women',
  'البيانات المحفوظة صحيحة (المستوى والقسم)');
const audit = (await db.query(`select count(*)::int c from audit_log where action = 'application.create'`)).rows[0].c;
ok(audit === 2, 'كل طلب مستورد مسجَّل في سجل العمليات');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
