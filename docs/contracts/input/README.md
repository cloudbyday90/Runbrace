# Input and normalization contracts

**Status:** Draft artifacts under 0014 (design reference omitted from this limited snapshot), refined by 0016 mapping (design reference omitted from this limited snapshot); no input adapter implemented.  
**Defined:** 2026-11-09. The mapping review revises unreleased fixtures to fixed messages and ID/status-only retention.

## Artifacts

| File | Meaning |
| --- | --- |
| [Intake receipt schema](intake-receipt-v1.schema.json) / [example](examples/intake-receipt.json) | Runbrace's inbound durable acceptance/current receipt state, separate from a consumer acknowledgment |
| [Condition draft schema](condition-draft-v1.schema.json) | Internal adapter output before publisher IDs/source context are assigned |
| [Normalization result schema](normalization-result-v1.schema.json) | Tagged emit/ignore/quarantine/retry_later result |
| [SAB history profile](sabnzbd-history-input-v1.schema.json) | Minimal bounded native shape; optional vendor additions are not implicitly forwarded |
| [Native example](examples/sabnzbd-history.native.json) | Synthetic input-shaped fixture; not a live capture |
| [Retained projection](examples/sabnzbd-history.retained.json) / [closed schema](../mapping/sabnzbd-history-retained-v1.schema.json) | Native ID/status only; other fields discarded |
| [Mapping manifest and 28 cases](../mapping/README.md) | Exact history enum rules, fixed messages, error/unknown/empty/batch expectations |
| [Trusted context](examples/sabnzbd-history.context.json) | Synthetic server/collector identities, timestamps, and versions; not caller authority |
| [Draft result](examples/sabnzbd-history.result.json) | One reported failure with unkeyed snapshot identity |
| [Published condition](examples/sabnzbd-history.expected.json) | Expected unchanged consumer-contract shape with publisher provenance |

## SAB history field map

