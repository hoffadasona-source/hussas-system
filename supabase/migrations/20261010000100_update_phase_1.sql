-- =====================================================================
--  الحزمة الأولى من تحديثات المنظومة
--  1) إلغاء نظام «المتون» نهائياً والاعتماد على المستويات (1 → 5)
--  2) شعار الجهة وحجمه من الإعدادات
--  3) قالب شهادة PDF بإحداثيات حرة
--  4) تصدير الرسائل للإرسال المحلي (Excel/CSV) بدل الإرسال الآلي
--  5) إلغاء إجبار تغيير كلمة المرور
--  6) هيكلية استيراد المكاتب
--  7) دقة الكسور العشرية في احتساب الدرجات
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) أعمدة الإعدادات الجديدة
-- ---------------------------------------------------------------------
alter table public.settings
  add column if not exists logo_url            text,
  add column if not exists logo_scale          numeric(4,2) not null default 1.0,
  add column if not exists cert_bg_pdf_url     text,
  add column if not exists cert_layout_config  jsonb not null default '{}'::jsonb;

alter table public.settings drop constraint if exists settings_logo_scale_range;
alter table public.settings add constraint settings_logo_scale_range check (logo_scale between 0.25 and 4);

grant update (logo_url, logo_scale, cert_bg_pdf_url, cert_layout_config) on public.settings to authenticated;

-- ---------------------------------------------------------------------
--  2) المستويات: من الأول إلى الخامس
-- ---------------------------------------------------------------------
insert into public.levels (name, sort_order) values
  ('المستوى الأول', 1), ('المستوى الثاني', 2), ('المستوى الثالث', 3),
  ('المستوى الرابع', 4), ('المستوى الخامس', 5)
on conflict (name) do update set active = true, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
--  3) إزالة المتون: الأعمدة والجداول والعروض
-- ---------------------------------------------------------------------
drop view if exists public.v_students;
drop view if exists public.v_appointments;
drop view if exists public.v_certificates;
drop view if exists public.v_applications;

alter table public.exam_questions drop column if exists matn_id;

-- الشهادات: اسم المستوى بدل أسماء المتون (مع ترحيل الشهادات الصادرة)
alter table public.certificates add column if not exists level_name text;
update public.certificates c
   set level_name = l.name
  from public.applications a
  left join public.levels l on l.id = a.level_id
 where a.id = c.application_id and c.level_name is null;
alter table public.certificates drop column if exists matn_names;

drop table if exists public.application_matns;
drop table if exists public.matns;

-- ---------- إعادة بناء العروض بلا المتون ----------
create view public.v_applications with (security_invoker = true) as
select a.*,
       s.student_no, s.full_name, s.national_id, s.phone, s.whatsapp, s.email,
       s.gender, s.birth_date, s.residence,
       o.name  as office_name,
       l.name  as level_name,
       c.name  as cycle_name,
       e.full_name as examiner_name,
       lx.id as exam_id, lx.exam_no, lx.status as exam_status, lx.score as exam_score
from public.applications a
join public.students s on s.id = a.student_id
left join public.offices o on o.id = a.office_id
left join public.levels l on l.id = a.level_id
left join public.cycles c on c.id = a.cycle_id
left join public.examiners e on e.id = a.examiner_id
left join lateral (
  select x.id, x.exam_no, x.status, x.score from public.exams x
  where x.application_id = a.id order by x.created_at desc limit 1
) lx on true;

create view public.v_students with (security_invoker = true) as
select s.*,
       la.id as application_id, la.reg_no, la.status as application_status, la.memorized_amount,
       la.level_name, la.office_name, la.office_id, la.examiner_id, la.examiner_name, la.exam_score,
       (select count(*) from public.applications a2 where a2.student_id = s.id) as applications_count
from public.students s
left join lateral (
  select va.* from public.v_applications va
  where va.student_id = s.id order by va.created_at desc limit 1
) la on true;

