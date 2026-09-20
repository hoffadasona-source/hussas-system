-- =====================================================================
--  برنامج مستمر بلا دورات + الطلبة السابقون
--  1) حذف جدول الدورات وربطه من الطلبات، وفتح/إغلاق التسجيل من الإعدادات
--  2) إجراء check_returning_student لجلب بيانات الطالب السابق ومستوياته
--  3) submit_application: برنامج مستمر، ومنع تكرار المستوى المجتاز
--  4) «مقدار الحفظ» و«الأبيات» لم يعودا مطلوبين في التسجيل
-- =====================================================================

-- ---------------------------------------------------------------------
--  1) فتح التسجيل صار إعداداً عاماً بدل خاصية في الدورة
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists registration_open boolean not null default true;
grant update (registration_open) on public.settings to authenticated;

-- ---------------------------------------------------------------------
--  2) إزالة الدورات
-- ---------------------------------------------------------------------
drop view if exists public.v_students;
drop view if exists public.v_appointments;
drop view if exists public.v_exams;
drop view if exists public.v_applications;

alter table public.applications drop column if exists cycle_id;          -- يُسقط معه قيد «طلب واحد لكل دورة»
alter table public.applications alter column memorized_amount drop not null;

drop trigger if exists cycles_audit on public.cycles;
drop table if exists public.cycles;

-- ---------- إعادة بناء العروض بلا دورات ----------
create view public.v_applications with (security_invoker = true) as
select a.*,
       s.student_no, s.full_name, s.national_id, s.phone, s.whatsapp, s.email,
       s.gender, s.birth_date, s.residence,
       o.name  as office_name,
       l.name  as level_name,
       e.full_name as examiner_name,
       lx.id as exam_id, lx.exam_no, lx.status as exam_status, lx.score as exam_score
from public.applications a
join public.students s on s.id = a.student_id
left join public.offices o on o.id = a.office_id
left join public.levels l on l.id = a.level_id
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
       a.reg_no, a.student_id, a.office_id, a.status as application_status,
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

create view public.v_exams with (security_invoker = true) as
select x.id, x.exam_no, x.application_id, x.appointment_id, x.examiner_id, x.exam_date, x.status, x.score,
       x.submitted_at, x.approved_at, x.returned_at, x.return_reason, x.admin_notes, x.created_at, x.updated_at,
       a.reg_no, a.office_id, a.level_id,
       s.id as student_id, s.full_name, s.student_no,
       e.full_name as examiner_name,
       o.name as office_name,
       ce.id as certificate_id, ce.cert_no, ce.status as certificate_status
from public.exams x
join public.applications a on a.id = x.application_id
join public.students s on s.id = a.student_id
left join public.examiners e on e.id = x.examiner_id
left join public.offices o on o.id = a.office_id
left join lateral (
  select c.id, c.cert_no, c.status from public.certificates c where c.exam_id = x.id limit 1
) ce on true;

grant select on public.v_applications, public.v_students, public.v_appointments, public.v_exams to authenticated;

-- ---------------------------------------------------------------------
--  3) الطالب السابق: جلب بياناته ومستوياته السابقة
--     تأكيد الهوية بتاريخ الميلاد للزائر، حتى لا تُكشف بيانات التواصل
--     بمجرد معرفة الرقم الوطني. الموظف معفى (يعمل من لوحة الإدارة).
-- ---------------------------------------------------------------------
create or replace function public.check_returning_student(p_national_id text, p_birth_date date default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_nid     text := btrim(coalesce(p_national_id, ''));
  v_student public.students;
  v_staff   boolean := public.is_staff();
begin
  perform public.enforce_rate_limit('lookup', 60, 600);
  if v_nid !~ '^[0-9]{12}$' then
    return jsonb_build_object('state', 'invalid');
  end if;

  select * into v_student from public.students where national_id = v_nid;
  if v_student.id is null then
    return jsonb_build_object('state', 'not_found');
  end if;
  if not v_staff and (p_birth_date is null or p_birth_date <> v_student.birth_date) then
    return jsonb_build_object('state', 'not_found');
  end if;

  return jsonb_build_object(
    'state', 'found',
    'student', jsonb_build_object(
      'student_no', v_student.student_no,
      'national_id', v_student.national_id,
      'first_name', v_student.first_name,
      'father_name', v_student.father_name,
      'grandfather_name', coalesce(v_student.grandfather_name, ''),
      'family_name', v_student.family_name,
      'full_name', v_student.full_name,
      'birth_date', v_student.birth_date,
      'gender', v_student.gender,
      'residence', v_student.residence,
      'phone', v_student.phone,
      'whatsapp', v_student.whatsapp,
      'email', coalesce(v_student.email, '')),
    'applications', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'reg_no', a.reg_no, 'level_id', a.level_id, 'level', l.name, 'status', a.status,
               'created_at', a.created_at, 'score', x.score) order by a.created_at desc), '[]'::jsonb)
      from public.applications a
      left join public.levels l on l.id = a.level_id
      left join lateral (select score from public.exams where application_id = a.id and status = 'approved' limit 1) x on true
      where a.student_id = v_student.id),
    'open_application', (
      select jsonb_build_object('reg_no', a.reg_no, 'status', a.status, 'level', l.name)
      from public.applications a
      left join public.levels l on l.id = a.level_id
      where a.student_id = v_student.id and a.status not in ('published', 'rejected')
      order by a.created_at desc limit 1),
    'passed_level_ids', (
      select coalesce(jsonb_agg(distinct a.level_id), '[]'::jsonb)
      from public.applications a
      where a.student_id = v_student.id and a.status = 'published')
  );
