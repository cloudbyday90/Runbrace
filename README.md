# Runbrace

Experimental offline contracts and verification tools for a self-hosted condition intake and forwarding service.

This initial source snapshot contains JSON Schema contracts, development-only Ajv validation, and a pure optional observability formatter/model. It is not a supported running service, telemetry exporter, recovery executor or production deployment. PHP remains the current compatibility direction; a future Rust implementation is not included here.

## Local verification

Node.js 24 is required for the Ajv tooling:

```sh
cd tools/contracts-ajv
npm ci --ignore-scripts
npm test
npm run validate
```

The pure observability model uses Python's standard library:

```sh
cd observability
python -B -m unittest discover -s tests -p test_contract.py -v
```

The PHP formatter is disabled by default. Its standalone verification is `php observability/tests/verify_php.php`. Test output, not this document, determines qualification on a particular PHP version.

## Scope and safety

Only synthetic examples are intended for this snapshot. Do not add live payloads, credential files, local operational inventories or deployment logs. No production credentials or network endpoints are needed for these offline tests.

Legacy copied helpers, operational SQL fixtures, private deployment evidence and the full compatibility runtime are deliberately excluded from this initial publication candidate. Their inclusion requires separate provenance, privacy and integration review. This snapshot does not claim completion of that runtime.

## License

Project-owned content is licensed under GNU GPL version 3 only (`GPL-3.0-only`). See LICENSE. Third-party dependencies retain their own licenses; see THIRD_PARTY.md. No proprietary or noncommercial restriction is added. Dependency packages are not vendored in this source snapshot.

The pure compatibility request validator is included solely for offline differential tests. Design references outside this limited snapshot are identified as omitted, not presented as available implementation.
