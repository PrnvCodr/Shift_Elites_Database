#pragma once
// Shift_Elite DB - Lightweight embedded HTTP server for the DBMS
// Using a simple built-in HTTP server to avoid external dependencies

#include <string>
#include <functional>
#include <thread>
#include <atomic>
#include <mutex>
#include <sstream>
#include <map>
#include <vector>
#include <iostream>
#include <cstring>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using socket_t = SOCKET;
#define CLOSE_SOCKET closesocket
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
using socket_t = int;
#define CLOSE_SOCKET close
#define INVALID_SOCKET -1
#define SOCKET_ERROR -1
#endif

#include "../sql/executor.h"
#include "../catalog/catalog.h"
#include <nlohmann/json.hpp>

namespace shift_elite {

struct HttpRequest {
    std::string method;
    std::string path;
    std::map<std::string, std::string> headers;
    std::string body;
    std::map<std::string, std::string> params;
};

struct HttpResponse {
    int statusCode = 200;
    std::string contentType = "application/json";
    std::string body;
    std::map<std::string, std::string> headers;

    std::string toString() const {
        std::string status;
        switch (statusCode) {
            case 200: status = "OK"; break;
            case 201: status = "Created"; break;
            case 400: status = "Bad Request"; break;
            case 404: status = "Not Found"; break;
            case 405: status = "Method Not Allowed"; break;
            case 500: status = "Internal Server Error"; break;
            default: status = "Unknown"; break;
        }

        std::ostringstream oss;
        oss << "HTTP/1.1 " << statusCode << " " << status << "\r\n";
        oss << "Content-Type: " << contentType << "\r\n";
        oss << "Content-Length: " << body.size() << "\r\n";
        oss << "Access-Control-Allow-Origin: *\r\n";
        oss << "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n";
        oss << "Access-Control-Allow-Headers: Content-Type, Authorization\r\n";
        for (auto& [k, v] : headers) {
            oss << k << ": " << v << "\r\n";
        }
        oss << "\r\n";
        oss << body;
        return oss.str();
    }
};

class HttpServer {
public:
    HttpServer(int port, Executor& executor, Catalog& catalog, BufferPool& bufferPool)
        : port_(port), executor_(executor), catalog_(catalog), bufferPool_(bufferPool), running_(false) {}

    ~HttpServer() { stop(); }

    bool start() {
#ifdef _WIN32
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "WSAStartup failed\n";
            return false;
        }
#endif
        serverSocket_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (serverSocket_ == INVALID_SOCKET) {
            std::cerr << "Failed to create socket\n";
            return false;
        }

        int opt = 1;
        setsockopt(serverSocket_, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port_);

        if (bind(serverSocket_, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
            std::cerr << "Bind failed on port " << port_ << "\n";
            CLOSE_SOCKET(serverSocket_);
            return false;
        }

        if (listen(serverSocket_, 10) == SOCKET_ERROR) {
            std::cerr << "Listen failed\n";
            CLOSE_SOCKET(serverSocket_);
            return false;
        }

        running_ = true;
        std::cout << "\n===================================\n";
        std::cout << "  Shift_Elite DB Server v1.0.0\n";
        std::cout << "  Listening on http://localhost:" << port_ << "\n";
        std::cout << "===================================\n\n";

        while (running_) {
            sockaddr_in clientAddr{};
            int clientAddrLen = sizeof(clientAddr);
            socket_t clientSocket = accept(serverSocket_, (sockaddr*)&clientAddr, 
#ifdef _WIN32
                &clientAddrLen
#else
                (socklen_t*)&clientAddrLen
#endif
            );

            if (clientSocket == INVALID_SOCKET) {
                if (running_) std::cerr << "Accept failed\n";
                continue;
            }

            // Handle in a thread
            std::thread([this, clientSocket]() {
                handleClient(clientSocket);
            }).detach();
        }

        return true;
    }

    void stop() {
        running_ = false;
        if (serverSocket_ != INVALID_SOCKET) {
            CLOSE_SOCKET(serverSocket_);
            serverSocket_ = INVALID_SOCKET;
        }
#ifdef _WIN32
        WSACleanup();
#endif
    }

private:
    void handleClient(socket_t clientSocket) {
        char buffer[65536];
        int bytesRead = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);
        if (bytesRead <= 0) {
            CLOSE_SOCKET(clientSocket);
            return;
        }
        buffer[bytesRead] = '\0';

