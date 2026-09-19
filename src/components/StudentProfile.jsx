import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, ErrorBox, Field, Kv, Modal, Select, Skeleton, StatusBadge, Tabs } from './ui';
import { AssignModal, useAction } from './workflow';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { APP_STATUS, APPOINTMENT_MODES, APPOINTMENT_STATUS, AUDIT_ACTIONS, CERT_STATUS, EXAM_STATUS, GENDERS, MESSAGE_STATUS, SECTIONS } from '../lib/constants';
import { errorMessage, isLibyanPhone } from '../lib/helpers';
import { fmtDate, fmtDateTime, fmtScore, fmtTime } from '../lib/format';

function EditStudent({ student, onDone }) {
  const run = useAction();
  const [f, setF] = useState({
    first_name: student.first_name, father_name: student.father_name, grandfather_name: student.grandfather_name || '',
    family_name: student.family_name, birth_date: student.birth_date, gender: student.gender, residence: student.residence,
    phone: student.phone, whatsapp: student.whatsapp, email: student.email || '',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = async () => {
    if (!f.first_name.trim() || !f.father_name.trim() || !f.family_name.trim() || !f.residence.trim() || !f.birth_date) {
      setErr('استكمل الحقول الإلزامية');
      return;
    }
    if (!isLibyanPhone(f.phone) || !isLibyanPhone(f.whatsapp)) {
      setErr('رقم الهاتف أو واتساب غير صحيح');
      return;
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('students')
        .update({ ...f, grandfather_name: f.grandfather_name || null, email: f.email || null })
        .eq('id', student.id);
      if (error) throw error;
    }, 'حُفظت بيانات الطالب');
    if (ok) onDone();
  };
  return (
    <>
      {err && <div className="alert err mb">{err}</div>}
      <div className="f2">
        <Field label="الاسم الأول" required><input className="inp" value={f.first_name} onChange={set('first_name')} /></Field>
        <Field label="اسم الأب" required><input className="inp" value={f.father_name} onChange={set('father_name')} /></Field>
        <Field label="اسم الجد"><input className="inp" value={f.grandfather_name} onChange={set('grandfather_name')} /></Field>
        <Field label="اللقب" required><input className="inp" value={f.family_name} onChange={set('family_name')} /></Field>
        <Field label="تاريخ الميلاد" required><input className="inp" type="date" value={f.birth_date} onChange={set('birth_date')} /></Field>
        <Field label="الجنس"><Select value={f.gender} onChange={set('gender')} options={Object.entries(GENDERS).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="محل الإقامة" required><input className="inp" value={f.residence} onChange={set('residence')} /></Field>
        <Field label="البريد"><input className="inp ltr" value={f.email} onChange={set('email')} /></Field>
        <Field label="الهاتف" required><input className="inp ltr" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="واتساب" required><input className="inp ltr" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
      </div>
      <div className="row">
        <button className="btn teal" onClick={save}>حفظ</button>
        <button className="btn ghost" onClick={onDone}>إلغاء</button>
      </div>
      <p className="hint">الرقم الوطني لا يُعدَّل لأنه مفتاح الاستعلام عن النتائج.</p>
    </>
  );
}

export default function StudentProfile({ studentId, onClose }) {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const [assignApp, setAssignApp] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student-profile', studentId],
    queryFn: async () => {
      const [student, apps] = await Promise.all([
        supabase.from('students').select('*').eq('id', studentId).single(),
        supabase.from('v_applications').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
      ]);
      if (student.error) throw student.error;
      if (apps.error) throw apps.error;
      const appIds = apps.data.map((a) => a.id);
      const [apts, exams, certs] = await Promise.all([
        supabase.from('appointments').select('*').in('application_id', appIds).order('exam_date', { ascending: false }),
        supabase.from('v_exams').select('*').in('application_id', appIds).order('created_at', { ascending: false }),
        isAdmin ? supabase.from('certificates').select('*').eq('student_id', studentId).order('issued_at', { ascending: false }) : { data: [] },
      ]);
      const messages = isAdmin && appIds.length
        ? (await supabase.from('v_outbound_messages').select('*').in('application_id', appIds).order('created_at', { ascending: false }).limit(50)).data || []
        : [];
      let audit = [];
      if (isAdmin) {
        const ids = [...apps.data.map((a) => a.reg_no), ...(apts.data || []).map((a) => a.apt_no), ...(exams.data || []).map((e) => e.exam_no), ...(certs.data || []).map((c) => c.cert_no)];
        if (ids.length) {
          const r = await supabase.from('audit_log').select('*').in('entity_id', ids).order('created_at', { ascending: false }).limit(50);
          audit = r.data || [];
        }
      }
      return { student: student.data, apps: apps.data, apts: apts.data || [], exams: exams.data || [], certs: certs.data || [], messages, audit };
    },
  });

  const tabs = [
    { key: 'info', label: 'البيانات' },
    { key: 'apps', label: 'الطلبات' },
    { key: 'apts', label: 'المواعيد' },
    { key: 'exams', label: 'الامتحانات والنتائج' },
    isAdmin && { key: 'certs', label: 'الشهادات' },
    isAdmin && { key: 'messages', label: 'الرسائل' },
    isAdmin && { key: 'audit', label: 'سجل العمليات' },
  ].filter(Boolean);

  const s = data?.student;
  const latest = data?.apps[0];

  return (
    <>
      <Modal wide title={s ? `ملف الطالب — ${s.full_name}` : 'ملف الطالب'} onClose={onClose}
        footer={<>
          {isAdmin && latest && !['in_exam', 'admin_pending', 'published', 'rejected'].includes(latest.status) && (
            <button className="btn" onClick={() => setAssignApp(latest)}>{latest.examiner_id ? 'إعادة التحويل' : 'تحويل إلى محفّظ'}</button>
          )}
          {isAdmin && s && tab === 'info' && !editing && <button className="btn ghost" onClick={() => setEditing(true)}>تعديل البيانات</button>}
          <button className="btn ghost" onClick={onClose}>إغلاق</button>
        </>}>
        {isLoading && <Skeleton lines={5} />}
        {error && <ErrorBox error={errorMessage(error)} onRetry={refetch} />}
        {data && (
          <>
            <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); setEditing(false); }} />
            <div style={{ paddingTop: 16 }}>
              {tab === 'info' && (editing ? <EditStudent student={s} onDone={() => { setEditing(false); refetch(); }} /> : (
                <Kv items={[
                  ['الاسم الكامل', s.full_name],
                  ['رقم الطالب', <span className="num ltr">{s.student_no}</span>],
                  ['الرقم الوطني', <span className="num">{s.national_id}</span>],
                  ['تاريخ الميلاد', fmtDate(s.birth_date)],
                  ['الجنس / الإقامة', `${GENDERS[s.gender]} — ${s.residence}`],
                  ['الهاتف / واتساب', <span className="num ltr">{s.phone} · {s.whatsapp}</span>],
                  s.email && ['البريد', <span className="ltr">{s.email}</span>],
                  latest && ['رقم الطلب الحالي', <span className="num ltr">{latest.reg_no}</span>],
                  latest && ['القسم', SECTIONS[latest.section]],
                  latest && ['الحلقة / المركز', `${latest.circle_name} — ${latest.center_name}`],
                  latest && ['المكتب', latest.office_name],
                  latest && ['المحفّظ', latest.examiner_name || 'غير محال'],
                  latest && ['المستوى', latest.level_name],
                  latest && ['مقدار الحفظ', `${latest.memorized_amount}${latest.verses_range ? ` (${latest.verses_range})` : ''}`],
                  latest && ['المتون', latest.matn_names.join(' · ')],
                  latest?.teacher_name && ['محفّظ الحلقة', latest.teacher_name],
                  latest?.student_notes && ['ملاحظات الطالب', latest.student_notes],
                  latest?.assignment_note && ['ملاحظة التحويل', latest.assignment_note],
                  latest && ['الحالة', <StatusBadge map={APP_STATUS} value={latest.status} />],
                  latest?.rejection_reason && latest.status === 'rejected' && ['سبب الرفض', latest.rejection_reason],
                ]} />
              ))}

              {tab === 'apps' && (
                <div className="tbl-wrap cards"><table className="tbl">
                  <thead><tr><th>رقم الطلب</th><th>الدورة</th><th>التاريخ</th><th>المحفّظ</th><th>الحالة</th></tr></thead>
                  <tbody>{data.apps.map((a) => (
                    <tr key={a.id}><td className="num">{a.reg_no}</td><td className="small">{a.cycle_name}</td><td className="num small">{fmtDate(a.created_at)}</td>
                      <td className="small">{a.examiner_name || '—'}</td><td><StatusBadge map={APP_STATUS} value={a.status} /></td></tr>
                  ))}</tbody>
                </table></div>
              )}

              {tab === 'apts' && (data.apts.length ? data.apts.map((a) => (
                <div key={a.id} className="card flat mb-s">
                  <div className="card-b spread" style={{ padding: 14 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{fmtDate(a.exam_date)} · {fmtTime(a.exam_time)}</div>
                      <div className="small muted">{APPOINTMENT_MODES[a.mode]}{a.location ? ` — ${a.location}` : ''}</div>
                    </div>
                    <StatusBadge map={APPOINTMENT_STATUS} value={a.status} />
                  </div>
                </div>
              )) : <Empty title="لا توجد مواعيد" text="سيظهر الموعد هنا بعد أن يحدده المحفّظ." />)}

              {tab === 'exams' && (data.exams.length ? (
                <div className="tbl-wrap cards"><table className="tbl">
                  <thead><tr><th>رقم الامتحان</th><th>التاريخ</th><th>المحفّظ</th><th>الحالة</th><th>الدرجة</th></tr></thead>
                  <tbody>{data.exams.map((e) => (
                    <tr key={e.id}><td className="num">{e.exam_no}</td><td className="num">{fmtDate(e.exam_date)}</td><td>{e.examiner_name}</td>
                      <td><StatusBadge map={EXAM_STATUS} value={e.status} /></td><td className="num">{fmtScore(e.score)}</td></tr>
                  ))}</tbody>
                </table></div>
              ) : <Empty title="لا توجد امتحانات" text="لم يُجرَ للطالب أي امتحان حتى الآن." />)}

              {tab === 'certs' && (data.certs.length ? (
                data.certs.map((c) => (
                  <Kv key={c.id} items={[
                    ['رقم الشهادة', <span className="num ltr">{c.cert_no}</span>],
                    ['الدرجة', fmtScore(c.score)],
                    ['تاريخ الإصدار', fmtDate(c.issued_at)],
                    ['الحالة', <StatusBadge map={CERT_STATUS} value={c.status} />],
                  ]} />
                ))
              ) : <Empty title="لا توجد شهادة" text="تُصدر الشهادة بعد الاعتماد النهائي للنتيجة." />)}

              {tab === 'messages' && (data.messages.length ? (
                <div className="tbl-wrap cards"><table className="tbl">
                  <thead><tr><th>الوقت</th><th>النوع</th><th>المستلم</th><th>الحالة</th></tr></thead>
                  <tbody>{data.messages.map((m) => (
                    <tr key={m.id} title={m.body}><td className="num small">{fmtDateTime(m.sent_at || m.send_after)}</td><td className="small">{m.template_title}</td>
                      <td className="num small"><span className="ltr">{m.recipient}</span></td><td><StatusBadge map={MESSAGE_STATUS} value={m.status} /></td></tr>
                  ))}</tbody>
                </table></div>
              ) : <Empty title="لا توجد رسائل" text="تظهر هنا الإشعارات الآلية المرسلة للطالب." />)}

              {tab === 'audit' && (data.audit.length ? (
                <div className="tbl-wrap cards"><table className="tbl">
                  <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>المعرّف</th></tr></thead>
                  <tbody>{data.audit.map((a) => (
                    <tr key={a.id}><td className="num small">{fmtDateTime(a.created_at)}</td><td className="small">{a.actor_name || 'زائر'}</td>
                      <td className="small">{AUDIT_ACTIONS[a.action] || a.action}</td><td className="num small">{a.entity_id}</td></tr>
                  ))}</tbody>
                </table></div>
              ) : <Empty title="لا توجد عمليات مسجّلة" />)}
            </div>
          </>
        )}
      </Modal>
      {assignApp && <AssignModal application={assignApp} onClose={() => { setAssignApp(null); refetch(); }} />}
    </>
  );
}
