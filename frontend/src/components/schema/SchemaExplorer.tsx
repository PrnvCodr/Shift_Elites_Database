import { useEffect, useState } from 'react';
import { useSchemaStore, useQueryStore } from '../../stores';
import { Database, Table2, Key, Hash, ChevronRight, ChevronDown, Columns3, RefreshCw, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function SchemaExplorer() {
  const { tables, isLoading, fetchSchema, selectedTable, setSelectedTable } = useSchemaStore();
  const { updateSql, activeTabId } = useQueryStore();
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => { fetchSchema(); }, []);

  const toggleTable = (name: string) => {
    const newSet = new Set(expandedTables);
    if (newSet.has(name)) newSet.delete(name);
    else newSet.add(name);
    setExpandedTables(newSet);
  };

  const handleTableClick = (tableName: string) => {
    setSelectedTable(tableName);
    toggleTable(tableName);
  };

  const handleInsertSelect = (tableName: string) => {
    updateSql(activeTabId, `SELECT * FROM ${tableName} LIMIT 100;`);
  };

  const filteredTables = tables.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.columns?.some(c => c.name.toLowerCase().includes(search.toLowerCase()))
  );

  const getTypeIcon = (type: string) => {
    const upper = type.toUpperCase();
    if (upper.includes('INT')) return '123';
    if (upper.includes('FLOAT') || upper.includes('DOUBLE')) return '1.2';
    if (upper.includes('VARCHAR') || upper.includes('TEXT')) return 'Abc';
    if (upper.includes('BOOL')) return '⊘';
    if (upper.includes('DATE') || upper.includes('TIME')) return '📅';
    return '?';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px 8px',
        borderBottom: '1px solid var(--border-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} className="gradient-text" style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Schema Explorer</span>
          </div>
          <button
            className="btn-ghost btn-icon"
            onClick={() => fetchSchema()}
            title="Refresh schema"
          >
            <RefreshCw size={13} style={{ opacity: isLoading ? 1 : 0.5 }} />
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{
            position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            className="input"
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '28px', fontSize: '0.78rem' }}
          />
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px' }}>
        {isLoading && !tables.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton" style={{ height: '24px', width: `${60 + i * 10}%` }} />
            ))}
          </div>
        ) : (
          <AnimatePresence>
            {filteredTables.map((table) => (
              <motion.div
                key={table.name}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Table name */}
                <div
                  className={`tree-item ${selectedTable === table.name ? 'active' : ''}`}
                  onClick={() => handleTableClick(table.name)}
                  onDoubleClick={() => handleInsertSelect(table.name)}
                >
                  {expandedTables.has(table.name) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <Table2 size={13} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ flex: 1 }}>{table.name}</span>
                  {table.rowCount !== undefined && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: '4px' }}>
                      {table.rowCount}
                    </span>
                  )}
                </div>

                {/* Columns */}
                <AnimatePresence>
                  {expandedTables.has(table.name) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ paddingLeft: '20px' }}>
                        {/* Columns section */}
                        <div style={{
                          fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          padding: '6px 10px 2px', display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                          <Columns3 size={10} /> Columns
                        </div>
                        {table.columns?.map((col, i) => (
                          <div
                            key={i}
                            className="tree-item"
                            style={{ paddingLeft: '12px', fontSize: '0.78rem' }}
                          >
                            {col.primaryKey ? (
                              <Key size={11} style={{ color: '#fbbf24' }} />
                            ) : (
                              <span style={{
                                fontSize: '0.6rem', fontFamily: 'var(--font-code)',
                                color: 'var(--text-muted)', width: '24px', textAlign: 'center',
                              }}>
                                {getTypeIcon(col.type)}
                              </span>
                            )}
                            <span style={{ flex: 1 }}>{col.name}</span>
                            <span style={{
                              fontSize: '0.65rem', fontFamily: 'var(--font-code)',
                              color: 'var(--text-muted)', opacity: 0.7,
                            }}>
                              {col.type}{col.maxLength ? `(${col.maxLength})` : ''}
                            </span>
                          </div>
                        ))}

                        {/* Indexes */}
                        {table.indexes && table.indexes.length > 0 && (
                          <>
                            <div style={{
                              fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              padding: '6px 10px 2px', display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                              <Hash size={10} /> Indexes
                            </div>
                            {table.indexes.map((idx, i) => (
                              <div key={i} className="tree-item" style={{ paddingLeft: '12px', fontSize: '0.78rem' }}>
                                <Hash size={11} style={{ color: 'var(--info)' }} />
                                <span>{idx.name}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  ({idx.columns.join(', ')})
                                </span>
                                {idx.unique && <span className="badge badge-info" style={{ fontSize: '0.55rem', padding: '0 4px' }}>UQ</span>}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {!isLoading && filteredTables.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {search ? 'No tables match your search' : 'No tables found. Create one!'}
          </div>
        )}
      </div>
    </div>
  );
}
