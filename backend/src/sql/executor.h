#pragma once
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <numeric>
#include <functional>
#include <cmath>
#include <regex>
#include <chrono>
#include <sstream>
#include "ast.h"
#include "tokenizer.h"
#include "parser.h"
#include "../catalog/catalog.h"
#include "../types/types.h"
#include <nlohmann/json.hpp>

namespace shift_elite {

struct QueryResult {
    bool success = true;
    std::string message;
    std::vector<std::string> columnNames;
    std::vector<std::string> columnTypes;
    std::vector<Row> rows;
    int rowsAffected = 0;
    double executionTimeMs = 0;
    std::string queryPlan;

    nlohmann::json toJson() const {
        nlohmann::json j;
        j["success"] = success;
        j["message"] = message;
        j["rowsAffected"] = rowsAffected;
        j["executionTimeMs"] = executionTimeMs;
        
        if (!columnNames.empty()) {
            j["columns"] = nlohmann::json::array();
            for (size_t i = 0; i < columnNames.size(); i++) {
                nlohmann::json col;
                col["name"] = columnNames[i];
                col["type"] = (i < columnTypes.size()) ? columnTypes[i] : "VARCHAR";
                j["columns"].push_back(col);
            }
        }

        j["rows"] = nlohmann::json::array();
        for (auto& row : rows) {
            nlohmann::json jrow = nlohmann::json::array();
            for (auto& val : row) {
                if (isNull(val)) jrow.push_back(nullptr);
                else if (auto* i = std::get_if<int32_t>(&val)) jrow.push_back(*i);
                else if (auto* f = std::get_if<float>(&val)) jrow.push_back(*f);
                else if (auto* s = std::get_if<std::string>(&val)) jrow.push_back(*s);
                else if (auto* b = std::get_if<bool>(&val)) jrow.push_back(*b);
            }
            j["rows"].push_back(jrow);
        }

        if (!queryPlan.empty()) j["queryPlan"] = queryPlan;
        return j;
    }
};

class Executor {
public:
    Executor(Catalog& catalog) : catalog_(catalog) {}

    QueryResult execute(const std::string& sql) {
        auto startTime = std::chrono::high_resolution_clock::now();
        QueryResult result;

        try {
            Tokenizer tokenizer(sql);
            auto tokens = tokenizer.tokenize();
            Parser parser(tokens);
            auto stmt = parser.parse();

            switch (stmt.type) {
                case StatementType::CREATE_TABLE: result = executeCreateTable(*stmt.createTable); break;
                case StatementType::DROP_TABLE: result = executeDropTable(*stmt.dropTable); break;
                case StatementType::INSERT: result = executeInsert(*stmt.insert); break;
                case StatementType::SELECT: result = executeSelect(*stmt.select); break;
                case StatementType::UPDATE: result = executeUpdate(*stmt.update); break;
                case StatementType::DELETE_STMT: result = executeDelete(*stmt.deleteStmt); break;
                case StatementType::SHOW_TABLES: result = executeShowTables(); break;
                case StatementType::DESCRIBE_TABLE: result = executeDescribe(*stmt.describeTable); break;
                case StatementType::CREATE_INDEX: result = executeCreateIndex(*stmt.createIndex); break;
                case StatementType::EXPLAIN: result = executeExplain(*stmt.explain); break;
                case StatementType::BEGIN_TX: result = {true, "Transaction started"}; break;
                case StatementType::COMMIT_TX: result = {true, "Transaction committed"}; break;
                case StatementType::ROLLBACK_TX: result = {true, "Transaction rolled back"}; break;
                default: result = {false, "Unknown statement type"}; break;
            }
        } catch (const std::exception& e) {
            result.success = false;
            result.message = std::string("Error: ") + e.what();
        }

        auto endTime = std::chrono::high_resolution_clock::now();
        result.executionTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();
        
        // Store in history
        queryHistory_.push_back({sql, result.executionTimeMs, result.success});
        if (queryHistory_.size() > 1000) queryHistory_.erase(queryHistory_.begin());

        return result;
    }

    struct QueryHistoryEntry {
        std::string sql;
        double executionTimeMs;
        bool success;
    };
    const std::vector<QueryHistoryEntry>& getQueryHistory() const { return queryHistory_; }

private:
    // ===== CREATE TABLE =====
    QueryResult executeCreateTable(const CreateTableStatement& stmt) {
        TableSchema schema;
        schema.name = stmt.tableName;
        schema.columns = stmt.columns;
        schema.primaryKeys = stmt.primaryKeys;

        if (catalog_.getSchema(schema.name) != nullptr) {
            if (stmt.ifNotExists) return {true, "Table already exists"};
            return {false, "Table '" + schema.name + "' already exists"};
        }

        if (catalog_.createTable(schema)) {
            return {true, "Table '" + schema.name + "' created successfully"};
        }
        return {false, "Failed to create table '" + schema.name + "'"};
    }

