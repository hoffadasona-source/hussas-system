import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorBox, Field, Kv, Modal, Skeleton, StatusBadge } from './ui';
import { useAction } from './workflow';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { rpc, supabase } from '../lib/supabase';
import { AGGREGATES, CERT_STATUS, EXAM_STATUS, ordinal } from '../lib/constants';
import { errorMessage } from '../lib/helpers';
import { fmtDate, fmtDateTime, fmtScore } from '../lib/format';
import { criterionValue, questionDeductionsTotal } from '../lib/scoring';

export function useExamDetails(examId) {
  return useQuery({
    queryKey: ['exam', examId],
    enabled: !!examId,
    queryFn: async () => {
      const [exam, view, questions] = await Promise.all([
        supabase.from('exams').select('*').eq('id', examId).single(),
        supabase.from('v_exams').select('*').eq('id', examId).single(),
        supabase.from('exam_questions').select('*').eq('exam_id', examId).order('q_index'),
      ]);
      for (const r of [exam, view, questions]) if (r.error) throw r.error;
      const app = await supabase.from('v_applications').select('level_name, memorized_amount, verses_range, whatsapp')
        .eq('id', exam.data.application_id).single();
      return { exam: { ...exam.data, ...view.data }, questions: questions.data, app: app.data || {} };
    },
  });
}

