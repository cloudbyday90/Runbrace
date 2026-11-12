# Draft resource sizing worksheets

**Status:** Proposed under 0019 (design reference omitted from this limited snapshot); no fixed user RAM budget, applied configuration, or runtime measurements.  
**Updated:** 2026-11-09.

| Artifact | Purpose |
| --- | --- |
| [Memory worksheet schema](memory-profile-v1.schema.json) | Shape/units for illustrative serial core profiles, not a production configuration API |
| [2 GiB core worksheet](examples/core-2g.json) | One 512 MiB app plus 1,536 MiB PostgreSQL example |
| [4 GiB core worksheet](examples/core-4g.json) | One 1,024 MiB app plus 3,072 MiB PostgreSQL example |
| System memory contract (design reference omitted from this limited snapshot) | Container/app/model/host boundaries and bounded work |
| PostgreSQL guide (design reference omitted from this limited snapshot) | Settings, multipliers, estimates, pools, vacuum/vector work, and diagnostics |
| Validation plan (design reference omitted from this limited snapshot) | Planned runtime experiments, distinct from arithmetic checks |

## Meaning and exclusions

All worksheets are `illustrative_unmeasured`. A MiB is 2^20 bytes. Their core total includes PostgreSQL plus every app replica; host reserve/other workloads and the unselected embedding runtime are excluded and explicitly unresolved. They cannot be advertised as the total RAM needed to ship the complete initial feature set. No image/server/model or allocator is pinned by these artifacts.

Numbers are budget allowances/assumptions, not observed peaks or PostgreSQL hard guarantees. Effective cache estimate and shared-memory capacity are not additive allocations. Eight MiB private backend cost and four memory nodes per active query are placeholders to replace with real measurements. Serial query/foreground maintenance is the worksheet's declared scope; enabling parallel work requires a new model, not just editing one number.

## Required arithmetic checks

- Core total = database limit + replicas × app limit. App component allowances plus app headroom equal its limit.
- DB component estimate follows the documented formula, including every configured client slot's assumed private overhead, modeled query activity, autovacuum, maintenance, temp buffers, other/cache, and headroom.
- Model query slots = replicas × sum(active app SQL limits) + the declared non-app memory-intensive SQL slots. Each active class stays within its pool capacity.
- Ordinary client demand = replicas × sum(pool maxima) + private operational slots. This must fit max_connections minus superuser/other reserved slots; reserved connections cannot be borrowed silently.
- Headroom and other allowances stay positive, and the illustrative DB headroom remains at least 25% of its limit. This margin is a project modeling choice, not proof of safety.
- Changes to work_mem, hash scaling, participants, connections, replicas, workers, build concurrency, caches, or app credits require recomputation; a syntactically valid worksheet can still be inconsistent or underestimate real allocation.

The schema intentionally cannot prove cross-field arithmetic, authority over manual clients, query node bounds, actual cgroup enforcement, cache reclamation, or model working set. No PostgreSQL `.conf`, Compose service, SQL migration, or application startup file is generated or applied. Deployment-specific resource settings belong to operational configuration, separate from current.sql schema parity.

## Evidence

Record schema/arithmetic/counterexample/document checks with the validation plan (design reference omitted from this limited snapshot). Production selection still needs host/VM/model budgets, supported-version settings, query plans, cold/warm/mixed-load/churn/maintenance/soak results, effective limits, and accepted-work recovery tests.

## SQLite connector increment

The optional SQLite output/source research (design reference omitted from this limited snapshot) introduces additional app allocations; these two core worksheets do not yet reserve a measured connector budget. Candidate four open connections with 2 MiB page-cache targets imply 8 MiB of cache targets, plus stacks, statements, buffers, native/query memory, file cache and headroom. SQLite is not a replacement for the PostgreSQL allocation. Revise and validate a full profile before enabling connectors; neither cache_size nor a process-global SQLite heap limit is a complete per-destination RAM cap.

