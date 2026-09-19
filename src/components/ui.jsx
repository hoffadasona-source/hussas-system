import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export function Badge({ kind = '', children, plain }) {
  return <span className={`badge ${kind} ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ map, value }) {
  const s = map[value] || { t: value || '—', c: '' };
  return <span className={`badge ${s.c}`}>{s.t}</span>;
}

export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon.list /></div>
      <h4>{title}</h4>
      {text && <p className="small" style={{ maxWidth: '46ch', margin: '0 auto 14px' }}>{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="card-b">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`sk ${i ? 'mt-s' : ''}`} style={{ width: `${[40, 70, 55, 62, 48][i % 5]}%` }} />
      ))}
    </div>
  );
}

export function Loading({ label = 'جارٍ التحميل…' }) {
  return (
    <div className="page-loading">
      <div className="row"><span className="spinner" /> <span>{label}</span></div>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert err row" style={{ justifyContent: 'space-between' }}>
      <span>{typeof error === 'string' ? error : error.message}</span>
      {onRetry && <button className="btn ghost sm" onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function Stat({ label, value, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="bar" />
      <div className="lbl">{label}</div>
      <div className="v">{value ?? '—'}</div>
    </div>
  );
}

export function Field({ label, required, hint, error, className = '', children }) {
  return (
    <label className={`f ${error ? 'invalid' : ''} ${className}`}>
      <span>{label} {required && <b>*</b>}</span>
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err-msg">{error}</div>}
    </label>
  );
}

export function Kv({ items }) {
  return (
    <dl className="kv">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''}
          onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="search">
      <Icon.search />
      <input className="inp" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Pager({ page, pageSize, count, onPage }) {
  const pages = Math.max(1, Math.ceil((count || 0) / pageSize));
  if (!count) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  const around = [page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages);
  return (
    <div className="pager">
      <span>عرض {from}–{to} من {count} سجل</span>
      {pages > 1 && (
        <div className="pgs">
          <button className="pg" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</button>
          {around.map((p) => (
            <button key={p} className={`pg ${p === page ? 'on' : ''}`} onClick={() => onPage(p)}>{p}</button>
          ))}
          <button className="pg" disabled={page >= pages} onClick={() => onPage(page + 1)}>التالي</button>
        </div>
      )}
    </div>
  );
}

export function Modal({ open = true, title, onClose, wide, footer, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="mh">
          <h3 className="kufi">{title}</h3>
          {onClose && <button className="x" onClick={onClose} aria-label="إغلاق">✕</button>}
        </div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="page-h spread">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className = 'inp', ...rest }) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export const mapOptions = (map) => Object.entries(map).map(([value, v]) => ({ value, label: v.t ?? v }));
export const rowsOptions = (rows = [], label = 'name') => rows.map((r) => ({ value: r.id, label: r[label] }));
