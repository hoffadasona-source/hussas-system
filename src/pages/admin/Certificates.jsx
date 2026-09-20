import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CertificateView from '../../components/CertificateView';
import ListCard, { stop } from '../../components/ListCard';
import { Icon } from '../../components/icons';
import { Empty, Modal, PageHeader, Skeleton, Stat, StatusBadge, mapOptions } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { usePagedList, useSettings } from '../../hooks/data';
import { rpc, supabase } from '../../lib/supabase';
import { CERT_STATUS } from '../../lib/constants';
import { appUrl, fmtDate, fmtScore } from '../../lib/format';

function IssueModal({ onClose }) {
  const run = useAction();
  const [busyId, setBusyId] = useState(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['ready-certificates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_exams').select('*')
        .eq('status', 'approved').is('cert_no', null).order('approved_at', { ascending: true }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const issue = async (r) => {
    setBusyId(r.id);
    await run(() => rpc('issue_certificate', { p_exam_id: r.id }), `صدرت شهادة ${r.full_name}`);
    setBusyId(null);
  };
  return (
    <Modal wide title="إصدار شهادة" onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>إغلاق</button>}>
      <p className="muted small" style={{ marginTop: 0 }}>النتائج المعتمدة التي لم تصدر لها شهادة بعد.</p>
      {isLoading ? <Skeleton /> : data.length === 0 ? (
        <Empty title="لا توجد نتائج جاهزة" text="تظهر هنا النتائج بعد اعتمادها النهائي." />
      ) : (
        <div className="tbl-wrap cards"><table className="tbl">
          <thead><tr><th>رقم الامتحان</th><th>الطالب</th><th>الدرجة</th><th>اعتُمد</th><th /></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>
              <td className="num">{r.exam_no}</td><td>{r.full_name}</td><td className="num">{fmtScore(r.score)}</td>
              <td className="num small">{fmtDate(r.approved_at)}</td>
              <td><button className="btn sm gold" disabled={busyId === r.id} onClick={() => issue(r)}>{busyId === r.id && <span className="spinner" />} إصدار</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

export default function Certificates() {
  const { can, isSuper } = useAuth();
  const { data: settings } = useSettings();
  const { prompt } = useUi();
  const run = useAction();
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(null);
  const [issuing, setIssuing] = useState(false);

  const counts = useQuery({
    queryKey: ['certificate-counts'],
    queryFn: async () => {
      const [issued, ready] = await Promise.all([
        supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'valid'),
        supabase.from('v_exams').select('id', { count: 'exact', head: true }).eq('status', 'approved').is('cert_no', null),
      ]);
      return { issued: issued.count, ready: ready.count };
    },
  });

  const list = usePagedList({
    key: 'certificates',
    source: 'v_certificates',
    searchCols: ['cert_no', 'student_name', 'student_no', 'national_id'],
    filters: { status },
    order: ['issued_at', false],
  });

  const openPrint = (c) => window.open(appUrl(`certificates/${encodeURIComponent(c.cert_no)}/print`), '_blank', 'noopener');
  const revoke = async (c) => {
    const reason = await prompt({
      title: 'إلغاء الشهادة', text: `ستظهر الشهادة ${c.cert_no} «ملغاة» عند التحقق منها.`,
      label: 'سبب الإلغاء', okLabel: 'إلغاء الشهادة', danger: true,
    });
    if (reason) run(() => rpc('revoke_certificate', { p_certificate_id: c.id, p_reason: reason }), 'أُلغيت الشهادة');
  };

  return (
    <>
      <PageHeader title="الشهادات" sub="إصدار الشهادات للنتائج المعتمدة والتحقق منها."
        actions={can('issue_certificates') && <button className="btn gold" onClick={() => setIssuing(true)}><Icon.plus /> إصدار شهادة</button>} />
      <div className="stats mb" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
        <Stat label="شهادات سارية" value={counts.data?.issued} tone="g" />
        <Stat label="نتائج جاهزة للإصدار" value={counts.data?.ready} tone="t" />
      </div>
      <ListCard
        list={list}
        searchPlaceholder="ابحث برقم الشهادة أو اسم الطالب أو الرقم الوطني"
        filters={[{ value: status, onChange: setStatus, options: mapOptions(CERT_STATUS), placeholder: 'كل الحالات' }]}
        onRowClick={setPreview}
        emptyTitle="لا توجد شهادات"
        emptyText="أصدر الشهادات للنتائج المعتمدة من زر «إصدار شهادة»."
        exportName="الشهادات"
        exportColumns={[
          { label: 'رقم الشهادة', value: (r) => r.cert_no },
          { label: 'الطالب', value: (r) => r.student_name },
          { label: 'رقم الطالب', value: (r) => r.student_no },
          { label: 'رقم الامتحان', value: (r) => r.exam_no },
          { label: 'المستوى', value: (r) => r.level_name },
          { label: 'الدرجة', value: (r) => r.score },
          { label: 'التقدير', value: (r) => r.grade },
          { label: 'تاريخ الإصدار', value: (r) => fmtDate(r.issued_at) },
          { label: 'الحالة', value: (r) => CERT_STATUS[r.status]?.t },
        ]}
        columns={[
          { label: 'رقم الشهادة', className: 'num', render: (r) => r.cert_no },
          { label: 'الطالب', render: (r) => r.student_name },
          { label: 'الامتحان', className: 'num small', render: (r) => r.exam_no },
          { label: 'الدرجة', className: 'num', render: (r) => fmtScore(r.score) },
          { label: 'التقدير', render: (r) => r.grade || '—' },
          { label: 'الإصدار', className: 'num small', render: (r) => fmtDate(r.issued_at) },
          { label: 'الحالة', render: (r) => <StatusBadge map={CERT_STATUS} value={r.status} /> },
          {
            label: 'الإجراءات',
            render: (r) => (
              <div className="acts">
                <button className="btn ghost sm" onClick={stop(() => setPreview(r))}>معاينة</button>
                <button className="btn ghost sm" onClick={stop(() => openPrint(r))}><Icon.print /> PDF</button>
                {isSuper && r.status === 'valid' && <button className="btn ghost sm" onClick={stop(() => revoke(r))}>إلغاء</button>}
              </div>
            ),
          },
        ]}
      />
      {preview && (
        <Modal wide title="معاينة الشهادة" onClose={() => setPreview(null)}
          footer={<>
            <button className="btn" onClick={() => openPrint(preview)}><Icon.print /> طباعة / PDF</button>
            <button className="btn ghost" onClick={() => setPreview(null)}>إغلاق</button>
          </>}>
          <CertificateView cert={preview} settings={settings} />
        </Modal>
      )}
      {issuing && <IssueModal onClose={() => setIssuing(false)} />}
    </>
  );
}
