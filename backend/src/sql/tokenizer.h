#pragma once
#include <string>
#include <vector>
#include <variant>
#include <memory>
#include "../types/types.h"

namespace shift_elite {

// Token types
enum class TokenType {
    // Keywords
    SELECT, FROM, WHERE, INSERT, INTO, VALUES, UPDATE, SET, DELETE,
    CREATE, TABLE, DROP, ALTER, ADD, INDEX, ON, UNIQUE,
    AND, OR, NOT, IN, LIKE, BETWEEN, IS, ASC, DESC, AS,
    INNER, LEFT, RIGHT, FULL, OUTER, CROSS, JOIN,
    GROUP, BY, HAVING, ORDER, LIMIT, OFFSET,
    COUNT, SUM, AVG, MIN, MAX,
    NULL_KW, TRUE_KW, FALSE_KW, DEFAULT,
    INT_TYPE, VARCHAR_TYPE, FLOAT_TYPE, BOOLEAN_TYPE, DATE_TYPE, TIMESTAMP_TYPE,
    PRIMARY, KEY, FOREIGN, REFERENCES, CONSTRAINT, CHECK,
    BEGIN_KW, COMMIT, ROLLBACK, SAVEPOINT, TRANSACTION,
    IF, EXISTS, CASCADE, RESTRICT,
    DISTINCT, ALL, UNION, EXCEPT, INTERSECT,
    CASE, WHEN, THEN, ELSE, END,
    AUTO_INCREMENT,
    SHOW, TABLES, DESCRIBE, EXPLAIN,

    // Literals
    INTEGER_LITERAL, FLOAT_LITERAL, STRING_LITERAL,
    
    // Identifiers
    IDENTIFIER,

    // Operators
    EQUALS, NOT_EQUALS, LESS_THAN, GREATER_THAN, LESS_EQUAL, GREATER_EQUAL,
    PLUS, MINUS, MULTIPLY, DIVIDE, MODULO,
    
    // Punctuation
    LPAREN, RPAREN, COMMA, SEMICOLON, DOT, STAR, QUESTION,
    
    // Special
    END_OF_INPUT, UNKNOWN
};

struct Token {
    TokenType type;
    std::string value;
    int line = 0;
    int col = 0;
};

class Tokenizer {
public:
    explicit Tokenizer(const std::string& sql) : sql_(sql), pos_(0), line_(1), col_(1) {}

    std::vector<Token> tokenize() {
        std::vector<Token> tokens;
        while (pos_ < sql_.size()) {
            skipWhitespace();
            if (pos_ >= sql_.size()) break;
            
            char c = sql_[pos_];
            int startLine = line_, startCol = col_;

            // String literal
            if (c == '\'' || c == '"') {
                tokens.push_back(readString(c, startLine, startCol));
                continue;
            }

            // Number
            if (std::isdigit(c) || (c == '-' && pos_ + 1 < sql_.size() && std::isdigit(sql_[pos_+1]))) {
                tokens.push_back(readNumber(startLine, startCol));
                continue;
            }

            // Operators
            if (c == '=' && peek() != '=') { tokens.push_back({TokenType::EQUALS, "=", startLine, startCol}); advance(); continue; }
            if (c == '!' && peek() == '=') { tokens.push_back({TokenType::NOT_EQUALS, "!=", startLine, startCol}); advance(); advance(); continue; }
            if (c == '<' && peek() == '>') { tokens.push_back({TokenType::NOT_EQUALS, "<>", startLine, startCol}); advance(); advance(); continue; }
            if (c == '<' && peek() == '=') { tokens.push_back({TokenType::LESS_EQUAL, "<=", startLine, startCol}); advance(); advance(); continue; }
            if (c == '>' && peek() == '=') { tokens.push_back({TokenType::GREATER_EQUAL, ">=", startLine, startCol}); advance(); advance(); continue; }
            if (c == '<') { tokens.push_back({TokenType::LESS_THAN, "<", startLine, startCol}); advance(); continue; }
            if (c == '>') { tokens.push_back({TokenType::GREATER_THAN, ">", startLine, startCol}); advance(); continue; }
            if (c == '+') { tokens.push_back({TokenType::PLUS, "+", startLine, startCol}); advance(); continue; }
            if (c == '-') { tokens.push_back({TokenType::MINUS, "-", startLine, startCol}); advance(); continue; }
            if (c == '*') { tokens.push_back({TokenType::STAR, "*", startLine, startCol}); advance(); continue; }
            if (c == '/') { tokens.push_back({TokenType::DIVIDE, "/", startLine, startCol}); advance(); continue; }
            if (c == '%') { tokens.push_back({TokenType::MODULO, "%", startLine, startCol}); advance(); continue; }
            if (c == '(') { tokens.push_back({TokenType::LPAREN, "(", startLine, startCol}); advance(); continue; }
            if (c == ')') { tokens.push_back({TokenType::RPAREN, ")", startLine, startCol}); advance(); continue; }
            if (c == ',') { tokens.push_back({TokenType::COMMA, ",", startLine, startCol}); advance(); continue; }
            if (c == ';') { tokens.push_back({TokenType::SEMICOLON, ";", startLine, startCol}); advance(); continue; }
            if (c == '.') { tokens.push_back({TokenType::DOT, ".", startLine, startCol}); advance(); continue; }
            if (c == '?') { tokens.push_back({TokenType::QUESTION, "?", startLine, startCol}); advance(); continue; }

            // Identifier or keyword
            if (std::isalpha(c) || c == '_') {
                tokens.push_back(readIdentifier(startLine, startCol));
                continue;
            }

            // Unknown
            tokens.push_back({TokenType::UNKNOWN, std::string(1, c), startLine, startCol});
            advance();
        }
        tokens.push_back({TokenType::END_OF_INPUT, "", line_, col_});
        return tokens;
    }

private:
    char peek() const { return (pos_ + 1 < sql_.size()) ? sql_[pos_ + 1] : '\0'; }
    
