const { Lexer } = require('./lexer.js');
const { Parser } = require('./parser.js');
const { generate } = require('./codegen.js');
const { minify } = require('./minify.js');

/**
 * Transpile JS-like source into HPL (NEMC Form Script) source.
 *
 * @param {string} source JS-like source code
 * @param {{indent?: string, sourceName?: string, filename?: string}} [options]
 * @returns {{ code: string }}
 */
function transpile(source, options = {}) {
  const sourceName = options.sourceName || options.filename || undefined;
  const lexer = new Lexer(source, sourceName);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, sourceName);
  const program = parser.parseProgram();
  const code = generate(program, { indent: options.indent });
  return { code };
}

module.exports = { transpile, minify, Lexer, Parser, generate };
