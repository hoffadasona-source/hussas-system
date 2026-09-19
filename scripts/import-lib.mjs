// أدوات استيراد الطلبات من CSV: قراءة الملف، ومطابقة الأعمدة، وتحويل كل صف إلى طلب تسجيل.

/** قراءة CSV (يدعم علامات الاقتباس والأسطر داخل الخلايا، والفاصلة أو الفاصلة المنقوطة) */
const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);
// الحركات والتطويل: U+064B–U+065F و U+0670 و U+0640
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x064b)}-${String.fromCharCode(0x065f)}${String.fromCharCode(0x0670)}${String.fromCharCode(0x0640)}]`, 'g');

export function parseCsv(text) {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const [header = [], ...data] = nonEmpty;
  return { header: header.map((h) => h.trim()), rows: data };
}

// اسم الحقل ← العناوين المقبولة في الملف
export const COLUMNS = {
  first_name: ['الاسم الأول', 'first_name'],
  father_name: ['اسم الأب', 'father_name'],
  grandfather_name: ['اسم الجد', 'grandfather_name'],
  family_name: ['اللقب', 'family_name'],
  birth_date: ['تاريخ الميلاد', 'birth_date'],
  national_id: ['الرقم الوطني', 'national_id'],
  gender: ['الجنس', 'gender'],
  residence: ['محل الإقامة', 'الإقامة', 'residence'],
  phone: ['الهاتف', 'رقم الهاتف', 'phone'],
  whatsapp: ['واتساب', 'رقم واتساب', 'whatsapp'],
  email: ['البريد', 'البريد الإلكتروني', 'email'],
  section: ['القسم', 'section'],
  circle_name: ['الحلقة', 'اسم الحلقة', 'circle_name'],
  center_name: ['المركز', 'center_name'],
  office: ['المكتب', 'office'],
  teacher_name: ['محفّظ الحلقة', 'اسم المحفّظ', 'teacher_name'],
  level: ['المستوى', 'level'],
  matns: ['المتون', 'matns'],
  memorized_amount: ['مقدار الحفظ', 'memorized_amount'],
  verses_range: ['الأبيات', 'الأبيات / المواضع', 'verses_range'],
  student_notes: ['ملاحظات', 'ملاحظات الطالب', 'student_notes'],
};
const REQUIRED = ['first_name', 'father_name', 'family_name', 'birth_date', 'national_id', 'residence', 'phone',
  'circle_name', 'center_name', 'office', 'level', 'matns', 'memorized_amount'];

/** توحيد النص العربي للمقارنة: إزالة التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة */
export const normalize = (s) => String(s ?? '')
  .replace(DIACRITICS, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const toLatinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/** يقبل 2006-05-10 أو 10/05/2006 أو 10-5-2006 */
export function parseDate(value) {
  const v = toLatinDigits(value).trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(m[3], m[2], m[1]);
  return null;
}
function iso(y, mo, d) {
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** يربط عناوين الملف بأسماء الحقول، ويُرجع الأعمدة الناقصة */
export function mapHeader(header) {
  const index = {};
  const normalizedHeader = header.map(normalize);
  for (const [field, names] of Object.entries(COLUMNS)) {
    const i = normalizedHeader.findIndex((h) => names.some((n) => normalize(n) === h));
    if (i >= 0) index[field] = i;
  }
  const missing = REQUIRED.filter((f) => index[f] === undefined).map((f) => COLUMNS[f][0]);
  return { index, missing };
}

/** يحوّل صفاً إلى مُدخلات submit_application، أو يُرجع قائمة أخطاء */
export function buildPayload(cells, index, lookups) {
  const get = (f) => (index[f] === undefined ? '' : String(cells[index[f]] ?? '').trim());
  const errors = [];
  const byName = (list, name, label) => {
    if (!name) return null;
    const found = list.find((x) => normalize(x.name) === normalize(name));
    if (!found) errors.push(`${label} غير معروف: «${name}»`);
    return found?.id ?? null;
  };

  const birth = parseDate(get('birth_date'));
  if (!birth) errors.push(`تاريخ الميلاد غير صحيح: «${get('birth_date')}»`);
  const nid = toLatinDigits(get('national_id')).replace(/\D/g, '');
  if (!/^\d{12}$/.test(nid)) errors.push(`الرقم الوطني يجب أن يكون 12 رقماً: «${get('national_id')}»`);

  const genderRaw = normalize(get('gender'));
  const gender = ['انثي', 'female', 'f'].includes(genderRaw) ? 'female' : 'male';
  const sectionRaw = normalize(get('section'));
  const section = sectionRaw.includes('حافظات') || sectionRaw === 'women' || (!sectionRaw && gender === 'female') ? 'women' : 'men';

  const matnNames = get('matns').split(/[،,;؛·|\n]+/).map((s) => s.trim()).filter(Boolean);
  const matnIds = matnNames.map((n) => byName(lookups.matns, n, 'المتن')).filter(Boolean);
  if (!matnNames.length) errors.push('المتون فارغة');

  const payload = {
    first_name: get('first_name'),
    father_name: get('father_name'),
    grandfather_name: get('grandfather_name'),
    family_name: get('family_name'),
    birth_date: birth,
    national_id: nid,
    gender,
    residence: get('residence'),
    phone: toLatinDigits(get('phone')),
    whatsapp: toLatinDigits(get('whatsapp') || get('phone')),
    email: get('email'),
    section,
    circle_name: get('circle_name'),
    center_name: get('center_name'),
    office_id: byName(lookups.offices, get('office'), 'المكتب'),
    teacher_name: get('teacher_name'),
    level_id: byName(lookups.levels, get('level'), 'المستوى'),
    matn_ids: matnIds,
    memorized_amount: get('memorized_amount'),
    verses_range: get('verses_range'),
    student_notes: get('student_notes'),
  };
  for (const f of REQUIRED.filter((x) => !['office', 'level', 'matns', 'birth_date', 'national_id'].includes(x))) {
    if (!payload[f]) errors.push(`الحقل «${COLUMNS[f][0]}» فارغ`);
  }
  return { payload, errors };
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return BOM + rows.map((r) => r.map(esc).join(',')).join(CRLF);
}