        HttpRequest req = parseRequest(std::string(buffer, bytesRead));
        HttpResponse res;

        // CORS preflight
        if (req.method == "OPTIONS") {
            res.statusCode = 200;
            res.body = "";
            sendResponse(clientSocket, res);
            return;
        }

        // Route handling
        try {
            if (req.path == "/api/query" && req.method == "POST") {
                res = handleQuery(req);
            } else if (req.path == "/api/schema" && req.method == "GET") {
                res = handleGetSchema(req);
            } else if (req.path.rfind("/api/schema/", 0) == 0 && req.method == "GET") {
                std::string tableName = req.path.substr(12);
                res = handleGetTableSchema(tableName);
            } else if (req.path == "/api/stats" && req.method == "GET") {
                res = handleGetStats(req);
            } else if (req.path == "/api/history" && req.method == "GET") {
                res = handleGetHistory(req);
            } else if (req.path == "/api/tables" && req.method == "GET") {
                res = handleGetTables(req);
            } else if (req.path.rfind("/api/export/", 0) == 0 && req.method == "GET") {
                std::string tableName = req.path.substr(12);
                res = handleExport(tableName, req);
            } else if (req.path == "/api/import" && req.method == "POST") {
                res = handleImport(req);
            } else if (req.path == "/api/health" && req.method == "GET") {
                res.body = R"({"status":"ok","version":"1.0.0"})";
            } else {
                res.statusCode = 404;
                res.body = R"({"error":"Not found"})";
            }
        } catch (const std::exception& e) {
            res.statusCode = 500;
            nlohmann::json err;
            err["error"] = e.what();
            res.body = err.dump();
        }

        sendResponse(clientSocket, res);
    }

    HttpResponse handleQuery(const HttpRequest& req) {
        HttpResponse res;
        try {
            auto body = nlohmann::json::parse(req.body);
            std::string sql = body.value("sql", "");
            if (sql.empty()) {
                res.statusCode = 400;
                res.body = R"({"error":"Missing 'sql' field"})";
                return res;
            }

            auto result = executor_.execute(sql);
            res.body = result.toJson().dump();
            if (!result.success) res.statusCode = 400;
        } catch (const nlohmann::json::exception& e) {
            res.statusCode = 400;
            nlohmann::json err;
            err["error"] = std::string("Invalid JSON: ") + e.what();
            res.body = err.dump();
        }
        return res;
    }

    HttpResponse handleGetSchema(const HttpRequest&) {
        HttpResponse res;
        nlohmann::json j;
        j["tables"] = nlohmann::json::array();

        for (auto& name : catalog_.getTableNames()) {
            auto* schema = catalog_.getSchema(name);
            if (!schema) continue;

            nlohmann::json tableJ;
            tableJ["name"] = schema->name;
            tableJ["columns"] = nlohmann::json::array();
            for (auto& col : schema->columns) {
                nlohmann::json colJ;
                colJ["name"] = col.name;
                colJ["type"] = dataTypeToString(col.type);
                colJ["maxLength"] = col.maxLength;
                colJ["nullable"] = col.nullable;
                colJ["primaryKey"] = col.primaryKey;
                colJ["unique"] = col.unique;
                colJ["autoIncrement"] = col.autoIncrement;
                tableJ["columns"].push_back(colJ);
            }
            tableJ["primaryKeys"] = schema->primaryKeys;
            
            // Add index info
            tableJ["indexes"] = nlohmann::json::array();
            for (auto& idx : catalog_.getIndexes(name)) {
                nlohmann::json idxJ;
                idxJ["name"] = idx.name;
                idxJ["columns"] = idx.columns;
                idxJ["unique"] = idx.unique;
                tableJ["indexes"].push_back(idxJ);
            }

            // Row count
            auto table = catalog_.getTable(name);
            if (table) {
                tableJ["rowCount"] = table->getRowCount();
            }

            j["tables"].push_back(tableJ);
        }
        res.body = j.dump();
        return res;
    }

