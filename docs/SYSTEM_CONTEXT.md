# ملف السياق الكامل — منظومة برنامج حُفّاظ السُّنة

> **لمن هذا الملف:** لنموذج ذكاء اصطناعي (مثل Gemini) سيساعد في صياغة طلبات تعديل دقيقة تُنفَّذ لاحقاً بواسطة وكيل برمجي (مثل Claude Code) يعمل داخل المستودع.
> **المطلوب من النموذج:** افهم النظام كما هو موصوف هنا، ثم حوّل أي فكرة تعديل إلى «برومبت تنفيذ» بالقالب الموجود في القسم الأخير. لا تفترض ملفات أو جداول غير مذكورة هنا؛ وإن احتاج التعديل شيئاً جديداً فاذكره صراحةً كإضافة.
> **لا يحتوي هذا الملف على أي كلمات مرور أو مفاتيح سرية.**

---

## 1. نظرة عامة

منظومة ويب عربية (RTL) لبرنامج **حُفّاظ السُّنة** في ليبيا: تسجيل طلبة الامتحانات حسب المستوى (من الأول إلى الخامس)، مراجعة الطلبات وإحالتها إلى المحفّظين (المحكّمين)، تحديد مواعيد الامتحان وإشعار الطلبة، إجراء الامتحان أونلاين مع احتساب الدرجة لحظياً، اعتماد النتيجة على مرحلتين (المحفّظ ثم الإدارة)، وإصدار شهادات برقم ورمز QR قابل للتحقق العام.

بُنيت المنظومة من نموذج HTML أولي (`hussas-system555.html`) وحُوّلت إلى نظام كامل بقاعدة بيانات وصلاحيات حقيقية.

### المستخدمون والأدوار
| الدور | الوصف |
|---|---|
| `super_admin` مدير النظام | كل الصلاحيات: الإعدادات، المعايير، الخصميات، المستخدمون، الإشعارات، إلغاء الشهادات، إعادة فتح نتيجة معتمدة |
| `admin` إداري | مراجعة الطلبات وقبولها/رفضها، التحويل للمحفّظين، المواعيد، المحفّظون، التقارير، سجل العمليات، الرسائل. **صلاحيتان فرديتان** يمنحهما مدير النظام: `can_final_approve` (الاعتماد النهائي للنتائج) و `can_issue_certificates` (إصدار الشهادات) |
| `examiner` محفّظ | يرى **طلابه المحالين إليه فقط**: تحديد المواعيد، إجراء الامتحان، اعتماد المحفّظ |
| الزائر (بلا حساب) | التسجيل، متابعة الطلب، الاستعلام عن النتيجة المعتمدة، التحقق من الشهادة |

الدخول **باسم مستخدم** يُحوَّل داخلياً إلى بريد وهمي `username@users.hussas.local` (لأن Supabase Auth يعتمد البريد). لا يوجد تسجيل ذاتي للحسابات؛ الحسابات تُنشأ من لوحة الإدارة عبر Edge Function.

---

## 2. التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | React 19 · Vite 8 · React Router 8 (`BrowserRouter` بوضع المكتبة) · TanStack Query 5 · qrcode.react · JavaScript (JSX، بلا TypeScript) · CSS يدوي (بلا إطار) |
| الخلفية | Supabase: PostgreSQL 17 + Auth + PostgREST + RLS + Edge Functions (Deno/TypeScript) + pg_cron/pg_net (للجدولة) |
| الاختبار | PGlite (Postgres داخل الذاكرة في Node) لاختبارات قاعدة البيانات، واختبارات Node للدرجات والاستيراد والإرسال، واختبار شامل على Supabase حقيقي |
| النشر | GitHub Pages (الواجهة) عبر GitHub Actions · Supabase Cloud (قاعدة البيانات والدوال) |

---

## 3. البيئات والنشر

| البيئة | التفاصيل |
|---|---|
| **الموقع المنشور** | `https://hoffadasona-source.github.io/hussas-system/` (تحت مسار فرعي `/hussas-system/`) |
| **المستودع** | `https://github.com/hoffadasona-source/hussas-system` (عام) — الفرع `main` |
| **Supabase السحابي** | مشروع `hussas-system`، المرجع `osljpgcwriuxllevtcqp`، منطقة Frankfurt، الخطة المجانية (يتوقف بعد 7 أيام بلا نشاط) |
| **محلياً** | `npx supabase start` (Docker) + `npm run dev` على `http://localhost:5173` |

**النشر التلقائي:** كل `git push` إلى `main` يشغّل:
- `.github/workflows/ci.yml`: بناء + كل الاختبارات غير المحتاجة لخدمات خارجية.
- `.github/workflows/pages.yml`: `npm run build:pages` مع `VITE_BASE=/hussas-system/` ومتغيرات المستودع، ثم النشر على Pages.

**تغييرات قاعدة البيانات لا تُنشر تلقائياً:** بعد إضافة migration جديد: `npx supabase db push`. وبعد تعديل دالة: `npx supabase functions deploy <name>` (و `send-messages` تُنشر بـ `--no-verify-jwt`).

