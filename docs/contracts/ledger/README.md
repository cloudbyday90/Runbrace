# Ledger inspection example

**Status:** Synthetic proposed read view; not an implemented API or database dump.  
**Defined:** 2026-11-09.

[example.json](example.json) illustrates one accepted native input producing one immutable condition event. The event is sent to two configured destinations: n8n accepted its handoff, while Dagu's response was lost and that handoff is unknown. Neither record claims successful remediation.

[duplicate-example.json](duplicate-example.json) adds a different envelope containing the same proved source occurrence. Two receipts and two provenance links still refer to one event and the original two deliveries. The second receipt creates zero new events/deliveries, and the event keeps its first-publication receipt time. The envelope/occurrence keys are synthetic adapter examples, not a claim that deployed SABnzbd supplies these batching identities.

The `event` object follows the existing [consumer condition schema](../events/condition-v1.schema.json). Only that condition document goes to the workflow. The receipt/delivery/attempt wrapper is a Runbrace inspection view; it does not change the consumer contract.

Delivery retries keep the same event and delivery IDs and create another attempt ID/number only when the receiver contract permits it. An unknown send has no scheduled ordinary retry in this example. Displayed destination names and response values are fictional; no live workflow was invoked.

The read view now includes captured transport/acknowledgment profiles, receiver mode, and acceptance basis. The synthetic n8n acceptance matches the [generic HTTP receipt fixture](../transport/examples/receipt.json), while receiver capability remains unverified. An explicit receipt is an acceptance claim, not proof of atomic enqueue or remediation success.

Source/target configuration, private URLs, credentials, worker claims, and full journal rows are omitted from this read view. Its `view_version` is a draft view identifier, separate from the event's consumer `schema_version`.

See ledger definition (design reference omitted from this limited snapshot), processing (design reference omitted from this limited snapshot), and forwarding (design reference omitted from this limited snapshot).

The duplicate contract (design reference omitted from this limited snapshot) and validation plan (design reference omitted from this limited snapshot) specify concurrent key reuse, receiver acceptance, and retention limits. These examples illustrate the proposed result; they do not execute the SQL protocol or receiving gate.

The later [matching contracts](../matching/README.md) add complete matched/unrouted journal details and artifact digests outside the common consumer body. These older inspection examples omit that new private decision evidence; they do not claim complete runtime publication snapshots. Their event/destination uniqueness remains unchanged under overlapping rules.

## Database output extension

0020 (design reference omitted from this limited snapshot) proposes optional [SQLite inbox output](../database/README.md). These existing JSON examples illustrate HTTP consumers only. A SQLite ledger record would use `sqlite_inbox_v1`, `database_inbox_commit`, null HTTP status, and the stable delivery UUID as the receipt reference. Its external inbox rows are not extra core PostgreSQL ledger tables; commit uncertainty still needs reconciliation.

