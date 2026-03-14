#pragma once
#include <string>
#include <vector>
#include <cstring>
#include <functional>
#include "../types/types.h"
#include "page.h"
#include "disk_manager.h"
#include "buffer_pool.h"

namespace shift_elite {

class Table {
public:
    Table(const TableSchema& schema, DiskManager& diskManager, BufferPool& bufferPool)
        : schema_(schema), diskManager_(diskManager), bufferPool_(bufferPool) {
        if (!diskManager_.tableFileExists(schema.name)) {
            diskManager_.createTableFile(schema.name);
            diskManager_.allocatePage(schema.name); // page 0 = header page
        }
    }

    const TableSchema& getSchema() const { return schema_; }

    // Serialize a row into bytes
    static std::vector<char> serializeRow(const Row& row, const TableSchema& schema) {
        std::vector<char> data;
        // Null bitmap
        size_t numCols = schema.columns.size();
        size_t bitmapBytes = (numCols + 7) / 8;
        data.resize(bitmapBytes, 0);

        for (size_t i = 0; i < numCols; i++) {
            if (isNull(row[i])) {
                data[i / 8] |= (1 << (i % 8));
                continue;
            }
            const auto& col = schema.columns[i];
            switch (col.type) {
                case DataType::INT: {
                    int32_t val = std::get<int32_t>(row[i]);
                    const char* bytes = reinterpret_cast<const char*>(&val);
                    data.insert(data.end(), bytes, bytes + sizeof(int32_t));
                    break;
                }
                case DataType::FLOAT: {
                    float val = std::get<float>(row[i]);
                    const char* bytes = reinterpret_cast<const char*>(&val);
                    data.insert(data.end(), bytes, bytes + sizeof(float));
                    break;
                }
                case DataType::BOOLEAN: {
                    bool val = std::get<bool>(row[i]);
                    data.push_back(val ? 1 : 0);
                    break;
                }
                case DataType::VARCHAR:
                case DataType::DATE:
                case DataType::TIMESTAMP: {
                    const std::string& val = std::get<std::string>(row[i]);
                    uint16_t len = static_cast<uint16_t>(val.size());
                    const char* lenBytes = reinterpret_cast<const char*>(&len);
                    data.insert(data.end(), lenBytes, lenBytes + sizeof(uint16_t));
                    data.insert(data.end(), val.begin(), val.end());
                    break;
                }
            }
        }
        return data;
    }

    // Deserialize bytes into a row
    static Row deserializeRow(const char* data, uint32_t len, const TableSchema& schema) {
        Row row;
        size_t numCols = schema.columns.size();
        size_t bitmapBytes = (numCols + 7) / 8;
        size_t offset = bitmapBytes;

        for (size_t i = 0; i < numCols; i++) {
            // Check null bitmap
            if (data[i / 8] & (1 << (i % 8))) {
                row.push_back(std::monostate{});
                continue;
            }
            const auto& col = schema.columns[i];
            switch (col.type) {
                case DataType::INT: {
                    int32_t val;
                    std::memcpy(&val, data + offset, sizeof(int32_t));
                    offset += sizeof(int32_t);
                    row.push_back(val);
                    break;
                }
                case DataType::FLOAT: {
                    float val;
                    std::memcpy(&val, data + offset, sizeof(float));
                    offset += sizeof(float);
                    row.push_back(val);
                    break;
                }
                case DataType::BOOLEAN: {
                    bool val = data[offset] != 0;
                    offset += 1;
                    row.push_back(val);
                    break;
                }
                case DataType::VARCHAR:
                case DataType::DATE:
                case DataType::TIMESTAMP: {
                    uint16_t slen;
                    std::memcpy(&slen, data + offset, sizeof(uint16_t));
                    offset += sizeof(uint16_t);
                    std::string val(data + offset, slen);
                    offset += slen;
                    row.push_back(val);
                    break;
                }
            }
        }
        return row;
    }

