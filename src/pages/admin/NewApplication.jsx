import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import RegistrationForm from '../../components/RegistrationForm';
import { PageHeader } from '../../components/ui';

export default function NewApplication() {
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title="إضافة طالب" sub="تسجيل طلب نيابةً عن الطالب. يُسجَّل الإجراء في سجل العمليات."
        actions={<Link className="btn ghost" to="/admin/applications">العودة إلى الطلبات</Link>} />
      <div className="card" style={{ maxWidth: 900 }}>
        <RegistrationForm mode="admin" onCreated={() => qc.invalidateQueries()} />
      </div>
    </>
  );
}
