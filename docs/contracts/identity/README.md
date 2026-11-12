# Draft identity contracts

**Status:** Proposed under 0015 (design reference omitted from this limited snapshot); no runtime implementation.  
**Updated:** 2026-11-09.

| Artifact | Purpose |
| --- | --- |
| [Shared identity schema](identity-v1.schema.json) | Owned UUIDv7, opaque native ID, source, native component, entity, and resource definitions |
| [Resource comparisons](examples/resource-comparisons.json) | Synthetic equal/distinct descriptors with explicit expected comparisons |
| [Scoped condition](examples/scoped-condition.json) | Synthetic Dagu-style run with a native DAG parent; no installed-version support claim |
| Identity architecture (design reference omitted from this limited snapshot) | Enrollment, reset, reuse, generation-bound ingress, destinations, actors, restore |
| Validation plan (design reference omitted from this limited snapshot) | Planned runtime exercises separately from artifact checks |

## Shared definitions

The root schema validates `{instance_id, generation_id, entity}` for comparison fixtures. It is a resource descriptor, not a new API envelope or entity table. Existing [condition](../events/condition-v1.schema.json), [generic input](../events/observation-data-v1.schema.json), [draft](../input/condition-draft-v1.schema.json), and receipt schemas reuse `$defs` through the offline registry. Bundle all schemas locally; these symbolic registry identifiers do not authorize network schema downloads.

`owned_id` accepts exactly 36 characters in canonical lowercase hyphenated UUIDv7 form with the RFC variant; generation UUID URNs are exactly 45 characters. Length/control checks prevent final-newline acceptance through regex end-anchor behavior. It does not prove row existence, correct object type, parent membership, authentication, or permission. PostgreSQL IDs still need version/variant checks, FKs, and scoped application validation.

`opaque_id` preserves a native string of 1–256 Unicode code points, rejecting C0 controls and DEL. Invalid Unicode is rejected by the parser. UTF-8 byte bounds are additional. Case, leading zeros, whitespace, and Unicode normalization remain significant. A native UUID-looking value may be v4 or another source-defined format. `kind` is a registered lowercase ASCII label.

Outbound `entity` retains required `kind`/`id` and adds optional `incarnation` and `parents`. Parents are 1–8 components ordered outermost first; each requires `kind`/`id` and may carry its own incarnation. Absence of parents represents a source-root resource only where the registered profile permits it. Omit unknown optional fields rather than inventing a token or empty array. Profiles requiring missing scope reject/quarantine even when the generic schema accepts the object.

Generic producer input keeps `entity.native_id` for its leaf and maps it losslessly to outbound `entity.id`; parents use the shared component shape with `id`. Input label is display evidence only. Incarnation and parent requirements are identical on both paths. No native field assigns publisher-owned source/event IDs.

## Equality and occurrence keys

Resource equality compares source instance/generation, ordered parents and their optional incarnations, leaf kind/ID, and optional leaf incarnation exactly. Object property order is irrelevant; missing incarnation differs from a present token. Labels, URLs, messages, state, time, and embedding vectors are outside the key. Equal descriptors only identify a resource under a validated native profile; they do not prove the same reported occurrence or safe remediation.

The comparison fixture makes native `42` versus `042`, case, Unicode, parent order, generation rollover, ID reuse, and delimiter ambiguity explicit. Notes describe label changes outside the descriptor. These are synthetic expectations, not observations of any vendor's ID allocation.

Reliable occurrence keys separately include all profile-required scope/event/revision/slot components. Use a pinned canonical JSON tuple rather than ambiguous delimiter concatenation. Keep existing bounded key/condition-slot columns and the duplicate constraints (design reference omitted from this limited snapshot); no hash or generated UUID replaces source evidence.

Mapping 0016 (design reference omitted from this limited snapshot) preserves these exact native descriptors while pinning transformations and context separately. A mapping revision cannot manufacture an incarnation, redefine an occurrence scope, or remap a published duplicate winner. Its [updated SAB projection/cases](../mapping/README.md) revise the earlier unreleased fixture chain to fixed messages and ID/status-only retention.

## Compatibility and checking

This revision changes still-unreleased drafts: optional scoped entity fields, shared ID validation, and generic CloudEvents `source` from the earlier custom source string to `urn:uuid:<registered_generation_id>`. The new generation-bound routes are proposals. No deployed v1 compatibility is claimed. A published contract would require an explicit compatibility/version rollout.

Validate all schemas with Draft 2020-12, offline references, and timestamp format assertions; validate resource pairs, scoped output, and the existing input/output/transport fixtures together. The 2026-11-09 review checked all 11 schemas, 12 complete fixture documents, 15 resource pairs, 13 positive variants, and 43 rejected variants. Runtime checks must additionally compare route/auth/source context, required parent/incarnation scope, and trusted publication fields. Detailed artifact results and 24 Not run runtime scenarios are recorded in the validation plan (design reference omitted from this limited snapshot).

