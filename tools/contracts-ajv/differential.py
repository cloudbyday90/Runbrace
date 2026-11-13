# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Runbrace Contributors

"""Offline semantic comparison. Called only with pre-screened synthetic cases."""
import base64
import hashlib
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys


def read_bounded(path):
    """Read one regular descriptor, capped even if its inode grows.

    The checkout is trusted; this does not atomically confine ancestor paths.
    O_NOFOLLOW is additional protection where supported. Always compare the
    opened descriptor to a non-symlink pathname, including on Windows.
    """
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        named = os.lstat(path)
        if (not stat.S_ISREG(before.st_mode) or not stat.S_ISREG(named.st_mode)
                or not os.path.samestat(before, named) or before.st_size > 65536):
            raise ValueError("limit")
        chunks, length = [], 0
        while length < 65537:
            chunk = os.read(fd, 65537 - length)
            if not chunk:
                break
            chunks.append(chunk)
            length += len(chunk)
        if length > 65536:
            raise ValueError("limit")
        after = os.fstat(fd)
        if (after.st_size != before.st_size or after.st_mtime_ns != before.st_mtime_ns
                or after.st_ctime_ns != before.st_ctime_ns or length != after.st_size):
            raise ValueError("changed")
        return b"".join(chunks)
    finally:
        os.close(fd)


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
        data = read_bounded(root / relative)
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
        if read_bounded(root / relative) != data:
            raise ValueError("changed")
    return {"status": "pass", "python": sys.version.split()[0],
            "packages": {name: importlib.metadata.version(name) for name in
                         ["jsonschema", "referencing", "rfc3339-validator", "rfc3986-validator", "jsonpointer"]},
            "schemaChecks": len(schemas), "results": results, "domain": domain}


if __name__ == "__main__":
    try:
        print(json.dumps(run(), separators=(",", ":")))
    except Exception:
        print('{"status":"error","code":"python_validation_failed"}')
        sys.exit(2)