### متغيرات البيئة (الأسماء فقط)
- الواجهة (تُضمَّن في البناء، عامة بطبيعتها): `VITE_SUPABASE_URL`، `VITE_SUPABASE_ANON_KEY`، `VITE_USERNAME_EMAIL_DOMAIN`، `VITE_BASE`.
- محلياً فقط (ملفات مستثناة من Git: `.env.local` للمحلي، `.env.cloud.local` للسحابي): `SUPABASE_SERVICE_ROLE_KEY`، `SUPABASE_DB_PASSWORD`، `CRON_SECRET`.
- أسرار Edge Functions (عبر `supabase secrets set`): `USERNAME_EMAIL_DOMAIN`، `ALLOWED_ORIGIN`، `CRON_SECRET`، ولقنوات الإرسال عند ربطها: `WHATSAPP_TOKEN`، `WHATSAPP_PHONE_NUMBER_ID`، `WHATSAPP_TEMPLATE_LANG`، `WHATSAPP_API_VERSION`، `SMS_API_URL`، `SMS_API_KEY`، `SMS_SENDER`، `RESEND_API_KEY`، `EMAIL_FROM`.

---

## 4. هيكل المشروع

```
index.html                     قالب الصفحة (lang=ar dir=rtl)، سكربت الوضع الليلي المبكر
vite.config.js                 base من VITE_BASE
.github/workflows/             ci.yml · pages.yml
public/                        favicon.png · _redirects (لاستضافات أخرى)
scripts/
  create-admin.mjs             إنشاء أول مدير نظام (بمفتاح الخدمة)
  import-applications.mjs      استيراد طلبات من CSV (بحساب إداري) + import-lib.mjs + import-template.csv
  pages-fallback.mjs           ينسخ dist/index.html إلى 404.html لدعم الروابط المباشرة على Pages
src/
  main.jsx                     QueryClient · BrowserRouter(basename=BASE_URL) · UiProvider · AuthProvider · initTableLabels()
  App.jsx                      كل المسارات (الصفحات الإدارية كسولة التحميل lazy)
  styles/global.css            نظام التصميم كاملاً: الألوان، الوضع الليلي، المكونات، قاعة الامتحان، الطباعة، الاستجابة
  assets/                      الشعارات والنقش وخطوط Thmanyah Serif (woff2)
  lib/
    supabase.js                العميل · usernameToEmail (من الملف المشترك) · rpc() · invokeFunction() · manageUsers() · sendMessages()
    certificate.js             قالب الشهادة: الحقول، الإحداثيات الافتراضية، قراءة ملف PDF/صورة عبر pdf.js
    constants.js               خرائط الحالات (نص + لون الشارة) · الأدوار · أسماء عمليات السجل · متغيرات القوالب
    format.js                  fmtDate/fmtDateTime بتوقيت Africa/Tripoli · fmtScore · appUrl() (يراعي المسار الأساسي)
    scoring.js                 احتساب الدرجة في الواجهة (مطابق لدالة الخادم)
    helpers.js                 errorMessage · downloadCsv (UTF-8 BOM) · روابط واتساب · cleanSearch · isLibyanPhone
    tableLabels.js             ينسخ عناوين الأعمدة إلى data-label لتحويل الجداول إلى بطاقات على الهاتف
  context/
    AuthContext.jsx            session · profile · examiner · role · can(perm) · signIn · signOut · reloadProfile
    UiContext.jsx              toast() · confirm() · prompt() (نوافذ تأكيد وإدخال سبب)
  hooks/data.js                useSettings · useLookups · useExaminers · usePagedList · useCount · useDebounce
  components/
    ui.jsx                     Badge · StatusBadge · Empty · Skeleton · Loading · ErrorBox · Stat · Field · Kv · Tabs · SearchInput · Pager · Modal · PageHeader · Select
    ListCard.jsx               قائمة موحّدة: بحث + مرشحات + جدول + ترقيم + تصدير CSV
    workflow.jsx               useAction · useApplicationActions · AssignModal · AppointmentModal · WhatsAppModal
    RegistrationForm.jsx       نموذج التسجيل بأربع خطوات (عام + إداري)
    StudentProfile.jsx         ملف الطالب بتبويبات (بيانات، طلبات، مواعيد، امتحانات، شهادات، رسائل، سجل)
    ExamReview.jsx             مراجعة نتيجة الامتحان + useExamDetails
    CertificateView.jsx        الشهادة: فوق القالب المرفوع بإحداثيات حرة، أو التصميم المدمج + QR
    CertificateLayoutEditor.jsx رفع قالب الشهادة وتحديد مواضع الحقول بالسحب أو بالأرقام
    ArbitrationGuide.jsx       نص الدليل الاسترشادي للتحكيم (تبويب داخل أساس التحكيم)
    ChangePassword.jsx         تغيير كلمة المرور (اختياري من لوحة التحكم)
    icons.jsx                  أيقونات SVG
  layouts/
    PublicLayout.jsx           رأس وتذييل الموقع العام
    DashboardLayout.jsx        الشريط الجانبي، الإشعارات، الوضع الليلي + RequireRole (حماية المسارات)
  pages/
    Login.jsx                  دخول الإدارة والمحفّظين
    public/                    Home · About · Register · ApplicationStatus · ResultLookup · CertificateVerify · NotFound
    admin/                     Dashboard · Applications · NewApplication · Students · Examiners · Assignments · Exams · Results · Certificates · ArbitrationCriteria (أساس التحكيم: المعايير · الخصميات · التقديرات · الدليل الاسترشادي) · Reports · Users · Settings · NotificationSettings · Messages (لوحة الإشعارات) · AuditLog
    examiner/                  Dashboard · MyStudents · ExaminerExams · ExamRoom (قاعة الامتحان)
    shared/                    Appointments (للإدارة والمحفّظ) · CertificatePrint
supabase/
  config.toml                  إعدادات التطوير المحلي
  migrations/                  9 ملفات (انظر القسم 6)
  functions/_shared/username.js اسم المستخدم → بريد Auth الداخلي (ملف واحد تستعمله الواجهة والدالة والسكربتات)
  functions/manage-users/      إدارة الحسابات
  functions/send-messages/     إرسال الرسائل المستحقة
  functions/_shared/messaging.ts  مزودو واتساب/SMS/البريد (قابلة للاختبار في Node)
  snippets/schedule-send-messages.sql  جدولة الإرسال كل دقيقة عبر pg_cron
tests/                         pglite.mjs · db · notifications · scoring · import · messaging · e2e-api
docs/SYSTEM_CONTEXT.md         هذا الملف
README.md · ROADMAP.md
```

