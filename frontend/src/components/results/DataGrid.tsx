import { useMemo, useState } from 'react';
import { useQueryStore } from '../../stores';
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export function DataGrid() {
  const { tabs, activeTabId } = useQueryStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const result = activeTab?.result;

  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const pageSize = 50;

  const columns = result?.columns || [];
  const rawRows = result?.rows || [];

  const sortedRows = useMemo(() => {
    if (sortCol === null) return rawRows;
    return [...rawRows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [rawRows, sortCol, sortAsc]);

  const pagedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sortedRows.length / pageSize);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) setSortAsc(!sortAsc);
    else { setSortCol(colIdx); setSortAsc(true); }
  };

  const handleCopy = (value: any, key: string) => {
    navigator.clipboard.writeText(String(value ?? 'NULL'));
    setCopiedCell(key);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleExportCSV = () => {
    if (!columns.length) return;
    const header = columns.map(c => c.name).join(',');
    const rows = sortedRows.map(r => r.map(v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!columns.length) return;
    const data = sortedRows.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => { obj[col.name] = row[i]; });
      return obj;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_result_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!result) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: '8px',
      }}>
        <div style={{ fontSize: '2rem', opacity: 0.3 }}>⌘</div>
        <div style={{ fontSize: '0.85rem' }}>Execute a query to see results</div>
        <div style={{ fontSize: '0.72rem', opacity: 0.6 }}>Press Ctrl+Enter in the editor</div>
      </div>
    );
  }

  if (!result.success) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px',
        }}
      >
        <div className="badge badge-error" style={{ alignSelf: 'flex-start' }}>Error</div>
        <div style={{
          fontFamily: 'var(--font-code)', fontSize: '0.82rem',
          color: '#f87171', padding: '12px', background: 'rgba(239, 68, 68, 0.08)',
          borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.15)',
        }}>
          {result.message}
        </div>
      </motion.div>
    );
  }

  if (!columns.length) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <div className="badge badge-success" style={{ alignSelf: 'flex-start' }}>Success</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{result.message}</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', borderBottom: '1px solid var(--border-secondary)',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {sortedRows.length} row{sortedRows.length !== 1 ? 's' : ''} × {columns.length} column{columns.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={handleExportCSV}>
            <Download size={12} /> CSV
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={handleExportJSON}>
            <Download size={12} /> JSON
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="data-grid-cell data-grid-header" style={{ width: '40px', textAlign: 'center' }}>#</th>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="data-grid-cell data-grid-header"
                  onClick={() => handleSort(i)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{col.name}</span>
                    <ArrowUpDown size={10} style={{ opacity: sortCol === i ? 1 : 0.3 }} />
                    <span style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 400 }}>{col.type}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, ri) => (
              <tr key={ri} style={{ transition: 'background var(--transition-fast)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td className="data-grid-cell" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                  {page * pageSize + ri + 1}
                </td>
                {row.map((val: any, ci: number) => {
                  const cellKey = `${ri}-${ci}`;
                  return (
                    <td
                      key={ci}
                      className="data-grid-cell"
                      onDoubleClick={() => handleCopy(val, cellKey)}
                      style={{
                        color: val === null || val === undefined ? 'var(--text-muted)' : 'var(--text-primary)',
                        fontStyle: val === null || val === undefined ? 'italic' : 'normal',
                        maxWidth: '300px',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {val === null || val === undefined ? 'NULL' : String(val)}
                        </span>
                        {copiedCell === cellKey && (
                          <Check size={10} color="var(--success)" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          padding: '8px', borderTop: '1px solid var(--border-secondary)',
          background: 'var(--bg-secondary)',
        }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
