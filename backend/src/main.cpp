#include <iostream>
#include <string>
#include <filesystem>
#include "storage/disk_manager.h"
#include "storage/buffer_pool.h"
#include "catalog/catalog.h"
#include "sql/executor.h"
#include "server/server.h"

int main(int argc, char* argv[]) {
    int port = 8080;
    std::string dataDir = "./Shift_Elite DB_data";

    // Parse command line args
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if ((arg == "--port" || arg == "-p") && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if ((arg == "--data" || arg == "-d") && i + 1 < argc) {
            dataDir = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "Shift_Elite DB - A Modern Database Management System\n\n";
            std::cout << "Usage: Shift_Elite DB_server [options]\n\n";
            std::cout << "Options:\n";
            std::cout << "  -p, --port <port>   Server port (default: 8080)\n";
            std::cout << "  -d, --data <dir>    Data directory (default: ./Shift_Elite DB_data)\n";
            std::cout << "  -h, --help          Show this help message\n";
            return 0;
        }
    }

    // Create data directory if it doesn't exist
    std::filesystem::create_directories(dataDir);

    // Initialize components
    shift_elite::DiskManager diskManager(dataDir);
    shift_elite::BufferPool bufferPool(diskManager);
    shift_elite::Catalog catalog(dataDir, diskManager, bufferPool);
    shift_elite::Executor executor(catalog);

    // Load sample data if database is empty
    if (catalog.getTableNames().empty()) {
        std::cout << "Initializing with sample data...\n";
        
        // E-commerce sample data
        executor.execute(R"(
            CREATE TABLE IF NOT EXISTS customers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE,
                city VARCHAR(50),
                country VARCHAR(50),
                joined_date DATE
            )
        )");

        executor.execute(R"(
            CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(200) NOT NULL,
                category VARCHAR(50),
                price FLOAT NOT NULL,
                stock INT DEFAULT 0,
                rating FLOAT
            )
        )");

        executor.execute(R"(
            CREATE TABLE IF NOT EXISTS orders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_id INT,
                product_id INT,
                quantity INT NOT NULL,
                total_price FLOAT,
                order_date DATE,
                status VARCHAR(20) DEFAULT 'pending'
            )
        )");

        executor.execute(R"(
            CREATE TABLE IF NOT EXISTS employees (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                department VARCHAR(50),
                salary FLOAT,
                hire_date DATE,
                manager_id INT
            )
        )");

        // Insert sample customers
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (1, 'Alice Johnson', 'alice@email.com', 'New York', 'USA', '2024-01-15')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (2, 'Bob Smith', 'bob@email.com', 'London', 'UK', '2024-02-20')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (3, 'Carol Davis', 'carol@email.com', 'Tokyo', 'Japan', '2024-03-10')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (4, 'David Lee', 'david@email.com', 'Berlin', 'Germany', '2024-04-05')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (5, 'Emma Wilson', 'emma@email.com', 'Paris', 'France', '2024-05-01')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (6, 'Frank Brown', 'frank@email.com', 'Sydney', 'Australia', '2024-06-12')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (7, 'Grace Kim', 'grace@email.com', 'Seoul', 'South Korea', '2024-07-20')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (8, 'Henry Chen', 'henry@email.com', 'Shanghai', 'China', '2024-08-15')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (9, 'Ivy Martinez', 'ivy@email.com', 'Mexico City', 'Mexico', '2024-09-01')");
        executor.execute("INSERT INTO customers (id, name, email, city, country, joined_date) VALUES (10, 'Jack Thompson', 'jack@email.com', 'Toronto', 'Canada', '2024-10-10')");

        // Insert sample products
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (1, 'Laptop Pro 15', 'Electronics', 1299.99, 50, 4.5)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (2, 'Wireless Headphones', 'Electronics', 199.99, 200, 4.2)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (3, 'Running Shoes', 'Sports', 89.99, 150, 4.7)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (4, 'Coffee Maker', 'Home', 49.99, 75, 4.0)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (5, 'Desk Chair', 'Furniture', 299.99, 30, 4.3)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (6, 'Smartphone X', 'Electronics', 899.99, 100, 4.6)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (7, 'Yoga Mat', 'Sports', 29.99, 300, 4.1)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (8, 'Backpack Pro', 'Accessories', 79.99, 120, 4.4)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (9, 'Mechanical Keyboard', 'Electronics', 149.99, 80, 4.8)");
        executor.execute("INSERT INTO products (id, name, category, price, stock, rating) VALUES (10, 'Standing Desk', 'Furniture', 499.99, 25, 4.5)");

        // Insert sample orders
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (1, 1, 1, 1, 1299.99, '2024-11-01', 'delivered')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (2, 2, 3, 2, 179.98, '2024-11-02', 'delivered')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (3, 1, 2, 1, 199.99, '2024-11-03', 'shipped')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (4, 3, 6, 1, 899.99, '2024-11-04', 'delivered')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (5, 4, 5, 1, 299.99, '2024-11-05', 'processing')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (6, 5, 9, 2, 299.98, '2024-11-06', 'shipped')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (7, 6, 4, 3, 149.97, '2024-11-07', 'delivered')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (8, 7, 10, 1, 499.99, '2024-11-08', 'processing')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (9, 8, 7, 5, 149.95, '2024-11-09', 'delivered')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (10, 9, 8, 1, 79.99, '2024-11-10', 'shipped')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (11, 10, 1, 1, 1299.99, '2024-11-11', 'delivered')");
        executor.execute("INSERT INTO orders (id, customer_id, product_id, quantity, total_price, order_date, status) VALUES (12, 1, 9, 1, 149.99, '2024-11-12', 'delivered')");

        // Insert sample employees
        executor.execute("INSERT INTO employees (id, name, department, salary, hire_date, manager_id) VALUES (1, 'Sarah Connor', 'Engineering', 120000, '2023-01-15', 0)");
        executor.execute("INSERT INTO employees (id, name, department, salary, hire_date, manager_id) VALUES (2, 'John Reese', 'Engineering', 95000, '2023-03-20', 1)");
        executor.execute("INSERT INTO employees (id, name, department, salary, hire_date, manager_id) VALUES (3, 'Diana Prince', 'Marketing', 85000, '2023-06-01', 0)");
        executor.execute("INSERT INTO employees (id, name, department, salary, hire_date, manager_id) VALUES (4, 'Bruce Wayne', 'Engineering', 110000, '2023-08-15', 1)");
        executor.execute("INSERT INTO employees (id, name, department, salary, hire_date, manager_id) VALUES (5, 'Clark Kent', 'Sales', 75000, '2024-01-10', 3)");

        // Create some indexes
        executor.execute("CREATE INDEX idx_customers_city ON customers (city)");
        executor.execute("CREATE INDEX idx_orders_customer ON orders (customer_id)");
        executor.execute("CREATE INDEX idx_products_category ON products (category)");

        std::cout << "Sample data loaded successfully!\n";
    }

    // Start server
    shift_elite::HttpServer server(port, executor, catalog, bufferPool);
    server.start();

    return 0;
}

