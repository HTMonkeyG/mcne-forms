const { TranspileError } = require('./errors.js');
const { TYPE_KEYWORDS, BRACE_KEYWORDS, RESERVED } = require('./tokens.js');

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=']);
const COMPOUND_BINOPS = { '+=': '+', '-=': '-', '*=': '*', '/=': '/' };

/**
 * Recursive-descent parser: token array → AST.
 *
 * The input dialect is line-oriented (statements end at `;` or a newline) and
 * brace-delimited (`if (...) { ... }`, `for (...) { ... }`). Expression
 * precedence follows JavaScript for the supported operators.
 */
class Parser {
  /**
   * @param {Array} tokens token stream from Lexer.tokenize()
   * @param {string} [sourceName]
   */
  constructor(tokens, sourceName) {
    this.tokens = tokens;
    this.i = 0;
    this.sourceName = sourceName;
  }

  error(message, token) {
    const t = token || this.peek();
    throw new TranspileError(message, t.line, t.column, this.sourceName);
  }

  peek() {
    return this.tokens[this.i];
  }

  peekAt(n) {
    return this.tokens[this.i + n];
  }

  next() {
    return this.tokens[this.i++];
  }

  at(type) {
    return this.peek().type === type;
  }

  atIdent(text) {
    const t = this.peek();
    return t.type === 'ident' && t.value === text;
  }

  expect(type) {
    const t = this.peek();
    if (t.type !== type) this.error(`期望 '${type}'，得到 ${describe(t)}`, t);
    return this.next();
  }

  expectIdent() {
    const t = this.peek();
    if (t.type !== 'ident') this.error(`期望标识符，得到 ${describe(t)}`, t);
    return this.next();
  }

  skipNewlines() {
    while (this.at('newline')) this.next();
  }

  consumeTerminators() {
    while (this.at(';') || this.at('newline')) this.next();
  }

  checkVarName(name, token) {
    if (RESERVED.has(name)) this.error(`不能使用保留字 '${name}' 作为变量名`, token);
  }

  // ---------------------------------------------------------------- program

  parseProgram() {
    const body = [];
    this.skipNewlines();
    while (!this.at('eof')) {
      body.push(this.parseStatement());
      this.consumeTerminators();
    }
    return { type: 'Program', body };
  }

  // -------------------------------------------------------------- statements

  parseStatement() {
    this.skipNewlines();
    const t = this.peek();

    if (t.type === 'ident') {
      switch (t.value) {
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while':
        case 'do':
          this.error(`不支持的循环 '${t.value}'（HPL 仅支持 for (var a to N)）`, t);
          break;
        case 'return': return this.parseReturn();
        case 'break': this.next(); return { type: 'Break' };
        case 'continue': this.next(); return { type: 'Continue' };
        case 'var':
        case 'let':
        case 'const': return this.parseVarDecl();
        default: {
          // postfix increment / decrement: `i++` / `i--`
          const nxt = this.peekAt(1);
          if (nxt.type === '++' || nxt.type === '--') {
            const name = this.next().value;
            const op = this.next().type;
            return this.makeIncDec(name, op);
          }
          if (nxt.type && ASSIGN_OPS.has(nxt.type)) return this.parseAssignment();
          return this.parseExpressionStatement();
        }
      }
    }

    if (t.type === '++' || t.type === '--') {
      const op = this.next().type;
      const name = this.expectIdent().value;
      this.checkVarName(name, this.peek());
      return this.makeIncDec(name, op);
    }

    if (t.type === '{') {
      if (this.isHPLBrace()) return this.parseExpressionStatement();
      this.error('裸代码块不受支持（HPL 无块级作用域）', t);
    }

    return this.parseExpressionStatement();
  }

  makeIncDec(name, op) {
    const one = { type: 'Number', text: '1' };
    const binOp = op === '++' ? '+' : '-';
    return {
      type: 'Assign',
      name,
      op: '=',
      value: { type: 'Binary', op: binOp, left: { type: 'Var', name }, right: one },
    };
  }

