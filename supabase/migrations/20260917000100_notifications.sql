-- =====================================================================
--  الإشعارات الآلية (المرحلة 3): قوالب الرسائل، طابور الإرسال، التذكير قبل الموعد
--  الأحداث تُضاف إلى الطابور بمشغّلات قاعدة البيانات، وتُرسلها Edge Function: send-messages
--  معطّلة افتراضياً حتى يفعّلها مدير النظام من الإعدادات.
-- =====================================================================

create type public.message_channel as enum ('whatsapp', 'sms', 'email');
create type public.message_status as enum ('queued', 'sending', 'sent', 'failed', 'cancelled');

alter table public.settings
  add column notify_enabled   boolean not null default false,
  add column notify_channel   public.message_channel not null default 'whatsapp',
  add column reminder_hours   int[] not null default '{24,2}',
  add column public_site_url  text;

create table public.message_templates (
  key                text primary key,
  title              text not null,
  body               text not null,
  enabled            boolean not null default true,
  whatsapp_template  text,                          -- اسم القالب المعتمد في WhatsApp Manager (اختياري)
  whatsapp_params    text[] not null default '{}',  -- ترتيب متغيرات قالب واتساب {{1}}، {{2}}…
  sort_order         int not null default 0,
  updated_at         timestamptz not null default now()
);

create table public.outbound_messages (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  template_key         text not null references public.message_templates (key),
  channel              public.message_channel not null,
  recipient            text not null,
  recipient_name       text,
  application_id       uuid references public.applications (id) on delete cascade,
  appointment_id       uuid references public.appointments (id) on delete cascade,
  params               jsonb not null default '{}'::jsonb,
  body                 text not null,
  status               public.message_status not null default 'queued',
  attempts             int not null default 0,
  send_after           timestamptz not null default now(),
  claimed_at           timestamptz,
  sent_at              timestamptz,
  last_error           text,
  provider_message_id  text,
  dedupe_key           text unique
);
create index outbound_messages_due_idx on public.outbound_messages (send_after) where status = 'queued';
create index outbound_messages_app_idx on public.outbound_messages (application_id);
create index outbound_messages_created_idx on public.outbound_messages (created_at desc);

-- ---------- بناء نص الرسالة ----------
create or replace function public.render_template(p_body text, p_params jsonb)
returns text language plpgsql immutable set search_path = public
as $$
declare
  k text;
  v text;
  r text := p_body;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_params, '{}'::jsonb)) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  -- المتغيرات غير المعروفة تُحذف، والأسطر الفارغة المتكررة تُختصر
  r := regexp_replace(r, '\{\{[a-z_]+\}\}', '', 'g');
  return btrim(regexp_replace(r, E'\n{3,}', E'\n\n', 'g'));
end $$;