---

## 5. الواجهة: المسارات والأنماط

### المسارات
- **عامة** (داخل `PublicLayout`): `/` · `/about` · `/register` · `/application-status?q=` · `/result` · `/certificate-verification?no=` · `*` (غير موجود)
- **دخول:** `/admin/login` · `/examiner/login`
- **الإدارة** (`RequireRole` لـ super_admin/admin): `/admin` · `applications` · `applications/new` · `students` · `examiners` · `assignments` · `appointments` · `exams` · `results` · `results/pending` · `certificates` · `arbitration` (أساس التحكيم: المعايير والخصميات والتقديرات؛ `criteria` و `deductions` تحوّلان إليها) · `reports` · `users` (مدير النظام فقط) · `settings` · `audit-log` · `messages`
- **المحفّظ** (`RequireRole` لـ examiner): `/examiner` · `students` · `appointments` · `exams` · `results`
- **مستقلة:** `/examiner/exams/:examId` (قاعة الامتحان بملء الشاشة) · `/certificates/:certNo/print` (طباعة الشهادة، للإدارة)

### أنماط البرمجة المعتمدة
- **القراءة:** عبر العروض (views) بـ `usePagedList({ source: 'v_…', searchCols, filters, order })` — بحث وتصفية وترقيم على الخادم، و `fetchAll()` للتصدير.
- **الكتابة وتغيير الحالات:** عبر `rpc('اسم_الدالة', {p_…})` داخل `useAction()` الذي يعرض رسالة النجاح/الخطأ ويحدّث كل الاستعلامات. **لا يُكتب `status` مباشرة أبداً.**
- **التأكيدات:** `const { confirm, prompt } = useUi()`؛ `prompt` لإدخال سبب الرفض/الإرجاع.
- **القوائم:** مكوّن `ListCard` بأعمدة `{ label, className, render(row) }`؛ أي جدول آخر يوضع داخل `<div className="tbl-wrap cards">` ليتحول تلقائياً إلى بطاقات على الهاتف.
- **الصلاحيات في الواجهة:** `const { can, isSuper, isAdmin, isExaminer } = useAuth()` و `can('final_approve' | 'issue_certificates' | 'super')` — للعرض فقط؛ **الحماية الحقيقية في قاعدة البيانات**.
- **التواريخ:** بصيغة `2026-09-18` بأرقام لاتينية وتوقيت `Africa/Tripoli` عبر `fmtDate`/`fmtDateTime`.
- **الأرقام السالبة** داخل نص عربي تُلف بـ `<bdi dir="ltr">−…</bdi>`.
- **الروابط المطلقة** (QR، نوافذ الطباعة) عبر `appUrl('path')` لأن الموقع تحت مسار فرعي.
- **كل النصوص عربية**، والتعليقات في الكود عربية.

### نظام التصميم (`src/styles/global.css`)
- متغيرات ألوان على `:root` (كحلي `--navy #16324F`، تركوازي `--teal #166E70`، ذهبي `--gold #E5B25E`…) ونسخة ليلية عبر `html[data-theme="dark"]` (زر في الشريط العلوي، يُحفظ في localStorage).
- الخط: **Thmanyah Serif** (400/500/700).
- الفئات الأساسية: `.btn` (`teal`/`ghost`/`danger`/`gold`/`sm`/`block`) · `.card` + `.card-h`/`.card-b`/`.card-f` · `.badge` (`ok`/`warn`/`err`/`teal`/`gold`) · `.tbl` · `.stats`/`.stat` · `label.f` للحقول · `.f2`/`.f3` شبكات النماذج · `.kv` لقوائم «مفتاح: قيمة» · `.alert`.
- **الاستجابة:** 480 هاتف صغير · 640 هاتف · 820 لوحي (الجداول تصبح بطاقات، وعمودان على اللوحي) · 1024 (الشريط الجانبي يصبح قائمة منبثقة) · 1600 شاشات كبيرة. النوافذ على الهاتف تظهر كورقة سفلية بترويسة وتذييل ثابتين. قاعة الامتحان لها تخطيط خاص للهاتف.

---

## 6. قاعدة البيانات

