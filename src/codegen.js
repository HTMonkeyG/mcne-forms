const { TYPE_KEYWORDS } = require('./tokens.js');

/**
 * Code generator: AST → HPL source string.
 */

/**
 * @param {object} program AST root
 * @param {{indent?: string}} options
 * @returns {string}
 */
function generate(program, options = {}) {
  const indentStr = options.indent != null ? options.indent : '  ';
  const lines = [];
  emitBlock(program.body, 0, lines, indentStr);
  return lines.length ? lines.join('\n') + '\n' : '';
}

function emitBlock(stmts, depth, lines, indentStr) {
  for (const stmt of stmts) {
    emitStmt(stmt, depth, lines, indentStr);
  }
}

function pad(depth, indentStr) {
  return indentStr.repeat(depth);
}

function emitStmt(stmt, depth, lines, indentStr) {
  const ind = pad(depth, indentStr);
  switch (stmt.type) {
    case 'VarDecl':
      lines.push(`${ind}${stmt.name} = ${emitExpr(stmt.init)}`);
      break;
    case 'VarDeclList':
      for (const d of stmt.decls) {
        lines.push(`${ind}${d.name} = ${emitExpr(d.init)}`);
      }
      break;
    case 'Assign':
      lines.push(`${ind}${stmt.name} = ${emitExpr(stmt.value)}`);
      break;
    case 'ExprStmt':
      lines.push(`${ind}${emitExpr(stmt.expr)}`);
      break;
    case 'Return':
      lines.push(stmt.expr ? `${ind}return ${emitExpr(stmt.expr)}` : `${ind}return 0`);
      break;
    case 'Break':
      lines.push(`${ind}break`);
      break;
    case 'Continue':
      lines.push(`${ind}continue`);
      break;
    case 'If': {
      const first = stmt.branches[0];
      lines.push(`${ind}if ${emitExpr(first.test)}:`);
      emitBlock(first.body, depth + 1, lines, indentStr);
      for (let k = 1; k < stmt.branches.length; k++) {
        const b = stmt.branches[k];
        lines.push(`${ind}elif ${emitExpr(b.test)}:`);
        emitBlock(b.body, depth + 1, lines, indentStr);
      }
      if (stmt.elseBody) {
        lines.push(`${ind}else:`);
        emitBlock(stmt.elseBody, depth + 1, lines, indentStr);
      }
      lines.push(`${ind}fi`);
      break;
    }
    case 'For':
      lines.push(`${ind}for ${stmt.var}, ${emitExpr(stmt.count)}:`);
      emitBlock(stmt.body, depth + 1, lines, indentStr);
      lines.push(`${ind}rof`);
      break;
    default:
      throw new Error(`codegen: 未知的语句类型 '${stmt.type}'`);
  }
}

function emitExpr(expr) {
  switch (expr.type) {
    case 'Number':
      return expr.text;
    case 'String':
      return encodeString(expr.value);
    case 'Bool':
      return expr.value ? 'True' : 'False';
    case 'Var':
      return expr.name;
    case 'Call':
      return emitCall(expr);
    case 'Brace':
      return emitBrace(expr);
    case 'Binary':
      return `${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)}`;
    case 'Unary': {
      if (expr.op === 'not') return `not ${emitExpr(expr.operand)}`;
      const operand = emitExpr(expr.operand);
      return `-${needsParens(expr.operand) ? `(${operand})` : operand}`;
    }
    default:
      throw new Error(`codegen: 未知的表达式类型 '${expr.type}'`);
  }
}

function emitCall(call) {
  const argStr = call.args.map(emitExpr).join(', ');
  if (TYPE_KEYWORDS.includes(call.name) && !call.dotted && call.args.length === 1) {
    return `${call.name}(${argStr})`;
  }
  return `{func, ${call.name}(${argStr})}`;
}

function emitBrace(brace) {
  switch (brace.keyword) {
    case 'ref':
      return `{ref, ${brace.typeKw}, ${emitExpr(brace.args[0])}}`;
    case 'selector':
      return `{selector, ${emitExpr(brace.args[0])}}`;
    case 'score':
      return `{score, ${emitExpr(brace.args[0])}, ${emitExpr(brace.args[1])}}`;
    case 'command':
      return `{command, ${emitExpr(brace.args[0])}}`;
    case 'func':
      return `{func, ${brace.name}(${brace.args.map(emitExpr).join(', ')})}`;
    default:
      throw new Error(`codegen: 未知的花括号语句 '${brace.keyword}'`);
  }
}

function needsParens(expr) {
  return !['Number', 'String', 'Bool', 'Var'].includes(expr.type);
}

/**
 * Encode a JavaScript string value as an HPL single-quoted string literal.
 */
function encodeString(s) {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '\\': out += '\\\\'; break;
      case "'": out += "\\'"; break;
      case '\n': out += '\\n'; break;
      case '\t': out += '\\t'; break;
      case '\r': out += '\\r'; break;
      case '\0': out += '\\0'; break;
      case '\b': out += '\\b'; break;
      case '\f': out += '\\f'; break;
      case '\v': out += '\\v'; break;
      case '\x07': out += '\\a'; break;
      default: out += ch;
    }
  }
  return `'${out}'`;
}

module.exports = { generate };
