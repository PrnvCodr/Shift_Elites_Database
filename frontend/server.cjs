// Shift_Elite DB Mock Backend Server
// Uses better-sqlite3 for real SQL execution with in-memory database
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-memory SQLite database
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');

// Track query history
const queryHistory = [];
let bufferPoolHits = 0;
let bufferPoolMisses = 0;

// ==================== SEED SAMPLE DATA ====================
function seedDatabase() {
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      city TEXT,
      country TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      description TEXT
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      product_id INTEGER,
      quantity INTEGER DEFAULT 1,
      total_price REAL,
      status TEXT DEFAULT 'pending',
      order_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department TEXT,
      salary REAL,
      hire_date TEXT,
      manager_id INTEGER
    );
  `);

  // Insert customers
  const insertCustomer = db.prepare('INSERT INTO customers (name, email, city, country, phone) VALUES (?, ?, ?, ?, ?)');
  const customers = [
    ['Alice Johnson', 'alice@email.com', 'New York', 'USA', '+1-212-555-0101'],
    ['Bob Smith', 'bob@email.com', 'London', 'UK', '+44-20-7946-0958'],
    ['Charlie Brown', 'charlie@email.com', 'Paris', 'France', '+33-1-23-45-67-89'],
    ['Diana Prince', 'diana@email.com', 'Berlin', 'Germany', '+49-30-123456'],
    ['Eve Davis', 'eve@email.com', 'Tokyo', 'Japan', '+81-3-1234-5678'],
    ['Frank Wilson', 'frank@email.com', 'Sydney', 'Australia', '+61-2-9876-5432'],
    ['Grace Lee', 'grace@email.com', 'Toronto', 'Canada', '+1-416-555-0199'],
    ['Henry Taylor', 'henry@email.com', 'Mumbai', 'India', '+91-22-1234-5678'],
    ['Iris Martinez', 'iris@email.com', 'São Paulo', 'Brazil', '+55-11-9876-5432'],
    ['Jack Anderson', 'jack@email.com', 'New York', 'USA', '+1-646-555-0102'],
    ['Karen Thomas', 'karen@email.com', 'Chicago', 'USA', '+1-312-555-0103'],
    ['Leo Hernandez', 'leo@email.com', 'Mexico City', 'Mexico', '+52-55-1234-5678'],
    ['Maya Patel', 'maya@email.com', 'London', 'UK', '+44-20-7946-0959'],
    ['Noah Kim', 'noah@email.com', 'Seoul', 'South Korea', '+82-2-1234-5678'],
    ['Olivia Chen', 'olivia@email.com', 'Shanghai', 'China', '+86-21-1234-5678'],
  ];
  const insertMany = db.transaction(() => {
    for (const c of customers) insertCustomer.run(...c);
  });
  insertMany();

  // Insert products
  const insertProduct = db.prepare('INSERT INTO products (name, category, price, stock, description) VALUES (?, ?, ?, ?, ?)');
  const products = [
    ['Laptop Pro 15"', 'Electronics', 1299.99, 50, 'High-performance laptop with 16GB RAM'],
    ['Wireless Mouse', 'Electronics', 29.99, 200, 'Ergonomic wireless mouse'],
    ['Mechanical Keyboard', 'Electronics', 89.99, 150, 'RGB mechanical keyboard with Cherry MX switches'],
    ['USB-C Hub', 'Accessories', 49.99, 100, '7-in-1 USB-C hub with HDMI'],
    ['Monitor 27"', 'Electronics', 449.99, 75, '4K IPS monitor with HDR support'],
    ['Headphones', 'Audio', 199.99, 120, 'Noise-cancelling over-ear headphones'],
    ['Webcam HD', 'Electronics', 79.99, 80, '1080p HD webcam with built-in mic'],
    ['Standing Desk', 'Furniture', 599.99, 30, 'Electric height-adjustable standing desk'],
    ['Office Chair', 'Furniture', 349.99, 45, 'Ergonomic mesh office chair'],
    ['Desk Lamp', 'Lighting', 39.99, 200, 'LED desk lamp with adjustable brightness'],
    ['Bluetooth Speaker', 'Audio', 59.99, 100, 'Portable waterproof Bluetooth speaker'],
    ['Tablet 10"', 'Electronics', 399.99, 60, '10-inch tablet with 128GB storage'],
  ];
  const insertProducts = db.transaction(() => {
    for (const p of products) insertProduct.run(...p);
  });
  insertProducts();

  // Insert orders
  const insertOrder = db.prepare('INSERT INTO orders (customer_id, product_id, quantity, total_price, status, order_date) VALUES (?, ?, ?, ?, ?, ?)');
  const orderData = [
    [1, 1, 1, 1299.99, 'completed', '2024-01-15'],
    [2, 3, 2, 179.98, 'completed', '2024-01-20'],
    [3, 5, 1, 449.99, 'shipped', '2024-02-01'],
    [4, 6, 1, 199.99, 'completed', '2024-02-10'],
    [5, 2, 3, 89.97, 'pending', '2024-02-15'],
    [1, 8, 1, 599.99, 'processing', '2024-02-20'],
    [6, 9, 1, 349.99, 'completed', '2024-03-01'],
    [7, 4, 2, 99.98, 'shipped', '2024-03-05'],
    [8, 7, 1, 79.99, 'completed', '2024-03-10'],
    [9, 10, 4, 159.96, 'pending', '2024-03-12'],
    [10, 11, 1, 59.99, 'completed', '2024-03-15'],
    [2, 12, 1, 399.99, 'shipped', '2024-03-18'],
    [3, 1, 1, 1299.99, 'processing', '2024-03-20'],
    [11, 6, 2, 399.98, 'completed', '2024-03-22'],
    [12, 3, 1, 89.99, 'pending', '2024-03-25'],
  ];
  const insertOrders = db.transaction(() => {
    for (const o of orderData) insertOrder.run(...o);
  });
  insertOrders();

  // Insert employees
  const insertEmployee = db.prepare('INSERT INTO employees (name, department, salary, hire_date, manager_id) VALUES (?, ?, ?, ?, ?)');
  const employeeData = [
    ['John CEO', 'Executive', 150000, '2020-01-01', null],
    ['Sarah CTO', 'Engineering', 140000, '2020-03-15', 1],
    ['Mike Dev', 'Engineering', 95000, '2021-06-01', 2],
    ['Lisa Dev', 'Engineering', 92000, '2021-09-15', 2],
    ['Tom Sales', 'Sales', 85000, '2021-01-10', 1],
    ['Amy Marketing', 'Marketing', 88000, '2022-02-01', 1],
    ['Dave Support', 'Support', 65000, '2022-05-20', 1],
    ['Rachel HR', 'HR', 78000, '2020-06-01', 1],
  ];
  const insertEmployees = db.transaction(() => {
    for (const e of employeeData) insertEmployee.run(...e);
  });
  insertEmployees();

  // Create indexes
  db.exec(`
    CREATE INDEX idx_customers_city ON customers(city);
    CREATE INDEX idx_customers_country ON customers(country);
    CREATE INDEX idx_products_category ON products(category);
    CREATE INDEX idx_orders_customer ON orders(customer_id);
    CREATE INDEX idx_orders_product ON orders(product_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_employees_dept ON employees(department);
  `);

  console.log('✅ Sample data seeded successfully');
}

// ==================== API ENDPOINTS ====================

// POST /api/query — Execute SQL
app.post('/api/query', (req, res) => {
  const { sql } = req.body;
  if (!sql || !sql.trim()) {
    return res.json({ success: false, message: 'No SQL provided', rowsAffected: 0, executionTimeMs: 0 });
  }

  const startTime = performance.now();

  try {
    const trimmedSql = sql.trim().replace(/;$/, '');
    const upperSql = trimmedSql.toUpperCase();

    // Handle SHOW TABLES
    if (upperSql === 'SHOW TABLES') {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      bufferPoolHits++;
      const elapsed = performance.now() - startTime;
      const result = {
        success: true,
        message: `${tables.length} table(s) found`,
        columns: [{ name: 'table_name', type: 'TEXT' }],
        rows: tables.map(t => [t.name]),
        rowsAffected: tables.length,
        executionTimeMs: elapsed,
      };
      queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
      return res.json(result);
    }

    // Handle DESCRIBE <table>
    const descMatch = trimmedSql.match(/^DESCRIBE\s+(\w+)/i);
    if (descMatch) {
      const tableName = descMatch[1];
      const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
      bufferPoolHits++;
      const elapsed = performance.now() - startTime;
      const result = {
        success: true,
        message: `Table ${tableName}: ${cols.length} column(s)`,
        columns: [
          { name: 'cid', type: 'INT' },
          { name: 'name', type: 'TEXT' },
          { name: 'type', type: 'TEXT' },
          { name: 'notnull', type: 'INT' },
          { name: 'default_value', type: 'TEXT' },
          { name: 'pk', type: 'INT' },
        ],
        rows: cols.map(c => [c.cid, c.name, c.type, c.notnull, c.dflt_value, c.pk]),
        rowsAffected: cols.length,
        executionTimeMs: elapsed,
      };
      queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
      return res.json(result);
    }

    // Handle EXPLAIN
    if (upperSql.startsWith('EXPLAIN')) {
      const innerSql = trimmedSql.replace(/^EXPLAIN\s+/i, '');
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${innerSql}`).all();
      bufferPoolHits++;
      const elapsed = performance.now() - startTime;
      const planText = plan.map(p => `${' '.repeat(p.id * 2)}→ ${p.detail}`).join('\n');
      const result = {
        success: true,
        message: 'Query plan generated',
        columns: [{ name: 'id', type: 'INT' }, { name: 'detail', type: 'TEXT' }],
        rows: plan.map(p => [p.id, p.detail]),
        rowsAffected: plan.length,
        executionTimeMs: elapsed,
        queryPlan: planText,
      };
      queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
      return res.json(result);
    }

    // SELECT queries
    if (upperSql.startsWith('SELECT') || upperSql.startsWith('WITH') || upperSql.startsWith('PRAGMA')) {
      const stmt = db.prepare(trimmedSql);
      const rows = stmt.all();
      bufferPoolHits++;
      const elapsed = performance.now() - startTime;

      const columns = rows.length > 0
        ? Object.keys(rows[0]).map(k => ({ name: k, type: typeof rows[0][k] === 'number' ? 'REAL' : 'TEXT' }))
        : stmt.columns().map(c => ({ name: c.name, type: c.type || 'TEXT' }));

      const result = {
        success: true,
        message: `${rows.length} row(s) returned`,
        columns,
        rows: rows.map(r => Object.values(r)),
        rowsAffected: rows.length,
        executionTimeMs: elapsed,
      };
      queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
      return res.json(result);
    }

    // DML/DDL (INSERT, UPDATE, DELETE, CREATE, DROP, ALTER)
    const info = db.prepare(trimmedSql).run();
    bufferPoolHits++;
    const elapsed = performance.now() - startTime;
    const result = {
      success: true,
      message: `Query OK, ${info.changes} row(s) affected`,
      rowsAffected: info.changes,
      executionTimeMs: elapsed,
    };
    queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
    return res.json(result);

  } catch (err) {
    bufferPoolMisses++;
    const elapsed = performance.now() - startTime;
    queryHistory.push({ sql, executionTimeMs: elapsed, success: false });
    return res.json({
      success: false,
      message: err.message,
      rowsAffected: 0,
      executionTimeMs: elapsed,
    });
  }
});

