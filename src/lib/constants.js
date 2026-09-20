export const APP_STATUS = {
  pending: { t: 'قيد الانتظار', c: '' },
  under_review: { t: 'قيد المراجعة', c: 'warn' },
  approved: { t: 'مقبول', c: 'ok' },
  rejected: { t: 'مرفوض', c: 'err' },
  assigned: { t: 'محال لمحفّظ', c: 'teal' },
  scheduled: { t: 'موعد محدد', c: 'teal' },
  absent: { t: 'غائب', c: 'err' },
  postponed: { t: 'مؤجل', c: 'warn' },
  in_exam: { t: 'قيد الامتحان', c: 'warn' },
  admin_pending: { t: 'بانتظار الإدارة', c: 'warn' },
  published: { t: 'نتيجة منشورة', c: 'ok' },
};

export const EXAM_STATUS = {
  draft: { t: 'مسودة', c: '' },
  in_progress: { t: 'جارٍ', c: 'warn' },
  examiner_approved: { t: 'بانتظار الإدارة', c: 'teal' },
  approved: { t: 'معتمد', c: 'ok' },
  rejected: { t: 'مُعاد للمحفّظ', c: 'err' },
};

export const APPOINTMENT_STATUS = {
  scheduled: { t: 'مجدول', c: 'teal' },
  done: { t: 'تم', c: 'ok' },
  absent: { t: 'غياب', c: 'err' },
  postponed: { t: 'مؤجل', c: 'warn' },
  cancelled: { t: 'ملغى', c: '' },
};

export const CERT_STATUS = {
  valid: { t: 'سارية', c: 'ok' },
  revoked: { t: 'ملغاة', c: 'err' },
};

export const ACCOUNT_STATUS = {
  active: { t: 'فعّال', c: 'ok' },
  inactive: { t: 'موقوف', c: 'err' },
};

export const ROLES = {
  super_admin: 'مدير النظام',
  admin: 'إداري',
  examiner: 'محفّظ',
};

export const SECTIONS = { men: 'قسم الرجال', women: 'قسم حافظات السنة' };
export const GENDERS = { male: 'ذكر', female: 'أنثى' };

export const APPOINTMENT_MODES = {
  whatsapp_room: 'غرفة صوتية — واتساب',
  telegram_room: 'غرفة صوتية — تيليجرام',
  whatsapp_call: 'مكالمة واتساب مباشرة',
  in_person: 'حضوري',
};

export const AGGREGATES = { avg: 'متوسط الأسئلة', min: 'أقل درجة' };

export const MESSAGE_STATUS = {
  queued: { t: 'بالانتظار', c: 'warn' },
  exported: { t: 'مُصدّرة', c: 'teal' },
  sending: { t: 'جارٍ الإرسال', c: 'teal' },
  sent: { t: 'أُرسلت', c: 'ok' },
  failed: { t: 'فشل', c: 'err' },
  cancelled: { t: 'ملغاة', c: '' },
};

export const CHANNELS = { whatsapp: 'واتساب', sms: 'رسالة نصية SMS', email: 'بريد إلكتروني' };

// المتغيرات المتاحة في قوالب الرسائل (تُملأ في public.message_params)
export const TEMPLATE_VARS = {
  student_name: 'اسم الطالب', first_name: 'الاسم الأول', reg_no: 'رقم الطلب', student_no: 'رقم الطالب',
  level: 'المستوى', office: 'المكتب', examiner: 'المحفّظ', org_name: 'اسم الجهة', org_phone: 'هاتف الجهة',
  date: 'تاريخ الموعد', time: 'وقت الموعد', place: 'مكان الجلسة', location: 'رابط الغرفة', appointment_notes: 'ملاحظات الموعد',
  rejection_reason: 'سبب الرفض', score: 'الدرجة', grade: 'التقدير', cert_no: 'رقم الشهادة',
  track_link: 'رابط متابعة الطلب', result_link: 'رابط النتيجة', verify_link: 'رابط التحقق من الشهادة',
};

export const AUDIT_ACTIONS = {
  'auth.sign_in': 'تسجيل دخول',
  'auth.password_change': 'تغيير كلمة المرور',
  'application.create': 'إضافة طلب',
  'application.review': 'بدء مراجعة طلب',
  'application.approve': 'قبول طلب تسجيل',
  'application.reject': 'رفض طلب',
  'application.assign': 'تحويل طالب إلى محفّظ',
  'application.reassign': 'إعادة تحويل طالب',
  'appointment.save': 'تحديد موعد',
  'appointment.notify': 'إرسال موعد عبر واتساب',
  'appointment.absent': 'تسجيل غياب',
  'appointment.postponed': 'تأجيل موعد',
  'appointment.cancelled': 'إلغاء موعد',
  'exam.start': 'بدء جلسة امتحان',
  'exam.examiner_approve': 'اعتماد المحفّظ',
  'exam.approve': 'اعتماد نتيجة',
  'exam.return': 'إرجاع نتيجة للمحفّظ',
  'certificate.issue': 'إصدار شهادة',
  'certificate.revoke': 'إلغاء شهادة',
  'messages.test': 'رسالة تجريبية',
  'messages.export': 'تصدير رسائل للإرسال المحلي',
  'offices.import': 'استيراد المكاتب',
  'user.create': 'إنشاء حساب',
  'user.update': 'تعديل صلاحيات حساب',
  'user.reset_password': 'إعادة تعيين كلمة المرور',
  'user.activate': 'تفعيل حساب',
  'user.deactivate': 'إيقاف حساب',
  'settings.update': 'تعديل الإعدادات',
};

export const AUDIT_ENTITIES = {
  application: 'طلب',
  appointment: 'موعد',
  exam: 'امتحان',
  certificate: 'شهادة',
  user: 'حساب',
  settings: 'إعدادات',
};

export const ordinal = (i) =>
  ['السؤال الأول', 'السؤال الثاني', 'السؤال الثالث', 'السؤال الرابع', 'السؤال الخامس', 'السؤال السادس'][i] ||
  `السؤال ${i + 1}`;

export const PAGE_SIZE = 20;
