"""Meaningful offline model checks; no service, database or existing tests invoked."""
import contextlib
import copy
import io
import json
from pathlib import Path
import secrets
import unittest

import model

ROOT = Path(__file__).resolve().parents[1]


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads((ROOT / "fixtures/record.json").read_text(encoding="utf-8"))
        self.source = {k: v for k, v in self.fixture.items() if k not in ("version", "resource")}
        self.tp = "00-" + "1" * 32 + "-" + "2" * 16 + "-01"

    def test_default_has_no_output_or_queue(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            self.assertIsNone(model.record(self.source))
            q = model.QueueModel()
            self.assertFalse(q.offer(self.source))
        self.assertEqual(output.getvalue(), "")
        self.assertEqual((len(q.queue), q.bytes, dict(q.dropped)), (0, 0, {}))

    def test_positive_fixture_and_source_unchanged(self):
        original = copy.deepcopy(self.source)
        self.assertEqual(model.record(self.source, enabled=True), self.fixture)
        self.assertEqual(self.source, original)

    def test_resource_contract(self):
        self.assertEqual(set(self.fixture["resource"]), {"service.name", "service.version", "deployment.environment.name"})
        self.assertEqual(self.fixture["resource"]["deployment.environment.name"], "offline")

    def test_generated_canary_and_raw_fields_excluded(self):
        canary = secrets.token_hex(24)
        for field in ("authorization", "cookie", "sql", "binds", "exception", "environment", "payload", "body", "media_path", "user_content", "url", "headers", "baggage", "tracestate"):
            self.source[field] = {"secret": canary}
        encoded = model.encode(model.record(self.source, enabled=True))
        self.assertNotIn(canary.encode(), encoded)
        self.assertEqual(json.loads(encoded), self.fixture)

    def test_legacy_identity_is_an_exact_string(self):
        self.assertEqual(model.record(self.source, enabled=True)["legacy_id"], "9223372036854775807")
        self.source["legacy_id"] = 9223372036854775807
        self.assertNotIn("legacy_id", model.record(self.source, enabled=True))

    def test_unsafe_or_oversize_ids_omitted_without_mutation(self):
        for bad in ("/media/private", "x\ny", "x" * 257, "a@person.example", "", False):
            self.source["job_id"] = bad
            self.assertNotIn("job_id", model.record(self.source, enabled=True))
            self.assertEqual(self.source["job_id"], bad)

    def test_unknown_outcome_never_becomes_success(self):
        self.source["outcome"] = "new-status-with-user-content"
        result = model.record(self.source, enabled=True)
        self.assertEqual((result["outcome"], result["reason"]), ("unknown", "unclassified"))

    def test_unknown_reason_bounded(self):
        self.source["reason"] = "connection postgres://secret"
        self.assertEqual(model.record(self.source, enabled=True)["reason"], "unclassified")

    def test_invalid_operation_drops_telemetry(self):
        q = model.QueueModel(enabled=True)
        self.source["operation"] = "arbitrary-script"
        self.assertFalse(q.offer(self.source))
        self.assertEqual(q.dropped["invalid_record"], 1)

    def test_invalid_calendar_and_duration(self):
        for bad in ("2026-02-30T00:00:00Z", "2026-11-12T00:00:00Z\n", "raw-secret"):
            self.assertIsNone(model.record(dict(self.source, timestamp=bad), enabled=True))
        for bad in (True, -1, float("nan"), float("inf"), 86400001, 2**4096):
            self.assertNotIn("duration_ms", model.record(dict(self.source, duration_ms=bad), enabled=True))

    def test_untrusted_context_never_accepted(self):
        self.assertIsNone(model.parent(self.tp))

    def test_valid_controlled_context_and_sampling_flag(self):
        self.assertEqual(model.parent(self.tp, controlled=True), {"trace_id": "1" * 32, "parent_span_id": "2" * 16, "sampled": True})
        self.assertFalse(model.parent(self.tp[:-2] + "00", controlled=True)["sampled"])

    def test_malformed_context_ignored(self):
        bad = [None, [self.tp], self.tp + "\n", self.tp + "," + self.tp,
               "00-" + "0" * 32 + "-" + "2" * 16 + "-01",
               "00-" + "1" * 32 + "-" + "0" * 16 + "-01",
               "00-" + "a" * 32 + "-" + "b" * 16 + "-03",
               self.tp.replace("00-", "ff-", 1), self.tp.replace("1", "A"), "x" * 10000]
        for value in bad:
            self.assertIsNone(model.parent(value, controlled=True))

    def test_trace_pair_atomic_and_remote_is_not_active_span(self):
        self.source.pop("span_id")
        result = model.record(self.source, enabled=True)
        self.assertNotIn("trace_id", result)
        self.assertNotIn("span_id", result)
        self.assertNotIn("span_id", model.parent(self.tp, controlled=True))

    def test_retry_identity_new_attempt_and_trace(self):
        retry = dict(self.source, attempt_id="fixture-attempt-2", trace_id="3" * 32, span_id="4" * 16)
        first, second = model.record(self.source, enabled=True), model.record(retry, enabled=True)
        for key in ("job_id", "request_id", "event_id", "legacy_id"):
            self.assertEqual(first[key], second[key])
        self.assertNotEqual(first["attempt_id"], second["attempt_id"])
        self.assertNotEqual(first["trace_id"], second["trace_id"])
        # A future SDK span link uses the first trace/span; no ID is reassigned.

    def test_item_capacity_drops_newest(self):
        q = model.QueueModel(enabled=True, max_items=2)
        self.assertTrue(q.offer(self.source)); self.assertTrue(q.offer(self.source))
        before = list(q.queue)
        self.assertFalse(q.offer(self.source))
        self.assertEqual(list(q.queue), before)
        self.assertEqual(q.dropped["queue_full"], 1)

    def test_byte_capacity(self):
        size = len(model.encode(self.fixture))
        q = model.QueueModel(enabled=True, max_bytes=size)
        self.assertTrue(q.offer(self.source))
        self.assertFalse(q.offer(self.source))
        self.assertEqual(q.bytes, size)
        self.assertEqual(q.dropped["byte_limit"], 1)

    def test_record_and_batch_bounds(self):
        large = dict(self.source, **{key: "x" * 256 for key in model.IDS})
        self.assertLessEqual(len(model.encode(model.record(large, enabled=True))), 4096)
        q = model.QueueModel(enabled=True)
        for _ in range(256): q.offer(large)
        before = q.bytes
        result = q.pump()
        self.assertLessEqual(result["sent"], 32)
        self.assertLessEqual(before - q.bytes, 32768)
        self.assertLessEqual(q.bytes, 262144)

    def test_absent_and_slow_collector_do_not_affect_offer(self):
        for scenario in ("absent", "slow"):
            q = model.QueueModel(enabled=True)
            self.assertTrue(q.offer(self.source))
            result = q.pump(scenario)
            self.assertEqual(result["sent"], 0)
            self.assertLessEqual(result["elapsed_ms"], 200)  # virtual deadline only
            self.assertEqual(q.dropped["export_failed"], 1)
            self.assertEqual(q.bytes, 0)

    def test_disk_full_is_loss_not_business_failure(self):
        q = model.QueueModel(enabled=True)
        q.offer(self.source); q.pump("disk_full")
        self.assertEqual(q.dropped["export_failed"], 1)
        self.assertTrue(q.offer(self.source))

    def test_circuit_and_recovery(self):
        q = model.QueueModel(enabled=True)
        for now in (0, 1000, 2000):
            q.offer(self.source); q.pump("absent", now)
        q.offer(self.source)
        self.assertEqual(q.pump("ok", 3000), {"sent": 0, "elapsed_ms": 0})
        self.assertEqual(q.dropped["circuit_open"], 1)
        q.offer(self.source)
        self.assertEqual(q.pump("ok", 32000)["sent"], 1)

    def test_shutdown_drops_immediately_and_stays_closed(self):
        q = model.QueueModel(enabled=True)
        q.offer(self.source); q.shutdown()
        self.assertEqual((q.bytes, len(q.queue), q.dropped["shutdown"]), (0, 0, 1))
        self.assertFalse(q.offer(self.source))

    def test_cardinality_for_ten_thousand_distinct_jobs(self):
        tuples = set()
        for n in range(10000):
            value = dict(self.source, job_id=f"job-{n}", event_id=f"event-{n}", attempt_id=f"attempt-{n}", reason=f"untrusted-{n}")
            tuples.add(model.labels(value))
        self.assertEqual(len(tuples), 1)
        self.assertLessEqual(len(model.OPERATIONS) * len(model.OUTCOMES) * len(model.REASONS), 150)

    def test_drop_counters_bounded_and_saturating(self):
        q = model.QueueModel(enabled=True)
        q.drop("sampled_out", 2**63)
        self.assertEqual(q.dropped["sampled_out"], 2**63 - 1)
        with self.assertRaises(ValueError): q.drop("arbitrary-user-reason")

    def test_schema_fixture_consistency_only(self):
        # This is NOT a Draft 2020-12 metaschema/instance validator.
        schema = json.loads((ROOT / "contracts/log-record-v1.schema.json").read_text(encoding="utf-8"))
        self.assertTrue(set(schema["required"]).issubset(self.fixture))
        self.assertTrue(set(self.fixture).issubset(schema["properties"]))
        for name, values in (("operation", model.OPERATIONS), ("outcome", model.OUTCOMES), ("reason", model.REASONS)):
            self.assertEqual(schema["properties"][name]["enum"], list(values))
            self.assertIn(self.fixture[name], values)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
