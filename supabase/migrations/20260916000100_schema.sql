-- =====================================================================
--  برنامج حُفّاظ السُّنة — مخطط قاعدة البيانات
--  الجداول والأنواع والفهارس. المنطق في 0200، الصلاحيات في 0400.
-- =====================================================================

-- ---------- الأنواع ----------
create type public.app_role as enum ('super_admin', 'admin', 'examiner');
create type public.account_status as enum ('active', 'inactive');
create type public.gender as enum ('male', 'female');
create type public.program_section as enum ('men', 'women');

-- مسار الطلب: pending → under_review → approved → assigned → scheduled
--   → in_exam → admin_pending → published  (+ rejected / absent / postponed)
create type public.application_status as enum (
  'pending', 'under_review', 'approved', 'rejected', 'assigned', 'scheduled',
  'absent', 'postponed', 'in_exam', 'admin_pending', 'published'
);

-- مسار الامتحان: draft → in_progress → examiner_approved → approved
--   (rejected = مُعاد للمحفّظ ثم يعود إلى examiner_approved بعد التصحيح)
create type public.exam_status as enum (
  'draft', 'in_progress', 'examiner_approved', 'approved', 'rejected'
);

create type public.appointment_status as enum ('scheduled', 'done', 'absent', 'postponed', 'cancelled');
create type public.appointment_mode as enum ('whatsapp_room', 'telegram_room', 'whatsapp_call', 'in_person');
create type public.aggregate_method as enum ('avg', 'min');
create type public.certificate_status as enum ('valid', 'revoked');

-- ---------- الإعدادات (صف واحد) ----------
create table public.settings (
  id                 smallint primary key default 1 check (id = 1),
  org_name           text not null default 'برنامج حُفّاظ السُّنة',
  org_phone          text,
  org_email          text,
  org_address        text,
  work_hours         text,
  exam_base          numeric(6,2) not null default 100 check (exam_base > 0),
  exam_questions     smallint not null default 3 check (exam_questions between 1 and 10),
  exam_aggregate     public.aggregate_method not null default 'avg',
  exam_mode          public.appointment_mode not null default 'whatsapp_room',
  cert_prefix        text not null default 'CERT-{YYYY}-',
  cert_digits        smallint not null default 5 check (cert_digits between 3 and 10),
  cert_title         text not null default 'شهادة اجتياز امتحان البرنامج',
  cert_signer_name   text,
  cert_signer_title  text,
  cert_show_qr       boolean not null default true,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

-- ---------- القوائم المرجعية ----------
create table public.cycles (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  starts_on          date,
  ends_on            date,
  is_current         boolean not null default false,
  registration_open  boolean not null default true,
  created_at         timestamptz not null default now()
);
create unique index cycles_single_current on public.cycles (is_current) where is_current;

create table public.offices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.levels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.matns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- الحسابات ----------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  full_name               text not null,
  username                text not null unique,
  role                    public.app_role not null default 'examiner',
  status                  public.account_status not null default 'active',
  can_final_approve       boolean not null default false,  -- للإداري: الاعتماد النهائي للنتائج
  can_issue_certificates  boolean not null default false,  -- للإداري: إصدار الشهادات
  must_change_password    boolean not null default false,  -- كلمة مؤقتة: يُلزم بتغييرها عند الدخول
  last_sign_in_at         timestamptz,
  created_at              timestamptz not null default now()
);

create table public.examiners (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references public.profiles (id) on delete set null,
  full_name       text not null,
  employee_no     text unique,
  phone           text,
  office_id       uuid references public.offices (id),
  specialization  text,
  status          public.account_status not null default 'active',
  created_at      timestamptz not null default now()
);

-- ---------- الطلبة والطلبات ----------
create table public.students (
  id                uuid primary key default gen_random_uuid(),
  student_no        text not null unique,
  national_id       text not null unique check (national_id ~ '^[0-9]{12}$'),
  first_name        text not null,
  father_name       text not null,
  grandfather_name  text,
  family_name       text not null,
  full_name         text generated always as (
                      first_name || ' ' || father_name
                      || coalesce(' ' || nullif(grandfather_name, ''), '')
                      || ' ' || family_name) stored,
  birth_date        date not null,
  gender            public.gender not null,
  residence         text not null,
  phone             text not null,
  whatsapp          text not null,
  email             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.applications (
  id                uuid primary key default gen_random_uuid(),
  reg_no            text not null unique,
  student_id        uuid not null references public.students (id) on delete cascade,
  cycle_id          uuid not null references public.cycles (id),
  section           public.program_section not null,
  circle_name       text not null,
  center_name       text not null,
  office_id         uuid not null references public.offices (id),
  teacher_name      text,
  level_id          uuid not null references public.levels (id),
  memorized_amount  text not null,
  verses_range      text,
  student_notes     text,
  status            public.application_status not null default 'pending',
  examiner_id       uuid references public.examiners (id),
  assigned_at       timestamptz,
  assignment_note   text,
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles (id),
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id, cycle_id)   -- طلب واحد لكل طالب في الدورة الواحدة
);
create index applications_status_idx   on public.applications (status);
create index applications_examiner_idx on public.applications (examiner_id);
create index applications_office_idx   on public.applications (office_id);
create index applications_created_idx  on public.applications (created_at desc);

