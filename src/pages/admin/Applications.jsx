import { useState } from 'react';
import { Link } from 'react-router';
import ListCard, { stop } from '../../components/ListCard';
import StudentProfile from '../../components/StudentProfile';
import { Icon } from '../../components/icons';
import { PageHeader, StatusBadge, mapOptions, rowsOptions } from '../../components/ui';
import { AssignModal, useApplicationActions } from '../../components/workflow';
import { useLookups, usePagedList } from '../../hooks/data';
import { APP_STATUS, SECTIONS } from '../../lib/constants';
import { fmtDate } from '../../lib/format';

const ASSIGNABLE = ['pending', 'under_review', 'approved', 'assigned', 'scheduled', 'absent', 'postponed'];

export default function Applications() {
  const { data: lookups } = useLookups();
  const [status, setStatus] = useState('');
  const [office, setOffice] = useState('');
  const [cycle, setCycle] = useState('');
  const [profile, setProfile] = useState(null);
  const [assign, setAssign] = useState(null);
  const actions = useApplicationActions();

  const list = usePagedList({
    key: 'applications',
    source: 'v_applications',
    searchCols: ['reg_no', 'full_name', 'national_id', 'phone'],
    filters: { status, office_id: office, cycle_id: cycle },
  });

  return (
    <>
      <PageHeader title="الطلبات" sub="مراجعة طلبات التسجيل وقبولها وإحالتها إلى المحفّظين."
        actions={<Link className="btn" to="/admin/applications/new"><Icon.plus /> إضافة طالب</Link>} />
      <ListCard
        list={list}
        searchPlaceholder="ابحث برقم الطلب أو اسم الطالب أو الرقم الوطني"
        filters={[
          { value: status, onChange: setStatus, options: mapOptions(APP_STATUS), placeholder: 'كل الحالات' },
          { value: office, onChange: setOffice, options: rowsOptions(lookups?.offices), placeholder: 'كل المكاتب' },
          { value: cycle, onChange: setCycle, options: rowsOptions(lookups?.cycles), placeholder: 'كل الدورات' },
        ]}
        onRowClick={(r) => setProfile(r.student_id)}
        exportName="الطلبات"
        exportColumns={[
          { label: 'رقم الطلب', value: (r) => r.reg_no },
          { label: 'رقم الطالب', value: (r) => r.student_no },
          { label: 'الطالب', value: (r) => r.full_name },
          { label: 'الرقم الوطني', value: (r) => r.national_id },
          { label: 'الهاتف', value: (r) => r.phone },
          { label: 'واتساب', value: (r) => r.whatsapp },
          { label: 'القسم', value: (r) => SECTIONS[r.section] },
          { label: 'الحلقة', value: (r) => r.circle_name },
          { label: 'المركز', value: (r) => r.center_name },
          { label: 'المكتب', value: (r) => r.office_name },
          { label: 'المستوى', value: (r) => r.level_name },
          { label: 'المتون', value: (r) => r.matn_names },
          { label: 'مقدار الحفظ', value: (r) => r.memorized_amount },
          { label: 'تاريخ التسجيل', value: (r) => fmtDate(r.created_at) },
          { label: 'الحالة', value: (r) => APP_STATUS[r.status]?.t },
          { label: 'المحفّظ', value: (r) => r.examiner_name },
        ]}
        columns={[
          { label: 'رقم الطلب', className: 'num', render: (r) => r.reg_no },
          { label: 'الطالب', render: (r) => r.full_name },
          { label: 'الرقم الوطني', className: 'num small', render: (r) => r.national_id },
          { label: 'الهاتف', className: 'num small', render: (r) => <span className="ltr">{r.phone}</span> },
          { label: 'الحلقة', className: 'small', render: (r) => r.circle_name },
          { label: 'المكتب', className: 'small muted', render: (r) => r.office_name },
          { label: 'التسجيل', className: 'num small', render: (r) => fmtDate(r.created_at) },
          { label: 'الحالة', render: (r) => <StatusBadge map={APP_STATUS} value={r.status} /> },
          { label: 'المحفّظ', className: 'small', render: (r) => r.examiner_name || '—' },
          {
            label: 'الإجراءات',
            render: (r) => (
              <div className="acts">
                <button className="btn ghost sm" title="ملف الطالب" onClick={stop(() => setProfile(r.student_id))}><Icon.eye /></button>
                {r.status === 'pending' && <button className="btn ghost sm" onClick={stop(() => actions.review(r))}>مراجعة</button>}
                {['pending', 'under_review', 'rejected'].includes(r.status) && (
                  <button className="btn ghost sm" onClick={stop(() => actions.approve(r))}>قبول</button>
                )}
                {ASSIGNABLE.includes(r.status) && (
                  <button className="btn ghost sm" onClick={stop(() => setAssign(r))}>{r.examiner_id ? 'إعادة تحويل' : 'تحويل'}</button>
                )}
                {['pending', 'under_review', 'approved', 'assigned', 'absent', 'postponed'].includes(r.status) && (
                  <button className="btn ghost sm" onClick={stop(() => actions.reject(r))}>رفض</button>
                )}
              </div>
            ),
          },
        ]}
      />
      {profile && <StudentProfile studentId={profile} onClose={() => setProfile(null)} />}
      {assign && <AssignModal application={assign} onClose={() => setAssign(null)} />}
    </>
  );
}
