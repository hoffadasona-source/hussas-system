const TZ = 'Africa/Tripoli';

/** رابط مطلق داخل التطبيق يراعي المسار الأساسي للنشر (مثل /hussas-system/) */
export const appUrl = (path = '') => `${window.location.origin}${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`;

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const monthFmt = new Intl.DateTimeFormat('ar-LY', { month: 'long', timeZone: 'UTC' });

/** تاريخ بصيغة 2026-09-16 بتوقيت ليبيا */
export function fmtDate(value) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : `${dateFmt.format(d)} ${timeFmt.format(d)}`;
}

export const fmtTime = (value) => (value ? String(value).slice(0, 5) : '—');

export function fmtMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

export function fmtRelative(value) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.round(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.round(diff / 3600)} ساعة`;
  if (diff < 172800) return 'أمس';
  return fmtDate(value);
}

/** درجة بحد أقصى منزلتين عشريتين: 87.5 · 90 */
export function fmtScore(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '—';
}

export const todayISO = () => dateFmt.format(new Date());

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
