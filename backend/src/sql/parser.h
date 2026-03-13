#pragma once
#include <string>
#include <vector>
#include <stdexcept>
#include <algorithm>
#include "tokenizer.h"
#include "ast.h"

namespace shift_elite {

class Parser {
public:
    explicit Parser(const std::vector<Token>& tokens) : tokens_(tokens), pos_(0) {}

    Statement parse() {
        Statement stmt;
        
        if (match(TokenType::SELECT)) return parseSelect();
        if (match(TokenType::INSERT)) return parseInsert();
        if (match(TokenType::UPDATE)) return parseUpdate();
        if (match(TokenType::DELETE)) return parseDelete();
        if (match(TokenType::CREATE)) {
            if (check(TokenType::TABLE)) return parseCreateTable();
            if (check(TokenType::INDEX) || check(TokenType::UNIQUE)) return parseCreateIndex();
        }
        if (match(TokenType::DROP)) return parseDrop();
        if (match(TokenType::SHOW)) return parseShow();
        if (match(TokenType::DESCRIBE)) return parseDescribe();
        if (match(TokenType::EXPLAIN)) return parseExplain();
        if (match(TokenType::BEGIN_KW)) {
            stmt.type = StatementType::BEGIN_TX;
            if (check(TokenType::TRANSACTION)) advance();
            consumeOptional(TokenType::SEMICOLON);
            return stmt;
        }
        if (match(TokenType::COMMIT)) {
            stmt.type = StatementType::COMMIT_TX;
            consumeOptional(TokenType::SEMICOLON);
            return stmt;
        }
        if (match(TokenType::ROLLBACK)) {
            stmt.type = StatementType::ROLLBACK_TX;
            consumeOptional(TokenType::SEMICOLON);
            return stmt;
        }

        throw std::runtime_error("Unexpected token: " + currentToken().value);
    }

private:
    // ===== SELECT =====
    Statement parseSelect() {
        Statement stmt;
        stmt.type = StatementType::SELECT;
        auto sel = std::make_shared<SelectStatement>();

        if (match(TokenType::DISTINCT)) sel->distinct = true;

        // Column list
        sel->columns = parseSelectColumns();

        // FROM
        if (match(TokenType::FROM)) {
            sel->fromTable = parseTableRef();
        }

        // JOINs
        while (checkJoin()) {
            sel->joins.push_back(parseJoin());
        }

        // WHERE
        if (match(TokenType::WHERE)) {
            sel->whereClause = parseExpression();
        }

        // GROUP BY
        if (match(TokenType::GROUP)) {
            consume(TokenType::BY, "Expected BY after GROUP");
            do {
                sel->groupBy.push_back(parseExpression());
            } while (match(TokenType::COMMA));
        }

        // HAVING
        if (match(TokenType::HAVING)) {
            sel->havingClause = parseExpression();
        }

        // ORDER BY
        if (match(TokenType::ORDER)) {
            consume(TokenType::BY, "Expected BY after ORDER");
            do {
                OrderByItem item;
                item.expr = parseExpression();
                item.ascending = true;
                if (match(TokenType::DESC)) item.ascending = false;
                else consumeOptional(TokenType::ASC);
                sel->orderBy.push_back(item);
            } while (match(TokenType::COMMA));
        }

        // LIMIT
        if (match(TokenType::LIMIT)) {
            sel->limit = std::stoi(consume(TokenType::INTEGER_LITERAL, "Expected integer after LIMIT").value);
            if (match(TokenType::OFFSET)) {
                sel->offset = std::stoi(consume(TokenType::INTEGER_LITERAL, "Expected integer after OFFSET").value);
            }
        }

        consumeOptional(TokenType::SEMICOLON);
        stmt.select = sel;
        return stmt;
    }

    std::vector<ExprPtr> parseSelectColumns() {
        std::vector<ExprPtr> cols;
        do {
            if (check(TokenType::STAR)) {
                advance();
                cols.push_back(Expression::makeStar());
            } else {
                auto expr = parseExpression();
                if (match(TokenType::AS)) {
                    std::string alias = consume(TokenType::IDENTIFIER, "Expected alias name").value;
                    cols.push_back(Expression::makeAlias(expr, alias));
                } else if (check(TokenType::IDENTIFIER) && !checkKeyword()) {
                    // implicit alias
                    std::string alias = currentToken().value;
                    advance();
                    cols.push_back(Expression::makeAlias(expr, alias));
                } else {
                    cols.push_back(expr);
                }
            }
        } while (match(TokenType::COMMA));
        return cols;
    }

