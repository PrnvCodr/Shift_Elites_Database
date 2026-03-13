#pragma once
#include <string>
#include <fstream>
#include <mutex>
#include <unordered_map>
#include "page.h"

namespace shift_elite {

class DiskManager {
public:
    explicit DiskManager(const std::string& dbPath) : dbPath_(dbPath) {}
    ~DiskManager() { closeAll(); }

    // Read a page from a table's file
    bool readPage(const std::string& tableName, uint32_t pageId, Page& page) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto& file = getFile(tableName);
        size_t offset = static_cast<size_t>(pageId) * PAGE_SIZE;
        file.seekg(offset);
        if (!file.good()) return false;
        file.read(page.getData(), PAGE_SIZE);
        return file.good() || file.eof();
    }

    // Write a page to a table's file
    bool writePage(const std::string& tableName, uint32_t pageId, const Page& page) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto& file = getFile(tableName);
        size_t offset = static_cast<size_t>(pageId) * PAGE_SIZE;
        file.seekp(offset);
        file.write(page.getData(), PAGE_SIZE);
        file.flush();
        return file.good();
    }

    // Allocate a new page (returns new page ID)
    uint32_t allocatePage(const std::string& tableName) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto& file = getFile(tableName);
        file.seekg(0, std::ios::end);
        size_t fileSize = file.tellg();
        uint32_t newPageId = static_cast<uint32_t>(fileSize / PAGE_SIZE);
        
        // Write empty page
        Page emptyPage(newPageId);
        file.seekp(0, std::ios::end);
        file.write(emptyPage.getData(), PAGE_SIZE);
        file.flush();
        return newPageId;
    }

    // Get number of pages in a table file
    uint32_t getNumPages(const std::string& tableName) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto& file = getFile(tableName);
        file.seekg(0, std::ios::end);
        size_t fileSize = file.tellg();
        return static_cast<uint32_t>(fileSize / PAGE_SIZE);
    }

    // Create a new table file
    bool createTableFile(const std::string& tableName) {
        std::string path = dbPath_ + "/" + tableName + ".nxdb";
        std::ofstream create(path, std::ios::binary);
        if (!create.good()) return false;
        create.close();
        return true;
    }

    // Delete a table file
    bool deleteTableFile(const std::string& tableName) {
        closeFile(tableName);
        std::string path = dbPath_ + "/" + tableName + ".nxdb";
        return std::remove(path.c_str()) == 0;
    }

    bool tableFileExists(const std::string& tableName) {
        std::string path = dbPath_ + "/" + tableName + ".nxdb";
        std::ifstream f(path);
        return f.good();
    }

private:
    std::fstream& getFile(const std::string& tableName) {
        if (files_.find(tableName) == files_.end()) {
            std::string path = dbPath_ + "/" + tableName + ".nxdb";
            files_[tableName].open(path, std::ios::in | std::ios::out | std::ios::binary);
            if (!files_[tableName].is_open()) {
                // Try creating it
                std::ofstream create(path, std::ios::binary);
                create.close();
                files_[tableName].open(path, std::ios::in | std::ios::out | std::ios::binary);
            }
        }
        return files_[tableName];
    }

    void closeFile(const std::string& tableName) {
        auto it = files_.find(tableName);
        if (it != files_.end()) {
            it->second.close();
            files_.erase(it);
        }
    }

    void closeAll() {
        for (auto& [name, file] : files_) {
            file.close();
        }
        files_.clear();
    }

    std::string dbPath_;
    std::unordered_map<std::string, std::fstream> files_;
    std::mutex mutex_;
};

} // namespace shift_elite

