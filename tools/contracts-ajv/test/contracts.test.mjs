import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseBytes, LIMITS} from '../parse.mjs';
import {loadReviewed, compileReviewed, validateBytes, checkReferences, makeAjv,
  sha, HERE, TYPE_EXCEPTIONS, STATUS_ID} from '../registry.mjs';
import {buildFixtures, REQUEST_ID} from '../fixtures.mjs';
import {runBounded} from '../watchdog.mjs';

const root = process.env.RUNBRACE_AJV_TEST_ROOT || path.resolve(HERE, '../..');
const loaded = loadReviewed(root);
const validators = compileReviewed(loaded);
const fixtures = buildFixtures(loaded);
const buffer = value => Buffer.from(value);
function refusal(source, code, limits = LIMITS) {
  assert.throws(() => parseBytes(Buffer.isBuffer(source) ? source : buffer(source), limits),
    e => e.code === code);
}
function temporary(action) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runbrace-ajv-'));
  try { return action(dir); }
  finally {
    const absolute = fs.realpathSync(dir);
    assert.equal(path.dirname(absolute).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.match(path.basename(absolute), /^runbrace-ajv-/);
    fs.rmSync(absolute, {recursive: true, force: true});
  }
}

test('all 21 reviewed schemas compile and every generated case has its expected outcome', () => {
  assert.equal(validators.size, 21);
  const coverage = new Map();
  for (const fixture of fixtures) {
    const before = Buffer.from(fixture.raw);
    const result = validateBytes(validators, fixture.schema, fixture.raw);
    assert.equal(result.status, fixture.expected, fixture.name);
    assert.deepEqual(fixture.raw, before);
    assert.ok((result.diagnostics?.length ?? 0) <= LIMITS.diagnostics);
    coverage.set(`${fixture.schema}:${result.status}`, true);
  }
  for (const id of validators.keys()) {
    assert.ok(coverage.has(`${id}:valid`), id);
    assert.ok(coverage.has(`${id}:invalid`), id);
  }
  loaded.assertUnchanged();
});

for (const [name, source, expected] of [
  ['decoded duplicate', '{"a":0,"\\u0061":1}', 'unsafe_duplicate_key'],
  ['nested duplicate', '{"p":{"x":1,"x":2}}', 'unsafe_duplicate_key'],
  ['positive unsafe integer', '9007199254740993', 'unsafe_integer'],
  ['negative unsafe integer', '-9007199254740992', 'unsafe_integer'],
  ['negative zero', '-0', 'unsafe_negative_zero'],
  ['exponent overflow', '1e400', 'unsupported_number_lexeme'],
  ['exponent underflow', '1e-4000', 'unsupported_number_lexeme'],
  ['exact exponent', '1e0', 'unsupported_number_lexeme'],
  ['rounded decimal', '0.10000000000000001', 'unsupported_number_lexeme'],
  ['integer decimal', '1.0', 'unsupported_number_lexeme'],
  ['lone high surrogate', '"\\ud800"', 'unsafe_unicode'],
  ['lone low surrogate key', '{"\\udfff":1}', 'unsafe_unicode'],
  ['leading zero', '01', 'invalid_json'],
  ['trailing content', 'true false', 'invalid_json'],
  ['nonfinite', 'NaN', 'invalid_json'],
  ['BOM', '\ufeff{}', 'invalid_json'],
  ['unescaped control', '"a\n"', 'invalid_json'],
  ['trailing comma', '[1,]', 'invalid_json'],
]) test(`parser refuses ${name} before whole-document JSON.parse`, () => refusal(source, expected));