create view public.v_appointments with (security_invoker = true) as
select ap.*,
       a.reg_no, a.student_id, a.office_id, a.cycle_id, a.status as application_status,
       s.full_name, s.whatsapp, s.phone, s.student_no,
       e.full_name as examiner_name,
       o.name as office_name,
       l.name as level_name,
       (select x.id from public.exams x where x.appointment_id = ap.id order by x.created_at desc limit 1) as exam_id
from public.appointments ap
join public.applications a on a.id = ap.application_id
join public.students s on s.id = a.student_id
left join public.examiners e on e.id = ap.examiner_id
left join public.offices o on o.id = a.office_id
left join public.levels l on l.id = a.level_id;

create view public.v_certificates with (security_invoker = true) as
select c.*, x.exam_no, x.exam_date, s.student_no, s.national_id, a.reg_no, o.name as office_name
from public.certificates c
join public.exams x on x.id = c.exam_id
join public.students s on s.id = c.student_id
join public.applications a on a.id = c.application_id
left join public.offices o on o.id = a.office_id;

grant select on public.v_applications, public.v_students, public.v_appointments, public.v_certificates to authenticated;

-- ---------- تسجيل الطلبات: المستوى فقط ----------
create or replace function public.submit_application(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_is_admin  boolean := public.is_admin();
  v_cycle     public.cycles;
  v_student   public.students;
  v_app       public.applications;
  v_nid       text := btrim(p ->> 'national_id');
  v_existing  text;
begin
  perform public.enforce_rate_limit('submit_application', 30, 600);

  -- الحقول الإلزامية
  if coalesce(btrim(p ->> 'first_name'), '') = '' or coalesce(btrim(p ->> 'father_name'), '') = ''
     or coalesce(btrim(p ->> 'family_name'), '') = '' or coalesce(p ->> 'birth_date', '') = ''
     or coalesce(p ->> 'gender', '') = '' or coalesce(btrim(p ->> 'residence'), '') = ''
     or coalesce(btrim(p ->> 'circle_name'), '') = '' or coalesce(btrim(p ->> 'center_name'), '') = ''
     or coalesce(p ->> 'office_id', '') = '' or coalesce(p ->> 'level_id', '') = ''
     or coalesce(p ->> 'section', '') = '' or coalesce(btrim(p ->> 'memorized_amount'), '') = '' then
    raise exception 'يرجى استكمال الحقول الإلزامية' using errcode = '22023';
  end if;
  if v_nid !~ '^[0-9]{12}$' then
    raise exception 'الرقم الوطني يجب أن يتكون من 12 رقماً' using errcode = '22023';
  end if;
  if not public.valid_phone(p ->> 'phone') or not public.valid_phone(p ->> 'whatsapp') then
    raise exception 'رقم الهاتف أو واتساب غير صحيح' using errcode = '22023';
  end if;
  if (p ->> 'birth_date')::date > public.libya_today() then
    raise exception 'تاريخ الميلاد غير صحيح' using errcode = '22023';
  end if;
  if nullif(btrim(p ->> 'email'), '') is not null and btrim(p ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'البريد الإلكتروني غير صحيح' using errcode = '22023';
  end if;

  -- الدورة
  if v_is_admin and p ? 'cycle_id' then
    select * into v_cycle from public.cycles where id = (p ->> 'cycle_id')::uuid;
  else
    select * into v_cycle from public.cycles where is_current;
  end if;
  if v_cycle.id is null then
    raise exception 'لا توجد دورة مفتوحة للتسجيل حالياً' using errcode = 'P0001';
  end if;
  if not v_cycle.registration_open and not v_is_admin then
    raise exception 'التسجيل مغلق في الدورة الحالية' using errcode = 'P0001';
  end if;

  -- المكتب والمستوى
  if not exists (select 1 from public.offices where id = (p ->> 'office_id')::uuid and active) then
    raise exception 'المكتب المختار غير متاح' using errcode = '22023';
  end if;
  if not exists (select 1 from public.levels where id = (p ->> 'level_id')::uuid and active) then
    raise exception 'المستوى المختار غير متاح' using errcode = '22023';
  end if;

  -- الطالب: يُنشأ أول مرة. الطالب المسجَّل مسبقاً لا تُعدَّل بياناته من الواجهة العامة،
  -- حتى لا يستطيع أحد تغيير بيانات غيره بمجرد معرفة رقمه الوطني.
  select * into v_student from public.students where national_id = v_nid;
  if v_student.id is null then
    insert into public.students (national_id, first_name, father_name, grandfather_name, family_name,
                                 birth_date, gender, residence, phone, whatsapp, email)
    values (v_nid, btrim(p ->> 'first_name'), btrim(p ->> 'father_name'), nullif(btrim(p ->> 'grandfather_name'), ''),
            btrim(p ->> 'family_name'), (p ->> 'birth_date')::date, (p ->> 'gender')::public.gender,
            btrim(p ->> 'residence'), public.normalize_phone(p ->> 'phone'), public.normalize_phone(p ->> 'whatsapp'),
            nullif(lower(btrim(p ->> 'email')), ''))
    returning * into v_student;
  elsif not v_is_admin and (v_student.first_name <> btrim(p ->> 'first_name')
         or v_student.family_name <> btrim(p ->> 'family_name')
         or v_student.birth_date <> (p ->> 'birth_date')::date) then
    raise exception 'الرقم الوطني مسجَّل مسبقاً ببيانات مختلفة. يرجى مراجعة الإدارة' using errcode = 'P0001';
  end if;

  select reg_no into v_existing from public.applications
  where student_id = v_student.id and cycle_id = v_cycle.id;
  if v_existing is not null then
    raise exception 'يوجد طلب مسجَّل لهذا الطالب في الدورة الحالية' using errcode = '23505';
  end if;

  insert into public.applications (student_id, cycle_id, section, circle_name, center_name, office_id,
                                   teacher_name, level_id, memorized_amount, verses_range, student_notes)
  values (v_student.id, v_cycle.id, (p ->> 'section')::public.program_section, btrim(p ->> 'circle_name'),
          btrim(p ->> 'center_name'), (p ->> 'office_id')::uuid, nullif(btrim(p ->> 'teacher_name'), ''),
          (p ->> 'level_id')::uuid, btrim(p ->> 'memorized_amount'), nullif(btrim(p ->> 'verses_range'), ''),
          nullif(btrim(p ->> 'student_notes'), ''))
  returning * into v_app;

  if v_is_admin then
    perform public.log_action('application.create', 'application', v_app.reg_no, jsonb_build_object('student', v_student.full_name));
  else
    perform public.notify_admins('طلب تسجيل جديد: ' || v_student.full_name, v_app.reg_no, 'info', '/admin/applications');
  end if;

  return jsonb_build_object(
    'reg_no', v_app.reg_no, 'student_no', v_student.student_no,
    'status', v_app.status, 'created_at', v_app.created_at, 'cycle', v_cycle.name);
end $$;

-- ---------- الاستعلام عن النتيجة: المستوى بدل المتون ----------
create or replace function public.lookup_result(p_query text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_q text := upper(btrim(p_query));
  v_student public.students;
  v_app public.applications;
  v_exam public.exams;
begin
  perform public.enforce_rate_limit('lookup', 60, 600);
  if length(v_q) < 5 then return jsonb_build_object('state', 'not_found'); end if;

  select * into v_student from public.students where student_no = v_q or national_id = v_q;
  if v_student.id is null then return jsonb_build_object('state', 'not_found'); end if;

  select * into v_app from public.applications where student_id = v_student.id
  order by created_at desc limit 1;
  if v_app.id is null then return jsonb_build_object('state', 'not_found'); end if;

  select * into v_exam from public.exams where application_id = v_app.id and status = 'approved';
  if v_exam.id is null then
    return jsonb_build_object('state', case when v_app.status = 'admin_pending' then 'pending' else 'in_progress' end,
                              'status', v_app.status, 'reg_no', v_app.reg_no);
  end if;

  return jsonb_build_object(
    'state', 'published',
    'student_name', v_student.full_name,
    'student_no', v_student.student_no,
    'reg_no', v_app.reg_no,
    'exam_no', v_exam.exam_no,
    'exam_date', v_exam.exam_date,
    'examiner', (select full_name from public.examiners where id = v_exam.examiner_id),
    'office', (select name from public.offices where id = v_app.office_id),
    'level', (select name from public.levels where id = v_app.level_id),
    'score', v_exam.score,
    'grade', public.grade_for(v_exam.score),
    'aggregate', v_exam.config ->> 'aggregate',
    'base', (v_exam.config ->> 'base')::numeric,
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
                     'index', q.q_index,
                     'score', q.score,
                     'criteria', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'name', c ->> 'name',
                                     'max', (c ->> 'max_score')::numeric,
                                     'value', coalesce((q.criteria_scores ->> (c ->> 'id'))::numeric, (c ->> 'default_score')::numeric))), '[]')
                                  from jsonb_array_elements(v_exam.config -> 'criteria') c),
                     'deductions_total', (select coalesce(sum(coalesce((q.deductions ->> (d ->> 'id'))::numeric, 0) * (d ->> 'value')::numeric), 0)
                                          from jsonb_array_elements(v_exam.config -> 'deductions') d)
                   ) order by q.q_index)
                   from public.exam_questions q where q.exam_id = v_exam.id), '[]'),
    'certificate', (select jsonb_build_object('cert_no', ce.cert_no, 'issued_at', ce.issued_at)
                    from public.certificates ce where ce.exam_id = v_exam.id and ce.status = 'valid')
  );
