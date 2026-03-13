import { useEffect, useState, useCallback } from 'react';
import { useUIStore, useQueryStore, useSchemaStore } from '../stores';
import { Command } from 'cmdk';
import {
  Terminal, Database, Activity, Table2, Search, Moon, Sun, Play,
  PanelLeftClose, PanelLeftOpen, FileText, Trash2, Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette, setView, toggleTheme, theme } = useUIStore();
  const { addTab, tabs, executeQuery, activeTabId, updateSql } = useQueryStore();
  const { tables, fetchSchema } = useSchemaStore();
  const [search, setSearch] = useState('');

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandPalette]);

  const close = useCallback(() => {
    toggleCommandPalette();
    setSearch('');
  }, [toggleCommandPalette]);

  if (!commandPaletteOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '20vh',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '560px', maxHeight: '420px' }}
        >
          <Command label="Command palette" shouldFilter={true}>
            <Command.Input
              placeholder="Type a command or search..."
              value={search}
              onValueChange={setSearch}
              autoFocus
            />
            <Command.List>
              <Command.Empty style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No results found
              </Command.Empty>

              <Command.Group heading="Navigation">
                <Command.Item onSelect={() => { setView('editor'); close(); }}>
                  <Terminal size={14} /> SQL Editor
                </Command.Item>
                <Command.Item onSelect={() => { setView('schema'); close(); }}>
                  <Database size={14} /> Schema Explorer
                </Command.Item>
                <Command.Item onSelect={() => { setView('monitoring'); close(); }}>
                  <Activity size={14} /> Performance Monitor
                </Command.Item>
                <Command.Item onSelect={() => { setView('history'); close(); }}>
                  <FileText size={14} /> Query History
                </Command.Item>
                <Command.Item onSelect={() => { setView('erdiagram'); close(); }}>
                  <Database size={14} /> ER Diagram
                </Command.Item>
                <Command.Item onSelect={() => { setView('builder'); close(); }}>
                  <Play size={14} /> Visual Query Builder
                </Command.Item>
              </Command.Group>

              <Command.Group heading="Actions">
                <Command.Item onSelect={() => { addTab(); setView('editor'); close(); }}>
                  <Plus size={14} /> New Query Tab
                </Command.Item>
                <Command.Item onSelect={() => { executeQuery(activeTabId); close(); }}>
                  <Play size={14} /> Execute Current Query
                </Command.Item>
                <Command.Item onSelect={() => { toggleTheme(); close(); }}>
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  Toggle {theme === 'dark' ? 'Light' : 'Dark'} Theme
                </Command.Item>
                <Command.Item onSelect={() => { fetchSchema(); close(); }}>
                  <Database size={14} /> Refresh Schema
                </Command.Item>
              </Command.Group>

              {tables.length > 0 && (
                <Command.Group heading="Tables">
                  {tables.map((t: any) => (
                    <Command.Item
                      key={t.name}
                      onSelect={() => {
                        updateSql(activeTabId, `SELECT * FROM ${t.name} LIMIT 100;`);
                        setView('editor');
                        close();
                      }}
                    >
                      <Table2 size={14} /> SELECT * FROM {t.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Quick Queries">
                <Command.Item onSelect={() => { updateSql(activeTabId, 'SHOW TABLES;'); setView('editor'); close(); }}>
                  <Search size={14} /> SHOW TABLES
                </Command.Item>
                {tables.map((t: any) => (
                  <Command.Item
                    key={`desc-${t.name}`}
                    onSelect={() => {
                      updateSql(activeTabId, `DESCRIBE ${t.name};`);
                      setView('editor');
                      close();
                    }}
                  >
                    <FileText size={14} /> DESCRIBE {t.name}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
