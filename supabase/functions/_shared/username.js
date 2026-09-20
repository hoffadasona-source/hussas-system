// اسم المستخدم → بريد داخلي ثابت لحساب Supabase Auth.
// ملف مشترك بين الواجهة (src/lib/username.js) ودالة manage-users، فلا بد أن يبقى نسخة واحدة:
// أي تغيير في التطبيع أو التوليد هنا يغيّر بريد الدخول للحسابات العربية.

// التشكيل والتطويل يُحذفان قبل التوليد، ليتساهل الدخول مع اختلاف كتابة الاسم
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** أسماء المستخدمين اللاتينية القديمة تُبقي بريدها كما هو */
export const ASCII_USERNAME = /^[a-z0-9._-]{3,32}$/;

/** توحيد صيغة الاسم: بلا تشكيل، وبهمزات وألفات ولامات موحّدة، ومسافة واحدة بين الكلمات */
export function normalizeUsername(value) {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/[ى]/g, 'ي')                   // ى → ي
    .replace(/[ئ]/g, 'ي')                   // ئ → ي
    .replace(/[ؤ]/g, 'و')                   // ؤ → و
    .replace(/[ة]/g, 'ه')                   // ة → ه
    .replace(/\s+/g, ' ');
}

/** الاسم كما يُخزَّن ويُعرض: مسافات مرتبة دون تغيير الحروف */
export const displayUsername = (value) => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');

/** رسالة خطأ إن كان الاسم غير صالح، أو null إن كان سليماً */
export function usernameError(value) {
  const v = normalizeUsername(value);
  if (!v) return 'اسم المستخدم مطلوب';
  if (v.includes('@')) return 'اسم المستخدم لا يحتوي على @';
  if (v.length < 3) return 'اسم المستخدم 3 أحرف على الأقل';
  if (v.length > 64) return 'اسم المستخدم طويل جداً (64 حرفاً كحد أقصى)';
  if (/[\\/<>"'`,;]/.test(v)) return 'اسم المستخدم يحتوي على رموز غير مسموحة';
  return null;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * البريد الداخلي المقابل لاسم المستخدم:
 * - بريد صريح يُقبل كما هو.
 * - اسم لاتيني قديم: username@domain (حتى لا تتأثر الحسابات الموجودة).
 * - أي اسم آخر (عربي مثلاً): u-<بصمة ثابتة>@domain، فلا يحتاج الإداري إلى بريد إنجليزي.
 */
export async function usernameToEmail(value, domain = 'users.hussas.local') {
  const v = normalizeUsername(value);
  if (!v) return '';
  if (v.includes('@')) return v;
  if (ASCII_USERNAME.test(v)) return `${v}@${domain}`;
  return `u-${(await sha256Hex(v)).slice(0, 32)}@${domain}`;
}
