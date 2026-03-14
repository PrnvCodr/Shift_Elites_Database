// In production (Vercel), VITE_API_URL points to the Railway C++ backend.
// In local dev, it's absent and Vite's proxy forwards /api → localhost:8080.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

// Timeout in ms for all API requests — prevents Execute from getting stuck forever
const FETCH_TIMEOUT_MS = 10_000;

export interface Column {
  name: string;
  type: string;
  maxLength?: number;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  autoIncrement?: boolean;
}

export interface TableInfo {
  name: string;
  columns: Column[];
  primaryKeys: string[];
  indexes: { name: string; columns: string[]; unique: boolean }[];
  rowCount?: number;
}

export interface QueryResult {
  success: boolean;
  message: string;
  columns?: { name: string; type: string }[];
  rows?: any[][];
  rowsAffected: number;
  executionTimeMs: number;
  queryPlan?: string;
}

export interface HistoryEntry {
  sql: string;
  executionTimeMs: number;
  success: boolean;
}

export interface Stats {
  bufferPool: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  tables: { name: string; rowCount: number; indexes: number }[];
  queryHistory: { total: number; slowQueries: number };
}

/**
 * Fetch with an automatic AbortController timeout.
 * If the server doesn't respond within FETCH_TIMEOUT_MS, the request is
 * cancelled and a clear "timed out" error is thrown so Execute never
 * stays stuck spinning indefinitely.
 */
async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timerId);
    return res;
  } catch (err: any) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') {
      throw new Error(
        `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s. Make sure the backend server (npm run server) is running on port 8080.`
      );
    }
    throw new Error(
      `Cannot connect to the backend server. Make sure it is running on port 8080.\n\nError: ${err.message}`
    );
  }
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`Server returned an empty response (HTTP ${res.status}). Is the backend running?`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server returned invalid JSON (HTTP ${res.status}): ${text.substring(0, 200)}`);
  }
}

class ApiClient {
  async executeQuery(sql: string): Promise<QueryResult> {
    const res = await safeFetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
    return safeJson<QueryResult>(res);
  }

  async getSchema(): Promise<{ tables: TableInfo[] }> {
    try {
      const res = await safeFetch(`${API_BASE}/schema`);
      return safeJson<{ tables: TableInfo[] }>(res);
    } catch {
      return { tables: [] };
    }
  }

  async getTableSchema(tableName: string): Promise<TableInfo> {
    const res = await safeFetch(`${API_BASE}/schema/${tableName}`);
    return safeJson<TableInfo>(res);
  }

  async getStats(): Promise<Stats> {
    const res = await safeFetch(`${API_BASE}/stats`);
    return safeJson<Stats>(res);
  }

  async getHistory(): Promise<HistoryEntry[]> {
    try {
      const res = await safeFetch(`${API_BASE}/history`);
      return safeJson<HistoryEntry[]>(res);
    } catch {
      return [];
    }
  }

  async getTables(): Promise<string[]> {
    try {
      const res = await safeFetch(`${API_BASE}/tables`);
      return safeJson<string[]>(res);
    } catch {
      return [];
    }
  }

  async exportTable(tableName: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const res = await safeFetch(`${API_BASE}/export/${tableName}?format=${format}`);
    return res.text();
  }

  async importData(tableName: string, data: any[]): Promise<any> {
    const res = await safeFetch(`${API_BASE}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: tableName, data }),
    });
    return safeJson<any>(res);
  }

  async healthCheck(): Promise<{ status: string; version: string }> {
    const res = await safeFetch(`${API_BASE}/health`);
    return safeJson<{ status: string; version: string }>(res);
  }
}

export const api = new ApiClient();
