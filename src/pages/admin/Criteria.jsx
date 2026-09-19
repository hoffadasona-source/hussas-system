import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/icons';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Skeleton } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useSettings } from '../../hooks/data';
import { supabase } from '../../lib/supabase';
import { AGGREGATES } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtScore } from '../../lib/format';

function CriterionModal({ item, onClose }) {
  const run = useAction();
  const [f, setF] = useState({
    name: item?.name || '', description: item?.description || '', max_score: item?.max_score ?? 10,
    default_score: item?.default_score ?? 5, penalty_factor: item?.penalty_factor ?? 1, step: item?.step ?? 1,
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
    const payload = { ...f, name: f.name.trim(), max_score: max, default_score: def, penalty_factor: Number(f.penalty_factor), step: Number(f.step), sort_order: Number(f.sort_order) || 0 };
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
      <Field label="اسم المعيار" required><input className="inp" placeholder="كما يظهر للمحفّظ في شاشة الامتحان" value={f.name} onChange={set('name')} /></Field>
      <Field label="الوصف"><textarea className="inp" placeholder="شرح مختصر لما يقيسه المعيار" value={f.description} onChange={set('description')} /></Field>
      <div className="f3">
        <Field label="الدرجة القصوى" required><input className="inp" type="number" min="0" step="0.5" value={f.max_score} onChange={set('max_score')} /></Field>
        <Field label="الدرجة الافتراضية" hint="تبدأ بها كل جلسة"><input className="inp" type="number" min="0" step="0.5" value={f.default_score} onChange={set('default_score')} /></Field>
        <Field label="الخصم لكل درجة ناقصة"><input className="inp" type="number" min="0" step="0.25" value={f.penalty_factor} onChange={set('penalty_factor')} /></Field>
        <Field label="خطوة الزيادة"><input className="inp" type="number" min="0.25" step="0.25" value={f.step} onChange={set('step')} /></Field>
        <Field label="الترتيب"><input className="inp" type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
        <Field label="تلميح للمحفّظ"><input className="inp" placeholder="مثال: من 5 إلى 9 غالباً" value={f.hint} onChange={set('hint')} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> فعّال</label>
      <p className="hint">التعديلات تنطبق على الجلسات الجديدة فقط؛ الامتحانات السابقة تحتفظ بالقواعد التي بدأت بها.</p>
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

export default function Criteria() {
  const { isSuper } = useAuth();
  const { confirm } = useUi();
  const run = useAction();
  const { data: settings } = useSettings();
  const [editCrit, setEditCrit] = useState(undefined);
  const [editGrade, setEditGrade] = useState(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['criteria-grades'],
    queryFn: async () => {
      const [c, g] = await Promise.all([
        supabase.from('criteria').select('*').order('sort_order').order('name'),
        supabase.from('grade_scales').select('*').order('min_score', { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (g.error) throw g.error;
      return { criteria: c.data, grades: g.data };
    },
  });

  const removeGrade = async (g) => {
    if (await confirm({ title: 'حذف نطاق التقدير', text: `حذف «${g.name}»؟ لا يؤثر على الشهادات الصادرة.`, okLabel: 'حذف', danger: true })) {
      run(async () => {
        const { error } = await supabase.from('grade_scales').delete().eq('id', g.id);
        if (error) throw error;
      }, 'حُذف النطاق');
    }
  };

  const voice = data?.criteria.find((c) => c.active);

  return (
    <>
      <PageHeader title="معايير التقييم" sub="المعايير ودرجاتها تُدار من هنا، ولا تُثبَّت داخل النظام." />
      {!isSuper && <div className="alert mb">عرض فقط — تعديل المعايير من صلاحية مدير النظام.</div>}
      {error && <ErrorBox error={errorMessage(error)} onRetry={refetch} />}
      <div className="card">
        <div className="card-h">
          <h3>المعايير</h3>
          <div className="row">
            <Badge>الدرجة الأساسية: {fmtScore(settings?.exam_base)}</Badge>
            <Badge kind="teal">عدد الأسئلة: {settings?.exam_questions}</Badge>
            {isSuper && <button className="btn sm" onClick={() => setEditCrit(null)}><Icon.plus /> معيار جديد</button>}
          </div>
        </div>
        {isLoading ? <Skeleton /> : data?.criteria.length ? (
          <div className="tbl-wrap cards"><table className="tbl">
            <thead><tr><th>المعيار</th><th>الوصف</th><th>القصوى</th><th>الافتراضية</th><th>الخصم لكل درجة</th><th>الترتيب</th><th>الحالة</th><th /></tr></thead>
            <tbody>{data.criteria.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td className="small muted">{c.description}</td>
                <td className="num">{fmtScore(c.max_score)}</td><td className="num">{fmtScore(c.default_score)}</td>
                <td className="num">× {fmtScore(c.penalty_factor)}</td><td className="num">{c.sort_order}</td>
                <td>{c.active ? <Badge kind="ok">فعّال</Badge> : <Badge kind="err">موقوف</Badge>}</td>
                <td>{isSuper && <button className="btn ghost sm" onClick={() => setEditCrit(c)}><Icon.edit /></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="لا توجد معايير" text="أضف معياراً واحداً على الأقل، مثل «الصوت»." />}
        <div className="card-b" style={{ borderTop: '1px solid var(--line)' }}>
          <h4 className="kufi" style={{ fontSize: 14.5 }}>قاعدة احتساب درجة السؤال</h4>
          <p className="small muted" style={{ margin: '6px 0 10px' }}>تُطبَّق على كل سؤال، ثم تُجمع نتائج الأسئلة حسب طريقة التجميع المختارة في الإعدادات.</p>
          <div className="row">
            <Badge plain>{fmtScore(settings?.exam_base)} أساس</Badge><span>−</span>
            <Badge kind="warn" plain>Σ (الدرجة القصوى − الممنوحة) × معامل المعيار</Badge><span>−</span>
            <Badge kind="err" plain>Σ عدد مرات الخصم × قيمته</Badge><span>=</span>
            <Badge kind="ok" plain>درجة السؤال</Badge>
          </div>
          {voice && (
            <p className="hint mt-s">
              مثال: {voice.name} {fmtScore(voice.default_score)} وبلا خصميات ← {fmtScore(settings?.exam_base)} − {fmtScore((voice.max_score - voice.default_score) * voice.penalty_factor)} = {fmtScore(settings?.exam_base - (voice.max_score - voice.default_score) * voice.penalty_factor)} درجة للسؤال.
              النتيجة النهائية = {AGGREGATES[settings?.exam_aggregate]}، محصورة بين 0 و100.
            </p>
          )}
        </div>
      </div>

      <div className="card mt">
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
      </div>
      {editCrit !== undefined && <CriterionModal item={editCrit} onClose={() => setEditCrit(undefined)} />}
      {editGrade !== undefined && <GradeModal item={editGrade} onClose={() => setEditGrade(undefined)} />}
    </>
  );
}
