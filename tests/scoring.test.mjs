// يتحقق أن احتساب الدرجة في الواجهة (src/lib/scoring.js) يطابق دالة الخادم compute_question_score
// على مئات الحالات العشوائية، بما فيها القيم الحدّية والخاطئة.
// التشغيل: npm run test:scoring
import { bootDb } from './pglite.mjs';
import { criterionValue, examScore, questionDeductionsTotal, questionScore } from '../src/lib/scoring.js';

const db = await bootDb({ quiet: true });
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures++;
  if (!cond || process.env.VERBOSE) console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
};

// مولّد أرقام عشوائية ثابت البذرة لتكرار النتائج
let seed = 20260916;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const quarter = (max) => Math.round(rand() * max * 4) / 4;

function randomCase(i) {
  const criteria = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, k) => {
    const max = pick([5, 10, 10, 20]);
    return { id: `c${k}`, name: `معيار ${k}`, max_score: max, default_score: quarter(max), penalty_factor: pick([0, 0.5, 1, 2, 2.5]) };
  });
  const deductions = Array.from({ length: 1 + Math.floor(rand() * 9) }, (_, k) => ({ id: `d${k}`, name: `خصم ${k}`, value: pick([0, 1.5, 3, 6, 12, 0.25]) }));
  const config = { base: pick([100, 100, 100, 50, 20]), aggregate: pick(['avg', 'min']), criteria, deductions };
  const question = {
    criteria_scores: Object.fromEntries(criteria.filter(() => rand() > 0.2).map((c) => [c.id, pick([
      quarter(c.max_score), c.max_score, 0, -3, c.max_score + 4, // داخل النطاق وخارجه
    ])])),
    deductions: Object.fromEntries(deductions.filter(() => rand() > 0.4).map((d) => [d.id, pick([1, 2, 3, 7, 0, 25])])),
  };
  if (i % 50 === 0) question.deductions = {}; // بلا خصميات
  return { config, question };
}

console.log('— مطابقة درجة السؤال بين الواجهة والخادم');
const N = 600;
let mismatches = 0;
for (let i = 0; i < N; i++) {
  const { config, question } = randomCase(i);
  const js = questionScore(config, question);
  const { rows } = await db.query('select public.compute_question_score($1::jsonb, $2::jsonb, $3::jsonb)::float8 s',
    [JSON.stringify(config), JSON.stringify(question.criteria_scores), JSON.stringify(question.deductions)]);
  const sql = rows[0].s;
  if (Math.abs(js - sql) > 1e-9) {
    mismatches++;
    if (mismatches <= 5) console.log('  ✗ اختلاف', { js, sql, config: JSON.stringify(config), question: JSON.stringify(question) });
  }
}
ok(mismatches === 0, `${N} حالة عشوائية متطابقة`);
console.log(`  ${mismatches === 0 ? '✓' : '✗'} ${N - mismatches} من ${N} حالة متطابقة`);

console.log('\n— حالات معروفة من قواعد البرنامج');
const cfg = {
  base: 100,
  aggregate: 'avg',
  criteria: [{ id: 'voice', max_score: 10, default_score: 5, penalty_factor: 2 }],
  deductions: [
    { id: 'tanbih', value: 6 }, { id: 'lahn_khafi', value: 1.5 }, { id: 'fath', value: 12 }, { id: 'lahn', value: 6 },
  ],
};
const cases = [
  [{ criteria_scores: {}, deductions: {} }, 90, 'الصوت الافتراضي 5 بلا خصميات = 90 (مثال النموذج)'],
  [{ criteria_scores: { voice: 7 }, deductions: { tanbih: 1, lahn_khafi: 2 } }, 85, 'صوت 7 + تنبيه + لحن خفي ×2 = 85'],
  [{ criteria_scores: { voice: 10 }, deductions: {} }, 100, 'الدرجة الكاملة = 100'],
  [{ criteria_scores: { voice: 0 }, deductions: { fath: 5, lahn: 5 } }, 0, 'لا تنزل تحت الصفر'],
  [{ criteria_scores: { voice: 15 }, deductions: {} }, 100, 'صوت أعلى من الحد يُقصّ إلى 10'],
  [{ criteria_scores: { voice: 5 }, deductions: { tanbih: -3 } }, 90, 'عدد خصم سالب يُهمل'],
  [{ criteria_scores: { voice: 5 }, deductions: { tanbih: 1.9 } }, 84, 'عدد خصم كسري يُقرّب للأسفل'],
];
for (const [q, expected, label] of cases) {
  const js = questionScore(cfg, q);
  const { rows } = await db.query('select public.compute_question_score($1::jsonb, $2::jsonb, $3::jsonb)::float8 s',
    [JSON.stringify(cfg), JSON.stringify(q.criteria_scores), JSON.stringify(q.deductions)]);
  ok(js === expected && rows[0].s === expected, `${label} (الواجهة ${js} · الخادم ${rows[0].s})`);
  console.log(`  ${js === expected && rows[0].s === expected ? '✓' : '✗'} ${label}`);
}

