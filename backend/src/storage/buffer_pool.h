#pragma once
#include <list>
#include <mutex>
#include <unordered_map>
#include <memory>
#include "page.h"
#include "disk_manager.h"

namespace shift_elite {

struct BufferFrame {
    Page page;
    std::string tableName;
    uint32_t pageId = 0;
    bool dirty = false;
    int pinCount = 0;
};

class BufferPool {
public:
    explicit BufferPool(DiskManager& diskManager, size_t poolSize = BUFFER_POOL_SIZE)
        : diskManager_(diskManager), maxSize_(poolSize) {}

    ~BufferPool() { flushAll(); }

    // Fetch a page - returns pointer to buffered page
    Page* fetchPage(const std::string& tableName, uint32_t pageId) {
        std::lock_guard<std::mutex> lock(mutex_);
        
        auto key = makeKey(tableName, pageId);
        auto it = pageMap_.find(key);
        if (it != pageMap_.end()) {
            // Move to front (most recently used)
            auto& frame = it->second;
            frame->pinCount++;
            hits_++;
            // Move to front in LRU
            auto listIt = std::find(lruList_.begin(), lruList_.end(), key);
            if (listIt != lruList_.end()) {
                lruList_.erase(listIt);
                lruList_.push_front(key);
            }
            return &frame->page;
        }

        misses_++;
        // Page not in buffer - evict if necessary
        if (pageMap_.size() >= maxSize_) {
            evictPage();
        }

        // Load page from disk
        auto frame = std::make_shared<BufferFrame>();
        frame->tableName = tableName;
        frame->pageId = pageId;
        frame->pinCount = 1;
        diskManager_.readPage(tableName, pageId, frame->page);
        frame->page.setPageId(pageId);

        pageMap_[key] = frame;
        lruList_.push_front(key);
        return &frame->page;
    }

    // Mark page as dirty
    void markDirty(const std::string& tableName, uint32_t pageId) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto key = makeKey(tableName, pageId);
        auto it = pageMap_.find(key);
        if (it != pageMap_.end()) {
            it->second->dirty = true;
        }
    }

    // Unpin a page
    void unpinPage(const std::string& tableName, uint32_t pageId) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto key = makeKey(tableName, pageId);
        auto it = pageMap_.find(key);
        if (it != pageMap_.end() && it->second->pinCount > 0) {
            it->second->pinCount--;
        }
    }

    // Flush a specific page
    void flushPage(const std::string& tableName, uint32_t pageId) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto key = makeKey(tableName, pageId);
        auto it = pageMap_.find(key);
        if (it != pageMap_.end() && it->second->dirty) {
            diskManager_.writePage(tableName, pageId, it->second->page);
            it->second->dirty = false;
        }
    }

    // Flush all dirty pages
    void flushAll() {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& [key, frame] : pageMap_) {
            if (frame->dirty) {
                diskManager_.writePage(frame->tableName, frame->pageId, frame->page);
                frame->dirty = false;
            }
        }
    }

    // Remove all pages for a table (used on DROP TABLE)
    void evictTable(const std::string& tableName) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<std::string> toRemove;
        for (auto& [key, frame] : pageMap_) {
            if (frame->tableName == tableName) {
                if (frame->dirty) {
                    diskManager_.writePage(frame->tableName, frame->pageId, frame->page);
                }
                toRemove.push_back(key);
            }
        }
        for (auto& key : toRemove) {
            pageMap_.erase(key);
            lruList_.remove(key);
        }
    }

    // Stats
    size_t getSize() const { return pageMap_.size(); }
    uint64_t getHits() const { return hits_; }
    uint64_t getMisses() const { return misses_; }
    double getHitRate() const {
        uint64_t total = hits_ + misses_;
        return total > 0 ? static_cast<double>(hits_) / total : 0.0;
    }

private:
    std::string makeKey(const std::string& table, uint32_t pageId) {
        return table + ":" + std::to_string(pageId);
    }

    void evictPage() {
        // LRU eviction - find unpinned page from back
        for (auto it = lruList_.rbegin(); it != lruList_.rend(); ++it) {
            auto mapIt = pageMap_.find(*it);
            if (mapIt != pageMap_.end() && mapIt->second->pinCount == 0) {
                if (mapIt->second->dirty) {
                    diskManager_.writePage(mapIt->second->tableName,
                                          mapIt->second->pageId,
                                          mapIt->second->page);
                }
                pageMap_.erase(mapIt);
                lruList_.erase(std::next(it).base());
                return;
            }
        }
    }

    DiskManager& diskManager_;
    size_t maxSize_;
    std::unordered_map<std::string, std::shared_ptr<BufferFrame>> pageMap_;
    std::list<std::string> lruList_;
    std::mutex mutex_;
    uint64_t hits_ = 0;
    uint64_t misses_ = 0;
};

} // namespace shift_elite

