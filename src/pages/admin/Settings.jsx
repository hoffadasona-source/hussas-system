import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logoMark from '../../assets/logo-mark.png';
import { Icon } from '../../components/icons';
import { Badge, ErrorBox, Field, Loading, Modal, PageHeader, Select, Tabs } from '../../components/ui';
import { useAction } from '../../components/workflow';
import NotificationSettings from './NotificationSettings';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useLookups, useSettings } from '../../hooks/data';
import { supabase } from '../../lib/supabase';
import { AGGREGATES, APPOINTMENT_MODES } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtDate } from '../../lib/format';

const TABS = [
  { key: 'org', label: 'معلومات الجهة' },
  { key: 'exam', label: 'الامتحان' },
  { key: 'cert', label: 'الشهادة' },
  { key: 'lists', label: 'القوائم والدورات' },
  { key: 'notify', label: 'الإشعارات' },
];

const LIST_TABLES = [
  ['offices', 'المكاتب'],
  ['levels', 'المستويات'],
  ['matns', 'المتون'],
];

function LookupEditor({ table, title, rows, canEdit }) {
  const run = useAction();
  const [editing, setEditing] = useState(undefined);
  const [f, setF] = useState({ name: '', sort_order: 0, active: true });

  const open = (row) => {
    setEditing(row);
    setF(row ? { name: row.name, sort_order: row.sort_order, active: row.active } : { name: '', sort_order: (rows.at(-1)?.sort_order || 0) + 1, active: true });
  };
  const save = async () => {
    if (!f.name.trim()) return;
    const payload = { name: f.name.trim(), sort_order: Number(f.sort_order) || 0, active: f.active };
    const ok = await run(async () => {
      const { error } = editing ? await supabase.from(table).update(payload).eq('id', editing.id) : await supabase.from(table).insert(payload);
      if (error) throw error;
    }, 'حُفظ');
    if (ok) setEditing(undefined);
  };

  return (
    <div className="card flat">
      <div className="card-h">
        <h3>{title} ({rows.filter((r) => r.active).length})</h3>
        {canEdit && <button className="btn ghost sm" onClick={() => open(null)}><Icon.plus /> إضافة</button>}
      </div>
      <div className="card-b" style={{ padding: 14 }}>
        <div className="chips">
          {rows.map((r) => (
            <button key={r.id} className={`chip-opt ${r.active ? '' : 'muted'}`} style={{ textDecoration: r.active ? 'none' : 'line-through' }}
              onClick={() => canEdit && open(r)} disabled={!canEdit} title={r.active ? '' : 'موقوف'}>
              {r.name}
            </button>
          ))}
        </div>
        <p className="hint">العناصر الموقوفة لا تظهر في نموذج التسجيل، وتبقى الطلبات السابقة كما هي.</p>
      </div>
      {editing !== undefined && (
        <Modal title={editing ? `تعديل — ${editing.name}` : `إضافة إلى ${title}`} onClose={() => setEditing(undefined)}
          footer={<><button className="btn teal" onClick={save}>حفظ</button><button className="btn ghost" onClick={() => setEditing(undefined)}>إلغاء</button></>}>
          <Field label="الاسم" required><input className="inp" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="الترتيب"><input className="inp" type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> فعّال</label>
        </Modal>
      )}
    </div>
  );
}

