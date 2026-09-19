import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Empty, Kv, Skeleton, StatusBadge } from '../../components/ui';
import { rpc } from '../../lib/supabase';
import { APP_STATUS, APPOINTMENT_MODES } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtDate, fmtTime } from '../../lib/format';

const ORDER = ['pending', 'under_review', 'approved', 'assigned', 'scheduled', 'in_exam', 'admin_pending', 'published'];

function buildTimeline(a) {
  const idx = ORDER.indexOf(a.status);
  const reached = (s) => idx >= ORDER.indexOf(s);
  const apt = a.appointment;
  const items = [
    ['إرسال الطلب', fmtDate(a.created_at), 'done'],
    a.status === 'rejected'
      ? ['رفض الطلب', a.rejection_reason || fmtDate(a.reviewed_at), 'fail']
      : ['مراجعة الإدارة', a.reviewed_at ? fmtDate(a.reviewed_at) : '—', reached('approved') ? 'done' : 'now'],
  ];
  if (a.status === 'rejected') return items;

  items.push(['الإحالة إلى محفّظ', a.assigned_at ? `${fmtDate(a.assigned_at)}${a.examiner ? ` — ${a.examiner}` : ''}` : '—',
    reached('assigned') ? 'done' : reached('approved') ? 'now' : 'next']);

  const aptText = apt ? `${fmtDate(apt.date)} · ${fmtTime(apt.time)} — ${APPOINTMENT_MODES[apt.mode] || ''}` : '—';
  if (a.status === 'absent') items.push(['موعد الامتحان', `${aptText} (غياب — بانتظار موعد جديد)`, 'fail']);
  else if (a.status === 'postponed') items.push(['موعد الامتحان', `${aptText} (مؤجل — بانتظار موعد جديد)`, 'now']);
  else items.push(['تحديد موعد الامتحان', aptText, reached('in_exam') ? 'done' : reached('scheduled') ? 'now' : 'next']);

  items.push(['إجراء الامتحان', a.exam_submitted_at ? fmtDate(a.exam_submitted_at) : '—',
    reached('admin_pending') ? 'done' : a.status === 'in_exam' ? 'now' : 'next']);
  items.push(['اعتماد النتيجة', a.result_approved_at ? fmtDate(a.result_approved_at) : '—',
    reached('published') ? 'done' : a.status === 'admin_pending' ? 'now' : 'next']);
  items.push(['إصدار الشهادة', a.certificate_issued_at ? fmtDate(a.certificate_issued_at) : '—',
    a.certificate_issued_at ? 'done' : reached('published') ? 'now' : 'next']);
  return items;
}

export default function ApplicationStatus() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [state, setState] = useState({ loading: false, data: undefined, error: '' });

  const search = async (value) => {
    const v = value.trim();
    if (v.length < 5) {
      setState({ loading: false, data: undefined, error: 'أدخل رقم الطلب أو الرقم الوطني كاملاً.' });
      return;
    }
    setParams({ q: v }, { replace: true });
    setState({ loading: true, data: undefined, error: '' });
    try {
      const data = await rpc('track_application', { p_query: v });
      setState({ loading: false, data, error: '' });
    } catch (err) {
      setState({ loading: false, data: undefined, error: errorMessage(err) });
    }
  };

  useEffect(() => {
    if (params.get('q')) search(params.get('q'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const a = state.data;
  return (
    <div className="wrap" style={{ maxWidth: 840 }}>
      <section className="sec">
        <div className="sec-h"><h2>متابعة حالة الطلب</h2><p>أدخل رقم الطلب أو الرقم الوطني.</p></div>
        <div className="card">
          <form className="card-b row" onSubmit={(e) => { e.preventDefault(); search(q); }}>
            <input className="inp ltr" style={{ flex: 1, minWidth: 220 }} placeholder="REG-2026-00001 أو الرقم الوطني"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn teal" disabled={state.loading}>بحث</button>
          </form>
          {state.error && <div className="card-b" style={{ paddingTop: 0 }}><div className="alert err">{state.error}</div></div>}
        </div>

        <div className="mt">
          {state.loading && <div className="card"><Skeleton /></div>}
          {a === null && (
            <div className="card">
              <Empty title="لم يتم العثور على طلب" text="تأكد من رقم الطلب أو الرقم الوطني كما أُدخل عند التسجيل." />
            </div>
          )}
          {a && (
            <div className="card">
              <div className="card-h"><h3>الطلب <span className="num ltr">{a.reg_no}</span></h3><StatusBadge map={APP_STATUS} value={a.status} /></div>
              <div className="card-b">
                <Kv items={[
                  ['اسم الطالب', a.student_name],
                  ['الدورة', a.cycle],
                  ['المكتب', a.office],
                  ['الحلقة', a.circle],
                  ['المحفّظ', a.examiner || 'لم يُحَل بعد'],
                ]} />
                <div className="timeline">
                  {buildTimeline(a).map(([t, d, k]) => (
                    <div key={t} className={`tl-item ${k}`}>
                      <div className="tl-dot" />
                      <div><div className="tl-t">{t}</div><div className="tiny muted">{d}</div></div>
                    </div>
                  ))}
                </div>
                {a.status === 'published' && (
                  <Link className="btn gold" to="/result">عرض النتيجة</Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
