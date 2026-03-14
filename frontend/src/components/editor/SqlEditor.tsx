import { useEffect, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useQueryStore, useSchemaStore } from '../../stores';
import { Play, Plus, X, Loader2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Track registered completion provider globally so we only ever register once,
// preventing the memory/CPU leak that caused sluggish / stuck executions.
let sqlCompletionDisposable: { dispose: () => void } | null = null;

export function SqlEditor() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, updateSql, executeQuery } = useQueryStore();
  const { tables } = useSchemaStore();
  const editorRef = useRef<any>(null);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Dispose any previous provider before registering a new one.
    // Without this, every time the editor remounts (tab switch, view change etc.)
    // a NEW provider is added on top of the old ones — eventually Monaco's
    // suggestion loop blocks the JS thread and Execute appears to hang.
    if (sqlCompletionDisposable) {
      sqlCompletionDisposable.dispose();
      sqlCompletionDisposable = null;
    }

    // Register SQL completions from schema (only once at a time)
    sqlCompletionDisposable = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];

        // SQL keywords
        const keywords = [
          'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
          'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'INDEX', 'JOIN',
          'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'AND', 'OR',
          'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS', 'ORDER', 'BY',
          'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC', 'DISTINCT',
          'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'PRIMARY', 'KEY', 'FOREIGN',
          'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'AUTO_INCREMENT',
          'INT', 'VARCHAR', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP',
          'BEGIN', 'COMMIT', 'ROLLBACK', 'SHOW', 'TABLES', 'DESCRIBE', 'EXPLAIN',
        ];
        keywords.forEach(kw => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          });
        });

        // Table and column names from current schema
        // Read from store directly so we always get fresh data
        const currentTables = useSchemaStore.getState().tables;
        currentTables.forEach(table => {
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table.name,
            detail: `Table (${table.columns?.length || 0} columns)`,
            range,
          });
          table.columns?.forEach(col => {
            suggestions.push({
              label: `${table.name}.${col.name}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail: `${col.type}${col.primaryKey ? ' PK' : ''}${col.nullable ? '' : ' NOT NULL'}`,
              range,
            });
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail: `${table.name}.${col.name} (${col.type})`,
              range,
            });
          });
        });

        // Common SQL snippets
        const snippets = [
          { label: 'SELECT * FROM', insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:condition};', doc: 'Basic SELECT query' },
          { label: 'INSERT INTO', insertText: 'INSERT INTO ${1:table_name} (${2:columns}) VALUES (${3:values});', doc: 'INSERT statement' },
          { label: 'UPDATE SET', insertText: 'UPDATE ${1:table_name} SET ${2:column} = ${3:value} WHERE ${4:condition};', doc: 'UPDATE statement' },
          { label: 'CREATE TABLE', insertText: 'CREATE TABLE ${1:table_name} (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  ${2:column_name} ${3:VARCHAR(100)}\n);', doc: 'CREATE TABLE' },
          { label: 'JOIN ON', insertText: '${1:INNER} JOIN ${2:table_name} ON ${3:condition}', doc: 'JOIN clause' },
          { label: 'GROUP BY HAVING', insertText: 'GROUP BY ${1:column}\nHAVING ${2:condition}', doc: 'GROUP BY with HAVING' },
        ];
        snippets.forEach(s => {
          suggestions.push({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: s.doc,
            range,
          });
        });

        return { suggestions };
      },
    });

    // Ctrl+Enter to execute — reads from store at call-time so it's never stale
    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        const store = useQueryStore.getState();
        const tabId = store.activeTabId;
        if (tabId) store.executeQuery(tabId);
      },
    });
  };

  // Cleanup provider when component fully unmounts (e.g. navigating away)
  useEffect(() => {
    return () => {
      if (sqlCompletionDisposable) {
        sqlCompletionDisposable.dispose();
        sqlCompletionDisposable = null;
      }
    };
  }, []);

  const handleExecute = useCallback(() => {
    if (activeTab && !activeTab.isExecuting) executeQuery(activeTab.id);
  }, [activeTab, executeQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-secondary)',
        height: '36px',
        minHeight: '36px',
      }}>
        <div style={{ display: 'flex', flex: 1, overflow: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={tab.id === activeTabId ? 'tab-active' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 14px',
                height: '36px',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 500,
                color: tab.id === activeTabId ? 'var(--text-accent)' : 'var(--text-secondary)',
                borderRight: '1px solid var(--border-secondary)',
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.isExecuting ? (
                <Loader2 size={12} style={{ animation: 'spin-slow 1s linear infinite' }} />
              ) : tab.result ? (
                tab.result.success ? <CheckCircle2 size={12} color="var(--success)" /> : <XCircle size={12} color="var(--error)" />
              ) : null}
              <span>{tab.name}</span>
              {tabs.length > 1 && (
                <X
                  size={12}
                  style={{ opacity: 0.5, cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                />
              )}
            </div>
          ))}
        </div>
        <button onClick={addTab} className="btn-ghost btn-icon" style={{ margin: '0 4px' }}>
          <Plus size={14} />
        </button>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, position: 'relative' }}>
        {activeTab && (
          <Editor
            language="sql"
            theme="vs-dark"
            value={activeTab.sql}
            onChange={(value) => updateSql(activeTab.id, value || '')}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              fontLigatures: true,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: 'all',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              automaticLayout: true,
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
            }}
          />
        )}
      </div>

      {/* Execute bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-primary"
            onClick={handleExecute}
            disabled={activeTab?.isExecuting}
            style={{ padding: '5px 16px' }}
          >
            {activeTab?.isExecuting ? (
              <Loader2 size={14} style={{ animation: 'spin-slow 1s linear infinite' }} />
            ) : (
              <Play size={14} />
            )}
            <span>{activeTab?.isExecuting ? 'Running...' : 'Execute'}</span>
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Ctrl+Enter
          </span>
        </div>
        {activeTab?.result && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem' }}
            >
              <div className={activeTab.result.success ? 'badge badge-success' : 'badge badge-error'}>
                {activeTab.result.success ? 'Success' : 'Error'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                <Clock size={12} />
                {(activeTab.result.executionTimeMs ?? 0).toFixed(2)}ms
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>
                {activeTab.result.rowsAffected} row{activeTab.result.rowsAffected !== 1 ? 's' : ''}
              </span>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