### ملفات migrations (بالترتيب)
1. `20260916000100_schema.sql` — الأنواع والجداول والفهارس (منها فهارس pg_trgm للبحث).
2. `20260916000200_core_functions.sql` — دوال الصلاحيات، الترقيم، سجل العمليات، الإشعارات الداخلية، تحديد المعدل، احتساب الدرجات، مشغّلات التدقيق.
3. `20260916000300_workflow.sql` — إجراءات سير العمل (RPC)، الواجهات العامة، اللوحات والتقارير.
4. `20260916000400_views_rls.sql` — العروض، سياسات RLS، صلاحيات الأعمدة، حصر تنفيذ الدوال.
5. `20260916000500_defaults.sql` — البيانات المرجعية الافتراضية.
6. `20260917000100_notifications.sql` — قوالب الرسائل، طابور الإرسال، التذكير.
7. `20261010000090_message_status_exported.sql` — حالة «مُصدّرة» للرسائل (ملف مستقل لأن قيمة enum الجديدة لا تُستعمل في معاملة إضافتها).
8. `20261010000100_update_phase_1.sql` — حذف المتون وإعادة بناء العروض، أعمدة الشعار وقالب الشهادة، `export_messages`، `import_offices`، إلغاء إجبار كلمة المرور، دقة الكسور في احتساب الدرجات، مخزن `branding`.
9. `20261011000100_arbitration_and_offices.sql` — معايير التحكيم والخصميات وفق الدليل الاسترشادي (¼ · ½ · 1)، وأساس السؤال 20، وقائمة مكاتب الأوقاف الـ 58 (بلا TRUNCATE: تفعيل وتحديث وتعطيل فقط).
10. `20261012000100_continuous_program_and_returning_students.sql` — حذف جدول الدورات وعمود `cycle_id`، وفتح/إغلاق التسجيل من `settings.registration_open`، وإجراء `check_returning_student`، وقواعد التسجيل في برنامج مستمر، و«مقدار الحفظ» لم يعد إلزامياً.

> **قاعدة:** لا تعدّل ملف migration منشوراً؛ أضف ملفاً جديداً باسم `YYYYMMDDHHMMSS_وصف.sql`.

### الجداول (20)
| الجدول | الغرض وأهم الأعمدة |
|---|---|
| `settings` | صف واحد `id=1`: بيانات الجهة، `exam_base` (**20** بمقياس دليل التحكيم)، `exam_questions` (3)، `exam_aggregate` (avg/min)، `exam_mode`، إعدادات الشهادة (`cert_prefix` مثل `CERT-{YYYY}-`، `cert_digits`، `cert_title`، الموقّع، `cert_show_qr`، **`cert_bg_pdf_url`** قالب PDF/صورة و **`cert_layout_config`** إحداثيات الحقول JSONB)، الهوية (**`logo_url`**، **`logo_scale`** 0.25–4)، الإشعارات (`notify_enabled`، `notify_channel`، `reminder_hours`، `public_site_url`) |
| `offices` · `levels` | قوائم مرجعية (`name`، `active`، `sort_order`). المكاتب = 58 مكتب أوقاف معتمد، والمستويات خمسة. **جدول `matns` وجدول `application_matns` حُذفا نهائياً** |
| `profiles` | حسابات الدخول: `role`، `status`، `can_final_approve`، `can_issue_certificates`، `username` (**يُقبل بالعربية**)، `must_change_password` (بقي في المخطط لكنه دائماً false: لا إجبار على تغيير كلمة المرور) |
| `examiners` | المحفّظون: `user_id` → profiles، `office_id`، `employee_no`، `status` |
| `students` | `student_no` (STU-YYYY-00001)، `national_id` (12 رقماً، فريد)، الأسماء، `full_name` (عمود محسوب)، الميلاد، الجنس، الهاتف، واتساب |
| `applications` | الطلب: `reg_no` (REG-YYYY-00001)، `student_id`، القسم، الحلقة، المركز، المكتب، المستوى، `status`، `examiner_id`، سبب الرفض. **برنامج مستمر:** طلب مفتوح واحد لكل طالب، ولا يُعاد امتحان مستوى اجتازه |
| `appointments` | المواعيد: `apt_no`، `exam_date` + `exam_time` (توقيت ليبيا)، `mode`، `location`، `status`، `notified_at` |
| `criteria` | معايير التقييم (حالياً «الصوت والأداء» من 10، الافتراضي 5، معامل 0.4، خطوة 0.25): `max_score`، `default_score`، `penalty_factor`، `step`، `hint` |
| `deduction_types` | الخصميات الاثنتا عشرة وفق الدليل الاسترشادي للتحكيم: التلعثم 0.25، التردد 0.50، اللحن الخفي 0.25، اللحن الجلي 1، التنبيه 1، الفتح 1، التقديم أو التأخير 0.50، النقص أو الزيادة 0.50، ترك الصلاة على النبي ﷺ 0.50، ترك الترضي أو الترحم 0.50، ترك تعظيم اسم الله 0.50، الراوي أو التخريج 1 |
| `grade_scales` | سلّم التقديرات (فارغ حالياً — قرار إداري معلّق) |
| `exams` | الامتحان: `exam_no`، `status`، `config` (**لقطة JSON** من الإعدادات والمعايير والخصميات وقت البدء)، `score`، أوقات الإرسال والاعتماد، `return_reason`، `admin_notes` |
| `exam_questions` | لكل سؤال: `criteria_scores` (JSON)، `deductions` (JSON: معرّف الخصم → عدد المرات)، `touched`، `score` (يحسبه مشغّل) |
| `certificates` | `cert_no`، لقطة من اسم الطالب و **`level_name`** والدرجة والتقدير، `status` (valid/revoked) |
| `audit_log` | سجل كل عملية حساسة: `actor_name`، `action`، `entity`، `entity_id`، `details`، `ip` |
| `notifications` | إشعارات داخل اللوحات (الجرس) لكل مستخدم |
| `rate_limits` · `serial_counters` | داخلية: تحديد المعدل والترقيم السنوي |
| `message_templates` | قوالب الرسائل الآلية (نص بمتغيرات `{{student_name}}`…، اسم قالب واتساب المعتمد) |
| `outbound_messages` | طابور الرسائل: القناة، المستلم، النص، `status`، المحاولات، `send_after`، `dedupe_key` |

