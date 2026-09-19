import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Field, Kv, Modal, Select } from './ui';
import { Icon } from './icons';
import { useUi } from '../context/UiContext';
import { useExaminers, useSettings } from '../hooks/data';
import { rpc } from '../lib/supabase';
import { APPOINTMENT_MODES } from '../lib/constants';
import { appointmentMessage, errorMessage, waLink } from '../lib/helpers';
import { todayISO } from '../lib/format';

/** تنفيذ إجراء مع رسالة نجاح/خطأ وتحديث كل البيانات */
export function useAction() {
  const qc = useQueryClient();
  const { toast } = useUi();
  return async (fn, successMessage) => {
    try {
      const result = await fn();
      if (successMessage) toast(successMessage);
      await qc.invalidateQueries();
      return result ?? true;
    } catch (err) {
      toast(errorMessage(err), 'err');
      return false;
    }
  };
}

/** إجراءات الطلبات للإدارة */
export function useApplicationActions() {
  const run = useAction();
  const { confirm, prompt } = useUi();
  return {
    review: (app) => run(() => rpc('mark_application_under_review', { p_application_id: app.id }), 'بدأت مراجعة الطلب'),
    approve: async (app) => {
      const ok = await confirm({ title: 'قبول الطلب', text: `قبول طلب «${app.full_name}»؟ يمكنك بعدها تحويله إلى محفّظ.`, okLabel: 'قبول الطلب' });
      return ok && run(() => rpc('approve_application', { p_application_id: app.id }), 'قُبل الطلب');
    },
    reject: async (app) => {
      const reason = await prompt({
        title: 'رفض الطلب', text: 'سيظهر سبب الرفض للطالب عند متابعة طلبه.', label: 'سبب الرفض', okLabel: 'رفض الطلب', danger: true,
      });
      return reason && run(() => rpc('reject_application', { p_application_id: app.id, p_reason: reason }), 'رُفض الطلب');
    },
  };
}

