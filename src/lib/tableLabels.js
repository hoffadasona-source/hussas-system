/**
 * على الشاشات الصغيرة يتحول كل جدول داخل .tbl-wrap.cards إلى بطاقات،
 * وتظهر عناوين الأعمدة أمام القيم عبر خاصية data-label.
 * تنسخ هذه الدالة عناوين thead إلى خلايا الصفوف تلقائياً، فلا يحتاج أي جدول جديد إعداداً يدوياً.
 */
export function initTableLabels() {
  const sync = () => {
    for (const table of document.querySelectorAll('.tbl-wrap.cards table')) {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      if (!heads.length) continue;
      for (const tr of table.querySelectorAll('tbody tr')) {
        [...tr.children].forEach((td, i) => {
          const label = heads[i] || '';
          if (td.dataset.label !== label) td.dataset.label = label; // تغيير السمات لا يُشغّل المراقب
        });
      }
    }
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { // مؤقّت لا إطار رسم: يعمل حتى لو كانت الصفحة في الخلفية
      scheduled = false;
      sync();
    }, 40);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
}
