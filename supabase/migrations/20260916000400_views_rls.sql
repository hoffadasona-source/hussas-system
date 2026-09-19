-- =====================================================================
--  العروض (Views) وسياسات أمان الصفوف (RLS) والصلاحيات
-- =====================================================================

-- ---------- العروض ----------
-- security_invoker: تُطبَّق سياسات RLS الخاصة بالمستخدم على الجداول الأصلية.
create view public.v_applications with (security_invoker = true) as
select a.*,
       s.student_no, s.full_name, s.national_id, s.phone, s.whatsapp, s.email,
       s.gender, s.birth_date, s.residence,
       o.name  as office_name,
       l.name  as level_name,
       c.name  as cycle_name,
       e.full_name as examiner_name,
       coalesce((select array_agg(m.name order by m.sort_order, m.name)
                 from public.application_matns am join public.matns m on m.id = am.matn_id
                 where am.application_id = a.id), '{}') as matn_names,
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
       coalesce((select array_agg(m.name order by m.sort_order, m.name)
                 from public.application_matns am join public.matns m on m.id = am.matn_id
                 where am.application_id = a.id), '{}') as matn_names,
       (select x.id from public.exams x where x.appointment_id = ap.id order by x.created_at desc limit 1) as exam_id
from public.appointments ap
join public.applications a on a.id = ap.application_id
join public.students s on s.id = a.student_id
left join public.examiners e on e.id = ap.examiner_id
left join public.offices o on o.id = a.office_id;

create view public.v_exams with (security_invoker = true) as
select x.id, x.exam_no, x.application_id, x.appointment_id, x.examiner_id, x.exam_date, x.status, x.score,
       x.submitted_at, x.approved_at, x.returned_at, x.return_reason, x.admin_notes, x.created_at, x.updated_at,
       a.reg_no, a.office_id, a.cycle_id, a.level_id,
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

create view public.v_certificates with (security_invoker = true) as
select c.*, x.exam_no, x.exam_date, s.student_no, s.national_id, a.reg_no, o.name as office_name
from public.certificates c
join public.exams x on x.id = c.exam_id
join public.students s on s.id = c.student_id
join public.applications a on a.id = c.application_id
left join public.offices o on o.id = a.office_id;

create view public.v_examiners with (security_invoker = true) as
select e.*, o.name as office_name, p.username, p.status as account_status, p.last_sign_in_at,
       (select count(*) from public.applications a
         where a.examiner_id = e.id and a.status not in ('published', 'rejected')) as active_students
from public.examiners e
left join public.offices o on o.id = e.office_id
left join public.profiles p on p.id = e.user_id;

-- ---------- تفعيل RLS ----------
alter table public.settings          enable row level security;
alter table public.cycles            enable row level security;
alter table public.offices           enable row level security;
alter table public.levels            enable row level security;
alter table public.matns             enable row level security;
alter table public.profiles          enable row level security;
alter table public.examiners         enable row level security;
alter table public.students          enable row level security;
alter table public.applications      enable row level security;
alter table public.application_matns enable row level security;
alter table public.appointments      enable row level security;
alter table public.criteria          enable row level security;
alter table public.deduction_types   enable row level security;
alter table public.grade_scales      enable row level security;
alter table public.exams             enable row level security;
alter table public.exam_questions    enable row level security;
alter table public.certificates      enable row level security;
alter table public.audit_log         enable row level security;
alter table public.notifications     enable row level security;
alter table public.serial_counters   enable row level security;
alter table public.rate_limits       enable row level security;

-- ---------- الإعدادات والقوائم: قراءة عامة، تعديل لمدير النظام ----------
create policy settings_read   on public.settings for select to anon, authenticated using (true);
create policy settings_update on public.settings for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy cycles_read  on public.cycles  for select to anon, authenticated using (true);
create policy cycles_write on public.cycles  for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy offices_read  on public.offices for select to anon, authenticated using (true);
create policy offices_write on public.offices for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy levels_read  on public.levels  for select to anon, authenticated using (true);
create policy levels_write on public.levels  for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy matns_read  on public.matns   for select to anon, authenticated using (true);
create policy matns_write on public.matns   for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy criteria_read  on public.criteria for select to authenticated using ((select public.is_staff()));
create policy criteria_write on public.criteria for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy deductions_read  on public.deduction_types for select to authenticated using ((select public.is_staff()));
create policy deductions_write on public.deduction_types for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy grades_read  on public.grade_scales for select to authenticated using ((select public.is_staff()));
create policy grades_write on public.grade_scales for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- ---------- الحسابات ----------
-- إنشاء الحسابات يتم عبر Edge Function (manage-users) بمفتاح الخدمة فقط.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy examiners_read on public.examiners for select to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()));
create policy examiners_insert on public.examiners for insert to authenticated with check ((select public.is_admin()));
create policy examiners_update on public.examiners for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- الطلبة والطلبات ----------
create policy students_read on public.students for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.applications a
    where a.student_id = students.id and a.examiner_id = (select public.current_examiner_id())));
