import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ArbitrationGuide from '../../components/ArbitrationGuide';
import { Icon } from '../../components/icons';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Skeleton, Tabs } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useSettings } from '../../hooks/data';
import { supabase } from '../../lib/supabase';
import { AGGREGATES } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtScore } from '../../lib/format';
import { questionScore, examScore } from '../../lib/scoring';

const TABS = [
  { key: 'criteria', label: 'معايير التقييم' },
  { key: 'deductions', label: 'الخصميات' },
  { key: 'grades', label: 'سلّم التقديرات' },
  { key: 'guide', label: 'الدليل الاسترشادي' },
];

function CriterionModal({ item, onClose }) {
  const run = useAction();
  const [f, setF] = useState({
    name: item?.name || '', description: item?.description || '', max_score: item?.max_score ?? 10,
    default_score: item?.default_score ?? 5, penalty_factor: item?.penalty_factor ?? 1, step: item?.step ?? 0.25,
    hint: item?.hint || '', sort_order: item?.sort_order ?? 1, active: item?.active ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    const max = Number(f.max_score);
    const def = Number(f.default_score);
    if (!f.name.trim()) return setErr('اسم المعيار مطلوب.');
    if (!(max > 0)) return setErr('الدرجة القصوى يجب أن تكون أكبر من صفر.');
    if (def < 0 || def > max) return setErr('الدرجة الافتراضية بين 0 والدرجة القصوى.');
    if (Number(f.penalty_factor) < 0 || !(Number(f.step) > 0)) return setErr('المعامل والخطوة قيم موجبة.');
    const payload = {
      ...f, name: f.name.trim(), max_score: max, default_score: def,
      penalty_factor: Number(f.penalty_factor), step: Number(f.step), sort_order: Number(f.sort_order) || 0,
    };
    const ok = await run(async () => {
      const { error } = item ? await supabase.from('criteria').update(payload).eq('id', item.id) : await supabase.from('criteria').insert(payload);
      if (error) throw error;
    }, item ? 'حُفظ المعيار' : 'أُضيف المعيار');
    if (ok) onClose();
  };
  return (
    <Modal title={item ? 'تعديل معيار التقييم' : 'معيار تقييم جديد'} onClose={onClose}
      footer={<><button className="btn teal" onClick={save}>حفظ المعيار</button><button className="btn ghost" onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert err mb">{err}</div>}
      <Field label="اسم المعيار" required><input className="inp" placeholder="كما يظهر للمحكّم في شاشة الامتحان" value={f.name} onChange={set('name')} /></Field>
      <Field label="الوصف"><textarea className="inp" placeholder="شرح مختصر لما يقيسه المعيار" value={f.description} onChange={set('description')} /></Field>
      <div className="f3">
        <Field label="الدرجة القصوى" required><input className="inp" type="number" min="0" step="0.25" value={f.max_score} onChange={set('max_score')} /></Field>
        <Field label="الدرجة الافتراضية" hint="تبدأ بها كل جلسة"><input className="inp" type="number" min="0" step="0.25" value={f.default_score} onChange={set('default_score')} /></Field>
        <Field label="الخصم لكل درجة ناقصة"><input className="inp" type="number" min="0" step="0.05" value={f.penalty_factor} onChange={set('penalty_factor')} /></Field>
        <Field label="خطوة الزيادة" hint="أزرار + و − في شاشة الامتحان"><input className="inp" type="number" min="0.01" step="0.25" value={f.step} onChange={set('step')} /></Field>
        <Field label="الترتيب"><input className="inp" type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
        <Field label="تلميح للمحكّم"><input className="inp" placeholder="مثال: يُقبل الكسر المئوي مثل 8.75" value={f.hint} onChange={set('hint')} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> فعّال</label>
      <p className="hint">التعديلات تنطبق على الجلسات الجديدة فقط؛ الامتحانات السابقة تحتفظ بالقواعد التي بدأت بها.</p>
    </Modal>
  );
}

function DeductionModal({ item, nextOrder, onClose }) {
  const run = useAction();
  const [f, setF] = useState({
    name: item?.name || '', description: item?.description || '', value: item?.value ?? 0.5,
    sort_order: item?.sort_order ?? nextOrder, active: item?.active ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    if (!f.name.trim()) return setErr('اسم النوع مطلوب.');
    if (f.value === '' || Number(f.value) < 0) return setErr('القيمة رقم موجب.');
    const payload = { name: f.name.trim(), description: f.description || null, value: Number(f.value), sort_order: Number(f.sort_order) || 0, active: f.active };
    const ok = await run(async () => {
      const { error } = item ? await supabase.from('deduction_types').update(payload).eq('id', item.id) : await supabase.from('deduction_types').insert(payload);
      if (error) throw error;
    }, item ? 'حُفظ نوع الخصم' : 'أُضيف نوع الخصم');
    if (ok) onClose();
  };
  return (
    <Modal title={item ? 'تعديل نوع الخصم' : 'نوع خصم جديد'} onClose={onClose}
      footer={<><button className="btn teal" onClick={save}>حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert err mb">{err}</div>}
      <Field label="اسم النوع" required><input className="inp" value={f.name} onChange={set('name')} /></Field>
      <Field label="الوصف"><textarea className="inp" value={f.description} onChange={set('description')} /></Field>
      <div className="f2">
        <Field label="قيمة الخصم" required hint="الدليل: ¼ = 0.25 · ½ = 0.50 · درجة = 1">
          <input className="inp" type="number" min="0" step="0.25" value={f.value} onChange={set('value')} />
        </Field>
        <Field label="الترتيب"><input className="inp" type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        {[0.25, 0.5, 1].map((v) => (
          <button key={v} type="button" className="btn ghost sm" onClick={() => setF((x) => ({ ...x, value: v }))}>{v === 0.25 ? '¼' : v === 0.5 ? '½' : '1'} — {v.toFixed(2)}</button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> فعّال</label>
    </Modal>
  );
}

function GradeModal({ item, onClose }) {
  const run = useAction();
  const [f, setF] = useState({ min_score: item?.min_score ?? '', max_score: item?.max_score ?? '', name: item?.name || '', is_passing: item?.is_passing ?? false });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    const min = Number(f.min_score);
    const max = Number(f.max_score);
    if (!f.name.trim() || f.min_score === '' || f.max_score === '') return setErr('كل الحقول مطلوبة.');
    if (min < 0 || max > 100 || min > max) return setErr('النطاق بين 0 و100، و«من» لا يتجاوز «إلى».');
    const ok = await run(async () => {
      const payload = { name: f.name.trim(), min_score: min, max_score: max, is_passing: f.is_passing };
      const { error } = item ? await supabase.from('grade_scales').update(payload).eq('id', item.id) : await supabase.from('grade_scales').insert(payload);
      if (error) throw error;
    }, 'حُفظ النطاق');
    if (ok) onClose();
  };
  return (
    <Modal title="نطاق تقدير" onClose={onClose}
      footer={<><button className="btn teal" onClick={save}>حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert err mb">{err}</div>}
      <div className="f3">
        <Field label="من"><input className="inp" type="number" min="0" max="100" step="0.01" value={f.min_score} onChange={set('min_score')} /></Field>
        <Field label="إلى"><input className="inp" type="number" min="0" max="100" step="0.01" value={f.max_score} onChange={set('max_score')} /></Field>
        <Field label="التقدير"><input className="inp" placeholder="اسم التقدير" value={f.name} onChange={set('name')} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.is_passing} onChange={set('is_passing')} /> يُعدّ ناجحاً</label>
    </Modal>
  );
}

/** محاكاة مباشرة: أثر المعايير والخصميات على درجة السؤال والنتيجة النهائية */
function ScoreSimulator({ settings, criteria, deductions }) {
  const [counts, setCounts] = useState({});
  const config = {
    base: Number(settings?.exam_base ?? 100),
    aggregate: settings?.exam_aggregate || 'avg',
    criteria: criteria.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, max_score: c.max_score, default_score: c.default_score, penalty_factor: c.penalty_factor })),
    deductions: deductions.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, value: d.value })),
  };
  const [scores, setScores] = useState({});
  const question = { criteria_scores: scores, deductions: counts };
  const qScore = questionScore(config, question);
  const final = examScore(config, [question]);
  const bump = (id, delta) => setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));

  return (
    <div className="card-b" style={{ borderTop: '1px solid var(--line)' }}>
      <h4 className="kufi" style={{ fontSize: 14.5, margin: '0 0 4px' }}>محاكاة سريعة</h4>
      <p className="small muted" style={{ margin: '0 0 12px' }}>
        جرّب أثر المعايير والخصميات على سؤال واحد قبل اعتمادها. الدرجة الأساسية للسؤال <b>{fmtScore(config.base)}</b> وتُضبط من الإعدادات ← الامتحان.
      </p>
      <div className="f2">
        {config.criteria.map((c) => (
          <Field key={c.id} label={`${c.name} (من ${fmtScore(c.max_score)})`}>
            <input className="inp" type="number" min="0" max={c.max_score} step="0.25"
              value={scores[c.id] ?? c.default_score}
              onChange={(e) => setScores((s) => ({ ...s, [c.id]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {config.deductions.map((d) => (
          <button key={d.id} type="button" className={`chip-opt ${counts[d.id] ? 'on' : ''}`} onClick={() => bump(d.id, 1)}
            onContextMenu={(e) => { e.preventDefault(); bump(d.id, -1); }} title="نقرة = مرة · نقرة يمين = تراجع">
            {d.name} <bdi dir="ltr">−{fmtScore(d.value)}</bdi>{counts[d.id] ? ` × ${counts[d.id]}` : ''}
          </button>
        ))}
      </div>
      <div className="row mt" style={{ flexWrap: 'wrap' }}>
        <Badge kind="ok" plain>درجة السؤال: {fmtScore(qScore)} من {fmtScore(config.base)}</Badge>
        <Badge kind="teal" plain>النسبة النهائية لسؤال كهذا: {fmtScore(final)}%</Badge>
        <button className="btn ghost sm" onClick={() => { setCounts({}); setScores({}); }}>تصفير</button>
      </div>
    </div>
  );
}

export default function ArbitrationCriteria() {
  const { isSuper } = useAuth();
  const { confirm } = useUi();
  const run = useAction();
  const { data: settings } = useSettings();
  const [tab, setTab] = useState('criteria');
  const [editCrit, setEditCrit] = useState(undefined);
  const [editDed, setEditDed] = useState(undefined);
  const [editGrade, setEditGrade] = useState(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['arbitration'],
    queryFn: async () => {
      const [c, d, g] = await Promise.all([
        supabase.from('criteria').select('*').order('sort_order').order('name'),
        supabase.from('deduction_types').select('*').order('sort_order').order('name'),
        supabase.from('grade_scales').select('*').order('min_score', { ascending: false }),
      ]);
      for (const r of [c, d, g]) if (r.error) throw r.error;
      return { criteria: c.data, deductions: d.data, grades: g.data };
    },
  });

  const toggleDeduction = async (d) => {
    const ok = await confirm({
      title: d.active ? 'إيقاف نوع الخصم' : 'تفعيل نوع الخصم',
      text: d.active ? 'لن يظهر للمحكّمين في الامتحانات الجديدة، وتبقى الامتحانات السابقة كما هي.' : 'سيظهر للمحكّمين في الجلسات الجديدة.',
      okLabel: d.active ? 'إيقاف' : 'تفعيل',
      danger: d.active,
    });
    if (ok) {
      run(async () => {
        const { error: err } = await supabase.from('deduction_types').update({ active: !d.active }).eq('id', d.id);
        if (err) throw err;
      }, d.active ? 'أُوقف نوع الخصم' : 'فُعّل نوع الخصم');
    }
  };

  const removeGrade = async (g) => {
    if (await confirm({ title: 'حذف نطاق التقدير', text: `حذف «${g.name}»؟ لا يؤثر على الشهادات الصادرة.`, okLabel: 'حذف', danger: true })) {
      run(async () => {
        const { error: err } = await supabase.from('grade_scales').delete().eq('id', g.id);
        if (err) throw err;
      }, 'حُذف النطاق');
    }
  };

  const criteria = data?.criteria || [];
  const deductions = data?.deductions || [];
  const activeDeductions = deductions.filter((d) => d.active).length;

  return (
    <>
      <PageHeader title="أساس التحكيم"
        sub="معايير التقييم وقيم الخصميات وسلّم التقديرات في مكان واحد، وفق الدليل الاسترشادي لآلية التحكيم." />
      {!isSuper && <div className="alert mb">عرض فقط — تعديل أساس التحكيم من صلاحية مدير النظام.</div>}
      {error && <ErrorBox error={errorMessage(error)} onRetry={refetch} />}

      <div className="card mb">
        <div className="card-b">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Badge plain>{fmtScore(settings?.exam_base)} أساس السؤال</Badge><span>−</span>
            <Badge kind="warn" plain>Σ (الدرجة القصوى − الممنوحة) × معامل المعيار</Badge><span>−</span>
            <Badge kind="err" plain>Σ عدد مرات الخصم × قيمته</Badge><span>=</span>
            <Badge kind="ok" plain>درجة السؤال</Badge>
          </div>
          <p className="hint mt-s" style={{ marginBottom: 0 }}>
            النتيجة النهائية = {AGGREGATES[settings?.exam_aggregate] || 'متوسط الأسئلة'} ÷ أساس السؤال × 100، محصورة بين 0 و100.
            عدد أسئلة الجلسة: {settings?.exam_questions}. الدرجة تُحسب بمنزلتين عشريتين (0.00) لتفادي التعادل.
          </p>
        </div>
      </div>

      <div className="card">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />

        {tab === 'criteria' && (
          <>
            <div className="card-h">
              <h3>المعايير ({criteria.filter((c) => c.active).length} فعّال من {criteria.length})</h3>
              {isSuper && <button className="btn sm" onClick={() => setEditCrit(null)}><Icon.plus /> معيار جديد</button>}
            </div>
            {isLoading ? <Skeleton /> : criteria.length ? (
              <div className="tbl-wrap cards"><table className="tbl">
                <thead><tr><th>المعيار</th><th>الوصف</th><th>القصوى</th><th>الافتراضية</th><th>الخصم لكل درجة</th><th>الخطوة</th><th>الحالة</th><th /></tr></thead>
                <tbody>{criteria.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td><td className="small muted">{c.description}</td>
                    <td className="num">{fmtScore(c.max_score)}</td><td className="num">{fmtScore(c.default_score)}</td>
                    <td className="num">× {fmtScore(c.penalty_factor)}</td><td className="num">{fmtScore(c.step)}</td>
                    <td>{c.active ? <Badge kind="ok">فعّال</Badge> : <Badge kind="err">موقوف</Badge>}</td>
                    <td>{isSuper && <button className="btn ghost sm" onClick={() => setEditCrit(c)}><Icon.edit /></button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <Empty title="لا توجد معايير" text="أضف معياراً واحداً على الأقل، مثل «الصوت والأداء»." />}
          </>
        )}

        {tab === 'deductions' && (
          <>
            <div className="card-h">
              <h3>أنواع الخصم ({activeDeductions} فعّال من {deductions.length})</h3>
              {isSuper && <button className="btn sm" onClick={() => setEditDed(null)}><Icon.plus /> نوع خصم</button>}
            </div>
            {isLoading ? <Skeleton /> : deductions.length ? (
              <div className="tbl-wrap cards"><table className="tbl">
                <thead><tr><th>النوع</th><th>الوصف</th><th>قيمة الخصم</th><th>الترتيب</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                <tbody>{deductions.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td><td className="small muted">{d.description}</td>
                    <td className="num" style={{ color: 'var(--err)' }}><bdi dir="ltr">−{fmtScore(d.value)}</bdi></td>
                    <td className="num">{d.sort_order}</td>
                    <td>{d.active ? <Badge kind="ok">فعّال</Badge> : <Badge kind="err">موقوف</Badge>}</td>
                    <td>{isSuper && <div className="acts">
                      <button className="btn ghost sm" onClick={() => setEditDed(d)}><Icon.edit /></button>
                      <button className="btn ghost sm" onClick={() => toggleDeduction(d)}>{d.active ? 'إيقاف' : 'تفعيل'}</button>
                    </div>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <Empty title="لا توجد أنواع خصم" />}
            <div className="card-b" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="small muted" style={{ margin: 0 }}>
                يُسجَّل الخصم بعدد مرات تكراره في السؤال، فيُضرب العدد في قيمة النوع. قيم الدليل: التلعثم واللحن الخفي ¼،
                والتردد والتقديم والتأخير والنقص والزيادة والتحلية والتعظيم ½، والتنبيه والفتح واللحن الجلي والراوي أو التخريج درجة كاملة.
              </p>
            </div>
          </>
        )}

        {tab === 'grades' && (
          <>
            <div className="card-h">
              <h3>سلّم التقديرات</h3>
              {isSuper && <button className="btn ghost sm" onClick={() => setEditGrade(null)}><Icon.plus /> نطاق تقدير</button>}
            </div>
            {isLoading ? <Skeleton /> : data?.grades.length ? (
              <div className="tbl-wrap cards"><table className="tbl">
                <thead><tr><th>التقدير</th><th>من</th><th>إلى</th><th>النتيجة</th><th /></tr></thead>
                <tbody>{data.grades.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td><td className="num">{fmtScore(g.min_score)}</td><td className="num">{fmtScore(g.max_score)}</td>
                    <td>{g.is_passing ? <Badge kind="ok">ناجح</Badge> : <Badge kind="err">غير ناجح</Badge>}</td>
                    <td>{isSuper && <div className="acts">
                      <button className="btn ghost sm" onClick={() => setEditGrade(g)}><Icon.edit /></button>
                      <button className="btn ghost sm" onClick={() => removeGrade(g)}>حذف</button>
                    </div>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : (
              <Empty title="لم تُحدَّد التقديرات بعد"
                text="عرّف نطاقات الدرجات وأسماء التقديرات المقابلة لها، وحدّد النطاقات الناجحة لاحتساب نسب النجاح في التقارير." />
            )}
          </>
        )}

        {tab === 'guide' && <ArbitrationGuide />}

        {!isLoading && (tab === 'criteria' || tab === 'deductions') && (
          <ScoreSimulator settings={settings} criteria={criteria} deductions={deductions} />
        )}
      </div>

      {editCrit !== undefined && <CriterionModal item={editCrit} onClose={() => setEditCrit(undefined)} />}
      {editDed !== undefined && <DeductionModal item={editDed} nextOrder={(deductions.at(-1)?.sort_order || 0) + 1} onClose={() => setEditDed(undefined)} />}
      {editGrade !== undefined && <GradeModal item={editGrade} onClose={() => setEditGrade(undefined)} />}
    </>
  );
}