    // ===== DROP TABLE =====
    QueryResult executeDropTable(const DropTableStatement& stmt) {
        if (catalog_.getSchema(stmt.tableName) == nullptr) {
            if (stmt.ifExists) return {true, "Table does not exist"};
            return {false, "Table '" + stmt.tableName + "' does not exist"};
        }
        if (catalog_.dropTable(stmt.tableName)) {
            return {true, "Table '" + stmt.tableName + "' dropped"};
        }
        return {false, "Failed to drop table"};
    }

    // ===== INSERT =====
    QueryResult executeInsert(const InsertStatement& stmt) {
        auto table = catalog_.getTable(stmt.tableName);
        if (!table) return {false, "Table '" + stmt.tableName + "' not found"};

        const auto& schema = table->getSchema();
        int inserted = 0;

        for (auto& valExprs : stmt.values) {
            Row row;
            if (!stmt.columns.empty()) {
                // Named columns — fill with defaults/nulls
                row.resize(schema.columns.size(), std::monostate{});
                for (size_t i = 0; i < stmt.columns.size() && i < valExprs.size(); i++) {
                    int colIdx = schema.getColumnIndex(stmt.columns[i]);
                    if (colIdx < 0) return {false, "Unknown column: " + stmt.columns[i]};
                    row[colIdx] = evaluateExpr(valExprs[i], {}, {});
                }
            } else {
                // Positional
                for (size_t i = 0; i < valExprs.size(); i++) {
                    row.push_back(evaluateExpr(valExprs[i], {}, {}));
                }
                // Pad with nulls if needed
                while (row.size() < schema.columns.size()) {
                    row.push_back(std::monostate{});
                }
            }

            if (table->insertRow(row)) inserted++;
        }

        QueryResult result;
        result.success = true;
        result.message = std::to_string(inserted) + " row(s) inserted";
        result.rowsAffected = inserted;
        return result;
    }

