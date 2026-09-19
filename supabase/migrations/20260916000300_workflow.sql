-- =====================================================================
--  إجراءات سير العمل (RPC). كل تغيير حالة يمر من هنا ويُسجَّل في سجل العمليات.
-- =====================================================================

-- ---------- أدوات تحقق ----------
create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = public
as $$
  select case
    when p is null then null
    when regexp_replace(p, '[^0-9+]', '', 'g') ~ '^\+' then '+' || regexp_replace(p, '[^0-9]', '', 'g')
    else regexp_replace(p, '[^0-9]', '', 'g')
  end
$$;

create or replace function public.valid_phone(p text)
returns boolean language sql immutable set search_path = public
as $$
  -- ليبيا: 09X XXX XXXX · أو رقم دولي يبدأ بـ + أو 00
  select public.normalize_phone(p) ~ '^09[1-6][0-9]{7}$'
      or public.normalize_phone(p) ~ '^(\+|00)[1-9][0-9]{7,14}$'
$$;

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'غير مصرح بهذه العملية' using errcode = '42501';
  end if;
end $$;

-- =====================================================================
--  الواجهة العامة
-- =====================================================================

-- إرسال طلب تسجيل. متاح للزوار، ويستخدمه الإداري أيضاً لإضافة طالب يدوياً.
create or replace function public.submit_application(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_is_admin  boolean := public.is_admin();
  v_cycle     public.cycles;
  v_student   public.students;
  v_app       public.applications;
  v_nid       text := btrim(p ->> 'national_id');
  v_matns     uuid[];
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

  -- المتون والمكتب والمستوى
  select array_agg(m.id) into v_matns
  from public.matns m
  where m.active and m.id in (select value::uuid from jsonb_array_elements_text(coalesce(p -> 'matn_ids', '[]'::jsonb)));
  if coalesce(array_length(v_matns, 1), 0) = 0 then
    raise exception 'اختر متناً واحداً على الأقل' using errcode = '22023';
  end if;
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

  insert into public.application_matns (application_id, matn_id)
  select v_app.id, unnest(v_matns);

  if v_is_admin then
    perform public.log_action('application.create', 'application', v_app.reg_no, jsonb_build_object('student', v_student.full_name));
  else
    perform public.notify_admins('طلب تسجيل جديد: ' || v_student.full_name, v_app.reg_no, 'info', '/admin/applications');
  end if;

  return jsonb_build_object(
    'reg_no', v_app.reg_no, 'student_no', v_student.student_no,
    'status', v_app.status, 'created_at', v_app.created_at, 'cycle', v_cycle.name);
end $$;

-- متابعة الطلب برقم الطلب أو الرقم الوطني (أحدث طلب)
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
    'cycle', c.name,
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
  join public.cycles c on c.id = v_app.cycle_id
  left join public.examiners e on e.id = v_app.examiner_id
  where s.id = v_app.student_id;

  return v_result;
end $$;

-- الاستعلام عن النتيجة برقم الطالب أو الرقم الوطني. لا تظهر الدرجة قبل اعتماد الإدارة.
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
    'matns', coalesce((select array_agg(m.name order by m.sort_order, m.name) from public.application_matns am
                       join public.matns m on m.id = am.matn_id where am.application_id = v_app.id), '{}'),
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
    'matns', c.matn_names, 'issued_at', c.issued_at, 'status', c.status,
    'revoked_at', c.revoked_at, 'org_name', (select org_name from public.settings where id = 1))
  from public.certificates c
  where c.cert_no = upper(btrim(p_cert_no)));
end $$;