end $$;

-- ---------------------------------------------------------------------
--  4) التسجيل في برنامج مستمر
-- ---------------------------------------------------------------------
create or replace function public.submit_application(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_is_admin  boolean := public.is_admin();
  v_open      boolean;
  v_student   public.students;
  v_app       public.applications;
  v_level     public.levels;
  v_nid       text := btrim(p ->> 'national_id');
  v_same      boolean;
  v_existing  text;
begin
  perform public.enforce_rate_limit('submit_application', 30, 600);

  -- الحقول الإلزامية (البرنامج مستمر: لا دورات، ومقدار الحفظ لم يعد مطلوباً)
  if coalesce(btrim(p ->> 'first_name'), '') = '' or coalesce(btrim(p ->> 'father_name'), '') = ''
     or coalesce(btrim(p ->> 'family_name'), '') = '' or coalesce(p ->> 'birth_date', '') = ''
     or coalesce(p ->> 'gender', '') = '' or coalesce(btrim(p ->> 'residence'), '') = ''
     or coalesce(btrim(p ->> 'circle_name'), '') = '' or coalesce(btrim(p ->> 'center_name'), '') = ''
     or coalesce(p ->> 'office_id', '') = '' or coalesce(p ->> 'level_id', '') = ''
     or coalesce(p ->> 'section', '') = '' then
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

  select registration_open into v_open from public.settings where id = 1;
  if not coalesce(v_open, true) and not v_is_admin then
    raise exception 'التسجيل مغلق حالياً. تابع إعلانات البرنامج لمعرفة موعد فتحه' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.offices where id = (p ->> 'office_id')::uuid and active) then
    raise exception 'المكتب المختار غير متاح' using errcode = '22023';
  end if;
  select * into v_level from public.levels where id = (p ->> 'level_id')::uuid and active;
  if v_level.id is null then
    raise exception 'المستوى المختار غير متاح' using errcode = '22023';
  end if;

  -- الطالب: يُنشأ أول مرة، والعائد تُحدَّث بيانات تواصله بعد تطابق اسمه وتاريخ ميلاده
  select * into v_student from public.students where national_id = v_nid;
  if v_student.id is null then
    insert into public.students (national_id, first_name, father_name, grandfather_name, family_name,
                                 birth_date, gender, residence, phone, whatsapp, email)
    values (v_nid, btrim(p ->> 'first_name'), btrim(p ->> 'father_name'), nullif(btrim(p ->> 'grandfather_name'), ''),
            btrim(p ->> 'family_name'), (p ->> 'birth_date')::date, (p ->> 'gender')::public.gender,
            btrim(p ->> 'residence'), public.normalize_phone(p ->> 'phone'), public.normalize_phone(p ->> 'whatsapp'),
            nullif(lower(btrim(p ->> 'email')), ''))
    returning * into v_student;
  else
    v_same := v_student.first_name = btrim(p ->> 'first_name')
          and v_student.family_name = btrim(p ->> 'family_name')
          and v_student.birth_date = (p ->> 'birth_date')::date;
    if not v_same and not v_is_admin then
      raise exception 'الرقم الوطني مسجَّل مسبقاً ببيانات مختلفة. يرجى مراجعة الإدارة' using errcode = 'P0001';
    end if;
    update public.students set
      residence = btrim(p ->> 'residence'),
      phone     = public.normalize_phone(p ->> 'phone'),
      whatsapp  = public.normalize_phone(p ->> 'whatsapp'),
      email     = coalesce(nullif(lower(btrim(p ->> 'email')), ''), email)
    where id = v_student.id
    returning * into v_student;
  end if;

  -- برنامج مستمر: طلب مفتوح واحد فقط، ولا يُعاد امتحان مستوى اجتازه الطالب
  select reg_no into v_existing from public.applications
  where student_id = v_student.id and status not in ('published', 'rejected')
  order by created_at desc limit 1;
  if v_existing is not null then
    raise exception 'يوجد طلب قيد المعالجة لهذا الطالب (%). تابع حالته أو راجع الإدارة', v_existing using errcode = '23505';
  end if;
  if exists (select 1 from public.applications
             where student_id = v_student.id and level_id = v_level.id and status = 'published') then
    raise exception 'سبق للطالب اجتياز امتحان %. اختر مستوى آخر', v_level.name using errcode = '23505';
  end if;

  insert into public.applications (student_id, section, circle_name, center_name, office_id,
                                   teacher_name, level_id, memorized_amount, verses_range, student_notes)
  values (v_student.id, (p ->> 'section')::public.program_section, btrim(p ->> 'circle_name'),
          btrim(p ->> 'center_name'), (p ->> 'office_id')::uuid, nullif(btrim(p ->> 'teacher_name'), ''),
          v_level.id, nullif(btrim(p ->> 'memorized_amount'), ''), nullif(btrim(p ->> 'verses_range'), ''),
          nullif(btrim(p ->> 'student_notes'), ''))
  returning * into v_app;

  if v_is_admin then
    perform public.log_action('application.create', 'application', v_app.reg_no, jsonb_build_object('student', v_student.full_name));
  else
    perform public.notify_admins('طلب تسجيل جديد: ' || v_student.full_name, v_app.reg_no, 'info', '/admin/applications');
  end if;

  return jsonb_build_object(
    'reg_no', v_app.reg_no, 'student_no', v_student.student_no, 'level', v_level.name,
    'status', v_app.status, 'created_at', v_app.created_at,
    'returning', (select count(*) > 1 from public.applications where student_id = v_student.id));