end $$;

create or replace function public.verify_certificate(p_cert_no text)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('lookup', 60, 600);
  return (select jsonb_build_object(
    'cert_no', c.cert_no, 'student_name', c.student_name, 'score', c.score, 'grade', c.grade,
    'level', coalesce(c.level_name, ''), 'issued_at', c.issued_at, 'status', c.status,
    'revoked_at', c.revoked_at, 'org_name', (select org_name from public.settings where id = 1))
  from public.certificates c
  where c.cert_no = upper(btrim(p_cert_no)));
end $$;

create or replace function public.issue_certificate(p_exam_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_exam public.exams;
  v_app  public.applications;
  v_set  public.settings;
  v_no   text;
begin
  if not public.has_perm('issue_certificates') then
    raise exception 'لا تملك صلاحية إصدار الشهادات' using errcode = '42501';
  end if;
  select * into v_exam from public.exams where id = p_exam_id for update;
  if v_exam.id is null or v_exam.status <> 'approved' then
    raise exception 'تُصدر الشهادة للنتائج المعتمدة فقط' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.certificates where exam_id = p_exam_id) then
    raise exception 'صدرت شهادة لهذا الامتحان مسبقاً' using errcode = '23505';
  end if;

  select * into v_app from public.applications where id = v_exam.application_id;
  select * into v_set from public.settings where id = 1;
  v_no := public.next_serial('certificate:' || v_set.cert_prefix, v_set.cert_prefix, v_set.cert_digits);

  insert into public.certificates (cert_no, exam_id, application_id, student_id, student_name, level_name, score, grade, issued_by)
  select v_no, v_exam.id, v_app.id, s.id, s.full_name,
         (select l.name from public.levels l where l.id = v_app.level_id),
         v_exam.score, public.grade_for(v_exam.score), auth.uid()
  from public.students s where s.id = v_app.student_id;

  perform public.log_action('certificate.issue', 'certificate', v_no, jsonb_build_object('exam', v_exam.exam_no));
  return v_no;
