import { useState } from 'react';
import ListCard from '../../components/ListCard';
import ExamReview from '../../components/ExamReview';
import { PageHeader, StatusBadge, mapOptions, rowsOptions } from '../../components/ui';
import { useExaminers, useLookups, usePagedList } from '../../hooks/data';
import { EXAM_STATUS } from '../../lib/constants';
import { fmtDate, fmtScore } from '../../lib/format';

export default function Exams() {
  const { data: examiners } = useExaminers();
  const { data: lookups } = useLookups();
  const [status, setStatus] = useState('');
  const [examiner, setExaminer] = useState('');
  const [office, setOffice] = useState('');
  const [open, setOpen] = useState(null);

  const list = usePagedList({
    key: 'exams',
    source: 'v_exams',
    searchCols: ['exam_no', 'full_name', 'student_no', 'reg_no'],
    filters: { status, examiner_id: examiner, office_id: office },
  });

  return (
    <>
      <PageHeader title="الامتحانات" sub="كل الامتحانات في المنظومة وحالاتها." />
      <ListCard
        list={list}
        searchPlaceholder="ابحث برقم الامتحان أو اسم الطالب"
        filters={[
          { value: status, onChange: setStatus, options: mapOptions(EXAM_STATUS), placeholder: 'كل الحالات' },
          { value: examiner, onChange: setExaminer, options: rowsOptions(examiners, 'full_name'), placeholder: 'كل المحفّظين' },
          { value: office, onChange: setOffice, options: rowsOptions(lookups?.offices), placeholder: 'كل المكاتب' },
        ]}
        onRowClick={(r) => setOpen(r.id)}
        emptyTitle="لا توجد امتحانات"
        emptyText="تظهر الامتحانات هنا عندما يبدأ المحفّظون جلساتهم."
        exportName="الامتحانات"
        exportColumns={[
          { label: 'رقم الامتحان', value: (r) => r.exam_no },
          { label: 'رقم الطالب', value: (r) => r.student_no },
          { label: 'الطالب', value: (r) => r.full_name },
          { label: 'المحفّظ', value: (r) => r.examiner_name },
          { label: 'المكتب', value: (r) => r.office_name },
          { label: 'التاريخ', value: (r) => r.exam_date },
          { label: 'الحالة', value: (r) => EXAM_STATUS[r.status]?.t },
          { label: 'الدرجة', value: (r) => r.score },
          { label: 'رقم الشهادة', value: (r) => r.cert_no },
        ]}
        columns={[
          { label: 'رقم الامتحان', className: 'num', render: (r) => r.exam_no },
          { label: 'الطالب', render: (r) => r.full_name },
          { label: 'المحفّظ', render: (r) => r.examiner_name },
          { label: 'المكتب', className: 'small muted', render: (r) => r.office_name },
          { label: 'التاريخ', className: 'num', render: (r) => fmtDate(r.exam_date) },
          { label: 'الحالة', render: (r) => <StatusBadge map={EXAM_STATUS} value={r.status} /> },
          { label: 'الدرجة', className: 'num', render: (r) => fmtScore(r.score) },
          { label: '', render: () => <button className="btn ghost sm">فتح</button> },
        ]}
      />
      {open && <ExamReview examId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
