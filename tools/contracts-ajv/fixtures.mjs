/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */

import {Refusal, LIMITS} from './parse.mjs';
import {RESULT_ID, STATUS_ID} from './registry.mjs';

const id = name => `urn:runbrace:schema:${name}:1`;
export const REQUEST_ID = 'urn:runbrace:compatibility:fixture-request:1';
export function buildFixtures(loaded) {
  const cases = [], bases = new Map();
  const get = name => loaded.inputs.get(`docs/contracts/${name}`);
  function add(name, schema, value, expected = 'valid', source = undefined) {
    const raw = source ? loaded.raw.get(source) : Buffer.from(JSON.stringify(value));
    cases.push({name, schema, raw, expected});
    if (expected === 'valid' && !bases.has(schema)) bases.set(schema, structuredClone(value));
  }
  function example(name, schema, filename, select = value => value) {
    const value = get(filename);
    add(name, schema, select(value), 'valid', select === identity ? `docs/contracts/${filename}` : undefined);
  }
  const identity = value => value;
  const conditionId = id('condition');
  for (const file of ['events/examples/condition.json', 'identity/examples/scoped-condition.json',
    'input/examples/sabnzbd-history.expected.json', 'mapping/examples/generic-observation.expected.json'])
    example(`source:${file}`, conditionId, file, identity);
  for (const file of ['events/examples/failing.json', 'events/examples/healthy.json']) {
    example(`source:${file}`, id('observation-envelope'), file, identity);
    example(`data:${file}`, id('observation-data'), file, value => value.data);
  }
  const scoped = get('identity/examples/scoped-condition.json');
  add('identity:descriptor', id('identity'), {instance_id: scoped.source.instance_id,
    generation_id: scoped.source.generation_id, entity: scoped.entity});
  for (const file of ['input/examples/sabnzbd-history.result.json', 'mapping/examples/generic-observation.result.json']) {
    example(`source:${file}`, id('normalization-result'), file, identity);
    example(`draft:${file}`, id('condition-draft'), file, value => value.conditions[0]);
  }
  const mappings = [
    ['intake-receipt', 'input/examples/intake-receipt.json'],
    ['sabnzbd-history-input', 'input/examples/sabnzbd-history.native.json'],
    ['sabnzbd-history-retained', 'input/examples/sabnzbd-history.retained.json'],
    ['status-table-profile', 'mapping/examples/sabnzbd-history.profile.json'],
    ['matching-rule-set', 'matching/examples/rules.json'],
    ['matching-decision', 'matching/examples/decision-matched.json'],
    ['matching-decision', 'matching/examples/decision-unrouted.json'],
    ['memory-sizing-profile', 'resources/examples/core-2g.json'],
    ['memory-sizing-profile', 'resources/examples/core-4g.json'],
    ['dagu-run-response', 'transport/examples/dagu-run-response.json'],
    ['dagu-webhook-request', 'transport/examples/dagu-webhook-request.json'],
    ['http-receipt', 'transport/examples/receipt.json'],
    ['input-problem', 'unknown-input/examples/problem-unsupported-schema.json'],
  ];
  for (const [schema, file] of mappings) example(`source:${file}`, id(schema), file, identity);
  for (const file of ['unknown-input/examples/quarantine-replayable.json', 'unknown-input/examples/quarantine-diagnostic-only.json'])
    example(`detail:${file}`, id('quarantine-detail'), file, value => value.quarantine_detail);
  const requestPath = 'compatibility-runtime/contracts/example-request.json';
  add('source:compatibility-request', REQUEST_ID, loaded.inputs.get(requestPath), 'valid', requestPath);
  add('generated:result', RESULT_ID, {version: 1, synthetic: true, records: 10, sum: 55});
  add('generated:status', STATUS_ID, {version: 1, request_id: scoped.source.instance_id,
    state: 'accepted', reason: 'awaiting_explicit_run', attempt_id: null, result: null});

  function mutate(name, schema, update, expected = 'invalid') {
    const value = structuredClone(bases.get(schema)); update(value); add(name, schema, value, expected);
  }
  // Every authoritative schema gets a positive and several structurally negative cases.
  for (const [schema, source] of loaded.schemas) {
    if (!bases.has(schema)) throw new Refusal('missing_schema_fixture');
    for (const [label, value] of [['null', null], ['array', []], ['empty', {}], ['boolean', true]])
      add(`negative:${schema}:${label}`, schema, value, 'invalid');
    for (const key of source.required ?? [])
      mutate(`missing:${schema}:${key}`, schema, value => { delete value[key]; });
    if (source.additionalProperties === false)
      mutate(`extra:${schema}`, schema, value => { value.synthetic_extra = 'synthetic'; });
  }
  for (const [name, update, expected] of [
    ['unknown-state', x => { x.condition.state = 'unexpected'; }, 'invalid'],
    ['explicit-unknown', x => { x.condition.state = 'unknown'; x.observed_at = null; }, 'valid'],
    ['uuid-v4-owned', x => { x.event_id = '550e8400-e29b-41d4-a716-446655440000'; }, 'invalid'],
    ['uuid-wrong-variant', x => { x.event_id = '019a6670-0000-7000-7000-000000000101'; }, 'invalid'],
    ['uuid-uppercase', x => { x.event_id = '019A6670-0000-7000-8000-000000000101'; }, 'invalid'],
    ['invalid-calendar', x => { x.received_at = '2026-02-30T12:00:00Z'; }, 'invalid'],
    ['missing-zone', x => { x.received_at = '2026-11-09T12:00:00'; }, 'invalid'],
    ['offset-outside-profile', x => { x.received_at = '2026-11-09T12:00:00+00:00'; }, 'invalid'],
    ['fractional-time-six', x => { x.received_at = '2026-11-09T12:00:00.123456Z'; }, 'valid'],
    ['fractional-time-seven', x => { x.received_at = '2026-11-09T12:00:00.1234567Z'; }, 'invalid'],
    ['leap-second-format-edge', x => { x.received_at = '2016-12-31T23:59:60Z'; }, 'valid'],
    ['numeric-identity', x => { x.entity.id = 42; }, 'invalid'],
    ['leading-zero-string', x => { x.entity.id = '00042'; }, 'valid'],
    ['unicode-decomposed', x => { x.entity.id = 'e\u0301'; }, 'valid'],
    ['unicode-composed', x => { x.entity.id = '\u00e9'; }, 'valid'],
    ['unicode-astral', x => { x.entity.id = '\ud83d\ude80'; }, 'valid'],
    ['unicode-256-points', x => { x.entity.id = '\ud83d\ude80'.repeat(256); }, 'valid'],
    ['unicode-257-points', x => { x.entity.id = '\ud83d\ude80'.repeat(257); }, 'invalid'],
    ['id-control', x => { x.entity.id = 'a\n'; }, 'invalid'],
    ['parents-type', x => { x.entity.parents = {}; }, 'invalid'],
    ['parents-empty', x => { x.entity.parents = []; }, 'invalid'],
    ['parents-item', x => { x.entity.parents = [{kind: 'download'}]; }, 'invalid'],
    ['parents-nine', x => { x.entity.parents = Array(9).fill({kind: 'download', id: 'parent'}); }, 'invalid'],
  ]) mutate(`condition:${name}`, conditionId, update, expected);
  mutate('request:string-integer-no-coercion', REQUEST_ID, x => { x.arguments.records = '10'; });
  mutate('request:boolean-integer', REQUEST_ID, x => { x.arguments.records = true; });
  mutate('request:missing-nested-no-default', REQUEST_ID, x => { delete x.arguments.mode; });
  mutate('request:extra-nested-no-removal', REQUEST_ID, x => { x.arguments.command = 'synthetic'; });
  mutate('request:unknown-operation', REQUEST_ID, x => { x.operation = 'synthetic.unknown'; });
  mutate('request:minimum', REQUEST_ID, x => { x.arguments.records = 1; }, 'valid');
  mutate('request:maximum', REQUEST_ID, x => { x.arguments.records = 1000000; }, 'valid');
  mutate('request:above-maximum', REQUEST_ID, x => { x.arguments.records = 1000001; });
  mutate('status:generic-uuid-v4', STATUS_ID, x => { x.request_id = '550e8400-e29b-41d4-a716-446655440000'; }, 'valid');
  mutate('status:bad-uuid', STATUS_ID, x => { x.request_id = 'synthetic-invalid'; });
  mutate('status:unknown-state', STATUS_ID, x => { x.state = 'unknown-state'; });
  mutate('status:nested-result', STATUS_ID, x => { x.result = {version: 1, synthetic: true, records: 10, sum: 55}; }, 'valid');
  mutate('status:bad-nested-result', STATUS_ID, x => { x.result = {version: 1}; });
  mutate('transport:boolean-no-coercion', id('http-receipt'), x => { x.duplicate = 'false'; });
  mutate('transport:accepted-is-not-complete', id('http-receipt'), x => { x.status = 'completed'; });
  mutate('transport:native-additional-vendor-field', id('dagu-run-response'), x => { x.vendor_field = 'synthetic'; }, 'valid');
  mutate('input:unknown-native-state', id('sabnzbd-history-input'), x => { x.history.slots[0].status = 'FutureNativeState'; }, 'valid');
  mutate('input:array-item-type', id('sabnzbd-history-input'), x => { x.history.slots = [42]; });
  mutate('mapping:unknown-condition-type', id('status-table-profile'), x => { x.unknown = []; });
  mutate('mapping:unknown-must-be-unknown', id('status-table-profile'), x => { x.unknown.state = 'healthy'; });
  mutate('matching:matched-needs-rules', id('matching-decision'), x => { x.matched_rule_ids = []; });
  mutate('matching:rules-condition-name-type', id('matching-rule-set'), x => { x.rules[0].condition_names = [42]; });
  for (const outcome of ['ignore', 'quarantine', 'retry_later'])
    add(`normalization:${outcome}`, id('normalization-result'), {outcome, reason_code: 'synthetic.reason'});

  // Raw lexical cases exercise the parser before Number conversion.
  const lexical = [
    ['duplicate', '{"version":1,"version":1}', 'unsafe'],
    ['escaped-duplicate', '{"a":1,"\\u0061":2}', 'unsafe'],
    ['nested-duplicate', '{"a":{"x":1,"x":2}}', 'unsafe'],
    ['unsafe-integer', '{"a":9007199254740993}', 'unsafe'],
    ['unsafe-negative-integer', '{"a":-9007199254740992}', 'unsafe'],
    ['negative-zero', '{"a":-0}', 'unsafe'],
    ['exponent-overflow', '{"a":1e400}', 'unsupported'],
    ['exponent-underflow', '{"a":1e-4000}', 'unsupported'],
    ['exact-exponent', '{"a":1e0}', 'unsupported'],
    ['decimal-integer', '{"a":1.0}', 'unsupported'],
    ['decimal-rounding', '{"a":0.10000000000000001}', 'unsupported'],
    ['lone-surrogate', '{"a":"\\ud800"}', 'unsafe'],
    ['leading-zero', '{"a":01}', 'error'],
    ['nan', '{"a":NaN}', 'error'],
    ['trailing-comma', '{"a":1,}', 'error'],
  ];
  for (const [name, text, expected] of lexical) cases.push({name: `parser:${name}`, schema: REQUEST_ID, raw: Buffer.from(text), expected});
  const escaped = structuredClone(bases.get(conditionId)); escaped.entity.id = 'a';
  cases.push({name: 'condition:escaped-identity', schema: conditionId,
    raw: Buffer.from(JSON.stringify(escaped).replace('"id":"a"', '"id":"\\u0061"')), expected: 'valid'});
  if (cases.length > LIMITS.fixtures || new Set(cases.map(c => c.name)).size !== cases.length)
    throw new Refusal('fixture_count_or_identity');
  return cases;
}