    void advance() {
        if (pos_ < sql_.size()) {
            if (sql_[pos_] == '\n') { line_++; col_ = 1; }
            else col_++;
            pos_++;
        }
    }

    void skipWhitespace() {
        while (pos_ < sql_.size() && std::isspace(sql_[pos_])) advance();
        // Skip comments
        if (pos_ + 1 < sql_.size() && sql_[pos_] == '-' && sql_[pos_+1] == '-') {
            while (pos_ < sql_.size() && sql_[pos_] != '\n') advance();
            skipWhitespace();
        }
    }

    Token readString(char quote, int line, int col) {
        advance(); // skip opening quote
        std::string val;
        while (pos_ < sql_.size() && sql_[pos_] != quote) {
            if (sql_[pos_] == '\\' && pos_ + 1 < sql_.size()) {
                advance();
                switch (sql_[pos_]) {
                    case 'n': val += '\n'; break;
                    case 't': val += '\t'; break;
                    case '\\': val += '\\'; break;
                    default: val += sql_[pos_]; break;
                }
            } else {
                val += sql_[pos_];
            }
            advance();
        }
        if (pos_ < sql_.size()) advance(); // skip closing quote
        return {TokenType::STRING_LITERAL, val, line, col};
    }

    Token readNumber(int line, int col) {
        std::string val;
        if (sql_[pos_] == '-') { val += '-'; advance(); }
        bool isFloat = false;
        while (pos_ < sql_.size() && (std::isdigit(sql_[pos_]) || sql_[pos_] == '.')) {
            if (sql_[pos_] == '.') isFloat = true;
            val += sql_[pos_];
            advance();
        }
        return {isFloat ? TokenType::FLOAT_LITERAL : TokenType::INTEGER_LITERAL, val, line, col};
    }

    Token readIdentifier(int line, int col) {
        std::string val;
        while (pos_ < sql_.size() && (std::isalnum(sql_[pos_]) || sql_[pos_] == '_')) {
            val += sql_[pos_];
            advance();
        }
        // Check keywords
        std::string upper = toUpper(val);
        auto type = getKeywordType(upper);
        if (type != TokenType::UNKNOWN) {
            return {type, upper, line, col};
        }
        return {TokenType::IDENTIFIER, val, line, col};
    }

    static std::string toUpper(const std::string& s) {
        std::string result = s;
        for (auto& c : result) c = std::toupper(c);
        return result;
    }