    TableRef parseTableRef() {
        TableRef ref;
        ref.tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
        if (match(TokenType::AS)) {
            ref.alias = consume(TokenType::IDENTIFIER, "Expected alias").value;
        } else if (check(TokenType::IDENTIFIER) && !checkKeyword()) {
            ref.alias = currentToken().value;
            advance();
        }
        return ref;
    }

    bool checkJoin() {
        return check(TokenType::JOIN) || check(TokenType::INNER) || 
               check(TokenType::LEFT) || check(TokenType::RIGHT) ||
               check(TokenType::FULL) || check(TokenType::CROSS);
    }

    JoinClause parseJoin() {
        JoinClause join;
        join.type = JoinType::INNER;

        if (match(TokenType::INNER)) join.type = JoinType::INNER;
        else if (match(TokenType::LEFT)) { join.type = JoinType::LEFT; consumeOptional(TokenType::OUTER); }
        else if (match(TokenType::RIGHT)) { join.type = JoinType::RIGHT; consumeOptional(TokenType::OUTER); }
        else if (match(TokenType::FULL)) { join.type = JoinType::FULL; consumeOptional(TokenType::OUTER); }
        else if (match(TokenType::CROSS)) { join.type = JoinType::CROSS; }

        consume(TokenType::JOIN, "Expected JOIN");
        join.tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
        
        if (match(TokenType::AS)) {
            join.alias = consume(TokenType::IDENTIFIER, "Expected alias").value;
        } else if (check(TokenType::IDENTIFIER) && !checkKeyword() && !check(TokenType::ON)) {
            join.alias = currentToken().value;
            advance();
        }

        if (match(TokenType::ON)) {
            join.onCondition = parseExpression();
        }
        return join;
    }

    // ===== INSERT =====
    Statement parseInsert() {
        Statement stmt;
        stmt.type = StatementType::INSERT;
        auto ins = std::make_shared<InsertStatement>();

        consume(TokenType::INTO, "Expected INTO after INSERT");
        ins->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;

        // Optional column list
        if (match(TokenType::LPAREN)) {
            do {
                ins->columns.push_back(consume(TokenType::IDENTIFIER, "Expected column name").value);
            } while (match(TokenType::COMMA));
            consume(TokenType::RPAREN, "Expected )");
        }

        consume(TokenType::VALUES, "Expected VALUES");

        // Multiple row values
        do {
            consume(TokenType::LPAREN, "Expected (");
            std::vector<ExprPtr> row;
            do {
                row.push_back(parseExpression());
            } while (match(TokenType::COMMA));
            consume(TokenType::RPAREN, "Expected )");
            ins->values.push_back(row);
        } while (match(TokenType::COMMA));

        consumeOptional(TokenType::SEMICOLON);
        stmt.insert = ins;
        return stmt;
    }

    // ===== UPDATE =====
    Statement parseUpdate() {
        Statement stmt;
        stmt.type = StatementType::UPDATE;
        auto upd = std::make_shared<UpdateStatement>();

        upd->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
        consume(TokenType::SET, "Expected SET");

        do {
            std::string col = consume(TokenType::IDENTIFIER, "Expected column name").value;
            consume(TokenType::EQUALS, "Expected =");
            auto val = parseExpression();
            upd->assignments.push_back({col, val});
        } while (match(TokenType::COMMA));

        if (match(TokenType::WHERE)) {
            upd->whereClause = parseExpression();
        }

        consumeOptional(TokenType::SEMICOLON);
        stmt.update = upd;
        return stmt;
    }

    // ===== DELETE =====
    Statement parseDelete() {
        Statement stmt;
        stmt.type = StatementType::DELETE_STMT;
        auto del = std::make_shared<DeleteStatement>();

        consume(TokenType::FROM, "Expected FROM after DELETE");
        del->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;

        if (match(TokenType::WHERE)) {
            del->whereClause = parseExpression();
        }

        consumeOptional(TokenType::SEMICOLON);
        stmt.deleteStmt = del;
        return stmt;
    }

