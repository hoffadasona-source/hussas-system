// تطابق public.compute_question_score / compute_exam_score في قاعدة البيانات.
// الواجهة تعرض الحساب لحظياً، والخادم يعيد احتسابه عند الحفظ والإرسال.

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round2 = (v) => Math.round(v * 100) / 100;

export function criterionValue(config, question, criterion) {
  const raw = question.criteria_scores?.[criterion.id];
  const v = raw === undefined || raw === null || raw === '' ? Number(criterion.default_score ?? 0) : Number(raw);
  return clamp(Number.isFinite(v) ? v : 0, 0, Number(criterion.max_score));
}

export function questionDeductionsTotal(config, question) {
  return (config.deductions || []).reduce((sum, d) => {
    const count = Math.max(0, Math.floor(Number(question.deductions?.[d.id] || 0)));
    return sum + count * Number(d.value);
  }, 0);
}

export function questionScore(config, question) {
  const base = Number(config.base ?? 100);
  let total = base;
  for (const c of config.criteria || []) {
    const given = criterionValue(config, question, c);
    total -= (Number(c.max_score) - given) * Number(c.penalty_factor ?? 1);
  }
  total -= questionDeductionsTotal(config, question);
  return round2(clamp(total, 0, base));
}

/** النتيجة النهائية من 100 */
export function examScore(config, questions) {
  if (!questions?.length) return null;
  const base = Number(config.base ?? 100);
  const scores = questions.map((q) => questionScore(config, q));
  const agg = config.aggregate === 'min' ? Math.min(...scores) : scores.reduce((a, b) => a + b, 0) / scores.length;
  return round2(clamp((agg / base) * 100, 0, 100));
}
