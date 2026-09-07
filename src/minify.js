/**
 * Standalone HPL (NEMC Form Script) minifier.
 *
 * - Flattens a multi-line HPL program into a single line, joining statements
 *   with `|` (HPL's equivalent of a newline). Block structure is preserved by
 *   the `if/elif/else/fi` and `for/rof` keywords together with `:`.
 * - Obfuscates local variable names into `_1`, `_2`, ... in order of first
 *   assignment.
 *
 * Only variables *assigned within the code* (assignment targets and loop
 * variables) are renamed. Keywords, builtin function names (`math.sqrt`,
 * `world.GetPlayerList`, ...), string literals, numbers, and externally
 * provided variables (e.g. `args` / `error` in event callbacks) are left
 * untouched, so the output stays semantically equivalent.
 */

const HPL_KEYWORDS = new Set([
  'int', 'bool', 'str', 'float',
  'ref', 'selector', 'score', 'command', 'func',
  'return', 'if', 'else', 'elif', 'fi', 'for', 'continue', 'break', 'rof',
  'and', 'or', 'not', 'in',
  'True', 'False',
]);

/**
 * @param {string} source HPL source
 * @returns {{ code: string }}
 */
function minify(source) {
  const tokens = lexHpl(source);
  const renameMap = buildRenameMap(tokens);

  const out = [];
  let atSep = true; // at start / just after a `|`
  let prevWord = false; // last emitted char is a word char
  for (const tok of tokens) {
    if (tok.kind === 'sep') {
      if (!atSep) {
        out.push('|');
        atSep = true;
        prevWord = false;
      }
      continue;
    }
    let text = tok.text;
    if (tok.kind === 'ident' && renameMap.has(tok.text)) {
      text = renameMap.get(tok.text);
    }
    if (prevWord && isWordStart(text)) out.push(' ');
    out.push(text);
    atSep = false;
    prevWord = isWordEnd(text);
  }

  return { code: out.join('').replace(/\|+$/, '') };
}

function buildRenameMap(tokens) {
  const seen = new Set();
  const order = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'ident') continue;
    if (HPL_KEYWORDS.has(t.text)) continue;
    if (t.text.includes('.')) continue;

    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    const isAssignTarget = next && next.kind === 'punct' && next.text === '=';
    const isLoopVar =
      prev && prev.kind === 'ident' && prev.text === 'for' &&
      next && next.kind === 'punct' && next.text === ',';

    if ((isAssignTarget || isLoopVar) && !seen.has(t.text)) {
      seen.add(t.text);
      order.push(t.text);
    }
  }
  const map = new Map();
  order.forEach((name, idx) => map.set(name, `_${idx + 1}`));
  return map;
}

function isWordChar(c) {
  return /[A-Za-z0-9_]/.test(c);
}
function isWordStart(text) {
  return text.length > 0 && isWordChar(text[0]);
}
function isWordEnd(text) {
  return text.length > 0 && isWordChar(text[text.length - 1]);
}

function isIdentStart(c) {
  return /[A-Za-z_]/.test(c);
}
function isIdentPart(c) {
  return /[A-Za-z0-9_.]/.test(c);
}
function isDigit(c) {
  return c >= '0' && c <= '9';
}

const SINGLE_PUNCT = '=<>+-*/(){},:';

function lexHpl(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\n' || c === '|') {
      tokens.push({ kind: 'sep', text: c });
      i++;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentPart(src[j])) j++;
      tokens.push({ kind: 'ident', text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (isDigit(c)) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === '.' && isDigit(src[j + 1])) {
        j++;
        while (j < n && isDigit(src[j])) j++;
      }
      tokens.push({ kind: 'number', text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ kind: 'string', text: src.slice(i, j) });
      i = j;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ kind: 'punct', text: two });
      i += 2;
      continue;
    }
    if (SINGLE_PUNCT.includes(c)) {
      tokens.push({ kind: 'punct', text: c });
      i++;
      continue;
    }
    // Defensive: consume any other character verbatim.
    tokens.push({ kind: 'punct', text: c });
    i++;
  }
  return tokens;
}

module.exports = { minify };
