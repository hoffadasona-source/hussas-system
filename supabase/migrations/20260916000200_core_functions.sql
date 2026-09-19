-- =====================================================================
--  دوال مساعدة: الصلاحيات، الترقيم، سجل العمليات، الإشعارات، احتساب الدرجات
-- =====================================================================

-- ---------- الهوية والصلاحيات ----------
create or replace function public.auth_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select public.auth_role() is not null $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.auth_role() in ('super_admin', 'admin'), false) $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.auth_role() = 'super_admin', false) $$;

-- صلاحيات الإداري التي تُمنح فردياً: final_approve / issue_certificates
create or replace function public.has_perm(p_perm text)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when p.role = 'super_admin' then true
      when p.role = 'admin' and p_perm = 'final_approve' then p.can_final_approve
      when p.role = 'admin' and p_perm = 'issue_certificates' then p.can_issue_certificates
      else false
    end
    from public.profiles p where p.id = auth.uid() and p.status = 'active'
  ), false)
$$;

create or replace function public.current_examiner_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select e.id from public.examiners e
  join public.profiles p on p.id = e.user_id
  where e.user_id = auth.uid() and e.status = 'active' and p.status = 'active'
$$;

-- ---------- أدوات عامة ----------
create or replace function public.request_ip()
returns text language plpgsql stable set search_path = public
as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)), '');
end $$;

create or replace function public.libya_today()
returns date language sql stable set search_path = public
as $$ select (now() at time zone 'Africa/Tripoli')::date $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end $$;

create or replace function public.next_serial(p_kind text, p_prefix text, p_digits int default 5)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_year int := extract(year from public.libya_today())::int;
  v_val  int;
begin
  insert into public.serial_counters (kind, year, last_value) values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_value = public.serial_counters.last_value + 1
  returning last_value into v_val;
  return replace(p_prefix, '{YYYY}', v_year::text) || lpad(v_val::text, p_digits, '0');
end $$;

create or replace function public.log_action(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, details, ip)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()),
          p_action, p_entity, p_entity_id, p_details, public.request_ip());
end $$;

