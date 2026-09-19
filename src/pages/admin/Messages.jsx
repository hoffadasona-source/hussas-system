import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import ListCard, { stop } from '../../components/ListCard';
import { Icon } from '../../components/icons';
import { Kv, Modal, PageHeader, Stat, StatusBadge, mapOptions } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useUi } from '../../context/UiContext';
import { usePagedList, useSettings } from '../../hooks/data';
import { rpc, sendMessages, supabase } from '../../lib/supabase';
import { CHANNELS, MESSAGE_STATUS } from '../../lib/constants';
import { fmtDateTime } from '../../lib/format';

export default function Messages() {
  const run = useAction();
  const { toast } = useUi();
  const { data: settings } = useSettings();
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState('');
  const [open, setOpen] = useState(null);

  const templates = useQuery({
    queryKey: ['message-templates'],
    queryFn: async () => (await supabase.from('message_templates').select('key, title').order('sort_order')).data || [],
  });
  const counts = useQuery({
    queryKey: ['message-counts'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 86400e3).toISOString();
      const count = (build) => build(supabase.from('outbound_messages').select('id', { count: 'exact', head: true })).then((r) => r.count);
      const [queued, sent, failed] = await Promise.all([
        count((q) => q.eq('status', 'queued').lte('send_after', new Date().toISOString())),
        count((q) => q.eq('status', 'sent').gte('sent_at', since)),
        count((q) => q.eq('status', 'failed')),
      ]);
      return { queued, sent, failed };
    },
  });

  const list = usePagedList({
    key: 'messages',
    source: 'v_outbound_messages',
    searchCols: ['recipient', 'recipient_name', 'reg_no'],
    filters: { status, template_key: template },
  });

  const runNow = async () => {
    const res = await run(() => sendMessages('run'));
    if (res) toast(res.processed ? `الرسائل المعالَجة: ${res.processed} · أُرسلت: ${res.sent} · فشلت: ${res.failed}` : 'لا توجد رسائل مستحقة الآن', res.failed ? 'err' : 'ok');
  };

  return (
    <>
      <PageHeader title="الرسائل" sub="الإشعارات الآلية المرسلة للطلبة وحالة كل رسالة."
        actions={<>
          <Link className="btn ghost" to="/admin/settings">إعدادات الإشعارات</Link>
          <button className="btn" onClick={runNow}><Icon.whatsapp /> تشغيل الإرسال الآن</button>
        </>} />
      {settings && !settings.notify_enabled && (
        <div className="alert warn mb">الإشعارات الآلية معطّلة؛ لا تُضاف رسائل جديدة. فعّلها من الإعدادات ← الإشعارات.</div>
      )}
      <div className="stats mb" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
        <Stat label="مستحقة بالانتظار" value={counts.data?.queued} tone="g" />
        <Stat label="أُرسلت خلال 24 ساعة" value={counts.data?.sent} tone="t" />
        <Stat label="فشلت" value={counts.data?.failed} tone="r" />
      </div>
      <ListCard
        list={list}
        searchPlaceholder="ابحث باسم الطالب أو الرقم أو رقم الطلب"
        filters={[
          { value: status, onChange: setStatus, options: mapOptions(MESSAGE_STATUS), placeholder: 'كل الحالات' },
          { value: template, onChange: setTemplate, options: (templates.data || []).map((t) => ({ value: t.key, label: t.title })), placeholder: 'كل الأنواع' },
        ]}
        onRowClick={setOpen}
        emptyTitle="لا توجد رسائل"
        emptyText="تظهر هنا الرسائل بعد تفعيل الإشعارات الآلية."
        exportName="الرسائل"
        exportColumns={[
          { label: 'الوقت', value: (m) => fmtDateTime(m.created_at) },
          { label: 'الطالب', value: (m) => m.recipient_name },
          { label: 'رقم الطلب', value: (m) => m.reg_no },
          { label: 'النوع', value: (m) => m.template_title },
          { label: 'القناة', value: (m) => CHANNELS[m.channel] },
          { label: 'المستلم', value: (m) => m.recipient },
          { label: 'موعد الإرسال', value: (m) => fmtDateTime(m.send_after) },
          { label: 'الحالة', value: (m) => MESSAGE_STATUS[m.status]?.t },
          { label: 'المحاولات', value: (m) => m.attempts },
          { label: 'الخطأ', value: (m) => m.last_error },
        ]}
        columns={[
          { label: 'أُنشئت', className: 'num small', render: (m) => fmtDateTime(m.created_at) },
          { label: 'الطالب', render: (m) => <>{m.recipient_name}{m.reg_no && <div className="tiny muted ltr">{m.reg_no}</div>}</> },
          { label: 'النوع', className: 'small', render: (m) => m.template_title },
          { label: 'المستلم', className: 'num small', render: (m) => <span className="ltr">{m.recipient}</span> },
          { label: 'الإرسال', className: 'num small', render: (m) => fmtDateTime(m.sent_at || m.send_after) },
          { label: 'الحالة', render: (m) => <>
            <StatusBadge map={MESSAGE_STATUS} value={m.status} />
            {m.attempts > 1 && <div className="tiny muted">{m.attempts} محاولات</div>}
          </> },
          {
            label: '',
            render: (m) => (
              <div className="acts">
                {['failed', 'cancelled'].includes(m.status) && (
                  <button className="btn ghost sm" onClick={stop(() => run(() => rpc('retry_message', { p_id: m.id }), 'أُعيدت الرسالة إلى الطابور'))}>إعادة الإرسال</button>
                )}
                {m.status === 'queued' && (
                  <button className="btn ghost sm" onClick={stop(() => run(() => rpc('cancel_message', { p_id: m.id }), 'أُلغيت الرسالة'))}>إلغاء</button>
                )}
              </div>
            ),
          },
        ]}
      />
      {open && (
        <Modal wide title={`رسالة: ${open.template_title}`} onClose={() => setOpen(null)}
          footer={<button className="btn ghost" onClick={() => setOpen(null)}>إغلاق</button>}>
          <div className="grid cols-2" style={{ alignItems: 'start' }}>
            <Kv items={[
              ['الطالب', open.recipient_name],
              open.reg_no && ['رقم الطلب', <span className="ltr num">{open.reg_no}</span>],
              ['القناة', CHANNELS[open.channel]],
              ['المستلم', <span className="ltr num">{open.recipient}</span>],
              ['الحالة', <StatusBadge map={MESSAGE_STATUS} value={open.status} />],
              ['موعد الإرسال', fmtDateTime(open.send_after)],
              open.sent_at && ['أُرسلت', fmtDateTime(open.sent_at)],
              ['المحاولات', open.attempts],
              open.provider_message_id && ['معرّف المزود', <span className="ltr small">{open.provider_message_id}</span>],
            ]} />
            <div style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 14 }}>
              {open.body}
            </div>
          </div>
          {open.last_error && <div className="alert err mt small ltr" style={{ textAlign: 'left' }}>{open.last_error}</div>}
        </Modal>
      )}
    </>
  );
}
