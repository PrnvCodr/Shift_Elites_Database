import { useState, useCallback } from 'react';
import { useSchemaStore, useQueryStore, useUIStore } from '../../stores';
import { 
  Wand2, Plus, X, GripVertical, ArrowRight, Play, Copy,
  Table2, Columns3, Filter, ArrowUpDown, Hash, Calculator
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type JoinType = 'INNER' | 'LEFT' | 'RIGHT';
type AggFunc = '' | 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

interface SelectedColumn {
  table: string;
  column: string;
  alias: string;
  aggregate: AggFunc;
}

interface WhereCondition {
  table: string;
  column: string;
  operator: string;
  value: string;
}

interface JoinClause {
  type: JoinType;
  table: string;
  leftCol: string;
  rightCol: string;
}

interface SortColumn {
  table: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

export function VisualQueryBuilder() {
  const { tables } = useSchemaStore();
  const { updateSql, activeTabId } = useQueryStore();
  const { setView } = useUIStore();

  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([]);
  const [joins, setJoins] = useState<JoinClause[]>([]);
  const [conditions, setConditions] = useState<WhereCondition[]>([]);
  const [orderBy, setOrderBy] = useState<SortColumn[]>([]);
  const [groupByColumns, setGroupByColumns] = useState<string[]>([]);
  const [limit, setLimit] = useState('');
  const [distinct, setDistinct] = useState(false);

  const addTable = (name: string) => {
    if (!selectedTables.includes(name)) {
      setSelectedTables([...selectedTables, name]);
    }
  };

  const removeTable = (name: string) => {
    setSelectedTables(selectedTables.filter(t => t !== name));
    setSelectedColumns(selectedColumns.filter(c => c.table !== name));
    setJoins(joins.filter(j => j.table !== name));
    setConditions(conditions.filter(c => c.table !== name));
  };

  const addColumn = (table: string, column: string) => {
    if (!selectedColumns.some(c => c.table === table && c.column === column)) {
      setSelectedColumns([...selectedColumns, { table, column, alias: '', aggregate: '' }]);
    }
  };

  const removeColumn = (idx: number) => {
    setSelectedColumns(selectedColumns.filter((_, i) => i !== idx));
  };

  const updateColumn = (idx: number, updates: Partial<SelectedColumn>) => {
    setSelectedColumns(selectedColumns.map((c, i) => i === idx ? { ...c, ...updates } : c));
  };

  const addJoin = () => {
    if (selectedTables.length < 2) return;
    setJoins([...joins, { type: 'INNER', table: selectedTables[1] || '', leftCol: '', rightCol: '' }]);
  };

  const addCondition = () => {
    if (selectedTables.length === 0) return;
    setConditions([...conditions, { table: selectedTables[0], column: '', operator: '=', value: '' }]);
  };

  const addSort = () => {
    if (selectedColumns.length === 0) return;
    const first = selectedColumns[0];
    setOrderBy([...orderBy, { table: first.table, column: first.column, direction: 'ASC' }]);
  };

  const getColumnsForTable = (tableName: string) => {
    return tables.find(t => t.name === tableName)?.columns || [];
  };

  const generateSQL = useCallback(() => {
    if (selectedTables.length === 0) return '';

    let sql = 'SELECT ';
    if (distinct) sql += 'DISTINCT ';

    // Columns
    if (selectedColumns.length === 0) {
      sql += '*';
    } else {
      sql += selectedColumns.map(c => {
        let col = selectedTables.length > 1 ? `${c.table}.${c.column}` : c.column;
        if (c.aggregate) col = `${c.aggregate}(${col})`;
        if (c.alias) col += ` AS ${c.alias}`;
        return col;
      }).join(', ');
    }

    // FROM
    sql += `\nFROM ${selectedTables[0]}`;

    // JOINs
    for (const j of joins) {
      sql += `\n${j.type} JOIN ${j.table} ON ${selectedTables[0]}.${j.leftCol} = ${j.table}.${j.rightCol}`;
    }

    // WHERE
    if (conditions.length > 0) {
      const validConditions = conditions.filter(c => c.column && c.value);
      if (validConditions.length > 0) {
        sql += '\nWHERE ' + validConditions.map(c => {
          const col = selectedTables.length > 1 ? `${c.table}.${c.column}` : c.column;
          if (c.operator === 'LIKE') return `${col} LIKE '${c.value}'`;
          if (c.operator === 'IN') return `${col} IN (${c.value})`;
          if (c.operator === 'IS NULL') return `${col} IS NULL`;
          if (c.operator === 'IS NOT NULL') return `${col} IS NOT NULL`;
          const needsQuote = isNaN(Number(c.value));
          return `${col} ${c.operator} ${needsQuote ? `'${c.value}'` : c.value}`;
        }).join('\n  AND ');
      }
    }

    // GROUP BY
    if (groupByColumns.length > 0) {
      sql += '\nGROUP BY ' + groupByColumns.join(', ');
    }

    // ORDER BY
    if (orderBy.length > 0) {
      sql += '\nORDER BY ' + orderBy.map(s => {
        const col = selectedTables.length > 1 ? `${s.table}.${s.column}` : s.column;
        return `${col} ${s.direction}`;
      }).join(', ');
    }

    // LIMIT
    if (limit) sql += `\nLIMIT ${limit}`;

    sql += ';';
    return sql;
  }, [selectedTables, selectedColumns, joins, conditions, orderBy, groupByColumns, limit, distinct]);

  const handleExecute = () => {
    const sql = generateSQL();
    if (sql) {
      updateSql(activeTabId, sql);
      setView('editor');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateSQL());
  };

  const operators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL'];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left Panel — Builder */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', borderRight: '1px solid var(--border-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Wand2 size={18} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ fontWeight: 700, fontSize: '1.1rem' }}>Visual Query Builder</h2>
        </div>

        {/* Tables */}
        <Section title="Tables" icon={<Table2 size={14} />}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {selectedTables.map(t => (
              <motion.span
                key={t}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="badge badge-info"
                style={{ cursor: 'pointer', padding: '3px 8px' }}
                onClick={() => removeTable(t)}
              >
                {t} <X size={10} />
              </motion.span>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {tables.filter(t => !selectedTables.includes(t.name)).map(t => (
              <button
                key={t.name}
                className="btn btn-ghost"
                style={{ fontSize: '0.72rem' }}
                onClick={() => addTable(t.name)}
              >
                <Plus size={10} /> {t.name}
              </button>
            ))}
          </div>
        </Section>

        {/* Columns */}
        {selectedTables.length > 0 && (
          <Section title="Columns" icon={<Columns3 size={14} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {selectedColumns.map((col, i) => (
                <motion.div
                  key={i}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 8px', background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
                  }}
                >
                  <GripVertical size={12} style={{ color: 'var(--text-muted)' }} />
                  <select
                    value={col.aggregate}
                    onChange={(e) => updateColumn(i, { aggregate: e.target.value as AggFunc })}
                    className="input"
                    style={{ width: '80px', padding: '2px 4px', fontSize: '0.7rem' }}
                  >
                    <option value="">None</option>
                    <option value="COUNT">COUNT</option>
                    <option value="SUM">SUM</option>
                    <option value="AVG">AVG</option>
                    <option value="MIN">MIN</option>
                    <option value="MAX">MAX</option>
                  </select>
                  <span style={{ fontFamily: 'var(--font-code)', color: 'var(--text-accent)' }}>
                    {col.table}.{col.column}
                  </span>
                  <input
                    className="input"
                    placeholder="alias"
                    value={col.alias}
                    onChange={(e) => updateColumn(i, { alias: e.target.value })}
                    style={{ width: '80px', padding: '2px 6px', fontSize: '0.7rem' }}
                  />
                  <button className="btn btn-ghost btn-icon" onClick={() => removeColumn(i)}>
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {selectedTables.map(tableName =>
                getColumnsForTable(tableName).map((col: any) => (
                  <button
                    key={`${tableName}.${col.name}`}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.68rem' }}
                    onClick={() => addColumn(tableName, col.name)}
                    disabled={selectedColumns.some(c => c.table === tableName && c.column === col.name)}
                  >
                    <Plus size={8} /> {selectedTables.length > 1 ? `${tableName}.` : ''}{col.name}
                  </button>
                ))
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={distinct} onChange={(e) => setDistinct(e.target.checked)} />
              DISTINCT
            </label>
          </Section>
        )}

        {/* JOINs */}
        {selectedTables.length >= 2 && (
          <Section title="Joins" icon={<ArrowRight size={14} />}>
            {joins.map((join, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
                background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '4px', flexWrap: 'wrap',
              }}>
                <select className="input" value={join.type} style={{ width: '90px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setJoins(joins.map((j, idx) => idx === i ? { ...j, type: e.target.value as JoinType } : j))}>
                  <option value="INNER">INNER</option>
                  <option value="LEFT">LEFT</option>
                  <option value="RIGHT">RIGHT</option>
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>JOIN</span>
                <select className="input" value={join.table} style={{ width: '100px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setJoins(joins.map((j, idx) => idx === i ? { ...j, table: e.target.value } : j))}>
                  {selectedTables.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ON</span>
                <select className="input" value={join.leftCol} style={{ width: '100px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setJoins(joins.map((j, idx) => idx === i ? { ...j, leftCol: e.target.value } : j))}>
                  <option value="">—</option>
                  {getColumnsForTable(selectedTables[0]).map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <span>=</span>
                <select className="input" value={join.rightCol} style={{ width: '100px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setJoins(joins.map((j, idx) => idx === i ? { ...j, rightCol: e.target.value } : j))}>
                  <option value="">—</option>
                  {getColumnsForTable(join.table).map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <button className="btn btn-ghost btn-icon" onClick={() => setJoins(joins.filter((_, idx) => idx !== i))}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={addJoin}>
              <Plus size={12} /> Add Join
            </button>
          </Section>
        )}

        {/* WHERE */}
        {selectedTables.length > 0 && (
          <Section title="Filters" icon={<Filter size={14} />}>
            {conditions.map((cond, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
                background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '4px', flexWrap: 'wrap',
              }}>
                <select className="input" value={cond.table} style={{ width: '100px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, table: e.target.value, column: '' } : c))}>
                  {selectedTables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="input" value={cond.column} style={{ width: '100px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, column: e.target.value } : c))}>
                  <option value="">—</option>
                  {getColumnsForTable(cond.table).map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <select className="input" value={cond.operator} style={{ width: '100px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, operator: e.target.value } : c))}>
                  {operators.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
                {!['IS NULL', 'IS NOT NULL'].includes(cond.operator) && (
                  <input className="input" placeholder="value..." value={cond.value}
                    style={{ width: '100px', padding: '2px 6px', fontSize: '0.72rem' }}
                    onChange={(e) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, value: e.target.value } : c))} />
                )}
                <button className="btn btn-ghost btn-icon" onClick={() => setConditions(conditions.filter((_, idx) => idx !== i))}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={addCondition}>
              <Plus size={12} /> Add Filter
            </button>
          </Section>
        )}

        {/* ORDER BY */}
        {selectedColumns.length > 0 && (
          <Section title="Sort" icon={<ArrowUpDown size={14} />}>
            {orderBy.map((sort, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
                background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '4px',
              }}>
                <select className="input" value={`${sort.table}.${sort.column}`} style={{ width: '160px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => {
                    const [t, c] = e.target.value.split('.');
                    setOrderBy(orderBy.map((s, idx) => idx === i ? { ...s, table: t, column: c } : s));
                  }}>
                  {selectedColumns.map(c => <option key={`${c.table}.${c.column}`} value={`${c.table}.${c.column}`}>{c.table}.{c.column}</option>)}
                </select>
                <select className="input" value={sort.direction} style={{ width: '70px', padding: '2px 4px', fontSize: '0.72rem' }}
                  onChange={(e) => setOrderBy(orderBy.map((s, idx) => idx === i ? { ...s, direction: e.target.value as 'ASC' | 'DESC' } : s))}>
                  <option value="ASC">ASC</option>
                  <option value="DESC">DESC</option>
                </select>
                <button className="btn btn-ghost btn-icon" onClick={() => setOrderBy(orderBy.filter((_, idx) => idx !== i))}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={addSort}>
              <Plus size={12} /> Add Sort
            </button>
          </Section>
        )}

        {/* LIMIT */}
        {selectedTables.length > 0 && (
          <Section title="Limit" icon={<Hash size={14} />}>
            <input
              className="input"
              type="number"
              placeholder="e.g. 100"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ width: '120px', fontSize: '0.78rem' }}
            />
          </Section>
        )}
      </div>

      {/* Right Panel — Preview */}
      <div style={{ width: '380px', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Generated SQL</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-ghost" onClick={handleCopy} style={{ fontSize: '0.72rem' }}>
              <Copy size={12} /> Copy
            </button>
            <button className="btn btn-primary" onClick={handleExecute} style={{ fontSize: '0.72rem' }}>
              <Play size={12} /> Execute
            </button>
          </div>
        </div>
        <div style={{
          flex: 1,
          padding: '16px',
          fontFamily: 'var(--font-code)',
          fontSize: '0.78rem',
          lineHeight: 1.7,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'auto',
        }}>
          {generateSQL() || (
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              Select tables and columns to build your query...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
        fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}