create policy students_update on public.students for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy students_delete on public.students for delete to authenticated using ((select public.is_super_admin()));

create policy applications_read on public.applications for select to authenticated
  using ((select public.is_admin()) or examiner_id = (select public.current_examiner_id()));
create policy applications_update on public.applications for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy applications_delete on public.applications for delete to authenticated using ((select public.is_super_admin()));

create policy application_matns_read on public.application_matns for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id));
create policy application_matns_write on public.application_matns for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- المواعيد والامتحانات: القراءة بالسياسات، والكتابة عبر الإجراءات ----------
create policy appointments_read on public.appointments for select to authenticated
  using ((select public.is_admin()) or examiner_id = (select public.current_examiner_id()));

create policy exams_read on public.exams for select to authenticated
  using ((select public.is_admin()) or examiner_id = (select public.current_examiner_id()));

create policy exam_questions_read on public.exam_questions for select to authenticated
  using (exists (select 1 from public.exams x where x.id = exam_id));
-- المحفّظ يحفظ درجات أسئلته تلقائياً ما دام الامتحان مفتوحاً
create policy exam_questions_update on public.exam_questions for update to authenticated
  using (exists (select 1 from public.exams x where x.id = exam_id
                 and x.examiner_id = (select public.current_examiner_id())
                 and x.status in ('draft', 'in_progress', 'rejected')))
  with check (exists (select 1 from public.exams x where x.id = exam_id
                      and x.examiner_id = (select public.current_examiner_id())
                      and x.status in ('draft', 'in_progress', 'rejected')));

create policy certificates_read on public.certificates for select to authenticated using ((select public.is_admin()));

create policy audit_read on public.audit_log for select to authenticated using ((select public.is_admin()));

create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- ---------- صلاحيات الأعمدة (دفاع إضافي فوق RLS) ----------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
grant select on public.settings, public.cycles, public.offices, public.levels, public.matns to anon;

revoke insert, update, delete on public.settings, public.profiles, public.students, public.applications,
  public.appointments, public.exams, public.exam_questions, public.certificates, public.audit_log,
  public.notifications, public.serial_counters from authenticated;

grant update (org_name, org_phone, org_email, org_address, work_hours, exam_base, exam_questions, exam_aggregate,
              exam_mode, cert_prefix, cert_digits, cert_title, cert_signer_name, cert_signer_title, cert_show_qr,
              updated_at, updated_by)
  on public.settings to authenticated;
grant update (full_name, role, status, can_final_approve, can_issue_certificates) on public.profiles to authenticated;
grant update (first_name, father_name, grandfather_name, family_name, birth_date, gender, residence, phone, whatsapp, email)
  on public.students to authenticated;
grant delete on public.students, public.applications to authenticated;
grant update (section, circle_name, center_name, office_id, teacher_name, level_id, memorized_amount, verses_range, student_notes)
  on public.applications to authenticated;
grant update (matn_id, criteria_scores, deductions, touched) on public.exam_questions to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on public.serial_counters, public.rate_limits from authenticated;

grant select on public.v_applications, public.v_students, public.v_appointments, public.v_exams,
  public.v_certificates, public.v_examiners to authenticated;

-- ---------- صلاحيات تنفيذ الدوال ----------
-- Supabase يمنح anon/authenticated تنفيذ الدوال افتراضياً؛ نحصرها هنا صراحةً.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.submit_application(jsonb), public.track_application(text),
  public.lookup_result(text), public.verify_certificate(text)
to anon, authenticated;

-- دوال مستخدمة داخل سياسات RLS
grant execute on function
  public.auth_role(), public.is_staff(), public.is_admin(), public.is_super_admin(),
  public.has_perm(text), public.current_examiner_id()
to authenticated;

grant execute on function
  public.mark_application_under_review(uuid), public.approve_application(uuid),
  public.reject_application(uuid, text), public.assign_application(uuid, uuid, text),
  public.save_appointment(uuid, date, time, public.appointment_mode, text, text, uuid),
  public.set_appointment_status(uuid, public.appointment_status, text),
  public.mark_appointment_notified(uuid),
  public.start_exam(uuid), public.submit_exam(uuid), public.approve_exam(uuid, text), public.return_exam(uuid, text),
  public.issue_certificate(uuid), public.revoke_certificate(uuid, text),
  public.record_sign_in(), public.password_changed(), public.admin_dashboard(), public.examiner_dashboard(),
  public.report_summary(uuid, uuid, date, date)
to authenticated;
