"""Offline contract oracle and virtual export model. NOT a Runbrace runtime adapter.

No network, files, subprocesses, SDK, ledger imports or real sleeping. Queue failure
scenarios are a model; they do not qualify a PHP exporter or a real log sink.
"""
from collections import Counter, deque
from datetime import datetime
import json
import math
import re

OPERATIONS = ("intake", "normalize", "ledger_write", "handoff", "scan")
OUTCOMES = ("accepted", "succeeded", "failed", "refused", "unknown")
REASONS = ("none", "validation", "dependency", "capacity", "timeout", "unclassified")
DROP_REASONS = ("invalid_record", "record_limit", "queue_full", "byte_limit",
                "export_failed", "circuit_open", "shutdown", "sampled_out")
IDS = ("request_id", "job_id", "event_id", "attempt_id", "legacy_id")
RESOURCE = {"service.name": "runbrace-compatibility", "service.version": "offline-prototype-v1",
            "deployment.environment.name": "offline"}
TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}\Z", re.ASCII)
PARENT = re.compile(r"00-([0-9a-f]{32})-([0-9a-f]{16})-(00|01)\Z", re.ASCII)


def parent(header, *, controlled=False):
    """Restricted v00 profile. Trust is established by the caller, never a header."""
    if not controlled or not isinstance(header, str) or len(header) != 55:
        return None
    match = PARENT.fullmatch(header)
    if not match or match[1] == "0" * 32 or match[2] == "0" * 16:
        return None
    return {"trace_id": match[1], "parent_span_id": match[2], "sampled": match[3] == "01"}


def record(source, *, enabled=False):
    """source is a trusted adapter projection, NEVER a raw input/payload/header map."""
    if not enabled or not isinstance(source, dict):
        return None
    operation = source.get("operation")
    timestamp = source.get("timestamp")
    if operation not in OPERATIONS or not isinstance(timestamp, str):
        return None
    if len(timestamp) != 20 or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", timestamp):
        return None
    try:
        datetime.fromisoformat(timestamp[:-1] + "+00:00")
    except ValueError:
        return None
    outcome = source.get("outcome")
    reason = source.get("reason", "none")
    if outcome not in OUTCOMES:
        outcome, reason = "unknown", "unclassified"
    if reason not in REASONS:
        reason = "unclassified"
    result = {"version": 1, "timestamp": timestamp, "resource": dict(RESOURCE),
              "operation": operation, "outcome": outcome, "reason": reason}
    for key in IDS:
        value = source.get(key)
        if isinstance(value, str) and TOKEN.fullmatch(value):
            result[key] = value
    duration = source.get("duration_ms")
    if type(duration) in (float, int) and 0 <= duration <= 86400000 and math.isfinite(duration):
        result["duration_ms"] = duration
    # These are LOCAL active-span IDs, separate from the remote-parent parser.
    trace, span = source.get("trace_id"), source.get("span_id")
    if (isinstance(trace, str) and re.fullmatch(r"[0-9a-f]{32}", trace)
            and trace != "0" * 32 and isinstance(span, str)
            and re.fullmatch(r"[0-9a-f]{16}", span) and span != "0" * 16):
        result.update(trace_id=trace, span_id=span)
    return result


def encode(value):
    return (json.dumps(value, separators=(",", ":"), ensure_ascii=True, allow_nan=False) + "\n").encode("ascii")


def labels(value):
    """Only bounded application dimensions. Resource/target limits are separate."""
    if value.get("operation") not in OPERATIONS:
        return None
    outcome = value.get("outcome")
    reason = value.get("reason")
    if outcome not in OUTCOMES:
        outcome, reason = "unknown", "unclassified"
    if reason not in REASONS:
        reason = "unclassified"
    return value["operation"], outcome, reason


class QueueModel:
    """Virtual collector worker; pump() is never called by offer()/business code."""
    def __init__(self, *, enabled=False, max_items=256, max_bytes=262144):
        if type(max_items) is not int or type(max_bytes) is not int or not (1 <= max_items <= 256 and 1 <= max_bytes <= 262144):
            raise ValueError("model_bounds")
        self.enabled, self.max_items, self.max_bytes = enabled, max_items, max_bytes
        self.queue, self.bytes, self.dropped = deque(), 0, Counter()
        self.failures, self.open_until_ms, self.closed = 0, 0, False

    def drop(self, reason, count=1):
        if reason not in DROP_REASONS:
            raise ValueError("drop_reason")
        self.dropped[reason] = min(2**63 - 1, self.dropped[reason] + count)

    def offer(self, source):
        if not self.enabled or self.closed:
            return False
        value = record(source, enabled=True)
        if value is None:
            self.drop("invalid_record")
            return False
        wire = encode(value)
        if len(wire) > 4096:
            self.drop("record_limit")
            return False
        if len(self.queue) >= self.max_items:
            self.drop("queue_full")
            return False
        if self.bytes + len(wire) > self.max_bytes:
            self.drop("byte_limit")
            return False
        self.queue.append(wire)
        self.bytes += len(wire)
        return True

    def pump(self, scenario="ok", now_ms=0):
        # Scenario cost is VIRTUAL: no claim that a synchronous callback is cancellable.
        costs = {"ok": 1, "absent": 1, "slow": 200, "disk_full": 1}
        if scenario not in costs:
            raise ValueError("model_scenario")
        batch, size = [], 0
        while self.queue and len(batch) < 32 and size + len(self.queue[0]) <= 32768:
            wire = self.queue.popleft()
            batch.append(wire)
            size += len(wire)
        self.bytes -= size
        if now_ms < self.open_until_ms:
            self.drop("circuit_open", len(batch))
            return {"sent": 0, "elapsed_ms": 0}
        if scenario != "ok":
            self.drop("export_failed", len(batch))
            if batch:
                self.failures += 1
                if self.failures >= 3:
                    self.open_until_ms = now_ms + 30000
            return {"sent": 0, "elapsed_ms": costs[scenario] if batch else 0}
        self.failures = 0
        return {"sent": len(batch), "elapsed_ms": costs[scenario] if batch else 0}

    def shutdown(self):
        # Immediate-loss option; production bounded flush remains unqualified.
        self.drop("shutdown", len(self.queue))
        self.queue.clear()
        self.bytes, self.closed = 0, True


if __name__ == "__main__":
    # Running the model itself deliberately produces no output.
    pass