    // ===== CREATE TABLE =====
    Statement parseCreateTable() {
        Statement stmt;
        stmt.type = StatementType::CREATE_TABLE;
        auto ct = std::make_shared<CreateTableStatement>();

        consume(TokenType::TABLE, "Expected TABLE");
        
        if (check(TokenType::IF)) {
            advance();
            consume(TokenType::NOT, "Expected NOT");
            consume(TokenType::EXISTS, "Expected EXISTS");
            ct->ifNotExists = true;
        }

        ct->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
        consume(TokenType::LPAREN, "Expected (");

        do {
            // Check for PRIMARY KEY constraint
            if (check(TokenType::PRIMARY)) {
                advance();
                consume(TokenType::KEY, "Expected KEY");
                consume(TokenType::LPAREN, "Expected (");
                do {
                    ct->primaryKeys.push_back(consume(TokenType::IDENTIFIER, "Expected column name").value);
                } while (match(TokenType::COMMA));
                consume(TokenType::RPAREN, "Expected )");
                continue;
            }
            // Check for CONSTRAINT
            if (check(TokenType::CONSTRAINT)) {
                // Skip constraints for now
                advance();
                while (!check(TokenType::COMMA) && !check(TokenType::RPAREN) && !check(TokenType::END_OF_INPUT)) {
                    advance();
                }
                continue;
            }

            ColumnDef col;
            col.name = consume(TokenType::IDENTIFIER, "Expected column name").value;
            
            // Data type
            auto typeToken = currentToken();
            switch (typeToken.type) {
                case TokenType::INT_TYPE: col.type = DataType::INT; advance(); break;
                case TokenType::VARCHAR_TYPE: {
                    col.type = DataType::VARCHAR;
                    advance();
                    if (match(TokenType::LPAREN)) {
                        col.maxLength = std::stoi(consume(TokenType::INTEGER_LITERAL, "Expected length").value);
                        consume(TokenType::RPAREN, "Expected )");
                    } else {
                        col.maxLength = 255;
                    }
                    break;
                }
                case TokenType::FLOAT_TYPE: col.type = DataType::FLOAT; advance(); break;
                case TokenType::BOOLEAN_TYPE: col.type = DataType::BOOLEAN; advance(); break;
                case TokenType::DATE_TYPE: col.type = DataType::DATE; advance(); break;
                case TokenType::TIMESTAMP_TYPE: col.type = DataType::TIMESTAMP; advance(); break;
                default: throw std::runtime_error("Expected data type, got: " + typeToken.value);
            }

            // Column constraints
            while (true) {
                if (match(TokenType::NOT)) {
                    consume(TokenType::NULL_KW, "Expected NULL after NOT");
                    col.nullable = false;
                } else if (match(TokenType::PRIMARY)) {
                    consume(TokenType::KEY, "Expected KEY after PRIMARY");
                    col.primaryKey = true;
                    col.nullable = false;
                    ct->primaryKeys.push_back(col.name);
                } else if (match(TokenType::UNIQUE)) {
                    col.unique = true;
                } else if (match(TokenType::AUTO_INCREMENT)) {
                    col.autoIncrement = true;
                } else if (match(TokenType::DEFAULT)) {
                    col.defaultValue = parseLiteralValue();
                } else if (match(TokenType::NULL_KW)) {
                    col.nullable = true;
                } else {
                    break;
                }
            }

            ct->columns.push_back(col);
        } while (match(TokenType::COMMA));

        consume(TokenType::RPAREN, "Expected )");
        consumeOptional(TokenType::SEMICOLON);
        stmt.createTable = ct;
        return stmt;
    }

    // ===== DROP =====
    Statement parseDrop() {
        if (match(TokenType::TABLE)) {
            Statement stmt;
            stmt.type = StatementType::DROP_TABLE;
            auto dt = std::make_shared<DropTableStatement>();
            if (check(TokenType::IF)) {
                advance();
                consume(TokenType::EXISTS, "Expected EXISTS");
                dt->ifExists = true;
            }
            dt->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
            consumeOptional(TokenType::SEMICOLON);
            stmt.dropTable = dt;
            return stmt;
        }
        throw std::runtime_error("Expected TABLE after DROP");
    }