create table public.application_matns (
  application_id  uuid not null references public.applications (id) on delete cascade,
  matn_id         uuid not null references public.matns (id),
  primary key (application_id, matn_id)
);

-- ---------- المواعيد ----------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  apt_no          text not null unique,
  application_id  uuid not null references public.applications (id) on delete cascade,
  examiner_id     uuid not null references public.examiners (id),
  exam_date       date not null,
  exam_time       time not null,
  mode            public.appointment_mode not null default 'whatsapp_room',
  location        text,           -- رابط الغرفة أو الرقم أو المكان
  notes           text,
  status          public.appointment_status not null default 'scheduled',
  notified_at     timestamptz,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index appointments_application_idx on public.appointments (application_id);
create index appointments_examiner_idx    on public.appointments (examiner_id, exam_date);

-- ---------- قواعد التقييم ----------
-- درجة السؤال = الأساس − Σ (القصوى − الممنوحة) × المعامل − Σ (عدد مرات الخصم × قيمته)
create table public.criteria (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  max_score       numeric(6,2) not null check (max_score > 0),
  default_score   numeric(6,2) not null default 0,
  penalty_factor  numeric(6,2) not null default 1 check (penalty_factor >= 0),
  step            numeric(4,2) not null default 1 check (step > 0),
  hint            text,
  sort_order      int not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check (default_score between 0 and max_score)
);

create table public.deduction_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  value        numeric(6,2) not null check (value >= 0),
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.grade_scales (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  min_score   numeric(5,2) not null,
  max_score   numeric(5,2) not null,
  is_passing  boolean not null default false,
  created_at  timestamptz not null default now(),
  check (min_score >= 0 and max_score <= 100 and min_score <= max_score)
);

-- ---------- الامتحانات ----------
create table public.exams (
  id              uuid primary key default gen_random_uuid(),
  exam_no         text not null unique,
  application_id  uuid not null references public.applications (id) on delete cascade,
  appointment_id  uuid references public.appointments (id) on delete set null,
  examiner_id     uuid not null references public.examiners (id),
  exam_date       date not null default (now() at time zone 'Africa/Tripoli')::date,
  status          public.exam_status not null default 'draft',
  -- لقطة من إعدادات التقييم وقت بدء الامتحان، حتى لا تتأثر الامتحانات السابقة بأي تعديل لاحق
  config          jsonb not null,
  score           numeric(5,2),
  submitted_at    timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references public.profiles (id),
  returned_at     timestamptz,
  return_reason   text,
  admin_notes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index exams_single_open on public.exams (application_id)
  where status in ('draft', 'in_progress', 'examiner_approved', 'rejected');
create unique index exams_single_approved on public.exams (application_id) where status = 'approved';
create index exams_examiner_idx on public.exams (examiner_id, status);
create index exams_status_idx   on public.exams (status);

create table public.exam_questions (
  exam_id          uuid not null references public.exams (id) on delete cascade,
  q_index          smallint not null check (q_index >= 0),
  matn_id          uuid references public.matns (id),
  criteria_scores  jsonb not null default '{}'::jsonb,   -- {criterion_id: درجة}
  deductions       jsonb not null default '{}'::jsonb,   -- {deduction_type_id: عدد المرات}
  touched          boolean not null default false,
  score            numeric(6,2),
  updated_at       timestamptz not null default now(),
  primary key (exam_id, q_index)
);

-- ---------- الشهادات ----------
create table public.certificates (
  id              uuid primary key default gen_random_uuid(),
  cert_no         text not null unique,
  exam_id         uuid not null unique references public.exams (id),
  application_id  uuid not null references public.applications (id),
  student_id      uuid not null references public.students (id),
  student_name    text not null,     -- كما طُبع على الشهادة
  matn_names      text[] not null default '{}',
  score           numeric(5,2) not null,
  grade           text,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references public.profiles (id),
  status          public.certificate_status not null default 'valid',
  revoked_at      timestamptz,
  revoke_reason   text
);

-- ---------- السجلات والإشعارات ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb,
  ip          text
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx  on public.audit_log (entity, entity_id);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  body          text,
  kind          text not null default 'info' check (kind in ('info', 'ok', 'warn')),
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- تحديد معدل الطلبات على الواجهات العامة (لكل IP ونافذة زمنية)
create table public.rate_limits (
  bucket        text not null,
  ip            text not null,
  window_start  timestamptz not null,
  hits          int not null default 1,
  primary key (bucket, ip, window_start)
);

create table public.serial_counters (
  kind        text not null,
  year        int not null,
  last_value  int not null default 0,
  primary key (kind, year)
);

-- ---------- البحث النصي السريع (ilike '%...%') ----------
create extension if not exists pg_trgm with schema extensions;
create index students_full_name_trgm   on public.students     using gin (full_name extensions.gin_trgm_ops);
create index students_national_id_trgm on public.students     using gin (national_id extensions.gin_trgm_ops);
create index applications_reg_no_trgm  on public.applications using gin (reg_no extensions.gin_trgm_ops);