### العروض (views) — كلها `security_invoker` فتُطبَّق عليها سياسات RLS
`v_applications` (الطلب + الطالب + المكتب + المستوى + المحفّظ + آخر امتحان) · `v_students` · `v_appointments` · `v_exams` · `v_certificates` · `v_examiners` · `v_outbound_messages`

### الحالات وانتقالاتها
**الطلب** (`application_status`):
```
pending ─► under_review ─► approved ─► assigned ─► scheduled ─► in_exam ─► admin_pending ─► published
فروع: rejected (من pending/under_review/approved/assigned/absent/postponed)
      absent · postponed (من scheduled، ثم موعد جديد يعيده scheduled)
      إرجاع النتيجة يعيد admin_pending أو published إلى in_exam
```
**الامتحان** (`exam_status`): `draft` (عند البدء) → `in_progress` (أول تعديل) → `examiner_approved` (إرسال المحفّظ) → `approved` (اعتماد الإدارة) أو `rejected` (مُعاد للمحفّظ، يصحّح ثم يرسل مجدداً).
**الموعد:** `scheduled` · `done` · `absent` · `postponed` · `cancelled`. **الشهادة:** `valid` · `revoked`. **الرسالة:** `queued` · `sending` · `sent` · `failed` · `cancelled`.

النصوص العربية لكل حالة ولون شارتها في `src/lib/constants.js`.

### إجراءات RPC ومن يستدعيها
| الإجراء | من | الأثر |
|---|---|---|
| `submit_application(p jsonb)` | الزائر والإداري | ينشئ الطالب (أو يربط الموجود إن طابق الاسم وتاريخ الميلاد) والطلب بالمستوى المختار (`level_id`)؛ يرجع `reg_no` و `student_no` و `level`. الإداري يتجاوز إغلاق التسجيل |
| `track_application(p_query)` | الزائر | حالة الطلب برقم الطلب أو الرقم الوطني + تواريخ الخط الزمني |
| `lookup_result(p_query)` | الزائر | النتيجة **المعتمدة فقط** برقم الطالب أو الرقم الوطني مع تفاصيل الأسئلة |
| `verify_certificate(p_cert_no)` | الزائر | صحة الشهادة وحالتها (تُرجع `level` لا المتون) |
| `check_returning_student(p_national_id, p_birth_date)` | الزائر والموظف | يتعرّف على الطالب السابق ويعيد بياناته ومستوياته السابقة والمستويات التي اجتازها والطلب المفتوح إن وُجد. الزائر يؤكد هويته بتاريخ الميلاد، والموظف معفى |
| `export_messages(p_ids uuid[], p_status)` | الإداري | يعلّم الرسائل المعلقة «مُصدّرة» أو «مُرسلة» بعد تنزيلها Excel/CSV للإرسال المحلي، ويكتب في سجل العمليات |
| `import_offices(p_names text[], p_deactivate_missing)` | مدير النظام | استيراد المكاتب دفعةً: يضيف الجديد ويحدّث الموجود ويفعّله، ويعطّل ما خرج من القائمة عند الطلب — **لا يحذف أبداً** |
| `mark_application_under_review` · `approve_application` · `reject_application(p_reason)` · `assign_application(p_examiner_id, p_note)` | الإداري | انتقالات الطلب؛ إعادة التحويل تلغي المواعيد القائمة |
| `save_appointment(…)` · `set_appointment_status(absent/postponed/cancelled)` · `mark_appointment_notified` | الإداري أو المحفّظ المسؤول | المواعيد |
| `start_exam(p_application_id)` | المحفّظ المسؤول | ينشئ الامتحان مع لقطة القواعد والأسئلة، أو يستأنف المفتوح |
| `submit_exam(p_exam_id)` | المحفّظ المسؤول | يحسب الدرجة على الخادم ويرسل للإدارة |
| `approve_exam(p_notes)` · `return_exam(p_reason)` | من يملك `final_approve` (إعادة فتح نتيجة معتمدة لمدير النظام فقط وتلغي شهادتها) | الاعتماد النهائي أو الإرجاع |
| `issue_certificate(p_exam_id)` | من يملك `issue_certificates` | إصدار الشهادة (رقم من إعدادات البادئة) |
| `revoke_certificate(p_reason)` | مدير النظام | إلغاء شهادة |
| `admin_dashboard()` · `report_summary(office, from, to)` | الإداري | الإحصاءات والتقارير |
| `examiner_dashboard()` | المحفّظ | إحصاءاته |
| `record_sign_in()` · `password_changed()` | أي مستخدم مسجّل | تسجيل الدخول في السجل / إلغاء إلزام تغيير كلمة المرور |
| `retry_message` · `cancel_message` | الإداري | طابور الرسائل |
| `send_test_message(p_recipient)` | مدير النظام | رسالة تجريبية |
| `claim_messages` · `finish_message` | `service_role` فقط (الدالة send-messages) | حجز الرسائل المستحقة وتسجيل نتيجة الإرسال |

