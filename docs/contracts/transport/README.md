# Proposed HTTP transport contracts

**Status:** Draft profiles/fixtures from transport research (design reference omitted from this limited snapshot); no server or destination implements them here.  
**Defined:** 2026-11-09.

## Profiles

| Profile | Request | Expected acknowledgment |
| --- | --- | --- |
| `http_json_v1` | Existing [condition JSON](../events/condition-v1.schema.json), one event per POST | `generic_receipt_v1` preferred; explicit `status_only_v1` compatibility is weaker |
| `dagu_webhook_v1` | [Native wrapper schema](dagu-webhook-request-v1.schema.json) and [fixture](examples/dagu-webhook-request.json) | [Run-reference schema](dagu-run-response-v1.schema.json), [fixture](examples/dagu-run-response.json), and exact configured run/DAG match |
| `dagu_start_v1` | Native JSON with configured string-encoded parameter map and stable run ID | The installed async-start API's captured run-reference contract |

The common condition is unchanged. In the Dagu wrapper, `payload` is that exact document, and `dagRunId` is `runbrace-<delivery UUIDv7>`. These are fictional inputs for a configured recording-only DAG. Native endpoint/schema/auth behavior must be checked against the installed version; see [Dagu webhook docs](https://docs.dagu.sh/server-admin/authentication/webhooks).

## Generic request

The proposed configured HTTPS endpoint receives the literal frozen condition bytes with:

```text
Content-Type: application/json
Accept: application/json
X-Runbrace-Event-Id: 019a6670-0000-7000-8000-000000000020
X-Runbrace-Delivery-Id: 019a6670-0000-7000-8000-000000000040
X-Runbrace-Not-After: 2026-11-10T14:00:01Z
```

Authentication is supplied from the captured runtime credential profile, never copied into this fixture. The IDs/deadline are frozen per delivery. These application headers have meaning only when the receiving contract actually verifies them. Do not interpret them as standardized idempotency or automatic native n8n/Dagu deadline enforcement.

## Generic receipt

[receipt-v1.schema.json](receipt-v1.schema.json) and [receipt.json](examples/receipt.json) define the preferred bounded JSON acknowledgment. The permitted 200/201/202 status, JSON media type, and exact event/delivery ID match are checked together. `receipt_id` is an opaque external string, not a Runbrace-owned primary key. A duplicate reply must refer to the original accepted key/body and receipt under its receiver contract.

The receipt's `status: accepted` is a receiver claim. It is **not** workflow completion or proof of transactional enqueue; capability must be established separately. A `duplicate` field alone does not raise that capability.

An empty/default/HTML/mismatched 2xx response fails this profile and leaves a possibly-sent delivery unknown. Do not silently fall back to status-only. In the explicit compatibility profile, store `acceptance_basis: status_only` and keep the receiver unverified. Native acknowledgment bodies are parsed by their own binding, not forced into this generic schema.

## Validation boundary

Use Draft 2020-12 and offline allowlisted schema resolution. Validate the embedded Dagu `payload` using the existing condition schema. Structural checks alone cannot establish identity match against the request, HTTPS authentication, receipt durability, native run conflict meaning, admission deadlines, or retry safety; those require application checks and receiver exercises.

The transport validation plan (design reference omitted from this limited snapshot) covers those boundaries. Signature profiles remain separate explicit contracts; request digests cover frozen bytes, and message signatures must include any metadata relied upon for admission/idempotency. No real credentials, URLs, native keys, or live runs appear in these examples.

## Artifact review evidence

On 2026-11-09, all six event/transport schemas passed Draft 2020-12 schema checks using `jsonschema` 4.26.0 with an offline registry and timestamp format checking. All three new wire fixtures validated; 25 invalid/missing-field transport variants were rejected, and the native response profile accepted an additional vendor field. Static checks matched condition/receipt IDs, Dagu wrapper/run references, and the ledger examples' acceptance basis versus still-unverified capability. These checks do not exercise HTTP, TLS, native workflows, signatures, receiver durability, or retry safety. No runtime dependency was added to the repository.

The [identity refinement](../identity/README.md) shares owned/native ID definitions with these schemas and adds optional native parent/incarnation scope inside conditions. It does not change transport metadata, native Dagu run-ID derivation, acceptance matching, or receiver capability. Destination/reset/restore behavior follows identity lifecycle (design reference omitted from this limited snapshot).

## Separate database binding

Optional [SQLite inbox output](../database/README.md) is defined separately under 0020 (design reference omitted from this limited snapshot). It uses the existing condition JSON and delivery identity, but reports verified inbox commit rather than an HTTP receipt/status. No fields or enum values are added to these HTTP schemas.

