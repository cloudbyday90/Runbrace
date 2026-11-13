# Source license headers

Run `node scripts/license-headers.mjs --check` for a read-only check and
`node scripts/license-headers.mjs --write` to add missing headers. Stage new
source files first: only Git-tracked files are considered. Run the regression
suite with `node --test scripts/test/*.test.mjs`.

Project-owned code uses `SPDX-License-Identifier: GPL-3.0-only`, matching the
README and LICENSE. Copyright years are not automatically advanced just
because the calendar changed. Existing notices, ownership and license grants
are never replaced: unfamiliar notices fail the check for human review.

Coverage: `.js`, `.mjs`, `.cjs`, `.py`, `.php` under `scripts`, `tools`,
`observability`, and `compatibility-runtime`. Only reviewed first-party source
belongs in these roots. JSON schemas/fixtures, lockfiles, docs, binary assets,
third-party/vendor trees, generated output and fixture directories are excluded.
Files marked `@generated`, `automatically generated` or `DO NOT EDIT` in their
first 4096 characters are preserved. Exclusions do not waive third-party license
obligations. Review generated markers and exclusions in pull requests.

The script preserves shebangs, Python encoding declarations, PHP opening tags,
UTF-8 BOM, line endings and original body bytes; malformed input and symlinks
fail closed. Header checking does not establish legal ownership. New imported
code needs provenance review before being included, and its original notices
must remain intact. Unsupported new source types require an explicit policy and
test update rather than a guessed comment style.

## Classifarr reference

This is a new Runbrace implementation of the add-header/check workflow used by
Classifarr, not a copied script or a relicense of Classifarr code. Reviewed:

- `scripts/add-copyright-headers.mjs` at Classifarr commit
  `e44c7c4eeddf4c25e90688f355b2d50ee8db5057`
- `scripts/update-copyright.mjs` at the same commit
- https://github.com/cloudbyday90/Classifarr/tree/e44c7c4eeddf4c25e90688f355b2d50ee8db5057/scripts

Classifarr's templates include GPL version 3 **or later** and Classifarr
Contributors attribution. They are not substituted into Runbrace's version-3-only
policy. Runbrace deliberately does not copy the owner-replacement/year-refresh
behavior or the JavaScript-default fallback for unknown source types. The
existing third-party notices remain governed by THIRD_PARTY.md.