    HttpResponse handleGetTableSchema(const std::string& tableName) {
        HttpResponse res;
        auto* schema = catalog_.getSchema(tableName);
        if (!schema) {
            res.statusCode = 404;
            res.body = R"({"error":"Table not found"})";
            return res;
        }

        nlohmann::json j;
        j["name"] = schema->name;
        j["columns"] = nlohmann::json::array();
        for (auto& col : schema->columns) {
            nlohmann::json colJ;
            colJ["name"] = col.name;
            colJ["type"] = dataTypeToString(col.type);
            colJ["maxLength"] = col.maxLength;
            colJ["nullable"] = col.nullable;
            colJ["primaryKey"] = col.primaryKey;
            j["columns"].push_back(colJ);
        }
        res.body = j.dump();
        return res;
    }

    HttpResponse handleGetStats(const HttpRequest&) {
        HttpResponse res;
        nlohmann::json j;
        j["bufferPool"]["size"] = bufferPool_.getSize();
        j["bufferPool"]["hits"] = bufferPool_.getHits();
        j["bufferPool"]["misses"] = bufferPool_.getMisses();
        j["bufferPool"]["hitRate"] = bufferPool_.getHitRate();
        j["tables"] = nlohmann::json::array();
        for (auto& name : catalog_.getTableNames()) {
            nlohmann::json t;
            t["name"] = name;
            auto table = catalog_.getTable(name);
            if (table) t["rowCount"] = table->getRowCount();
            t["indexes"] = catalog_.getIndexes(name).size();
            j["tables"].push_back(t);
        }
        j["queryHistory"]["total"] = executor_.getQueryHistory().size();
        // Slow queries
        int slowCount = 0;
        for (auto& h : executor_.getQueryHistory()) {
            if (h.executionTimeMs > 100) slowCount++;
        }
        j["queryHistory"]["slowQueries"] = slowCount;
        res.body = j.dump();
        return res;
    }

    HttpResponse handleGetHistory(const HttpRequest&) {
        HttpResponse res;
        nlohmann::json j = nlohmann::json::array();
        auto& history = executor_.getQueryHistory();
        for (int i = static_cast<int>(history.size()) - 1; i >= 0 && i >= static_cast<int>(history.size()) - 100; i--) {
            nlohmann::json entry;
            entry["sql"] = history[i].sql;
            entry["executionTimeMs"] = history[i].executionTimeMs;
            entry["success"] = history[i].success;
            j.push_back(entry);
        }
        res.body = j.dump();
        return res;
    }

    HttpResponse handleGetTables(const HttpRequest&) {
        HttpResponse res;
        nlohmann::json j = nlohmann::json::array();
        for (auto& name : catalog_.getTableNames()) {
            j.push_back(name);
        }
        res.body = j.dump();
        return res;
    }

    HttpResponse handleExport(const std::string& tableName, const HttpRequest& req) {
        HttpResponse res;
        auto table = catalog_.getTable(tableName);
        if (!table) {
            res.statusCode = 404;
            res.body = R"({"error":"Table not found"})";
            return res;
        }

        std::string format = "json";
        auto it = req.params.find("format");
        if (it != req.params.end()) format = it->second;

        auto rows = table->scanAll();
        auto& schema = table->getSchema();

        if (format == "csv") {
            res.contentType = "text/csv";
            std::ostringstream oss;
            for (size_t i = 0; i < schema.columns.size(); i++) {
                if (i > 0) oss << ",";
                oss << schema.columns[i].name;
            }
            oss << "\n";
            for (auto& row : rows) {
                for (size_t i = 0; i < row.size(); i++) {
                    if (i > 0) oss << ",";
                    std::string val = valueToString(row[i]);
                    if (val.find(',') != std::string::npos || val.find('"') != std::string::npos) {
                        oss << "\"" << val << "\"";
                    } else {
                        oss << val;
                    }
                }
                oss << "\n";
            }
            res.body = oss.str();
        } else {
            nlohmann::json j;
            j["table"] = tableName;
            j["columns"] = nlohmann::json::array();
            for (auto& col : schema.columns) {
                j["columns"].push_back(col.name);
            }
            j["rows"] = nlohmann::json::array();
            for (auto& row : rows) {
                nlohmann::json jrow = nlohmann::json::object();
                for (size_t i = 0; i < schema.columns.size() && i < row.size(); i++) {
                    auto& val = row[i];
                    if (isNull(val)) jrow[schema.columns[i].name] = nullptr;
                    else if (auto* iv = std::get_if<int32_t>(&val)) jrow[schema.columns[i].name] = *iv;
                    else if (auto* fv = std::get_if<float>(&val)) jrow[schema.columns[i].name] = *fv;
                    else if (auto* sv = std::get_if<std::string>(&val)) jrow[schema.columns[i].name] = *sv;
                    else if (auto* bv = std::get_if<bool>(&val)) jrow[schema.columns[i].name] = *bv;
                }
                j["rows"].push_back(jrow);
            }
            res.body = j.dump(2);
        }
        return res;
    }