    // ===== SELECT =====
    QueryResult executeSelect(const SelectStatement& stmt) {
        QueryResult result;
        result.success = true;
        
        // Get base table rows
        std::vector<Row> rows;
        std::vector<std::string> colNames;
        std::vector<std::string> colTypes;
        const TableSchema* baseSchema = nullptr;

        if (!stmt.fromTable.tableName.empty()) {
            auto table = catalog_.getTable(stmt.fromTable.tableName);
            if (!table) return {false, "Table '" + stmt.fromTable.tableName + "' not found"};
            baseSchema = &table->getSchema();
            rows = table->scanAll();

            for (auto& col : baseSchema->columns) {
                std::string prefix = stmt.fromTable.alias.empty() ? stmt.fromTable.tableName : stmt.fromTable.alias;
                colNames.push_back(col.name);
                colTypes.push_back(dataTypeToString(col.type));
            }
        }

        // Context for evaluation
        auto makeContext = [&](const Row& row) -> std::map<std::string, Value> {
            std::map<std::string, Value> ctx;
            if (baseSchema) {
                for (size_t i = 0; i < baseSchema->columns.size() && i < row.size(); i++) {
                    ctx[baseSchema->columns[i].name] = row[i];
                    // Also add with table prefix
                    std::string prefix = stmt.fromTable.alias.empty() ? stmt.fromTable.tableName : stmt.fromTable.alias;
                    ctx[prefix + "." + baseSchema->columns[i].name] = row[i];
                }
            }
            return ctx;
        };

        // Process JOINs
        for (auto& join : stmt.joins) {
            auto joinTable = catalog_.getTable(join.tableName);
            if (!joinTable) return {false, "Join table '" + join.tableName + "' not found"};
            const auto& joinSchema = joinTable->getSchema();
            auto joinRows = joinTable->scanAll();

            // Add join table columns to column names
            size_t origColCount = colNames.size();
            for (auto& col : joinSchema.columns) {
                colNames.push_back(col.name);
                colTypes.push_back(dataTypeToString(col.type));
            }

            std::vector<Row> joinedRows;

            if (join.type == JoinType::CROSS) {
                // Cross join
                for (auto& leftRow : rows) {
                    for (auto& rightRow : joinRows) {
                        Row newRow = leftRow;
                        newRow.insert(newRow.end(), rightRow.begin(), rightRow.end());
                        joinedRows.push_back(newRow);
                    }
                }
            } else {
                // Join with ON condition
                for (auto& leftRow : rows) {
                    bool matched = false;
                    for (auto& rightRow : joinRows) {
                        Row combinedRow = leftRow;
                        combinedRow.insert(combinedRow.end(), rightRow.begin(), rightRow.end());

                        // Build context for combined row
                        std::map<std::string, Value> ctx;
                        if (baseSchema) {
                            for (size_t i = 0; i < baseSchema->columns.size() && i < leftRow.size(); i++) {
                                ctx[baseSchema->columns[i].name] = leftRow[i];
                                std::string prefix = stmt.fromTable.alias.empty() ? stmt.fromTable.tableName : stmt.fromTable.alias;
                                ctx[prefix + "." + baseSchema->columns[i].name] = leftRow[i];
                            }
                        }
                        std::string joinPrefix = join.alias.empty() ? join.tableName : join.alias;
                        for (size_t i = 0; i < joinSchema.columns.size() && i < rightRow.size(); i++) {
                            ctx[joinSchema.columns[i].name] = rightRow[i];
                            ctx[joinPrefix + "." + joinSchema.columns[i].name] = rightRow[i];
                        }

                        bool matches = !join.onCondition || isTruthy(evaluateExpr(join.onCondition, ctx, {}));
                        if (matches) {
                            joinedRows.push_back(combinedRow);
                            matched = true;
                        }
                    }
                    // LEFT JOIN — add null row if no match
                    if (!matched && (join.type == JoinType::LEFT || join.type == JoinType::FULL)) {
                        Row newRow = leftRow;
                        for (size_t i = 0; i < joinSchema.columns.size(); i++)
                            newRow.push_back(std::monostate{});
                        joinedRows.push_back(newRow);
                    }
                }
                // RIGHT JOIN — add unmatched right rows
                if (join.type == JoinType::RIGHT || join.type == JoinType::FULL) {
                    for (auto& rightRow : joinRows) {
                        bool matched = false;
                        for (auto& leftRow : rows) {
                            Row combined = leftRow;
                            combined.insert(combined.end(), rightRow.begin(), rightRow.end());
                            std::map<std::string, Value> ctx;
                            if (baseSchema) {
                                for (size_t i = 0; i < baseSchema->columns.size() && i < leftRow.size(); i++) {
                                    ctx[baseSchema->columns[i].name] = leftRow[i];
                                }
                            }
                            std::string joinPrefix = join.alias.empty() ? join.tableName : join.alias;
                            for (size_t i = 0; i < joinSchema.columns.size() && i < rightRow.size(); i++) {
                                ctx[joinPrefix + "." + joinSchema.columns[i].name] = rightRow[i];
                            }
                            if (join.onCondition && isTruthy(evaluateExpr(join.onCondition, ctx, {}))) {
                                matched = true;
                                break;
                            }
                        }
                        if (!matched) {
                            Row newRow;
                            if (baseSchema) {
                                for (size_t i = 0; i < baseSchema->columns.size(); i++)
                                    newRow.push_back(std::monostate{});
                            }
                            newRow.insert(newRow.end(), rightRow.begin(), rightRow.end());
                            joinedRows.push_back(newRow);
                        }
                    }
                }
            }
            rows = joinedRows;
        }

        // WHERE filter
        if (stmt.whereClause) {
            std::vector<Row> filtered;
            for (auto& row : rows) {
                auto ctx = makeContext(row);
                if (isTruthy(evaluateExpr(stmt.whereClause, ctx, colNames))) {
                    filtered.push_back(row);
                }
            }
            rows = filtered;
        }

        // GROUP BY
        bool hasAggregates = false;
        for (auto& col : stmt.columns) {
            if (col->type == ExprType::AGGREGATE || 
                (col->type == ExprType::ALIAS && col->aliasExpr && col->aliasExpr->type == ExprType::AGGREGATE)) {
                hasAggregates = true;
                break;
            }
        }

        if (!stmt.groupBy.empty() || hasAggregates) {
            rows = executeGroupBy(rows, stmt, colNames, colTypes, makeContext);
            // After GROUP BY, columns are the SELECT list
            return buildSelectResult(rows, stmt, result, colNames, colTypes);
        }

        // Project columns
        return buildSelectResult(rows, stmt, result, colNames, colTypes);
    }

