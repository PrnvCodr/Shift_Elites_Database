#pragma once
#include <string>
#include <variant>
#include <vector>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <sstream>
#include <iomanip>
#include <chrono>

namespace shift_elite {

enum class DataType {
    INT,
    FLOAT,
    VARCHAR,
    BOOLEAN,
    DATE,
    TIMESTAMP
};

inline std::string dataTypeToString(DataType type) {
    switch (type) {
        case DataType::INT: return "INT";
        case DataType::FLOAT: return "FLOAT";
        case DataType::VARCHAR: return "VARCHAR";
        case DataType::BOOLEAN: return "BOOLEAN";
        case DataType::DATE: return "DATE";
        case DataType::TIMESTAMP: return "TIMESTAMP";
        default: return "UNKNOWN";
    }
}

inline DataType stringToDataType(const std::string& s) {
    if (s == "INT" || s == "INTEGER") return DataType::INT;
    if (s == "FLOAT" || s == "DOUBLE" || s == "REAL") return DataType::FLOAT;
    if (s == "VARCHAR" || s == "TEXT" || s == "STRING") return DataType::VARCHAR;
    if (s == "BOOLEAN" || s == "BOOL") return DataType::BOOLEAN;
    if (s == "DATE") return DataType::DATE;
    if (s == "TIMESTAMP") return DataType::TIMESTAMP;
    throw std::runtime_error("Unknown data type: " + s);
}

// A Value can hold any supported type
using Value = std::variant<std::monostate, int32_t, float, std::string, bool>;

inline bool isNull(const Value& v) {
    return std::holds_alternative<std::monostate>(v);
}

inline std::string valueToString(const Value& v) {
    if (isNull(v)) return "NULL";
    if (auto* i = std::get_if<int32_t>(&v)) return std::to_string(*i);
    if (auto* f = std::get_if<float>(&v)) {
        std::ostringstream oss;
        oss << *f;
        return oss.str();
    }
    if (auto* s = std::get_if<std::string>(&v)) return *s;
    if (auto* b = std::get_if<bool>(&v)) return *b ? "true" : "false";
    return "NULL";
}

inline Value stringToValue(DataType type, const std::string& s) {
    if (s == "NULL" || s.empty()) return std::monostate{};
    switch (type) {
        case DataType::INT: return static_cast<int32_t>(std::stoi(s));
        case DataType::FLOAT: return std::stof(s);
        case DataType::VARCHAR:
        case DataType::DATE:
        case DataType::TIMESTAMP: return s;
        case DataType::BOOLEAN: return (s == "true" || s == "1" || s == "TRUE");
        default: return std::monostate{};
    }
}

// Column definition
struct ColumnDef {
    std::string name;
    DataType type;
    int maxLength = 0; // for VARCHAR
    bool nullable = true;
    bool primaryKey = false;
    bool unique = false;
    bool autoIncrement = false;
    Value defaultValue;
};

// A Row is a vector of Values
using Row = std::vector<Value>;

// Table schema
struct TableSchema {
    std::string name;
    std::vector<ColumnDef> columns;
    std::vector<std::string> primaryKeys;
    
    int getColumnIndex(const std::string& colName) const {
        for (int i = 0; i < static_cast<int>(columns.size()); i++) {
            if (columns[i].name == colName) return i;
        }
        return -1;
    }
    
    bool hasColumn(const std::string& colName) const {
        return getColumnIndex(colName) >= 0;
    }
};

// Constants
constexpr size_t PAGE_SIZE = 4096;
constexpr size_t BUFFER_POOL_SIZE = 1024; // pages

// Foreign key
struct ForeignKey {
    std::string columnName;
    std::string refTable;
    std::string refColumn;
};

// Index metadata
struct IndexMeta {
    std::string name;
    std::string tableName;
    std::vector<std::string> columns;
    bool unique = false;
    bool isHash = false;
};

} // namespace shift_elite