  parseVarDecl() {
    this.next(); // var | let | const
    const decls = [];
    while (true) {
      const nameTok = this.expectIdent();
      this.checkVarName(nameTok.value, nameTok);
      if (!this.at('=')) this.error('变量声明需要初值（HPL 不支持未初始化声明）', this.peek());
      this.next();
      const init = this.parseExpression();
      decls.push({ name: nameTok.value, init });
      if (this.at(',')) {
        this.next();
        continue;
      }
      // 允许逗号位于下一行行首（var a = 1\n, b = 2）
      const mark = this.i;
      this.skipNewlines();
      if (this.at(',')) {
        this.next();
        continue;
      }
      this.i = mark;
      break;
    }
    if (decls.length === 1) return { type: 'VarDecl', name: decls[0].name, init: decls[0].init };
    return { type: 'VarDeclList', decls };
  }

  parseAssignment() {
    const nameTok = this.expectIdent();
    this.checkVarName(nameTok.value, nameTok);
    const op = this.next().type;
    const value = this.parseExpression();
    if (op === '=') return { type: 'Assign', name: nameTok.value, op: '=', value };
    const binOp = COMPOUND_BINOPS[op];
    return {
      type: 'Assign',
      name: nameTok.value,
      op: '=',
      value: { type: 'Binary', op: binOp, left: { type: 'Var', name: nameTok.value }, right: value },
    };
  }

  parseExpressionStatement() {
    return { type: 'ExprStmt', expr: this.parseExpression() };
  }

  parseReturn() {
    this.next(); // return
    const t = this.peek();
    if (t.type === ';' || t.type === 'newline' || t.type === '}' || t.type === 'eof') {
      return { type: 'Return', expr: null };
    }
    return { type: 'Return', expr: this.parseExpression() };
  }

  parseIf() {
    this.next(); // if
    const branches = [];
    this.expect('(');
    const cond = this.parseExpression();
    this.expect(')');
    const body = this.parseBody();
    branches.push({ test: cond, body });

    let elseBody = null;
    while (true) {
      this.skipNewlines();
      if (!this.atIdent('else')) break;
      this.next(); // else
      if (this.atIdent('if')) {
        this.next();
        this.expect('(');
        const c = this.parseExpression();
        this.expect(')');
        const b = this.parseBody();
        branches.push({ test: c, body: b });
      } else {
        elseBody = this.parseBody();
        break;
      }
    }
    return { type: 'If', branches, elseBody };
  }

  parseFor() {
    this.next(); // for
    this.expect('(');
    if (this.at(';')) {
      this.error('不支持的 for(;;) 循环，仅支持 for (var a to N) 或 for (let i = 0; i < N; i++)', this.peek());
    }

    if (this.atIdent('var') || this.atIdent('let') || this.atIdent('const')) {
      this.next();
    }
    if (!this.at('ident')) this.error('for 循环期望循环变量', this.peek());
    const varTok = this.next();
    this.checkVarName(varTok.value, varTok);
    const loopVar = varTok.value;

    if (this.atIdent('to')) {
      // for (var a to N)
      this.next(); // 'to'
      const count = this.parseExpression();
      this.expect(')');
      const body = this.parseBody();
      return { type: 'For', var: loopVar, count, body };
    }

    if (this.at('=')) {
      // C-style: for (let i = 0; i < N; i++)
      return this.parseCFor(loopVar, varTok);
    }

    this.error('for 循环期望 "to" 或 "=" 形式（for (var a to N) 或 for (let i = 0; i < N; i++)）', this.peek());
  }

  parseCFor(loopVar, varTok) {
    this.expect('=');
    const init = this.parseExpression();
    if (!(init.type === 'Number' && init.text === '0')) {
      this.error('C 风格 for 仅支持 0 作为初始值（for (let i = 0; i < N; i++)）', varTok);
    }
    this.expect(';');

    const cond = this.parseExpression();
    if (!(cond.type === 'Binary' && cond.op === '<' && cond.left.type === 'Var' && cond.left.name === loopVar)) {
      this.error('C 风格 for 仅支持 i < N 形式的循环条件', this.peek());
    }
    const count = cond.right;
    this.expect(';');

    let stepOk = false;
    if (this.at('++')) {
      this.next();
      const id = this.expectIdent();
      stepOk = id.value === loopVar;
    } else if (this.atIdent(loopVar)) {
      this.next();
      if (this.at('++')) {
        this.next();
        stepOk = true;
      }
    }
    if (!stepOk) this.error('C 风格 for 仅支持 i++ 形式的步进', this.peek());

    this.expect(')');
    const body = this.parseBody();
    return { type: 'For', var: loopVar, count, body };
  }

