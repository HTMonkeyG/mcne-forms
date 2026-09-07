/**
 * Error type thrown by the transpiler, carrying source position.
 */
class TranspileError extends Error {
  /**
   * @param {string} message
   * @param {number} line 1-based
   * @param {number} column 1-based
   * @param {string} [sourceName]
   */
  constructor(message, line, column, sourceName) {
    const where = sourceName ? `${sourceName}:` : '';
    super(`${where}${line}:${column}: ${message}`);
    this.name = 'TranspileError';
    this.message = message;
    this.line = line;
    this.column = column;
    this.sourceName = sourceName;
  }

  toString() {
    const where = this.sourceName ? `${this.sourceName}:` : '';
    return `${where}${this.line}:${this.column}: ${this.message}`;
  }
}

module.exports = { TranspileError };
