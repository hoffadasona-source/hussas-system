import { useState } from 'react';
import ListCard from '../../components/ListCard';
import { Kv, Modal, PageHeader } from '../../components/ui';
import { usePagedList } from '../../hooks/data';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../../lib/constants';
import { fmtDateTime } from '../../lib/format';

const DETAIL_LABELS = { reason: 'السبب', note: 'الملاحظة', notes: 'الملاحظات', score: 'الدرجة', examiner: 'المحفّظ', student: 'الطالب', reg_no: 'رقم الطلب', exam: 'الامتحان', date: 'التاريخ', time: 'الوقت', role: 'الدور', op: 'نوع التعديل', name: 'البند' };

export default function AuditLog() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [open, setOpen] = useState(null);

  const list = usePagedList({
    key: 'audit',
    source: 'audit_log',
    searchCols: ['actor_name', 'entity_id', 'action'],
    filters: { action, entity },
    pageSize: 30,
  });

  return (
    <>
      <PageHeader title="سجل العمليات" sub="كل عملية حسّاسة مسجَّلة بالمستخدم والوقت، ولا يمكن تعديل السجل أو حذفه." />
      <ListCard
        list={list}
        searchPlaceholder="ابحث بالمستخدم أو رقم السجل"
        filters={[
          { value: action, onChange: setAction, options: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })), placeholder: 'كل العمليات' },
          { value: entity, onChange: setEntity, options: Object.entries(AUDIT_ENTITIES).map(([value, label]) => ({ value, label })), placeholder: 'كل الكيانات' },
        ]}
        onRowClick={setOpen}
        emptyTitle="لا توجد عمليات مسجّلة"
        exportName="سجل-العمليات"
        exportColumns={[
          { label: 'الوقت', value: (a) => fmtDateTime(a.created_at) },
          { label: 'المستخدم', value: (a) => a.actor_name || 'زائر' },
          { label: 'العملية', value: (a) => AUDIT_ACTIONS[a.action] || a.action },
          { label: 'الكيان', value: (a) => AUDIT_ENTITIES[a.entity] || a.entity },
          { label: 'المعرّف', value: (a) => a.entity_id },
          { label: 'التفاصيل', value: (a) => (a.details ? JSON.stringify(a.details) : '') },
          { label: 'IP', value: (a) => a.ip },
        ]}
        columns={[
          { label: 'الوقت', className: 'num small', render: (a) => fmtDateTime(a.created_at) },
          { label: 'المستخدم', render: (a) => a.actor_name || <span className="muted">زائر</span> },
          { label: 'العملية', render: (a) => AUDIT_ACTIONS[a.action] || a.action },
          { label: 'الكيان', className: 'small muted', render: (a) => AUDIT_ENTITIES[a.entity] || a.entity },
          { label: 'المعرّف', className: 'num small', render: (a) => <span className="ltr">{a.entity_id}</span> },
          { label: 'IP', className: 'num small', render: (a) => <span className="ltr">{a.ip || '—'}</span> },
        ]}
      />
      {open && (
        <Modal title="تفاصيل العملية" onClose={() => setOpen(null)} footer={<button className="btn ghost" onClick={() => setOpen(null)}>إغلاق</button>}>
          <Kv items={[
            ['الوقت', fmtDateTime(open.created_at)],
            ['المستخدم', open.actor_name || 'زائر'],
            ['العملية', AUDIT_ACTIONS[open.action] || open.action],
            ['الكيان', AUDIT_ENTITIES[open.entity] || open.entity],
            ['المعرّف', <span className="ltr num">{open.entity_id}</span>],
            ['IP', <span className="ltr num">{open.ip || '—'}</span>],
            ...Object.entries(open.details || {}).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [DETAIL_LABELS[k] || k, String(v)]),
          ]} />
        </Modal>
      )}
    </>
  );
}
