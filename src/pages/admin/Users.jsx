import { useState } from 'react';
import { Navigate } from 'react-router';
import ListCard from '../../components/ListCard';
import { Icon } from '../../components/icons';
import { Field, Kv, Modal, PageHeader, Select, StatusBadge, mapOptions } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useLookups, usePagedList } from '../../hooks/data';
import { displayUsername, manageUsers, usernameError } from '../../lib/supabase';
import { ACCOUNT_STATUS, ROLES } from '../../lib/constants';
import { fmtDateTime } from '../../lib/format';

const MATRIX = [
  ['مراجعة الطلبات وقبولها', '✓', '✓', '—'],
  ['تحويل الطالب لمحفّظ', '✓', '✓', '—'],
  ['تحديد المواعيد', '✓', '✓', 'طلابه فقط'],
  ['إجراء الامتحان واعتماد المحفّظ', '—', '—', '✓'],
  ['الاعتماد النهائي للنتائج', '✓', 'حسب الصلاحية', '—'],
  ['إصدار الشهادات', '✓', 'حسب الصلاحية', '—'],
  ['إلغاء شهادة / إعادة فتح نتيجة معتمدة', '✓', '—', '—'],
  ['إدارة حسابات المحفّظين', '✓', '✓', '—'],
  ['إدارة أساس التحكيم والإعدادات', '✓', 'قراءة', '—'],
  ['المستخدمون والصلاحيات', '✓', '—', '—'],
  ['التقارير وسجل العمليات', '✓', '✓', '—'],
];

