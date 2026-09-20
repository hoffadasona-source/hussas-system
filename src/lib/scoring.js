// تطابق public.compute_question_score / compute_exam_score في قاعدة البيانات.
// الواجهة تعرض الحساب لحظياً، والخادم يعيد احتسابه عند الحفظ والإرسال.
//
// الحساب كله بأعداد صحيحة (بالمئات وبالعشرات آلاف) حتى تُطابق النتيجةُ حسابَ
// numeric في Postgres تماماً، بلا أخطاء الفاصلة العائمة في الكسور (0.25 · 0.50 · 8.75).

/** تحويل قيمة عشرية إلى وحدات صحيحة بدقة dp، بتقريب النصف بعيداً عن الصفر (مثل round في Postgres) */
export function units(value, dp = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const s = String(abs);
  if (s.includes('e') || s.includes('E')) return sign * Math.round(abs * 10 ** dp);
  const [int, frac = ''] = s.split('.');
  const padded = (frac + '0'.repeat(dp + 1)).slice(0, dp + 1);
  const whole = Number(int) * 10 ** dp + Number(padded.slice(0, dp) || 0);
  return sign * (Number(padded[dp]) >= 5 ? whole + 1 : whole);
}

const clampInt = (v, min, max) => Math.max(min, Math.min(max, v));

/** الدرجة الممنوحة لمعيار في سؤال (بالمئات) بعد التقريب والحصر بين 0 والدرجة القصوى */
function criterionUnits(question, criterion) {
  const raw = question.criteria_scores?.[criterion.id];
  const value = raw === undefined || raw === null || raw === '' ? criterion.default_score ?? 0 : raw;
  return clampInt(units(value), 0, units(criterion.max_score));
}

/** الدرجة الممنوحة لمعيار، كرقم عشري للعرض */
export function criterionValue(config, question, criterion) {
  return criterionUnits(question, criterion) / 100;
}

/** مجموع خصميات السؤال (رقم عشري) */
export function questionDeductionsTotal(config, question) {
  let total = 0; // بالمئات
  for (const d of config.deductions || []) {
    const count = Math.max(0, Math.floor(Number(question.deductions?.[d.id] || 0)));
    total += count * units(d.value);
  }
  return total / 100;
}

/** درجة السؤال بالمئات (عدد صحيح) */
function questionUnits(config, question) {
  const base = units(config.base ?? 100); // بالمئات
  let total = base * 100; // بعشرات الآلاف
  for (const c of config.criteria || []) {
    const max = units(c.max_score);
    const given = criterionUnits(question, c);
    total -= (max - given) * units(c.penalty_factor ?? 1);
  }
  for (const d of config.deductions || []) {
    const count = Math.max(0, Math.floor(Number(question.deductions?.[d.id] || 0)));
    total -= count * units(d.value) * 100;
  }
  return Math.round(clampInt(total, 0, base * 100) / 100);
}

/** درجة السؤال (رقم عشري بمنزلتين) */
export function questionScore(config, question) {
  return questionUnits(config, question) / 100;
}

/** النتيجة النهائية من 100 */
export function examScore(config, questions) {
  if (!questions?.length) return null;
  const base = units(config.base ?? 100); // بالمئات
  if (base <= 0) return null;
  const scores = questions.map((q) => questionUnits(config, q));
  const min = config.aggregate === 'min';
  const num = (min ? Math.min(...scores) : scores.reduce((a, b) => a + b, 0)) * 10000;
  const den = (min ? 1 : scores.length) * base;
  return clampInt(Math.floor(num / den + 0.5), 0, 10000) / 100;
}
