# PHP security guardrails

This supplements CodeQL, which covers JavaScript/TypeScript, Python and Actions but does not support PHP.

Semgrep Community Edition 1.185.0 runs from the official immutable container image. The scanner has no network, credentials or writable checkout. Metrics/version checks are disabled. The first-party GPL-3.0-only rules reject dynamic code evaluation, PHP object deserialization and process execution in the current offline PHP surface. These are prohibited primitives, not assertions that every use is exploitable.

Positive and negative scanner fixtures exercise all three rules, including each process-execution function. The fixture is never executed as PHP. Production scanning includes all PHP files except the explicitly isolated scanner fixture, and checks that both current formatter and behavior-test files were actually scanned. Inline nosem suppressions are disabled.

This is bounded coverage, not a comprehensive PHP security audit. It does not prove absence of injection, authentication, authorization, filesystem or cross-file dataflow defects. Reassess the rules and add broader reviewed analysis when runtime PHP is published. No container application or Composer project currently exists; image/dependency scanning must expand when those surfaces are added.

Dependency-review checks new known-vulnerable dependencies on pull requests. Dependabot version updates do not replace its separately enabled security updates. Updates need review and successful regressions; there is no automatic merge or release.

Scanner maintenance: review official Semgrep release notes and the official image digest before changing the pinned image; rerun both rule fixtures and the real scan. The image pin in the workflow is not currently updated by Dependabot. Upstream community rules are not vendored because their licensing differs from this project's GPL license.
