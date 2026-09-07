/**
 * Token type constants and shared keyword sets for the JS-like → HPL transpiler.
 */

const TYPE_KEYWORDS = ['int', 'bool', 'float', 'str'];

const BRACE_KEYWORDS = ['ref', 'selector', 'score', 'command', 'func'];

const DECL_KEYWORDS = ['var', 'let', 'const'];

// Reserved words that are rejected when used as plain identifiers / variable names.
const RESERVED = new Set([
  // JS dialect keywords
  'var', 'let', 'const', 'if', 'else', 'for', 'to', 'return', 'break',
  'continue', 'true', 'false', 'null', 'undefined', 'NaN', 'in',
  'while', 'do', 'function', 'typeof', 'new', 'delete', 'this',
  'instanceof', 'switch', 'case', 'default', 'throw', 'try', 'catch',
  // HPL keywords that must not be used as identifiers
  'and', 'or', 'not', 'elif', 'fi', 'rof',
  'ref', 'selector', 'score', 'command', 'func',
  'int', 'bool', 'float', 'str',
]);

module.exports = {
  TYPE_KEYWORDS,
  BRACE_KEYWORDS,
  DECL_KEYWORDS,
  RESERVED,
};