    QueryResult buildSelectResult(std::vector<Row>& rows, const SelectStatement& stmt,
                                  QueryResult& result,
                                  const std::vector<std::string>& allColNames,
                                  const std::vector<std::string>& allColTypes) {
        // ORDER BY
        if (!stmt.orderBy.empty()) {
            std::sort(rows.begin(), rows.end(), [&](const Row& a, const Row& b) {
                for (auto& item : stmt.orderBy) {
                    auto ctxA = buildRowCtx(a, allColNames);
                    auto ctxB = buildRowCtx(b, allColNames);
                    Value va = evaluateExpr(item.expr, ctxA, allColNames);
                    Value vb = evaluateExpr(item.expr, ctxB, allColNames);
                    int cmp = compareValues(va, vb);
                    if (cmp != 0) return item.ascending ? (cmp < 0) : (cmp > 0);
                }
                return false;
            });
        }

        // OFFSET + LIMIT
        if (stmt.offset > 0 && stmt.offset < static_cast<int>(rows.size())) {
            rows.erase(rows.begin(), rows.begin() + stmt.offset);
        }
        if (stmt.limit >= 0 && stmt.limit < static_cast<int>(rows.size())) {
            rows.resize(stmt.limit);
        }

        // Project SELECT columns
        bool selectStar = false;
        for (auto& col : stmt.columns) {
            if (col->type == ExprType::STAR) { selectStar = true; break; }
        }

        if (selectStar) {
            result.columnNames = allColNames;
            result.columnTypes = allColTypes;
            result.rows = rows;
        } else {
            // Evaluate SELECT expressions
            std::vector<std::string> outCols;
            std::vector<std::string> outTypes;
            for (auto& colExpr : stmt.columns) {
                if (colExpr->type == ExprType::ALIAS) {
                    outCols.push_back(colExpr->alias);
                } else if (colExpr->type == ExprType::COLUMN_REF) {
                    outCols.push_back(colExpr->columnName);
                } else if (colExpr->type == ExprType::AGGREGATE) {
                    outCols.push_back(aggregateName(colExpr));
                } else {
                    outCols.push_back("expr");
                }
                outTypes.push_back("VARCHAR");
            }

            std::vector<Row> projected;
            for (auto& row : rows) {
                auto ctx = buildRowCtx(row, allColNames);
                Row newRow;
                for (auto& colExpr : stmt.columns) {
                    ExprPtr evalExpr = (colExpr->type == ExprType::ALIAS) ? colExpr->aliasExpr : colExpr;
                    newRow.push_back(evaluateExpr(evalExpr, ctx, allColNames));
                }
                projected.push_back(newRow);
            }

            // DISTINCT
            if (stmt.distinct) {
                auto end = std::unique(projected.begin(), projected.end());
                projected.erase(end, projected.end());
            }

            result.columnNames = outCols;
            result.columnTypes = outTypes;
            result.rows = projected;
        }

        result.rowsAffected = static_cast<int>(result.rows.size());
        result.message = std::to_string(result.rows.size()) + " row(s) returned";
        return result;
    }

    // GROUP BY implementation
    std::vector<Row> executeGroupBy(std::vector<Row>& rows, const SelectStatement& stmt,
                                     const std::vector<std::string>& colNames,
                                     std::vector<std::string>& outColTypes,
                                     auto makeContext) {
        // Group rows by group-by keys
        std::map<std::vector<std::string>, std::vector<Row>> groups;
        
        if (stmt.groupBy.empty()) {
            // No GROUP BY but has aggregates — all rows are one group
            groups["__all__"] = rows;
        } else {
            for (auto& row : rows) {
                auto ctx = makeContext(row);
                std::vector<std::string> keyParts;
                for (auto& gbExpr : stmt.groupBy) {
                    keyParts.push_back(valueToString(evaluateExpr(gbExpr, ctx, colNames)));
                }
                std::string key;
                for (auto& p : keyParts) key += p + "|";
                groups[{key}].push_back(row);
            }
        }

        std::vector<Row> resultRows;
        for (auto& [key, groupRows] : groups) {
            Row outRow;
            for (auto& colExpr : stmt.columns) {
                ExprPtr evalExpr = (colExpr->type == ExprType::ALIAS) ? colExpr->aliasExpr : colExpr;
                
                if (evalExpr->type == ExprType::AGGREGATE) {
                    outRow.push_back(computeAggregate(evalExpr, groupRows, colNames, makeContext));
                } else {
                    // Non-aggregate - use first row
                    if (!groupRows.empty()) {
                        auto ctx = makeContext(groupRows[0]);
                        outRow.push_back(evaluateExpr(evalExpr, ctx, colNames));
                    } else {
                        outRow.push_back(std::monostate{});
                    }
                }
            }

            // HAVING
            if (stmt.havingClause) {
                // Build ctx for HAVING evaluation
                std::map<std::string, Value> havingCtx;
                for (size_t i = 0; i < stmt.columns.size() && i < outRow.size(); i++) {
                    std::string name;
                    if (stmt.columns[i]->type == ExprType::ALIAS) name = stmt.columns[i]->alias;
                    else if (stmt.columns[i]->type == ExprType::COLUMN_REF) name = stmt.columns[i]->columnName;
                    else name = "col" + std::to_string(i);
                    havingCtx[name] = outRow[i];
                }
                // Also need to evaluate any aggregate in HAVING
                if (!isTruthy(evaluateHaving(stmt.havingClause, groupRows, havingCtx, colNames, makeContext))) {
                    continue;
                }
            }
            resultRows.push_back(outRow);
        }
        return resultRows;
    }