function CyclesEditor({ cycles, canEdit }) {
  const run = useAction();
  const { confirm } = useUi();
  const [editing, setEditing] = useState(undefined);
  const [f, setF] = useState({});

  const open = (c) => {
    setEditing(c);
    setF(c ? { name: c.name, starts_on: c.starts_on || '', ends_on: c.ends_on || '', registration_open: c.registration_open }
      : { name: '', starts_on: '', ends_on: '', registration_open: true });
  };
  const save = async () => {
    if (!f.name.trim()) return;
    const payload = { name: f.name.trim(), starts_on: f.starts_on || null, ends_on: f.ends_on || null, registration_open: f.registration_open };
    const ok = await run(async () => {
      const { error } = editing ? await supabase.from('cycles').update(payload).eq('id', editing.id) : await supabase.from('cycles').insert(payload);
      if (error) throw error;
    }, 'حُفظت الدورة');
    if (ok) setEditing(undefined);
  };
  const makeCurrent = async (c) => {
    if (!(await confirm({ title: 'تعيين الدورة الحالية', text: `ستُسجَّل الطلبات الجديدة في «${c.name}».`, okLabel: 'تعيين' }))) return;
    run(async () => {
      const off = await supabase.from('cycles').update({ is_current: false }).eq('is_current', true);
      if (off.error) throw off.error;
      const on = await supabase.from('cycles').update({ is_current: true }).eq('id', c.id);
      if (on.error) throw on.error;
    }, 'عُيّنت الدورة الحالية');
  };

  return (
    <div className="card flat">
      <div className="card-h">
        <h3>الدورات</h3>
        {canEdit && <button className="btn ghost sm" onClick={() => open(null)}><Icon.plus /> دورة جديدة</button>}
      </div>
      <div className="tbl-wrap cards"><table className="tbl">
        <thead><tr><th>الدورة</th><th>من</th><th>إلى</th><th>التسجيل</th><th /></tr></thead>
        <tbody>{cycles.map((c) => (
          <tr key={c.id}>
            <td>{c.name} {c.is_current && <Badge kind="teal">الحالية</Badge>}</td>
            <td className="num small">{fmtDate(c.starts_on)}</td><td className="num small">{fmtDate(c.ends_on)}</td>
            <td>{c.registration_open ? <Badge kind="ok">مفتوح</Badge> : <Badge kind="err">مغلق</Badge>}</td>
            <td>{canEdit && <div className="acts">
              <button className="btn ghost sm" onClick={() => open(c)}><Icon.edit /></button>
              {!c.is_current && <button className="btn ghost sm" onClick={() => makeCurrent(c)}>تعيين حالية</button>}
            </div>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {editing !== undefined && (
        <Modal title={editing ? 'تعديل الدورة' : 'دورة جديدة'} onClose={() => setEditing(undefined)}
          footer={<><button className="btn teal" onClick={save}>حفظ</button><button className="btn ghost" onClick={() => setEditing(undefined)}>إلغاء</button></>}>
          <Field label="اسم الدورة" required><input className="inp" placeholder="مثال: دورة ١٤٤٩ هـ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="f2">
            <Field label="تبدأ"><input className="inp" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field>
            <Field label="تنتهي"><input className="inp" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={f.registration_open} onChange={(e) => setF({ ...f, registration_open: e.target.checked })} /> التسجيل مفتوح</label>
        </Modal>
      )}
    </div>
  );
}

export default function Settings() {
  const { isSuper, profile } = useAuth();
  const { toast } = useUi();
  const qc = useQueryClient();
  const { data: settings, isLoading, error } = useSettings();
  const { data: lookups } = useLookups();
  const [tab, setTab] = useState('org');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) setF(settings);
  }, [settings]);

  if (isLoading || (!f && !error)) return <Loading />;
  if (error) return <ErrorBox error={errorMessage(error)} />;

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const dis = !isSuper;

  const save = async () => {
    if (!f.org_name?.trim()) return toast('اسم الجهة مطلوب', 'err');
    if (!(Number(f.exam_base) > 0)) return toast('الدرجة الأساسية يجب أن تكون أكبر من صفر', 'err');
    if (!(Number(f.exam_questions) >= 1 && Number(f.exam_questions) <= 10)) return toast('عدد الأسئلة بين 1 و10', 'err');
    setBusy(true);
    const { error: err } = await supabase.from('settings').update({
      org_name: f.org_name.trim(), org_phone: f.org_phone || null, org_email: f.org_email || null, org_address: f.org_address || null,
      work_hours: f.work_hours || null, exam_base: Number(f.exam_base), exam_questions: Number(f.exam_questions),
      exam_aggregate: f.exam_aggregate, exam_mode: f.exam_mode, cert_prefix: f.cert_prefix, cert_digits: Number(f.cert_digits),
      cert_title: f.cert_title, cert_signer_name: f.cert_signer_name || null, cert_signer_title: f.cert_signer_title || null,
      cert_show_qr: f.cert_show_qr, updated_at: new Date().toISOString(), updated_by: profile.id,
    }).eq('id', 1);
    setBusy(false);
    if (err) return toast(errorMessage(err), 'err');
    toast('حُفظت الإعدادات');
    qc.invalidateQueries({ queryKey: ['settings'] });
  };

  const showSave = ['org', 'exam', 'cert'].includes(tab) && isSuper;

  return (
    <>
      <PageHeader title="الإعدادات" sub="بيانات الجهة، إعدادات الامتحان والشهادة، والقوائم المرجعية." />
      {!isSuper && <div className="alert mb">عرض فقط — تعديل الإعدادات من صلاحية مدير النظام.</div>}
      <div className="card">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="card-b">
          {tab === 'org' && (
            <>
              <div className="f2">
                <Field label="اسم الجهة" required><input className="inp" disabled={dis} value={f.org_name || ''} onChange={set('org_name')} /></Field>
                <Field label="الهاتف"><input className="inp ltr" disabled={dis} value={f.org_phone || ''} onChange={set('org_phone')} /></Field>
                <Field label="البريد"><input className="inp ltr" disabled={dis} value={f.org_email || ''} onChange={set('org_email')} /></Field>
                <Field label="العنوان"><input className="inp" disabled={dis} value={f.org_address || ''} onChange={set('org_address')} /></Field>
                <Field label="أوقات العمل" className="full"><input className="inp" disabled={dis} value={f.work_hours || ''} onChange={set('work_hours')} /></Field>
              </div>
              <div className="row" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: 14 }}>
                <img src={logoMark} style={{ height: 56 }} alt="" />
                <div>
                  <div style={{ fontWeight: 500 }}>شعار الجهة</div>
                  <div className="small muted">يظهر في الموقع العام، ولوحات التحكم، والشهادات. لاستبداله ضع الملف الجديد في <span className="ltr">src/assets</span>.</div>
                </div>
              </div>
            </>
          )}

          {tab === 'exam' && (
            <>
              <div className="f2">
                <Field label="الدرجة الأساسية للسؤال"><input className="inp" type="number" min="1" disabled={dis} value={f.exam_base} onChange={set('exam_base')} /></Field>
                <Field label="عدد أسئلة الجلسة"><input className="inp" type="number" min="1" max="10" disabled={dis} value={f.exam_questions} onChange={set('exam_questions')} /></Field>
                <Field label="تجميع نتيجة الجلسة">
                  <Select disabled={dis} value={f.exam_aggregate} onChange={set('exam_aggregate')} options={Object.entries(AGGREGATES).map(([value, label]) => ({ value, label }))} />
                </Field>
                <Field label="نمط الجلسة الافتراضي">
                  <Select disabled={dis} value={f.exam_mode} onChange={set('exam_mode')} options={Object.entries(APPOINTMENT_MODES).map(([value, label]) => ({ value, label }))} />
                </Field>
              </div>
              <p className="hint">درجات المعايير (مثل الصوت) ومعاملات خصمها تُدار من صفحة «معايير التقييم». الدرجة النهائية محصورة دائماً بين 0 و100، وتُطبَّق التعديلات على الجلسات الجديدة فقط.</p>
            </>
          )}

          {tab === 'cert' && (
            <>
              <div className="f2">
                <Field label="عنوان الشهادة" className="full"><input className="inp" disabled={dis} value={f.cert_title || ''} onChange={set('cert_title')} /></Field>
                <Field label="بادئة الترقيم" hint="{YYYY} تُستبدل بالسنة الحالية."><input className="inp ltr" disabled={dis} value={f.cert_prefix} onChange={set('cert_prefix')} /></Field>
                <Field label="عدد الخانات"><input className="inp" type="number" min="3" max="10" disabled={dis} value={f.cert_digits} onChange={set('cert_digits')} /></Field>
                <Field label="اسم الموقّع"><input className="inp" disabled={dis} placeholder="كما يظهر أسفل الشهادة" value={f.cert_signer_name || ''} onChange={set('cert_signer_name')} /></Field>
                <Field label="صفة الموقّع"><input className="inp" disabled={dis} placeholder="مثال: مدير البرنامج" value={f.cert_signer_title || ''} onChange={set('cert_signer_title')} /></Field>
              </div>
              <label className="check"><input type="checkbox" disabled={dis} checked={f.cert_show_qr} onChange={set('cert_show_qr')} /> إضافة رمز QR للتحقق من الشهادة</label>
              <p className="hint">مثال على رقم الشهادة التالية: <span className="ltr num">{String(f.cert_prefix).replace('{YYYY}', new Date().getFullYear())}{'1'.padStart(Number(f.cert_digits) || 5, '0')}</span></p>
            </>
          )}

          {tab === 'lists' && lookups && (
            <div className="grid">
              <CyclesEditor cycles={lookups.cycles} canEdit={isSuper} />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
                {LIST_TABLES.map(([table, title]) => (
                  <LookupEditor key={table} table={table} title={title} rows={lookups[table]} canEdit={isSuper} />
                ))}
              </div>
            </div>
          )}

          {tab === 'notify' && <NotificationSettings canEdit={isSuper} />}
        </div>
        {showSave && (
          <div className="card-f">
            <button className="btn teal" onClick={save} disabled={busy}>{busy && <span className="spinner" />} حفظ التغييرات</button>
            <button className="btn ghost" onClick={() => setF(settings)} disabled={busy}>تراجع</button>
          </div>
        )}
      </div>
    </>
  );
}
