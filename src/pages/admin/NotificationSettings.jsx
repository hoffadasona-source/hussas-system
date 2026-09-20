import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/icons';
import { Badge, Empty, Field, Modal, Select, Skeleton } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useUi } from '../../context/UiContext';
import { useSettings } from '../../hooks/data';
import { rpc, sendMessages, supabase } from '../../lib/supabase';
import { CHANNELS, TEMPLATE_VARS } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { appUrl } from '../../lib/format';

const SAMPLE = {
  org_name: 'برنامج حُفّاظ السُّنة', org_phone: '021 000 0000', student_name: 'محمد أحمد عبدالله الشريف', first_name: 'محمد',
  reg_no: 'REG-2026-00001', student_no: 'STU-2026-00001', level: 'المستوى الأول', cycle: 'دورة ١٤٤٨ هـ',
  office: 'مكتب طرابلس المركز', examiner: 'عبدالسلام الفيتوري', date: '2026-09-20', time: '10:00', place: 'غرفة صوتية — واتساب',
  location: 'https://chat.whatsapp.com/…', appointment_notes: '', rejection_reason: 'نقص في بيانات الحلقة', score: '93.5',
  grade: 'ممتاز', cert_no: 'CERT-2026-00001', track_link: '{site}/application-status?q=REG-2026-00001', result_link: '{site}/result',
  verify_link: '{site}/certificate-verification?no=CERT-2026-00001',
};