    // ===== CREATE INDEX =====
    Statement parseCreateIndex() {
        Statement stmt;
        stmt.type = StatementType::CREATE_INDEX;
        auto ci = std::make_shared<CreateIndexStatement>();
        
        if (match(TokenType::UNIQUE)) ci->unique = true;
        consume(TokenType::INDEX, "Expected INDEX");
        ci->indexName = consume(TokenType::IDENTIFIER, "Expected index name").value;
        consume(TokenType::ON, "Expected ON");
        ci->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
        consume(TokenType::LPAREN, "Expected (");
        do {
            ci->columns.push_back(consume(TokenType::IDENTIFIER, "Expected column name").value);
        } while (match(TokenType::COMMA));
        consume(TokenType::RPAREN, "Expected )");
        consumeOptional(TokenType::SEMICOLON);
        stmt.createIndex = ci;
        return stmt;
    }

    // ===== SHOW TABLES =====
    Statement parseShow() {
        Statement stmt;
        stmt.type = StatementType::SHOW_TABLES;
        consume(TokenType::TABLES, "Expected TABLES after SHOW");
        stmt.showTables = std::make_shared<ShowTablesStatement>();
        consumeOptional(TokenType::SEMICOLON);
        return stmt;
    }

    // ===== DESCRIBE =====
    Statement parseDescribe() {
        Statement stmt;
        stmt.type = StatementType::DESCRIBE_TABLE;
        auto desc = std::make_shared<DescribeTableStatement>();
        desc->tableName = consume(TokenType::IDENTIFIER, "Expected table name").value;
        stmt.describeTable = desc;
        consumeOptional(TokenType::SEMICOLON);
        return stmt;
    }

    // ===== EXPLAIN =====
    Statement parseExplain() {
        consume(TokenType::SELECT, "Expected SELECT after EXPLAIN");
        auto selectStmt = parseSelect();
        Statement stmt;
        stmt.type = StatementType::EXPLAIN;
        stmt.explain = std::make_shared<ExplainStatement>();
        stmt.explain->select = selectStmt.select;
        return stmt;
    }

    // ===== Expression Parsing =====
    ExprPtr parseExpression() {
        return parseOr();
    }

    ExprPtr parseOr() {
        auto left = parseAnd();
        while (match(TokenType::OR)) {
            auto right = parseAnd();
            left = Expression::makeBinaryOp(BinaryOp::OR, left, right);
        }
        return left;
    }

    ExprPtr parseAnd() {
        auto left = parseComparison();
        while (match(TokenType::AND)) {
            auto right = parseComparison();
            left = Expression::makeBinaryOp(BinaryOp::AND, left, right);
        }
        return left;
    }