// GET /api/schema — Get all table schemas
app.get('/api/schema', (req, res) => {
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const result = tables.map(t => {
      const columns = db.prepare(`PRAGMA table_info(${t.name})`).all();
      const indexes = db.prepare(`PRAGMA index_list(${t.name})`).all();
      const rowCount = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get();

      const indexDetails = indexes.map(idx => {
        const idxInfo = db.prepare(`PRAGMA index_info(${idx.name})`).all();
        return {
          name: idx.name,
          columns: idxInfo.map(i => i.name),
          unique: idx.unique === 1,
        };
      });

      return {
        name: t.name,
        columns: columns.map(c => ({
          name: c.name,
          type: c.type || 'TEXT',
          nullable: c.notnull === 0,
          primaryKey: c.pk === 1,
          autoIncrement: c.pk === 1 && c.type === 'INTEGER',
        })),
        primaryKeys: columns.filter(c => c.pk).map(c => c.name),
        indexes: indexDetails,
        rowCount: rowCount?.cnt || 0,
      };
    });

    res.json({ tables: result });
  } catch (err) {
    res.json({ tables: [], error: err.message });
  }
});

// GET /api/schema/:table
app.get('/api/schema/:table', (req, res) => {
  try {
    const { table } = req.params;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const indexes = db.prepare(`PRAGMA index_list(${table})`).all();
    const rowCount = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();

    res.json({
      name: table,
      columns: columns.map(c => ({
        name: c.name,
        type: c.type || 'TEXT',
        nullable: c.notnull === 0,
        primaryKey: c.pk === 1,
      })),
      primaryKeys: columns.filter(c => c.pk).map(c => c.name),
      indexes: indexes.map(idx => {
        const idxInfo = db.prepare(`PRAGMA index_info(${idx.name})`).all();
        return { name: idx.name, columns: idxInfo.map(i => i.name), unique: idx.unique === 1 };
      }),
      rowCount: rowCount?.cnt || 0,
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const tableStats = tables.map(t => {
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get();
    const indexes = db.prepare(`PRAGMA index_list(${t.name})`).all();
    return { name: t.name, rowCount: count?.cnt || 0, indexes: indexes.length };
  });

  const totalHits = bufferPoolHits + bufferPoolMisses;
  res.json({
    bufferPool: {
      size: 256,
      hits: bufferPoolHits,
      misses: bufferPoolMisses,
      hitRate: totalHits > 0 ? (bufferPoolHits / totalHits) * 100 : 100,
    },
    tables: tableStats,
    queryHistory: {
      total: queryHistory.length,
      slowQueries: queryHistory.filter(q => q.executionTimeMs > 100).length,
    },
  });
});

// GET /api/history
app.get('/api/history', (req, res) => {
  res.json(queryHistory.slice(-50).reverse());
});

// GET /api/tables
app.get('/api/tables', (req, res) => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  res.json(tables.map(t => t.name));
});

// GET /api/export/:table
app.get('/api/export/:table', (req, res) => {
  const { table } = req.params;
  const format = req.query.format || 'json';

  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();

    if (format === 'csv') {
      if (rows.length === 0) return res.type('text/csv').send('');
      const headers = Object.keys(rows[0]).join(',');
      const csvRows = rows.map(r => Object.values(r).map(v => v === null ? '' : `"${v}"`).join(','));
      return res.type('text/csv').send([headers, ...csvRows].join('\n'));
    }

    res.json(rows);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/import
app.post('/api/import', (req, res) => {
  const { table, data } = req.body;
  if (!table || !data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid import data' });
  }

  try {
    let inserted = 0;
    const insertRow = db.transaction(() => {
      for (const row of data) {
        const keys = Object.keys(row);
        const placeholders = keys.map(() => '?').join(', ');
        db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(row));
        inserted++;
      }
    });
    insertRow();
    res.json({ success: true, message: `${inserted} row(s) imported into ${table}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', engine: 'Shift_Elite DB (SQLite-backed)' });
});

// ==================== START SERVER ====================
seedDatabase();

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Shift_Elite DB Server running at http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   Tables: customers, products, orders, employees\n`);
});

// Prevent connections from hanging open indefinitely — this is a major
// cause of the frontend "stuck" Execute button (server holds a connection
// open but never sends a response).
server.keepAliveTimeout = 30_000;   // 30s keep-alive
server.headersTimeout   = 35_000;   // must be > keepAliveTimeout

// Catch any unhandled promise rejections so the process doesn't silently
// freeze or crash without logging.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥  Uncaught Exception:', err.message);
  // Keep the server alive — don't exit for non-fatal errors
});
