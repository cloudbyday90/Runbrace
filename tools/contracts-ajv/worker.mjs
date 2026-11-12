/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {loadReviewed, compileReviewed, validateBytes, makeAjv, TYPE_EXCEPTIONS,
  STATUS_ID, RESULT_ID, HERE, DEFAULT_ROOT, sha, OPTIONS} from './registry.mjs';
import {buildFixtures} from './fixtures.mjs';
import {LIMITS, Refusal} from './parse.mjs';

const require = createRequire(import.meta.url);
const code = status => ({valid: 0, invalid: 1, error: 2, unsafe: 3, unsupported: 3})[status] ?? 2;
function argumentsFor(args) {
  const options = {command: args.shift() ?? 'suite', root: DEFAULT_ROOT};
  const names = {'--root': 'root', '--schema': 'schema', '--input': 'input', '--python': 'python'};
  while (args.length) {
    const name = names[args.shift()];
    if (!name || !args.length || options[name] !== undefined && name !== 'root') throw new Refusal('usage');
    options[name] = args.shift();
  }
  if (!['suite', 'differential', 'check'].includes(options.command)) throw new Refusal('usage');
  return options;
}
function reportBase(loaded) {
  return {reportVersion: 1, node: process.version,
    packages: {ajv: require('ajv/package.json').version, 'ajv-formats': require('ajv-formats/package.json').version},
    manifestSha256: sha(fs.readFileSync(path.join(HERE, 'manifest.json'))),
    lockSha256: sha(fs.readFileSync(path.join(HERE, 'package-lock.json'))),
    tooling: ['package.json', 'parse.mjs', 'registry.mjs', 'fixtures.mjs', 'cli.mjs',
      'watchdog.mjs', 'worker.mjs', 'differential.py', 'test/contracts.test.mjs', 'python-requirements.lock']
      .map(file => ({path: file, sha256: sha(fs.readFileSync(path.join(HERE, file)))})),
    options: OPTIONS, limits: {...LIMITS, wallTimeMs: 40000, workerHeapMiB: 128, outputBytes: 1048576},
    schemas: loaded.manifest.schemas, inputs: loaded.manifest.inputs,
    typePlacementExceptions: [...TYPE_EXCEPTIONS],
    localReferenceBinding: {schema: STATUS_ID, ref: 'result-v1.schema.json', target: RESULT_ID},
    inputPolicy: 'UTF-8 scalar Unicode; unique decoded keys; canonical safe integers only; no normalization'};
}

function run() {
  const options = argumentsFor(process.argv.slice(2));
  const loaded = loadReviewed(options.root), validators = compileReviewed(loaded);
  if (options.command === 'check') {
    if (!options.schema || !options.input) throw new Refusal('usage');
    if (!validators.has(options.schema)) return [{status: 'error', code: 'unknown_schema'}, 2];
    const info = fs.lstatSync(options.input);
    if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.bytes) throw new Refusal('input_file_limit');
    const raw = fs.readFileSync(options.input);
    const result = validateBytes(validators, options.schema, raw);
    if (!fs.readFileSync(options.input).equals(raw)) throw new Refusal('source_bytes_changed');
    loaded.assertUnchanged();
    return [result, code(result.status)];
  }
  const fixtures = buildFixtures(loaded), results = [], coverage = {};
  for (const fixture of fixtures) {
    const outcome = validateBytes(validators, fixture.schema, fixture.raw);
    const pass = outcome.status === fixture.expected;
    results.push({name: fixture.name, schema: fixture.schema, expected: fixture.expected, ...outcome, pass});
    coverage[fixture.schema] ??= {positive: 0, negative: 0};
    if (outcome.status === 'valid') coverage[fixture.schema].positive++;
    if (outcome.status === 'invalid') coverage[fixture.schema].negative++;
  }
  const failures = results.filter(result => !result.pass).length;
  const strictBaseline = [];
  // Reproduce exact known strict-mode diagnostics using a fully strict instance.
  const strict = makeAjv();
  for (const s of loaded.schemas.values()) strict.addSchema(s);
  for (const id of TYPE_EXCEPTIONS) {
    try { strict.getSchema(id); strictBaseline.push({id, code: 'unexpected_strict_success'}); }
    catch (e) { strictBaseline.push({id, diagnostic: String(e.message).slice(0, 512)}); }
  }
  let summary = {...reportBase(loaded), status: failures ? 'fail' : 'pass',
    schemaCount: validators.size, fixtureCount: results.length, failures,
    coverage, strictBaseline, results};
  let exitCode = failures ? 1 : 0;
  if (options.command === 'differential') {
    const supported = fixtures.filter((f, i) => ['valid', 'invalid'].includes(results[i].status));
    const excluded = results.filter(r => !['valid', 'invalid'].includes(r.status)).map(r => ({name: r.name, status: r.status, code: r.code}));
    const python = options.python ?? path.join(HERE, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const request = {root: path.resolve(options.root), manifest: loaded.manifest,
      cases: supported.map(f => ({name: f.name, schema: f.schema, base64: f.raw.toString('base64')}))};
    const response = spawnSync(python, ['-I', '-B', path.join(HERE, 'differential.py')], {
      input: JSON.stringify(request), encoding: 'utf8', timeout: 25000,
      maxBuffer: 1024 * 1024, windowsHide: true,
    });
    if (response.error || response.status !== 0) throw new Refusal('python_unavailable_or_failed');
    let output;
    try { output = JSON.parse(response.stdout); } catch { throw new Refusal('python_protocol'); }
    if (output.status !== 'pass' || output.results.length !== supported.length) throw new Refusal('python_protocol');
    const byName = new Map(results.map(r => [r.name, r.status]));
    const mismatches = output.results.filter(r => r.status !== byName.get(r.name)).map(r => ({name: r.name,
      ajv: byName.get(r.name), python: r.status,
      knownFormatDifference: r.name === 'condition:leap-second-format-edge' && byName.get(r.name) === 'valid' && r.status === 'invalid'}));
    const unexpected = mismatches.filter(m => !m.knownFormatDifference);
    const domainMismatches = output.domain.filter(r => r.status !== byName.get(r.name));
    summary.differential = {python: output.python, packages: output.packages, schemaChecks: output.schemaChecks,
      compared: output.results.length, excluded, mismatches,
      unexpectedMismatches: unexpected.length, domainCompared: output.domain.length, domainMismatches};
    if (unexpected.length || domainMismatches.length) { summary.status = 'fail'; exitCode = 1; }
  }
  loaded.assertUnchanged();
  summary.sourceBytesUnchanged = true;
  return [summary, exitCode];
}

try {
  const [summary, exitCode] = run();
  process.stdout.write(JSON.stringify(summary) + '\n'); process.exitCode = exitCode;
} catch (e) {
  process.stdout.write(JSON.stringify({status: 'error', code: e instanceof Refusal ? e.code : 'tool_failure'}) + '\n');
  process.exitCode = 2;
}