  parseBlock() {
    this.expect('{');
    this.skipNewlines();
    const stmts = [];
    while (!this.at('}')) {
      if (this.at('eof')) this.error('未闭合的代码块 "{"');
      stmts.push(this.parseStatement());
      this.consumeTerminators();
    }
    this.expect('}');
    return stmts;
  }

  /**
   * Parse an if/for body: either a `{ ... }` block or a single statement
   * (braces omitted). An HPL brace statement (`{command, ...}`) is treated as
   * a single-statement body, not as a block.
   */
  parseBody() {
    if (this.at('{') && !this.isHPLBrace()) return this.parseBlock();
    return [this.parseStatement()];
  }

  isHPLBrace() {
    const t1 = this.peekAt(1);
    const t2 = this.peekAt(2);
    return t1.type === 'ident' && BRACE_KEYWORDS.includes(t1.value) && t2.type === ',';
  }

  // -------------------------------------------------------------- expressions

  parseExpression() {
    return this.parseLogicalOr();
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.at('||')) {
      this.next();
      const right = this.parseLogicalAnd();
      left = { type: 'Binary', op: 'or', left, right };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.at('&&')) {
      this.next();
      const right = this.parseEquality();
      left = { type: 'Binary', op: 'and', left, right };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    while (this.at('==') || this.at('===') || this.at('!=') || this.at('!==')) {
      const op = this.next().type;
      const right = this.parseRelational();
      const mapped = op === '===' || op === '==' ? '==' : '!=';
      left = { type: 'Binary', op: mapped, left, right };
    }
    return left;
  }

