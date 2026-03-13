import { useEffect } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useUIStore, useSchemaStore } from './stores';
import { SqlEditor } from './components/editor/SqlEditor';
import { DataGrid } from './components/results/DataGrid';
import { QueryPlanVisualizer } from './components/results/QueryPlanVisualizer';
import { SchemaExplorer } from './components/schema/SchemaExplorer';
import { ERDiagram } from './components/schema/ERDiagram';
import { Monitoring } from './components/monitoring/Monitoring';
import { QueryHistory } from './components/history/QueryHistory';
import { VisualQueryBuilder } from './components/builder/VisualQueryBuilder';
import { CommandPalette } from './components/CommandPalette';
import {
  Terminal, Database, Activity, History, Moon, Sun,
  PanelLeftClose, PanelLeftOpen, Search, Layers, Share2, Wand2, GitBranch,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const { activeView, setView, theme, toggleTheme, sidebarCollapsed, toggleSidebar, toggleCommandPalette } = useUIStore();
  const { fetchSchema } = useSchemaStore();

  useEffect(() => {
    fetchSchema();
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k') { e.preventDefault(); toggleCommandPalette(); }
        if (e.key === '1') { e.preventDefault(); setView('editor'); }
        if (e.key === '2') { e.preventDefault(); setView('schema'); }
        if (e.key === '3') { e.preventDefault(); setView('monitoring'); }
        if (e.key === '4') { e.preventDefault(); setView('history'); }
        if (e.key === '5') { e.preventDefault(); setView('erdiagram'); }
        if (e.key === '6') { e.preventDefault(); setView('builder'); }
        if (e.key === 'b') { e.preventDefault(); toggleSidebar(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const navItems = [
    { id: 'editor' as const, icon: Terminal, label: 'SQL Editor', shortcut: '⌘1' },
    { id: 'schema' as const, icon: Database, label: 'Schema', shortcut: '⌘2' },
    { id: 'monitoring' as const, icon: Activity, label: 'Monitor', shortcut: '⌘3' },
    { id: 'history' as const, icon: History, label: 'History', shortcut: '⌘4' },
    { id: 'erdiagram' as const, icon: Share2, label: 'ER Diagram', shortcut: '⌘5' },
    { id: 'builder' as const, icon: Wand2, label: 'Query Builder', shortcut: '⌘6' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <motion.div
        animate={{ width: sidebarCollapsed ? '52px' : '220px' }}
        transition={{ duration: 0.2 }}
        style={{
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-secondary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: sidebarCollapsed ? '14px 8px' : '14px 16px',
          borderBottom: '1px solid var(--border-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--accent-glow)',
            flexShrink: 0,
          }}>
            <Layers size={16} color="white" />
          </div>
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em' }}>
                <span className="gradient-text">Shift_Elite</span><span style={{ color: 'var(--text-primary)' }}> DB</span>
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Database Engine
              </div>
            </motion.div>
          )}
        </div>

        {/* Quick search */}
        {!sidebarCollapsed && (
          <div style={{ padding: '8px 12px' }}>
            <button
              onClick={toggleCommandPalette}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <Search size={13} />
              <span style={{ flex: 1, textAlign: 'left' }}>Search...</span>
              <kbd style={{
                fontSize: '0.6rem',
                padding: '1px 4px',
                borderRadius: '3px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-secondary)',
              }}>⌘K</kbd>
            </button>
          </div>
        )}

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'auto' }}>
          {navItems.map(({ id, icon: Icon, label, shortcut }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              title={sidebarCollapsed ? `${label} (${shortcut})` : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: sidebarCollapsed ? '10px 12px' : '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: activeView === id ? 600 : 400,
                color: activeView === id ? 'var(--text-accent)' : 'var(--text-secondary)',
                background: activeView === id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                transition: 'all var(--transition-fast)',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={e => {
                if (activeView !== id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={e => {
                if (activeView !== id) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <Icon size={16} style={{ flexShrink: 0 }} />
              {!sidebarCollapsed && (
                <>
                  <span style={{ flex: 1 }}>{label}</span>
                  <kbd style={{
                    fontSize: '0.6rem', padding: '1px 4px', borderRadius: '3px',
                    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                    opacity: activeView === id ? 1 : 0.5,
                  }}>{shortcut}</kbd>
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{
          padding: '8px',
          borderTop: '1px solid var(--border-secondary)',
          display: 'flex',
          flexDirection: sidebarCollapsed ? 'column' : 'row',
          gap: '4px',
        }}>
          <button
            onClick={toggleTheme}
            className="btn btn-ghost btn-icon"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={toggleSidebar}
            className="btn btn-ghost btn-icon"
            title="Toggle sidebar"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          {!sidebarCollapsed && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-code)',
            }}>
              v1.0.0
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {activeView === 'editor' && (
            <motion.div
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <PanelGroup direction="vertical">
                <Panel defaultSize={50} minSize={20}>
                  <SqlEditor />
                </Panel>
                <PanelResizeHandle />
                <Panel defaultSize={50} minSize={15}>
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={70} minSize={30}>
                      <DataGrid />
                    </Panel>
                    <PanelResizeHandle />
                    <Panel defaultSize={30} minSize={15}>
                      <QueryPlanVisualizer />
                    </Panel>
                  </PanelGroup>
                </Panel>
              </PanelGroup>
            </motion.div>
          )}

          {activeView === 'schema' && (
            <motion.div
              key="schema"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <PanelGroup direction="horizontal">
                <Panel defaultSize={30} minSize={15}>
                  <SchemaExplorer />
                </Panel>
                <PanelResizeHandle />
                <Panel defaultSize={70} minSize={30}>
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={50} minSize={20}>
                      <SqlEditor />
                    </Panel>
                    <PanelResizeHandle />
                    <Panel defaultSize={50} minSize={15}>
                      <DataGrid />
                    </Panel>
                  </PanelGroup>
                </Panel>
              </PanelGroup>
            </motion.div>
          )}

          {activeView === 'monitoring' && (
            <motion.div
              key="monitoring"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <Monitoring />
            </motion.div>
          )}

          {activeView === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <PanelGroup direction="horizontal">
                <Panel defaultSize={40} minSize={25}>
                  <QueryHistory />
                </Panel>
                <PanelResizeHandle />
                <Panel defaultSize={60} minSize={30}>
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={50} minSize={20}>
                      <SqlEditor />
                    </Panel>
                    <PanelResizeHandle />
                    <Panel defaultSize={50} minSize={15}>
                      <DataGrid />
                    </Panel>
                  </PanelGroup>
                </Panel>
              </PanelGroup>
            </motion.div>
          )}

          {activeView === 'erdiagram' && (
            <motion.div
              key="erdiagram"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <ERDiagram />
            </motion.div>
          )}

          {activeView === 'builder' && (
            <motion.div
              key="builder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <VisualQueryBuilder />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
}

export default App;
