import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import ListCard, { stop } from '../../components/ListCard';
import { Icon } from '../../components/icons';
import { Kv, Modal, PageHeader, Stat, StatusBadge, Tabs } from '../../components/ui';
import { useAction } from '../../components/workflow';
import { useUi } from '../../context/UiContext';
import { usePagedList, useSettings } from '../../hooks/data';
import { rpc, sendMessages, supabase } from '../../lib/supabase';
import { CHANNELS, MESSAGE_STATUS } from '../../lib/constants';
import { downloadCsv, errorMessage, waNumber } from '../../lib/helpers';
import { fmtDateTime, todayISO } from '../../lib/format';

const EXPORT_LIMIT = 2000;

// لوحة الإشعارات: طابور الانتظار أولاً، ثم ما صُدِّر وأُرسل وفشل
const TABS = [
  { key: 'queued', label: 'بالانتظار' },
  { key: 'exported', label: 'مُصدّرة' },
  { key: 'sent', label: 'أُرسلت' },
  { key: 'failed', label: 'فشلت' },
  { key: '', label: 'الكل' },
];

export default function Messages() {
  const run = useAction();
  const { toast, confirm } = useUi();
  const { data: settings } = useSettings();
  const [tab, setTab] = useState('queued');
  const [template, setTemplate] = useState('');
  const [open, setOpen] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

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
      const [queued, exported, sent, failed] = await Promise.all([
        count((q) => q.eq('status', 'queued').lte('send_after', new Date().toISOString())),
        count((q) => q.eq('status', 'exported')),
        count((q) => q.eq('status', 'sent').gte('sent_at', since)),
        count((q) => q.eq('status', 'failed')),
      ]);
      return { queued, exported, sent, failed };
    },
  });

  const list = usePagedList({
    key: 'messages',
    source: 'v_outbound_messages',
    searchCols: ['recipient', 'recipient_name', 'reg_no'],
    filters: { status: tab, template_key: template },
  });

  // اختيار الصفوف يُصفَّر عند تغيير التبويب أو الصفحة أو البحث
  useEffect(() => setSel(new Set()), [tab, template, list.page, list.search]);

  const pageIds = list.rows.map((m) => m.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(pageIds));
  const toggleOne = (id) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /** تنزيل الرسائل المعلقة بأعمدة الإرسال المحلي، ثم تعليمها كمُصدّرة */
  const exportPending = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.from('v_outbound_messages')
        .select('id, recipient, recipient_name, reg_no, body, template_title, channel, send_after')
        .eq('status', 'queued').lte('send_after', new Date().toISOString())
        .order('send_after').limit(EXPORT_LIMIT);
      if (error) throw error;
      if (!data.length) {
        toast('لا توجد رسائل معلقة للتصدير', 'info');
        return;
      }
      downloadCsv(`رسائل-للإرسال-${todayISO()}`, [
        { label: 'رقم الهاتف', value: (m) => waNumber(m.recipient) },
        { label: 'نص الرسالة', value: (m) => m.body },
        { label: 'الاسم', value: (m) => m.recipient_name },
        { label: 'رقم الطلب', value: (m) => m.reg_no },
        { label: 'نوع الرسالة', value: (m) => m.template_title },
      ], data);

      const mark = await confirm({
        title: 'تعليم الرسائل كمُصدّرة',
        text: `نُزّلت ${data.length} رسالة. هل تُعلَّم كمُصدّرة حتى لا تتكرر في التصدير القادم؟`,
        okLabel: 'تعليمها كمُصدّرة',
      });
      if (mark) await run(() => rpc('export_messages', { p_ids: data.map((m) => m.id), p_status: 'exported' }), 'عُلّمت الرسائل كمُصدّرة');
    } catch (err) {
      toast(errorMessage(err), 'err');
    } finally {
      setBusy(false);
    }
  };

  /** إجراء جماعي على المحدد: تعليم كمُرسلة أو كمُصدّرة عبر RPC يتحقق من الصلاحية ويسجّل العملية */
  const markSelected = async (status) => {
    const ids = [...sel];
    if (!ids.length) return toast('حدّد رسالة واحدة على الأقل', 'err');
    const label = status === 'sent' ? 'مُرسلة' : 'مُصدّرة';
    const ok = await confirm({
      title: `تعليم ${ids.length} رسالة كـ«${label}»`,
      text: status === 'sent'
        ? 'استخدم هذا بعد إرسالها فعلياً من نظام الإرسال المحلي، فتخرج من طابور الانتظار.'
        : 'تُعلَّم كمُصدّرة فلا تتكرر في التصدير القادم، ويمكن إعادتها إلى الطابور لاحقاً.',
      okLabel: `تعليمها كـ${label}`,
    });
    if (!ok) return;
    const n = await run(() => rpc('export_messages', { p_ids: ids, p_status: status }), null);
    if (n !== false) {
      toast(`عُلّمت ${n} رسالة كـ«${label}»`);
      setSel(new Set());
    }
  };

  const runNow = async () => {
    const res = await run(() => sendMessages('run'));
    if (res) toast(res.processed ? `الرسائل المعالَجة: ${res.processed} · أُرسلت: ${res.sent} · فشلت: ${res.failed}` : 'لا توجد رسائل مستحقة الآن', res.failed ? 'err' : 'ok');
  };

  const selectable = ['queued', 'exported', ''].includes(tab);

  return (
    <>
      <PageHeader title="الإشعارات" sub="طابور الرسائل وحالتها: تصدير للإرسال المحلي، أو إرسال آلي عند ربط قناة."
        actions={<>
          <Link className="btn ghost" to="/admin/settings">إعدادات الإشعارات</Link>
          <button className="btn teal" onClick={exportPending} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon.download />} تصدير المعلقة Excel/CSV
          </button>
          <button className="btn ghost" onClick={runNow}><Icon.whatsapp /> تشغيل الإرسال الآلي</button>
        </>} />

      {settings && !settings.notify_enabled && (
        <div className="alert warn mb">الإشعارات الآلية معطّلة؛ لا تُضاف رسائل جديدة. فعّلها من الإعدادات ← الإشعارات.</div>
      )}

      <div className="stats mb" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
        <Stat label="مستحقة بالانتظار" value={counts.data?.queued} tone="g" />
        <Stat label="مُصدّرة للإرسال المحلي" value={counts.data?.exported} tone="t" />
        <Stat label="أُرسلت خلال 24 ساعة" value={counts.data?.sent} tone="t" />
        <Stat label="فشلت" value={counts.data?.failed} tone="r" />
      </div>

      <ListCard
        list={list}
        header={<Tabs tabs={TABS} value={tab} onChange={setTab} />}
        searchPlaceholder="ابحث باسم الطالب أو الرقم أو رقم الطلب"
        filters={[
          { value: template, onChange: setTemplate, options: (templates.data || []).map((t) => ({ value: t.key, label: t.title })), placeholder: 'كل الأنواع' },
        ]}
        toolbarExtra={selectable && (
          <>
            <button className="btn ghost sm" disabled={!sel.size} onClick={() => markSelected('sent')}>
              <Icon.check /> تحديد كمُرسلة {sel.size ? `(${sel.size})` : ''}
            </button>
            <button className="btn ghost sm" disabled={!sel.size} onClick={() => markSelected('exported')}>تحديد كمُصدّرة</button>
          </>
        )}
        onRowClick={setOpen}
        emptyTitle="لا توجد رسائل"
        emptyText={tab === 'queued' ? 'لا توجد رسائل تنتظر الإرسال.' : 'لا توجد رسائل بهذه الحالة.'}
        exportName="الرسائل"
        exportColumns={[
          { label: 'رقم الهاتف', value: (m) => waNumber(m.recipient) },
          { label: 'نص الرسالة', value: (m) => m.body },
          { label: 'الاسم', value: (m) => m.recipient_name },
          { label: 'رقم الطلب', value: (m) => m.reg_no },
          { label: 'النوع', value: (m) => m.template_title },
          { label: 'القناة', value: (m) => CHANNELS[m.channel] },
          { label: 'موعد الإرسال', value: (m) => fmtDateTime(m.send_after) },
          { label: 'الحالة', value: (m) => MESSAGE_STATUS[m.status]?.t },
          { label: 'المحاولات', value: (m) => m.attempts },
          { label: 'الخطأ', value: (m) => m.last_error },
        ]}
        columns={[
          ...(selectable ? [{
            label: <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="تحديد كل الصفحة" />,
            render: (m) => (
              <input type="checkbox" checked={sel.has(m.id)} onClick={(e) => e.stopPropagation()}
                onChange={() => toggleOne(m.id)} aria-label="تحديد الرسالة" />
            ),
          }] : []),
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
                {['failed', 'cancelled', 'exported'].includes(m.status) && (
                  <button className="btn ghost sm" onClick={stop(() => run(() => rpc('retry_message', { p_id: m.id }), 'أُعيدت الرسالة إلى الطابور'))}>إعادة للطابور</button>
                )}
                {['queued', 'exported'].includes(m.status) && (
                  <button className="btn ghost sm" onClick={stop(() => run(() => rpc('export_messages', { p_ids: [m.id], p_status: 'sent' }), 'عُلّمت الرسالة كمُرسلة'))}>تم الإرسال</button>
                )}
                {m.status === 'queued' && (
                  <button className="btn ghost sm" onClick={stop(() => run(() => rpc('cancel_message', { p_id: m.id }), 'أُلغيت الرسالة'))}>إلغاء</button>
                )}
              </div>
            ),
          },
        ]}
      />

      <div className="alert mt small">
        <b>الإرسال المحلي:</b> «تصدير المعلقة» ينزّل ملفاً بأعمدة (رقم الهاتف · نص الرسالة) بأرقام دولية بلا علامة +،
        أرسلها من برنامجك المحلي، ثم حدّد الرسائل هنا واضغط «تحديد كمُرسلة» لتخرج من الطابور.
      </div>

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
