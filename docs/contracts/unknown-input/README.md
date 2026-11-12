# Draft unknown-input contracts

**Status:** Proposed under 0017 (design reference omitted from this limited snapshot); no implemented HTTP endpoint, projector, or review interface.  
**Updated:** 2026-11-09.

| Artifact | Purpose |
| --- | --- |
| [Problem writer schema](problem-v1.schema.json) / [example](examples/problem-unsupported-schema.json) | Restricted Runbrace Problem Details output for preacceptance failure |
| [Quarantine detail schema](quarantine-detail-v1.schema.json) | Bounded journal details and a reusable closed diagnostic projection definition |
| [Diagnostic-only example](examples/quarantine-diagnostic-only.json) | A quarantined receipt whose source body was deliberately not retained |
| [Replayable example](examples/quarantine-replayable.json) | Valid retained SAB evidence parked after a preparation/artifact failure |
| [Disposition cases](examples/disposition-cases.json) | Synthetic classification/HTTP/durability/review expectations; not parser output |
| Unknown-input architecture (design reference omitted from this limited snapshot) | Admission matrix, evidence limits, duplicate comparison, capacity, retention, and recovery |
| Validation plan (design reference omitted from this limited snapshot) | Planned runtime checks, distinct from artifact evidence |

## Problem Details writer

Use `application/problem+json` and a real matching HTTP status. The schema constrains Runbrace's own output to `about:blank`, its status title, a stable safe `code`, optional fixed `detail`, and optional approved static `field_pointer`. It is not a universal schema for every RFC 9457 implementation. No receipt ID is invented for an unaccepted request; no secret input, dynamic field name, exception, or guessed type/identity is echoed.

The schema's closed writer shape prevents accidental extra data from our serializer. General Problem Details consumers still ignore unknown extensions under [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html#section-3.2). Applications must check HTTP status/body agreement, code/status semantics, and safe message/pointer provenance; structural validation alone cannot establish those facts.

## Quarantine journal and evidence

`input.quarantined` stores a schema-valid detail object atomically with terminal receipt state, `last_error_code`, `finished_at`, and claim/due-time removal. The existing journal's typed receipt subject supplies identity; source/binding/actor/time remain trusted context. Reason/stage are finite v1 vocabularies, and `automatic_retry` is always false. A retryable preparation failure is not yet quarantine; exhaustion or an immediate deterministic failure enters this contract.

`input_evidence_kind` is `replayable` or `diagnostic_only`. Diagnostic-only requires source evidence or review-only disposition and cannot carry a pretend mapping recovery requirement. The reusable `$defs/diagnostic_projection` is a closed server-generated summary with no native body/values. A configured projector and full applicable comparison profile are still required before admission; the schema does not make arbitrary bodies safe.

The examples are synthetic inspection compositions, not a new API view schema. Validate their nested intake receipt, quarantine detail, and approved input separately. They omit a real bundle digest because no compiled release bundle exists. Their event/delivery/indexing counts are zero. Both currently prohibit reprocessing: diagnostic-only lacks source evidence, and the replayable example still needs artifact recovery plus review. Availability and permission must be checked live rather than inferred from an example boolean.

The disposition cases contain reviewed preconditions and expected results. They distinguish missing safety prerequisites, known native extensions, valid unknown enum values, unsupported generic schemas, quarantine, transient retry, and capacity/conflict failures. Case facts are authored test context, never caller authority. No generic handler is implemented by this file.

## Compatibility and limits

This refines unreleased input/ledger proposals with an evidence-kind column, explicit native diagnostic-only opt-in, and structured quarantine journal data. Existing result/receipt/condition vocabularies and the nine core tables remain. Generic unknown values permitted by their schema continue normal mapping; unsupported generic versions/shapes still reject. Quarantine is not a new consumer condition type.

Bind all schemas through the offline allowlisted registry under Draft 2020-12. Enforce byte/string/depth/count limits separately, preserve native duplicate namespaces and old comparison profiles, and never claim a discarded/expired body can be remapped. Artifact results belong in the validation evidence (design reference omitted from this limited snapshot).