    static TokenType getKeywordType(const std::string& word) {
        static const std::map<std::string, TokenType> keywords = {
            {"SELECT", TokenType::SELECT}, {"FROM", TokenType::FROM}, {"WHERE", TokenType::WHERE},
            {"INSERT", TokenType::INSERT}, {"INTO", TokenType::INTO}, {"VALUES", TokenType::VALUES},
            {"UPDATE", TokenType::UPDATE}, {"SET", TokenType::SET}, {"DELETE", TokenType::DELETE},
            {"CREATE", TokenType::CREATE}, {"TABLE", TokenType::TABLE}, {"DROP", TokenType::DROP},
            {"ALTER", TokenType::ALTER}, {"ADD", TokenType::ADD},
            {"INDEX", TokenType::INDEX}, {"ON", TokenType::ON}, {"UNIQUE", TokenType::UNIQUE},
            {"AND", TokenType::AND}, {"OR", TokenType::OR}, {"NOT", TokenType::NOT},
            {"IN", TokenType::IN}, {"LIKE", TokenType::LIKE}, {"BETWEEN", TokenType::BETWEEN},
            {"IS", TokenType::IS}, {"ASC", TokenType::ASC}, {"DESC", TokenType::DESC}, {"AS", TokenType::AS},
            {"INNER", TokenType::INNER}, {"LEFT", TokenType::LEFT}, {"RIGHT", TokenType::RIGHT},
            {"FULL", TokenType::FULL}, {"OUTER", TokenType::OUTER}, {"CROSS", TokenType::CROSS},
            {"JOIN", TokenType::JOIN},
            {"GROUP", TokenType::GROUP}, {"BY", TokenType::BY}, {"HAVING", TokenType::HAVING},
            {"ORDER", TokenType::ORDER}, {"LIMIT", TokenType::LIMIT}, {"OFFSET", TokenType::OFFSET},
            {"COUNT", TokenType::COUNT}, {"SUM", TokenType::SUM}, {"AVG", TokenType::AVG},
            {"MIN", TokenType::MIN}, {"MAX", TokenType::MAX},
            {"NULL", TokenType::NULL_KW}, {"TRUE", TokenType::TRUE_KW}, {"FALSE", TokenType::FALSE_KW},
            {"DEFAULT", TokenType::DEFAULT},
            {"INT", TokenType::INT_TYPE}, {"INTEGER", TokenType::INT_TYPE},
            {"VARCHAR", TokenType::VARCHAR_TYPE}, {"TEXT", TokenType::VARCHAR_TYPE},
            {"FLOAT", TokenType::FLOAT_TYPE}, {"DOUBLE", TokenType::FLOAT_TYPE}, {"REAL", TokenType::FLOAT_TYPE},
            {"BOOLEAN", TokenType::BOOLEAN_TYPE}, {"BOOL", TokenType::BOOLEAN_TYPE},
            {"DATE", TokenType::DATE_TYPE}, {"TIMESTAMP", TokenType::TIMESTAMP_TYPE},
            {"PRIMARY", TokenType::PRIMARY}, {"KEY", TokenType::KEY},
            {"FOREIGN", TokenType::FOREIGN}, {"REFERENCES", TokenType::REFERENCES},
            {"CONSTRAINT", TokenType::CONSTRAINT}, {"CHECK", TokenType::CHECK},
            {"BEGIN", TokenType::BEGIN_KW}, {"COMMIT", TokenType::COMMIT},
            {"ROLLBACK", TokenType::ROLLBACK}, {"SAVEPOINT", TokenType::SAVEPOINT},
            {"TRANSACTION", TokenType::TRANSACTION},
            {"IF", TokenType::IF}, {"EXISTS", TokenType::EXISTS},
            {"CASCADE", TokenType::CASCADE}, {"RESTRICT", TokenType::RESTRICT},
            {"DISTINCT", TokenType::DISTINCT}, {"ALL", TokenType::ALL},
            {"UNION", TokenType::UNION}, {"EXCEPT", TokenType::EXCEPT}, {"INTERSECT", TokenType::INTERSECT},
            {"CASE", TokenType::CASE}, {"WHEN", TokenType::WHEN}, {"THEN", TokenType::THEN},
            {"ELSE", TokenType::ELSE}, {"END", TokenType::END},
            {"AUTO_INCREMENT", TokenType::AUTO_INCREMENT}, {"AUTOINCREMENT", TokenType::AUTO_INCREMENT},
            {"SHOW", TokenType::SHOW}, {"TABLES", TokenType::TABLES},
            {"DESCRIBE", TokenType::DESCRIBE}, {"EXPLAIN", TokenType::EXPLAIN},
        };
        auto it = keywords.find(word);
        return (it != keywords.end()) ? it->second : TokenType::UNKNOWN;
    }

    std::string sql_;
    size_t pos_;
    int line_, col_;
};

} // namespace shift_elite