end $$;

-- ---------- متغيرات الرسائل: {{level}} بدل {{matns}} ----------
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
    'level', coalesce(lv.name, ''),
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
  left join public.levels lv on lv.id = a.level_id
  left join public.examiners e on e.id = a.examiner_id
  left join public.appointments ap on ap.id = p_appointment_id
  left join lateral (select score from public.exams where application_id = a.id and status = 'approved' limit 1) x on true
  left join lateral (select cert_no from public.certificates where application_id = a.id and status = 'valid'
                     order by issued_at desc limit 1) ce on true
  where a.id = p_application_id and st.id = 1;

  return v_result;
end $$;

update public.message_templates
   set body = replace(body, 'المتون: {{matns}}', 'المستوى: {{level}}')
 where body like '%{{matns}}%';
update public.message_templates
   set body = replace(body, '{{matns}}', '{{level}}')
 where body like '%{{matns}}%';

-- المشغّل المؤجَّل للطلب الجديد لم يعد لازماً (لا توجد متون تُضاف بعد الطلب)، ويبقى كما هو بلا ضرر.

-- ---------------------------------------------------------------------
--  4) إلغاء إجبار تغيير كلمة المرور: الكلمة التي يضعها الإداري نهائية
-- ---------------------------------------------------------------------
alter table public.profiles alter column must_change_password set default false;
update public.profiles set must_change_password = false where must_change_password;

