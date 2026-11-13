#!/usr/bin/env node
/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */

// Runbrace implementation of Classifarr's add/check-header workflow.
// See docs/license-headers.md for provenance and deliberate differences.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const roots = ['scripts/', 'tools/', 'observability/', 'compatibility-runtime/'];
const extensions = new Set(['.js', '.mjs', '.cjs', '.py', '.php']);
const excluded = new Set(['node_modules', 'vendor', 'third_party', 'third-party', 'dist', 'build', 'coverage', '__pycache__', 'generated', 'fixtures']);
export function eligible(name) {
  return roots.some(root => name.startsWith(root)) && extensions.has(path.posix.extname(name)) && !name.split('/').some(part => excluded.has(part));
}
export function transform(name, bytes) {
  if (!eligible(name)) return { status: 'excluded', bytes };
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes('\0')) throw new Error(`Binary source: ${name}`);
  const start = text.slice(0, 4096);
  if (/^(?:[ \t]*(?:#|\/\/|\/\*|\*)[ \t]*)(?:@generated\b|automatically generated|DO NOT EDIT)/im.test(start)) return { status: 'generated', bytes };
  if (/SPDX-License-Identifier:|copyright\s*(?:\(c\)|©|\d)/i.test(start)) {
    // Existing notices are never replaced or attributed to another owner.
    const own = /SPDX-License-Identifier: GPL-3\.0-only\s/.test(start) && /Copyright \(C\) \d{4}(?:-\d{4})? Runbrace Contributors/.test(start);
    return { status: own ? 'present' : 'review', bytes };
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let offset = text.startsWith('\uFEFF') ? 1 : 0;
  const nextLine = () => { const end = text.indexOf('\n', offset); offset = end < 0 ? text.length : end + 1; };
  if (text.slice(offset).startsWith('#!')) nextLine();
  if (name.endsWith('.py')) {
    // Preserve PEP 263 encoding declarations in either of the first two lines.
    const lines = text.slice(offset).split('\n');
    if (/^[ \t]*#.*coding[:=]/.test(lines[0])) nextLine();
    else if (/^[ \t]*#/.test(lines[0]) && /^[ \t]*#.*coding[:=]/.test(lines[1] || '')) { nextLine(); nextLine(); }
  }
  if (name.endsWith('.php')) {
    if (!text.slice(offset).startsWith('<?php') || !/\s/.test(text[offset + 5] || '')) throw new Error(`Expected PHP opening tag: ${name}`);
    offset += 5;
    if (text.slice(offset).startsWith(eol)) offset += eol.length;
    else if (text[offset] === '\n') offset++;
  }
  const lines = ['SPDX-License-Identifier: GPL-3.0-only', 'Copyright (C) 2026 Runbrace Contributors'];
  const header = name.endsWith('.py') ? lines.map(line => '# ' + line).join(eol) : ['/*', ...lines.map(line => ' * ' + line), ' */'].join(eol);
  const prefix = text.slice(0, offset);
  const separator = prefix && !prefix.endsWith('\n') ? eol : '';
  return { status: 'missing', bytes: Buffer.from(prefix + separator + header + eol + eol + text.slice(offset), 'utf8') };
}
export function run(root, write = false) {
  const names = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
  let failures = 0;
  for (const name of names.filter(eligible)) {
    const file = path.join(root, name);
    if (!fs.lstatSync(file).isFile()) throw new Error(`Not a regular file: ${name}`);
    const result = transform(name, fs.readFileSync(file));
    if (result.status === 'missing' && write) fs.writeFileSync(file, result.bytes);
    else if (['missing', 'review'].includes(result.status)) failures++;
    console.log(`${result.status === 'missing' && write ? 'added' : result.status}: ${name}`);
  }
  return failures ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--write'].includes(args[0])) {
    console.error('Usage: node scripts/license-headers.mjs --check|--write'); process.exitCode = 2;
  } else process.exitCode = run(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), args[0] === '--write');
}
