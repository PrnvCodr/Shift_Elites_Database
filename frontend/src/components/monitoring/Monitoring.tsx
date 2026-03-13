import { useEffect, useState } from 'react';
import { useStatsStore } from '../../stores';
import { Activity, Database, Zap, HardDrive, TrendingUp, Clock, AlertTriangle, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#6d28d9', '#4f46e5'];

export function Monitoring() {
  const { stats, history, fetchStats, fetchHistory } = useStatsStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchHistory();
    const interval = setInterval(() => { fetchStats(); fetchHistory(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchHistory()]);
    setRefreshing(false);
  };

  // Build query performance data from history
  const perfData = history.slice(0, 20).map((h, i) => ({
    name: `Q${history.length - i}`,
    time: Math.round(h.executionTimeMs * 100) / 100,
    success: h.success ? 1 : 0,
  })).reverse();

  // Buffer pool data
  const bufferPoolData = stats ? [
    { name: 'Hits', value: stats.bufferPool.hits, color: '#10b981' },
    { name: 'Misses', value: stats.bufferPool.misses, color: '#ef4444' },
  ] : [];

  // Table sizes
  const tableData = stats?.tables?.map(t => ({
    name: t.name,
    rows: t.rowCount || 0,
    indexes: t.indexes || 0,
  })) || [];

  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass"
      style={{
        padding: '16px 20px',
        borderRadius: 'var(--radius-md)',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}
    >
      <div style={{
        width: '40px', height: '40px', borderRadius: 'var(--radius-sm)',
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </motion.div>
  );

  return (
    <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} style={{ color: 'var(--accent-primary)' }} />
            Performance Monitor
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Real-time database metrics and query analytics
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleRefresh}>
          <TrendingUp size={14} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard
          icon={Database}
          label="Tables"
          value={stats?.tables?.length || 0}
          sub={`${stats?.tables?.reduce((sum, t) => sum + (t.rowCount || 0), 0) || 0} total rows`}
          color="#6366f1"
        />
        <StatCard
          icon={HardDrive}
          label="Buffer Pool"
          value={stats?.bufferPool?.size || 0}
          sub={`${((stats?.bufferPool?.hitRate || 0) * 100).toFixed(1)}% hit rate`}
          color="#10b981"
        />
        <StatCard
          icon={Zap}
          label="Queries"
          value={stats?.queryHistory?.total || 0}
          sub={`${stats?.queryHistory?.slowQueries || 0} slow queries`}
          color="#f59e0b"
        />
        <StatCard
          icon={Clock}
          label="Avg Response"
          value={history.length > 0 ? `${(history.reduce((sum, h) => sum + h.executionTimeMs, 0) / history.length).toFixed(1)}ms` : '0ms'}
          sub="Last 100 queries"
          color="#8b5cf6"
        />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Query Performance Timeline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass"
          style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}
        >
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart3 size={14} /> Query Execution Time
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={perfData}>
              <defs>
                <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                }}
              />
              <Area type="monotone" dataKey="time" stroke="#6366f1" fill="url(#colorTime)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Buffer Pool */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass"
          style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}
        >
          <h3 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HardDrive size={14} /> Buffer Pool
          </h3>
          {bufferPoolData.length > 0 && (bufferPoolData[0].value > 0 || bufferPoolData[1].value > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={bufferPoolData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {bufferPoolData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No buffer pool activity yet
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.72rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> Hits
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} /> Misses
            </span>
          </div>
        </motion.div>
      </div>

      {/* Table Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass"
        style={{ padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}
      >
        <h3 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Database size={14} /> Table Statistics
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={tableData}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
              }}
            />
            <Bar dataKey="rows" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Recent Queries */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass"
        style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}
      >
        <h3 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={14} /> Recent Queries
        </h3>
        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
          {history.slice(0, 20).map((h, i) => (
            <div
              key={i}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: i % 2 === 0 ? 'transparent' : 'var(--bg-tertiary)',
              }}
            >
              <div className={h.success ? 'badge badge-success' : 'badge badge-error'} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>
                {h.success ? 'OK' : 'ERR'}
              </div>
              <span style={{
                flex: 1, fontFamily: 'var(--font-code)', fontSize: '0.72rem',
                color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {h.sql}
              </span>
              <span style={{
                fontSize: '0.68rem', color: h.executionTimeMs > 100 ? 'var(--warning)' : 'var(--text-muted)',
                fontFamily: 'var(--font-code)',
              }}>
                {h.executionTimeMs.toFixed(1)}ms
              </span>
            </div>
          ))}
          {history.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No queries executed yet
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
