#!/usr/bin/env node
/**
 * CLI: transpile a JS-like source file into HPL.
 *
 *   node src/cli.js <input> [-o <output>]
 *
 * Without `-o` the HPL is written to stdout.
 */
const fs = require('fs');
const path = require('path');
const { transpile, minify } = require('./index.js');
const { TranspileError } = require('./errors.js');

function parseArgs(argv) {
  let input = null;
  let output = null;
  let doMinify = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') {
      if (i + 1 >= argv.length) fail('缺少 -o 的输出文件路径');
      output = argv[++i];
    } else if (a === '-m' || a === '--minify') {
      doMinify = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (input == null) {
      input = a;
    } else {
      fail(`无法识别的参数 '${a}'`);
    }
  }
  if (input == null) fail('缺少输入文件（用法：node src/cli.js <input> [-o <output>]）');
  return { input, output, doMinify };
}

function printHelp() {
  process.stdout.write([
    '用法: node src/cli.js <input> [-o <output>] [--minify]',
    '',
    '将 JS-like 源码转译为 NEMC Form Script (HPL)。',
    '  -o, --out <file>  输出到文件；缺省时输出到 stdout。',
    '  -m, --minify      压缩为用 | 分隔的单行，并将局部变量名混淆为 _1、_2 …',
    '  -h, --help        显示帮助。',
    '',
  ].join('\n'));
}

function fail(msg) {
  process.stderr.write(`错误: ${msg}\n`);
  process.exit(1);
}

function main() {
  const { input, output, doMinify } = parseArgs(process.argv.slice(2));

  let source;
  try {
    source = fs.readFileSync(input, 'utf8');
  } catch (e) {
    fail(`无法读取输入文件 '${input}': ${e.message}`);
  }

  let code;
  try {
    ({ code } = transpile(source, { filename: path.basename(input) }));
    if (doMinify) {
      ({ code } = minify(code));
    }
  } catch (e) {
    if (e instanceof TranspileError) {
      process.stderr.write(`${e.toString()}\n`);
    } else {
      process.stderr.write(`${e.stack || e}\n`);
    }
    process.exit(1);
  }

  if (output) {
    try {
      fs.writeFileSync(output, code, 'utf8');
    } catch (e) {
      fail(`无法写入输出文件 '${output}': ${e.message}`);
    }
  } else {
    process.stdout.write(code);
  }
}

main();
