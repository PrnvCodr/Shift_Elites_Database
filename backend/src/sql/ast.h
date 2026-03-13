#pragma once
#include <string>
#include <vector>
#include <memory>
#include <variant>
#include "../types/types.h"

namespace shift_elite {

// Forward declarations
struct Expression;
using ExprPtr = std::shared_ptr<Expression>;

// Expression types
enum class ExprType {
    LITERAL, COLUMN_REF, BINARY_OP, UNARY_OP,
    FUNCTION_CALL, AGGREGATE, SUBQUERY,
    IN_LIST, BETWEEN_EXPR, LIKE_EXPR, IS_NULL,
    CASE_EXPR, STAR, ALIAS
};

enum class BinaryOp {
    EQ, NEQ, LT, GT, LTE, GTE,
    AND, OR, PLUS, MINUS, MUL, DIV, MOD
};

enum class AggregateType {
    COUNT, SUM, AVG, MIN, MAX
};

struct Expression {
    ExprType type;
    
    // For LITERAL
    Value literalValue;
    
    // For COLUMN_REF
    std::string tableName; // optional table qualifier
    std::string columnName;
    
    // For BINARY_OP
    BinaryOp op;
    ExprPtr left;
    ExprPtr right;
    
    // For UNARY_OP (NOT)
    ExprPtr operand;
    
    // For AGGREGATE
    AggregateType aggType;
    ExprPtr aggArg; // argument to aggregate function
    bool distinct = false;
    
    // For FUNCTION_CALL
    std::string funcName;
    std::vector<ExprPtr> args;
    
    // For IN_LIST
    std::vector<ExprPtr> inList;
    
    // For BETWEEN
    ExprPtr betweenLow;
    ExprPtr betweenHigh;
    
    // For LIKE
    std::string likePattern;
    
    // For IS_NULL
    bool isNotNull = false;
    
    // For ALIAS
    std::string alias;
    ExprPtr aliasExpr;
    
    // For STAR (*)
    // (no extra fields)
    
    static ExprPtr makeLiteral(const Value& val) {
        auto e = std::make_shared<Expression>();
        e->type = ExprType::LITERAL;
        e->literalValue = val;
        return e;
    }
    
    static ExprPtr makeColumnRef(const std::string& col, const std::string& table = "") {
        auto e = std::make_shared<Expression>();
        e->type = ExprType::COLUMN_REF;
        e->columnName = col;
        e->tableName = table;
        return e;
    }
    
    static ExprPtr makeBinaryOp(BinaryOp op, ExprPtr left, ExprPtr right) {
        auto e = std::make_shared<Expression>();
        e->type = ExprType::BINARY_OP;
        e->op = op;
        e->left = left;
        e->right = right;
        return e;
    }
    
    static ExprPtr makeAggregate(AggregateType aggType, ExprPtr arg, bool distinct = false) {
        auto e = std::make_shared<Expression>();
        e->type = ExprType::AGGREGATE;
        e->aggType = aggType;
        e->aggArg = arg;
        e->distinct = distinct;
        return e;
    }

    static ExprPtr makeStar() {
        auto e = std::make_shared<Expression>();
        e->type = ExprType::STAR;
        return e;
    }

    static ExprPtr makeAlias(ExprPtr expr, const std::string& alias) {
        auto e = std::make_shared<Expression>();
        e->type = ExprType::ALIAS;
        e->aliasExpr = expr;
        e->alias = alias;
        return e;
    }
};

// JOIN types
enum class JoinType {
    INNER, LEFT, RIGHT, FULL, CROSS
};

struct JoinClause {
    JoinType type = JoinType::INNER;
    std::string tableName;
    std::string alias;
    ExprPtr onCondition;
};

// ORDER BY
struct OrderByItem {
    ExprPtr expr;
    bool ascending = true;
};

// Table reference (could be table name, alias, or subquery)
struct TableRef {
    std::string tableName;
    std::string alias;
};

// ===== Statement Types =====

enum class StatementType {
    SELECT, INSERT, UPDATE, DELETE_STMT,
    CREATE_TABLE, DROP_TABLE, CREATE_INDEX, DROP_INDEX,
    BEGIN_TX, COMMIT_TX, ROLLBACK_TX, SAVEPOINT_TX,
    SHOW_TABLES, DESCRIBE_TABLE, EXPLAIN,
    UNKNOWN
};

struct SelectStatement {
    bool distinct = false;
    std::vector<ExprPtr> columns; // SELECT expressions
    TableRef fromTable;
    std::vector<JoinClause> joins;
    ExprPtr whereClause;
    std::vector<ExprPtr> groupBy;
    ExprPtr havingClause;
    std::vector<OrderByItem> orderBy;
    int limit = -1;
    int offset = 0;
};

struct InsertStatement {
    std::string tableName;
    std::vector<std::string> columns; // optional column list
    std::vector<std::vector<ExprPtr>> values; // rows of values
};

struct UpdateStatement {
    std::string tableName;
    std::vector<std::pair<std::string, ExprPtr>> assignments; // col = expr
    ExprPtr whereClause;
};

struct DeleteStatement {
    std::string tableName;
    ExprPtr whereClause;
};

struct CreateTableStatement {
    std::string tableName;
    std::vector<ColumnDef> columns;
    std::vector<std::string> primaryKeys;
    bool ifNotExists = false;
};

struct DropTableStatement {
    std::string tableName;
    bool ifExists = false;
};

struct CreateIndexStatement {
    std::string indexName;
    std::string tableName;
    std::vector<std::string> columns;
    bool unique = false;
};

struct ShowTablesStatement {};

struct DescribeTableStatement {
    std::string tableName;
};

struct ExplainStatement {
    std::shared_ptr<SelectStatement> select;
};

// Top-level statement
struct Statement {
    StatementType type = StatementType::UNKNOWN;
    
    // One of these will be populated
    std::shared_ptr<SelectStatement> select;
    std::shared_ptr<InsertStatement> insert;
    std::shared_ptr<UpdateStatement> update;
    std::shared_ptr<DeleteStatement> deleteStmt;
    std::shared_ptr<CreateTableStatement> createTable;
    std::shared_ptr<DropTableStatement> dropTable;
    std::shared_ptr<CreateIndexStatement> createIndex;
    std::shared_ptr<ShowTablesStatement> showTables;
    std::shared_ptr<DescribeTableStatement> describeTable;
    std::shared_ptr<ExplainStatement> explain;
};

} // namespace shift_elite

