# Draft condition JSON contracts

**Status:** Condition-forwarding scope accepted under 0010 (design reference omitted from this limited snapshot); JSON schemas remain proposed.  
**Updated:** 2026-11-09. No runtime implements these contracts.

## Consumer output

Dagu, n8n, or another consumer should receive a plain `application/json` condition document. The consumer owns what happens next.

| File | Role |
| --- | --- |
| [Condition schema](condition-v1.schema.json) | Proposed outbound format usable by any workflow |
| [Condition example](examples/condition.json) | Synthetic SAB-style condition; mapping is illustrative, not installed-version support |

Fields identify schema version, stable event ID, source instance/generation/service, native entity, mapped condition, source/receipt times, and approved attributes. Native status/code remain evidence. The event contains no chosen repair, command, permission, approval, or claim of remediation success.

`event_id` is a Runbrace UUIDv7 and remains unchanged across delivery retries. Destination delivery IDs are separate ledger records and transport metadata; they are stable across retries, while attempt IDs change. A repeated native occurrence can link another receipt to the same event under the duplicate contract (design reference omitted from this limited snapshot). `entity.id` and optional `source_event_id` are opaque native strings. The [shared identity schema](../identity/README.md) adds ordered native `entity.parents` and reliable `entity.incarnation` when required by the registered profile; a bare leaf ID can be ambiguous. `observed_at` can be null when unknown; Runbrace supplies `received_at` itself. A later source report gets a new event ID, even if it describes the same entity.

The condition name/state/severity mapping is defined by the source adapter. Unknown native statuses use `unknown` with native context or quarantine; Runbrace does not infer incident thresholds or clearance. A receiving workflow can branch directly on `condition.name`, `state`, and `source.service`.

The [HTTP wire profiles](../transport/README.md) send this condition directly for generic/n8n receivers or under a native Dagu `payload` wrapper. Generic acceptance receipts and native run references have separate schemas; these are transport responses, not condition-state changes.

The [input profile/draft contracts](../input/README.md) keep source data separate from publisher-owned provenance. Generic producer `attributes` reject the reserved `runbrace.*` namespace; native optional fields are only retained/forwarded through an explicit profile projection. This tightens a still-unreleased draft, not an already published compatibility promise.

## Matching boundary

Matching 0018 (design reference omitted from this limited snapshot) uses exact trusted source/name/state scopes and a small typed selector list, with no condition mutation. Source message/attributes/native IDs alone cannot choose a destination. Rule overlap yields one handoff per destination. Matching decisions remain private ledger data, outside this consumer document. This unreleased revision additionally rejects controls/final-newline condition names and reuses that name definition for generic input.

## Unknown input boundary

The [unknown-input contract](../unknown-input/README.md) keeps a valid mapped `unknown` condition separate from an unsupported/rejected request or quarantined receipt. Quarantine creates no condition document for a receiving workflow. Recognized tests/empty input use explicit ignore reasons; unknown formats do not imply healthy state or a generic forwarding fallback.

## Mapping provenance

Mapping 0016 (design reference omitted from this limited snapshot) pins exact input/adapter/projection/enum artifacts before intake. Real publishers must add `runbrace.mapping_profile`, `runbrace.mapping_version`, and the verified bundle digest; these remain publisher-owned attributes. Native state is preserved independently of mapped names/state/severity. Generic input now allows `unknown` severity to match output and at most 23 source attributes, reserving nine of the output's 32 entries for attributed publisher fields. The [generic field map](../mapping/README.md) preserves source coverage claims separately from Runbrace coverage. Existing synthetic event/transport examples omit release digests because no bundle exists; they are not complete production receipt bindings.

## Optional generic producer input

The earlier CloudEvents profile is retained as one input option. Native webhooks keep their vendor JSON; consumers are not required to receive CloudEvents.

| File | Role |
| --- | --- |
| [Envelope schema](observation-v1.schema.json) | Draft structured CloudEvents generic input |
| [Data schema](observation-data-v1.schema.json) | Draft producer observation data |
| [Failing input](examples/failing.json) / [healthy input](examples/healthy.json) | Synthetic producer samples |

In that profile, `source` is exactly `urn:uuid:<authenticated_registered_generation_id>`; it must match the explicit generation route/credential binding and its instance FK. This replaces the earlier custom source URI in an unreleased draft. Producer `source` + `id` is occurrence identity, distinct from the local normalized event ID. `coverage.complete` and healthy/failing state are source assertions to preserve; they do not trigger a Runbrace issue lifecycle. Generic-input correlation references from the earlier draft are optional historical linkage hints, not command authority.

See the [CloudEvents specification](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) and [JSON format](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md).

## Formatting and validation

Use UTF-8 JSON, explicit types, string native IDs, UTC RFC 3339 timestamps, bounded strings/context, and a schema version. Reject duplicate members, malformed JSON, nonfinite numbers, unsupported schema versions, and unknown fields in these closed draft profiles.

Use JSON Schema Draft 2020-12 with release-bundled schemas and an offline allowlisted registry. Enable timestamp format checking with the required validator dependencies; shape regexes alone do not reject impossible dates. Schema checks do not authenticate a source, authorize a recipient, or prove delivery. See [JSON Schema validation](https://json-schema.org/draft/2020-12/json-schema-validation).

Input and output profiles differ intentionally: the generic input omits absent fields, while consumer output permits explicit null for an unknown observation time. A future contract change needs an explicit compatible version and receiving-workflow migration.

Enforce byte/depth/rate limits independently of schema field lengths. Context keys and values must be allowlisted/redacted per adapter/recipient. Do not embed whole native responses or executable content into attributes.

## Review evidence and next work

During the earlier 2026-11-09 review, the three event schemas passed Draft 2020-12 schema checks and all three examples validated with `jsonschema` 4.26.0, an offline schema registry, and timestamp format checking. The outbound contract additionally accepted explicit unknown observation time/state and rejected 24 invalid/missing-field variants. The earlier input review rejected nineteen invalid input variants. These are draft-artifact checks, not runtime integration evidence.

Agree the smallest fields required by one real consumer, then demonstrate a native fixture -> common JSON -> recording-only receiver handoff. No Python runtime dependency is proposed.

See ingestion (design reference omitted from this limited snapshot), forwarding (design reference omitted from this limited snapshot), and handoff contracts (design reference omitted from this limited snapshot).

The subsequent [identity revision](../identity/README.md) reuses shared ID/source/entity definitions and adds a scoped condition fixture. Joint schema/example/mutation results are recorded in the identity validation evidence (design reference omitted from this limited snapshot); runtime source identity/authentication remains unvalidated.

