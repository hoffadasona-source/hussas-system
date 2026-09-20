// قالب الشهادة: الحقول وإحداثياتها فوق ملف PDF (أو صورة) مرفوع من الإعدادات.
// الإحداثيات نسبة مئوية من عرض القالب وارتفاعه، فلا تتأثر بحجم الشاشة أو دقة الطباعة.
import { appUrl, fmtDate, fmtScore } from './format';

export const verifyUrl = (certNo) => appUrl(`certificate-verification?no=${encodeURIComponent(certNo)}`);

/** مقاس A4 أفقي بالنقاط (pt) — يُستبدل بمقاس القالب المرفوع عند رفعه */
export const DEFAULT_PAGE = { w: 842, h: 595 };

/** حقول الشهادة القابلة للطباعة فوق القالب */
export const CERT_FIELDS = [
  { key: 'student_name', label: 'اسم الطالب', x: 50, y: 46, size: 26, weight: 700, color: '#16324F' },
  { key: 'level', label: 'المستوى', x: 50, y: 57, size: 16, weight: 500, color: '#1A211F' },
  { key: 'score', label: 'الدرجة (النسبة)', x: 38, y: 66, size: 16, weight: 600, color: '#1A211F' },
  { key: 'grade', label: 'التقدير', x: 62, y: 66, size: 16, weight: 600, color: '#1A211F' },
  { key: 'cert_no', label: 'رقم الشهادة', x: 18, y: 88, size: 11, weight: 500, color: '#5C6663' },
  { key: 'issued_at', label: 'تاريخ الإصدار', x: 18, y: 93, size: 11, weight: 400, color: '#5C6663' },
  { key: 'org_name', label: 'اسم الجهة', x: 50, y: 18, size: 14, weight: 500, color: '#5C6663', show: false },
  { key: 'cert_title', label: 'عنوان الشهادة', x: 50, y: 30, size: 20, weight: 700, color: '#16324F', show: false },
  { key: 'signer_name', label: 'اسم الموقّع', x: 82, y: 88, size: 12, weight: 600, color: '#1A211F' },
  { key: 'signer_title', label: 'صفة الموقّع', x: 82, y: 93, size: 11, weight: 400, color: '#5C6663' },
  { key: 'qr', label: 'رمز التحقق QR', x: 50, y: 88, size: 64, weight: 400, color: '#16324F' },
];

/** التهيئة الافتراضية لتوزيع الحقول */
export function defaultLayout(page = DEFAULT_PAGE) {
  return {
    page: { ...page },
    fields: Object.fromEntries(CERT_FIELDS.map((f) => [f.key, {
      x: f.x, y: f.y, size: f.size, weight: f.weight, color: f.color, show: f.show !== false,
    }])),
  };
}

/** دمج الإعداد المحفوظ مع الافتراضي، حتى لا ينكسر العرض عند إضافة حقول جديدة */
export function mergeLayout(config) {
  const base = defaultLayout(config?.page?.w && config?.page?.h ? config.page : DEFAULT_PAGE);
  const saved = config?.fields || {};
  for (const key of Object.keys(base.fields)) {
    base.fields[key] = { ...base.fields[key], ...(saved[key] || {}) };
  }
  return base;
}

/** قيمة الحقل كما تُطبع */
export function certFieldValue(key, cert, settings) {
  switch (key) {
    case 'student_name': return cert?.student_name || '';
    case 'level': return cert?.level_name || '';
    case 'score': return cert?.score === null || cert?.score === undefined ? '' : `${fmtScore(cert.score)}%`;
    case 'grade': return cert?.grade || '';
    case 'cert_no': return cert?.cert_no || '';
    case 'issued_at': return fmtDate(cert?.issued_at);
    case 'org_name': return settings?.org_name || '';
    case 'cert_title': return settings?.cert_title || '';
    case 'signer_name': return settings?.cert_signer_name || '';
    case 'signer_title': return settings?.cert_signer_title || '';
    default: return '';
  }
}

/** شهادة تجريبية لمعاينة القالب في الإعدادات */
export const SAMPLE_CERT = {
  cert_no: 'CERT-2026-00001',
  student_name: 'محمد أحمد عبدالله الشريف',
  level_name: 'المستوى الأول',
  score: 92.5,
  grade: 'ممتاز',
  issued_at: new Date().toISOString(),
  status: 'valid',
};

export const isPdfUrl = (url) => /\.pdf(\?|#|$)/i.test(String(url || ''));

/**
 * يحوّل ملف القالب إلى صورة قابلة للعرض والطباعة:
 * - PDF: تُرسم الصفحة الأولى عبر pdf.js (تحميل عند الحاجة فقط).
 * - صورة: تُستعمل كما هي.
 * يعيد { src, page: { w, h } } بمقاس الصفحة بالنقاط.
 */
export async function loadTemplateImage(url, { scale = 2 } = {}) {
  if (!url) return null;
  if (!isPdfUrl(url)) {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذّر تحميل صورة القالب'));
      el.src = url;
    });
    return { src: url, page: { w: Math.round(img.naturalWidth * 0.75), h: Math.round(img.naturalHeight * 0.75) } };
  }

  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
  const pdfPage = await doc.getPage(1);
  const base = pdfPage.getViewport({ scale: 1 });
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
  const src = canvas.toDataURL('image/png');
  doc.destroy();
  return { src, page: { w: Math.round(base.width), h: Math.round(base.height) } };
}