    HttpResponse handleImport(const HttpRequest& req) {
        HttpResponse res;
        try {
            auto body = nlohmann::json::parse(req.body);
            std::string tableName = body.value("table", "");
            if (tableName.empty()) {
                res.statusCode = 400;
                res.body = R"({"error":"Missing 'table' field"})";
                return res;
            }

            auto table = catalog_.getTable(tableName);
            if (!table) {
                res.statusCode = 404;
                res.body = R"({"error":"Table not found"})";
                return res;
            }

            const auto& schema = table->getSchema();
            auto& data = body["data"];
            int imported = 0;

            for (auto& rowJ : data) {
                Row row;
                for (auto& col : schema.columns) {
                    if (rowJ.contains(col.name) && !rowJ[col.name].is_null()) {
                        auto& v = rowJ[col.name];
                        if (v.is_number_integer()) row.push_back(static_cast<int32_t>(v.get<int>()));
                        else if (v.is_number_float()) row.push_back(v.get<float>());
                        else if (v.is_boolean()) row.push_back(v.get<bool>());
                        else if (v.is_string()) row.push_back(v.get<std::string>());
                        else row.push_back(std::monostate{});
                    } else {
                        row.push_back(std::monostate{});
                    }
                }
                if (table->insertRow(row)) imported++;
            }

            nlohmann::json j;
            j["success"] = true;
            j["imported"] = imported;
            res.body = j.dump();
        } catch (const std::exception& e) {
            res.statusCode = 400;
            nlohmann::json err;
            err["error"] = e.what();
            res.body = err.dump();
        }
        return res;
    }

    HttpRequest parseRequest(const std::string& raw) {
        HttpRequest req;
        std::istringstream stream(raw);
        std::string line;

        // Request line
        if (std::getline(stream, line)) {
            std::istringstream lineStream(line);
            lineStream >> req.method;
            std::string fullPath;
            lineStream >> fullPath;

            // Parse query params
            auto qpos = fullPath.find('?');
            if (qpos != std::string::npos) {
                req.path = fullPath.substr(0, qpos);
                std::string queryStr = fullPath.substr(qpos + 1);
                std::istringstream paramStream(queryStr);
                std::string param;
                while (std::getline(paramStream, param, '&')) {
                    auto eqPos = param.find('=');
                    if (eqPos != std::string::npos) {
                        req.params[param.substr(0, eqPos)] = param.substr(eqPos + 1);
                    }
                }
            } else {
                req.path = fullPath;
            }
        }

        // Headers
        while (std::getline(stream, line) && line != "\r" && !line.empty()) {
            if (line.back() == '\r') line.pop_back();
            auto colonPos = line.find(':');
            if (colonPos != std::string::npos) {
                std::string key = line.substr(0, colonPos);
                std::string value = line.substr(colonPos + 1);
                while (!value.empty() && value[0] == ' ') value.erase(0, 1);
                req.headers[key] = value;
            }
        }

        // Body
        auto contentLengthIt = req.headers.find("Content-Length");
        if (contentLengthIt != req.headers.end()) {
            size_t contentLength = std::stoul(contentLengthIt->second);
            // Read remaining from stream
            std::string remaining;
            std::getline(stream, remaining, '\0');
            if (remaining.size() >= contentLength) {
                req.body = remaining.substr(0, contentLength);
            } else {
                req.body = remaining;
            }
        }

        return req;
    }

    void sendResponse(socket_t clientSocket, const HttpResponse& res) {
        std::string responseStr = res.toString();
        send(clientSocket, responseStr.c_str(), static_cast<int>(responseStr.size()), 0);
        CLOSE_SOCKET(clientSocket);
    }

    int port_;
    Executor& executor_;
    Catalog& catalog_;
    BufferPool& bufferPool_;
    socket_t serverSocket_ = INVALID_SOCKET;
    std::atomic<bool> running_;
};

} // namespace shift_elite