  parseRelational() {
    let left = this.parseAdditive();
    while (true) {
      const t = this.peek();
      if (t.type === '<' || t.type === '>' || t.type === '<=' || t.type === '>=') {
        this.next();
        const right = this.parseAdditive();
        left = { type: 'Binary', op: t.type, left, right };
      } else if (t.type === 'ident' && t.value === 'in') {
        this.next();
        const right = this.parseAdditive();
        left = { type: 'Binary', op: 'in', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.at('+') || this.at('-')) {
      const op = this.next().type;
      const right = this.parseMultiplicative();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.at('*') || this.at('/') || this.at('%')) {
      const op = this.next().type;
      const right = this.parseUnary();
      if (op === '%') {
        left = { type: 'Call', name: 'math.mod', dotted: true, args: [left, right] };
      } else {
        left = { type: 'Binary', op, left, right };
      }
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t.type === '!') {
      this.next();
      return { type: 'Unary', op: 'not', operand: this.parseUnary() };
    }
    if (t.type === '-') {
      this.next();
      return { type: 'Unary', op: '-', operand: this.parseUnary() };
    }
    if (t.type === '+') {
      this.next();
      return this.parseUnary(); // unary plus is a no-op
    }
    return this.parsePow();
  }

  parsePow() {
    let left = this.parsePrimary();
    if (this.at('**')) {
      this.next();
      const right = this.parseUnary();
      return { type: 'Call', name: 'math.pow', dotted: true, args: [left, right] };
    }
    return left;
  }

  parsePrimary() {
    const t = this.peek();
    switch (t.type) {
      case 'number':
        this.next();
        return { type: 'Number', text: t.value };
      case 'string':
        this.next();
        return { type: 'String', value: t.value };
      case 'templateHead':
        return this.parseTemplate();
      case 'ident':
        return this.parseIdentExpr();
      case '(': {
        this.next();
        const e = this.parseExpression();
        this.expect(')');
        return e;
      }
      case '{':
        return this.parseBraceStatement();
      case '[':
        this.error('数组字面量不受支持（HPL 使用 slices.new / maps.new）', t);
        break;
      case 'newline':
        this.error('表达式不完整', t);
        break;
      default:
        this.error(`意外的 token ${describe(t)}`, t);
    }
  }

  parseIdentExpr() {
    const t = this.next();
    const name = t.value;
    if (name === 'true') return { type: 'Bool', value: true };
    if (name === 'false') return { type: 'Bool', value: false };
    if (name === 'null' || name === 'undefined' || name === 'NaN' || name === 'this') {
      this.error(`不支持的表达式 '${name}'（HPL 无对应类型）`, t);
    }
    if (name === 'typeof' || name === 'new' || name === 'delete') {
      this.error(`不支持的操作符 '${name}'`, t);
    }
    if (this.at('.')) {
      let full = name;
      while (this.at('.')) {
        this.next();
        full += '.' + this.expectIdent().value;
      }
      if (this.at('(')) return this.parseCall(full, true);
      this.error('成员访问仅在函数调用位置合法（如 world.GetPlayerList()）', t);
    }
    if (this.at('(')) return this.parseCall(name, false);
    this.checkVarName(name, t);
    return { type: 'Var', name };
  }

  parseCall(name, dotted) {
    this.expect('(');
    const args = [];
    if (!this.at(')')) {
      args.push(this.parseExpression());
      while (this.at(',')) {
        this.next();
        args.push(this.parseExpression());
      }
    }
    this.expect(')');
    return { type: 'Call', name, dotted, args };
  }

  parseTemplate() {
    const head = this.next(); // templateHead
    const parts = [];
    if (head.value !== '') parts.push({ type: 'String', value: head.value });
    while (true) {
      const t = this.peek();
      if (t.type === 'templateTail') {
        this.next();
        if (t.value !== '') parts.push({ type: 'String', value: t.value });
        break;
      }
      const expr = this.parseExpression();
      parts.push({ type: 'Call', name: 'str', dotted: false, args: [expr] });
      const nt = this.next();
      if (nt.type === 'templateMiddle') {
        if (nt.value !== '') parts.push({ type: 'String', value: nt.value });
        continue;
      }
      if (nt.type === 'templateTail') {
        if (nt.value !== '') parts.push({ type: 'String', value: nt.value });
        break;
      }
      this.error('模板字符串解析错误', nt);
    }
    if (parts.length === 0) return { type: 'String', value: '' };
    if (parts.length === 1) return parts[0];
    let result = parts[0];
    for (let k = 1; k < parts.length; k++) {
      result = { type: 'Binary', op: '+', left: result, right: parts[k] };
    }
    return result;
  }

  parseBraceStatement() {
    this.expect('{');
    const kwTok = this.expectIdent();
    const kw = kwTok.value;
    if (!BRACE_KEYWORDS.includes(kw)) this.error(`未知的花括号语句关键字 '${kw}'`, kwTok);
    this.expect(',');

    switch (kw) {
      case 'ref': {
        const typeTok = this.expectIdent();
        if (!TYPE_KEYWORDS.includes(typeTok.value)) {
          this.error(`ref 的类型必须是 int/bool/float/str，得到 '${typeTok.value}'`, typeTok);
        }
        this.expect(',');
        const idx = this.parseExpression();
        this.expect('}');
        return { type: 'Brace', keyword: 'ref', typeKw: typeTok.value, args: [idx] };
      }
      case 'selector': {
        const e = this.parseExpression();
        this.expect('}');
        return { type: 'Brace', keyword: 'selector', args: [e] };
      }
      case 'score': {
        const e1 = this.parseExpression();
        this.expect(',');
        const e2 = this.parseExpression();
        this.expect('}');
        return { type: 'Brace', keyword: 'score', args: [e1, e2] };
      }
      case 'command': {
        const e = this.parseExpression();
        this.expect('}');
        return { type: 'Brace', keyword: 'command', args: [e] };
      }
      case 'func': {
        let name = this.expectIdent().value;
        while (this.at('.')) {
          this.next();
          name += '.' + this.expectIdent().value;
        }
        this.expect('(');
        const args = [];
        if (!this.at(')')) {
          args.push(this.parseExpression());
          while (this.at(',')) {
            this.next();
            args.push(this.parseExpression());
          }
        }
        this.expect(')');
        this.expect('}');
        return { type: 'Brace', keyword: 'func', name, args };
      }
    }
  }
}

function describe(token) {
  if (token.type === 'ident' || token.type === 'number' || token.type === 'string') {
    return `'${token.value}'`;
  }
  if (token.type === 'eof') return '文件结束';
  if (token.type === 'newline') return '换行';
  return `'${token.type}'`;
}

module.exports = { Parser };