    Value computeAggregate(const ExprPtr& expr, const std::vector<Row>& group,
                           const std::vector<std::string>& colNames, auto makeContext) {
        if (expr->aggType == AggregateType::COUNT) {
            if (expr->aggArg && expr->aggArg->type == ExprType::STAR) {
                return static_cast<int32_t>(group.size());
            }
            int count = 0;
            for (auto& row : group) {
                auto ctx = makeContext(row);
                Value v = evaluateExpr(expr->aggArg, ctx, colNames);
                if (!isNull(v)) count++;
            }
            return static_cast<int32_t>(count);
        }

        std::vector<Value> vals;
        for (auto& row : group) {
            auto ctx = makeContext(row);
            Value v = evaluateExpr(expr->aggArg, ctx, colNames);
            if (!isNull(v)) vals.push_back(v);
        }

        if (vals.empty()) return std::monostate{};

        if (expr->aggType == AggregateType::MIN) {
            Value minVal = vals[0];
            for (size_t i = 1; i < vals.size(); i++) {
                if (compareValues(vals[i], minVal) < 0) minVal = vals[i];
            }
            return minVal;
        }
        if (expr->aggType == AggregateType::MAX) {
            Value maxVal = vals[0];
            for (size_t i = 1; i < vals.size(); i++) {
                if (compareValues(vals[i], maxVal) > 0) maxVal = vals[i];
            }
            return maxVal;
        }

        // SUM / AVG
        float sum = 0;
        for (auto& v : vals) {
            if (auto* i = std::get_if<int32_t>(&v)) sum += *i;
            else if (auto* f = std::get_if<float>(&v)) sum += *f;
        }
        if (expr->aggType == AggregateType::SUM) return sum;
        if (expr->aggType == AggregateType::AVG) return sum / static_cast<float>(vals.size());

        return std::monostate{};
    }

    Value evaluateHaving(const ExprPtr& expr, const std::vector<Row>& group,
                         const std::map<std::string, Value>& ctx,
                         const std::vector<std::string>& colNames,
                         auto makeContext) {
        if (expr->type == ExprType::AGGREGATE) {
            return computeAggregate(expr, group, colNames, makeContext);
        }
        if (expr->type == ExprType::BINARY_OP) {
            Value left = evaluateHaving(expr->left, group, ctx, colNames, makeContext);
            Value right = evaluateHaving(expr->right, group, ctx, colNames, makeContext);
            return evaluateBinaryOp(expr->op, left, right);
        }
        if (expr->type == ExprType::LITERAL) return expr->literalValue;
        if (expr->type == ExprType::COLUMN_REF) {
            auto it = ctx.find(expr->columnName);
            if (it != ctx.end()) return it->second;
        }
        return std::monostate{};
    }

    // ===== UPDATE =====
    QueryResult executeUpdate(const UpdateStatement& stmt) {
        auto table = catalog_.getTable(stmt.tableName);
        if (!table) return {false, "Table '" + stmt.tableName + "' not found"};
        const auto& schema = table->getSchema();

        auto predicate = [&](const Row& row) -> bool {
            if (!stmt.whereClause) return true;
            auto ctx = buildRowCtxFromSchema(row, schema);
            return isTruthy(evaluateExpr(stmt.whereClause, ctx, {}));
        };

        auto updater = [&](const Row& row) -> Row {
            Row newRow = row;
            auto ctx = buildRowCtxFromSchema(row, schema);
            for (auto& [col, expr] : stmt.assignments) {
                int idx = schema.getColumnIndex(col);
                if (idx >= 0) {
                    newRow[idx] = evaluateExpr(expr, ctx, {});
                }
            }
            return newRow;
        };

        int updated = table->updateRows(predicate, updater);
        return {true, std::to_string(updated) + " row(s) updated", {}, {}, {}, updated};
    }

