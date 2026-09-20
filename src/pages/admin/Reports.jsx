import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/icons';
import { Empty, ErrorBox, PageHeader, Select, Skeleton, Stat, rowsOptions } from '../../components/ui';
import { useLookups } from '../../hooks/data';
import { rpc } from '../../lib/supabase';
import { APP_STATUS } from '../../lib/constants';
import { downloadCsv, errorMessage } from '../../lib/helpers';
import { fmtScore, todayISO } from '../../lib/format';

function BreakdownTable({ title, rows, cols }) {
  return (
    <div className="card flat mt">
      <div className="card-h"><h3>{title}</h3></div>
      {rows?.length ? (
        <div className="tbl-wrap cards"><table className="tbl">
          <thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.label} className={c.className}>{c.render(r)}</td>)}</tr>)}</tbody>
        </table></div>
      ) : <Empty title="لا توجد بيانات" text="لا توجد نتائج معتمدة ضمن المرشحات الحالية." />}
    </div>
  );
}

const meter = (v) => (
  <div className="meter"><div style={{ width: `${Math.max(0, Math.min(100, Number(v) || 0))}%` }} /></div>
);

export default function Reports() {
  const { data: lookups } = useLookups();
  const [f, setF] = useState({ office: '', from: '', to: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  const { data: r, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['report', f],
    queryFn: () => rpc('report_summary', {
      p_office_id: f.office || null, p_from: f.from || null, p_to: f.to || null,
    }),
  });

  const exportAll = () => {
    const rows = [
      ...(r.by_office || []).map((o) => ({ section: 'المكتب', name: o.name, applications: o.applications, exams: o.exams, average: o.average })),
      ...(r.by_examiner || []).map((o) => ({ section: 'المحفّظ', name: o.name, applications: '', exams: o.exams, average: o.average })),
      ...(r.by_level || []).map((o) => ({ section: 'المستوى', name: o.name, applications: '', exams: o.exams, average: o.average })),
      ...(r.deductions || []).map((o) => ({ section: 'الخصميات', name: o.name, applications: '', exams: o.count, average: '' })),
    ];
    downloadCsv(`تقرير-${todayISO()}`, [
      { label: 'القسم', value: (x) => x.section },
      { label: 'البند', value: (x) => x.name },
      { label: 'الطلبات', value: (x) => x.applications },
      { label: 'الامتحانات / العدد', value: (x) => x.exams },
      { label: 'متوسط الدرجة', value: (x) => x.average },
    ], rows);
  };

  const maxDed = Math.max(1, ...(r?.deductions || []).map((d) => d.count));

  return (
    <>
      <PageHeader title="التقارير" sub="مؤشرات الأداء حسب الدورة والمكتب والمحفّظ والفترة." />
      <div className="card">
        <div className="toolbar no-print">
          <Select className="inp w" value={f.office} onChange={set('office')} options={rowsOptions(lookups?.offices)} placeholder="كل المكاتب" />
          <label className="row small muted" style={{ gap: 6 }}>من <input className="inp" type="date" value={f.from} onChange={set('from')} style={{ width: 150 }} /></label>
          <label className="row small muted" style={{ gap: 6 }}>إلى <input className="inp" type="date" value={f.to} onChange={set('to')} style={{ width: 150 }} /></label>
          <div style={{ flex: 1 }} />
          {isFetching && <span className="spinner" style={{ color: 'var(--text-3)' }} />}
          <button className="btn ghost sm" onClick={() => window.print()}><Icon.print /> PDF</button>
          <button className="btn ghost sm" onClick={exportAll} disabled={!r}><Icon.download /> Excel</button>
        </div>
        <div className="card-b">
          {error && <ErrorBox error={errorMessage(error)} onRetry={refetch} />}
          {isLoading ? <Skeleton lines={6} /> : r && (
            <>
              <div className="stats">
                <Stat label="الطلبات" value={r.applications} tone="b" />
                <Stat label="امتحانات معتمدة" value={r.exams} tone="t" />
                <Stat label="متوسط الدرجات" value={fmtScore(r.average)} tone="n" />
                <Stat label="نسبة النجاح" value={r.pass_rate != null ? `${fmtScore(r.pass_rate)}%` : '—'} tone="g" />
                <Stat label="حالات الغياب" value={r.absences} tone="r" />
              </div>
              {r.pass_rate == null && <p className="hint">نسبة النجاح تُحتسب بعد تحديد النطاقات الناجحة في سلّم التقديرات.</p>}

              {Object.keys(r.by_status || {}).length > 0 && (
                <div className="row mt">
                  {Object.entries(r.by_status).map(([k, v]) => (
                    <span key={k} className={`badge ${APP_STATUS[k]?.c || ''}`}>{APP_STATUS[k]?.t || k}: {v}</span>
                  ))}
                </div>
              )}

              <BreakdownTable title="الأداء حسب المكتب" rows={r.by_office} cols={[
                { label: 'المكتب', render: (o) => o.name },
                { label: 'الطلبات', className: 'num', render: (o) => o.applications },
                { label: 'امتحانات معتمدة', className: 'num', render: (o) => o.exams },
                { label: 'متوسط الدرجة', className: 'num', render: (o) => fmtScore(o.average) },
                { label: 'التوزيع', render: (o) => meter(o.average) },
              ]} />
              <div className="grid cols-2">
                <BreakdownTable title="الأداء حسب المحفّظ" rows={r.by_examiner} cols={[
                  { label: 'المحفّظ', render: (o) => o.name },
                  { label: 'الامتحانات', className: 'num', render: (o) => o.exams },
                  { label: 'المتوسط', className: 'num', render: (o) => fmtScore(o.average) },
                ]} />
                <BreakdownTable title="الأداء حسب المستوى" rows={r.by_level} cols={[
                  { label: 'المستوى', render: (o) => o.name },
                  { label: 'الامتحانات', className: 'num', render: (o) => o.exams },
                  { label: 'المتوسط', className: 'num', render: (o) => fmtScore(o.average) },
                ]} />
              </div>
              <BreakdownTable title="أكثر الأخطاء تكراراً" rows={r.deductions} cols={[
                { label: 'نوع الخصم', render: (o) => o.name },
                { label: 'عدد المرات', className: 'num', render: (o) => o.count },
                { label: '', render: (o) => meter((o.count / maxDed) * 100) },
              ]} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