-- =====================================================================
--  الإدارة: الطلبات والإحالات
-- =====================================================================
create or replace function public.mark_application_under_review(p_application_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_reg text;
begin
  perform public.require_admin();
  update public.applications set status = 'under_review', reviewed_by = auth.uid()
  where id = p_application_id and status = 'pending'
  returning reg_no into v_reg;
  if v_reg is not null then
    perform public.log_action('application.review', 'application', v_reg);
  end if;
end $$;

create or replace function public.approve_application(p_application_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_reg text;
begin
  perform public.require_admin();
  update public.applications
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = null
   where id = p_application_id and status in ('pending', 'under_review', 'rejected')
  returning reg_no into v_reg;
  if v_reg is null then
    raise exception 'لا يمكن قبول الطلب في حالته الحالية' using errcode = 'P0001';
  end if;
  perform public.log_action('application.approve', 'application', v_reg);
end $$;

create or replace function public.reject_application(p_application_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_reg text;
begin
  perform public.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب الرفض مطلوب' using errcode = '22023';
  end if;
  update public.applications
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = btrim(p_reason)
   where id = p_application_id and status in ('pending', 'under_review', 'approved', 'assigned', 'absent', 'postponed')
  returning reg_no into v_reg;
  if v_reg is null then
    raise exception 'لا يمكن رفض الطلب في حالته الحالية' using errcode = 'P0001';
  end if;
  update public.appointments set status = 'cancelled'
   where application_id = p_application_id and status = 'scheduled';
  perform public.log_action('application.reject', 'application', v_reg, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.assign_application(p_application_id uuid, p_examiner_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_app public.applications;
  v_exm public.examiners;
  v_student text;
begin
  perform public.require_admin();
  select * into v_app from public.applications where id = p_application_id for update;
  if v_app.id is null then raise exception 'الطلب غير موجود' using errcode = 'P0002'; end if;
  if v_app.status in ('in_exam', 'admin_pending', 'published', 'rejected') then
    raise exception 'لا يمكن تحويل الطالب بعد بدء الامتحان أو رفض الطلب' using errcode = 'P0001';
  end if;
  select * into v_exm from public.examiners where id = p_examiner_id and status = 'active';
  if v_exm.id is null then raise exception 'المحفّظ غير متاح' using errcode = 'P0002'; end if;

  -- عند إعادة التحويل تُلغى المواعيد القائمة مع المحفّظ السابق
  if v_app.examiner_id is distinct from p_examiner_id then
    update public.appointments set status = 'cancelled'
     where application_id = p_application_id and status = 'scheduled';
    delete from public.exams where application_id = p_application_id and status = 'draft';
  end if;

  update public.applications
     set examiner_id = p_examiner_id, assigned_at = now(), assignment_note = nullif(btrim(p_note), ''),
         status = case when v_app.examiner_id = p_examiner_id and v_app.status = 'scheduled'
                       then 'scheduled'::public.application_status
                       else 'assigned'::public.application_status end,
         reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, auth.uid())
   where id = p_application_id;

  select full_name into v_student from public.students where id = v_app.student_id;
  perform public.notify_user(v_exm.user_id, 'طالب جديد محال إليك: ' || v_student,
                             coalesce(nullif(btrim(p_note), ''), v_app.reg_no), 'info', '/examiner/students');
  perform public.log_action(case when v_app.examiner_id is null then 'application.assign' else 'application.reassign' end,
                            'application', v_app.reg_no,
                            jsonb_build_object('examiner', v_exm.full_name, 'note', p_note));
end $$;

-- =====================================================================
--  المواعيد
-- =====================================================================
create or replace function public.save_appointment(
  p_application_id uuid, p_date date, p_time time, p_mode public.appointment_mode,
  p_location text default null, p_notes text default null, p_appointment_id uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_app public.applications;
  v_my  uuid := public.current_examiner_id();
  v_id  uuid;
  v_no  text;
begin
  select * into v_app from public.applications where id = p_application_id for update;
  if v_app.id is null then raise exception 'الطلب غير موجود' using errcode = 'P0002'; end if;
  if not public.is_admin() and (v_my is null or v_app.examiner_id is distinct from v_my) then
    raise exception 'غير مصرح بهذه العملية' using errcode = '42501';
  end if;
  if v_app.examiner_id is null then
    raise exception 'يجب تحويل الطالب إلى محفّظ قبل تحديد الموعد' using errcode = 'P0001';
  end if;
  if v_app.status not in ('assigned', 'scheduled', 'absent', 'postponed') then
    raise exception 'لا يمكن تحديد موعد في حالة الطلب الحالية' using errcode = 'P0001';
  end if;
  if p_date is null or p_time is null then
    raise exception 'التاريخ والوقت مطلوبان' using errcode = '22023';
  end if;

  if p_appointment_id is not null then
    update public.appointments
       set exam_date = p_date, exam_time = p_time, mode = p_mode, location = nullif(btrim(p_location), ''),
           notes = nullif(btrim(p_notes), ''), status = 'scheduled', notified_at = null
     where id = p_appointment_id and application_id = p_application_id
    returning id, apt_no into v_id, v_no;
    if v_id is null then raise exception 'الموعد غير موجود' using errcode = 'P0002'; end if;
  else
    update public.appointments set status = 'cancelled'
     where application_id = p_application_id and status = 'scheduled';
    insert into public.appointments (application_id, examiner_id, exam_date, exam_time, mode, location, notes, created_by)
    values (p_application_id, v_app.examiner_id, p_date, p_time, p_mode,
            nullif(btrim(p_location), ''), nullif(btrim(p_notes), ''), auth.uid())
    returning id, apt_no into v_id, v_no;
  end if;

  update public.applications set status = 'scheduled' where id = p_application_id;
  perform public.log_action('appointment.save', 'appointment', v_no,
                            jsonb_build_object('reg_no', v_app.reg_no, 'date', p_date, 'time', p_time));
  return v_id;
end $$;

create or replace function public.set_appointment_status(p_appointment_id uuid, p_status public.appointment_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_apt public.appointments;
  v_my  uuid := public.current_examiner_id();
begin
  select * into v_apt from public.appointments where id = p_appointment_id for update;
  if v_apt.id is null then raise exception 'الموعد غير موجود' using errcode = 'P0002'; end if;
  if not public.is_admin() and (v_my is null or v_apt.examiner_id is distinct from v_my) then
    raise exception 'غير مصرح بهذه العملية' using errcode = '42501';
  end if;
  if p_status not in ('absent', 'postponed', 'cancelled') then
    raise exception 'حالة غير مدعومة' using errcode = '22023';
  end if;
  if v_apt.status <> 'scheduled' then
    raise exception 'يمكن تعديل المواعيد المجدولة فقط' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.exams where appointment_id = v_apt.id and status <> 'draft') then
    raise exception 'بدأ الامتحان في هذا الموعد' using errcode = 'P0001';
  end if;

  update public.appointments set status = p_status, notes = coalesce(nullif(btrim(p_reason), ''), notes)
   where id = p_appointment_id;
  delete from public.exams where appointment_id = p_appointment_id and status = 'draft';
  update public.applications
     set status = case p_status when 'absent' then 'absent'::public.application_status
                                when 'postponed' then 'postponed'::public.application_status
                                else 'assigned'::public.application_status end
   where id = v_apt.application_id and status in ('scheduled', 'in_exam');

  perform public.log_action('appointment.' || p_status::text, 'appointment', v_apt.apt_no,
                            jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.mark_appointment_notified(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_apt public.appointments; v_my uuid := public.current_examiner_id();
begin
  select * into v_apt from public.appointments where id = p_appointment_id;
  if v_apt.id is null then raise exception 'الموعد غير موجود' using errcode = 'P0002'; end if;
  if not public.is_admin() and (v_my is null or v_apt.examiner_id is distinct from v_my) then
    raise exception 'غير مصرح بهذه العملية' using errcode = '42501';
  end if;
  update public.appointments set notified_at = now() where id = p_appointment_id;
  perform public.log_action('appointment.notify', 'appointment', v_apt.apt_no);
end $$;

-- =====================================================================
--  الامتحانات
-- =====================================================================

-- يبدأ جلسة امتحان أو يستأنف الجلسة المفتوحة. يلتقط إعدادات التقييم الحالية.
create or replace function public.start_exam(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_my   uuid := public.current_examiner_id();
  v_app  public.applications;
  v_exam uuid;
  v_set  public.settings;
  v_config jsonb;
  v_apt  uuid;
begin
  if v_my is null then raise exception 'هذه العملية للمحفّظين فقط' using errcode = '42501'; end if;
  select * into v_app from public.applications where id = p_application_id for update;
  if v_app.id is null or v_app.examiner_id is distinct from v_my then
    raise exception 'الطالب غير محال إليك' using errcode = '42501';
  end if;

  select id into v_exam from public.exams
   where application_id = p_application_id and status in ('draft', 'in_progress', 'rejected');
  if v_exam is not null then return v_exam; end if;

  if v_app.status not in ('scheduled', 'in_exam') then
    raise exception 'يجب تحديد موعد للطالب قبل بدء الامتحان' using errcode = 'P0001';
  end if;

  select * into v_set from public.settings where id = 1;
  v_config := jsonb_build_object(
    'base', v_set.exam_base,
    'questions', v_set.exam_questions,
    'aggregate', v_set.exam_aggregate,
    'criteria', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'description', c.description, 'max_score', c.max_score,
        'default_score', c.default_score, 'penalty_factor', c.penalty_factor, 'step', c.step, 'hint', c.hint)
        order by c.sort_order, c.name) from public.criteria c where c.active), '[]'),
    'deductions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'description', d.description, 'value', d.value)
        order by d.sort_order, d.name) from public.deduction_types d where d.active), '[]'));

  select id into v_apt from public.appointments
   where application_id = p_application_id and status = 'scheduled'
   order by exam_date desc, exam_time desc limit 1;

  insert into public.exams (application_id, appointment_id, examiner_id, config)
  values (p_application_id, v_apt, v_my, v_config)
  returning id into v_exam;

  insert into public.exam_questions (exam_id, q_index, criteria_scores)
  select v_exam, g.i,
         coalesce((select jsonb_object_agg(c ->> 'id', (c ->> 'default_score')::numeric)
                   from jsonb_array_elements(v_config -> 'criteria') c), '{}')
  from generate_series(0, v_set.exam_questions - 1) as g(i);

  update public.applications set status = 'in_exam' where id = p_application_id;
  perform public.log_action('exam.start', 'exam', (select exam_no from public.exams where id = v_exam),
                            jsonb_build_object('reg_no', v_app.reg_no));
  return v_exam;
end $$;

-- اعتماد المحفّظ: يُحتسب المجموع على الخادم ويُرسل للإدارة
create or replace function public.submit_exam(p_exam_id uuid)
returns numeric language plpgsql security definer set search_path = public
as $$
declare
  v_exam  public.exams;
  v_score numeric;
  v_student text;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if v_exam.id is null or v_exam.examiner_id is distinct from public.current_examiner_id() then
    raise exception 'غير مصرح بهذه العملية' using errcode = '42501';
  end if;
  if v_exam.status not in ('draft', 'in_progress', 'rejected') then
    raise exception 'أُرسل هذا الامتحان مسبقاً' using errcode = 'P0001';
  end if;

  v_score := public.compute_exam_score(p_exam_id);
  update public.exams
     set status = 'examiner_approved', score = v_score, submitted_at = now()
   where id = p_exam_id;
  update public.appointments set status = 'done' where id = v_exam.appointment_id and status = 'scheduled';
  update public.applications set status = 'admin_pending' where id = v_exam.application_id;

  select s.full_name into v_student from public.applications a join public.students s on s.id = a.student_id
   where a.id = v_exam.application_id;
  perform public.notify_admins('نتيجة بانتظار الاعتماد: ' || v_student, v_exam.exam_no || ' — ' || v_score,
                               'warn', '/admin/results/pending', 'final_approve');
  perform public.log_action('exam.examiner_approve', 'exam', v_exam.exam_no, jsonb_build_object('score', v_score));
  return v_score;
end $$;

create or replace function public.approve_exam(p_exam_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_exam public.exams; v_user uuid;
begin
  if not public.has_perm('final_approve') then
    raise exception 'لا تملك صلاحية الاعتماد النهائي' using errcode = '42501';
  end if;
  select * into v_exam from public.exams where id = p_exam_id for update;
  if v_exam.id is null or v_exam.status <> 'examiner_approved' then
    raise exception 'النتيجة ليست بانتظار الاعتماد' using errcode = 'P0001';
  end if;
  update public.exams
     set status = 'approved', approved_at = now(), approved_by = auth.uid(),
         admin_notes = coalesce(nullif(btrim(p_notes), ''), admin_notes)
   where id = p_exam_id;
  update public.applications set status = 'published' where id = v_exam.application_id;

  select user_id into v_user from public.examiners where id = v_exam.examiner_id;
  perform public.notify_user(v_user, 'اعتُمدت نتيجة الامتحان ' || v_exam.exam_no, null, 'ok', '/examiner/results');
  perform public.notify_admins('نتيجة جاهزة لإصدار الشهادة', v_exam.exam_no, 'info', '/admin/certificates', 'issue_certificates');
  perform public.log_action('exam.approve', 'exam', v_exam.exam_no,
                            jsonb_build_object('score', v_exam.score, 'notes', p_notes));
end $$;

create or replace function public.return_exam(p_exam_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_exam public.exams; v_user uuid;
begin
  if not public.has_perm('final_approve') then
    raise exception 'لا تملك صلاحية الاعتماد النهائي' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب الإرجاع مطلوب' using errcode = '22023';
  end if;
  select * into v_exam from public.exams where id = p_exam_id for update;
  if v_exam.id is null then raise exception 'الامتحان غير موجود' using errcode = 'P0002'; end if;

  if v_exam.status = 'approved' then
    -- إلغاء نتيجة معتمدة إجراء استثنائي لمدير النظام فقط، ويُلغي الشهادة الصادرة
    if not public.is_super_admin() then
      raise exception 'إعادة فتح نتيجة معتمدة من صلاحية مدير النظام' using errcode = '42501';
    end if;
    update public.certificates set status = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason)
     where exam_id = p_exam_id and status = 'valid';
  elsif v_exam.status <> 'examiner_approved' then
    raise exception 'لا يمكن إرجاع الامتحان في حالته الحالية' using errcode = 'P0001';
  end if;

  update public.exams
     set status = 'rejected', returned_at = now(), return_reason = btrim(p_reason),
         approved_at = null, approved_by = null
   where id = p_exam_id;
  update public.applications set status = 'in_exam' where id = v_exam.application_id;

  select user_id into v_user from public.examiners where id = v_exam.examiner_id;
  perform public.notify_user(v_user, 'أُعيد إليك الامتحان ' || v_exam.exam_no, btrim(p_reason), 'warn',
                             '/examiner/exams/' || v_exam.id);
  perform public.log_action('exam.return', 'exam', v_exam.exam_no, jsonb_build_object('reason', p_reason));
end $$;

-- =====================================================================
--  الشهادات
-- =====================================================================
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

  insert into public.certificates (cert_no, exam_id, application_id, student_id, student_name, matn_names, score, grade, issued_by)
  select v_no, v_exam.id, v_app.id, s.id, s.full_name,
         coalesce((select array_agg(m.name order by m.sort_order, m.name) from public.application_matns am
                   join public.matns m on m.id = am.matn_id where am.application_id = v_app.id), '{}'),
         v_exam.score, public.grade_for(v_exam.score), auth.uid()
  from public.students s where s.id = v_app.student_id;

  perform public.log_action('certificate.issue', 'certificate', v_no, jsonb_build_object('exam', v_exam.exam_no));
  return v_no;
end $$;

create or replace function public.revoke_certificate(p_certificate_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_no text;
begin
  if not public.is_super_admin() then
    raise exception 'إلغاء الشهادات من صلاحية مدير النظام' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  update public.certificates set status = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason)
   where id = p_certificate_id and status = 'valid'
  returning cert_no into v_no;
  if v_no is null then raise exception 'الشهادة غير موجودة أو ملغاة' using errcode = 'P0002'; end if;
  perform public.log_action('certificate.revoke', 'certificate', v_no, jsonb_build_object('reason', p_reason));
end $$;

-- =====================================================================
--  لوحات المتابعة والتقارير
-- =====================================================================
create or replace function public.record_sign_in()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set last_sign_in_at = now() where id = auth.uid();
  perform public.log_action('auth.sign_in', 'user', (select username from public.profiles where id = auth.uid()));
end $$;

-- يُستدعى بعد أن يغيّر المستخدم كلمة مروره المؤقتة
create or replace function public.password_changed()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set must_change_password = false where id = auth.uid();
  perform public.log_action('auth.password_change', 'user', (select username from public.profiles where id = auth.uid()));
end $$;

create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_cycle uuid;
begin
  perform public.require_admin();
  select id into v_cycle from public.cycles where is_current;
  return jsonb_build_object(
    'cycle', (select name from public.cycles where id = v_cycle),
    'students', (select count(distinct student_id) from public.applications where cycle_id = v_cycle),
    'new_applications', (select count(*) from public.applications where cycle_id = v_cycle and status in ('pending', 'under_review')),
    'approved', (select count(*) from public.applications where cycle_id = v_cycle and status not in ('pending', 'under_review', 'rejected')),
    'assigned', (select count(*) from public.applications where cycle_id = v_cycle and examiner_id is not null),
    'scheduled', (select count(*) from public.appointments ap join public.applications a on a.id = ap.application_id
                  where a.cycle_id = v_cycle and ap.status = 'scheduled'),
    'exams_done', (select count(*) from public.exams x join public.applications a on a.id = x.application_id
                   where a.cycle_id = v_cycle and x.status in ('examiner_approved', 'approved')),
    'pending_results', (select count(*) from public.exams where status = 'examiner_approved'),
    'approved_results', (select count(*) from public.exams x join public.applications a on a.id = x.application_id
                         where a.cycle_id = v_cycle and x.status = 'approved'),
    'certificates', (select count(*) from public.certificates c join public.applications a on a.id = c.application_id
                     where a.cycle_id = v_cycle and c.status = 'valid'),
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

create or replace function public.examiner_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_my uuid := public.current_examiner_id();
begin
  if v_my is null then raise exception 'هذه اللوحة للمحفّظين فقط' using errcode = '42501'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.applications where examiner_id = v_my and status not in ('published', 'rejected')),
    'upcoming', (select count(*) from public.appointments where examiner_id = v_my and status = 'scheduled'
                 and exam_date >= public.libya_today()),
    'today', (select count(*) from public.appointments where examiner_id = v_my and status = 'scheduled'
              and exam_date = public.libya_today()),
    'open_exams', (select count(*) from public.exams where examiner_id = v_my and status in ('draft', 'in_progress', 'rejected')),
    'submitted', (select count(*) from public.exams where examiner_id = v_my and status in ('examiner_approved', 'approved')),
    'awaiting_admin', (select count(*) from public.exams where examiner_id = v_my and status = 'examiner_approved')
  );
end $$;

create or replace function public.report_summary(
  p_cycle_id uuid default null, p_office_id uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_has_pass boolean := exists (select 1 from public.grade_scales where is_passing);
begin
  perform public.require_admin();
  return (
    with apps as (
      select a.* from public.applications a
      where (p_cycle_id is null or a.cycle_id = p_cycle_id)
        and (p_office_id is null or a.office_id = p_office_id)
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
