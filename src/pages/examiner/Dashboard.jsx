import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Empty, ErrorBox, PageHeader, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { rpc, supabase } from '../../lib/supabase';
import { APPOINTMENT_MODES, EXAM_STATUS } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtDate, fmtTime, todayISO } from '../../lib/format';

export default function ExaminerDashboard() {
  const navigate = useNavigate();
  const run = useAction();
  const stats = useQuery({ queryKey: ['examiner-dashboard'], queryFn: () => rpc('examiner_dashboard'), refetchInterval: 60_000 });
  const upcoming = useQuery({
    queryKey: ['examiner-upcoming'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_appointments').select('*').eq('status', 'scheduled')
        .gte('exam_date', todayISO()).order('exam_date').order('exam_time').limit(6);
      if (error) throw error;
      return data;
    },
  });
  const attention = useQuery({
    queryKey: ['examiner-attention'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_exams').select('*')
        .in('status', ['draft', 'in_progress', 'rejected', 'examiner_approved']).order('updated_at', { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });

  const start = async (a) => {
    const id = await run(() => rpc('start_exam', { p_application_id: a.application_id }));
    if (id) navigate(`/examiner/exams/${id}`);
  };

  const d = stats.data;
  return (
    <>
      <PageHeader title="لوحة المتابعة" sub="طلابك ومواعيدك وجلساتك فقط." />
      {stats.error && <ErrorBox error={errorMessage(stats.error)} onRetry={stats.refetch} />}
      <div className="stats">
        <Stat label="الطلاب المحالون" value={d?.students} tone="b" />
        <Stat label="مواعيد قادمة" value={d?.upcoming} tone="t" />
        <Stat label="امتحانات اليوم" value={d?.today} tone="g" />
        <Stat label="جلسات مفتوحة" value={d?.open_exams} tone="n" />
        <Stat label="نتائج مرسلة" value={d?.submitted} tone="t" />
        <Stat label="بانتظار اعتماد الإدارة" value={d?.awaiting_admin} tone="r" />
      </div>

      <div className="grid cols-2 mt">
        <div className="card">
          <div className="card-h"><h3>الجلسات القادمة</h3><Link className="btn ghost sm" to="/examiner/appointments">الكل</Link></div>
          <div className="card-b">
            {upcoming.isLoading ? <Skeleton /> : upcoming.data?.length ? upcoming.data.map((a) => (
              <div key={a.id} className="spread" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: 13, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{a.full_name} {a.exam_date === todayISO() && <Badge kind="gold">اليوم</Badge>}</div>
                  <div className="small muted">{fmtDate(a.exam_date)} · {fmtTime(a.exam_time)} — {APPOINTMENT_MODES[a.mode]}</div>
                </div>
                <button className="btn sm teal" onClick={() => start(a)}>{a.exam_id ? 'استئناف' : 'بدء الجلسة'}</button>
              </div>
            )) : <Empty title="لا جلسات قريبة" text="حدد موعد جلسة لأحد طلابك من صفحة «طلابي»." action={<Link className="btn ghost sm" to="/examiner/students">طلابي</Link>} />}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>بحاجة إلى إجراء</h3></div>
          <div className="card-b">
            {attention.isLoading ? <Skeleton /> : attention.data?.length ? attention.data.map((e) => (
              <div key={e.id} className="spread" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: 13, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {e.status === 'rejected' ? 'امتحان مُعاد من الإدارة' : e.status === 'examiner_approved' ? 'نتيجة بانتظار الإدارة' : 'امتحان غير مكتمل'}
                  </div>
                  <div className="small muted">{e.exam_no} — {e.full_name}</div>
                  {e.status === 'rejected' && e.return_reason && <div className="tiny" style={{ color: 'var(--err)' }}>{e.return_reason}</div>}
                </div>
                {e.status === 'examiner_approved'
                  ? <StatusBadge map={EXAM_STATUS} value={e.status} />
                  : <Link className="btn sm" to={`/examiner/exams/${e.id}`}>{e.status === 'rejected' ? 'تصحيح' : 'استكمال'}</Link>}
              </div>
            )) : <Empty title="لا توجد مهام معلّقة" />}
          </div>
        </div>
      </div>
    </>
  );
}
