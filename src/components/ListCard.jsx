import { useState } from 'react';
import { Empty, ErrorBox, Pager, SearchInput, Select, Skeleton } from './ui';
import { Icon } from './icons';
import { useUi } from '../context/UiContext';
import { downloadCsv, errorMessage } from '../lib/helpers';
import { todayISO } from '../lib/format';

/**
 * بطاقة قائمة موحّدة: بحث + مرشحات + جدول + ترقيم صفحات + تصدير CSV.
 * list: ناتج usePagedList
 * columns: [{ label, render(row), className }]
 * filters: [{ value, onChange, options, placeholder }]
 */
export default function ListCard({
  list, columns, filters = [], searchPlaceholder, onRowClick, emptyTitle = 'لا توجد سجلات',
  emptyText = 'لا توجد بيانات مطابقة للبحث أو المرشحات الحالية.', exportName, exportColumns, header, toolbarExtra,
}) {
  const { toast } = useUi();
  const [exporting, setExporting] = useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      const rows = await list.fetchAll();
      downloadCsv(`${exportName}-${todayISO()}`, exportColumns, rows);
      toast(`صُدِّر ${rows.length} سجل`);
    } catch (err) {
      toast(errorMessage(err), 'err');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card">
      {header}
      <div className="toolbar">
        {searchPlaceholder && <SearchInput value={list.search} onChange={list.setSearch} placeholder={searchPlaceholder} />}
        {filters.map((f, i) => (
          <Select key={i} className="inp w" value={f.value} onChange={f.onChange} options={f.options} placeholder={f.placeholder} />
        ))}
        {toolbarExtra}
        {list.isFetching && !list.isLoading && <span className="spinner" style={{ color: 'var(--text-3)' }} />}
        {exportColumns && (
          <button className="btn ghost sm" onClick={doExport} disabled={exporting || !list.count}>
            {exporting ? <span className="spinner" /> : <Icon.download />} تصدير
          </button>
        )}
      </div>
      {list.error && <div className="card-b"><ErrorBox error={errorMessage(list.error)} onRetry={list.refetch} /></div>}
      {list.isLoading ? (
        <Skeleton lines={5} />
      ) : list.rows.length === 0 && !list.error ? (
        <Empty title={emptyTitle} text={emptyText} />
      ) : (
        <div className="tbl-wrap cards">
          <table className="tbl">
            <thead>
              <tr>{columns.map((c, i) => <th key={i}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map((c, i) => <td key={i} className={c.className} data-label={typeof c.label === 'string' ? c.label : ''}>{c.render(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
    </div>
  );
}

/** يوقف انتشار النقر حتى لا يُفتح صف الجدول عند الضغط على زر داخله */
export const stop = (fn) => (e) => {
  e.stopPropagation();
  fn();
};