end $$;

-- ---------- متابعة الطلب بلا دورة ----------
create or replace function public.track_application(p_query text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_q text := upper(btrim(p_query));
  v_app public.applications;
  v_result jsonb;
begin
  perform public.enforce_rate_limit('lookup', 60, 600);
  if length(v_q) < 5 then return null; end if;

  select a.* into v_app from public.applications a
  join public.students s on s.id = a.student_id
  where a.reg_no = v_q or s.national_id = v_q
  order by a.created_at desc limit 1;
  if v_app.id is null then return null; end if;

  select jsonb_build_object(
    'reg_no', v_app.reg_no,
    'status', v_app.status,
    'student_name', s.full_name,
    'office', o.name,
    'circle', v_app.circle_name,
    'level', l.name,
    'examiner', e.full_name,
    'rejection_reason', case when v_app.status = 'rejected' then v_app.rejection_reason end,
    'created_at', v_app.created_at,
    'reviewed_at', v_app.reviewed_at,
    'assigned_at', v_app.assigned_at,
    'appointment', (select jsonb_build_object('date', ap.exam_date, 'time', to_char(ap.exam_time, 'HH24:MI'),
                                              'mode', ap.mode, 'status', ap.status)
                    from public.appointments ap where ap.application_id = v_app.id and ap.status <> 'cancelled'
                    order by ap.exam_date desc, ap.exam_time desc limit 1),
    'exam_submitted_at', (select max(x.submitted_at) from public.exams x where x.application_id = v_app.id),
    'result_approved_at', (select x.approved_at from public.exams x where x.application_id = v_app.id and x.status = 'approved'),
    'certificate_issued_at', (select ce.issued_at from public.certificates ce
                              where ce.application_id = v_app.id and ce.status = 'valid')
  ) into v_result
  from public.students s
  join public.offices o on o.id = v_app.office_id
  left join public.levels l on l.id = v_app.level_id
  left join public.examiners e on e.id = v_app.examiner_id
  where s.id = v_app.student_id;

  return v_result;
end $$;

-- ---------- متغيرات الرسائل: حذف {{cycle}} ----------
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

-- ---------- اللوحة والتقارير بلا دورات ----------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'students', (select count(distinct student_id) from public.applications),
    'new_applications', (select count(*) from public.applications where status in ('pending', 'under_review')),
    'approved', (select count(*) from public.applications where status not in ('pending', 'under_review', 'rejected')),
    'assigned', (select count(*) from public.applications where examiner_id is not null),
    'scheduled', (select count(*) from public.appointments where status = 'scheduled'),
    'exams_done', (select count(*) from public.exams where status in ('examiner_approved', 'approved')),
    'pending_results', (select count(*) from public.exams where status = 'examiner_approved'),
    'approved_results', (select count(*) from public.exams where status = 'approved'),
    'certificates', (select count(*) from public.certificates where status = 'valid'),
    'ready_certificates', (select count(*) from public.exams x where x.status = 'approved'
                           and not exists (select 1 from public.certificates c where c.exam_id = x.id)),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'count', m.cnt) order by m.month), '[]')
                from (select to_char(date_trunc('month', g), 'YYYY-MM') as month,
                             (select count(*) from public.exams x
                               where x.status in ('examiner_approved', 'approved')
                                 and date_trunc('month', x.exam_date) = date_trunc('month', g)) as cnt
                      from generate_series(date_trunc('month', public.libya_today()) - interval '5 months',
                                           date_trunc('month', public.libya_today()), interval '1 month') g) m)
  );
