import { useState } from 'react';
import { useNavigate } from 'react-router';
import ListCard, { stop } from '../../components/ListCard';
import { Icon } from '../../components/icons';
import { Badge, PageHeader, StatusBadge, mapOptions, rowsOptions } from '../../components/ui';
import { AppointmentModal, WhatsAppModal, useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useExaminers, usePagedList } from '../../hooks/data';
import { rpc } from '../../lib/supabase';
import { APPOINTMENT_MODES, APPOINTMENT_STATUS } from '../../lib/constants';
import { fmtDate, fmtDateTime, fmtTime, todayISO } from '../../lib/format';

export default function Appointments({ portal }) {
  const isAdmin = portal === 'admin';
  const { isExaminer } = useAuth();
  const { confirm, prompt } = useUi();
  const run = useAction();
  const navigate = useNavigate();
  const { data: examiners } = useExaminers();
  const [status, setStatus] = useState('scheduled');
  const [examiner, setExaminer] = useState('');
  const [when, setWhen] = useState('');
  const [edit, setEdit] = useState(null);
  const [wa, setWa] = useState(null);

  const list = usePagedList({
    key: `appointments-${portal}`,
    source: 'v_appointments',
    searchCols: ['full_name', 'apt_no', 'reg_no', 'location'],
    filters: { status, examiner_id: isAdmin ? examiner : '' },
    extra: (q) => (when === 'upcoming' ? q.gte('exam_date', todayISO()) : when === 'past' ? q.lt('exam_date', todayISO()) : when === 'today' ? q.eq('exam_date', todayISO()) : q),
    order: ['exam_date', status === 'scheduled'],
  });

  const markAbsent = async (a) => {
    if (await confirm({ title: 'تسجيل غياب', text: `سيُسجَّل «${a.full_name}» غائباً عن موعد ${fmtDate(a.exam_date)}. يمكن تحديد موعد جديد لاحقاً.`, okLabel: 'تسجيل الغياب', danger: true })) {
      run(() => rpc('set_appointment_status', { p_appointment_id: a.id, p_status: 'absent', p_reason: null }), 'سُجِّل الغياب');
    }
  };
  const postpone = async (a) => {
    const reason = await prompt({ title: 'تأجيل الموعد', text: 'يعود الطالب إلى قائمة «مؤجل» حتى يُحدَّد موعد جديد.', label: 'سبب التأجيل', required: false, okLabel: 'تأجيل' });
    if (reason !== null) run(() => rpc('set_appointment_status', { p_appointment_id: a.id, p_status: 'postponed', p_reason: reason }), 'أُجّل الموعد');
  };
  const startExam = async (a) => {
    const examId = await run(() => rpc('start_exam', { p_application_id: a.application_id }));
    if (examId) navigate(`/examiner/exams/${examId}`);
  };

  const application = (a) => ({
    id: a.application_id, full_name: a.full_name, whatsapp: a.whatsapp, matn_names: a.matn_names, examiner_name: a.examiner_name,
  });

  return (
    <>
      <PageHeader title="المواعيد" sub={isAdmin ? 'جلسات الامتحان وحالة إشعار الطلبة على واتساب.' : 'مواعيد امتحاناتك.'} />
      <ListCard
        list={list}
        searchPlaceholder="ابحث باسم الطالب أو رقم الموعد أو المكان"
        filters={[
          { value: status, onChange: setStatus, options: mapOptions(APPOINTMENT_STATUS), placeholder: 'كل الحالات' },
          { value: when, onChange: setWhen, options: [{ value: 'today', label: 'اليوم' }, { value: 'upcoming', label: 'القادمة' }, { value: 'past', label: 'السابقة' }], placeholder: 'كل التواريخ' },
          isAdmin && { value: examiner, onChange: setExaminer, options: rowsOptions(examiners, 'full_name'), placeholder: 'كل المحفّظين' },
        ].filter(Boolean)}
        emptyTitle="لا توجد مواعيد"
        emptyText={isAdmin ? 'تظهر هنا المواعيد التي يحددها المحفّظون.' : 'حدد موعد جلسة لأحد طلابك من صفحة «طلابي».'}
        exportName="المواعيد"
        exportColumns={[
          { label: 'رقم الموعد', value: (a) => a.apt_no },
          { label: 'الطالب', value: (a) => a.full_name },
          { label: 'واتساب', value: (a) => a.whatsapp },
          { label: 'التاريخ', value: (a) => a.exam_date },
          { label: 'الوقت', value: (a) => fmtTime(a.exam_time) },
          { label: 'المكان', value: (a) => `${APPOINTMENT_MODES[a.mode]}${a.location ? ` — ${a.location}` : ''}` },
          { label: 'المحفّظ', value: (a) => a.examiner_name },
          { label: 'الحالة', value: (a) => APPOINTMENT_STATUS[a.status]?.t },
          { label: 'أُرسل الإشعار', value: (a) => fmtDateTime(a.notified_at) },
        ]}
        columns={[
          { label: 'رقم الموعد', className: 'num small', render: (a) => a.apt_no },
          { label: 'الطالب', render: (a) => a.full_name },
          { label: 'التاريخ', className: 'num', render: (a) => fmtDate(a.exam_date) },
          { label: 'الوقت', className: 'num', render: (a) => fmtTime(a.exam_time) },
          { label: 'المكان', className: 'small', render: (a) => <>{APPOINTMENT_MODES[a.mode]}{a.location && <div className="tiny muted ltr">{a.location}</div>}</> },
          isAdmin && { label: 'المحفّظ', render: (a) => a.examiner_name },
          { label: 'الحالة', render: (a) => <StatusBadge map={APPOINTMENT_STATUS} value={a.status} /> },
          { label: 'الإشعار', render: (a) => (a.notified_at ? <Badge kind="ok">أُرسل</Badge> : <Badge kind="warn">بالانتظار</Badge>) },
          {
            label: 'الإجراءات',
            render: (a) => (
              <div className="acts">
                {a.status === 'scheduled' && <>
                  <button className="btn ghost sm" title="إرسال عبر واتساب" onClick={stop(() => setWa(a))}><Icon.whatsapp /></button>
                  {isExaminer && <button className="btn sm teal" onClick={stop(() => startExam(a))}>{a.exam_id ? 'استئناف الجلسة' : 'بدء الجلسة'}</button>}
                  <button className="btn ghost sm" onClick={stop(() => setEdit(a))}>تعديل</button>
                  {!a.exam_id && <>
                    <button className="btn ghost sm" onClick={stop(() => postpone(a))}>تأجيل</button>
                    <button className="btn ghost sm" onClick={stop(() => markAbsent(a))}>غياب</button>
                  </>}
                </>}
              </div>
            ),
          },
        ].filter(Boolean)}
      />
      {edit && <AppointmentModal application={application(edit)} appointment={edit} onClose={() => setEdit(null)} onSaved={setWa} />}
      {wa && <WhatsAppModal appointment={wa} onClose={() => setWa(null)} />}
    </>
  );
}
