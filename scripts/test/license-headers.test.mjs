/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligible, transform } from '../license-headers.mjs';
const apply = (name, text) => transform(name, Buffer.from(text));
for (const ext of ['mjs', 'js', 'cjs', 'py', 'php']) test(`idempotent ${ext}`, () => {
  const original = ext === 'php' ? '<?php\ndeclare(strict_types=1);\n' : '/* body */\n';
  const a = apply(`tools/a.${ext}`, original);
  assert.equal(a.status, 'missing');
  assert.equal(transform(`tools/a.${ext}`, a.bytes).status, 'present');
  assert.ok(a.bytes.toString().endsWith(original.replace('<?php\n', '')));
});
test('shebang, encoding, BOM, CRLF and Unicode preserved', () => {
  const text = '\uFEFF#!/usr/bin/python\r\n# coding: utf-8\r\nprint("é")\r\n';
  const result = apply('tools/a.py', text).bytes.toString();
  assert.ok(result.startsWith('\uFEFF#!/usr/bin/python\r\n# coding: utf-8\r\n# SPDX'));
  assert.ok(result.endsWith('print("é")\r\n'));
  assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
});
test('preserves encoding on second line without shebang', () => assert.match(apply('tools/a.py', '# comment\n# coding: utf-8\nx=1\n').bytes.toString(), /^# comment\n# coding: utf-8\n# SPDX/));
test('third-party notices require review, never rewritten', () => {
  const b = Buffer.from('// Copyright (c) 2020 Other\n');
  const r = transform('tools/a.js', b); assert.equal(r.status, 'review'); assert.deepEqual(r.bytes, b);
});
test('generated files preserved', () => assert.equal(apply('tools/a.js', '// @generated DO NOT EDIT\n').status, 'generated'));
test('excluded types and dependency trees', () => {
  for (const name of ['tools/a.json', 'tools/package-lock.json', 'LICENSE', 'tools/node_modules/a.js', 'tools/vendor/a.py', 'tools/fixtures/a.py', 'tools/generated/a.js']) assert.equal(eligible(name), false, name);
});
test('reject malformed PHP and non-UTF8', () => {
  assert.throws(() => apply('tools/a.php', 'html'));
  assert.throws(() => transform('tools/a.js', Buffer.from([255])));
});
test('PHP inline opening remains before header', () => assert.match(apply('tools/a.php', '<?php declare(strict_types=1);').bytes.toString(), /^<\?php\n\/\*/));