create or replace function public.notify_user(p_recipient uuid, p_title text, p_body text, p_kind text, p_link text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_recipient is not null then
    insert into public.notifications (recipient_id, title, body, kind, link)
    values (p_recipient, p_title, p_body, p_kind, p_link);
  end if;
end $$;

-- يُرسل لكل إداري فعّال، مع إمكانية حصره بمن يملك صلاحية معينة
create or replace function public.notify_admins(p_title text, p_body text, p_kind text, p_link text, p_perm text default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, title, body, kind, link)
  select p.id, p_title, p_body, p_kind, p_link
  from public.profiles p
  where p.status = 'active'
    and (p.role = 'super_admin'
         or (p.role = 'admin' and (p_perm is null
             or (p_perm = 'final_approve' and p.can_final_approve)
             or (p_perm = 'issue_certificates' and p.can_issue_certificates))));
end $$;

-- يرفض الطلب إذا تجاوز عنوان IP الحد المسموح في النافذة الزمنية. لا يُطبَّق على الموظفين.
-- ملاحظة: شبكات الهاتف في ليبيا تشارك عناوين IP بين مستخدمين كثيرين، لذا الحدود سخية؛
-- الحماية الأساسية من الإغراق هي CAPTCHA (المرحلة الثانية).
create or replace function public.enforce_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ip    text := public.request_ip();
  v_start timestamptz;
  v_hits  int;
begin
  if v_ip is null or public.is_staff() then return; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (bucket, ip, window_start) values (p_bucket, v_ip, v_start)
  on conflict (bucket, ip, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  if v_hits > p_max then
    raise exception 'عدد المحاولات كبير. انتظر بضع دقائق ثم أعد المحاولة' using errcode = 'P0429';
  end if;
end $$;

-- ---------- الترقيم التلقائي ----------
create or replace function public.serial_student()
returns trigger language plpgsql security definer set search_path = public
as $$ begin new.student_no := coalesce(new.student_no, public.next_serial('student', 'STU-{YYYY}-')); return new; end $$;

create or replace function public.serial_application()
returns trigger language plpgsql security definer set search_path = public
as $$ begin new.reg_no := coalesce(new.reg_no, public.next_serial('application', 'REG-{YYYY}-')); return new; end $$;

create or replace function public.serial_appointment()
returns trigger language plpgsql security definer set search_path = public
as $$ begin new.apt_no := coalesce(new.apt_no, public.next_serial('appointment', 'APT-{YYYY}-')); return new; end $$;

create or replace function public.serial_exam()
returns trigger language plpgsql security definer set search_path = public
as $$ begin new.exam_no := coalesce(new.exam_no, public.next_serial('exam', 'EX-{YYYY}-')); return new; end $$;

create trigger students_serial     before insert on public.students     for each row execute function public.serial_student();
create trigger applications_serial before insert on public.applications for each row execute function public.serial_application();
create trigger appointments_serial before insert on public.appointments for each row execute function public.serial_appointment();
create trigger exams_serial        before insert on public.exams        for each row execute function public.serial_exam();

create trigger students_touch     before update on public.students     for each row execute function public.touch_updated_at();
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();
create trigger exams_touch        before update on public.exams        for each row execute function public.touch_updated_at();

-- ---------- احتساب الدرجات ----------
-- تطابق lib/scoring.js في الواجهة؛ الخادم هو المرجع النهائي.
create or replace function public.compute_question_score(p_config jsonb, p_criteria jsonb, p_deductions jsonb)
returns numeric language plpgsql immutable set search_path = public
as $$
declare
  v_base  numeric := coalesce((p_config ->> 'base')::numeric, 100);
  v_total numeric := v_base;
  c jsonb; d jsonb; v_max numeric; v_given numeric; v_count numeric;
begin
  for c in select value from jsonb_array_elements(coalesce(p_config -> 'criteria', '[]'::jsonb)) loop
    v_max   := (c ->> 'max_score')::numeric;
    v_given := coalesce((p_criteria ->> (c ->> 'id'))::numeric, (c ->> 'default_score')::numeric, 0);
    v_given := greatest(0, least(v_max, v_given));
    v_total := v_total - (v_max - v_given) * coalesce((c ->> 'penalty_factor')::numeric, 1);
  end loop;
  for d in select value from jsonb_array_elements(coalesce(p_config -> 'deductions', '[]'::jsonb)) loop
    v_count := greatest(0, floor(coalesce((p_deductions ->> (d ->> 'id'))::numeric, 0)));
    v_total := v_total - v_count * (d ->> 'value')::numeric;
  end loop;
  return round(greatest(0, least(v_base, v_total)), 2);
end $$;

-- النتيجة النهائية من 100 (تُحوَّل نسبةً إذا كان الأساس غير 100) ومحصورة بين 0 و100
create or replace function public.compute_exam_score(p_exam_id uuid)
returns numeric language plpgsql stable security definer set search_path = public
as $$
declare
  v_config jsonb; v_base numeric; v_agg numeric;
begin
  select config into v_config from public.exams where id = p_exam_id;
  v_base := coalesce((v_config ->> 'base')::numeric, 100);
  select case when v_config ->> 'aggregate' = 'min' then min(score) else avg(score) end
    into v_agg
  from public.exam_questions where exam_id = p_exam_id;
  if v_agg is null then return null; end if;
  return round(greatest(0, least(100, v_agg / v_base * 100)), 2);
end $$;

create or replace function public.grade_for(p_score numeric)
returns text language sql stable security definer set search_path = public
as $$
  select name from public.grade_scales
  where p_score between min_score and max_score
  order by min_score desc limit 1
$$;

-- يُعيد احتساب درجة السؤال عند كل حفظ، وينقل الامتحان من «مسودة» إلى «جارٍ»
create or replace function public.exam_questions_before_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_config jsonb;
begin
  select config into v_config from public.exams where id = new.exam_id;
  new.score := public.compute_question_score(v_config, new.criteria_scores, new.deductions);
  new.updated_at := now();
  return new;
end $$;

create trigger exam_questions_score
  before insert or update on public.exam_questions
  for each row execute function public.exam_questions_before_write();

create or replace function public.exam_questions_after_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.exams set status = 'in_progress'
  where id = new.exam_id and status = 'draft';
  return null;
end $$;

create trigger exam_questions_progress
  after update on public.exam_questions
  for each row execute function public.exam_questions_after_update();

-- ---------- تسجيل تعديلات الإعدادات والقوائم المرجعية ----------
create or replace function public.audit_config_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  if auth.uid() is not null then
    perform public.log_action('settings.update', 'settings', tg_table_name,
      jsonb_build_object('op', lower(tg_op), 'name', coalesce(v_row ->> 'name', v_row ->> 'org_name')));
  end if;
  return null;
end $$;

create trigger settings_audit   after update                     on public.settings        for each row execute function public.audit_config_change();
create trigger criteria_audit   after insert or update or delete on public.criteria        for each row execute function public.audit_config_change();
create trigger deductions_audit after insert or update or delete on public.deduction_types for each row execute function public.audit_config_change();
create trigger grades_audit     after insert or update or delete on public.grade_scales    for each row execute function public.audit_config_change();
create trigger offices_audit    after insert or update or delete on public.offices         for each row execute function public.audit_config_change();
create trigger levels_audit     after insert or update or delete on public.levels          for each row execute function public.audit_config_change();
create trigger matns_audit      after insert or update or delete on public.matns           for each row execute function public.audit_config_change();
create trigger cycles_audit     after insert or update or delete on public.cycles          for each row execute function public.audit_config_change();