test('parser accepts exact boundaries, escaped scalars and separate object scopes', () => {
  assert.equal(parseBytes(buffer('9007199254740991')), Number.MAX_SAFE_INTEGER);
  assert.equal(parseBytes(buffer('-9007199254740991')), Number.MIN_SAFE_INTEGER);
  assert.deepEqual(parseBytes(buffer('[{"a":1},{"a":2}]')), [{a: 1}, {a: 2}]);
  assert.equal(parseBytes(buffer('"\\ud83d\\ude80"')), '\ud83d\ude80');
  assert.equal(parseBytes(buffer('"\\u0061"')), 'a');
  assert.notEqual(parseBytes(buffer('"e\\u0301"')), parseBytes(buffer('"\\u00e9"')));
});
test('parser rejects malformed UTF-8, deep nesting, large files and token floods', () => {
  refusal(Buffer.from([0xff]), 'invalid_utf8');
  refusal('['.repeat(50) + '0' + ']'.repeat(50), 'input_depth_limit');
  refusal(' '.repeat(LIMITS.bytes + 1), 'input_bytes_limit');
  refusal('[0,0,0,0]', 'input_token_limit', {...LIMITS, tokens: 4});
});
test('decoded special property names do not change prototypes', () => {
  const value = parseBytes(buffer('{"__proto__":{"x":1}}'));
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.ok(Object.hasOwn(value, '__proto__'));
  assert.equal({}.x, undefined);
});
test('source spelling and key order remain hash-significant', () => {
  assert.notEqual(sha(buffer('{"a":1,"b":2}')), sha(buffer('{"b":2,"a":1}')));
  assert.notEqual(sha(buffer('"a"')), sha(buffer('"\\u0061"')));
  assert.deepEqual(parseBytes(buffer('"a"')), parseBytes(buffer('"\\u0061"')));
});
test('unknown schema selection returns a fixed sanitized error', () => {
  assert.deepEqual(validateBytes(validators, 'https://invalid.example/private', buffer('{}')),
    {status: 'error', code: 'unknown_schema'});
});
test('offline references reject unknown IDs, files, missing fragments and async extensions', () => {
  for (const ref of ['https://invalid.example/private', 'file:///secret.json', 'unknown.json',
    'urn:runbrace:schema:identity:1#/$defs/not_registered']) {
    const schemas = new Map(loaded.schemas);
    schemas.set('urn:test:controlled', {$id: 'urn:test:controlled', $ref: ref});
    assert.throws(() => checkReferences(schemas), e => e.code === 'unknown_reference');
  }
  const schemas = new Map([['urn:test:controlled', {$async: true}]]);
  assert.throws(() => checkReferences(schemas), e => e.code === 'schema_feature_refused');
});
test('strict schema checks remain enabled outside three hash-bound type-placement exceptions', () => {
  assert.equal(TYPE_EXCEPTIONS.size, 3);
  const ajv = makeAjv();
  assert.throws(() => ajv.compile({type: 'string', unknown_keyword: true}), /strict mode/);
  assert.throws(() => ajv.compile({type: 'string', format: 'synthetic-unknown-format'}), /unknown format/);
  assert.throws(() => ajv.compile({type: 'object', required: ['absent']}), /strict mode/);
  for (const schema of loaded.schemas.values()) ajv.addSchema(schema);
  for (const id of TYPE_EXCEPTIONS) assert.throws(() => ajv.getSchema(id), /strictTypes/);
});
test('only the exact reviewed compatibility relative reference gets a local binding', () => {
  const ajv = makeAjv({localBinding: false});
  for (const schema of loaded.schemas.values()) ajv.addSchema(schema);
  assert.throws(() => ajv.getSchema(STATUS_ID), /URN without nid/);
  assert.equal(makeAjv().opts.uriResolver.resolve(STATUS_ID, 'result-v1.schema.json'),
    'urn:runbrace:compatibility:fixture-result:1');
});
test('Draft 2020-12 prefixItems tuple semantics reject short, long and wrong-type arrays', () => {
  // Controlled self-test schema only; no interface accepts arbitrary schemas.
  const validate = makeAjv().compile({type: 'array', prefixItems: [{type: 'integer'}, {type: 'string'}],
    minItems: 2, maxItems: 2, items: false});
  assert.ok(validate([1, 'synthetic']));
  for (const value of [[1], [1, 'a', false], ['1', 'a'], [1, 2]]) assert.equal(validate(value), false);
});
test('coercion, defaults and removal stay disabled and failures do not mutate bytes', () => {
  for (const option of ['coerceTypes', 'useDefaults', 'removeAdditional']) assert.equal(makeAjv().opts[option], false);
  for (const name of ['request:string-integer-no-coercion', 'request:missing-nested-no-default', 'request:extra-nested-no-removal']) {
    const fixture = fixtures.find(f => f.name === name), before = Buffer.from(fixture.raw);
    assert.equal(validateBytes(validators, REQUEST_ID, fixture.raw).status, 'invalid');
    assert.deepEqual(fixture.raw, before);
  }
});
test('new schemas and changes to reviewed bytes fail closed in a disposable root', () => temporary(dir => {
  for (const entry of [...loaded.manifest.schemas, ...loaded.manifest.inputs]) {
    const dest = path.join(dir, entry.path); fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, loaded.raw.get(entry.path));
  }
  assert.equal(loadReviewed(dir).schemas.size, 21);
  const extra = path.join(dir, 'docs/contracts/synthetic-extra.schema.json');
  fs.writeFileSync(extra, '{}');
  assert.throws(() => loadReviewed(dir), e => e.code === 'schema_inventory_changed');
  fs.unlinkSync(extra);
  const target = path.join(dir, loaded.manifest.schemas[0].path);
  fs.appendFileSync(target, '\n');
  assert.throws(() => loadReviewed(dir), e => e.code === 'reviewed_input_changed');
}));

