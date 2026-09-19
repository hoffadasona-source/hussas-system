import { useState } from 'react';
import { useNavigate } from 'react-router';
import ExamReview from '../../components/ExamReview';
import ListCard from '../../components/ListCard';
import { PageHeader, StatusBadge, mapOptions } from '../../components/ui';
import { usePagedList } from '../../hooks/data';
import { EXAM_STATUS } from '../../lib/constants';
import { fmtDate, fmtScore } from '../../lib/format';

const EDITABLE = ['draft', 'in_progress', 'rejected'];

export default function ExaminerExams({ mode }) {
  const results = mode === 'results';
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [review, setReview] = useState(null);

  const list = usePagedList({
    key: `examiner-${mode}`,
    source: 'v_exams',
    searchCols: ['exam_no', 'full_name', 'student_no'],
    filters: { status: status || (results ? ['examiner_approved', 'approved'] : '') },
    order: ['updated_at', false],
  });

  const open = (e) => (EDITABLE.includes(e.status) ? navigate(`/examiner/exams/${e.id}`) : setReview(e.id));
  const statusOptions = mapOptions(EXAM_STATUS).filter((o) => !results || ['examiner_approved', 'approved'].includes(o.value));

  return (
    <>
      <PageHeader title={results ? 'نتائجي' : 'الامتحانات'}
        sub={results ? 'النتائج التي أرسلتها وحالتها لدى الإدارة.' : 'امتحاناتك: المسودات والجارية والمكتملة.'} />
      <ListCard
        key={mode}
        list={list}
        searchPlaceholder="ابحث برقم الامتحان أو اسم الطالب"
        filters={[{ value: status, onChange: setStatus, options: statusOptions, placeholder: 'كل الحالات' }]}
        onRowClick={open}
        emptyTitle={results ? 'لم ترسل نتائج بعد' : 'لا توجد امتحانات'}
        emptyText={results ? 'تظهر هنا النتائج بعد إنهاء الجلسة واعتمادها منك.' : 'ابدأ جلسة امتحان من صفحة «طلابي» أو «المواعيد».'}
        columns={[
          { label: 'رقم الامتحان', className: 'num', render: (e) => e.exam_no },
          { label: 'الطالب', render: (e) => e.full_name },
          { label: 'التاريخ', className: 'num', render: (e) => fmtDate(e.exam_date) },
          { label: 'الحالة', render: (e) => <StatusBadge map={EXAM_STATUS} value={e.status} /> },
          { label: 'الدرجة', className: 'num', render: (e) => fmtScore(e.score) },
          {
            label: results ? 'ملاحظة الإدارة' : '',
            className: 'small',
            render: (e) => results
              ? (e.admin_notes || '—')
              : <button className="btn ghost sm">{EDITABLE.includes(e.status) ? (e.status === 'rejected' ? 'تصحيح' : 'فتح الجلسة') : 'عرض'}</button>,
          },
        ]}
      />
      {review && <ExamReview examId={review} onClose={() => setReview(null)} />}
    </>
  );
}