    // Insert a row
    bool insertRow(const Row& row) {
        auto serialized = serializeRow(row, schema_);
        uint32_t numPages = diskManager_.getNumPages(schema_.name);
        if (numPages == 0) {
            diskManager_.allocatePage(schema_.name);
            numPages = 1;
        }

        // Try to insert into existing pages
        for (uint32_t pid = 0; pid < numPages; pid++) {
            Page* page = bufferPool_.fetchPage(schema_.name, pid);
            int slot = page->insertTuple(serialized.data(), static_cast<uint32_t>(serialized.size()));
            if (slot >= 0) {
                bufferPool_.markDirty(schema_.name, pid);
                bufferPool_.unpinPage(schema_.name, pid);
                rowCount_++;
                return true;
            }
            bufferPool_.unpinPage(schema_.name, pid);
        }

        // All pages full, allocate new page
        uint32_t newPid = diskManager_.allocatePage(schema_.name);
        Page* page = bufferPool_.fetchPage(schema_.name, newPid);
        int slot = page->insertTuple(serialized.data(), static_cast<uint32_t>(serialized.size()));
        if (slot >= 0) {
            bufferPool_.markDirty(schema_.name, newPid);
            bufferPool_.unpinPage(schema_.name, newPid);
            rowCount_++;
            return true;
        }
        bufferPool_.unpinPage(schema_.name, newPid);
        return false;
    }

    // Scan all rows
    std::vector<Row> scanAll() {
        std::vector<Row> results;
        uint32_t numPages = diskManager_.getNumPages(schema_.name);

        for (uint32_t pid = 0; pid < numPages; pid++) {
            Page* page = bufferPool_.fetchPage(schema_.name, pid);
            auto* header = page->getHeader();
            for (uint32_t s = 0; s < header->numSlots; s++) {
                auto* slot = page->getSlot(s);
                if (slot->occupied) {
                    char buffer[PAGE_SIZE];
                    uint32_t len = 0;
                    if (page->getTuple(s, buffer, len)) {
                        results.push_back(deserializeRow(buffer, len, schema_));
                    }
                }
            }
            bufferPool_.unpinPage(schema_.name, pid);
        }
        return results;
    }

    // Delete rows matching a predicate (returns count)
    int deleteRows(std::function<bool(const Row&)> predicate) {
        int deleted = 0;
        uint32_t numPages = diskManager_.getNumPages(schema_.name);

        for (uint32_t pid = 0; pid < numPages; pid++) {
            Page* page = bufferPool_.fetchPage(schema_.name, pid);
            auto* header = page->getHeader();
            for (uint32_t s = 0; s < header->numSlots; s++) {
                auto* slot = page->getSlot(s);
                if (slot->occupied) {
                    char buffer[PAGE_SIZE];
                    uint32_t len = 0;
                    if (page->getTuple(s, buffer, len)) {
                        Row row = deserializeRow(buffer, len, schema_);
                        if (predicate(row)) {
                            page->deleteTuple(s);
                            bufferPool_.markDirty(schema_.name, pid);
                            deleted++;
                        }
                    }
                }
            }
            bufferPool_.unpinPage(schema_.name, pid);
        }
        rowCount_ -= deleted;
        return deleted;
    }

    // Update rows matching a predicate
    int updateRows(std::function<bool(const Row&)> predicate,
                   std::function<Row(const Row&)> updater) {
        int updated = 0;
        // Collect rows to update and delete originals
        std::vector<Row> toInsert;
        uint32_t numPages = diskManager_.getNumPages(schema_.name);

        for (uint32_t pid = 0; pid < numPages; pid++) {
            Page* page = bufferPool_.fetchPage(schema_.name, pid);
            auto* header = page->getHeader();
            for (uint32_t s = 0; s < header->numSlots; s++) {
                auto* slot = page->getSlot(s);
                if (slot->occupied) {
                    char buffer[PAGE_SIZE];
                    uint32_t len = 0;
                    if (page->getTuple(s, buffer, len)) {
                        Row row = deserializeRow(buffer, len, schema_);
                        if (predicate(row)) {
                            Row newRow = updater(row);
                            page->deleteTuple(s);
                            bufferPool_.markDirty(schema_.name, pid);
                            toInsert.push_back(newRow);
                            updated++;
                        }
                    }
                }
            }
            bufferPool_.unpinPage(schema_.name, pid);
        }
        // Re-insert updated rows
        for (auto& row : toInsert) {
            insertRow(row);
            rowCount_--; // insertRow increments, but we're replacing
        }
        return updated;
    }

    uint64_t getRowCount() const { return rowCount_; }

private:
    TableSchema schema_;
    DiskManager& diskManager_;
    BufferPool& bufferPool_;
    uint64_t rowCount_ = 0;
};

} // namespace shift_elite

