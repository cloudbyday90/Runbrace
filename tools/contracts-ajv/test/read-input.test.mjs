// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readInput} from '../read-input.mjs';
import {LIMITS} from '../parse.mjs';
function temporary(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runbrace-reader-'));
  try { fn(dir, path.join(dir, 'input.json')); }
  finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
test('regular bytes and exact limit remain accepted; larger files/directories refused', () => temporary((dir, file) => {
  fs.writeFileSync(file, '{}'); assert.equal(readInput(file).toString(), '{}');
  fs.writeFileSync(file, Buffer.alloc(LIMITS.bytes)); assert.equal(readInput(file).length, LIMITS.bytes);
  fs.appendFileSync(file, 'x'); assert.throws(() => readInput(file), e => e.code === 'input_bytes_limit');
  assert.throws(() => readInput(dir));
}));
test('persistent symlink is refused', {skip: process.platform === 'win32'}, () => temporary((dir, file) => {
  fs.writeFileSync(file, '{}'); const link = path.join(dir, 'link.json'); fs.symlinkSync(file, link);
  assert.throws(() => readInput(link), e => e.code === 'symlink_refused');
}));
test('replacement between open and identity check is refused and descriptor closes', () => temporary((dir, file) => {
  fs.writeFileSync(file, '{}'); const original = fs.openSync, moved = path.join(dir, 'old.json'); let opened;
  fs.openSync = (...args) => { opened = original(...args); fs.renameSync(file, moved); fs.writeFileSync(file, '[]'); return opened; };
  try { assert.throws(() => readInput(file), e => e.code === 'input_bytes_limit'); }
  finally { fs.openSync = original; }
  assert.throws(() => fs.fstatSync(opened), e => e.code === 'EBADF');
}));
test('growth after metadata checks is bounded and refused', () => temporary((dir, file) => {
  fs.writeFileSync(file, '{}'); const original = fs.readSync; let largest = 0, grew = false;
  fs.readSync = (...args) => { largest = Math.max(largest, args[3]); if (!grew) { grew = true; fs.appendFileSync(file, 'x'.repeat(LIMITS.bytes * 2)); } return original(...args); };
  try { assert.throws(() => readInput(file), e => e.code === 'input_bytes_limit'); }
  finally { fs.readSync = original; }
  assert.ok(largest <= LIMITS.bytes + 1);
}));
test('read failure closes descriptor', () => temporary((dir, file) => {
  fs.writeFileSync(file, '{}'); const open = fs.openSync, read = fs.readSync; let opened;
  fs.openSync = (...args) => (opened = open(...args)); fs.readSync = () => { throw new Error('synthetic'); };
  try { assert.throws(() => readInput(file), /synthetic/); }
  finally { fs.openSync = open; fs.readSync = read; }
  assert.throws(() => fs.fstatSync(opened), e => e.code === 'EBADF');
}));
test('FIFO is refused without blocking', {skip: process.platform === 'win32'}, () => temporary((dir, file) => {
  const made = spawnSync('mkfifo', [file]); assert.equal(made.status, 0);
  assert.throws(() => readInput(file), e => e.code === 'input_bytes_limit');
}));
