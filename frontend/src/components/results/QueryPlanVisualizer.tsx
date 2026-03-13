import { useQueryStore } from '../../stores';
import { motion } from 'framer-motion';
import { GitBranch, Clock, Database, Filter, ArrowUpDown, Layers } from 'lucide-react';

interface PlanNode {
  type: string;
  details: string;
  cost?: number;
  rows?: number;
  children?: PlanNode[];
}

function parsePlanText(planText: string): PlanNode {
  // Parse the simple text plan from executor into a tree structure
  const lines = planText.split('\n').filter(l => l.trim());
  const root: PlanNode = { type: 'Query', details: 'Query Execution', children: [] };

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-→>]+\s*/, '');
    
    if (trimmed.toLowerCase().includes('seq scan') || trimmed.toLowerCase().includes('scan')) {
      const match = trimmed.match(/(?:Seq )?Scan on (\w+)/i);
      root.children!.push({
        type: 'Sequential Scan',
        details: match ? `Table: ${match[1]}` : trimmed,
        children: [],
      });
    } else if (trimmed.toLowerCase().includes('index scan')) {
      root.children!.push({
        type: 'Index Scan',
        details: trimmed,
        children: [],
      });
    } else if (trimmed.toLowerCase().includes('join')) {
      root.children!.push({
        type: trimmed.includes('Hash') ? 'Hash Join' : trimmed.includes('Nested') ? 'Nested Loop' : 'Join',
        details: trimmed,
        children: [],
      });
    } else if (trimmed.toLowerCase().includes('filter') || trimmed.toLowerCase().includes('where')) {
      root.children!.push({
        type: 'Filter',
        details: trimmed,
        children: [],
      });
    } else if (trimmed.toLowerCase().includes('sort') || trimmed.toLowerCase().includes('order')) {
      root.children!.push({
        type: 'Sort',
        details: trimmed,
        children: [],
      });
    } else if (trimmed.toLowerCase().includes('aggregate') || trimmed.toLowerCase().includes('group')) {
      root.children!.push({
        type: 'Aggregate',
        details: trimmed,
        children: [],
      });
    } else if (trimmed.toLowerCase().includes('limit')) {
      root.children!.push({
        type: 'Limit',
        details: trimmed,
        children: [],
      });
    } else if (trimmed) {
      root.children!.push({
        type: 'Operation',
        details: trimmed,
        children: [],
      });
    }
  }

  return root;
}

function getNodeIcon(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes('scan')) return <Database size={14} />;
  if (lower.includes('filter')) return <Filter size={14} />;
  if (lower.includes('sort')) return <ArrowUpDown size={14} />;
  if (lower.includes('join')) return <GitBranch size={14} />;
  if (lower.includes('aggregate')) return <Layers size={14} />;
  return <Clock size={14} />;
}

function getNodeColor(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes('scan')) return '#6366f1';
  if (lower.includes('filter')) return '#f59e0b';
  if (lower.includes('sort')) return '#8b5cf6';
  if (lower.includes('join')) return '#10b981';
  if (lower.includes('aggregate')) return '#ec4899';
  if (lower.includes('limit')) return '#06b6d4';
  return '#64748b';
}

function PlanNodeView({ node, depth = 0, isLast = true }: { node: PlanNode; depth?: number; isLast?: boolean }) {
  const color = getNodeColor(node.type);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: depth * 0.08 }}
    >
      <div style={{ display: 'flex', marginLeft: depth * 32, marginBottom: '2px' }}>
        {/* Connector line */}
        {depth > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginRight: '6px', width: '20px' }}>
            <div style={{
              width: '14px', height: '2px', background: 'var(--border-secondary)',
              borderRadius: '1px',
            }} />
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%', background: color,
              flexShrink: 0,
            }} />
          </div>
        )}

        {/* Node card */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 14px',
            background: `${color}10`,
            borderRadius: 'var(--radius-sm)',
            borderLeft: `3px solid ${color}`,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}20`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}10`; }}
        >
          <div style={{
            width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
            background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: color, flexShrink: 0,
          }}>
            {getNodeIcon(node.type)}
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {node.type}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
              {node.details}
            </div>
          </div>
          {node.cost !== undefined && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Cost</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-code)', color }}>
                {node.cost.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {node.children?.map((child, i) => (
        <PlanNodeView
          key={i}
          node={child}
          depth={depth + 1}
          isLast={i === (node.children?.length || 0) - 1}
        />
      ))}
    </motion.div>
  );
}

export function QueryPlanVisualizer() {
  const { tabs, activeTabId } = useQueryStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const result = activeTab?.result;

  const planText = result?.queryPlan;

  if (!planText) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-muted)', gap: '12px', padding: '20px',
      }}>
        <GitBranch size={32} style={{ opacity: 0.2 }} />
        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>No Query Plan Available</div>
        <div style={{ fontSize: '0.78rem', textAlign: 'center', maxWidth: '300px' }}>
          Run an <code style={{
            fontFamily: 'var(--font-code)', background: 'var(--bg-tertiary)',
            padding: '1px 6px', borderRadius: '3px',
          }}>EXPLAIN</code> query to see the execution plan visualization.
        </div>
        <div style={{
          fontFamily: 'var(--font-code)', fontSize: '0.72rem', padding: '8px 12px',
          background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-secondary)', marginTop: '4px',
        }}>
          EXPLAIN SELECT * FROM customers;
        </div>
      </div>
    );
  }

  const planTree = parsePlanText(planText);

  return (
    <div style={{ padding: '16px', overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <GitBranch size={18} style={{ color: 'var(--accent-primary)' }} />
        <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>Query Execution Plan</h3>
      </div>

      {/* Execution time */}
      {result && (
        <div style={{
          display: 'flex', gap: '16px', marginBottom: '16px', padding: '10px 14px',
          background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
        }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Execution Time</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>
              {result.executionTimeMs.toFixed(2)}ms
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rows Returned</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-code)' }}>
              {result.rowsAffected}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
            <div className={result.success ? 'badge badge-success' : 'badge badge-error'}>
              {result.success ? 'Success' : 'Error'}
            </div>
          </div>
        </div>
      )}

      {/* Plan tree */}
      <PlanNodeView node={planTree} />

      {/* Raw plan text */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
          Raw Plan
        </div>
        <pre style={{
          fontFamily: 'var(--font-code)', fontSize: '0.72rem',
          padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
          border: '1px solid var(--border-secondary)',
        }}>
          {planText}
        </pre>
      </div>
    </div>
  );
}
