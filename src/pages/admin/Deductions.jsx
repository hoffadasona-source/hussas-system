import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/icons';
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Skeleton } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/helpers';
import { fmtScore } from '../../lib/format';

function DeductionModal({ item, nextOrder, onClose }) {
  const run = useAction();
  const [f, setF] = useState({
    name: item?.name || '', description: item?.description || '', value: item?.value ?? '',
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
        <Field label="قيمة الخصم" required><input className="inp" type="number" min="0" step="0.25" value={f.value} onChange={set('value')} /></Field>
        <Field label="الترتيب"><input className="inp" type="number" value={f.sort_order} onChange={set('sort_order')} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> فعّال</label>
    </Modal>
  );
}

export default function Deductions() {
  const { isSuper } = useAuth();
  const { confirm } = useUi();
  const run = useAction();
  const [editing, setEditing] = useState(undefined);

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['deduction-types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deduction_types').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });

  const toggle = async (d) => {
    const ok = await confirm({
      title: d.active ? 'إيقاف نوع الخصم' : 'تفعيل نوع الخصم',
      text: d.active ? 'لن يظهر للمحكّمين في الامتحانات الجديدة، وتبقى الامتحانات السابقة كما هي.' : 'سيظهر للمحكّمين في الجلسات الجديدة.',
      okLabel: d.active ? 'إيقاف' : 'تفعيل',
      danger: d.active,
    });
    if (ok) {
      run(async () => {
        const { error } = await supabase.from('deduction_types').update({ active: !d.active }).eq('id', d.id);
        if (error) throw error;
      }, d.active ? 'أُوقف نوع الخصم' : 'فُعّل نوع الخصم');
    }
  };

  const active = data.filter((d) => d.active).length;

  return (
    <>
      <PageHeader title="الخصميات" sub="أنواع الخصم وقيمها، تُضاف وتُعدَّل من هنا وتظهر مباشرة للمحكّم في شاشة الامتحان." />
      {!isSuper && <div className="alert mb">عرض فقط — تعديل الخصميات من صلاحية مدير النظام.</div>}
      {error && <ErrorBox error={errorMessage(error)} onRetry={refetch} />}
      <div className="card">
        <div className="card-h">
          <h3>أنواع الخصم ({active} فعّال من {data.length})</h3>
          {isSuper && <button className="btn sm" onClick={() => setEditing(null)}><Icon.plus /> نوع خصم</button>}
        </div>
        {isLoading ? <Skeleton /> : data.length ? (
          <div className="tbl-wrap cards"><table className="tbl">
            <thead><tr><th>النوع</th><th>الوصف</th><th>قيمة الخصم</th><th>الترتيب</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
            <tbody>{data.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td><td className="small muted">{d.description}</td>
                <td className="num" style={{ color: 'var(--err)' }}><bdi dir="ltr">−{fmtScore(d.value)}</bdi></td>
                <td className="num">{d.sort_order}</td>
                <td>{d.active ? <Badge kind="ok">فعّال</Badge> : <Badge kind="err">موقوف</Badge>}</td>
                <td>{isSuper && <div className="acts">
                  <button className="btn ghost sm" onClick={() => setEditing(d)}><Icon.edit /></button>
                  <button className="btn ghost sm" onClick={() => toggle(d)}>{d.active ? 'إيقاف' : 'تفعيل'}</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="لا توجد أنواع خصم" />}
        <div className="card-b" style={{ borderTop: '1px solid var(--line)' }}>
          <p className="small muted" style={{ margin: 0 }}>يُسجَّل الخصم بعدد مرات تكراره في السؤال، فيُضرب عدد المرات في قيمة النوع.</p>
        </div>
      </div>
      {editing !== undefined && (
        <DeductionModal item={editing} nextOrder={(data.at(-1)?.sort_order || 0) + 1} onClose={() => setEditing(undefined)} />
      )}
    </>
  );
}