    // ===== DELETE =====
    QueryResult executeDelete(const DeleteStatement& stmt) {
        auto table = catalog_.getTable(stmt.tableName);
        if (!table) return {false, "Table '" + stmt.tableName + "' not found"};
        const auto& schema = table->getSchema();

        auto predicate = [&](const Row& row) -> bool {
            if (!stmt.whereClause) return true;
            auto ctx = buildRowCtxFromSchema(row, schema);
            return isTruthy(evaluateExpr(stmt.whereClause, ctx, {}));
        };

        int deleted = table->deleteRows(predicate);
        return {true, std::to_string(deleted) + " row(s) deleted", {}, {}, {}, deleted};
    }

    // ===== SHOW TABLES =====
    QueryResult executeShowTables() {
        auto names = catalog_.getTableNames();
        QueryResult result;
        result.success = true;
        result.columnNames = {"table_name"};
        result.columnTypes = {"VARCHAR"};
        for (auto& name : names) {
            result.rows.push_back({name});
        }
        result.message = std::to_string(names.size()) + " table(s)";
        return result;
    }

    // ===== DESCRIBE =====
    QueryResult executeDescribe(const DescribeTableStatement& stmt) {
        auto schema = catalog_.getSchema(stmt.tableName);
        if (!schema) return {false, "Table '" + stmt.tableName + "' not found"};

        QueryResult result;
        result.success = true;
        result.columnNames = {"column_name", "type", "nullable", "primary_key", "unique", "auto_increment"};
        result.columnTypes = {"VARCHAR", "VARCHAR", "VARCHAR", "VARCHAR", "VARCHAR", "VARCHAR"};

        for (auto& col : schema->columns) {
            Row row;
            row.push_back(col.name);
            std::string typeStr = dataTypeToString(col.type);
            if (col.type == DataType::VARCHAR && col.maxLength > 0) {
                typeStr += "(" + std::to_string(col.maxLength) + ")";
            }
            row.push_back(typeStr);
            row.push_back(std::string(col.nullable ? "YES" : "NO"));
            row.push_back(std::string(col.primaryKey ? "YES" : "NO"));
            row.push_back(std::string(col.unique ? "YES" : "NO"));
            row.push_back(std::string(col.autoIncrement ? "YES" : "NO"));
            result.rows.push_back(row);
        }
        result.message = std::to_string(schema->columns.size()) + " column(s)";
        return result;
    }

    // ===== CREATE INDEX =====
    QueryResult executeCreateIndex(const CreateIndexStatement& stmt) {
        if (!catalog_.getSchema(stmt.tableName)) {
            return {false, "Table '" + stmt.tableName + "' not found"};
        }
        IndexMeta idx;
        idx.name = stmt.indexName;
        idx.tableName = stmt.tableName;
        idx.columns = stmt.columns;
        idx.unique = stmt.unique;
        catalog_.createIndex(idx);
        return {true, "Index '" + stmt.indexName + "' created on '" + stmt.tableName + "'"};
    }

    // ===== EXPLAIN =====
    QueryResult executeExplain(const ExplainStatement& stmt) {
        QueryResult result;
        result.success = true;
        result.columnNames = {"id", "operation", "table", "details"};
        result.columnTypes = {"INT", "VARCHAR", "VARCHAR", "VARCHAR"};

        int id = 1;
        if (stmt.select) {
            auto& sel = *stmt.select;
            
            // Scan
            result.rows.push_back({static_cast<int32_t>(id++),
                std::string("TABLE SCAN"),
                sel.fromTable.tableName,
                std::string("Full table scan")});

            // Joins
            for (auto& join : sel.joins) {
                std::string joinTypeStr;
                switch (join.type) {
                    case JoinType::INNER: joinTypeStr = "INNER JOIN"; break;
                    case JoinType::LEFT: joinTypeStr = "LEFT JOIN"; break;
                    case JoinType::RIGHT: joinTypeStr = "RIGHT JOIN"; break;
                    case JoinType::FULL: joinTypeStr = "FULL JOIN"; break;
                    case JoinType::CROSS: joinTypeStr = "CROSS JOIN"; break;
                }
                result.rows.push_back({static_cast<int32_t>(id++),
                    joinTypeStr,
                    join.tableName,
                    std::string("Nested loop join")});
            }

            // WHERE
            if (sel.whereClause) {
                result.rows.push_back({static_cast<int32_t>(id++),
                    std::string("FILTER"),
                    std::string(""),
                    std::string("WHERE clause evaluation")});
            }

            // GROUP BY
            if (!sel.groupBy.empty()) {
                result.rows.push_back({static_cast<int32_t>(id++),
                    std::string("GROUP BY"),
                    std::string(""),
                    std::string("Hash aggregate")});
            }

            // ORDER BY
            if (!sel.orderBy.empty()) {
                result.rows.push_back({static_cast<int32_t>(id++),
                    std::string("SORT"),
                    std::string(""),
                    std::string("In-memory sort")});
            }

            // LIMIT
            if (sel.limit >= 0) {
                result.rows.push_back({static_cast<int32_t>(id++),
                    std::string("LIMIT"),
                    std::string(""),
                    std::string("Limit " + std::to_string(sel.limit))});
            }
        }
        result.message = "Query plan generated";
        return result;
    }