### نموذج الأمان (قواعد ذهبية)
1. **RLS مفعّل على كل جدول.** المحفّظ يرى فقط ما يخص طلابه (`examiner_id = current_examiner_id()`)، والزائر لا يقرأ أي بيانات شخصية مباشرة، بل عبر الإجراءات العامة الأربعة فقط.
2. **لا تغيير للحالات إلا عبر الإجراءات** (`security definer`) التي تتحقق من الصلاحية والحالة الحالية، وتكتب في `audit_log`، وتنشئ الإشعارات.
3. **صلاحيات على مستوى الأعمدة:** مثلاً الإداري يعدّل أعمدة بيانات الطلب فقط لا `status`؛ المحفّظ يعدّل في `exam_questions` فقط `criteria_scores`/`deductions`/`touched` وما دام الامتحان مفتوحاً؛ عمود `score` لا يكتبه أحد مباشرة.
4. **Supabase يمنح anon/authenticated حق تنفيذ أي دالة جديدة افتراضياً** — لذلك كل دالة جديدة يجب أن تُتبع بـ `revoke execute … from public, anon, authenticated` ثم `grant` صريح لمن يحتاجها.
5. الدوال المستخدمة داخل السياسات تُلف بـ `(select public.is_admin())` لتُقيَّم مرة لكل استعلام.
6. **تحديد المعدل** في الإجراءات العامة: 60 استعلاماً و30 تسجيلاً لكل IP كل 10 دقائق (الموظفون مستثنون).
7. مفتاح `service_role` **لا يصل للمتصفح أبداً**؛ يُستخدم فقط في Edge Functions والسكربتات المحلية.
8. الإجراءات التي تكتب في قاعدة البيانات يجب ألا تكون `stable` (PostgREST ينفّذ الدوال `stable` في معاملة للقراءة فقط).

### الترقيم التلقائي
مشغّلات `before insert` تولّد أرقاماً سنوية متسلسلة: `STU-2026-00001` · `REG-2026-00001` · `APT-2026-00001` · `EX-2026-00001` · والشهادات من `settings.cert_prefix`.

### قاعدة احتساب الدرجة
```
درجة السؤال = الأساس − Σ (الدرجة القصوى للمعيار − الممنوحة) × معامل المعيار − Σ (عدد مرات الخصم × قيمته)   ← محصورة بين 0 والأساس
النتيجة النهائية = متوسط الأسئلة (أو أقل درجة) ÷ الأساس × 100   ← محصورة بين 0 و100
```
مثال بمقياس الدليل (أساس السؤال 20): الصوت والأداء 7 من 10 (معامل 0.4) + تنبيه ×1 (1) + لحن خفي ×2 (0.25) ← 20 − 1.2 − 1 − 0.5 = **17.3** من 20 (86.5%).
كل القيم تُقرَّب إلى منزلتين قبل الضرب، والنتيجة النهائية بقسمة واحدة، حتى تتطابق كسور الدليل (¼ · ½ · 1) والكسر المئوي في الصوت (مثل 8.75) بين الخادم والواجهة.
المنطق مكرر عمداً في مكانين يجب أن يبقيا متطابقين: `public.compute_question_score` / `compute_exam_score` (المرجع) و `src/lib/scoring.js` (العرض اللحظي). اختبار `npm run test:scoring` يتحقق من تطابقهما على 600 حالة.
عند بدء كل امتحان تُحفظ **لقطة** من القواعد في `exams.config`، فتعديل المعايير أو الخصميات لا يؤثر على الامتحانات السابقة.

### هوية الجهة وقالب الشهادة
- `settings.logo_url` + `logo_scale`: يُرفع الشعار إلى مخزن `branding` (قراءة عامة، والرفع لمدير النظام)، ويظهر في الموقع العام ولوحات التحكم والشهادة المدمجة فور الحفظ.
- `settings.cert_bg_pdf_url` + `cert_layout_config`: يُرفع قالب الشهادة (PDF أو صورة)، وتُرسم الصفحة الأولى عبر pdf.js، ثم تُوضع الحقول فوقها بتموضع مطلق بنسب مئوية (x, y) مع حجم الخط باللون والسماكة. الطباعة تضبط مقاس الورقة على مقاس القالب بالنقاط.
- الحقول المتاحة: اسم الطالب · المستوى · الدرجة · التقدير · رقم الشهادة · تاريخ الإصدار · اسم الجهة · عنوان الشهادة · اسم الموقّع وصفته · رمز التحقق QR.

### البرنامج المستمر والطلبة السابقون
- لا توجد «دورات»: التسجيل مستمر، ويُفتح ويُغلق من `settings.registration_open` (الإعدادات ← الامتحان)، والإداري يضيف الطلبات دائماً.
- في نموذج التسجيل بطاقة «ممتحن سابقاً؟»: الرقم الوطني + تاريخ الميلاد ← `check_returning_student` ← تعبئة تلقائية للاسم وبيانات التواصل، وتخطّي خطوة البيانات الشخصية، وعرض المستويات السابقة، وإخفاء المستويات المجتازة من قائمة الاختيار.
- قواعد `submit_application`: طلب مفتوح واحد لكل طالب، ولا يُعاد امتحان مستوى حالته `published`، وبيانات تواصل الطالب العائد تُحدَّث تلقائياً.
- شاشة المراجعة تعرض بيانات الطالب ثم (القسم · الحلقة · المركز · المكتب · المحفّظ · المستوى · ملاحظة الطالب)؛ و«مقدار الحفظ» و«الأبيات» أُزيلا من التسجيل (العمودان باقيان للسجلات القديمة).

### أسماء المستخدمين العربية
`supabase/functions/_shared/username.js` هو المرجع الوحيد: يوحّد الاسم (بلا تشكيل، ألف وهمزات وياء وتاء مربوطة موحّدة، مسافة واحدة)، ثم يولّد بريد Auth: الاسم اللاتيني القديم يبقى `username@domain`، وأي اسم عربي يصير `u-<32 خانة من SHA-256>@domain`. تستعمله الواجهة عند الدخول، ودالة `manage-users` عند الإنشاء، وسكربت `create-admin`. **لا إجبار على تغيير كلمة المرور**: ما يضعه الإداري نهائي.

