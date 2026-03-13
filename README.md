#  Shift_Elite DB — A Modern Database Management System

<div align="center">

**A fully functional DBMS built from scratch with a C++ storage engine and premium React frontend.**

[![C++20](https://img.shields.io/badge/C++-20-blue?logo=cplusplus)](https://isocpp.org)
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vite.dev)

</div>

---

##  Features

### 🔧 C++ Backend — Custom SQL Engine
- **Page-based Storage Engine** — Slotted-page format with buffer pool (LRU eviction)
- **SQL Parser** — Recursive descent parser supporting full SQL grammar
- **Query Executor** — Handles CREATE, INSERT, SELECT, UPDATE, DELETE, DROP, SHOW, DESCRIBE, EXPLAIN
- **WHERE Clause Engine** — `=`, `!=`, `>`, `<`, `>=`, `<=`, `AND`, `OR`, `LIKE`, `IN`, `BETWEEN`, `IS NULL`
- **JOIN Operations** — INNER JOIN, LEFT JOIN, RIGHT JOIN
- **Aggregate Functions** — COUNT, SUM, AVG, MIN, MAX with GROUP BY / HAVING
- **ORDER BY, LIMIT, DISTINCT** — Full result set control
- **Auto-Increment & Constraints** — PRIMARY KEY, UNIQUE, NOT NULL, DEFAULT
- **Catalog Persistence** — Schema saved to `catalog.json`, data in `.nxdb` files
- **Built-in HTTP Server** — Custom raw-socket server (no external dependencies)
- **REST API** — Complete CRUD + schema + stats + export/import endpoints
- **Sample Data Seeding** — E-commerce dataset (customers, products, orders, employees)

### 🎨 React Frontend — Premium UI
- **Monaco SQL Editor** — Syntax highlighting, IntelliSense with schema-aware autocomplete, multi-tab editing
- **Interactive Data Grid** — Sortable columns, pagination, double-click copy, CSV/JSON export
- **Schema Explorer** — Searchable tree view with column types, PK/FK icons, row counts, indexes
- **Interactive ER Diagram** — ReactFlow-powered with auto-detected relationships, minimap, drag-to-reposition
- **Visual Query Builder** — Build SQL without writing code: tables, columns, JOINs, WHERE, GROUP BY, ORDER BY, aggregates
- **Query Plan Visualizer** — Color-coded tree view of EXPLAIN output with execution metrics
- **Performance Monitor** — Real-time charts: query timing, buffer pool hit rate, table statistics
- **Query History** — Searchable list with filters, click-to-replay, execution timing
- **Command Palette** — Cmd+K quick access to all actions with fuzzy search
- **Dark / Light Theme** — Glassmorphism effects, smooth animations, JetBrains Mono + Inter fonts
- **Keyboard Shortcuts** — Ctrl+1-6 for views, Ctrl+Enter to execute, Ctrl+B toggle sidebar

---

##  Architecture

```
DBMS_Project/
├── backend/                              # C++ Backend (optional)
│   ├── CMakeLists.txt
│   └── src/
│       ├── main.cpp                      # Server entry point + sample data
│       ├── types/types.h                 # Data types, Value variant, schemas
│       ├── storage/
│       │   ├── page.h                    # Slotted-page storage
│       │   ├── disk_manager.h            # File I/O for table data
│       │   ├── buffer_pool.h             # LRU page cache
│       │   └── table.h                   # Row operations
│       ├── catalog/catalog.h             # Schema & index management
│       ├── sql/
│       │   ├── tokenizer.h              # SQL lexer
│       │   ├── ast.h                    # AST node definitions
│       │   ├── parser.h                 # Recursive descent parser
│       │   └── executor.h               # Query execution engine
│       └── server/server.h              # HTTP server + REST API
│
└── frontend/
    ├── index.html                        # Entry point
    ├── server.cjs                        # Node.js backend (SQLite)
    ├── vite.config.ts                    # Vite + Tailwind + proxy
    └── src/
        ├── App.tsx                       # Main layout with sidebar + panels
        ├── index.css                     # Design system (themes, animations)
        ├── lib/api.ts                    # REST API client
        ├── stores/index.ts              # Zustand state management
        └── components/
            ├── editor/SqlEditor.tsx      # Monaco SQL Editor
            ├── results/DataGrid.tsx      # Data grid with export
            ├── results/QueryPlanVisualizer.tsx
            ├── schema/SchemaExplorer.tsx # Tree view
            ├── schema/ERDiagram.tsx      # Interactive ER diagram
            ├── builder/VisualQueryBuilder.tsx
            ├── monitoring/Monitoring.tsx # Dashboards
            ├── history/QueryHistory.tsx
            └── CommandPalette.tsx        # Cmd+K
```

---

##  Getting Started

### Prerequisites
- **Node.js** 18+
- **npm** 9+

### Quick Start (Node.js Backend)

```powershell
# Terminal 1 — Start the backend server
cd frontend
npm install
npm run server
# ✅ Shift_Elite DB Server running at http://localhost:8080

# Terminal 2 — Start the frontend
cd frontend
npm run dev
# ✅ Opens on http://localhost:5173
```

### Alternative: C++ Backend (requires CMake + C++20 compiler)

```powershell
cd backend
mkdir build; cd build
cmake ..
cmake --build . --config Release
.\Release\nexusdb_server.exe
```

### 3. Try It Out

```sql
-- Sample queries to try in the editor:
SELECT * FROM customers LIMIT 10;

SELECT name, email, city FROM customers WHERE country = 'USA';

SELECT c.name, p.name AS product, o.total_price
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN products p ON o.product_id = p.id
ORDER BY o.total_price DESC;

SELECT category, COUNT(*) as count, AVG(price) as avg_price
FROM products
GROUP BY category
HAVING count > 1;

EXPLAIN SELECT * FROM customers WHERE city = 'New York';

SHOW TABLES;
DESCRIBE customers;
```

---

##  REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query` | Execute SQL query |
| `GET` | `/api/schema` | Get all table schemas |
| `GET` | `/api/schema/:table` | Get specific table schema |
| `GET` | `/api/stats` | Performance statistics |
| `GET` | `/api/history` | Query execution history |
| `GET` | `/api/tables` | List table names |
| `GET` | `/api/export/:table` | Export table data (JSON/CSV) |
| `POST` | `/api/import` | Import data into a table |
| `GET` | `/api/health` | Health check |

---

##  Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute query |
| `Ctrl+K` | Command palette |
| `Ctrl+1` | SQL Editor |
| `Ctrl+2` | Schema Explorer |
| `Ctrl+3` | Performance Monitor |
| `Ctrl+4` | Query History |
| `Ctrl+5` | ER Diagram |
| `Ctrl+6` | Visual Query Builder |
| `Ctrl+B` | Toggle sidebar |

---

##  Technology Stack

| Component | Technology |
|-----------|-----------|
| Storage Engine | Custom C++ (slotted pages, buffer pool) |
| SQL Parser | Hand-written recursive descent parser |
| Node.js Backend | Express + better-sqlite3 |
| Frontend Framework | React 18 + TypeScript |
| Build Tool | Vite 8 |
| SQL Editor | Monaco Editor |
| Diagrams | ReactFlow (xyflow) |
| Charts | Recharts |
| Animations | Framer Motion |
| State Management | Zustand |
| Styling | Tailwind CSS v4 + Custom CSS vars |
| Icons | Lucide React |

---

## 📄 License

MIT