-- ---------------------------------------------------------------------
--  5) تصدير الرسائل للإرسال المحلي
-- ---------------------------------------------------------------------
-- يُعلّم الرسائل المحددة بأنها صُدّرت (أو أُرسلت يدوياً) بعد تنزيل ملف Excel/CSV
create or replace function public.export_messages(p_ids uuid[], p_status text default 'exported')
returns int language plpgsql security definer set search_path = public
as $$
declare
  v_status public.message_status;
  v_count  int;
begin
  perform public.require_admin();
  if p_status not in ('exported', 'sent') then
    raise exception 'الحالة المطلوبة غير صحيحة' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  v_status := p_status::public.message_status;

  update public.outbound_messages m
     set status     = v_status,
         sent_at    = case when v_status = 'sent' then coalesce(m.sent_at, now()) else m.sent_at end,
         claimed_at = null,
         last_error = null
   where m.id = any(p_ids) and m.status in ('queued', 'exported');
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.log_action('messages.export', 'settings', 'outbound_messages',
                              jsonb_build_object('count', v_count, 'status', p_status));
  end if;
  return v_count;
end $$;

-- الرسائل المُصدّرة يمكن إعادتها إلى الطابور
create or replace function public.retry_message(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_admin();
  update public.outbound_messages
     set status = 'queued', attempts = 0, send_after = now(), last_error = null, claimed_at = null
   where id = p_id and status in ('failed', 'cancelled', 'exported');
end $$;

-- ---------------------------------------------------------------------
--  6) استيراد المكاتب دفعةً واحدة (بدون حذف: تفعيل وتحديث ترتيب، وتعطيل ما خرج من القائمة)
-- ---------------------------------------------------------------------
create or replace function public.import_offices(p_names text[], p_deactivate_missing boolean default false)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_name     text;
  v_order    int;
  v_inserted boolean;
  v_added    int := 0;
  v_updated  int := 0;
  v_off      int := 0;
  v_kept     text[] := '{}';
begin
  if not public.is_super_admin() then
    raise exception 'إدارة المكاتب من صلاحية مدير النظام' using errcode = '42501';
  end if;

  for v_name, v_order in
    select btrim(t.x), t.ord::int from unnest(coalesce(p_names, '{}'::text[])) with ordinality as t(x, ord)
    where btrim(t.x) <> ''
  loop
    insert into public.offices (name, sort_order, active)
    values (v_name, v_order, true)
    on conflict (name) do update set active = true, sort_order = excluded.sort_order
    returning (xmax = 0) into v_inserted;
    if v_inserted then v_added := v_added + 1; else v_updated := v_updated + 1; end if;
    v_kept := v_kept || v_name;
  end loop;

  if p_deactivate_missing and coalesce(array_length(v_kept, 1), 0) > 0 then
    update public.offices set active = false where active and not (name = any(v_kept));
    get diagnostics v_off = row_count;
  end if;

  perform public.log_action('offices.import', 'settings', 'offices',
                            jsonb_build_object('added', v_added, 'updated', v_updated, 'deactivated', v_off));
  return jsonb_build_object('added', v_added, 'updated', v_updated, 'deactivated', v_off);
end $$;