The profile reads a supported history page shape documented by the [SAB API](https://sabnzbd.org/wiki/configuration/5.1/api). It consumes fields from `/history/slots/{index}`; omitted optional response fields in this synthetic fixture do not describe the complete vendor schema.

| Input/context | Draft/published field | Rule |
| --- | --- | --- |
| Authenticated registration | `source.instance_id`, generation, service | Publisher assigns from trusted context; native payload cannot override |
| Collector observation time | `observed_at` | Time of captured current-state read, not inferred failure start |
| First receipt time | `received_at` | Publisher assigns, unchanged across duplicate receipt/event reuse |
| Ledger event UUIDv7 | `event_id` | Publisher assigns/reuses through the occurrence contract |
| `nzo_id` | `entity.id` | Exact nonempty native string, never used alone as occurrence identity |
| Fixed profile kind | `entity.kind` | `download` |
| `status: Failed` | `condition.name/state/severity` | `download.failed` / `failing` / `error` |
| Fixed reviewed message for the exact mapping rule | `condition.message` | Failed uses `SABnzbd reported a failed download.`; native `fail_message` is discarded |
| Native status | `condition.native_state` | Preserve exact nonempty native string |
| Polling profile | Observation/identity metadata | Snapshot, unkeyed; publisher adds reserved provenance attributes |
| Native `fail_message`, job name/path/password/other fields | Not forwarded or retained by this profile | Discard unless another explicit versioned data contract requires them |

For this prototype, `Completed` maps to `download.completed` / informational / info. Exact history statuses `Queued`, `QuickCheck`, `Verifying`, `Repairing`, `Fetching`, `Extracting`, `Moving`, and `Running` map to `download.progress` / informational / info. Other valid bounded nonempty statuses map to `download.status` / unknown / unknown. Matching preserves case/whitespace; queue-only states are not borrowed. Missing/null/wrong-type/empty/invalid required values quarantine the entire receipt, with no partial batch output. Empty slots explicitly ignore with `mapping.empty_collection`, without asserting health or complete coverage. See the [manifest/cases](../mapping/README.md).

The native job can change or be retried; `source_event_id` is omitted and no occurrence key is synthesized from job ID, status, message, or update marker. Replaying a stored response reuses its receipt/item links; a new read is a new sample under the first profile. Coarser snapshot filtering remains a separate future source policy.

This native schema is the full normalization precondition. A bounded recognized envelope can be accepted durably before detailed item validation; a missing required item field then quarantines the receipt only if its registered safe evidence contract permitted admission. Admission still rejects unauthenticated, malformed, oversized, or unknown-format input. Generic producer schema violations are rejected before acceptance. The actual stage used by a native profile must remain explicit.

The native fixture's discarded message mentions unpacking; the fixed output message reports a failed download and the condition remains `download.failed`. Native stage text is not a verified structured event code, and completion does not prove successful Sonarr/Radarr import.

## Draft and publisher ownership

Condition drafts can contain entity/condition, observation kind/time, safe attributes, and identity hints under a trusted adapter contract. They cannot assign source registration, local event/receipt IDs, receive time, destination, commands, or permissions.

The draft schema rejects `runbrace.*` attributes. The publisher assigns `runbrace.observation_kind`, `runbrace.identity_kind`, and `runbrace.time_basis`; generic producer input also rejects this reserved namespace. Time basis distinguishes a source-reported timestamp, collector observation time, and unknown time. Unknown basis requires null observation time; other bases require a validated timestamp. Collector time is matched to trusted collection context, not caller metadata. The outbound condition schema permits the publisher's metadata; its later [identity revision](../identity/README.md) adds shared scoped entity definitions.

Unknown optional native properties may pass the bounded input-shape check but are discarded by projection; required identity/type violations do not. The retained fixture and closed schema permit only `nzo_id`/`status`; path/name/password/`fail_message` fields are removed. Fixed messages avoid a redactor dependency for this first proof; a future native-text mode needs a separate data policy and runtime tests.

## Unknown-input disposition

The [unknown-input contracts](../unknown-input/README.md) distinguish rejection, valid unknown conditions, ignored recognized input, replayable quarantine, diagnostic-only native opt-in, and bounded temporary retry. Safe minimum retention checks happen before acceptance. Invalid mapping cases describe post-admission expectations only when a registered safe retained representation exists; otherwise reject or use a registered diagnostic-only projector. Such a summary is not normalizer input and cannot later recover the missing body. The native source body is not a default quarantine archive.

## Receipt and errors

The proposed generic input route returns 202 after database commit, with `schema_version`, `receipt_id`, current receipt `status`, and `duplicate`. Its current state may already be processed/quarantined on a retry. This confirms durable intake, not event delivery or remediation. Native profiles can use a documented equivalent response.

Use generic Problem Details with stable safe reason codes/field pointers. Authentication/raw syntax/size failures are rejected before successful acceptance. A later normalization quarantine updates the durable receipt; it does not retroactively change the original HTTP response. See input research (design reference omitted from this limited snapshot).

## Validation boundary

Resolve schemas offline under Draft 2020-12 with actual format assertions and lossless input parsing. Schema checks do not execute redaction, mapping, authentication, publication, or polling. The input plan (design reference omitted from this limited snapshot) defines that later evidence. No operational payload, private path, token, source modification, or runtime dependency is introduced by these fixtures.

## Scoped identity refinement

Identity 0015 (design reference omitted from this limited snapshot) binds native/generic routes and credentials to explicit source generations and captures poll context before I/O. Generic `source` is `urn:uuid:<generation_id>`. Draft/output entities preserve required ordered native parents and reliable incarnation tokens through shared definitions; generic input retains leaf `native_id`, mapping losslessly to output `id`. Missing profile-required scope quarantines even when a generic optional field is schema-valid. The SAB example remains a source-root job snapshot without an invented incarnation or occurrence ID.

## Artifact review evidence

During the earlier 2026-11-09 input review, all ten input/event/transport schemas passed Draft 2020-12 schema checks with `jsonschema` 4.26.0, offline references, and timestamp format assertions. The native/retained/result/published/intake fixtures validated; trusted-context IDs/times, selected projection fields, unkeyed identity, and publisher provenance were checked statically. Twenty-seven invalid/missing/provenance-spoof variants were rejected. Unknown native status shape, explicit unknown-time draft, and ignore/quarantine/retry_later result shapes were accepted. Existing generic input and transport fixtures remained structurally valid. These are artifact checks, not a tested Rust mapper/redactor, signature verifier, database acknowledgment, or live collector.

The later joint identity contract review (design reference omitted from this limited snapshot) checks the shared definitions and revised generic source URI alongside these fixtures. Earlier input results remain historical artifact evidence, not proof that a runtime mapper preserves native parent/incarnation scope.

## Mapping binding and current evidence

Mapping 0016 (design reference omitted from this limited snapshot) pins `mapping_profile`, `mapping_version`, and a verified bundle digest before real durable admission. The synthetic context/output show profile/version provenance but omit a bundle digest: no compiled adapter/release bundle exists, so these fixtures are not complete production receipt bindings. A real publisher adds the verified digest, and no adapter/body may assign reserved mapping attributes.

Earlier input/identity counts above describe their earlier draft revisions. The mapping validation evidence (design reference omitted from this limited snapshot) records the current joint checks, including the closed projection and new expected message. No Rust mapping/projection, native service, or database behavior is validated.

