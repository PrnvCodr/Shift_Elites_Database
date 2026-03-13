import { useEffect, useState } from 'react';
import { useStatsStore, useQueryStore, useUIStore } from '../../stores';
import { Clock, Search, Play, CheckCircle2, XCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function QueryHistory() {
  const { history, fetchHistory } = useStatsStore();
  const { updateSql, activeTabId } = useQueryStore();
  const { setView } = useUIStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

  useEffect(() => { fetchHistory(); }, []);

  const filtered = history.filter(h => {
    if (filter === 'success' && !h.success) return false;
    if (filter === 'error' && h.success) return false;
    if (search && !h.sql.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleReplay = (sql: string) => {
    updateSql(activeTabId, sql);
    setView('editor');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>
          <Clock size={18} style={{ color: 'var(--accent-primary)' }} />
          Query History
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input"
              placeholder="Search queries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'success', 'error'] as const).map(f => (
              <button
                key={f}
                className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}
                style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {filtered.map((h, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="glass"
            style={{
              padding: '12px 16px', marginBottom: '6px', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', transition: 'all var(--transition-fast)',
            }}
            onClick={() => handleReplay(h.sql)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {h.success ? (
                <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
              ) : (
                <XCircle size={14} style={{ color: 'var(--error)', flexShrink: 0 }} />
              )}
              <code style={{
                flex: 1, fontFamily: 'var(--font-code)', fontSize: '0.78rem',
                color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {h.sql}
              </code>
              <span style={{
                fontSize: '0.68rem', fontFamily: 'var(--font-code)',
                color: h.executionTimeMs > 100 ? 'var(--warning)' : 'var(--text-muted)',
                flexShrink: 0,
              }}>
                {h.executionTimeMs.toFixed(1)}ms
              </span>
              <button
                className="btn btn-ghost btn-icon"
                onClick={(e) => { e.stopPropagation(); handleReplay(h.sql); }}
                title="Replay query"
              >
                <Play size={12} />
              </button>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <AlertTriangle size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <div style={{ fontSize: '0.85rem' }}>
              {search ? 'No queries match your search' : 'No query history yet'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