### الإشعارات الآلية (معطّلة افتراضياً)
- مشغّلات تضيف رسائل إلى `outbound_messages` عند: استلام الطلب، قبوله، رفضه، تحديد الموعد، **التذكير** (افتراضياً قبل 24 ساعة وساعتين بتوقيت ليبيا)، اعتماد النتيجة، صدور الشهادة. تغيير الموعد أو الغياب يلغي الرسائل غير المرسلة.
- الدالة `send-messages` تحجز الدفعة وترسل عبر القناة المختارة وتعيد المحاولة مرتين.
- الجدولة كل دقيقة عبر `supabase/snippets/schedule-send-messages.sql` (لم تُفعَّل بعد).
- **لوحة الإشعارات:** تبويبات (بالانتظار · مُصدّرة · أُرسلت · فشلت · الكل)، وتحديد جماعي بمربعات اختيار مع إجراءي «تحديد كمُرسلة» و«تحديد كمُصدّرة» عبر `export_messages`، وزر «تصدير المعلقة Excel/CSV» بأعمدة (رقم الهاتف الدولي · نص الرسالة · الاسم · رقم الطلب · نوع الرسالة). المُصدّرة لا يلتقطها الإرسال الآلي، و«إعادة للطابور» تعيدها.
- **الحالة الحالية:** لا مزود مربوط بعد؛ التصدير المحلي وزر «إرسال عبر واتساب» اليدوي (رابط `wa.me`) هما المستخدمان فعلياً.

---

## 7. Edge Functions

| الدالة | الوظيفة |
|---|---|
| `manage-users` | `create_user` (إداري للمحفّظين، مدير النظام للجميع؛ ينشئ حساب Auth + profile + examiner، وكلمة مؤقتة إن لم تُحدَّد مع إلزام تغييرها) · `reset_password` · `set_status` (إيقاف/تفعيل مع حظر في Auth) · `update_user` (الدور والصلاحيات، مدير النظام فقط). كل عملية تُسجَّل في `audit_log` |
| `send-messages` | `{action:'run'}` إرسال المستحق · `{action:'status'}` القنوات المربوطة. يقبل ترويسة `x-cron-secret` أو جلسة إداري |

---

## 8. مسار العمل الكامل (كما جُرّب فعلياً)
1. الطالب يسجّل من `/register` (أربع خطوات) ← إيصال برقم الطلب ورقم الطالب.
2. الإداري: مراجعة ← قبول ← تحويل إلى محفّظ (مع ملاحظة) ← يصل إشعار للمحفّظ.
3. المحفّظ: تحديد موعد (تاريخ، وقت، غرفة صوتية/رابط) ← إرسال الموعد على واتساب.
4. المحفّظ يبدأ الجلسة: لكل سؤال يضبط درجة «الصوت والأداء» ويسجّل الخصميات بالنقر على بطاقاتها، مع حفظ تلقائي وتراجع ← «إنهاء الجلسة واعتماد النتيجة».
5. الإداري (بصلاحية الاعتماد): يراجع تفاصيل الأسئلة ← يعتمد أو يُرجع بسبب مكتوب.
6. الإداري (بصلاحية الشهادات): يصدر الشهادة ← تُطبع PDF من المتصفح بتصميم أفقي مع QR.
7. العموم: الاستعلام عن النتيجة برقم الطالب، والتحقق من الشهادة برقمها أو بمسح QR.

---

## 9. الاختبارات
| الأمر | يغطي |
|---|---|
| `npm test` | يشغّل الخمسة التالية |
| `npm run test:db` | 53 فحصاً: سير العمل كاملاً، العزل بين المحفّظين، منع التلاعب، الصلاحيات، الشهادات، التقارير، تحديد المعدل |
| `npm run test:notifications` | 41 فحصاً للإشعارات والتذكير والطابور |
| `npm run test:scoring` | تطابق الدرجات بين الواجهة والخادم (600 حالة عشوائية) |
| `npm run test:import` | أداة استيراد CSV |
| `npm run test:messaging` | مزودو الإرسال بطلبات وهمية |
| `npm run test:e2e` | 35 فحصاً على Supabase حقيقي (يحتاج `supabase start` و `.env.local`) |
| `npm run build` | بناء الواجهة |

`tests/pglite.mjs` يطبّق كل ملفات migrations على Postgres داخل الذاكرة مع محاكاة أدوار Supabase ومخطط auth؛ أي migration جديد يُختبر تلقائياً بهذه الطريقة.

---

## 10. وصفات التعديلات الشائعة

