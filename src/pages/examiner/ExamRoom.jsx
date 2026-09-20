import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useExamDetails } from '../../components/ExamReview';
import { Loading } from '../../components/ui';
import { useUi } from '../../context/UiContext';
import { rpc, supabase } from '../../lib/supabase';
import { EXAM_STATUS, ordinal } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtScore } from '../../lib/format';
import { criterionValue, examScore, questionDeductionsTotal, questionScore } from '../../lib/scoring';

const EDITABLE = ['draft', 'in_progress', 'rejected'];
const SAVE_DELAY = 700;
const pick = (q) => ({ criteria_scores: q.criteria_scores, deductions: q.deductions, touched: q.touched });

export default function ExamRoom() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useUi();
  const { data, isLoading, error } = useExamDetails(examId);

  const [questions, setQuestions] = useState(null);
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [submitting, setSubmitting] = useState(false);
  const undo = useRef({});
  const dirty = useRef(new Set());
  const timer = useRef(null);
  const latest = useRef(null);
  latest.current = questions;

  const exam = data?.exam;
  const cfg = exam?.config;
  const editable = exam && EDITABLE.includes(exam.status);

  useEffect(() => {
    if (data && questions === null) {
      setQuestions(data.questions.map((q) => ({ ...q, criteria_scores: q.criteria_scores || {}, deductions: q.deductions || {} })));
      const firstOpen = data.questions.findIndex((q) => !q.touched);
      setCurrent(firstOpen === -1 ? 0 : firstOpen);
    }
  }, [data, questions]);

  // ---------- الحفظ التلقائي ----------
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const indices = [...dirty.current];
    if (!indices.length) return true;
    dirty.current.clear();
    setSaveState('saving');
    const results = await Promise.all(indices.map((i) => {
      const q = latest.current[i];
      return supabase.from('exam_questions').update(pick(q)).eq('exam_id', examId).eq('q_index', q.q_index);
    }));
    const failed = results.find((r) => r.error);
    if (failed) {
      indices.forEach((i) => dirty.current.add(i));
      setSaveState('error');
      return false;
    }
    setSaveState('saved');
    return true;
  }, [examId]);

  const scheduleSave = (index) => {
    dirty.current.add(index);
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  useEffect(() => {
    const warn = (e) => {
      if (dirty.current.size) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (dirty.current.size) flush();
    };
  }, [flush]);

  if (isLoading || (data && !questions)) return <Loading label="جارٍ تجهيز قاعة الامتحان…" />;
  if (error || !data) {
    return (
      <div className="exs"><div className="exs-body"><div className="qcard">
        <h3>تعذّر فتح الامتحان</h3><p className="sub">{error ? errorMessage(error) : "الامتحان غير موجود."}</p>
        <Link className="exs-btn" to="/examiner/exams">العودة إلى الامتحانات</Link>
      </div></div></div>
    );
  }

  const q = questions[current];
  const total = examScore(cfg, questions);
  const isLast = current === questions.length - 1;

  // التعديل يُحسب خارج دالة setState حتى لا يتكرر حفظ خطوة التراجع
  const pushUndo = (before) => {
    const stack = (undo.current[current] ||= []);
    stack.push(before);
    if (stack.length > 100) stack.shift();
  };
  const replaceCurrent = (after) => {
    const nextQuestions = questions.map((x, i) => (i === current ? after : x));
    latest.current = nextQuestions;
    setQuestions(nextQuestions);
    scheduleSave(current);
  };
  const update = (mutator) => {
    if (!editable) return;
    const before = questions[current];
    pushUndo(before);
    replaceCurrent({ ...mutator(before), touched: true });
  };

  const setCriterion = (c, value) => {
    const n = Number(value);
    const v = Number.isFinite(n) ? Math.max(0, Math.min(Number(c.max_score), n)) : 0;
    update((prev) => ({ ...prev, criteria_scores: { ...prev.criteria_scores, [c.id]: v } }));
  };
  const addDeduction = (d, delta) => update((prev) => {
    const count = Math.max(0, (prev.deductions[d.id] || 0) + delta);
    const deductions = { ...prev.deductions };
    if (count) deductions[d.id] = count;
    else delete deductions[d.id];
    return { ...prev, deductions };
  });

  const doUndo = () => {
    const stack = undo.current[current];
    if (!stack?.length) {
      toast('لا يوجد ما يمكن التراجع عنه', 'info');
      return;
    }
    replaceCurrent(stack.pop());
  };

  const resetQuestion = async () => {
    const ok = await confirm({ title: 'إلغاء السؤال', text: 'ستُعاد درجات المعايير إلى قيمها الافتراضية وتُحذف كل الخصميات المسجّلة في هذا السؤال.', okLabel: 'إلغاء السؤال', danger: true });
    if (!ok) return;
    const defaults = Object.fromEntries(cfg.criteria.map((c) => [c.id, Number(c.default_score)]));
    pushUndo(questions[current]);
    replaceCurrent({ ...questions[current], criteria_scores: defaults, deductions: {}, touched: false });
    toast('أُلغي السؤال', 'info');
  };

  const leave = async () => {
    await flush();
    navigate('/examiner/exams');
  };

  const finish = async () => {
    const untouched = questions.filter((x) => !x.touched).map((x) => ordinal(x.q_index));
    const ok = await confirm({
      title: 'اعتماد نتيجة الجلسة',
      text: `${untouched.length ? `تنبيه: لم تُسجَّل أي درجة في ${untouched.join('، ')}، وستُحتسب بالقيم الافتراضية. ` : ''}النتيجة النهائية ${fmtScore(total)} من 100. بعد الاعتماد تُرسل إلى الإدارة، ولن تتمكن من التعديل إلا إذا أعادتها إليك.`,
      okLabel: 'اعتماد النتيجة',
      danger: untouched.length > 0,
    });
    if (!ok) return;
    setSubmitting(true);
    const saved = await flush();
    if (!saved) {
      setSubmitting(false);
      toast('تعذّر حفظ آخر التعديلات. تحقق من الاتصال ثم أعد المحاولة.', 'err');
      return;
    }
    try {
      const score = await rpc('submit_exam', { p_exam_id: examId });
      await qc.invalidateQueries();
      toast(`اعتُمدت النتيجة (${fmtScore(score)}) وأُرسلت إلى الإدارة`);
      navigate('/examiner/results');
    } catch (err) {
      toast(errorMessage(err), 'err');
      setSubmitting(false);
    }
  };

  const next = () => {
    if (!isLast) {
      if (editable && !q.touched) update((prev) => prev); // المرور على السؤال يعني اعتماد القيم الحالية
      setCurrent((c) => c + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    finish();
  };

  const saveLabel = { idle: '', saving: 'جارِ الحفظ…', saved: 'حُفظ تلقائياً', error: 'تعذّر الحفظ' }[saveState];

  return (
    <div className="exs">
      <div className="exs-top">
        <div>
          <div className="nm">{exam.full_name}</div>
          <div className="sub">
            {data.app.level_name}{data.app.memorized_amount ? ` · ${data.app.memorized_amount}` : ''} · <bdi dir="ltr" style={{ whiteSpace: 'nowrap' }}>{exam.exam_no}</bdi>
          </div>
        </div>
        <div className="sp" />
        {editable
          ? <span className="exs-live"><i />جلسة {exam.status === 'rejected' ? 'تصحيح' : 'أونلاين'}</span>
          : <span className="exs-live" style={{ color: 'var(--e-gold)' }}>{EXAM_STATUS[exam.status]?.t} — للعرض فقط</span>}
        {saveLabel && (
          <span className="sub" role="status" style={saveState === 'error' ? { color: 'var(--e-red)' } : undefined}>
            {saveLabel}{saveState === 'error' && <> — <button className="exs-btn" onClick={flush}>إعادة المحاولة</button></>}
          </span>
        )}
        <button className="exs-btn" onClick={leave}>{editable ? 'إنهاء لاحقاً' : 'رجوع'}</button>
      </div>

      {exam.status === 'rejected' && exam.return_reason && (
        <div className="exs-alert">أُعيد هذا الامتحان من الإدارة: {exam.return_reason}</div>
      )}

      <div className="qtabs" role="tablist">
        {questions.map((x, i) => (
          <button key={x.q_index} role="tab" aria-selected={current === i} className={`qtab ${current === i ? 'on' : ''}`} onClick={() => setCurrent(i)}>
            <span className="ok">{x.touched ? '✓' : '○'}</span> {ordinal(x.q_index)}
          </button>
        ))}
      </div>

      <div className="exs-body">
        <div className="qcard">
          <div className="h">
            <h3>{ordinal(q.q_index)}</h3>
            {editable && <>
              <button className="exs-btn red" onClick={resetQuestion}>إلغاء السؤال</button>
              <button className="exs-btn" onClick={doUndo}>تراجع</button>
            </>}
          </div>

          {cfg.criteria.map((c) => {
            const v = criterionValue(cfg, q, c);
            const step = Number(c.step) || 1;
            return (
              <div className="voice" key={c.id} title={c.description || ''}>
                <div className="lb"><b>{c.name}</b><span>{c.hint || `من 0 إلى ${fmtScore(c.max_score)}`}</span></div>
                <button className="stp-btn" disabled={!editable} onClick={() => setCriterion(c, v - step)} aria-label={`إنقاص ${c.name}`}>−</button>
                <input value={v} inputMode="decimal" disabled={!editable} aria-label={c.name}
                  onChange={(e) => setCriterion(c, e.target.value.replace(/[^\d.]/g, ''))} />
                <button className="stp-btn" disabled={!editable} onClick={() => setCriterion(c, v + step)} aria-label={`زيادة ${c.name}`}>+</button>
                <span className="sub">/ {fmtScore(c.max_score)}</span>
              </div>
            );
          })}

          <div className="ded-grid">
            {cfg.deductions.map((d) => {
              const n = q.deductions[d.id] || 0;
              return (
                <div key={d.id} role="button" tabIndex={editable ? 0 : -1} className={`ded ${n ? 'hit' : ''}`} title={d.description || ''}
                  onClick={() => addDeduction(d, 1)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addDeduction(d, 1))}>
                  <div className="t">{d.name}</div>
                  <div className="n">{n}</div>
                  <div className="v"><bdi dir="ltr">−{fmtScore(d.value)}</bdi></div>
                  {n > 0 && editable && (
                    <button className="minus" onClick={(e) => { e.stopPropagation(); addDeduction(d, -1); }}>تراجع عن مرة</button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="qtotal"><span className="sub">مجموع السؤال</span><span className="v">{fmtScore(questionScore(cfg, q))} / {fmtScore(cfg.base)}</span></div>
          <div className="qtotal" style={{ marginTop: 8 }}>
            <span className="sub">مجموع الخصميات</span>
            <span className="v" style={{ color: 'var(--e-red)' }}><bdi dir="ltr">−{fmtScore(questionDeductionsTotal(cfg, q))}</bdi></span>
          </div>
        </div>
      </div>

      {editable && (
        <div className="exs-hint">
          ضع درجة {cfg.criteria.map((c) => `«${c.name}»`).join(' و')}، ثم سجّل الخصميات بالضغط على البطاقة عند وقوع الخطأ.
        </div>
      )}

      <div className="exs-foot">
        <div className="tot"><span>النتيجة</span><b>{fmtScore(total)} / 100</b></div>
        {editable ? (
          <button className="exs-next" onClick={next} disabled={submitting}>
            {submitting ? 'جارٍ الإرسال…' : isLast ? 'إنهاء الجلسة واعتماد النتيجة' : 'السؤال التالي ←'}
          </button>
        ) : (
          <button className="exs-next" onClick={() => navigate('/examiner/results')}>العودة إلى نتائجي</button>
        )}
      </div>
      <div className="exs-chips">
        {questions.map((x, i) => (
          <span key={x.q_index} className={`exs-chip ${current === i ? 'on' : ''}`}>{ordinal(x.q_index)}: {fmtScore(questionScore(cfg, x))}</span>
        ))}
      </div>
    </div>
  );
}