    // ===== Expression Evaluation =====
    Value evaluateExpr(const ExprPtr& expr, const std::map<std::string, Value>& ctx,
                       const std::vector<std::string>& colNames) {
        if (!expr) return std::monostate{};

        switch (expr->type) {
            case ExprType::LITERAL: return expr->literalValue;
            
            case ExprType::COLUMN_REF: {
                // Try table.column first
                if (!expr->tableName.empty()) {
                    auto it = ctx.find(expr->tableName + "." + expr->columnName);
                    if (it != ctx.end()) return it->second;
                }
                // Try column name directly
                auto it = ctx.find(expr->columnName);
                if (it != ctx.end()) return it->second;
                return std::monostate{};
            }

            case ExprType::BINARY_OP: {
                Value left = evaluateExpr(expr->left, ctx, colNames);
                // Short-circuit AND/OR
                if (expr->op == BinaryOp::AND) {
                    if (!isTruthy(left)) return false;
                    return evaluateExpr(expr->right, ctx, colNames);
                }
                if (expr->op == BinaryOp::OR) {
                    if (isTruthy(left)) return true;
                    return evaluateExpr(expr->right, ctx, colNames);
                }
                Value right = evaluateExpr(expr->right, ctx, colNames);
                return evaluateBinaryOp(expr->op, left, right);
            }

            case ExprType::UNARY_OP: {
                Value val = evaluateExpr(expr->operand, ctx, colNames);
                return !isTruthy(val);
            }

            case ExprType::IN_LIST: {
                Value left = evaluateExpr(expr->left, ctx, colNames);
                for (auto& item : expr->inList) {
                    Value v = evaluateExpr(item, ctx, colNames);
                    if (compareValues(left, v) == 0) return true;
                }
                return false;
            }

            case ExprType::LIKE_EXPR: {
                Value left = evaluateExpr(expr->left, ctx, colNames);
                if (auto* s = std::get_if<std::string>(&left)) {
                    return matchLike(*s, expr->likePattern);
                }
                return false;
            }

            case ExprType::IS_NULL: {
                Value val = evaluateExpr(expr->left, ctx, colNames);
                bool isNullVal = isNull(val);
                return expr->isNotNull ? !isNullVal : isNullVal;
            }

            case ExprType::BETWEEN_EXPR: {
                Value val = evaluateExpr(expr->left, ctx, colNames);
                Value low = evaluateExpr(expr->betweenLow, ctx, colNames);
                Value high = evaluateExpr(expr->betweenHigh, ctx, colNames);
                return (compareValues(val, low) >= 0 && compareValues(val, high) <= 0);
            }

            case ExprType::ALIAS:
                return evaluateExpr(expr->aliasExpr, ctx, colNames);

            case ExprType::STAR:
                return std::monostate{};

            default:
                return std::monostate{};
        }
    }

    Value evaluateBinaryOp(BinaryOp op, const Value& left, const Value& right) {
        if (isNull(left) || isNull(right)) {
            if (op == BinaryOp::EQ || op == BinaryOp::NEQ) return false;
            return std::monostate{};
        }

        switch (op) {
            case BinaryOp::EQ: return compareValues(left, right) == 0;
            case BinaryOp::NEQ: return compareValues(left, right) != 0;
            case BinaryOp::LT: return compareValues(left, right) < 0;
            case BinaryOp::GT: return compareValues(left, right) > 0;
            case BinaryOp::LTE: return compareValues(left, right) <= 0;
            case BinaryOp::GTE: return compareValues(left, right) >= 0;
            case BinaryOp::PLUS: return arithmeticOp(left, right, std::plus<>{});
            case BinaryOp::MINUS: return arithmeticOp(left, right, std::minus<>{});
            case BinaryOp::MUL: return arithmeticOp(left, right, std::multiplies<>{});
            case BinaryOp::DIV: return arithmeticOp(left, right, std::divides<>{});
            case BinaryOp::AND: return isTruthy(left) && isTruthy(right);
            case BinaryOp::OR: return isTruthy(left) || isTruthy(right);
            default: return std::monostate{};
        }
    }