    ExprPtr parseComparison() {
        auto left = parseAddition();
        
        if (match(TokenType::EQUALS)) {
            return Expression::makeBinaryOp(BinaryOp::EQ, left, parseAddition());
        }
        if (match(TokenType::NOT_EQUALS)) {
            return Expression::makeBinaryOp(BinaryOp::NEQ, left, parseAddition());
        }
        if (match(TokenType::LESS_THAN)) {
            return Expression::makeBinaryOp(BinaryOp::LT, left, parseAddition());
        }
        if (match(TokenType::GREATER_THAN)) {
            return Expression::makeBinaryOp(BinaryOp::GT, left, parseAddition());
        }
        if (match(TokenType::LESS_EQUAL)) {
            return Expression::makeBinaryOp(BinaryOp::LTE, left, parseAddition());
        }
        if (match(TokenType::GREATER_EQUAL)) {
            return Expression::makeBinaryOp(BinaryOp::GTE, left, parseAddition());
        }

        // IN
        if (match(TokenType::IN)) {
            consume(TokenType::LPAREN, "Expected (");
            auto expr = std::make_shared<Expression>();
            expr->type = ExprType::IN_LIST;
            expr->left = left;
            do {
                expr->inList.push_back(parseExpression());
            } while (match(TokenType::COMMA));
            consume(TokenType::RPAREN, "Expected )");
            return expr;
        }

        // NOT IN
        if (check(TokenType::NOT) && peekNext().type == TokenType::IN) {
            advance(); advance(); // skip NOT IN
            consume(TokenType::LPAREN, "Expected (");
            auto inExpr = std::make_shared<Expression>();
            inExpr->type = ExprType::IN_LIST;
            inExpr->left = left;
            do {
                inExpr->inList.push_back(parseExpression());
            } while (match(TokenType::COMMA));
            consume(TokenType::RPAREN, "Expected )");
            // Wrap in NOT
            auto notExpr = std::make_shared<Expression>();
            notExpr->type = ExprType::UNARY_OP;
            notExpr->operand = inExpr;
            return notExpr;
        }

        // LIKE
        if (match(TokenType::LIKE)) {
            auto expr = std::make_shared<Expression>();
            expr->type = ExprType::LIKE_EXPR;
            expr->left = left;
            expr->likePattern = consume(TokenType::STRING_LITERAL, "Expected string pattern").value;
            return expr;
        }

        // IS NULL / IS NOT NULL
        if (match(TokenType::IS)) {
            auto expr = std::make_shared<Expression>();
            expr->type = ExprType::IS_NULL;
            expr->left = left;
            if (match(TokenType::NOT)) {
                expr->isNotNull = true;
            }
            consume(TokenType::NULL_KW, "Expected NULL after IS");
            return expr;
        }

        // BETWEEN
        if (match(TokenType::BETWEEN)) {
            auto expr = std::make_shared<Expression>();
            expr->type = ExprType::BETWEEN_EXPR;
            expr->left = left;
            expr->betweenLow = parseAddition();
            consume(TokenType::AND, "Expected AND in BETWEEN");
            expr->betweenHigh = parseAddition();
            return expr;
        }

        return left;
    }

    ExprPtr parseAddition() {
        auto left = parseMultiplication();
        while (check(TokenType::PLUS) || check(TokenType::MINUS)) {
            auto op = match(TokenType::PLUS) ? BinaryOp::PLUS : (advance(), BinaryOp::MINUS);
            auto right = parseMultiplication();
            left = Expression::makeBinaryOp(op, left, right);
        }
        return left;
    }

    ExprPtr parseMultiplication() {
        auto left = parseUnary();
        while (check(TokenType::STAR) || check(TokenType::DIVIDE) || check(TokenType::MODULO)) {
            BinaryOp op;
            if (match(TokenType::STAR)) op = BinaryOp::MUL;
            else if (match(TokenType::DIVIDE)) op = BinaryOp::DIV;
            else { advance(); op = BinaryOp::MOD; }
            auto right = parseUnary();
            left = Expression::makeBinaryOp(op, left, right);
        }
        return left;
    }

    ExprPtr parseUnary() {
        if (match(TokenType::NOT)) {
            auto expr = std::make_shared<Expression>();
            expr->type = ExprType::UNARY_OP;
            expr->operand = parseUnary();
            return expr;
        }
        if (match(TokenType::MINUS)) {
            auto zero = Expression::makeLiteral(static_cast<int32_t>(0));
            auto right = parsePrimary();
            return Expression::makeBinaryOp(BinaryOp::MINUS, zero, right);
        }
        return parsePrimary();
    }

