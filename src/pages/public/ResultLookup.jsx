import { useState } from 'react';
import { Link } from 'react-router';
import { Empty, Kv, Skeleton, StatusBadge, Badge } from '../../components/ui';
import { rpc } from '../../lib/supabase';
import { AGGREGATES, APP_STATUS, ordinal } from '../../lib/constants';
import { errorMessage } from '../../lib/helpers';
import { fmtDate, fmtScore } from '../../lib/format';

export default function ResultLookup() {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: false, data: null, error: '' });

  const search = async (e) => {
    e.preventDefault();
    const v = q.trim();
    if (v.length < 5) {
      setState({ loading: false, data: null, error: 'أدخل رقم الطالب أو الرقم الوطني كاملاً.' });
      return;
    }
    setState({ loading: true, data: null, error: '' });
    try {
      setState({ loading: false, data: await rpc('lookup_result', { p_query: v }), error: '' });
    } catch (err) {
      setState({ loading: false, data: null, error: errorMessage(err) });
    }
  };

  const r = state.data;
  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <section className="sec">
        <div className="sec-h"><h2>الاستعلام عن النتيجة</h2><p>تظهر الدرجة بعد اعتمادها من الإدارة فقط.</p></div>
        <div className="card no-print">
          <form className="card-b" onSubmit={search}>
            <div className="row">
              <input className="inp ltr" style={{ flex: 1, minWidth: 220 }} placeholder="رقم الطالب أو الرقم الوطني"
                value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn teal" disabled={state.loading}>استعلام</button>
            </div>
            <p className="hint">رقم الطالب مدوّن في إيصال التسجيل، مثل STU-2026-00001.</p>
            {state.error && <div className="alert err">{state.error}</div>}
          </form>
        </div>

        <div className="mt">
          {state.loading && <div className="card"><Skeleton /></div>}

          {r?.state === 'not_found' && (
            <div className="card">
              <Empty title="لم يتم العثور على نتيجة"
                text="تأكد من رقم الطالب أو الرقم الوطني. إذا كان طلبك ما يزال قيد المعالجة، تابعه من صفحة متابعة الطلب."
                action={<Link className="btn ghost" to="/application-status">متابعة الطلب</Link>} />
            </div>
          )}

          {(r?.state === 'pending' || r?.state === 'in_progress') && (
            <div className="card">
              <div className="card-b" style={{ textAlign: 'center', padding: 34 }}>
                {r.state === 'pending' ? <Badge kind="warn">قيد المراجعة</Badge> : <StatusBadge map={APP_STATUS} value={r.status} />}
                <h3 className="mt-s">{r.state === 'pending' ? 'نتيجتك قيد المراجعة والاعتماد من الإدارة' : 'لم تصدر نتيجة بعد'}</h3>
                <p className="muted small">
                  {r.state === 'pending'
                    ? 'ستظهر الدرجة هنا فور اعتمادها. لا حاجة لإعادة الاستعلام أكثر من مرة يومياً.'
                    : 'طلبك ما يزال في مراحل المعالجة. تابع حالته لمعرفة الخطوة الحالية.'}
                </p>
                <Link className="btn ghost" to={`/application-status?q=${r.reg_no}`}>متابعة الطلب</Link>
              </div>
            </div>
          )}

          {r?.state === 'published' && (
            <div className="card">
              <div className="card-h"><h3>نتيجة امتحان الطالب</h3><StatusBadge map={APP_STATUS} value="published" /></div>
              <div className="card-b">
                <div className="result-grid">
                  <Kv items={[
                    ['اسم الطالب', r.student_name],
                    ['رقم الطالب', <span className="num ltr">{r.student_no}</span>],
                    ['رقم الامتحان', <span className="num ltr">{r.exam_no}</span>],
                    ['تاريخ الامتحان', fmtDate(r.exam_date)],
                    ['المحفّظ', r.examiner],
                    ['المكتب', r.office],
                    ['المستوى', r.level],
                  ]} />
                  <div className="score-box">
                    <div className="v">{fmtScore(r.score)}</div>
                    <div className="of">من 100</div>
                    <div className="mt-s"><Badge kind="gold">{r.grade ? `التقدير: ${r.grade}` : 'التقدير غير محدد'}</Badge></div>
                  </div>
                </div>

                <h4 className="kufi mt" style={{ fontSize: 15 }}>تفاصيل التقييم</h4>
                <p className="small muted" style={{ margin: '2px 0 10px' }}>المستوى: {r.level || '—'}</p>
                <div className="tbl-wrap cards">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>السؤال</th>
                        {(r.questions[0]?.criteria || []).map((c) => <th key={c.name}>{c.name}</th>)}
                        <th>مجموع الخصميات</th>
                        <th>درجة السؤال</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.questions.map((qq) => (
                        <tr key={qq.index}>
                          <td data-label="السؤال">{ordinal(qq.index)}</td>
                          {qq.criteria.map((c) => <td key={c.name} className="num" data-label={c.name}>{fmtScore(c.value)} / {fmtScore(c.max)}</td>)}
                          <td className="num" data-label="مجموع الخصميات"><bdi dir="ltr">−{fmtScore(qq.deductions_total)}</bdi></td>
                          <td className="num" data-label="درجة السؤال">{fmtScore(qq.score)} / {fmtScore(r.base)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">النتيجة النهائية = {AGGREGATES[r.aggregate] || 'متوسط الأسئلة'} · الدرجة محصورة بين 0 و100.</p>
                <div className="row mt no-print">
                  <button className="btn ghost" onClick={() => window.print()}>طباعة</button>
                  {r.certificate && (
                    <Link className="btn gold" to={`/certificate-verification?no=${r.certificate.cert_no}`}>
                      الشهادة {r.certificate.cert_no}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
