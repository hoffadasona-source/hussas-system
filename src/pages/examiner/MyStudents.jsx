import { useState } from 'react';
import { useNavigate } from 'react-router';
import ListCard, { stop } from '../../components/ListCard';
import StudentProfile from '../../components/StudentProfile';
import { Icon } from '../../components/icons';
import { PageHeader, StatusBadge, mapOptions } from '../../components/ui';
import { AppointmentModal, WhatsAppModal, useAction } from '../../components/workflow';
import { usePagedList } from '../../hooks/data';
import { rpc } from '../../lib/supabase';
import { APP_STATUS } from '../../lib/constants';
import { fmtDate, fmtScore } from '../../lib/format';

const SCHEDULABLE = ['assigned', 'absent', 'postponed'];

export default function MyStudents() {
  const navigate = useNavigate();
  const run = useAction();
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [wa, setWa] = useState(null);

  const list = usePagedList({
    key: 'my-students',
    source: 'v_applications',
    searchCols: ['full_name', 'student_no', 'reg_no'],
    filters: { status },
    order: ['assigned_at', false],
  });

  const openExam = async (a) => {
    const id = a.exam_id && ['draft', 'in_progress', 'rejected'].includes(a.exam_status)
      ? a.exam_id
      : await run(() => rpc('start_exam', { p_application_id: a.id }));
    if (id) navigate(`/examiner/exams/${id}`);
  };

  return (
    <>
      <PageHeader title="طلابي" sub="الطلبة المحالون إليك فقط. لا تظهر لك بيانات محفّظين آخرين." />
      <ListCard
        list={list}
        searchPlaceholder="ابحث باسم الطالب أو رقمه"
        filters={[{ value: status, onChange: setStatus, options: mapOptions(APP_STATUS), placeholder: 'كل الحالات' }]}
        onRowClick={(a) => setProfile(a.student_id)}
        emptyTitle="لا يوجد طلبة محالون إليك"
        emptyText="ستظهر هنا أسماء الطلبة فور تحويلهم إليك من الإدارة، ويصلك إشعار بذلك."
        columns={[
          { label: 'رقم الطالب', className: 'num', render: (a) => a.student_no },
          { label: 'الاسم', render: (a) => a.full_name },
          { label: 'المستوى', className: 'small', render: (a) => a.level_name },
          { label: 'المستوى', className: 'small', render: (a) => a.level_name },
          { label: 'مقدار الحفظ', className: 'small', render: (a) => a.memorized_amount },
          { label: 'تاريخ الإحالة', className: 'num small', render: (a) => fmtDate(a.assigned_at) },
          { label: 'الحالة', render: (a) => <StatusBadge map={APP_STATUS} value={a.status} /> },
          { label: 'الدرجة', className: 'num', render: (a) => fmtScore(a.exam_score) },
          {
            label: 'الإجراءات',
            render: (a) => (
              <div className="acts">
                <button className="btn ghost sm" title="ملف الطالب" onClick={stop(() => setProfile(a.student_id))}><Icon.eye /></button>
                {SCHEDULABLE.includes(a.status) && <button className="btn ghost sm" onClick={stop(() => setSchedule(a))}>تحديد موعد</button>}
                {(a.status === 'scheduled' || a.status === 'in_exam') && (
                  <button className="btn sm teal" onClick={stop(() => openExam(a))}>{a.status === 'in_exam' ? 'متابعة الجلسة' : 'بدء الجلسة'}</button>
                )}
              </div>
            ),
          },
        ]}
      />
      {profile && <StudentProfile studentId={profile} onClose={() => setProfile(null)} />}
      {schedule && <AppointmentModal application={schedule} onClose={() => setSchedule(null)} onSaved={setWa} />}
      {wa && <WhatsAppModal appointment={wa} onClose={() => setWa(null)} />}
    </>
  );
}