    ExprPtr parsePrimary() {
        // Aggregates
        if (checkAggregate()) {
            return parseAggregate();
        }

        // Parenthesized expression
        if (match(TokenType::LPAREN)) {
            auto expr = parseExpression();
            consume(TokenType::RPAREN, "Expected )");
            return expr;
        }

        // Literals
        if (check(TokenType::INTEGER_LITERAL)) {
            auto val = static_cast<int32_t>(std::stoi(currentToken().value));
            advance();
            return Expression::makeLiteral(val);
        }
        if (check(TokenType::FLOAT_LITERAL)) {
            auto val = std::stof(currentToken().value);
            advance();
            return Expression::makeLiteral(val);
        }
        if (check(TokenType::STRING_LITERAL)) {
            auto val = currentToken().value;
            advance();
            return Expression::makeLiteral(val);
        }
        if (match(TokenType::NULL_KW)) return Expression::makeLiteral(Value{std::monostate{}});
        if (match(TokenType::TRUE_KW)) return Expression::makeLiteral(true);
        if (match(TokenType::FALSE_KW)) return Expression::makeLiteral(false);

        // Star
        if (check(TokenType::STAR)) {
            advance();
            return Expression::makeStar();
        }

        // Column reference  (table.column or column)
        if (check(TokenType::IDENTIFIER)) {
            std::string name = currentToken().value;
            advance();
            if (match(TokenType::DOT)) {
                if (check(TokenType::STAR)) {
                    advance();
                    auto e = Expression::makeStar();
                    e->tableName = name;
                    return e;
                }
                std::string col = consume(TokenType::IDENTIFIER, "Expected column name after .").value;
                return Expression::makeColumnRef(col, name);
            }
            // check for function call
            if (match(TokenType::LPAREN)) {
                auto func = std::make_shared<Expression>();
                func->type = ExprType::FUNCTION_CALL;
                func->funcName = name;
                if (!check(TokenType::RPAREN)) {
                    do {
                        func->args.push_back(parseExpression());
                    } while (match(TokenType::COMMA));
                }
                consume(TokenType::RPAREN, "Expected )");
                return func;
            }
            return Expression::makeColumnRef(name);
        }

        throw std::runtime_error("Unexpected token in expression: " + currentToken().value);
    }

    bool checkAggregate() {
        return check(TokenType::COUNT) || check(TokenType::SUM) ||
               check(TokenType::AVG) || check(TokenType::MIN) || check(TokenType::MAX);
    }

    ExprPtr parseAggregate() {
        AggregateType aggType;
        if (match(TokenType::COUNT)) aggType = AggregateType::COUNT;
        else if (match(TokenType::SUM)) aggType = AggregateType::SUM;
        else if (match(TokenType::AVG)) aggType = AggregateType::AVG;
        else if (match(TokenType::MIN)) aggType = AggregateType::MIN;
        else { advance(); aggType = AggregateType::MAX; }

        consume(TokenType::LPAREN, "Expected (");
        bool distinct = false;
        if (match(TokenType::DISTINCT)) distinct = true;
        
        ExprPtr arg;
        if (check(TokenType::STAR)) {
            advance();
            arg = Expression::makeStar();
        } else {
            arg = parseExpression();
        }
        consume(TokenType::RPAREN, "Expected )");
        return Expression::makeAggregate(aggType, arg, distinct);
    }

    Value parseLiteralValue() {
        if (check(TokenType::INTEGER_LITERAL)) {
            int32_t v = std::stoi(currentToken().value);
            advance();
            return v;
        }
        if (check(TokenType::FLOAT_LITERAL)) {
            float v = std::stof(currentToken().value);
            advance();
            return v;
        }
        if (check(TokenType::STRING_LITERAL)) {
            std::string v = currentToken().value;
            advance();
            return v;
        }
        if (match(TokenType::NULL_KW)) return std::monostate{};
        if (match(TokenType::TRUE_KW)) return true;
        if (match(TokenType::FALSE_KW)) return false;
        throw std::runtime_error("Expected literal value");
    }

    // ===== Helpers =====
    const Token& currentToken() const { return tokens_[pos_]; }
    
    Token peekNext() const {
        if (pos_ + 1 < tokens_.size()) return tokens_[pos_ + 1];
        return {TokenType::END_OF_INPUT, "", 0, 0};
    }

    bool check(TokenType type) const { return currentToken().type == type; }
    
    bool checkKeyword() const {
        auto t = currentToken().type;
        return t >= TokenType::SELECT && t <= TokenType::EXPLAIN;
    }

    bool match(TokenType type) {
        if (check(type)) { advance(); return true; }
        return false;
    }

    void advance() { if (pos_ < tokens_.size() - 1) pos_++; }

    Token consume(TokenType type, const std::string& errMsg) {
        if (check(type)) {
            Token t = currentToken();
            advance();
            return t;
        }
        throw std::runtime_error(errMsg + " (got: " + currentToken().value + ")");
    }

    void consumeOptional(TokenType type) { match(type); }

    std::vector<Token> tokens_;
    size_t pos_;
};

} // namespace shift_elite