    template<typename Op>
    Value arithmeticOp(const Value& left, const Value& right, Op op) {
        float l = toFloat(left), r = toFloat(right);
        if (r == 0 && std::is_same_v<Op, std::divides<>>) return std::monostate{};
        float result = op(l, r);
        // If both inputs were ints and result is whole, return int
        if (std::holds_alternative<int32_t>(left) && std::holds_alternative<int32_t>(right)) {
            if (result == std::floor(result) && !std::is_same_v<Op, std::divides<>>) {
                return static_cast<int32_t>(result);
            }
        }
        return result;
    }

    static float toFloat(const Value& v) {
        if (auto* i = std::get_if<int32_t>(&v)) return static_cast<float>(*i);
        if (auto* f = std::get_if<float>(&v)) return *f;
        if (auto* s = std::get_if<std::string>(&v)) {
            try { return std::stof(*s); } catch(...) {}
        }
        return 0;
    }

    static int compareValues(const Value& a, const Value& b) {
        if (isNull(a) && isNull(b)) return 0;
        if (isNull(a)) return -1;
        if (isNull(b)) return 1;

        // String comparison
        if (auto* sa = std::get_if<std::string>(&a)) {
            if (auto* sb = std::get_if<std::string>(&b)) return sa->compare(*sb);
            return sa->compare(valueToString(b));
        }
        if (auto* sb = std::get_if<std::string>(&b)) {
            if (auto* sa2 = std::get_if<std::string>(&a)) return sa2->compare(*sb);
        }

        // Numeric comparison
        float fa = toFloat(a), fb = toFloat(b);
        if (fa < fb) return -1;
        if (fa > fb) return 1;
        return 0;
    }

    static bool isTruthy(const Value& v) {
        if (isNull(v)) return false;
        if (auto* b = std::get_if<bool>(&v)) return *b;
        if (auto* i = std::get_if<int32_t>(&v)) return *i != 0;
        if (auto* f = std::get_if<float>(&v)) return *f != 0;
        if (auto* s = std::get_if<std::string>(&v)) return !s->empty();
        return false;
    }

    static bool matchLike(const std::string& str, const std::string& pattern) {
        // Convert SQL LIKE pattern to regex
        std::string regexStr;
        for (char c : pattern) {
            if (c == '%') regexStr += ".*";
            else if (c == '_') regexStr += ".";
            else if (std::string("^$.|?+()[]{}\\").find(c) != std::string::npos) {
                regexStr += '\\';
                regexStr += c;
            } else {
                regexStr += c;
            }
        }
        try {
            std::regex re(regexStr, std::regex::icase);
            return std::regex_match(str, re);
        } catch (...) {
            return false;
        }
    }

    std::map<std::string, Value> buildRowCtx(const Row& row, const std::vector<std::string>& colNames) {
        std::map<std::string, Value> ctx;
        for (size_t i = 0; i < colNames.size() && i < row.size(); i++) {
            ctx[colNames[i]] = row[i];
        }
        return ctx;
    }

    std::map<std::string, Value> buildRowCtxFromSchema(const Row& row, const TableSchema& schema) {
        std::map<std::string, Value> ctx;
        for (size_t i = 0; i < schema.columns.size() && i < row.size(); i++) {
            ctx[schema.columns[i].name] = row[i];
        }
        return ctx;
    }

    std::string aggregateName(const ExprPtr& expr) {
        std::string name;
        switch (expr->aggType) {
            case AggregateType::COUNT: name = "COUNT"; break;
            case AggregateType::SUM: name = "SUM"; break;
            case AggregateType::AVG: name = "AVG"; break;
            case AggregateType::MIN: name = "MIN"; break;
            case AggregateType::MAX: name = "MAX"; break;
        }
        if (expr->aggArg && expr->aggArg->type == ExprType::STAR) name += "(*)";
        else if (expr->aggArg && expr->aggArg->type == ExprType::COLUMN_REF) name += "(" + expr->aggArg->columnName + ")";
        return name;
    }

    Catalog& catalog_;
    std::vector<QueryHistoryEntry> queryHistory_;
};

} // namespace shift_elite

