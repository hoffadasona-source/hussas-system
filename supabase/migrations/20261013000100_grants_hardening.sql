-- =====================================================================
--  إعادة ضبط الصلاحيات بعد إعادة بناء العروض
--
--  السبب: مخطط public في Supabase يمنح anon/authenticated كل الصلاحيات
--  افتراضياً على أي جدول أو عرض جديد (alter default privileges)، فكل عرض
--  أُعيد إنشاؤه في الترحيلات الأخيرة استعاد تلك الصلاحيات الواسعة.
--  البيانات نفسها كانت محمية بسياسات RLS (العروض security_invoker)، لكن
--  الحد الأدنى من الصلاحيات هو خط الدفاع الثاني، وهذا الملف يعيده.
-- =====================================================================

-- ---------- الزائر: قراءة القوائم العامة فقط ----------
revoke all on all tables in schema public from anon;
grant select on public.settings, public.offices, public.levels to anon;

-- ---------- المستخدم المسجَّل: قراءة العروض، ولا كتابة عبرها ----------
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, update, delete on
  public.v_applications, public.v_students, public.v_appointments, public.v_exams,
  public.v_certificates, public.v_examiners, public.v_outbound_messages
from authenticated;
grant select on
  public.v_applications, public.v_students, public.v_appointments, public.v_exams,
  public.v_certificates, public.v_examiners, public.v_outbound_messages
to authenticated;

-- ---------- التأكيد على حصر الكتابة في الجداول الحساسة ----------
revoke insert, update, delete on public.settings, public.profiles, public.students, public.applications,
  public.appointments, public.exams, public.exam_questions, public.certificates, public.audit_log,
  public.notifications, public.serial_counters, public.message_templates, public.outbound_messages
from authenticated;

grant update (org_name, org_phone, org_email, org_address, work_hours, exam_base, exam_questions, exam_aggregate,
              exam_mode, cert_prefix, cert_digits, cert_title, cert_signer_name, cert_signer_title, cert_show_qr,
              logo_url, logo_scale, cert_bg_pdf_url, cert_layout_config, registration_open,
              notify_enabled, notify_channel, reminder_hours, public_site_url, updated_at, updated_by)
  on public.settings to authenticated;
grant update (full_name, role, status, can_final_approve, can_issue_certificates) on public.profiles to authenticated;
grant update (first_name, father_name, grandfather_name, family_name, birth_date, gender, residence, phone, whatsapp, email)
  on public.students to authenticated;
grant update (section, circle_name, center_name, office_id, teacher_name, level_id, memorized_amount, verses_range, student_notes)
  on public.applications to authenticated;
grant update (criteria_scores, deductions, touched) on public.exam_questions to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (title, body, enabled, whatsapp_template, whatsapp_params, updated_at) on public.message_templates to authenticated;
grant delete on public.students, public.applications to authenticated;
revoke all on public.serial_counters, public.rate_limits from authenticated;
