import { useState } from 'react';
import ListCard, { stop } from '../../components/ListCard';
import StudentProfile from '../../components/StudentProfile';
import { PageHeader, StatusBadge, mapOptions, rowsOptions } from '../../components/ui';
import { AssignModal } from '../../components/workflow';
import { useExaminers, usePagedList } from '../../hooks/data';
import { APP_STATUS } from '../../lib/constants';
import { fmtDate } from '../../lib/format';

const REASSIGNABLE = ['assigned', 'scheduled', 'absent', 'postponed'];

export default function Assignments() {
  const { data: examiners } = useExaminers();
  const [examiner, setExaminer] = useState('');
  const [status, setStatus] = useState('');
  const [assign, setAssign] = useState(null);
  const [profile, setProfile] = useState(null);

  const list = usePagedList({
    key: 'assignments',
    source: 'v_applications',
    searchCols: ['full_name', 'student_no', 'reg_no', 'examiner_name'],
    filters: { examiner_id: examiner, status },
    extra: (q) => q.not('examiner_id', 'is', null),
    order: ['assigned_at', false],
  });

  return (
    <>
      <PageHeader title="الإحالات" sub="الطلبة المحالون إلى المحفّظين وحالة كل إحالة." />
      <ListCard
        list={list}
        searchPlaceholder="ابحث باسم الطالب أو المحفّظ"
        filters={[
          { value: examiner, onChange: setExaminer, options: rowsOptions(examiners, 'full_name'), placeholder: 'كل المحفّظين' },
          { value: status, onChange: setStatus, options: mapOptions(APP_STATUS), placeholder: 'كل الحالات' },
        ]}
        onRowClick={(r) => setProfile(r.student_id)}
        emptyTitle="لا توجد إحالات"
        emptyText="حوّل الطلبات المقبولة إلى المحفّظين من صفحة الطلبات."
        exportName="الإحالات"
        exportColumns={[
          { label: 'رقم الطالب', value: (r) => r.student_no },
          { label: 'الطالب', value: (r) => r.full_name },
          { label: 'المحفّظ', value: (r) => r.examiner_name },
          { label: 'المكتب', value: (r) => r.office_name },
          { label: 'تاريخ الإحالة', value: (r) => fmtDate(r.assigned_at) },
          { label: 'الحالة', value: (r) => APP_STATUS[r.status]?.t },
          { label: 'ملاحظة التحويل', value: (r) => r.assignment_note },
        ]}
        columns={[
          { label: 'رقم الطالب', className: 'num', render: (r) => r.student_no },
          { label: 'الطالب', render: (r) => r.full_name },
          { label: 'المحفّظ', render: (r) => r.examiner_name },
          { label: 'المكتب', className: 'small muted', render: (r) => r.office_name },
          { label: 'تاريخ الإحالة', className: 'num small', render: (r) => fmtDate(r.assigned_at) },
          { label: 'الحالة', render: (r) => <StatusBadge map={APP_STATUS} value={r.status} /> },
          {
            label: 'الإجراء',
            render: (r) => REASSIGNABLE.includes(r.status)
              ? <button className="btn ghost sm" onClick={stop(() => setAssign(r))}>إعادة التحويل</button>
              : <span className="tiny muted">—</span>,
          },
        ]}
      />
      {assign && <AssignModal application={assign} onClose={() => setAssign(null)} />}
      {profile && <StudentProfile studentId={profile} onClose={() => setProfile(null)} />}
    </>
  );
}
