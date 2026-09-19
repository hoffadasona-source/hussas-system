import { useState } from 'react';
import { Link } from 'react-router';
import ListCard from '../../components/ListCard';
import StudentProfile from '../../components/StudentProfile';
import { Icon } from '../../components/icons';
import { PageHeader, StatusBadge, mapOptions, rowsOptions } from '../../components/ui';
import { useExaminers, usePagedList } from '../../hooks/data';
import { APP_STATUS, GENDERS } from '../../lib/constants';
import { fmtScore } from '../../lib/format';

export default function Students() {
  const { data: examiners } = useExaminers();
  const [status, setStatus] = useState('');
  const [examiner, setExaminer] = useState('');
  const [profile, setProfile] = useState(null);

  const list = usePagedList({
    key: 'students',
    source: 'v_students',
    searchCols: ['full_name', 'national_id', 'student_no', 'phone'],
    filters: { application_status: status, examiner_id: examiner },
  });

  return (
    <>
      <PageHeader title="الطلبة" sub="ملفات الطلبة وسجلاتهم الكاملة."
        actions={<Link className="btn" to="/admin/applications/new"><Icon.plus /> إضافة طالب</Link>} />
      <ListCard
        list={list}
        searchPlaceholder="ابحث بالاسم أو الرقم الوطني أو رقم الطالب"
        filters={[
          { value: status, onChange: setStatus, options: mapOptions(APP_STATUS), placeholder: 'كل الحالات' },
          { value: examiner, onChange: setExaminer, options: rowsOptions(examiners, 'full_name'), placeholder: 'كل المحفّظين' },
        ]}
        onRowClick={(r) => setProfile(r.id)}
        exportName="الطلبة"
        exportColumns={[
          { label: 'رقم الطالب', value: (r) => r.student_no },
          { label: 'الاسم', value: (r) => r.full_name },
          { label: 'الرقم الوطني', value: (r) => r.national_id },
          { label: 'تاريخ الميلاد', value: (r) => r.birth_date },
          { label: 'الجنس', value: (r) => GENDERS[r.gender] },
          { label: 'الإقامة', value: (r) => r.residence },
          { label: 'الهاتف', value: (r) => r.phone },
          { label: 'واتساب', value: (r) => r.whatsapp },
          { label: 'البريد', value: (r) => r.email },
          { label: 'المستوى', value: (r) => r.level_name },
          { label: 'المكتب', value: (r) => r.office_name },
          { label: 'المحفّظ', value: (r) => r.examiner_name },
          { label: 'الحالة', value: (r) => APP_STATUS[r.application_status]?.t },
          { label: 'الدرجة', value: (r) => r.exam_score },
          { label: 'عدد الطلبات', value: (r) => r.applications_count },
        ]}
        columns={[
          { label: 'رقم الطالب', className: 'num', render: (r) => r.student_no },
          { label: 'الاسم', render: (r) => r.full_name },
          { label: 'الرقم الوطني', className: 'num small', render: (r) => r.national_id },
          { label: 'المستوى', className: 'small', render: (r) => r.level_name || '—' },
          { label: 'مقدار الحفظ', className: 'small', render: (r) => r.memorized_amount || '—' },
          { label: 'المكتب', className: 'small muted', render: (r) => r.office_name || '—' },
          { label: 'الحالة', render: (r) => (r.application_status ? <StatusBadge map={APP_STATUS} value={r.application_status} /> : '—') },
          { label: 'الدرجة', className: 'num', render: (r) => fmtScore(r.exam_score) },
        ]}
      />
      {profile && <StudentProfile studentId={profile} onClose={() => setProfile(null)} />}
    </>
  );
}
