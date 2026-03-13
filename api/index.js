// Vercel Serverless API — Shift_Elite DB
// Uses sql.js (WASM) for SQLite that works in serverless environments
const initSqlJs = require('sql.js');

let db = null;
let queryHistory = [];
let bufferPoolHits = 0;
let bufferPoolMisses = 0;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  db = new SQL.Database();

  // Seed sample data
  db.run(`
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

  const customers = [
    ['Alice Johnson','alice@email.com','New York','USA','+1-212-555-0101'],
    ['Bob Smith','bob@email.com','London','UK','+44-20-7946-0958'],
    ['Charlie Brown','charlie@email.com','Paris','France','+33-1-23-45-67-89'],
    ['Diana Prince','diana@email.com','Berlin','Germany','+49-30-123456'],
    ['Eve Davis','eve@email.com','Tokyo','Japan','+81-3-1234-5678'],
    ['Frank Wilson','frank@email.com','Sydney','Australia','+61-2-9876-5432'],
    ['Grace Lee','grace@email.com','Toronto','Canada','+1-416-555-0199'],
    ['Henry Taylor','henry@email.com','Mumbai','India','+91-22-1234-5678'],
    ['Iris Martinez','iris@email.com','São Paulo','Brazil','+55-11-9876-5432'],
    ['Jack Anderson','jack@email.com','New York','USA','+1-646-555-0102'],
    ['Karen Thomas','karen@email.com','Chicago','USA','+1-312-555-0103'],
    ['Leo Hernandez','leo@email.com','Mexico City','Mexico','+52-55-1234-5678'],
    ['Maya Patel','maya@email.com','London','UK','+44-20-7946-0959'],
    ['Noah Kim','noah@email.com','Seoul','South Korea','+82-2-1234-5678'],
    ['Olivia Chen','olivia@email.com','Shanghai','China','+86-21-1234-5678'],
  ];
  for (const c of customers) {
    db.run('INSERT INTO customers (name,email,city,country,phone) VALUES (?,?,?,?,?)', c);
  }

  const products = [
    ['Laptop Pro 15"','Electronics',1299.99,50,'High-performance laptop with 16GB RAM'],
    ['Wireless Mouse','Electronics',29.99,200,'Ergonomic wireless mouse'],
    ['Mechanical Keyboard','Electronics',89.99,150,'RGB mechanical keyboard'],
    ['USB-C Hub','Accessories',49.99,100,'7-in-1 USB-C hub with HDMI'],
    ['Monitor 27"','Electronics',449.99,75,'4K IPS monitor with HDR'],
    ['Headphones','Audio',199.99,120,'Noise-cancelling over-ear headphones'],
    ['Webcam HD','Electronics',79.99,80,'1080p HD webcam'],
    ['Standing Desk','Furniture',599.99,30,'Electric standing desk'],
    ['Office Chair','Furniture',349.99,45,'Ergonomic mesh chair'],
    ['Desk Lamp','Lighting',39.99,200,'LED desk lamp'],
    ['Bluetooth Speaker','Audio',59.99,100,'Portable Bluetooth speaker'],
    ['Tablet 10"','Electronics',399.99,60,'10-inch tablet 128GB'],
  ];
  for (const p of products) {
    db.run('INSERT INTO products (name,category,price,stock,description) VALUES (?,?,?,?,?)', p);
  }

  const orders = [
    [1,1,1,1299.99,'completed','2024-01-15'],[2,3,2,179.98,'completed','2024-01-20'],
    [3,5,1,449.99,'shipped','2024-02-01'],[4,6,1,199.99,'completed','2024-02-10'],
    [5,2,3,89.97,'pending','2024-02-15'],[1,8,1,599.99,'processing','2024-02-20'],
    [6,9,1,349.99,'completed','2024-03-01'],[7,4,2,99.98,'shipped','2024-03-05'],
    [8,7,1,79.99,'completed','2024-03-10'],[9,10,4,159.96,'pending','2024-03-12'],
    [10,11,1,59.99,'completed','2024-03-15'],[2,12,1,399.99,'shipped','2024-03-18'],
    [3,1,1,1299.99,'processing','2024-03-20'],[11,6,2,399.98,'completed','2024-03-22'],
    [12,3,1,89.99,'pending','2024-03-25'],
  ];
  for (const o of orders) {
    db.run('INSERT INTO orders (customer_id,product_id,quantity,total_price,status,order_date) VALUES (?,?,?,?,?,?)', o);
  }

  const employees = [
    ['John CEO','Executive',150000,'2020-01-01',null],
    ['Sarah CTO','Engineering',140000,'2020-03-15',1],
    ['Mike Dev','Engineering',95000,'2021-06-01',2],
    ['Lisa Dev','Engineering',92000,'2021-09-15',2],
    ['Tom Sales','Sales',85000,'2021-01-10',1],
    ['Amy Marketing','Marketing',88000,'2022-02-01',1],
    ['Dave Support','Support',65000,'2022-05-20',1],
    ['Rachel HR','HR',78000,'2020-06-01',1],
  ];
  for (const e of employees) {
    db.run('INSERT INTO employees (name,department,salary,hire_date,manager_id) VALUES (?,?,?,?,?)', e);
  }

  db.run('CREATE INDEX idx_customers_city ON customers(city)');
  db.run('CREATE INDEX idx_customers_country ON customers(country)');
  db.run('CREATE INDEX idx_products_category ON products(category)');
  db.run('CREATE INDEX idx_orders_customer ON orders(customer_id)');
  db.run('CREATE INDEX idx_orders_product ON orders(product_id)');
  db.run('CREATE INDEX idx_orders_status ON orders(status)');
  db.run('CREATE INDEX idx_employees_dept ON employees(department)');

  return db;
}

function runSelect(database, sql) {
  const stmt = database.prepare(sql);
  const columns = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) rows.push(stmt.get());
  stmt.free();
  return { columns, rows };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const database = await getDb();
  // Vercel rewrites pass path as query param; fallback to req.url for local dev
  const pathParam = req.query?.path || '';
  const url = '/' + pathParam.replace(/^\//, '');

  try {
    // Health
    if (url === '/health') {
      return res.json({ status: 'ok', version: '1.0.0', engine: 'Shift_Elite DB (sql.js WASM)' });
    }

    // Query
    if (url === '/query' && req.method === 'POST') {
      const { sql } = req.body || {};
      if (!sql || !sql.trim()) {
        return res.json({ success: false, message: 'No SQL provided', rowsAffected: 0, executionTimeMs: 0 });
      }
      const startTime = Date.now();
      const trimmedSql = sql.trim().replace(/;$/, '');
      const upperSql = trimmedSql.toUpperCase();

      // SHOW TABLES
      if (upperSql === 'SHOW TABLES') {
        const { rows } = runSelect(database, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const elapsed = Date.now() - startTime;
        queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
        bufferPoolHits++;
        return res.json({
          success: true, message: `${rows.length} table(s)`,
          columns: [{ name: 'table_name', type: 'TEXT' }], rows,
          rowsAffected: rows.length, executionTimeMs: elapsed,
        });
      }

      // DESCRIBE
      const descMatch = trimmedSql.match(/^DESCRIBE\s+(\w+)/i);
      if (descMatch) {
        const { rows } = runSelect(database, `PRAGMA table_info(${descMatch[1]})`);
        const elapsed = Date.now() - startTime;
        queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
        bufferPoolHits++;
        return res.json({
          success: true, message: `${rows.length} column(s)`,
          columns: [{ name:'cid',type:'INT' },{ name:'name',type:'TEXT' },{ name:'type',type:'TEXT' },{ name:'notnull',type:'INT' },{ name:'default_value',type:'TEXT' },{ name:'pk',type:'INT' }],
          rows, rowsAffected: rows.length, executionTimeMs: elapsed,
        });
      }

      // EXPLAIN
      if (upperSql.startsWith('EXPLAIN')) {
        const innerSql = trimmedSql.replace(/^EXPLAIN\s+/i, '');
        const { rows } = runSelect(database, `EXPLAIN QUERY PLAN ${innerSql}`);
        const elapsed = Date.now() - startTime;
        const planText = rows.map(r => `→ ${r[3] || r[2] || r[1] || r[0]}`).join('\n');
        queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
        bufferPoolHits++;
        return res.json({
          success: true, message: 'Query plan generated',
          columns: [{ name:'id',type:'INT' },{ name:'detail',type:'TEXT' }],
          rows: rows.map(r => [r[0], r[3] || r[2] || '']),
          rowsAffected: rows.length, executionTimeMs: elapsed, queryPlan: planText,
        });
      }

      // SELECT
      if (upperSql.startsWith('SELECT') || upperSql.startsWith('WITH') || upperSql.startsWith('PRAGMA')) {
        const { columns, rows } = runSelect(database, trimmedSql);
        const elapsed = Date.now() - startTime;
        queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
        bufferPoolHits++;
        return res.json({
          success: true, message: `${rows.length} row(s) returned`,
          columns: columns.map(c => ({ name: c, type: 'TEXT' })), rows,
          rowsAffected: rows.length, executionTimeMs: elapsed,
        });
      }

      // DML/DDL
      database.run(trimmedSql);
      const changes = database.getRowsModified();
      const elapsed = Date.now() - startTime;
      queryHistory.push({ sql, executionTimeMs: elapsed, success: true });
      bufferPoolHits++;
      return res.json({
        success: true, message: `Query OK, ${changes} row(s) affected`,
        rowsAffected: changes, executionTimeMs: elapsed,
      });
    }

    // Schema
    if (url === '/schema') {
      const { rows: tableRows } = runSelect(database, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = tableRows.map(t => {
        const tName = t[0];
        const { rows: cols } = runSelect(database, `PRAGMA table_info(${tName})`);
        const { rows: idxs } = runSelect(database, `PRAGMA index_list(${tName})`);
        const { rows: countRow } = runSelect(database, `SELECT COUNT(*) FROM ${tName}`);
        const indexDetails = idxs.map(idx => {
          const { rows: idxInfo } = runSelect(database, `PRAGMA index_info(${idx[1]})`);
          return { name: idx[1], columns: idxInfo.map(i => i[2]), unique: idx[2] === 1 };
        });
        return {
          name: tName,
          columns: cols.map(c => ({ name: c[1], type: c[2] || 'TEXT', nullable: c[3] === 0, primaryKey: c[5] === 1 })),
          primaryKeys: cols.filter(c => c[5]).map(c => c[1]),
          indexes: indexDetails,
          rowCount: countRow[0]?.[0] || 0,
        };
      });
      return res.json({ tables });
    }

    // Stats
    if (url === '/stats') {
      const { rows: tableRows } = runSelect(database, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tableStats = tableRows.map(t => {
        const { rows: cnt } = runSelect(database, `SELECT COUNT(*) FROM ${t[0]}`);
        const { rows: idxs } = runSelect(database, `PRAGMA index_list(${t[0]})`);
        return { name: t[0], rowCount: cnt[0]?.[0] || 0, indexes: idxs.length };
      });
      const totalHits = bufferPoolHits + bufferPoolMisses;
      return res.json({
        bufferPool: { size: 256, hits: bufferPoolHits, misses: bufferPoolMisses, hitRate: totalHits > 0 ? (bufferPoolHits / totalHits) * 100 : 100 },
        tables: tableStats,
        queryHistory: { total: queryHistory.length, slowQueries: queryHistory.filter(q => q.executionTimeMs > 100).length },
      });
    }

    // History
    if (url === '/history') {
      return res.json(queryHistory.slice(-50).reverse());
    }

    // Tables list
    if (url === '/tables') {
      const { rows } = runSelect(database, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      return res.json(rows.map(r => r[0]));
    }

    // Export
    const exportMatch = url.match(/^\/export\/(\w+)/);
    if (exportMatch) {
      const tName = exportMatch[1];
      const { columns, rows } = runSelect(database, `SELECT * FROM ${tName}`);
      const format = (req.query?.format) || 'json';
      if (format === 'csv') {
        const csvStr = [columns.join(','), ...rows.map(r => r.map(v => v === null ? '' : `"${v}"`).join(','))].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        return res.send(csvStr);
      }
      return res.json(rows.map(r => {
        const obj = {};
        columns.forEach((c, i) => { obj[c] = r[i]; });
        return obj;
      }));
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    bufferPoolMisses++;
    const elapsed = Date.now() - (Date.now());
    queryHistory.push({ sql: req.body?.sql || 'unknown', executionTimeMs: 0, success: false });
    return res.json({ success: false, message: err.message, rowsAffected: 0, executionTimeMs: 0 });
  }
};
