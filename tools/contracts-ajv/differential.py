"""Offline semantic comparison. Called only with pre-screened synthetic cases."""
import base64
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import sys


def run():
    from jsonschema import Draft202012Validator, FormatChecker
    from referencing import Registry, Resource

    request = json.loads(sys.stdin.buffer.read(1048577))
    if len(request["cases"]) > 512 or len(request["manifest"]["schemas"]) > 32:
        raise ValueError("limit")
    root = Path(request["root"])
    schemas, before = {}, {}
    for entry in request["manifest"]["schemas"]:
        relative = entry["path"]
        if ".." in Path(relative).parts or not relative.startswith(("docs/contracts/", "compatibility-runtime/contracts/")):
            raise ValueError("path")
        data = (root / relative).read_bytes()
        if len(data) > 65536 or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("changed")
        schema = json.loads(data)
        Draft202012Validator.check_schema(schema)
        schemas[entry["id"]] = schema
        before[relative] = data

    def no_network(_uri):
        raise ValueError("unknown_reference")

    registry = Registry(retrieve=no_network).with_resources(
        (key, Resource.from_contents(schema)) for key, schema in schemas.items())
    # Same single reviewed local binding; urllib resolves a relative ref under
    # an opaque URN to this literal name, rather than Ajv's malformed urn:name.
    registry = registry.with_resource("result-v1.schema.json", Resource.from_contents(
        schemas["urn:runbrace:compatibility:fixture-result:1"]))
    formats = FormatChecker()
    required_formats = {"date-time", "uuid", "uri", "uri-reference", "json-pointer"}
    if not required_formats.issubset(formats.checkers):
        raise ValueError("missing_format_assertions")
    validators = {key: Draft202012Validator(s, registry=registry, format_checker=formats)
                  for key, s in schemas.items()}
    spec = importlib.util.spec_from_file_location("fixture_contracts", root / "compatibility-runtime/runbrace/contracts.py")
    domain_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(domain_module)
    results, domain = [], []
    for case in request["cases"]:
        raw = base64.b64decode(case["base64"], validate=True)
        if len(raw) > 65536:
            raise ValueError("limit")
        value = json.loads(raw)
        status = "valid" if validators[case["schema"]].is_valid(value) else "invalid"
        results.append({"name": case["name"], "status": status})
        if case["schema"] == "urn:runbrace:compatibility:fixture-request:1":
            try:
                domain_module.request(domain_module.decode(raw))
                domain_status = "valid"
            except domain_module.Rejected:
                domain_status = "invalid"
            domain.append({"name": case["name"], "status": domain_status})
    for relative, data in before.items():
        if (root / relative).read_bytes() != data:
            raise ValueError("changed")
    return {"status": "pass", "python": sys.version.split()[0],
            "packages": {name: importlib.metadata.version(name) for name in
                         ["jsonschema", "referencing", "rfc3339-validator", "rfc3986-validator", "jsonpointer"]},
            "schemaChecks": len(schemas), "results": results, "domain": domain}


try:
    print(json.dumps(run(), separators=(",", ":")))
except Exception:
    print('{"status":"error","code":"python_validation_failed"}')
    sys.exit(2)