-- متغيرات الرسالة من بيانات الطلب والموعد والنتيجة والشهادة
create or replace function public.message_params(p_application_id uuid, p_appointment_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_site text;
  v_result jsonb;
begin
  select nullif(rtrim(btrim(public_site_url), '/'), '') into v_site from public.settings where id = 1;

  select jsonb_build_object(
    'org_name', st.org_name,
    'org_phone', coalesce(st.org_phone, ''),
    'student_name', s.full_name,
    'first_name', s.first_name,
    'reg_no', a.reg_no,
    'student_no', s.student_no,
    'cycle', c.name,
    'office', coalesce(o.name, ''),
    'matns', coalesce((select string_agg(m.name, '، ' order by m.sort_order, m.name)
                       from public.application_matns am join public.matns m on m.id = am.matn_id
                       where am.application_id = a.id), ''),
    'rejection_reason', coalesce(a.rejection_reason, ''),
    'examiner', coalesce(e.full_name, ''),
    'date', coalesce(to_char(ap.exam_date, 'YYYY-MM-DD'), ''),
    'time', coalesce(to_char(ap.exam_time, 'HH24:MI'), ''),
    'place', coalesce(case ap.mode
               when 'whatsapp_room' then 'غرفة صوتية — واتساب'
               when 'telegram_room' then 'غرفة صوتية — تيليجرام'
               when 'whatsapp_call' then 'مكالمة واتساب مباشرة'
               when 'in_person' then 'حضوري' end, ''),
    'location', coalesce(ap.location, ''),
    'appointment_notes', coalesce(ap.notes, ''),
    'score', coalesce(rtrim(to_char(x.score, 'FM990.99'), '.'), ''),
    'grade', coalesce(public.grade_for(x.score), ''),
    'cert_no', coalesce(ce.cert_no, ''),
    'track_link', case when v_site is null then '' else v_site || '/application-status?q=' || a.reg_no end,
    'result_link', case when v_site is null then '' else v_site || '/result' end,
    'verify_link', case when v_site is null or ce.cert_no is null then ''
                        else v_site || '/certificate-verification?no=' || ce.cert_no end
  ) into v_result
  from public.applications a
  join public.students s on s.id = a.student_id
  join public.cycles c on c.id = a.cycle_id
  cross join public.settings st
  left join public.offices o on o.id = a.office_id
  left join public.examiners e on e.id = a.examiner_id
  left join public.appointments ap on ap.id = p_appointment_id
  left join lateral (select score from public.exams where application_id = a.id and status = 'approved' limit 1) x on true
  left join lateral (select cert_no from public.certificates where application_id = a.id and status = 'valid'
                     order by issued_at desc limit 1) ce on true
  where a.id = p_application_id and st.id = 1;

  return v_result;
end $$;

-- يضيف رسالة إلى الطابور إن كانت الإشعارات مفعّلة والقالب فعّالاً ولدى الطالب وسيلة تواصل
create or replace function public.enqueue_message(
  p_key text, p_application_id uuid, p_appointment_id uuid default null,
  p_send_after timestamptz default now(), p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_set    public.settings;
  v_tpl    public.message_templates;
  v_to     text;
  v_name   text;
  v_params jsonb;
  v_id     uuid;
begin
  select * into v_set from public.settings where id = 1;
  if not coalesce(v_set.notify_enabled, false) then return null; end if;
  select * into v_tpl from public.message_templates where key = p_key and enabled;
  if v_tpl.key is null then return null; end if;

  select case v_set.notify_channel when 'email' then s.email when 'sms' then s.phone else s.whatsapp end, s.full_name
    into v_to, v_name
  from public.applications a join public.students s on s.id = a.student_id
  where a.id = p_application_id;
  if coalesce(btrim(v_to), '') = '' then return null; end if;

  v_params := public.message_params(p_application_id, p_appointment_id);
  insert into public.outbound_messages (template_key, channel, recipient, recipient_name, application_id, appointment_id,
                                        params, body, send_after, dedupe_key)
  values (p_key, v_set.notify_channel, v_to, v_name, p_application_id, p_appointment_id,
          v_params, public.render_template(v_tpl.body, v_params), p_send_after, p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------- المشغّلات ----------
-- الطلب الجديد: مشغّل مؤجَّل حتى نهاية المعاملة، لأن المتون تُضاف بعد إدراج الطلب
create or replace function public.notify_application_created()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.enqueue_message('application_received', new.id, null, now(), 'received:' || new.id);
  return null;
end $$;

create constraint trigger applications_notify_created
  after insert on public.applications
  deferrable initially deferred
  for each row execute function public.notify_application_created();

create or replace function public.notify_application_status()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status = 'approved' or (new.status = 'assigned' and old.status in ('pending', 'under_review')) then
    perform public.enqueue_message('application_approved', new.id, null, now(), 'approved:' || new.id);
  elsif new.status = 'rejected' then
    perform public.enqueue_message('application_rejected', new.id);
  elsif new.status = 'published' then
    perform public.enqueue_message('result_published', new.id);
  end if;
  return null;
end $$;

create trigger applications_notify_status
  after update of status on public.applications
  for each row execute function public.notify_application_status();

create or replace function public.notify_appointment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_hours int[];
  v_start timestamptz;
  h int;
  v_changed boolean := tg_op = 'INSERT'
    or (new.exam_date, new.exam_time) is distinct from (old.exam_date, old.exam_time)
    or new.status is distinct from old.status;
begin
  if not v_changed then return null; end if;

  -- أي تغيير في الموعد أو حالته يُلغي رسائله التي لم تُرسل بعد (الإشعار والتذكيرات)
  if tg_op = 'UPDATE' then
    update public.outbound_messages
       set status = 'cancelled', last_error = 'تغيّر الموعد أو أُلغي', dedupe_key = null
     where appointment_id = new.id and status = 'queued'
       and template_key in ('appointment_reminder', 'appointment_scheduled');
  end if;

  if new.status <> 'scheduled' then return null; end if;

  perform public.enqueue_message('appointment_scheduled', new.application_id, new.id, now(),
                                 'apt:' || new.id || ':' || extract(epoch from new.updated_at));

  select reminder_hours into v_hours from public.settings where id = 1;
  v_start := (new.exam_date + new.exam_time) at time zone 'Africa/Tripoli';
  foreach h in array coalesce(v_hours, '{}'::int[]) loop
    if h > 0 and v_start - make_interval(hours => h) > now() then
      perform public.enqueue_message('appointment_reminder', new.application_id, new.id,
                                     v_start - make_interval(hours => h),
                                     'rem:' || new.id || ':' || extract(epoch from new.updated_at) || ':' || h);
    end if;
  end loop;
  return null;
end $$;

create trigger appointments_notify
  after insert or update on public.appointments
  for each row execute function public.notify_appointment();

create or replace function public.notify_certificate()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'valid' then
    perform public.enqueue_message('certificate_issued', new.application_id, null, now(), 'cert:' || new.id);
  end if;
  return null;
end $$;

create trigger certificates_notify
  after insert on public.certificates
  for each row execute function public.notify_certificate();

-- ---------- العامل (Edge Function) ----------
-- يحجز دفعة من الرسائل المستحقة؛ الرسائل العالقة في «sending» أكثر من 10 دقائق تُعاد للطابور
create or replace function public.claim_messages(p_limit int default 25)
returns table (id uuid, channel public.message_channel, recipient text, body text, params jsonb, template_key text,
               title text, whatsapp_template text, whatsapp_params text[], attempts int)
language plpgsql security definer set search_path = public
as $$
begin
  update public.outbound_messages m set status = 'queued'
   where m.status = 'sending' and m.claimed_at < now() - interval '10 minutes';

  return query
  with due as (
    select m.id from public.outbound_messages m
    where m.status = 'queued' and m.send_after <= now()
    order by m.send_after
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), claimed as (
    update public.outbound_messages m
       set status = 'sending', attempts = m.attempts + 1, claimed_at = now()
      from due where m.id = due.id
    returning m.*
  )
  select c.id, c.channel, c.recipient, c.body, c.params, c.template_key,
         t.title, t.whatsapp_template, t.whatsapp_params, c.attempts
  from claimed c join public.message_templates t on t.key = c.template_key;
end $$;

create or replace function public.finish_message(p_id uuid, p_ok boolean, p_error text default null, p_provider_id text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v public.outbound_messages;
begin
  select * into v from public.outbound_messages where id = p_id for update;
  if v.id is null or v.status <> 'sending' then return; end if;

  if p_ok then
    update public.outbound_messages
       set status = 'sent', sent_at = now(), last_error = null, provider_message_id = p_provider_id
     where id = p_id;
    if v.template_key = 'appointment_scheduled' and v.appointment_id is not null then
      update public.appointments set notified_at = coalesce(notified_at, now()) where id = v.appointment_id;
    end if;
  elsif v.attempts < 3 then
    -- إعادة المحاولة بعد 5 ثم 10 دقائق
    update public.outbound_messages
       set status = 'queued', last_error = left(p_error, 1000), send_after = now() + make_interval(mins => 5 * v.attempts)
     where id = p_id;
  else
    update public.outbound_messages set status = 'failed', last_error = left(p_error, 1000) where id = p_id;
  end if;
end $$;

-- ---------- إجراءات الإدارة ----------
create or replace function public.retry_message(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_admin();
  update public.outbound_messages
     set status = 'queued', attempts = 0, send_after = now(), last_error = null, claimed_at = null
   where id = p_id and status in ('failed', 'cancelled');
end $$;

create or replace function public.cancel_message(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_admin();
  update public.outbound_messages set status = 'cancelled', last_error = 'أُلغيت يدوياً', dedupe_key = null
   where id = p_id and status = 'queued';
end $$;

-- رسالة تجريبية للتأكد من ربط القناة (مدير النظام فقط)
create or replace function public.send_test_message(p_recipient text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_set public.settings;
  v_tpl public.message_templates;
  v_params jsonb;
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'غير مصرح بهذه العملية' using errcode = '42501';
  end if;
  if coalesce(btrim(p_recipient), '') = '' then
    raise exception 'أدخل رقم المستلم أو بريده' using errcode = '22023';
  end if;
  select * into v_set from public.settings where id = 1;
  select * into v_tpl from public.message_templates where key = 'test';
  v_params := jsonb_build_object('org_name', v_set.org_name);
  insert into public.outbound_messages (template_key, channel, recipient, recipient_name, params, body)
  values ('test', v_set.notify_channel,
          case when v_set.notify_channel = 'email' then btrim(p_recipient) else public.normalize_phone(p_recipient) end,
          'رسالة تجريبية', v_params, public.render_template(v_tpl.body, v_params))
  returning id into v_id;
  perform public.log_action('messages.test', 'settings', v_id::text, jsonb_build_object('recipient', p_recipient));
  return v_id;
end $$;

-- ---------- العرض ----------
create view public.v_outbound_messages with (security_invoker = true) as
select m.id, m.created_at, m.template_key, t.title as template_title, m.channel, m.recipient, m.recipient_name,
       m.application_id, a.reg_no, a.student_id, m.appointment_id, m.body, m.status, m.attempts, m.send_after,
       m.sent_at, m.last_error, m.provider_message_id
from public.outbound_messages m
left join public.message_templates t on t.key = m.template_key
left join public.applications a on a.id = m.application_id;

-- ---------- الصلاحيات ----------
alter table public.message_templates enable row level security;
alter table public.outbound_messages enable row level security;

create policy templates_read on public.message_templates for select to authenticated using ((select public.is_admin()));
create policy templates_update on public.message_templates for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy messages_read on public.outbound_messages for select to authenticated using ((select public.is_admin()));

revoke all on public.message_templates, public.outbound_messages, public.v_outbound_messages from anon;
revoke insert, update, delete, truncate, references, trigger on public.message_templates, public.outbound_messages from authenticated;
grant update (title, body, enabled, whatsapp_template, whatsapp_params, updated_at) on public.message_templates to authenticated;
grant select on public.v_outbound_messages to authenticated;
grant update (notify_enabled, notify_channel, reminder_hours, public_site_url) on public.settings to authenticated;

create trigger message_templates_audit after update on public.message_templates
  for each row execute function public.audit_config_change();

revoke execute on function
  public.render_template(text, jsonb), public.message_params(uuid, uuid),
  public.enqueue_message(text, uuid, uuid, timestamptz, text),
  public.notify_application_created(), public.notify_application_status(), public.notify_appointment(),
  public.notify_certificate(), public.claim_messages(int), public.finish_message(uuid, boolean, text, text),
  public.retry_message(uuid), public.cancel_message(uuid), public.send_test_message(text)
from public, anon, authenticated;

grant execute on function public.claim_messages(int), public.finish_message(uuid, boolean, text, text) to service_role;
grant execute on function public.retry_message(uuid), public.cancel_message(uuid), public.send_test_message(text) to authenticated;

-- ---------- القوالب الافتراضية ----------
insert into public.message_templates (key, title, sort_order, body) values
('application_received', 'استلام طلب التسجيل', 1,
'السلام عليكم ورحمة الله وبركاته
{{org_name}}

استلمنا طلب تسجيل الطالب {{student_name}}.
رقم الطلب: {{reg_no}}
رقم الطالب: {{student_no}}
المتون: {{matns}}

سنبلغكم بنتيجة المراجعة. احتفظوا برقم الطلب للمتابعة.
{{track_link}}'),

('application_approved', 'قبول الطلب', 2,
'السلام عليكم ورحمة الله وبركاته
{{org_name}}

قُبل طلب الطالب {{student_name}} ({{reg_no}}).
سيُحال إلى المحفّظ لتحديد موعد الامتحان، ويصلكم الموعد على هذا الرقم.
{{track_link}}'),

('application_rejected', 'رفض الطلب', 3,
'السلام عليكم ورحمة الله وبركاته
{{org_name}}

نعتذر، لم يُقبل طلب الطالب {{student_name}} ({{reg_no}}).
السبب: {{rejection_reason}}

للاستفسار تواصلوا مع الإدارة: {{org_phone}}'),

('appointment_scheduled', 'موعد الامتحان', 4,
'السلام عليكم ورحمة الله وبركاته
{{org_name}} — إشعار موعد الامتحان

اسم الطالب: {{student_name}}
المتون: {{matns}}
التاريخ: {{date}}
الوقت: {{time}}
مكان الجلسة: {{place}} {{location}}
{{appointment_notes}}

يرجى الدخول إلى الغرفة قبل الموعد بعشر دقائق، والتأكد من جودة الاتصال والسماعة.
وفقكم الله.'),

('appointment_reminder', 'تذكير بالموعد', 5,
'تذكير من {{org_name}}

موعد امتحان الطالب {{student_name}}
التاريخ: {{date}} — الساعة {{time}}
المكان: {{place}} {{location}}

يرجى الاستعداد والدخول قبل الموعد بعشر دقائق.'),

('result_published', 'صدور النتيجة', 6,
'السلام عليكم ورحمة الله وبركاته
{{org_name}}

اعتُمدت نتيجة امتحان الطالب {{student_name}}.
الدرجة: {{score}} من 100
{{grade}}

تفاصيل النتيجة برقم الطالب {{student_no}}:
{{result_link}}'),

('certificate_issued', 'صدور الشهادة', 7,
'السلام عليكم ورحمة الله وبركاته
{{org_name}}

صدرت شهادة الطالب {{student_name}} برقم {{cert_no}}.
بارك الله فيه ونفع به.

للتحقق من الشهادة:
{{verify_link}}'),

('test', 'رسالة تجريبية', 99,
'رسالة تجريبية من {{org_name}} للتأكد من ربط قناة الإشعارات. لا حاجة للرد.')
on conflict (key) do nothing;
