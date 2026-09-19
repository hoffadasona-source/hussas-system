import { useState } from 'react';
import ListCard from '../../components/ListCard';
import { Icon } from '../../components/icons';
import { Field, Kv, Modal, PageHeader, Select, StatusBadge, mapOptions, rowsOptions } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useUi } from '../../context/UiContext';
import { useLookups, usePagedList } from '../../hooks/data';
import { manageUsers, supabase } from '../../lib/supabase';
import { ACCOUNT_STATUS } from '../../lib/constants';
import { fmtDateTime } from '../../lib/format';

function ExaminerForm({ examiner, onClose }) {
  const { data: lookups } = useLookups();
  const run = useAction();
  const isNew = !examiner;
  const [f, setF] = useState({
    full_name: examiner?.full_name || '', employee_no: examiner?.employee_no || '', phone: examiner?.phone || '',
    office_id: examiner?.office_id || '', specialization: examiner?.specialization || '', username: '', password: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const save = async () => {
    const e = {};
    if (!f.full_name.trim()) e.full_name = 'الاسم مطلوب.';
    if (!f.office_id) e.office_id = 'اختر المكتب.';
    if (isNew || !examiner.user_id) {
      if (!/^[a-z0-9._-]{3,32}$/.test(f.username.trim().toLowerCase())) e.username = 'أحرف لاتينية صغيرة وأرقام و . _ - (3 أحرف على الأقل).';
      if (f.password && f.password.length < 8) e.password = '8 أحرف على الأقل، أو اتركه فارغاً لتوليد كلمة مؤقتة.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const details = { employee_no: f.employee_no || null, phone: f.phone || null, office_id: f.office_id, specialization: f.specialization || null };
    let result;
    if (isNew || !examiner.user_id) {
      result = await run(() => manageUsers({
        action: 'create_user', role: 'examiner', full_name: f.full_name, username: f.username.trim().toLowerCase(),
        password: f.password || undefined, examiner: { ...details, id: examiner?.id },
      }), 'أُنشئ حساب المحفّظ');
    } else {
      result = await run(async () => {
        const { error } = await supabase.from('examiners').update({ full_name: f.full_name, ...details }).eq('id', examiner.id);
        if (error) throw error;
      }, 'حُفظت بيانات المحفّظ');
    }
    setBusy(false);
    if (!result) return;
    if (result.password) setCreated(result);
    else onClose();
  };

  if (created) {
    return (
      <Modal title="تم إنشاء الحساب" onClose={onClose} footer={<button className="btn teal" onClick={onClose}>تم</button>}>
        <div className="alert ok mb">سلّم بيانات الدخول للمحفّظ بطريقة آمنة. لن تظهر كلمة المرور مرة أخرى.</div>
        <Kv items={[['اسم المستخدم', <span className="ltr num">{created.username}</span>], ['كلمة المرور المؤقتة', <span className="ltr num">{created.password}</span>]]} />
      </Modal>
    );
  }

  return (
    <Modal title={isNew ? 'إضافة محفّظ' : 'تعديل بيانات المحفّظ'} onClose={onClose}
      footer={<>
        <button className="btn teal" onClick={save} disabled={busy}>{busy && <span className="spinner" />} حفظ</button>
        <button className="btn ghost" onClick={onClose}>إلغاء</button>
      </>}>
      <div className="f2">
        <Field label="الاسم الكامل" required error={errors.full_name}><input className="inp" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="الرقم الوظيفي"><input className="inp ltr" value={f.employee_no} onChange={set('employee_no')} /></Field>
        <Field label="الهاتف"><input className="inp ltr" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="المكتب" required error={errors.office_id}>
          <Select value={f.office_id} onChange={set('office_id')} placeholder="اختر المكتب" options={rowsOptions(lookups?.offices?.filter((o) => o.active))} />
        </Field>
        <Field label="التخصص" className="full"><input className="inp" placeholder="مثال: صحيح البخاري" value={f.specialization} onChange={set('specialization')} /></Field>
        {(isNew || !examiner.user_id) && <>
          <Field label="اسم المستخدم" required error={errors.username} hint="يُستخدم للدخول إلى لوحة المحفّظ.">
            <input className="inp ltr" autoComplete="off" value={f.username} onChange={set('username')} />
          </Field>
          <Field label="كلمة المرور" error={errors.password} hint="اتركها فارغة لتوليد كلمة مؤقتة.">
            <input className="inp ltr" type="text" autoComplete="new-password" value={f.password} onChange={set('password')} />
          </Field>
        </>}
      </div>
    </Modal>
  );
}

export default function Examiners() {
  const { data: lookups } = useLookups();
  const run = useAction();
  const { confirm } = useUi();
  const [status, setStatus] = useState('');
  const [office, setOffice] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [tempPass, setTempPass] = useState(null);

  const list = usePagedList({
    key: 'examiners',
    source: 'v_examiners',
    searchCols: ['full_name', 'employee_no', 'username', 'phone'],
    filters: { status, office_id: office },
    order: ['full_name', true],
  });

  const resetPassword = async (e) => {
    const ok = await confirm({ title: 'إعادة تعيين كلمة المرور', text: `ستُنشأ كلمة مرور مؤقتة لحساب «${e.full_name}».`, okLabel: 'إعادة التعيين' });
    if (!ok) return;
    const res = await run(() => manageUsers({ action: 'reset_password', user_id: e.user_id }), 'أُنشئت كلمة مرور مؤقتة');
    if (res?.password) setTempPass({ name: e.full_name, username: e.username, password: res.password });
  };

  const toggleStatus = async (e) => {
    const deactivate = e.status === 'active';
    const ok = await confirm({
      title: deactivate ? 'إيقاف المحفّظ' : 'تفعيل المحفّظ',
      text: deactivate ? 'لن يتمكن من الدخول، ولن يظهر في قوائم التحويل. طلابه الحاليون يبقون محالين إليه حتى تعيد تحويلهم.' : 'سيتمكن من الدخول واستلام الطلبة.',
      okLabel: deactivate ? 'إيقاف' : 'تفعيل',
      danger: deactivate,
    });
    if (!ok) return;
    if (e.user_id) {
      await run(() => manageUsers({ action: 'set_status', user_id: e.user_id, status: deactivate ? 'inactive' : 'active' }), deactivate ? 'أُوقف المحفّظ' : 'فُعّل المحفّظ');
    } else {
      await run(async () => {
        const { error } = await supabase.from('examiners').update({ status: deactivate ? 'inactive' : 'active' }).eq('id', e.id);
        if (error) throw error;
      }, 'حُدّثت الحالة');
    }
  };

  return (
    <>
      <PageHeader title="المحفّظون" sub="إدارة حسابات المحفّظين وربطهم بالمكاتب."
        actions={<button className="btn" onClick={() => setEditing(null)}><Icon.plus /> إضافة محفّظ</button>} />
      <ListCard
        list={list}
        searchPlaceholder="ابحث باسم المحفّظ أو الرقم الوظيفي أو اسم المستخدم"
        filters={[
          { value: status, onChange: setStatus, options: mapOptions(ACCOUNT_STATUS), placeholder: 'كل الحالات' },
          { value: office, onChange: setOffice, options: rowsOptions(lookups?.offices), placeholder: 'كل المكاتب' },
        ]}
        emptyTitle="لا يوجد محفّظون"
        emptyText="أضف المحفّظين وأنشئ لهم حسابات دخول لاستلام الطلبة."
        exportName="المحفّظون"
        exportColumns={[
          { label: 'الاسم', value: (r) => r.full_name },
          { label: 'الرقم الوظيفي', value: (r) => r.employee_no },
          { label: 'اسم المستخدم', value: (r) => r.username },
          { label: 'الهاتف', value: (r) => r.phone },
          { label: 'المكتب', value: (r) => r.office_name },
          { label: 'التخصص', value: (r) => r.specialization },
          { label: 'طلابه الحاليون', value: (r) => r.active_students },
          { label: 'الحالة', value: (r) => ACCOUNT_STATUS[r.status]?.t },
        ]}
        columns={[
          { label: 'الاسم', render: (r) => r.full_name },
          { label: 'الرقم الوظيفي', className: 'num small', render: (r) => r.employee_no || '—' },
          { label: 'اسم المستخدم', className: 'num small', render: (r) => (r.username ? <span className="ltr">{r.username}</span> : <span className="muted">بلا حساب</span>) },
          { label: 'الهاتف', className: 'num small', render: (r) => <span className="ltr">{r.phone || '—'}</span> },
          { label: 'المكتب', className: 'small muted', render: (r) => r.office_name || '—' },
          { label: 'التخصص', className: 'small', render: (r) => r.specialization || '—' },
          { label: 'طلابه', className: 'num', render: (r) => r.active_students },
          { label: 'آخر دخول', className: 'small muted', render: (r) => fmtDateTime(r.last_sign_in_at) },
          { label: 'الحالة', render: (r) => <StatusBadge map={ACCOUNT_STATUS} value={r.status} /> },
          {
            label: 'الإجراءات',
            render: (r) => (
              <div className="acts">
                <button className="btn ghost sm" title="تعديل" onClick={() => setEditing(r)}><Icon.edit /></button>
                {r.user_id && <button className="btn ghost sm" onClick={() => resetPassword(r)}>كلمة المرور</button>}
                <button className="btn ghost sm" onClick={() => toggleStatus(r)}>{r.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>
              </div>
            ),
          },
        ]}
      />
      {editing !== undefined && <ExaminerForm examiner={editing} onClose={() => setEditing(undefined)} />}
      {tempPass && (
        <Modal title="كلمة مرور مؤقتة" onClose={() => setTempPass(null)} footer={<button className="btn teal" onClick={() => setTempPass(null)}>تم</button>}>
          <div className="alert ok mb">سلّمها للمحفّظ «{tempPass.name}» بطريقة آمنة، واطلب منه عدم مشاركتها.</div>
          <Kv items={[['اسم المستخدم', <span className="ltr num">{tempPass.username}</span>], ['كلمة المرور', <span className="ltr num">{tempPass.password}</span>]]} />
        </Modal>
      )}
    </>
  );
}
