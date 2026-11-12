# Draft mapping contracts

**Status:** Proposed under 0016 (design reference omitted from this limited snapshot); documentation/fixtures only.  
**Updated:** 2026-11-09.

| Artifact | Purpose |
| --- | --- |
| [Status-table review schema](status-table-profile-v1.schema.json) | Bounded review manifest for a simple unkeyed collector-observed snapshot family |
| [SAB profile](examples/sabnzbd-history.profile.json) | Exact history status rules, native selectors, retained fields, fixed messages, and versions |
| [Closed retained schema](sabnzbd-history-retained-v1.schema.json) | Only approved job ID/status fields; distinct from the more permissive native shape |
| [Conformance cases](examples/sabnzbd-history.cases.json) | Synthetic native input and complete expected draft/result, including invalid and empty batches |
| [Generic draft](examples/generic-observation.result.json) / [published output](examples/generic-observation.expected.json) | Explicit generic field-map example from the existing failing observation |
| [Existing input fixture chain](../input/README.md) | Native -> minimal retained projection -> trusted context -> draft -> publisher output |
| Mapping research (design reference omitted from this limited snapshot) | Field semantics, determinism, bundles, upgrades, errors, and generic input |
| Validation plan (design reference omitted from this limited snapshot) | Planned Rust/database/consumer exercises and separate artifact evidence |

## Manifest scope and activation

The manifest documents one simple status-table family; it does not install a mapper or define a general expression engine. Its pointers address a retained-document array and exact item-relative native fields. Static rules own only condition name/state/severity/message; the adapter copies exact native state, native resource ID, fixed entity kind, unkeyed identity policy, stored item slot, and trusted collector time into the existing draft contract.

Validate the manifest with Draft 2020-12 and offline local schemas. Semantic activation checks additionally require unique rule IDs, non-overlapping exact native values, valid pointer resolution/types against fixtures, approved retained-field selection, service/input/projection bindings, stable slots, and output schema compatibility. JSON Schema `uniqueItems` alone does not enforce uniqueness across values nested in different rules. No status/field defaults arise from schema annotations.

The immutable mapping bundle includes exact adapter/schema/projection/profile/fixture artifacts. Capture its profile/version and 32-byte digest on the receipt before acknowledgment; retain the winning binding on the event. Public publisher attributes are `runbrace.mapping_profile`, `runbrace.mapping_version`, and `runbrace.mapping_bundle_sha256` (64 lowercase hexadecimal characters). These strings are references/evidence, not authentication or duplicate keys. No bundle digest is shown in the examples until a real release bundle exists.

## Concrete SAB semantics

The profile uses source-root `download` resources keyed by exact `nzo_id`, subject to deployed identity/reuse validation. It maps `Failed`, `Completed`, and the eight listed history processing states. Valid unfamiliar statuses emit unknown with their exact native string; missing/null/empty/wrong-type required values quarantine. All items are validated before any result is emitted. Empty `/history/slots` yields `ignore` with `mapping.empty_collection`; it does not assert health or complete collection coverage.

Fixed reviewed messages replace forwarding `fail_message` for this first proof. The native fixture still includes that field to demonstrate discard. The retained schema rejects it and all extra fields; the normalizer requires only `nzo_id` and `status`. This revises an unreleased draft, rather than claiming compatibility with a deployed profile. A future free-text policy requires a new projection/mapping revision.

Cases share the synthetic [trusted context](../input/examples/sabnzbd-history.context.json). Expected results use the existing [normalization result schema](../input/normalization-result-v1.schema.json); emit drafts have no source/local IDs, destination, current clock, or reserved attributes. Missing/null/type failures are separate cases. Array order and receipt-local position are stable for replay of the captured response; a new read remains a new unkeyed sample.

## Generic observation field map

The existing [failing generic input](../events/examples/failing.json) maps through `generic.observation` revision `2026-11-09.1`. Its registration must authenticate the generation UUID URN and guarantee producer occurrence IDs stay stable across retry. The synthetic publisher example assigns registered service `custom`, source instance/generation, a new event ID, and first receipt time; those fields are not supplied by the observation body. As with SAB, no real release-bundle digest exists in this fixture.

| Input/context | Draft/publisher rule |
| --- | --- |
| Envelope `id` | Exact reliable occurrence key and `source_event_id`; stable scope `generic.observation`, slot `reported_condition` |
| `data.entity.kind/native_id` | Copy kind; map native leaf ID to `entity.id` without conversion |
| `data.entity.parents/incarnation` | Preserve exact approved scoped components when present; required native profile scope still applies |
| `data.entity.label` | Discard from the first output profile; display evidence does not identify a resource |
| `data.signal` | Copy its validated name/state/severity/message and optional native fields; source text must already satisfy the registered data policy |
| `data.kind/observed_at` | Draft observation kind and source-reported observation time; publisher adds attributed basis/kind |
| Optional envelope `time` | Preserve separately as `runbrace.source_event_time`; it need not equal the observation time |
| `data.coverage` | Publisher copies source claims to `runbrace.source_coverage_scope` and string `runbrace.source_coverage_complete`; these are not Runbrace completeness/incident decisions |
| `data.attributes` | Copy only approved nonreserved attributes; maximum 23 |
| Envelope `subject`, data correlation hint | Not forwarded by this first profile; no lookup/permission is derived from them |
| Trusted release/registration | Publisher adds source/local IDs, first receipt time, and mapping profile/version/verified digest |

Generic input and draft attributes now allow at most 23 source entries, reserving nine of the output's 32 slots for three observation/identity/time fields, three mapping fields, two source-coverage claims, and optional source event time. Bounds are validated before publication; do not silently drop approved attributes to fit. Producer `runbrace.*` remains rejected. This tightens an unreleased draft; it is not a published compatibility promise.

## Review limits

These artifacts do not execute mapping, projection, redaction, admission, hashing, publication, or delivery. Invalid native cases deliberately fail the native precondition and carry a quarantine expectation for the declared asynchronous item-validation stage. The review can check schema shape, complete expected outputs, table/case consistency, and provenance ownership. It cannot prove a future Rust adapter matches those outputs or a deployed vendor supports the profile. Record those results separately in the validation plan (design reference omitted from this limited snapshot).

Unknown-input 0017 (design reference omitted from this limited snapshot) adds a prior evidence/admission gate: the invalid native cases remain post-admission mapping expectations, and are not proof that arbitrary invalid values can be retained or acknowledged. Only approved replayable representations can reach mapping. Diagnostic-only/expired input is terminal for same-receipt release; valid unfamiliar statuses still follow the normal unknown rule.

The later [matching contract](../matching/README.md) provides the post-mapping selector boundary and requires semantic recipient-set review for mapping changes. The shared condition-name definition now rejects control/final-newline values in both output and generic input; this tightens an unreleased draft, without changing valid existing examples.

