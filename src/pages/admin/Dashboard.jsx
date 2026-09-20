import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Empty, ErrorBox, PageHeader, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { rpc, supabase } from '../../lib/supabase';
import { APP_STATUS } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtDate, fmtMonth } from '../../lib/format';

export default function AdminDashboard() {
  const stats = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => rpc('admin_dashboard'), refetchInterval: 60_000 });
  const recent = useQuery({
    queryKey: ['recent-applications'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_applications')
        .select('id, reg_no, full_name, office_name, created_at, status').order('created_at', { ascending: false }).limit(6);
      if (error) throw error;
      return data;
    },
  });

  const d = stats.data;
  const maxMonth = Math.max(1, ...(d?.monthly || []).map((m) => m.count));

  return (
    <>
      <PageHeader title="لوحة المتابعة" sub="نظرة عامة على حركة الطلبات والامتحانات في البرنامج." />
      {stats.error && <ErrorBox error={errorMessage(stats.error)} onRetry={stats.refetch} />}
      <div className="stats">
        <Stat label="إجمالي الطلبة" value={d?.students} tone="b" />
        <Stat label="طلبات جديدة" value={d?.new_applications} tone="g" />
        <Stat label="طلبات مقبولة" value={d?.approved} tone="t" />
        <Stat label="طلاب محالون" value={d?.assigned} tone="t" />
        <Stat label="مواعيد مجدولة" value={d?.scheduled} />
        <Stat label="امتحانات منجزة" value={d?.exams_done} tone="n" />
        <Stat label="نتائج بانتظار الاعتماد" value={d?.pending_results} tone="r" />
        <Stat label="نتائج معتمدة" value={d?.approved_results} tone="t" />
        <Stat label="شهادات صادرة" value={d?.certificates} tone="g" />
      </div>

      <div className="grid split mt">
        <div className="card">
          <div className="card-h"><h3>أحدث الطلبات</h3><Link className="btn ghost sm" to="/admin/applications">عرض الكل</Link></div>
          {recent.isLoading ? <Skeleton /> : recent.data?.length ? (
            <div className="tbl-wrap cards">
              <table className="tbl">
                <thead><tr><th>رقم الطلب</th><th>الطالب</th><th>المكتب</th><th>التاريخ</th><th>الحالة</th></tr></thead>
                <tbody>
                  {recent.data.map((a) => (
                    <tr key={a.id}>
                      <td className="num">{a.reg_no}</td><td>{a.full_name}</td>
                      <td className="small muted">{a.office_name}</td><td className="num small">{fmtDate(a.created_at)}</td>
                      <td><StatusBadge map={APP_STATUS} value={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="لا توجد طلبات بعد" text="ستظهر هنا الطلبات فور تسجيلها من الموقع العام." />}
        </div>

        <div className="card">
          <div className="card-h"><h3>الامتحانات شهرياً</h3></div>
          <div className="card-b">
            {(d?.monthly || []).map((m) => (
              <div key={m.month} style={{ marginBottom: 14 }}>
                <div className="spread small"><span>{fmtMonth(m.month)}</span><span className="num muted">{m.count}</span></div>
                <div className="meter"><div style={{ width: `${(m.count / maxMonth) * 100}%` }} /></div>
              </div>
            ))}
            <div className="mt">
              <h4 className="kufi" style={{ fontSize: 14, marginBottom: 8 }}>بحاجة إلى إجراء</h4>
              {d?.pending_results > 0 && (
                <Link className="btn ghost sm block mb-s" to="/admin/results/pending" style={{ justifyContent: 'space-between' }}>
                  اعتماد {d.pending_results} نتائج <Badge kind="warn">عاجل</Badge>
                </Link>
              )}
              {d?.new_applications > 0 && (
                <Link className="btn ghost sm block mb-s" to="/admin/applications" style={{ justifyContent: 'space-between' }}>
                  مراجعة {d.new_applications} طلبات جديدة <Badge>جديد</Badge>
                </Link>
              )}
              {d?.ready_certificates > 0 && (
                <Link className="btn ghost sm block" to="/admin/certificates" style={{ justifyContent: 'space-between' }}>
                  إصدار {d.ready_certificates} شهادات <Badge kind="gold">جاهزة</Badge>
                </Link>
              )}
              {d && !d.pending_results && !d.new_applications && !d.ready_certificates && (
                <p className="small muted" style={{ margin: 0 }}>لا توجد مهام معلّقة.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
