import { useState } from 'react';
import ListCard, { stop } from '../../components/ListCard';
import ExamReview from '../../components/ExamReview';
import { Badge, PageHeader, StatusBadge, rowsOptions } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useAuth } from '../../context/AuthContext';
import { useUi } from '../../context/UiContext';
import { useExaminers, useLookups, usePagedList } from '../../hooks/data';
import { rpc } from '../../lib/supabase';
import { CERT_STATUS, EXAM_STATUS } from '../../lib/constants';
import { fmtDate, fmtScore } from '../../lib/format';

export default function Results({ pending }) {
  const { can } = useAuth();
  const { confirm, prompt } = useUi();
  const run = useAction();
  const { data: examiners } = useExaminers();
  const { data: lookups } = useLookups();
  const [examiner, setExaminer] = useState('');
  const [cycle, setCycle] = useState('');
  const [open, setOpen] = useState(null);

  const list = usePagedList({
    key: pending ? 'results-pending' : 'results',
    source: 'v_exams',
    searchCols: ['exam_no', 'full_name', 'student_no'],
    filters: { status: pending ? 'examiner_approved' : 'approved', examiner_id: examiner, cycle_id: cycle },
    order: pending ? ['submitted_at', true] : ['approved_at', false],
  });

  const approve = async (r) => {
    const ok = await confirm({
      title: 'اعتماد النتيجة',
      text: `اعتماد نتيجة «${r.full_name}» بدرجة ${fmtScore(r.score)}؟ بعد الاعتماد تصبح النتيجة ظاهرة للطالب ولا يمكن تعديلها إلا بإجراء إداري.`,
      okLabel: 'اعتماد النتيجة',
    });
    if (ok) run(() => rpc('approve_exam', { p_exam_id: r.id, p_notes: null }), 'اعتُمدت النتيجة');
  };
  const giveBack = async (r) => {
    const reason = await prompt({
      title: 'رفض وإرجاع للمحفّظ', text: 'تعود حالة الامتحان إلى «مُعاد للمحفّظ»، ويظل السجل السابق محفوظاً.',
      label: 'سبب الإرجاع', placeholder: 'اذكر ما يجب تصحيحه بدقة', okLabel: 'إرجاع النتيجة', danger: true,
    });
    if (reason) run(() => rpc('return_exam', { p_exam_id: r.id, p_reason: reason }), 'أُعيدت النتيجة إلى المحفّظ');
  };
  const issue = (r) => run(() => rpc('issue_certificate', { p_exam_id: r.id }), 'صدرت الشهادة');

  const canApprove = can('final_approve');

  return (
    <>
      <PageHeader
        title={pending ? 'نتائج بانتظار الاعتماد' : 'النتائج'}
        sub={pending ? 'راجع تفاصيل التقييم قبل الاعتماد النهائي.' : 'سجل النتائج المعتمدة والمنشورة.'}
      />
      {pending && !canApprove && (
        <div className="alert warn mb">لا تملك صلاحية الاعتماد النهائي. يمكنك مراجعة التفاصيل فقط.</div>
      )}
      <ListCard
        list={list}
        searchPlaceholder="ابحث برقم الامتحان أو اسم الطالب"
        filters={[
          { value: examiner, onChange: setExaminer, options: rowsOptions(examiners, 'full_name'), placeholder: 'كل المحفّظين' },
          { value: cycle, onChange: setCycle, options: rowsOptions(lookups?.cycles), placeholder: 'كل الدورات' },
        ]}
        onRowClick={(r) => setOpen(r.id)}
        emptyTitle={pending ? 'لا توجد نتائج بانتظار الاعتماد' : 'لا توجد نتائج معتمدة'}
        emptyText={pending ? 'كل ما وصل من المحفّظين تمت مراجعته.' : 'تظهر النتائج هنا بعد اعتمادها.'}
        exportName={pending ? 'نتائج-بانتظار-الاعتماد' : 'النتائج'}
        exportColumns={[
          { label: 'رقم الامتحان', value: (r) => r.exam_no },
          { label: 'رقم الطالب', value: (r) => r.student_no },
          { label: 'الطالب', value: (r) => r.full_name },
          { label: 'المحفّظ', value: (r) => r.examiner_name },
          { label: 'المكتب', value: (r) => r.office_name },
          { label: 'التاريخ', value: (r) => r.exam_date },
          { label: 'الدرجة', value: (r) => r.score },
          { label: 'الشهادة', value: (r) => r.cert_no },
        ]}
        columns={[
          { label: 'رقم الامتحان', className: 'num', render: (r) => r.exam_no },
          { label: 'الطالب', render: (r) => r.full_name },
          { label: 'المحفّظ', render: (r) => r.examiner_name },
          { label: 'التاريخ', className: 'num', render: (r) => fmtDate(r.exam_date) },
          { label: 'الدرجة', className: 'num', render: (r) => <b>{fmtScore(r.score)}</b> },
          {
            label: pending ? 'الحالة' : 'الشهادة',
            render: (r) => pending
              ? <StatusBadge map={EXAM_STATUS} value={r.status} />
              : r.cert_no ? <StatusBadge map={CERT_STATUS} value={r.certificate_status} /> : <Badge kind="gold">جاهزة للإصدار</Badge>,
          },
          {
            label: 'الإجراءات',
            render: (r) => (
              <div className="acts">
                <button className="btn ghost sm" onClick={stop(() => setOpen(r.id))}>مراجعة</button>
                {pending && canApprove && <>
                  <button className="btn sm teal" onClick={stop(() => approve(r))}>اعتماد</button>
                  <button className="btn sm danger" onClick={stop(() => giveBack(r))}>إرجاع</button>
                </>}
                {!pending && !r.cert_no && can('issue_certificates') && (
                  <button className="btn sm gold" onClick={stop(() => issue(r))}>إصدار شهادة</button>
                )}
              </div>
            ),
          },
        ]}
      />
      {open && <ExamReview examId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
