const { TranspileError } = require('./errors.js');

/**
 * Tokenizer for the JS-like source dialect.
 *
 * Produces a flat token array. Token shape:
 *   { type: string, value?: string, line: number, column: number }
 *
 * `type` is one of:
 *   - 'ident' | 'number' | 'string'
 *   - 'templateHead' | 'templateMiddle' | 'templateTail'
 *   - 'newline' | 'eof'
 *   - otherwise the literal punctuation/operator text: '(' ')' '{' '}' '[' ']'
 *     ',' ';' ':' '.' '=' '==' '===' '!=' '!==' '<' '<=' '>' '>=' '+' '-' '*' '/'
 *     '%' '**' '&&' '||' '!' '+=' '-=' '*=' '/=' '++' '--' '=>' '?'
 */
class Lexer {
  /**
   * @param {string} src
   * @param {string} [sourceName]
   */
  constructor(src, sourceName) {
    this.src = src;
    this.sourceName = sourceName;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
  }

  error(message, line, column) {
    throw new TranspileError(message, line == null ? this.line : line, column == null ? this.column : column, this.sourceName);
  }

  peek(offset = 0) {
    return this.src[this.pos + offset];
  }

  advance() {
    const c = this.src[this.pos];
    this.pos++;
    if (c === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return c;
  }

  token(type, value, line = this.line, column = this.column) {
    return { type, value, line, column };
  }

  /**
   * Tokenize the whole source.
   * @returns {Array<{type:string,value?:string,line:number,column:number}>}
   */
  tokenize() {
    const tokens = [];
    while (true) {
      this.skipTrivia();
      if (this.pos >= this.src.length) {
        tokens.push(this.token('eof'));
        break;
      }
      const c = this.peek();
      if (c === '\n') {
        const line = this.line;
        const column = this.column;
        while (this.peek() === '\n') this.advance();
        tokens.push(this.token('newline', undefined, line, column));
        continue;
      }
      if (c === '`') {
        this.readTemplate(tokens);
        continue;
      }
      tokens.push(this.readSimpleToken());
    }
    return tokens;
  }

  skipTrivia() {
    while (this.pos < this.src.length) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\r') {
        this.advance();
      } else if (c === '/' && this.peek(1) === '/') {
        while (this.pos < this.src.length && this.peek() !== '\n') this.advance();
      } else if (c === '/' && this.peek(1) === '*') {
        this.advance();
        this.advance();
        while (this.pos < this.src.length && !(this.peek() === '*' && this.peek(1) === '/')) this.advance();
        if (this.pos >= this.src.length) this.error('未闭合的块注释 /* ... */');
        this.advance();
        this.advance();
      } else {
        break;
      }
    }
  }

  readSimpleToken() {
    const c = this.peek();
    const line = this.line;
    const column = this.column;

    if (isIdentStart(c)) return this.readIdentifier();
    if (isDigit(c) || (c === '.' && isDigit(this.peek(1)))) return this.readNumber();
    if (c === "'" || c === '"') return this.readString(c);

    // Operators / punctuation, longest match first.
    const three = this.src.slice(this.pos, this.pos + 3);
    if (three === '===' || three === '!==') {
      this.advance();
      this.advance();
      this.advance();
      return this.token(three, undefined, line, column);
    }
    const two = this.src.slice(this.pos, this.pos + 2);
    if (TWO_CHAR.has(two)) {
      this.advance();
      this.advance();
      return this.token(two, undefined, line, column);
    }
    if (ONE_CHAR.has(c)) {
      this.advance();
      return this.token(c, undefined, line, column);
    }

    this.error(`无法识别的字符 '${c}'`, line, column);
  }

  readIdentifier() {
    const line = this.line;
    const column = this.column;
    let name = '';
    while (this.pos < this.src.length && isIdentPart(this.peek())) {
      name += this.advance();
    }
    return this.token('ident', name, line, column);
  }

  readNumber() {
    const line = this.line;
    const column = this.column;
    const start = this.pos;

    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      this.advance();
      this.advance();
      const hexStart = this.pos;
      while (this.pos < this.src.length && isHexDigit(this.peek())) this.advance();
      if (this.pos === hexStart) this.error('无效的十六进制数字字面量', line, column);
      const value = parseInt(this.src.slice(start, this.pos), 16);
      return this.token('number', String(value), line, column);
    }

    let isFloat = false;
    while (this.pos < this.src.length && isDigit(this.peek())) this.advance();
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      isFloat = true;
      this.advance();
      while (this.pos < this.src.length && isDigit(this.peek())) this.advance();
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      const save = this.pos;
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') this.advance();
      if (isDigit(this.peek())) {
        isFloat = true;
        while (this.pos < this.src.length && isDigit(this.peek())) this.advance();
      } else {
        this.pos = save; // not an exponent
      }
    }

    const raw = this.src.slice(start, this.pos);
    let text;
    if (isFloat) {
      const value = Number(raw);
      if (!Number.isFinite(value)) this.error('浮点数字面量超出可表示范围', line, column);
      text = String(value);
      if (text.indexOf('.') === -1 && text.indexOf('e') === -1 && text.indexOf('E') === -1) {
        text += '.0';
      }
    } else {
      text = String(parseInt(raw, 10));
    }
    return this.token('number', text, line, column);
  }

  readString(quote) {
    const line = this.line;
    const column = this.column;
    this.advance(); // opening quote
    let value = '';
    while (true) {
      if (this.pos >= this.src.length) this.error('未闭合的字符串字面量', line, column);
      const c = this.peek();
      if (c === quote) {
        this.advance();
        break;
      }
      if (c === '\n') this.error('字符串字面量中不允许直接换行', line, column);
      if (c === '\\') {
        value += this.readEscape();
      } else {
        value += this.advance();
      }
    }
    return this.token('string', value, line, column);
  }

  /**
   * Read a template literal starting at the current backtick, appending its
   * token sequence (templateHead / substitution tokens / templateMiddle / templateTail)
   * directly to `tokens`.
   */
  readTemplate(tokens) {
    const line = this.line;
    const column = this.column;
    this.advance(); // opening backtick

    const readChunk = () => {
      let text = '';
      while (true) {
        if (this.pos >= this.src.length) this.error('未闭合的模板字符串', line, column);
        const c = this.peek();
        if (c === '`') {
          this.advance();
          return { text, closed: true };
        }
        if (c === '\\') {
          text += this.readEscape();
          continue;
        }
        if (c === '$' && this.peek(1) === '{') {
          this.advance();
          this.advance();
          return { text, closed: false };
        }
        text += this.advance();
      }
    };

    const first = readChunk();
    tokens.push(this.token('templateHead', first.text, line, column));
    if (first.closed) {
      tokens.push(this.token('templateTail', '', line, column));
      return;
    }

    while (true) {
      this.readTemplateExpr(tokens);
      const chunk = readChunk();
      if (chunk.closed) {
        tokens.push(this.token('templateTail', chunk.text, line, column));
        return;
      }
      tokens.push(this.token('templateMiddle', chunk.text, line, column));
    }
  }

  /**
   * Read a `${ ... }` substitution's expression tokens, appending them to
   * `tokens`. The closing `}` is consumed but NOT emitted.
   */
  readTemplateExpr(tokens) {
    let brace = 1;
    while (true) {
      this.skipTrivia();
      if (this.pos >= this.src.length) this.error('未闭合的模板字符串');
      const c = this.peek();
      if (c === '`') {
        this.readTemplate(tokens);
        continue;
      }
      const tok = this.readSimpleToken();
      if (tok.type === '}') {
        brace--;
        if (brace === 0) break;
      } else {
        if (tok.type === '{') brace++;
        tokens.push(tok);
      }
    }
  }

  readEscape() {
    this.advance(); // backslash
    if (this.pos >= this.src.length) this.error('字符串末尾的反斜杠');
    const c = this.advance();
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case 'a': return '\x07';
      case '0': return '\0';
      case '\\': return '\\';
      case "'": return "'";
      case '"': return '"';
      case '`': return '`';
      case '\n': return '';
      case 'x': {
        const h = this.src.slice(this.pos, this.pos + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(h)) this.error('无效的 \\x 转义序列');
        this.advance();
        this.advance();
        return String.fromCharCode(parseInt(h, 16));
      }
      case 'u': {
        if (this.peek() === '{') {
          this.advance();
          let hex = '';
          while (this.pos < this.src.length && this.peek() !== '}') hex += this.advance();
          if (this.peek() !== '}') this.error('无效的 \\u{...} 转义序列');
          this.advance();
          return String.fromCodePoint(parseInt(hex, 16));
        }
        const h = this.src.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) this.error('无效的 \\u 转义序列');
        this.advance();
        this.advance();
        this.advance();
        this.advance();
        return String.fromCharCode(parseInt(h, 16));
      }
      default:
        return c; // be lenient about unknown escapes
    }
  }
}

const TWO_CHAR = new Set([
  '==', '!=', '<=', '>=', '&&', '||', '**', '+=', '-=', '*=', '/=', '++', '--', '=>',
]);
const ONE_CHAR = new Set([
  '(', ')', '{', '}', '[', ']', ',', ';', ':', '.', '=', '<', '>', '+', '-', '*', '/', '%', '!', '?',
]);

function isDigit(c) {
  return c >= '0' && c <= '9';
}
function isHexDigit(c) {
  return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
function isIdentStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdentPart(c) {
  return isIdentStart(c) || isDigit(c);
}

module.exports = { Lexer };