/** مطابقة لـ public.render_template في قاعدة البيانات */
function render(body, params) {
  let r = body;
  for (const [k, v] of Object.entries(params)) r = r.split(`{{${k}}}`).join(v ?? '');
  return r.replace(/\{\{[a-z_]+\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function TemplateModal({ template, siteUrl, onClose }) {
  const run = useAction();
  const ref = useRef(null);
  const [f, setF] = useState({
    body: template.body, enabled: template.enabled, whatsapp_template: template.whatsapp_template || '',
    whatsapp_params: (template.whatsapp_params || []).join(', '),
  });
  const [err, setErr] = useState('');

  const insertVar = (key) => {
    const el = ref.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? f.body.length;
    const end = el?.selectionEnd ?? f.body.length;
    const body = f.body.slice(0, start) + token + f.body.slice(end);
    setF({ ...f, body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!f.body.trim()) return setErr('نص الرسالة مطلوب.');
    const params = f.whatsapp_params.split(/[,،\s]+/).map((s) => s.trim()).filter(Boolean);
    const unknown = params.filter((p) => !TEMPLATE_VARS[p]);
    if (unknown.length) return setErr(`متغيرات غير معروفة في قالب واتساب: ${unknown.join('، ')}`);
    const ok = await run(async () => {
      const { error } = await supabase.from('message_templates').update({
        body: f.body, enabled: f.enabled, whatsapp_template: f.whatsapp_template.trim() || null,
        whatsapp_params: params, updated_at: new Date().toISOString(),
      }).eq('key', template.key);
      if (error) throw error;
    }, 'حُفظ القالب');
    if (ok) onClose();
  };

  const site = (siteUrl || 'https://exams.example.ly').replace(/\/+$/, '');
  const sample = Object.fromEntries(Object.entries(SAMPLE).map(([k, v]) => [k, v.replace('{site}', site)]));

  return (
    <Modal wide title={`قالب: ${template.title}`} onClose={onClose}
      footer={<><button className="btn teal" onClick={save}>حفظ القالب</button><button className="btn ghost" onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert err mb">{err}</div>}
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          <Field label="نص الرسالة" required hint="اضغط على متغير لإدراجه في موضع المؤشر.">
            <textarea ref={ref} className="inp" style={{ minHeight: 260 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </Field>
          <div className="chips mb">
            {Object.entries(TEMPLATE_VARS).map(([k, label]) => (
              <button key={k} type="button" className="chip-opt" style={{ fontSize: 12, padding: '3px 9px' }} onClick={() => insertVar(k)} title={`{{${k}}}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> القالب فعّال</label>
        </div>
        <div>
          <div className="small muted mb-s">معاينة ببيانات تجريبية</div>
          <div style={{ whiteSpace: 'pre-wrap', background: 'var(--ok-bg)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 14, minHeight: 200 }}>
            {render(f.body, sample)}
          </div>
          <div className="card flat mt">
            <div className="card-b" style={{ padding: 14 }}>
              <div style={{ fontWeight: 500 }}>قالب WhatsApp Business (اختياري)</div>
              <p className="small muted" style={{ margin: '4px 0 10px' }}>
                يشترط واتساب قالباً معتمداً من Meta لبدء المحادثة مع الطالب. أنشئ القالب في WhatsApp Manager ثم اكتب اسمه
                وترتيب متغيراته هنا. بدونه تُرسل الرسالة نصاً حراً، ولا تصل إلا لمن راسلكم خلال آخر 24 ساعة.
              </p>
              <Field label="اسم القالب في Meta"><input className="inp ltr" placeholder="exam_appointment" value={f.whatsapp_template} onChange={(e) => setF({ ...f, whatsapp_template: e.target.value })} /></Field>
              <Field label="المتغيرات بالترتيب {{1}}، {{2}}…" hint="مثال: student_name, date, time">
                <input className="inp ltr" value={f.whatsapp_params} onChange={(e) => setF({ ...f, whatsapp_params: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function NotificationSettings({ canEdit }) {
  const qc = useQueryClient();
  const { toast, prompt } = useUi();
  const run = useAction();
  const { data: settings } = useSettings();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (settings) {
      setF({
        notify_enabled: settings.notify_enabled, notify_channel: settings.notify_channel,
        reminder_hours: (settings.reminder_hours || []).join(', '), public_site_url: settings.public_site_url || '',
      });
    }
  }, [settings]);

  const status = useQuery({ queryKey: ['send-messages-status'], queryFn: () => sendMessages('status'), retry: false, staleTime: 60_000 });
  const templates = useQuery({
    queryKey: ['message-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('message_templates').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  if (!f) return <Skeleton />;

  const channels = status.data?.channels;
  const linked = channels?.[f.notify_channel];

  const save = async () => {
    const hours = f.reminder_hours.split(/[,،\s]+/).filter(Boolean).map(Number);
    if (hours.some((h) => !Number.isInteger(h) || h < 1 || h > 168)) return toast('ساعات التذكير أعداد صحيحة بين 1 و168', 'err');
    const url = f.public_site_url.trim();
    if (url && !/^https?:\/\/[^\s]+$/.test(url)) return toast('رابط الموقع غير صحيح', 'err');
    if (f.notify_enabled && !url) return toast('أضف رابط الموقع العام حتى تعمل الروابط داخل الرسائل', 'err');
    setBusy(true);
    const { error } = await supabase.from('settings').update({
      notify_enabled: f.notify_enabled, notify_channel: f.notify_channel, reminder_hours: [...new Set(hours)].sort((a, b) => b - a),
      public_site_url: url || null, updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setBusy(false);
    if (error) return toast(errorMessage(error), 'err');
    toast('حُفظت إعدادات الإشعارات');
    qc.invalidateQueries({ queryKey: ['settings'] });
  };

  const runNow = async () => {
    const res = await run(() => sendMessages('run'));
    if (res) toast(res.processed ? `الرسائل المعالَجة: ${res.processed} · أُرسلت: ${res.sent} · فشلت: ${res.failed}` : 'لا توجد رسائل مستحقة الآن', res.failed ? 'err' : 'ok');
  };

  const sendTest = async () => {
    const to = await prompt({
      title: 'رسالة تجريبية',
      text: `تُرسل عبر ${CHANNELS[settings.notify_channel]} للتأكد من ربط القناة. احفظ الإعدادات أولاً إن غيّرت القناة.`,
      label: settings.notify_channel === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف',
      okLabel: 'إرسال',
    });
    if (!to) return;
    const id = await run(() => rpc('send_test_message', { p_recipient: to }));
    if (id) runNow();
  };

  return (
    <>
      <div className="alert mb">
        تُضاف الرسائل تلقائياً عند: استلام الطلب، قبوله أو رفضه، تحديد الموعد، التذكير قبل الموعد، اعتماد النتيجة، وصدور الشهادة.
        زر «إرسال عبر واتساب» اليدوي يبقى متاحاً في كل الأحوال.
      </div>

      <div className="f2">
        <div className="f full" style={{ marginBottom: 14 }}>
          <label className="check" style={{ fontSize: 15 }}>
            <input type="checkbox" disabled={!canEdit} checked={f.notify_enabled} onChange={(e) => setF({ ...f, notify_enabled: e.target.checked })} />
            تفعيل الإشعارات الآلية
          </label>
        </div>
        <Field label="القناة">
          <Select disabled={!canEdit} value={f.notify_channel} onChange={(v) => setF({ ...f, notify_channel: v })}
            options={Object.entries(CHANNELS).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="التذكير قبل الموعد (ساعات)" hint="مثال: 24, 2 — تذكير قبل يوم وقبل ساعتين">
          <input className="inp ltr" disabled={!canEdit} value={f.reminder_hours} onChange={(e) => setF({ ...f, reminder_hours: e.target.value })} />
        </Field>
        <Field label="رابط الموقع العام" className="full" hint="يُستخدم لبناء روابط المتابعة والنتيجة والتحقق داخل الرسائل.">
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <input className="inp ltr" disabled={!canEdit} placeholder="https://exams.hussas.ly" value={f.public_site_url}
              onChange={(e) => setF({ ...f, public_site_url: e.target.value })} />
            {canEdit && !f.public_site_url && (
              <button type="button" className="btn ghost sm" onClick={() => setF({ ...f, public_site_url: appUrl('').replace(/\/$/, '') })}>الرابط الحالي</button>
            )}
          </div>
        </Field>
      </div>

      <div className="card flat mb">
        <div className="card-b" style={{ padding: 14 }}>
          <div className="spread">
            <div style={{ fontWeight: 500 }}>حالة ربط القنوات على الخادم</div>
            <button className="btn ghost sm" onClick={() => status.refetch()} disabled={status.isFetching}>{status.isFetching && <span className="spinner" />} تحديث</button>
          </div>
          {status.error ? (
            <div className="alert warn mt-s small">
              تعذّر الاتصال بالدالة <span className="ltr">send-messages</span>: {errorMessage(status.error)}. انشرها أولاً (راجع README).
            </div>
          ) : channels ? (
            <div className="row mt-s">
              {Object.entries(CHANNELS).map(([k, label]) => (
                <Badge key={k} kind={channels[k] ? 'ok' : ''}>{label}: {channels[k] ? 'مربوط' : 'غير مربوط'}</Badge>
              ))}
              <Badge kind={status.data.cron ? 'ok' : 'warn'}>الإرسال الدوري: {status.data.cron ? 'مضبوط' : 'يحتاج CRON_SECRET'}</Badge>
            </div>
          ) : <div className="sk mt-s" style={{ width: '50%' }} />}
          {f.notify_enabled && channels && !linked && (
            <div className="alert warn mt-s small">القناة المختارة غير مربوطة؛ ستتراكم الرسائل وتفشل حتى تُضاف مفاتيح المزود في أسرار Edge Functions.</div>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="row mb">
          <button className="btn teal" onClick={save} disabled={busy}>{busy && <span className="spinner" />} حفظ إعدادات الإشعارات</button>
          <button className="btn ghost" onClick={sendTest}>إرسال رسالة تجريبية</button>
          <button className="btn ghost" onClick={runNow}>تشغيل الإرسال الآن</button>
          <Link className="btn ghost" to="/admin/messages"><Icon.list /> سجل الرسائل</Link>
        </div>
      )}

      <h4 className="kufi" style={{ fontSize: 15, marginBottom: 8 }}>قوالب الرسائل</h4>
      {templates.isLoading ? <Skeleton /> : templates.data?.length ? (
        <div className="tbl-wrap cards"><table className="tbl">
          <thead><tr><th>الحدث</th><th>بداية النص</th><th>قالب واتساب</th><th>الحالة</th><th /></tr></thead>
          <tbody>{templates.data.map((t) => (
            <tr key={t.key}>
              <td>{t.title}</td>
              <td className="small muted" style={{ maxWidth: 360 }}>{t.body.replace(/\s+/g, ' ').slice(0, 90)}…</td>
              <td className="small ltr">{t.whatsapp_template || '—'}</td>
              <td>{t.enabled ? <Badge kind="ok">فعّال</Badge> : <Badge>موقوف</Badge>}</td>
              <td>{canEdit && <button className="btn ghost sm" onClick={() => setEditing(t)}><Icon.edit /> تعديل</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty title="لا توجد قوالب" />}

      {editing && <TemplateModal template={editing} siteUrl={f.public_site_url} onClose={() => setEditing(null)} />}
    </>
  );
}
