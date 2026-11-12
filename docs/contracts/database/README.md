# Proposed SQLite condition inbox contract

**Status:** Draft `sqlite_inbox_v1` output contract; no DDL, migration runner, or connector implemented. See database connection research (design reference omitted from this limited snapshot) and 0020 (design reference omitted from this limited snapshot).

## Destination binding

The target snapshot captures logical destination UUIDv7, file-binding UUIDv7 marker, adapter/schema revision and migration manifest digest, approved canonical file identity/path reference, OS access policy, journal/durability settings, frozen condition bytes/digest/media type, fixed admission deadline, retention proof, receiver mode, and bounded connection/attempt policy. Sensitive paths and credential material are private configuration, not public event attributes.

Path changes require verification of the same logical file/marker and captured acceptance namespace. An empty/replaced/restored file is not automatically that receiver. Ordinary delivery cannot create files or adopt arbitrary schemas. One logical destination per file is the first proposed binding; another publisher/consumer must agree the same ownership and retention contract before sharing it.

The following tables describe the required logical shape, not executable SQL. During implementation use STRICT tables, explicit NOT NULL/check/unique constraints, UUIDv7 validation, and per-connection verified foreign keys. SQLite STRICT types do not include PostgreSQL's native UUID, JSONB, or timestamptz types; see [STRICT tables](https://www.sqlite.org/stricttables.html) and [foreign-key enablement](https://www.sqlite.org/foreignkeys.html).

## Runbrace-defined metadata: `runbrace_sink_meta`

| Field | Proposed SQLite representation | Rule |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY NOT NULL, BINARY equality | Immutable file-binding UUIDv7, pinned in private PostgreSQL |
| `destination_id` | TEXT NOT NULL UNIQUE, BINARY equality | Logical destination UUIDv7 |
| `contract_version` | TEXT NOT NULL | Exact `sqlite_inbox_v1` |
| `schema_revision` | TEXT NOT NULL | Exact packaged timestamp version |
| `manifest_sha256` | BLOB NOT NULL | Exactly 32 bytes |
| `created_at_us` | INTEGER NOT NULL | UTC Unix microseconds |

Exactly one enrolled metadata row is allowed in this first profile; extra rows are a configuration failure. The implementation must enforce this without adding an integer primary-key metadata table. Initialization and migrations must preserve this marker. It is a consistency check, not authentication against a privileged file writer or proof that a restored file retained all acceptances.

## Immutable inbox: `runbrace_condition_inbox`

| Field | Proposed SQLite representation | Rule |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY NOT NULL, BINARY equality | Existing delivery UUIDv7; retries do not allocate another row identity |
| `event_id` | TEXT NOT NULL, BINARY equality | Existing condition event UUIDv7; agrees with the body |
| `destination_id` | TEXT NOT NULL, BINARY equality | Agrees with enrolled metadata and captured target |
| `sink_binding_id` | TEXT NOT NULL, FK to metadata `id` | Pinned file-binding UUIDv7 |
| `contract_version` | TEXT NOT NULL | Exact `sqlite_inbox_v1` |
| `condition_json` | TEXT NOT NULL | Exact frozen UTF-8 condition JSON, at most 256 KiB in bytes |
| `condition_sha256` | BLOB NOT NULL | Exactly 32 bytes, SHA-256 of those exact bytes |
| `request_not_after_us` | INTEGER NOT NULL | Captured UTC Unix-microsecond admission deadline |
| `accepted_at_us` | INTEGER NOT NULL | Trusted UTC acceptance time recorded for the original insertion |

All UUID strings use canonical lower-case, hyphenated RFC-variant UUIDv7, with length/version/variant enforced by the writer and SQL constraints. Never substitute a SQLite integer rowid for an owned primary key. Native resource IDs remain inside condition JSON with their original exact identity. Indexed UNIQUE `(destination_id, event_id)` reinforces one handoff per event/destination; an unexpected collision with another delivery key is an identity conflict, not duplicate success. Metadata/destination consistency needs explicit constraints and transactional checks, not only a foreign key to the marker.