-- ---------------------------------------------------------------------
--  7) دقة الكسور العشرية في احتساب الدرجات (تطابق src/lib/scoring.js)
--     كل القيم تُقرَّب إلى منزلتين قبل الضرب، والنتيجة النهائية بقسمة واحدة.
-- ---------------------------------------------------------------------
create or replace function public.compute_question_score(p_config jsonb, p_criteria jsonb, p_deductions jsonb)
returns numeric language plpgsql immutable set search_path = public
as $$
declare
  v_base  numeric := round(coalesce((p_config ->> 'base')::numeric, 100), 2);
  v_total numeric := v_base;
  c jsonb; d jsonb; v_max numeric; v_given numeric; v_count numeric;
begin
  for c in select value from jsonb_array_elements(coalesce(p_config -> 'criteria', '[]'::jsonb)) loop
    v_max   := round((c ->> 'max_score')::numeric, 2);
    v_given := round(coalesce((p_criteria ->> (c ->> 'id'))::numeric, (c ->> 'default_score')::numeric, 0), 2);
    v_given := greatest(0, least(v_max, v_given));
    v_total := v_total - (v_max - v_given) * round(coalesce((c ->> 'penalty_factor')::numeric, 1), 2);
  end loop;
  for d in select value from jsonb_array_elements(coalesce(p_config -> 'deductions', '[]'::jsonb)) loop
    v_count := greatest(0, floor(coalesce((p_deductions ->> (d ->> 'id'))::numeric, 0)));
    v_total := v_total - v_count * round((d ->> 'value')::numeric, 2);
  end loop;
  return round(greatest(0, least(v_base, v_total)), 2);
end $$;

create or replace function public.compute_exam_score(p_exam_id uuid)
returns numeric language plpgsql stable security definer set search_path = public
as $$
declare
  v_config jsonb; v_base numeric; v_min boolean; v_num numeric; v_den numeric;
begin
  select config into v_config from public.exams where id = p_exam_id;
  v_base := round(coalesce((v_config ->> 'base')::numeric, 100), 2);
  if v_base <= 0 then return null; end if;
  v_min := (v_config ->> 'aggregate') = 'min';

  select case when v_min then min(score) * 100 else sum(score) * 100 end,
         case when v_min then v_base else count(score) * v_base end
    into v_num, v_den
  from public.exam_questions where exam_id = p_exam_id;

  if v_num is null or coalesce(v_den, 0) = 0 then return null; end if;
  return round(greatest(0, least(100, v_num / v_den)), 2);
end $$;

-- ---------------------------------------------------------------------
--  8) الصلاحيات: منع التنفيذ العام ثم المنح الصريح
-- ---------------------------------------------------------------------
revoke execute on function
  public.submit_application(jsonb), public.lookup_result(text), public.verify_certificate(text),
  public.issue_certificate(uuid), public.message_params(uuid, uuid), public.retry_message(uuid),
  public.export_messages(uuid[], text), public.import_offices(text[], boolean),
  public.compute_question_score(jsonb, jsonb, jsonb), public.compute_exam_score(uuid)
from public, anon, authenticated;

grant execute on function
  public.submit_application(jsonb), public.lookup_result(text), public.verify_certificate(text)
to anon, authenticated;

grant execute on function
  public.issue_certificate(uuid), public.retry_message(uuid),
  public.export_messages(uuid[], text), public.import_offices(text[], boolean)
to authenticated;

-- ---------------------------------------------------------------------
--  9) مخزن ملفات الهوية: الشعار وقالب الشهادة (Supabase Storage)
--     القراءة عامة، والرفع والحذف لمدير النظام فقط.
--     محاط بشرط وجود مخطط storage حتى تعمل الاختبارات على PGlite.
-- ---------------------------------------------------------------------
do $do$
begin
  if to_regclass('storage.buckets') is null then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('branding', 'branding', true, 10485760,
          array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'])
  on conflict (id) do update
     set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_read') then
    execute $p$create policy branding_read on storage.objects for select to anon, authenticated using (bucket_id = 'branding')$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_write') then
    execute $p$create policy branding_write on storage.objects for all to authenticated
             using (bucket_id = 'branding' and public.is_super_admin())
             with check (bucket_id = 'branding' and public.is_super_admin())$p$;
  end if;
end
$do$;
