import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logoMark from '../../assets/logo-mark.png';
import CertificateLayoutEditor, { uploadBrandingFile } from '../../components/CertificateLayoutEditor';
import { Icon } from '../../components/icons';
import { ErrorBox, Field, Loading, Modal, PageHeader, Select, Tabs } from '../../components/ui';
import { useAction } from '../../components/workflow';
import NotificationSettings from './NotificationSettings';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useLookups, useSettings } from '../../hooks/data';
import { rpc, supabase } from '../../lib/supabase';
import { AGGREGATES, APPOINTMENT_MODES } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';

const TABS = [
  { key: 'org', label: 'معلومات الجهة' },
  { key: 'exam', label: 'الامتحان' },
  { key: 'cert', label: 'الشهادة' },
  { key: 'lists', label: 'القوائم المرجعية' },
  { key: 'notify', label: 'الإشعارات' },
];

const LIST_TABLES = [
  ['offices', 'المكاتب'],
  ['levels', 'المستويات'],
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

/** شعار الجهة: رفع صورة وتحديد حجمها، ويظهر الأثر في كل الواجهات بعد الحفظ */
function LogoEditor({ value, onChange, canEdit }) {
  const { toast } = useUi();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const scale = Number(value.logo_scale ?? 1) || 1;

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toast('حجم الصورة أكبر من 4 ميجابايت', 'err');
    setBusy(true);
    try {
      onChange({ logo_url: await uploadBrandingFile(file, 'logo') });
      toast('رُفع الشعار — احفظ التغييرات ليظهر في الموقع');
    } catch (err) {
      toast(errorMessage(err), 'err');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="card flat">
      <div className="card-h"><h3>شعار الجهة</h3></div>
      <div className="card-b" style={{ padding: 14 }}>
        <div className="row" style={{ alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', placeItems: 'center', minWidth: 120, minHeight: 100, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: 10 }}>
            <img src={value.logo_url || logoMark} alt="معاينة الشعار" style={{ height: 56 * scale, maxWidth: 220, objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Field label={`حجم الشعار: ${scale.toFixed(2)}×`} hint="يؤثر على شعار الموقع العام ولوحات التحكم.">
              <input className="inp" type="range" min="0.5" max="2.5" step="0.05" disabled={!canEdit}
                value={scale} onChange={(e) => onChange({ logo_scale: Number(e.target.value) })} />
            </Field>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
                onChange={(e) => upload(e.target.files?.[0])} />
              <button className="btn ghost sm" disabled={!canEdit || busy} onClick={() => fileRef.current?.click()}>
                {busy ? <span className="spinner" /> : <Icon.plus />} رفع شعار
              </button>
              {value.logo_url && (
                <button className="btn ghost sm" disabled={!canEdit} onClick={() => onChange({ logo_url: null })}>الشعار الافتراضي</button>
              )}
              <button className="btn ghost sm" disabled={!canEdit} onClick={() => onChange({ logo_scale: 1 })}>حجم افتراضي</button>
            </div>
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>الصيغ المقبولة: PNG · JPG · WEBP · SVG. يظهر الشعار في الموقع العام ولوحات التحكم والشهادة المدمجة.</p>
      </div>
    </div>
  );
}

/** استيراد المكاتب دفعةً واحدة: اسم في كل سطر */
function OfficesImport({ canEdit }) {
  const run = useAction();
  const { toast } = useUi();
  const [text, setText] = useState('');
  const [deactivate, setDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const names = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!names.length) return toast('أدخل اسم مكتب واحد على الأقل', 'err');
    setBusy(true);
    const res = await run(() => rpc('import_offices', { p_names: names, p_deactivate_missing: deactivate }));
    setBusy(false);
    if (res) {
      toast(`أُضيف ${res.added} · حُدّث ${res.updated}${res.deactivated ? ` · عُطّل ${res.deactivated}` : ''}`);
      setText('');
    }
  };

  return (
    <div className="card flat">
      <div className="card-h"><h3>استيراد المكاتب</h3></div>
      <div className="card-b" style={{ padding: 14 }}>
        <Field label="أسماء المكاتب — اسم في كل سطر"
          hint="الموجود يُحدَّث ترتيبه ويُفعَّل، والجديد يُضاف. لا يُحذف أي مكتب حفاظاً على الطلبات المرتبطة به.">
          <textarea className="inp" rows={6} disabled={!canEdit} placeholder={'مكتب أوقاف طرابلس المركز\nمكتب أوقاف تاجوراء'}
            value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" disabled={!canEdit} checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
          تعطيل المكاتب غير المذكورة في القائمة
        </label>
        <div className="row mt-s">
          <button className="btn teal sm" disabled={!canEdit || busy || !names.length} onClick={save}>
            {busy && <span className="spinner" />} استيراد {names.length ? `(${names.length})` : ''}
          </button>
        </div>
      </div>
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
      cert_show_qr: f.cert_show_qr, registration_open: f.registration_open !== false,
      logo_url: f.logo_url || null, logo_scale: Number(f.logo_scale) || 1,
      cert_bg_pdf_url: f.cert_bg_pdf_url || null, cert_layout_config: f.cert_layout_config || {},
      updated_at: new Date().toISOString(), updated_by: profile.id,
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
              <LogoEditor value={f} onChange={(patch) => setF((x) => ({ ...x, ...patch }))} canEdit={isSuper} />
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
              <label className="check"><input type="checkbox" disabled={dis} checked={f.registration_open !== false} onChange={set('registration_open')} /> التسجيل مفتوح للطلبة الجدد</label>
              <p className="hint">البرنامج مستمر بلا دورات؛ وإغلاق التسجيل هنا يوقف استقبال الطلبات من الموقع العام (والإداري يستطيع الإضافة دائماً).</p>
              <p className="hint">المعايير (مثل الصوت والأداء) والخصميات تُدار من صفحة «أساس التحكيم». الدرجة النهائية محصورة دائماً بين 0 و100، وتُطبَّق التعديلات على الجلسات الجديدة فقط.</p>
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
              <div className="card flat mt">
                <div className="card-h"><h3>قالب الشهادة</h3></div>
                <div className="card-b" style={{ padding: 14 }}>
                  <CertificateLayoutEditor value={f} onChange={(patch) => setF((x) => ({ ...x, ...patch }))} canEdit={isSuper} />
                </div>
              </div>
            </>
          )}

          {tab === 'lists' && lookups && (
            <div className="grid">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
                {LIST_TABLES.map(([table, title]) => (
                  <LookupEditor key={table} table={table} title={title} rows={lookups[table]} canEdit={isSuper} />
                ))}
                <OfficesImport canEdit={isSuper} />
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