Validate the common [condition schema](../events/condition-v1.schema.json) before writing. Store interoperable JSON text; do not substitute a vendor JSONB blob, reformat the body, or compare only parsed JSON/digests. SQLite has no FK into private PostgreSQL; copy IDs as references, not cross-database constraints. The external tables do not add to the nine core PostgreSQL ledger tables.

## Acceptance algorithm

Record a private-ledger attempt first. Within one bounded SQLite writer transaction:

1. Verify marker, supported schema/manifest, destination, and effective connection policy.
2. Look up `id=delivery_id` using a bound parameter. If found, compare binding, destination, event, contract, deadline, exact UTF-8 bytes and digest. `accepted_at_us` belongs to the original acceptance and is not regenerated on retry. Equal content returns the original receipt; any mismatch rolls back with `sqlite_identity_conflict`.
3. If absent, enforce the fixed admission deadline after acquiring the write lock, with the configured clock/skew margin and enough remaining attempt budget. Insert the immutable inbox row with targeted conflict handling. Re-read and compare a conflicting winner; never use `INSERT OR REPLACE`, broad IGNORE, or update immutable content. Another unique-constraint conflict is an error.
4. Commit before reporting acceptance. A failed/ambiguous commit is not success. Roll back/close or prove cancellation completion before releasing the writer slot.

Known matching keys may return their original acceptance after the deadline; previously unseen keys may not be inserted after it. Every writer must enforce this rule. Retain keys and comparison bytes through `receiver_protection_until` plus the agreed margin; consumption does not delete them. Finite retention/cleanup must be coordinated with outstanding writes and retries. A later compact-tombstone protocol needs its own exact-comparison/retention design and is not assumed here.

The consumer reads committed inbox rows. It keeps its own processing/claim state, with UUIDv7 IDs for any Runbrace-defined tables; it cannot edit acceptance rows to mark remediation done. Its polling cursor must handle commit order: UUIDv7 and `accepted_at_us` alone are not a guaranteed lossless concurrent-consumer watermark. Consumer claiming/acknowledgment is a separate agreement before a live workflow uses this inbox.

## Ledger evidence and failures

After verified commit or exact reconciliation, set `acceptance_basis=database_inbox_commit`, `response_status=null`, and `remote_reference=<delivery UUIDv7>`. Record a bounded acknowledgment summary with binding/contract identity, matched digest, and whether it reused an acceptance. The frozen request remains the existing condition JSON. This extends proposed ledger vocabularies; no HTTP receipt schema is reused and no HTTP 200 is fabricated.

| Evidence | Delivery behavior |
| --- | --- |
| Commit succeeded and exact row agrees | Accepted inbox handoff; remediation remains unknown |
| Exact existing row agrees | Reconcile accepted; no new queue row |
| Stable key with changed body/event/binding/deadline | Fail/pause with conflict; preserve the old row |
| Writer busy before any transaction/write could begin | Bounded retry under the attempt/deadline budget |
| Lost worker/result, I/O error, OOM, or uncertain COMMIT | Unknown until authoritative reconciliation; no automatic claim that rollback occurred |
| Lookup absent while an old worker may still commit | Remain unknown unless the verified atomic/deadline contract permits same-key resend |
| Missing file, schema/marker drift, restore, permissions or disk failure | Pause affected destination; preserve private ledger/backlog; never initialize a replacement during delivery |

Capability starts `unverified`; demonstrated SQL transactions alone do not promote it. `atomic_acceptance` additionally requires deadline enforcement, durable settings/storage, exact comparison, retained keys, controlled writers, and coordinated backup/restore. Restoring an older inbox can erase receipts; restoring PostgreSQL can erase the local knowledge of a send. Pause dispatch across either restore, reconcile both histories, and never automatically refill/replay old conditions.

Output backup/retention belongs to the agreed operator contract. Use a tested consistent backup method, preserve file marker and acceptance history, and test isolated restore. Copying only a live `.db` file is insufficient in WAL mode. No destination backup is an atomic snapshot of both databases.

The 24 validation scenarios (design reference omitted from this limited snapshot) are planned, Not run. This document is a contract design, not evidence of SQL, Rust driver, power-loss durability, memory use, or native consumer support.