export default function ExamReview({ examId, onClose }) {
  const { can, isSuper, isAdmin } = useAuth();
  const { confirm, prompt } = useUi();
  const run = useAction();
  const { data, isLoading, error, refetch } = useExamDetails(examId);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn, message) => {
    setBusy(true);
    const ok = await run(fn, message);
    setBusy(false);
    if (ok) onClose();
  };

  const approve = async () => {
    const ok = await confirm({
      title: 'اعتماد النتيجة',
      text: 'بعد الاعتماد تصبح النتيجة ظاهرة للطالب ولا يمكن تعديلها إلا بإجراء إداري.',
      okLabel: 'اعتماد النتيجة',
    });
    if (ok) act(() => rpc('approve_exam', { p_exam_id: examId, p_notes: notes }), 'اعتُمدت النتيجة');
  };
  const giveBack = async (approved) => {
    const reason = await prompt({
      title: approved ? 'إعادة فتح نتيجة معتمدة' : 'رفض وإرجاع للمحفّظ',
      text: approved
        ? 'إجراء استثنائي: تُخفى النتيجة عن الطالب، وتُلغى أي شهادة صادرة، ويعود الامتحان للمحفّظ.'
        : 'تعود حالة الامتحان إلى «مُعاد للمحفّظ»، ويظل السجل السابق محفوظاً.',
      label: 'سبب الإرجاع',
      placeholder: 'اذكر ما يجب تصحيحه بدقة ليتمكن المحفّظ من التعديل',
      okLabel: 'إرجاع النتيجة',
      danger: true,
    });
    if (reason) act(() => rpc('return_exam', { p_exam_id: examId, p_reason: reason }), 'أُعيدت النتيجة إلى المحفّظ');
  };
  const issue = () => act(async () => {
    const no = await rpc('issue_certificate', { p_exam_id: examId });
    return no;
  }, 'صدرت الشهادة');

  const e = data?.exam;
  const cfg = e?.config;
  return (
    <Modal wide title={e ? `مراجعة النتيجة — ${e.exam_no}` : 'مراجعة النتيجة'} onClose={onClose}
      footer={<>
        {isAdmin && e?.status === 'examiner_approved' && can('final_approve') && <>
          <button className="btn teal" onClick={approve} disabled={busy}>اعتماد النتيجة</button>
          <button className="btn danger" onClick={() => giveBack(false)} disabled={busy}>رفض وإرجاع للمحفّظ</button>
        </>}
        {isAdmin && e?.status === 'approved' && !e.cert_no && can('issue_certificates') && (
          <button className="btn gold" onClick={issue} disabled={busy}>إصدار الشهادة</button>
        )}
        {isSuper && e?.status === 'approved' && (
          <button className="btn danger" onClick={() => giveBack(true)} disabled={busy}>إعادة فتح النتيجة</button>
        )}
        <button className="btn ghost" onClick={onClose}>إغلاق</button>
      </>}>
      {isLoading && <Skeleton lines={6} />}
      {error && <ErrorBox error={errorMessage(error)} onRetry={refetch} />}
      {e && (
        <>
          <div className="result-grid" style={{ gridTemplateColumns: '1fr 200px' }}>
            <Kv items={[
              ['الطالب', e.full_name],
              ['رقم الطالب', <span className="num ltr">{e.student_no}</span>],
              ['المحفّظ', e.examiner_name],
              ['تاريخ الامتحان', fmtDate(e.exam_date)],
              ['المستوى', data.app.level_name],
              ['مقدار الحفظ', data.app.memorized_amount],
              ['الحالة', <StatusBadge map={EXAM_STATUS} value={e.status} />],
              e.submitted_at && ['أُرسل للإدارة', fmtDateTime(e.submitted_at)],
              e.approved_at && ['اعتُمد', fmtDateTime(e.approved_at)],
              e.cert_no && ['الشهادة', <>{e.cert_no} <StatusBadge map={CERT_STATUS} value={e.certificate_status} /></>],
            ]} />
            <div className="score-box"><div className="v">{fmtScore(e.score)}</div><div className="of">من 100</div></div>
          </div>

          {e.return_reason && e.status === 'rejected' && <div className="alert warn mt">سبب الإرجاع: {e.return_reason}</div>}

          <h4 className="kufi mt" style={{ fontSize: 14.5 }}>تفاصيل الأسئلة</h4>
          <p className="small muted" style={{ margin: '2px 0 8px' }}>المستوى: {data.app.level_name || '—'}{data.app.memorized_amount ? ` — ${data.app.memorized_amount}` : ''}</p>
          <div className="tbl-wrap cards">
            <table className="tbl">
              <thead>
                <tr>
                  <th>السؤال</th>
                  {cfg.criteria.map((c) => <th key={c.id}>{c.name}</th>)}
                  <th>الخصميات المسجّلة</th><th>مجموع الخصم</th><th>الدرجة</th>
                </tr>
              </thead>
              <tbody>
                {data.questions.map((q) => {
                  const hits = cfg.deductions.filter((d) => q.deductions?.[d.id] > 0);
                  return (
                    <tr key={q.q_index}>
                      <td data-label="السؤال">{ordinal(q.q_index)}</td>
                      {cfg.criteria.map((c) => <td key={c.id} className="num" data-label={c.name}>{fmtScore(criterionValue(cfg, q, c))}/{fmtScore(c.max_score)}</td>)}
                      <td className="small" data-label="الخصميات المسجّلة">
                        {hits.length ? hits.map((d) => `${d.name} ×${q.deductions[d.id]} (−${fmtScore(d.value * q.deductions[d.id])})`).join(' · ') : '—'}
                      </td>
                      <td className="num" data-label="مجموع الخصم" style={{ color: 'var(--err)' }}><bdi dir="ltr">−{fmtScore(questionDeductionsTotal(cfg, q))}</bdi></td>
                      <td className="num" data-label="الدرجة">{fmtScore(q.score)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            الأساس {fmtScore(cfg.base)} لكل سؤال · النتيجة النهائية = {AGGREGATES[cfg.aggregate]} · القواعد المطبّقة هي المعتمدة وقت بدء الامتحان.
          </p>
          {e.admin_notes && <div className="alert small">ملاحظات الإدارة: {e.admin_notes}</div>}
          {isAdmin && e.status === 'examiner_approved' && can('final_approve') && (
            <Field label="ملاحظات الإدارة" className="mt">
              <textarea className="inp" placeholder="تُحفظ مع الاعتماد وتظهر في سجل العمليات" value={notes} onChange={(ev) => setNotes(ev.target.value)} />
            </Field>
          )}
        </>
      )}
    </Modal>
  );
}