export function AssignModal({ application, onClose }) {
  const { data: examiners = [] } = useExaminers();
  const run = useAction();
  const [examinerId, setExaminerId] = useState(application.examiner_id || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = examiners.filter((e) => e.status === 'active' && e.user_id && e.account_status === 'active');
  const sorted = [...active].sort((a, b) => (b.office_id === application.office_id) - (a.office_id === application.office_id));

  const submit = async () => {
    if (!examinerId) {
      setError('اختر المحفّظ.');
      return;
    }
    setBusy(true);
    const ok = await run(() => rpc('assign_application', { p_application_id: application.id, p_examiner_id: examinerId, p_note: note }),
      application.examiner_id ? 'أُعيد تحويل الطالب' : 'حُوِّل الطالب إلى المحفّظ');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={application.examiner_id ? 'إعادة تحويل الطالب' : 'تحويل الطالب إلى محفّظ'} onClose={onClose}
      footer={<>
        <button className="btn teal" onClick={submit} disabled={busy}>{busy && <span className="spinner" />} تأكيد التحويل</button>
        <button className="btn ghost" onClick={onClose}>إلغاء</button>
      </>}>
      <p className="muted small" style={{ marginTop: 0 }}>الطالب: <b>{application.full_name}</b> — {application.office_name}</p>
      <Field label="المحفّظ" required error={error}>
        <Select value={examinerId} onChange={(v) => { setExaminerId(v); setError(''); }} placeholder="اختر المحفّظ"
          options={sorted.map((e) => ({ value: e.id, label: `${e.full_name} — ${e.office_name || 'بدون مكتب'} (${e.active_students} طلاب)` }))} />
      </Field>
      {active.length === 0 && <div className="alert warn mb">لا يوجد محفّظون فعّالون بحسابات دخول. أضف محفّظاً من صفحة المحفّظين.</div>}
      <Field label="ملاحظة التحويل"><textarea className="inp" placeholder="ملاحظة تظهر للمحفّظ في إشعار الاستلام" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="small muted">
        بعد التحويل تصبح حالة الطلب «محال لمحفّظ»، ويظهر الطالب في لوحة المحفّظ.
        {application.examiner_id && ' تُلغى المواعيد القائمة مع المحفّظ السابق.'}
      </div>
    </Modal>
  );
}

export function AppointmentModal({ application, appointment, onClose, onSaved }) {
  const { data: settings } = useSettings();
  const run = useAction();
  const [form, setForm] = useState({
    date: appointment?.exam_date || '',
    time: appointment?.exam_time?.slice(0, 5) || '',
    mode: appointment?.mode || settings?.exam_mode || 'whatsapp_room',
    location: appointment?.location || '',
    notes: appointment?.notes || '',
    sendWhatsapp: true,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const save = async () => {
    const e = {};
    if (!form.date) e.date = 'التاريخ مطلوب.';
    else if (!appointment && form.date < todayISO()) e.date = 'التاريخ في الماضي.';
    if (!form.time) e.time = 'الوقت مطلوب.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const id = await run(() => rpc('save_appointment', {
      p_application_id: application.id, p_date: form.date, p_time: form.time, p_mode: form.mode,
      p_location: form.location, p_notes: form.notes, p_appointment_id: appointment?.id || null,
    }), form.sendWhatsapp ? null : 'حُفظ الموعد');
    setBusy(false);
    if (!id) return;
    onClose();
    if (form.sendWhatsapp) {
      onSaved?.({
        id, full_name: application.full_name, whatsapp: application.whatsapp, matn_names: application.matn_names,
        exam_date: form.date, exam_time: form.time, mode: form.mode, location: form.location, notes: form.notes,
        examiner_name: application.examiner_name,
      });
    }
  };

  return (
    <Modal title={appointment ? 'تعديل موعد جلسة الامتحان' : 'تحديد موعد جلسة الامتحان'} onClose={onClose}
      footer={<>
        <button className="btn teal" onClick={save} disabled={busy}>{busy && <span className="spinner" />} {form.sendWhatsapp ? 'حفظ وإرسال على واتساب' : 'حفظ الموعد'}</button>
        <button className="btn ghost" onClick={onClose}>إلغاء</button>
      </>}>
      <p className="muted small" style={{ marginTop: 0 }}>الطالب: <b>{application.full_name}</b> — {(application.matn_names || []).join(' · ')}</p>
      <div className="f2">
        <Field label="التاريخ" required error={errors.date}><input className="inp" type="date" min={appointment ? undefined : todayISO()} value={form.date} onChange={set('date')} /></Field>
        <Field label="الوقت" required error={errors.time}><input className="inp" type="time" value={form.time} onChange={set('time')} /></Field>
        <Field label="مكان الجلسة" required>
          <Select value={form.mode} onChange={set('mode')} options={Object.entries(APPOINTMENT_MODES).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="رابط الغرفة أو الرقم أو المكان"><input className="inp" placeholder="اختياري" value={form.location} onChange={set('location')} /></Field>
      </div>
      <Field label="ملاحظات"><textarea className="inp" placeholder="تظهر في نص رسالة الطالب" value={form.notes} onChange={set('notes')} /></Field>
      <label className="check"><input type="checkbox" checked={form.sendWhatsapp} onChange={set('sendWhatsapp')} /> فتح واتساب لإرسال الموعد للطالب بعد الحفظ</label>
    </Modal>
  );
}

export function WhatsAppModal({ appointment, onClose }) {
  const { data: settings } = useSettings();
  const run = useAction();
  const { toast } = useUi();
  const [text, setText] = useState(() => appointmentMessage({
    orgName: settings?.org_name || 'برنامج حُفّاظ السُّنة',
    studentName: appointment.full_name,
    matns: appointment.matn_names,
    date: appointment.exam_date,
    time: appointment.exam_time,
    mode: appointment.mode,
    location: appointment.location,
    notes: appointment.notes,
  }));

  const send = async () => {
    window.open(waLink(appointment.whatsapp, text), '_blank', 'noopener');
    onClose();
    await run(() => rpc('mark_appointment_notified', { p_appointment_id: appointment.id }), 'فُتح واتساب — سُجِّل الإشعار كمُرسل');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('نُسخ نص الرسالة', 'info');
    } catch {
      toast('تعذّر النسخ، انسخ النص يدوياً', 'err');
    }
  };

  return (
    <Modal title="إرسال الموعد عبر واتساب" onClose={onClose}
      footer={<>
        <button className="btn teal" onClick={send}><Icon.whatsapp /> فتح واتساب وإرسال</button>
        <button className="btn ghost" onClick={copy}>نسخ النص</button>
        <button className="btn ghost" onClick={onClose}>إلغاء</button>
      </>}>
      <div className="alert small mb">
        تُرسل الرسالة من حساب واتساب المفتوح على هذا الجهاز إلى رقم الطالب مباشرة. يفتح الزر واتساب بالرسالة جاهزة، وتُسجَّل حالة الإرسال في المنظومة.
      </div>
      <Kv items={[['الطالب', appointment.full_name], ['رقم واتساب', <span className="num ltr">{appointment.whatsapp}</span>]]} />
      <Field label="نص الرسالة" className="mt"><textarea className="inp" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Modal>
  );
}