function UserModal({ user, onClose }) {
  const { data: lookups } = useLookups();
  const run = useAction();
  const isNew = !user;
  const [f, setF] = useState({
    full_name: user?.full_name || '', username: user?.username || '', password: '', role: user?.role || 'admin',
    can_final_approve: user?.can_final_approve ?? false, can_issue_certificates: user?.can_issue_certificates ?? false,
    office_id: '', employee_no: '', phone: '',
  });
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const save = async () => {
    if (!f.full_name.trim()) return setErr('الاسم مطلوب.');
    if (isNew && usernameError(f.username)) return setErr(usernameError(f.username));
    if (isNew && f.password && f.password.length < 8) return setErr('كلمة المرور 8 أحرف على الأقل.');
    setBusy(true);
    const res = await run(() => manageUsers(isNew
      ? {
        action: 'create_user', full_name: f.full_name, username: displayUsername(f.username), password: f.password || undefined,
        role: f.role, can_final_approve: f.can_final_approve, can_issue_certificates: f.can_issue_certificates,
        examiner: f.role === 'examiner' ? { office_id: f.office_id || null, employee_no: f.employee_no || null, phone: f.phone || null } : undefined,
      }
      : { action: 'update_user', user_id: user.id, full_name: f.full_name, role: f.role, can_final_approve: f.can_final_approve, can_issue_certificates: f.can_issue_certificates }),
    isNew ? 'أُنشئ الحساب' : 'حُفظت الصلاحيات');
    setBusy(false);
    if (!res) return;
    if (res.password) setCreated(res);
    else onClose();
  };

  if (created) {
    return (
      <Modal title="تم إنشاء الحساب" onClose={onClose} footer={<button className="btn teal" onClick={onClose}>تم</button>}>
        <div className="alert ok mb">سلّم بيانات الدخول بطريقة آمنة. لن تظهر كلمة المرور مرة أخرى، ولن يُطلب من صاحب الحساب تغييرها.</div>
        <Kv items={[['اسم المستخدم', <bdi>{created.username}</bdi>], ['كلمة المرور', <span className="ltr num">{created.password}</span>]]} />
      </Modal>
    );
  }

  return (
    <Modal title={isNew ? 'مستخدم جديد' : 'تعديل الصلاحيات'} onClose={onClose}
      footer={<><button className="btn teal" onClick={save} disabled={busy}>{busy && <span className="spinner" />} حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert err mb">{err}</div>}
      <div className="f2">
        <Field label="الاسم الكامل" required><input className="inp" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="الدور" required>
          <Select value={f.role} onChange={set('role')} disabled={!isNew && user.role === 'examiner'}
            options={Object.entries(ROLES).filter(([k]) => isNew || user.role === 'examiner' || k !== 'examiner').map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="اسم المستخدم" required={isNew} hint={isNew ? 'يُكتب بالعربية أو اللاتينية، مثل: عبدالرحيم أحمد شيتة' : undefined}>
          <input className="inp" disabled={!isNew} placeholder="عبدالرحيم أحمد شيتة" value={f.username} onChange={set('username')} />
        </Field>
        {isNew && (
          <Field label="كلمة المرور" hint="هي كلمة الدخول النهائية. اتركها فارغة لتوليد كلمة عشوائية.">
            <input className="inp ltr" autoComplete="new-password" value={f.password} onChange={set('password')} />
          </Field>
        )}
        {isNew && f.role === 'examiner' && <>
          <Field label="المكتب">
            <Select value={f.office_id} onChange={set('office_id')} placeholder="اختر المكتب" options={(lookups?.offices || []).map((o) => ({ value: o.id, label: o.name }))} />
          </Field>
          <Field label="الرقم الوظيفي"><input className="inp ltr" value={f.employee_no} onChange={set('employee_no')} /></Field>
        </>}
      </div>
      {f.role === 'admin' && (
        <div className="card flat"><div className="card-b" style={{ padding: 14 }}>
          <div className="small muted mb-s">صلاحيات إضافية للإداري</div>
          <label className="check" style={{ display: 'flex' }}><input type="checkbox" checked={f.can_final_approve} onChange={set('can_final_approve')} /> الاعتماد النهائي للنتائج</label>
          <label className="check mt-s" style={{ display: 'flex' }}><input type="checkbox" checked={f.can_issue_certificates} onChange={set('can_issue_certificates')} /> إصدار الشهادات</label>
        </div></div>
      )}
    </Modal>
  );
}

export default function Users() {
  const { isSuper, profile } = useAuth();
  const { confirm } = useUi();
  const run = useAction();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [tempPass, setTempPass] = useState(null);

  const list = usePagedList({
    key: 'users',
    source: 'profiles',
    searchCols: ['full_name', 'username'],
    filters: { role, status },
    order: ['created_at', true],
    enabled: isSuper,
  });

  if (!isSuper) return <Navigate to="/admin" replace />;

  const reset = async (u) => {
    if (!(await confirm({ title: 'إعادة تعيين كلمة المرور', text: `ستُنشأ كلمة مرور جديدة نهائية لحساب «${u.full_name}».`, okLabel: 'إعادة التعيين' }))) return;
    const res = await run(() => manageUsers({ action: 'reset_password', user_id: u.id }), 'أُنشئت كلمة مرور جديدة');
    if (res?.password) setTempPass({ ...u, password: res.password });
  };
  const toggle = async (u) => {
    const off = u.status === 'active';
    if (!(await confirm({ title: off ? 'إيقاف الحساب' : 'تفعيل الحساب', text: off ? 'لن يتمكن صاحب الحساب من الدخول.' : 'سيتمكن صاحب الحساب من الدخول.', okLabel: off ? 'إيقاف' : 'تفعيل', danger: off }))) return;
    run(() => manageUsers({ action: 'set_status', user_id: u.id, status: off ? 'inactive' : 'active' }), off ? 'أُوقف الحساب' : 'فُعّل الحساب');
  };

  const perms = (u) => u.role === 'admin'
    ? [u.can_final_approve && 'الاعتماد', u.can_issue_certificates && 'الشهادات'].filter(Boolean).join(' · ') || '—'
    : u.role === 'super_admin' ? 'كل الصلاحيات' : '—';

  return (
    <>
      <PageHeader title="المستخدمون والصلاحيات" sub="حسابات الدخول وتوزيع الصلاحيات على الأدوار."
        actions={<button className="btn" onClick={() => setEditing(null)}><Icon.plus /> مستخدم جديد</button>} />
      <ListCard
        list={list}
        searchPlaceholder="ابحث بالاسم أو اسم المستخدم"
        filters={[
          { value: role, onChange: setRole, options: Object.entries(ROLES).map(([value, label]) => ({ value, label })), placeholder: 'كل الأدوار' },
          { value: status, onChange: setStatus, options: mapOptions(ACCOUNT_STATUS), placeholder: 'كل الحالات' },
        ]}
        columns={[
          { label: 'الاسم', render: (u) => u.full_name },
          { label: 'اسم المستخدم', className: 'small', render: (u) => <bdi>{u.username}</bdi> },
          { label: 'الدور', render: (u) => ROLES[u.role] },
          { label: 'صلاحيات إضافية', className: 'small muted', render: perms },
          { label: 'الحالة', render: (u) => <StatusBadge map={ACCOUNT_STATUS} value={u.status} /> },
          { label: 'آخر دخول', className: 'small muted', render: (u) => fmtDateTime(u.last_sign_in_at) },
          {
            label: '',
            render: (u) => (
              <div className="acts">
                <button className="btn ghost sm" title="تعديل" onClick={() => setEditing(u)}><Icon.edit /></button>
                <button className="btn ghost sm" onClick={() => reset(u)}>كلمة المرور</button>
                {u.id !== profile.id && <button className="btn ghost sm" onClick={() => toggle(u)}>{u.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>}
              </div>
            ),
          },
        ]}
      />
      <div className="card mt">
        <div className="card-h"><h3>مصفوفة الصلاحيات</h3></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>العملية</th><th>مدير النظام</th><th>إداري</th><th>محفّظ</th></tr></thead>
          <tbody>{MATRIX.map((m) => (
            <tr key={m[0]}><td>{m[0]}</td>{m.slice(1).map((v, i) => <td key={i} className={v === '✓' ? '' : 'muted small'}>{v}</td>)}</tr>
          ))}</tbody>
        </table></div>
      </div>
      {editing !== undefined && <UserModal user={editing} onClose={() => setEditing(undefined)} />}
      {tempPass && (
        <Modal title="كلمة المرور الجديدة" onClose={() => setTempPass(null)} footer={<button className="btn teal" onClick={() => setTempPass(null)}>تم</button>}>
          <div className="alert ok mb">سلّمها لصاحب الحساب «{tempPass.full_name}» بطريقة آمنة. هي كلمة الدخول النهائية.</div>
          <Kv items={[['اسم المستخدم', <bdi>{tempPass.username}</bdi>], ['كلمة المرور', <span className="ltr num">{tempPass.password}</span>]]} />
        </Modal>
      )}
    </>
  );
}
