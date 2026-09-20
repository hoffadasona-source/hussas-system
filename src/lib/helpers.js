import { APPOINTMENT_MODES } from './constants';
import { fmtDate, fmtTime } from './format';

/** رسالة خطأ مفهومة من أخطاء Supabase/PostgREST */
export function errorMessage(err) {
  if (!err) return 'حدث خطأ غير متوقع';
  const msg = err.message || String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.';
  if (/Invalid login credentials/i.test(msg)) return 'اسم المستخدم أو كلمة المرور غير صحيحة';
  if (/permission denied|violates row-level security/i.test(msg)) return 'غير مصرح بهذه العملية';
  if (/JWT expired/i.test(msg)) return 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً';
  if (/duplicate key/i.test(msg)) return 'القيمة مستخدمة مسبقاً';
  return msg;
}

/** تصدير CSV متوافق مع Excel (UTF-8 BOM) */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' · ') : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** رقم واتساب دولي بدون + (ليبيا افتراضياً) */
export function waNumber(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return '218' + digits.slice(1);
  return digits;
}

export function appointmentMessage({ orgName, studentName, level, date, time, mode, location, notes }) {
  return [
    'السلام عليكم ورحمة الله وبركاته',
    '',
    `${orgName} — إشعار موعد الامتحان.`,
    '',
    `اسم الطالب: ${studentName}`,
    level ? `المستوى: ${level}` : null,
    `تاريخ الامتحان: ${fmtDate(date)}`,
    `الوقت: ${fmtTime(time)}`,
    `مكان الجلسة: ${APPOINTMENT_MODES[mode] || mode}${location ? ` — ${location}` : ''}`,
    notes ? `ملاحظات: ${notes}` : null,
    '',
    'يرجى الدخول إلى الغرفة قبل الموعد بعشر دقائق، والتأكد من جودة الاتصال والسماعة.',
    'وفقكم الله.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

/** تنظيف نص البحث قبل تمريره إلى فلتر PostgREST */
export const cleanSearch = (q) => String(q || '').replace(/[,()"\\%*]/g, ' ').trim();

export const isLibyanPhone = (v) => {
  const s = String(v || '').replace(/[^0-9+]/g, '');
  return /^09[1-6]\d{7}$/.test(s) || /^(\+|00)[1-9]\d{7,14}$/.test(s);
};
