import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {parseBytes, LIMITS, Refusal} from './parse.mjs';
import {readInput} from './read-input.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const DEFAULT_ROOT = path.resolve(HERE, '../..');
export const STATUS_ID = 'urn:runbrace:compatibility:fixture-status:1';
export const RESULT_ID = 'urn:runbrace:compatibility:fixture-result:1';
export const TYPE_EXCEPTIONS = new Set([
  'urn:runbrace:schema:status-table-profile:1',
  'urn:runbrace:schema:matching-decision:1',
  'urn:runbrace:schema:matching-rule-set:1',
]);
export const OPTIONS = Object.freeze({strict: true, allErrors: false, verbose: false,
  messages: false, logger: false, coerceTypes: false, useDefaults: false,
  removeAdditional: false, ownProperties: true, validateFormats: true,
  $data: false, validateSchema: true, loopRequired: 64, loopEnum: 64});

export function makeAjv({inheritedTypes = false, localBinding = true} = {}) {
  const uri = new Ajv2020(OPTIONS).opts.uriResolver;
  const uriResolver = {...uri, resolve(base, ref) {
    // A single explicit repository-local binding, not a general URN/file rule.
    if (localBinding && base === STATUS_ID && ref === 'result-v1.schema.json') return RESULT_ID;
    return uri.resolve(base, ref);
  }};
  const ajv = new Ajv2020({...OPTIONS, uriResolver,
    ...(inheritedTypes ? {strictTypes: false} : {})});
  addFormats(ajv, {mode: 'full', keywords: false,
    formats: ['date-time', 'uuid', 'uri', 'uri-reference', 'json-pointer']});
  return ajv;
}

function safePath(root, relative) {
  if (!/^(docs\/contracts\/|compatibility-runtime\/contracts\/)[a-zA-Z0-9_./-]+\.json$/.test(relative)
      || relative.split('/').some(s => s === '..' || s === '.')) throw new Refusal('manifest_path');
  const resolvedRoot = fs.realpathSync(root);
  let current = resolvedRoot;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Refusal('symlink_refused');
  }
  return current;
}

export function loadReviewed(root = DEFAULT_ROOT) {
  // Manifests are reviewed source code, not a user-supplied schema interface.
  const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
  if (manifest.schemas.length > LIMITS.schemas || manifest.inputs.length > LIMITS.fixtures)
    throw new Refusal('manifest_count_limit');
  const discovered = [];
  let entries = 0;
  function discover(folder, prefix) {
    for (const d of fs.readdirSync(folder, {withFileTypes: true})) {
      if (++entries > 1024) throw new Refusal('inventory_count_limit');
      if (d.isSymbolicLink()) throw new Refusal('symlink_refused');
      const rel = `${prefix}/${d.name}`;
      if (d.isDirectory()) discover(path.join(folder, d.name), rel);
      else if (d.name.endsWith('.schema.json')) discovered.push(rel);
    }
  }
  for (const prefix of ['docs/contracts', 'compatibility-runtime/contracts']) {
    let current = fs.realpathSync(root);
    for (const part of prefix.split('/')) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) throw new Refusal('symlink_refused');
    }
    discover(current, prefix);
  }
  if (!isDeepStrictEqual(discovered.sort(), manifest.schemas.map(s => s.path).sort()))
    throw new Refusal('schema_inventory_changed');
  let bytes = 0;
  const raw = new Map(), inputs = new Map(), schemas = new Map();
  for (const entry of [...manifest.schemas, ...manifest.inputs]) {
    const file = safePath(root, entry.path);
    const buffer = readInput(file); bytes += buffer.length;
    if (bytes > LIMITS.totalBytes) throw new Refusal('total_bytes_limit');
    if (sha(buffer) !== entry.sha256) throw new Refusal('reviewed_input_changed');
    raw.set(entry.path, buffer);
    const value = parseBytes(buffer);
    if (entry.id) {
      if (value.$id !== entry.id || value.$schema !== 'https://json-schema.org/draft/2020-12/schema'
          || schemas.has(entry.id)) throw new Refusal('schema_identity');
      schemas.set(entry.id, value);
    } else inputs.set(entry.path, value);
  }
  return {root, manifest, raw, inputs, schemas, assertUnchanged() {
    for (const [relative, before] of raw) {
      const now = readInput(safePath(root, relative));
      if (!before.equals(now)) throw new Refusal('source_bytes_changed');
    }
  }};
}

export function checkReferences(schemas) {
  const forbidden = new Set(['$async', '$data', 'default', '$dynamicRef', '$dynamicAnchor', '$recursiveRef']);
  function walk(s, id) {
    if (!s || typeof s !== 'object') return;
    if (!Array.isArray(s)) {
      for (const key of Object.keys(s)) if (forbidden.has(key)) throw new Refusal('schema_feature_refused');
      if (s.$ref !== undefined) {
        if (typeof s.$ref !== 'string') throw new Refusal('unknown_reference');
        let ref = s.$ref;
        if (id === STATUS_ID && ref === 'result-v1.schema.json') ref = RESULT_ID;
        const [base, fragment] = ref.split('#');
        if ((base && !schemas.has(base)) || (!base && !schemas.has(id))) throw new Refusal('unknown_reference');
        if (fragment) {
          if (!fragment.startsWith('/')) throw new Refusal('unknown_reference');
          let target = schemas.get(base || id);
          for (const part of fragment.split('/').slice(1)) {
            const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
            if (!target || !Object.hasOwn(target, key)) throw new Refusal('unknown_reference');
            target = target[key];
          }
        }
      }
    }
    for (const child of Object.values(s)) walk(child, id);
  }
  for (const [id, s] of schemas) walk(s, id);
}

export function compileReviewed(loaded) {
  checkReferences(loaded.schemas);
  const normal = makeAjv(), inherited = makeAjv({inheritedTypes: true});
  for (const schema of loaded.schemas.values()) { normal.addSchema(schema); inherited.addSchema(schema); }
  const validators = new Map();
  for (const id of loaded.schemas.keys()) {
    const instance = TYPE_EXCEPTIONS.has(id) ? inherited : normal;
    const validator = instance.getSchema(id);
    if (!validator) throw new Refusal('unknown_schema');
    validators.set(id, validator);
  }
  return validators;
}

export function validateBytes(validators, id, bytes) {
  const validate = validators.get(id);
  if (!validate) return {status: 'error', code: 'unknown_schema'};
  const before = Buffer.from(bytes), digest = sha(bytes);
  let value;
  try { value = parseBytes(bytes); }
  catch (e) {
    if (!(e instanceof Refusal)) throw e;
    const status = e.code.startsWith('unsafe_') ? 'unsafe'
      : e.code.startsWith('unsupported_') ? 'unsupported' : 'error';
    return {status, code: e.code, sha256: digest};
  }
  const snapshot = structuredClone(value);
  const valid = validate(value);
  if (!bytes.equals(before) || !isDeepStrictEqual(value, snapshot)) throw new Refusal('validation_mutated_input');
  return {status: valid ? 'valid' : 'invalid', sha256: digest,
    diagnostics: valid ? [] : [...new Set((validate.errors ?? []).map(e => e.keyword))].slice(0, LIMITS.diagnostics)};
}