console.log('\n— الدليل الاسترشادي للتحكيم: كسور الدرجات 0.25 · 0.50 · 1.00');
// أساس السؤال 20 · «الصوت والأداء» من 10 بمعامل 0.4 · قيم الخصم كما في الدليل
const guide = {
  base: 20,
  aggregate: 'avg',
  criteria: [{ id: 'voice', name: 'الصوت والأداء', max_score: 10, default_score: 5, penalty_factor: 0.4 }],
  deductions: [
    { id: 'talaathum', name: 'التلعثم', value: 0.25 },
    { id: 'lahn_khafi', name: 'اللحن الخفي', value: 0.25 },
    { id: 'taraddud', name: 'التردد', value: 0.5 },
    { id: 'naqs', name: 'النقص أو الزيادة', value: 0.5 },
    { id: 'tanbih', name: 'التنبيه', value: 1 },
    { id: 'fath', name: 'الفتح', value: 1 },
  ],
};
const guideCases = [
  [{ criteria_scores: {}, deductions: {} }, 18, 'الصوت الافتراضي 5 بلا خصميات = 18 من 20'],
  [{ criteria_scores: { voice: 10 }, deductions: {} }, 20, 'الدرجة الكاملة = 20'],
  [{ criteria_scores: { voice: 10 }, deductions: { talaathum: 1 } }, 19.75, 'تلعثم واحد = ربع درجة'],
  [{ criteria_scores: { voice: 10 }, deductions: { taraddud: 1 } }, 19.5, 'تردد واحد = نصف درجة'],
  [{ criteria_scores: { voice: 10 }, deductions: { tanbih: 1, fath: 1 } }, 18, 'خطأ مع التنبيه والفتح = درجتان'],
  [{ criteria_scores: { voice: 10 }, deductions: { talaathum: 3, lahn_khafi: 5, naqs: 2 } }, 17, 'تراكم الكسور: 0.75 + 1.25 + 1 = 3'],
  [{ criteria_scores: { voice: 8.75 }, deductions: { lahn_khafi: 1 } }, 19.25, 'كسر مئوي في الصوت (8.75) لتفادي التعادل'],
  [{ criteria_scores: { voice: 7.33 }, deductions: {} }, 18.93, 'كسر مئوي يُقرَّب لمنزلتين (20 − 1.068 = 18.932)'],
];
for (const [q, expected, label] of guideCases) {
  const js = questionScore(guide, q);
  const { rows } = await db.query('select public.compute_question_score($1::jsonb, $2::jsonb, $3::jsonb)::float8 s',
    [JSON.stringify(guide), JSON.stringify(q.criteria_scores), JSON.stringify(q.deductions)]);
  const pass = js === expected && rows[0].s === expected;
  ok(pass, `${label} (الواجهة ${js} · الخادم ${rows[0].s})`);
  console.log(`  ${pass ? '✓' : '✗'} ${label}`);
}
{
  const qs = [
    { criteria_scores: { voice: 8 }, deductions: { tanbih: 1 } },   // 18.2
    { criteria_scores: { voice: 9 }, deductions: {} },              // 19.6
    { criteria_scores: { voice: 7 }, deductions: { lahn_khafi: 1 } }, // 18.55
  ];
  const js = examScore(guide, qs);
  const pass = js === 93.92;
  ok(pass, `النتيجة النهائية بمقياس الدليل = ${js}% (متوسط 18.783… من 20)`);
  console.log(`  ${pass ? '✓' : '✗'} النتيجة النهائية بمقياس الدليل = ${js}%`);
}

console.log('\n— النتيجة النهائية');
const qs = [
  { criteria_scores: { voice: 8 }, deductions: { tanbih: 1 } }, // 90
  { criteria_scores: { voice: 9 }, deductions: {} }, // 98
  { criteria_scores: { voice: 7 }, deductions: { lahn_khafi: 1 } }, // 92.5
];
const checks = [
  [examScore(cfg, qs), 93.5, 'متوسط (90، 98، 92.5) = 93.5 — يطابق نتيجة اختبار قاعدة البيانات'],
  [examScore({ ...cfg, aggregate: 'min' }, qs), 90, 'طريقة «أقل درجة» = 90'],
  [examScore({ ...cfg, base: 50, criteria: [{ ...cfg.criteria[0], penalty_factor: 1 }] }, [{ criteria_scores: { voice: 10 }, deductions: {} }]), 100, 'أساس 50 يُحوَّل إلى 100'],
  [examScore(cfg, []), null, 'امتحان بلا أسئلة = لا نتيجة'],
  [criterionValue(cfg, { criteria_scores: { voice: '' } }, cfg.criteria[0]), 5, 'حقل فارغ يأخذ القيمة الافتراضية'],
  [questionDeductionsTotal(cfg, { deductions: { tanbih: 2, fath: 1 } }), 24, 'مجموع الخصميات'],
];
for (const [actual, expected, label] of checks) {
  ok(actual === expected, `${label} (${actual})`);
  console.log(`  ${actual === expected ? '✓' : '✗'} ${label}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
