import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Field } from './ui';
import { CertificateTemplateView, useCertificateTemplate } from './CertificateView';
import { useUi } from '../context/UiContext';
import { supabase } from '../lib/supabase';
import { CERT_FIELDS, SAMPLE_CERT, defaultLayout, mergeLayout } from '../lib/certificate';
import { errorMessage } from '../lib/helpers';

const BUCKET = 'branding';
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** يرفع ملفاً إلى مخزن الهوية ويعيد رابطه العام */
export async function uploadBrandingFile(file, folder) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * محرر قالب الشهادة: رفع ملف PDF (أو صورة) وتحديد إحداثيات كل حقل فوقه
 * بالسحب أو بالأرقام. القيم نِسَب مئوية، فتُطبع كما تُعرض تماماً.
 */
export default function CertificateLayoutEditor({ value, onChange, canEdit }) {
  const { toast } = useUi();
  const url = value.cert_bg_pdf_url || '';
  const { image, loading, error } = useCertificateTemplate(url);
  const layout = mergeLayout(value.cert_layout_config);
  const [selected, setSelected] = useState('student_name');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const drag = useRef(null);

  const conf = layout.fields[selected];
  const setLayout = (next) => onChange({ cert_layout_config: next });
  const setField = (key, patch) =>
    setLayout({ ...layout, fields: { ...layout.fields, [key]: { ...layout.fields[key], ...patch } } });

  // مقاس الصفحة يُؤخذ من الملف المرفوع نفسه، ليُطبع بالمقاس الصحيح
  useEffect(() => {
    if (!image || !canEdit) return;
    if (layout.page.w === image.page.w && layout.page.h === image.page.h) return;
    setLayout({ ...layout, page: image.page });
  }, [image]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('حجم الملف أكبر من 10 ميجابايت', 'err');
    setBusy(true);
    try {
      const publicUrl = await uploadBrandingFile(file, 'certificate');
      onChange({ cert_bg_pdf_url: publicUrl });
      toast('رُفع القالب — حدّد مواضع الحقول ثم احفظ');
    } catch (err) {
      toast(errorMessage(err), 'err');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // السحب داخل القالب: النسبة تُحسب من حدود القالب نفسه فلا يتأثر بالتصغير
  const onFieldPointerDown = (e, key) => {
    if (!canEdit) return;
    e.preventDefault();
    setSelected(key);
    const box = e.currentTarget.parentElement.getBoundingClientRect();
    drag.current = { key, box };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setField(d.key, {
      x: Math.round(clamp(((e.clientX - d.box.left) / d.box.width) * 100, 0, 100) * 10) / 10,
      y: Math.round(clamp(((e.clientY - d.box.top) / d.box.height) * 100, 0, 100) * 10) / 10,
    });
  };
  const endDrag = () => { drag.current = null; };

  return (
    <>
      <div className="row mb" style={{ flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => upload(e.target.files?.[0])} />
        <button className="btn" disabled={!canEdit || busy} onClick={() => fileRef.current?.click()}>
          {busy ? <span className="spinner" /> : <Icon.plus />} {url ? 'استبدال القالب' : 'رفع قالب PDF أو صورة'}
        </button>
        {url && (
          <>
            <a className="btn ghost" href={url} target="_blank" rel="noreferrer">فتح الملف</a>
            <button className="btn ghost" disabled={!canEdit} onClick={() => onChange({ cert_bg_pdf_url: null })}>إزالة القالب</button>
            <button className="btn ghost" disabled={!canEdit}
              onClick={() => setLayout(defaultLayout(layout.page))}>إعادة المواضع الافتراضية</button>
          </>
        )}
      </div>

      {!url && (
        <div className="alert">
          لم يُرفع قالب بعد، وتُطبع الشهادات بالتصميم المدمج. ارفع ملف الشهادة (PDF من المصمم أو صورة عالية الدقة)
          ثم اسحب كل حقل إلى موضعه على القالب.
        </div>
      )}
      {error && <div className="alert err">{error}</div>}
      {loading && <div className="skel" style={{ height: 260 }} />}

      {url && image && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(260px,1fr)', alignItems: 'start', gap: 16 }}>
          <div onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <CertificateTemplateView
              cert={SAMPLE_CERT} settings={value} image={image} layout={layout}
              selected={selected} onFieldPointerDown={canEdit ? onFieldPointerDown : undefined} />
            <p className="hint">
              مقاس القالب: <span className="ltr num">{layout.page.w} × {layout.page.h} pt</span> — تُطبع الشهادة بهذا المقاس تماماً.
              اسحب الحقل بالفأرة أو الإصبع، أو اضبط الأرقام يميناً.
            </p>
          </div>

          <div className="card flat">
            <div className="card-b" style={{ padding: 14 }}>
              <div className="tpl-pick">
                {CERT_FIELDS.map((f) => (
                  <button key={f.key} type="button" className={`chip-opt ${selected === f.key ? 'on' : ''}`}
                    style={{ opacity: layout.fields[f.key].show ? 1 : 0.5 }} onClick={() => setSelected(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="check mb">
                <input type="checkbox" disabled={!canEdit} checked={conf.show}
                  onChange={(e) => setField(selected, { show: e.target.checked })} /> إظهار هذا الحقل على الشهادة
              </label>
              <div className="f2">
                <Field label="X: من يسار القالب %"><input className="inp" type="number" min="0" max="100" step="0.5" disabled={!canEdit}
                  value={conf.x} onChange={(e) => setField(selected, { x: Number(e.target.value) })} /></Field>
                <Field label="Y: من أعلى القالب %"><input className="inp" type="number" min="0" max="100" step="0.5" disabled={!canEdit}
                  value={conf.y} onChange={(e) => setField(selected, { y: Number(e.target.value) })} /></Field>
                <Field label={selected === 'qr' ? 'حجم الرمز (pt)' : 'حجم الخط (pt)'}>
                  <input className="inp" type="number" min="6" max="120" step="1" disabled={!canEdit}
                    value={conf.size} onChange={(e) => setField(selected, { size: Number(e.target.value) })} />
                </Field>
                <Field label="اللون"><input className="inp" type="color" disabled={!canEdit}
                  value={conf.color} onChange={(e) => setField(selected, { color: e.target.value })} /></Field>
                {selected !== 'qr' && (
                  <Field label="سماكة الخط">
                    <input className="inp" type="range" min="400" max="700" step="100" disabled={!canEdit}
                      value={conf.weight} onChange={(e) => setField(selected, { weight: Number(e.target.value) })} />
                  </Field>
                )}
              </div>
              <p className="hint" style={{ marginBottom: 0 }}>
                البيانات المعروضة تجريبية للمعاينة فقط. تُطبع الشهادة الحقيقية ببيانات الطالب من نفس المواضع.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