function cli(args) {
  const response = spawnSync(process.execPath, [path.join(HERE, 'cli.mjs'), ...args, '--root', root],
    {encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024, windowsHide: true});
  assert.ifError(response.error);
  assert.equal(response.stderr, '');
  return {status: response.status, summary: JSON.parse(response.stdout)};
}
test('CLI suite is deterministic, machine-readable and covers the entire source set', () => {
  const first = cli(['suite']), second = cli(['suite']);
  assert.equal(first.status, 0); assert.equal(first.summary.status, 'pass');
  assert.equal(first.summary.schemaCount, 21); assert.equal(first.summary.fixtureCount, fixtures.length);
  assert.deepEqual(first, second);
});
test('CLI stable codes: valid=0 invalid=1 tooling/unknown=2 unsafe/unsupported=3', () => temporary(dir => {
  const input = path.join(dir, 'synthetic.json');
  for (const [content, exit, status] of [
    [loaded.raw.get('compatibility-runtime/contracts/example-request.json'), 0, 'valid'],
    [buffer('{}'), 1, 'invalid'], [buffer('9007199254740993'), 3, 'unsafe'],
    [buffer('1e0'), 3, 'unsupported'], [buffer('{'), 2, 'error'],
  ]) {
    fs.writeFileSync(input, content);
    const result = cli(['check', '--schema', REQUEST_ID, '--input', input]);
    assert.equal(result.status, exit); assert.equal(result.summary.status, status);
  }
  assert.equal(cli(['check', '--schema', 'unknown', '--input', input]).status, 2);
  assert.equal(cli(['unknown-command']).status, 2);
}));
test('diagnostics never print synthetic payloads, input paths or exception text', () => temporary(dir => {
  const input = path.join(dir, 'synthetic-private-name.json');
  const value = structuredClone(loaded.inputs.get('compatibility-runtime/contracts/example-request.json'));
  value.private_marker = 'SYNTHETIC_PAYLOAD_MARKER'; fs.writeFileSync(input, JSON.stringify(value));
  const response = cli(['check', '--schema', REQUEST_ID, '--input', input]);
  assert.equal(response.status, 1);
  const text = JSON.stringify(response.summary);
  assert.ok(!text.includes('SYNTHETIC_PAYLOAD_MARKER'));
  assert.ok(!text.includes(input)); assert.ok(!text.includes('private_marker'));
}));
test('watchdog terminates a controlled idle worker and returns timeout code 4', () => {
  const response = runBounded(['-e', 'setInterval(() => {}, 1000)'], 100);
  assert.equal(response.exitCode, 4);
  assert.deepEqual(response.summary, {status: 'error', code: 'execution_timeout'});
});