- **إضافة صفحة إدارية:** ملف في `src/pages/admin/` ← مسار في `src/App.jsx` (lazy) ← عنصر في `adminNav` داخل `src/layouts/DashboardLayout.jsx`. استخدم `PageHeader` و `ListCard` و `useAction`.
- **إضافة عمود أو جدول:** migration جديد ← تحديث العرض المرتبط (`create or replace view` بنفس الأعمدة مع الإضافة في النهاية) ← سياسات RLS ← `grant update (…)` إن كان قابلاً للتعديل ← تحديث الواجهة ← `npm test` ← `npx supabase db push`.
- **إضافة إجراء RPC:** `create or replace function … security definer set search_path = public` مع تحقق الصلاحية (`perform public.require_admin()` أو `has_perm`) والحالة، و `perform public.log_action(...)` ← `revoke`/`grant` صريحان ← إضافة اسم العملية العربي في `AUDIT_ACTIONS` ← فحص في `tests/db.test.mjs`.
- **إضافة حالة جديدة:** `alter type … add value` في migration ← تحديث الإجراءات والانتقالات ← `APP_STATUS`/`EXAM_STATUS` في `constants.js` ← الخط الزمني في `ApplicationStatus.jsx`.
- **تعديل قاعدة الدرجات:** يجب تعديل `compute_question_score`/`compute_exam_score` **و** `src/lib/scoring.js` معاً، ثم `npm run test:scoring`.
- **قالب رسالة جديد:** إدراج في `message_templates` + مشغّل أو استدعاء `enqueue_message` + متغيرات في `message_params` و `TEMPLATE_VARS`.
- **تعديل التصميم:** `src/styles/global.css` فقط، باستخدام المتغيرات، ومع مراعاة الوضع الليلي ونقاط الاستجابة.
- **النشر:** `git push` (الواجهة تلقائياً) + `npx supabase db push` (قاعدة البيانات) + `npm run functions:deploy` (الدوال).

---

## 11. قيود معروفة وقرارات معلّقة
- **سلّم التقديرات ودرجة النجاح غير محددين** ← الشهادة تظهر بلا تقدير ونسبة النجاح لا تُحتسب (يُضبط من «معايير التقييم»).
- **التسجيل الذاتي في Supabase السحابي ما زال مفتوحاً** ← يُطفأ من لوحة Supabase (Authentication → Sign In / Providers). من يسجّل بهذه الطريقة لا يملك أي صلاحية.
- الإشعارات الآلية تحتاج حساب WhatsApp Business وقوالب معتمدة من Meta، أو مزود SMS.
- المشروع السحابي على الخطة المجانية: يتوقف بعد 7 أيام بلا نشاط.
- `npx supabase config push` يدفع كل إعدادات Auth المحلية (ويغيّر إعدادات غير مقصودة) ← إعدادات Auth السحابية تُعدَّل من اللوحة.
- الطباعة (الشهادة، التقارير) عبر نافذة الطباعة في المتصفح؛ توليد PDF على الخادم من خطط المرحلة الرابعة.
- الطلبة من خارج ليبيا: الرقم الوطني إلزامي (12 رقماً) حالياً؛ دعم جواز السفر من خطط المرحلة الخامسة.
- خارطة الطريق الكاملة في `ROADMAP.md`.

### مزالق تقنية اكتُشفت أثناء البناء (تجنّبها)
- في JavaScript، `String.replace` يحوّل `$$` في نص الاستبدال إلى `$` (يكسر دوال SQL عند التعديل البرمجي للملفات).
- على Windows/Git Bash يحوّل `VITE_BASE=/hussas-system/` إلى مسار ويندوز؛ استخدم `MSYS_NO_PATHCONV=1`.
- في `config.toml` يجب أن يبقى `[auth.email] enable_signup = true` (إطفاؤه يعطّل **الدخول** بالبريد لا التسجيل فقط)؛ منع التسجيل عبر `[auth] enable_signup = false`.
- في PL/pgSQL، `CASE` بقيم نصية لعمود من نوع enum يحتاج تحويلاً صريحاً `::public.application_status`.
- عنصر flex بـ `overflow` ينكمش إلى صفر (أُصلح بـ `flex:none` في شريط أسئلة قاعة الامتحان).

---

## 12. قالب برومبت التعديل (المطلوب من Gemini إنتاجه)

عند طلب أي تعديل، أنتج البرومبت بهذا الشكل بالضبط، موجهاً لوكيل برمجي يعمل داخل المستودع:

```
## الهدف
[جملة أو جملتان: ماذا يتغير ولماذا، من منظور المستخدم (مدير/إداري/محفّظ/زائر)]

## السياق
مستودع منظومة حُفّاظ السُّنة (React 19 + Vite + Supabase). اقرأ docs/SYSTEM_CONTEXT.md أولاً.
[الأجزاء المعنية من هذا الملف: الجداول، الإجراءات، الصفحات]

## التغييرات المطلوبة
### قاعدة البيانات
- [migration جديد: الجداول/الأعمدة/الإجراءات/السياسات/الصلاحيات — أو «لا شيء»]
### الواجهة
- [الملفات بالمسار الكامل وما يتغير في كل منها]
### Edge Functions
- [أو «لا شيء»]

## قيود يجب احترامها
- لا تغيير لأي status إلا عبر إجراء RPC يتحقق من الصلاحية ويكتب في audit_log.
- كل دالة جديدة: revoke execute من public/anon/authenticated ثم grant صريح.
- لا تعدّل ملفات migrations السابقة؛ أضف ملفاً جديداً.
- إن تغيّرت قاعدة الدرجات: عدّل SQL و src/lib/scoring.js معاً.
- النصوص عربية، والتواريخ بتوقيت Africa/Tripoli، والتصميم من متغيرات global.css ويعمل على الهاتف والوضع الليلي.
- [قيود خاصة بهذا التعديل]

## معايير القبول
- [ ] [سلوك قابل للتحقق 1]
- [ ] [سلوك قابل للتحقق 2]
- [ ] المستخدم غير المصرّح له يُمنع (اذكر من ومن ماذا)

## الاختبارات
- أضف فحوصاً في tests/[الملف المناسب].test.mjs لـ [...]
- شغّل: npm test و npm run build — ويجب أن ينجح الكل.

## النشر
- [ ] git push (الواجهة تُنشر تلقائياً)
- [ ] npx supabase db push (إن وُجد migration)
- [ ] npm run functions:deploy (إن تغيّرت دالة)
```
