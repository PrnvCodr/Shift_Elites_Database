#pragma once
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <fstream>
#include "../types/types.h"
#include "../storage/disk_manager.h"
#include "../storage/buffer_pool.h"
#include "../storage/table.h"
#include <nlohmann/json.hpp>

namespace shift_elite {

class Catalog {
public:
    Catalog(const std::string& dbPath, DiskManager& diskManager, BufferPool& bufferPool)
        : dbPath_(dbPath), diskManager_(diskManager), bufferPool_(bufferPool) {
        loadCatalog();
    }

    // Create a new table
    bool createTable(const TableSchema& schema) {
        if (tables_.find(schema.name) != tables_.end()) return false;
        
        diskManager_.createTableFile(schema.name);
        schemas_[schema.name] = schema;
        tables_[schema.name] = std::make_shared<Table>(schema, diskManager_, bufferPool_);
        saveCatalog();
        return true;
    }

    // Drop a table
    bool dropTable(const std::string& tableName) {
        if (tables_.find(tableName) == tables_.end()) return false;
        
        bufferPool_.evictTable(tableName);
        diskManager_.deleteTableFile(tableName);
        tables_.erase(tableName);
        schemas_.erase(tableName);
        indexes_.erase(tableName);
        saveCatalog();
        return true;
    }

    // Get table
    std::shared_ptr<Table> getTable(const std::string& tableName) {
        auto it = tables_.find(tableName);
        return (it != tables_.end()) ? it->second : nullptr;
    }

    // Get schema
    const TableSchema* getSchema(const std::string& tableName) const {
        auto it = schemas_.find(tableName);
        return (it != schemas_.end()) ? &it->second : nullptr;
    }

    // Get all table names
    std::vector<std::string> getTableNames() const {
        std::vector<std::string> names;
        for (const auto& [name, _] : schemas_) {
            names.push_back(name);
        }
        return names;
    }

    // Get all schemas
    const std::map<std::string, TableSchema>& getAllSchemas() const { return schemas_; }

    // Index management
    bool createIndex(const IndexMeta& idx) {
        indexes_[idx.tableName].push_back(idx);
        saveCatalog();
        return true;
    }

    std::vector<IndexMeta> getIndexes(const std::string& tableName) const {
        auto it = indexes_.find(tableName);
        return (it != indexes_.end()) ? it->second : std::vector<IndexMeta>{};
    }

private:
    void saveCatalog() {
        nlohmann::json j;
        for (const auto& [name, schema] : schemas_) {
            nlohmann::json tableJ;
            tableJ["name"] = schema.name;
            nlohmann::json cols = nlohmann::json::array();
            for (const auto& col : schema.columns) {
                nlohmann::json colJ;
                colJ["name"] = col.name;
                colJ["type"] = dataTypeToString(col.type);
                colJ["maxLength"] = col.maxLength;
                colJ["nullable"] = col.nullable;
                colJ["primaryKey"] = col.primaryKey;
                colJ["unique"] = col.unique;
                colJ["autoIncrement"] = col.autoIncrement;
                cols.push_back(colJ);
            }
            tableJ["columns"] = cols;
            tableJ["primaryKeys"] = schema.primaryKeys;
            j["tables"][name] = tableJ;
        }
        // Indexes
        for (const auto& [tableName, idxs] : indexes_) {
            for (const auto& idx : idxs) {
                nlohmann::json idxJ;
                idxJ["name"] = idx.name;
                idxJ["table"] = idx.tableName;
                idxJ["columns"] = idx.columns;
                idxJ["unique"] = idx.unique;
                idxJ["isHash"] = idx.isHash;
                j["indexes"].push_back(idxJ);
            }
        }

        std::ofstream f(dbPath_ + "/catalog.json");
        f << j.dump(2);
    }

    void loadCatalog() {
        std::ifstream f(dbPath_ + "/catalog.json");
        if (!f.good()) return;

        try {
            nlohmann::json j;
            f >> j;

            if (j.contains("tables")) {
                for (auto& [name, tableJ] : j["tables"].items()) {
                    TableSchema schema;
                    schema.name = tableJ["name"];
                    for (auto& colJ : tableJ["columns"]) {
                        ColumnDef col;
                        col.name = colJ["name"];
                        col.type = stringToDataType(colJ["type"]);
                        col.maxLength = colJ.value("maxLength", 0);
                        col.nullable = colJ.value("nullable", true);
                        col.primaryKey = colJ.value("primaryKey", false);
                        col.unique = colJ.value("unique", false);
                        col.autoIncrement = colJ.value("autoIncrement", false);
                        schema.columns.push_back(col);
                    }
                    if (tableJ.contains("primaryKeys"))
                        schema.primaryKeys = tableJ["primaryKeys"].get<std::vector<std::string>>();
                    schemas_[name] = schema;
                    if (diskManager_.tableFileExists(name)) {
                        tables_[name] = std::make_shared<Table>(schema, diskManager_, bufferPool_);
                    }
                }
            }

            if (j.contains("indexes")) {
                for (auto& idxJ : j["indexes"]) {
                    IndexMeta idx;
                    idx.name = idxJ["name"];
                    idx.tableName = idxJ["table"];
                    idx.columns = idxJ["columns"].get<std::vector<std::string>>();
                    idx.unique = idxJ.value("unique", false);
                    idx.isHash = idxJ.value("isHash", false);
                    indexes_[idx.tableName].push_back(idx);
                }
            }
        } catch (...) {
            // Corrupted catalog - start fresh
        }
    }

    std::string dbPath_;
    DiskManager& diskManager_;
    BufferPool& bufferPool_;
    std::map<std::string, TableSchema> schemas_;
    std::map<std::string, std::shared_ptr<Table>> tables_;
    std::map<std::string, std::vector<IndexMeta>> indexes_;
};

} // namespace shift_elite

