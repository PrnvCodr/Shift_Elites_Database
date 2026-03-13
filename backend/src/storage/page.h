#pragma once
#include <cstdint>
#include <cstring>
#include <array>
#include "../types/types.h"

namespace shift_elite {

/*
 * Page Layout:
 * [PageHeader (32 bytes)]
 * [Slot Directory grows from end of header forward]
 * [Free space]
 * [Tuple data grows from end of page backward]
 */

struct PageHeader {
    uint32_t pageId = 0;
    uint32_t numSlots = 0;
    uint32_t freeSpaceOffset = sizeof(PageHeader); // offset to start of free space
    uint32_t tupleDataOffset = PAGE_SIZE;           // offset to start of tuple data
    uint32_t nextPageId = 0;                        // for overflow / linked list
    uint32_t prevPageId = 0;
    uint32_t flags = 0;                             // page type flags
    uint32_t reserved = 0;
};

struct SlotEntry {
    uint32_t offset = 0; // offset from start of page
    uint32_t length = 0; // length of tuple
    bool occupied = false;
    uint8_t padding[3] = {};
};

class Page {
public:
    Page() {
        std::memset(data_.data(), 0, PAGE_SIZE);
        auto* header = getHeader();
        header->freeSpaceOffset = sizeof(PageHeader);
        header->tupleDataOffset = PAGE_SIZE;
    }

    explicit Page(uint32_t pageId) : Page() {
        getHeader()->pageId = pageId;
    }

    // Access raw data
    char* getData() { return data_.data(); }
    const char* getData() const { return data_.data(); }

    // Header access
    PageHeader* getHeader() {
        return reinterpret_cast<PageHeader*>(data_.data());
    }
    const PageHeader* getHeader() const {
        return reinterpret_cast<const PageHeader*>(data_.data());
    }

    uint32_t getPageId() const { return getHeader()->pageId; }
    void setPageId(uint32_t id) { getHeader()->pageId = id; }

    // Slot directory management
    SlotEntry* getSlot(uint32_t slotNum) {
        size_t offset = sizeof(PageHeader) + slotNum * sizeof(SlotEntry);
        return reinterpret_cast<SlotEntry*>(data_.data() + offset);
    }

    const SlotEntry* getSlot(uint32_t slotNum) const {
        size_t offset = sizeof(PageHeader) + slotNum * sizeof(SlotEntry);
        return reinterpret_cast<const SlotEntry*>(data_.data() + offset);
    }

    // How much free space remains
    size_t getFreeSpace() const {
        auto* header = getHeader();
        size_t slotsDirEnd = sizeof(PageHeader) + header->numSlots * sizeof(SlotEntry);
        if (header->tupleDataOffset <= slotsDirEnd) return 0;
        return header->tupleDataOffset - slotsDirEnd - sizeof(SlotEntry); // minus one for new slot
    }

    // Insert a tuple, returns slot number or -1 on failure
    int insertTuple(const char* tupleData, uint32_t tupleLen) {
        if (getFreeSpace() < tupleLen + sizeof(SlotEntry)) return -1;

        auto* header = getHeader();
        
        // Find a free slot or add new one
        int slotNum = -1;
        for (uint32_t i = 0; i < header->numSlots; i++) {
            if (!getSlot(i)->occupied) {
                slotNum = static_cast<int>(i);
                break;
            }
        }
        if (slotNum == -1) {
            slotNum = static_cast<int>(header->numSlots);
            header->numSlots++;
        }

        // Write tuple data at the end (growing backwards)
        header->tupleDataOffset -= tupleLen;
        std::memcpy(data_.data() + header->tupleDataOffset, tupleData, tupleLen);

        // Update slot directory
        auto* slot = getSlot(slotNum);
        slot->offset = header->tupleDataOffset;
        slot->length = tupleLen;
        slot->occupied = true;

        return slotNum;
    }

    // Get a tuple by slot number
    bool getTuple(uint32_t slotNum, char* outData, uint32_t& outLen) const {
        auto* header = getHeader();
        if (slotNum >= header->numSlots) return false;
        auto* slot = getSlot(slotNum);
        if (!slot->occupied) return false;
        outLen = slot->length;
        std::memcpy(outData, data_.data() + slot->offset, slot->length);
        return true;
    }

    // Delete tuple by slot
    bool deleteTuple(uint32_t slotNum) {
        auto* header = getHeader();
        if (slotNum >= header->numSlots) return false;
        auto* slot = getSlot(slotNum);
        if (!slot->occupied) return false;
        slot->occupied = false;
        // Note: we don't reclaim space until compaction
        return true;
    }

    // Count occupied slots
    uint32_t getNumTuples() const {
        auto* header = getHeader();
        uint32_t count = 0;
        for (uint32_t i = 0; i < header->numSlots; i++) {
            if (getSlot(i)->occupied) count++;
        }
        return count;
    }

private:
    std::array<char, PAGE_SIZE> data_;
};

} // namespace shift_elite