end $$;

drop function if exists public.report_summary(uuid, uuid, date, date);

create or replace function public.report_summary(
  p_office_id uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_has_pass boolean := exists (select 1 from public.grade_scales where is_passing);
begin
  perform public.require_admin();
  return (
    with apps as (
      select a.* from public.applications a
      where (p_office_id is null or a.office_id = p_office_id)
    ),
    ex as (
      select x.*, a.office_id, a.level_id from public.exams x join apps a on a.id = x.application_id
      where x.status = 'approved'
        and (p_from is null or x.exam_date >= p_from)
        and (p_to is null or x.exam_date <= p_to)
    ),
    passing as (
      select ex.id from ex where exists (select 1 from public.grade_scales g
                                         where g.is_passing and ex.score between g.min_score and g.max_score)
    )
    select jsonb_build_object(
      'applications', (select count(*) from apps),
      'exams', (select count(*) from ex),
      'average', (select round(avg(score), 1) from ex),
      'pass_rate', case when v_has_pass and (select count(*) from ex) > 0
                        then round((select count(*) from passing)::numeric * 100 / (select count(*) from ex), 1) end,
      'absences', (select count(*) from public.appointments ap join apps a on a.id = ap.application_id
                   where ap.status = 'absent'
                     and (p_from is null or ap.exam_date >= p_from) and (p_to is null or ap.exam_date <= p_to)),
      'by_status', (select coalesce(jsonb_object_agg(status, cnt), '{}')
                    from (select status, count(*) cnt from apps group by status) t),
      'by_office', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'applications', t.apps,
                                   'exams', t.exams, 'average', t.avg) order by o.sort_order, o.name), '[]')
                    from public.offices o
                    join (select a.office_id,
                                 count(distinct a.id) apps,
                                 count(ex.id) exams,
                                 round(avg(ex.score), 1) avg
                          from apps a left join ex on ex.application_id = a.id
                          group by a.office_id) t on t.office_id = o.id),
      'by_examiner', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'exams', t.exams,
                                     'average', t.avg) order by t.exams desc), '[]')
                      from (select examiner_id, count(*) exams, round(avg(score), 1) avg from ex group by examiner_id) t
                      join public.examiners e on e.id = t.examiner_id),
      'by_level', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'exams', t.exams,
                                  'average', t.avg) order by l.sort_order), '[]')
                   from (select level_id, count(*) exams, round(avg(score), 1) avg from ex group by level_id) t
                   join public.levels l on l.id = t.level_id),
      'deductions', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'count', t.cnt) order by t.cnt desc), '[]')
                     from (select d ->> 'name' as name, sum(coalesce((q.deductions ->> (d ->> 'id'))::int, 0)) cnt
                           from ex
                           join public.exam_questions q on q.exam_id = ex.id
                           cross join lateral jsonb_array_elements(ex.config -> 'deductions') d
                           group by d ->> 'name') t
                     where t.cnt > 0)
    )
  );
end $$;

-- ---------------------------------------------------------------------
--  5) الصلاحيات
-- ---------------------------------------------------------------------
revoke execute on function
  public.submit_application(jsonb), public.track_application(text),
  public.check_returning_student(text, date), public.message_params(uuid, uuid),
  public.admin_dashboard(), public.report_summary(uuid, date, date)
from public, anon, authenticated;

grant execute on function
  public.submit_application(jsonb), public.track_application(text), public.check_returning_student(text, date)
to anon, authenticated;

grant execute on function
  public.admin_dashboard(), public.report_summary(uuid, date, date)
to authenticated;
