# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Runbrace Contributors

"""Small closed contract; keep in sync with contracts/request-v1.schema.json."""

import hashlib
import json
import re


class Rejected(Exception):
    """Public, fixed error code only; never expose underlying exceptions."""


def decode(raw: bytes, limit: int = 4096) -> dict:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise Rejected("duplicate_field")
            result[key] = value
        return result

    if len(raw) > limit:
        raise Rejected("payload_too_large")
    try:
        value = json.loads(raw, object_pairs_hook=unique,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise Rejected("invalid_json") from exc
    if type(value) is not dict:
        raise Rejected("invalid_object")
    return value


def request(value: dict) -> dict:
    if set(value) != {"version", "idempotency_key", "operation", "ack_generation", "arguments"}:
        raise Rejected("invalid_fields")
    if type(value["version"]) is not int or value["version"] != 1:
        raise Rejected("unsupported_version")
    if not isinstance(value["idempotency_key"], str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}", value["idempotency_key"]):
        raise Rejected("invalid_key")
    if value["operation"] != "fixture.scan":
        raise Rejected("unknown_operation")
    if type(value["ack_generation"]) is not int or not 1 <= value["ack_generation"] <= 2147483647:
        raise Rejected("invalid_acknowledgment")
    args = value["arguments"]
    if type(args) is not dict or set(args) != {"records", "mode"}:
        raise Rejected("invalid_arguments")
    if type(args["records"]) is not int or not 1 <= args["records"] <= 1000000:
        raise Rejected("invalid_records")
    if args["mode"] not in ("clean", "nonzero", "timeout", "overflow", "invalid"):
        raise Rejected("invalid_mode")
    return value


def canonical(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value: dict) -> str:
    return hashlib.sha256(canonical(value).encode("ascii")).hexdigest()
