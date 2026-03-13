import { create } from 'zustand';
import { api, QueryResult, TableInfo, Stats, HistoryEntry } from '../lib/api';

// ===== Query Store =====
interface QueryTab {
  id: string;
  name: string;
  sql: string;
  result: QueryResult | null;
  isExecuting: boolean;
}

interface QueryStore {
  tabs: QueryTab[];
  activeTabId: string;
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateSql: (id: string, sql: string) => void;
  executeQuery: (id: string) => Promise<void>;
  renameTab: (id: string, name: string) => void;
}

let tabCounter = 1;

export const useQueryStore = create<QueryStore>((set, get) => ({
  tabs: [{ id: 'tab-1', name: 'Query 1', sql: 'SELECT * FROM customers LIMIT 10;', result: null, isExecuting: false }],
  activeTabId: 'tab-1',

  addTab: () => {
    tabCounter++;
    const newTab: QueryTab = {
      id: `tab-${tabCounter}`,
      name: `Query ${tabCounter}`,
      sql: '',
      result: null,
      isExecuting: false,
    };
    set((state) => ({ tabs: [...state.tabs, newTab], activeTabId: newTab.id }));
  },

  closeTab: (id) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      if (newTabs.length === 0) {
        tabCounter++;
        const fallback: QueryTab = { id: `tab-${tabCounter}`, name: `Query ${tabCounter}`, sql: '', result: null, isExecuting: false };
        return { tabs: [fallback], activeTabId: fallback.id };
      }
      const newActive = state.activeTabId === id ? newTabs[newTabs.length - 1].id : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActive };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateSql: (id, sql) => set((state) => ({
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, sql } : t)),
  })),

  executeQuery: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || !tab.sql.trim()) return;

    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, isExecuting: true } : t)),
    }));

    try {
      const result = await api.executeQuery(tab.sql);
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === id ? { ...t, result, isExecuting: false } : t)),
      }));
      // Refresh schema after DDL
      const upperSql = tab.sql.trim().toUpperCase();
      if (upperSql.startsWith('CREATE') || upperSql.startsWith('DROP') || upperSql.startsWith('ALTER')) {
        useSchemaStore.getState().fetchSchema();
      }
    } catch (err: any) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id ? { ...t, result: { success: false, message: err.message || 'Network error', rowsAffected: 0, executionTimeMs: 0 }, isExecuting: false } : t
        ),
      }));
    }
  },

  renameTab: (id, name) => set((state) => ({
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
  })),
}));

// ===== Schema Store =====
interface SchemaStore {
  tables: TableInfo[];
  isLoading: boolean;
  selectedTable: string | null;
  fetchSchema: () => Promise<void>;
  setSelectedTable: (name: string | null) => void;
}

export const useSchemaStore = create<SchemaStore>((set) => ({
  tables: [],
  isLoading: false,
  selectedTable: null,

  fetchSchema: async () => {
    set({ isLoading: true });
    try {
      const data = await api.getSchema();
      set({ tables: data.tables || [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setSelectedTable: (name) => set({ selectedTable: name }),
}));

// ===== Stats Store =====
interface StatsStore {
  stats: Stats | null;
  history: HistoryEntry[];
  isLoading: boolean;
  fetchStats: () => Promise<void>;
  fetchHistory: () => Promise<void>;
}

export const useStatsStore = create<StatsStore>((set) => ({
  stats: null,
  history: [],
  isLoading: false,

  fetchStats: async () => {
    try {
      const stats = await api.getStats();
      set({ stats });
    } catch {}
  },

  fetchHistory: async () => {
    try {
      const history = await api.getHistory();
      set({ history });
    } catch {}
  },
}));

// ===== UI Store =====
type View = 'editor' | 'schema' | 'monitoring' | 'designer' | 'history' | 'erdiagram' | 'builder' | 'queryplan';
type Theme = 'dark' | 'light';

interface UIStore {
  activeView: View;
  theme: Theme;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  setView: (view: View) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleCommandPalette: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeView: 'editor',
  theme: 'dark',
  sidebarCollapsed: false,
  commandPaletteOpen: false,

  setView: (view) => set({ activeView: view }),
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    return { theme: newTheme };
  }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
}));
