<?php
/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */

declare(strict_types=1);
namespace Runbrace\Observability\Offline;

/** Isolated pure prototype. No autoload, SDK, I/O, runtime imports or installation. */
function traceParent(mixed $header, bool $controlled = false): ?array {
    if (!$controlled || !is_string($header) || strlen($header) !== 55 ||
        preg_match('/\A00-([0-9a-f]{32})-([0-9a-f]{16})-(00|01)\z/D', $header, $m) !== 1 ||
        $m[1] === str_repeat('0', 32) || $m[2] === str_repeat('0', 16)) return null;
    return ['trace_id' => $m[1], 'parent_span_id' => $m[2], 'sampled' => $m[3] === '01'];
}

/** $source must be a trusted adapter projection, never a raw payload/header map. */
function record(array $source, bool $enabled = false): ?array {
    if (!$enabled) return null;
    try {
        $operations = ['intake', 'normalize', 'ledger_write', 'handoff', 'scan'];
        $outcomes = ['accepted', 'succeeded', 'failed', 'refused', 'unknown'];
        $reasons = ['none', 'validation', 'dependency', 'capacity', 'timeout', 'unclassified'];
        $timestamp = $source['timestamp'] ?? null;
        if (!in_array($source['operation'] ?? null, $operations, true) || !is_string($timestamp) ||
            preg_match('/\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\z/D', $timestamp) !== 1) return null;
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z', $timestamp, new \DateTimeZone('UTC'));
        if ($date === false || $date->format('Y-m-d\TH:i:s\Z') !== $timestamp) return null;
        $outcome = $source['outcome'] ?? null;
        $reason = $source['reason'] ?? 'none';
        if (!in_array($outcome, $outcomes, true)) { $outcome = 'unknown'; $reason = 'unclassified'; }
        if (!in_array($reason, $reasons, true)) $reason = 'unclassified';
        $result = ['version' => 1, 'timestamp' => $timestamp,
            'resource' => ['service.name' => 'runbrace-compatibility', 'service.version' => 'offline-prototype-v1',
                'deployment.environment.name' => 'offline'],
            'operation' => $source['operation'], 'outcome' => $outcome, 'reason' => $reason];
        foreach (['request_id', 'job_id', 'event_id', 'attempt_id', 'legacy_id'] as $key) {
            $value = $source[$key] ?? null;
            if (is_string($value) && preg_match('/\A[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}\z/D', $value) === 1) $result[$key] = $value;
        }
        $duration = $source['duration_ms'] ?? null;
        if ((is_int($duration) || is_float($duration)) && is_finite((float)$duration) && $duration >= 0 && $duration <= 86400000) $result['duration_ms'] = $duration;
        $trace = $source['trace_id'] ?? null; $span = $source['span_id'] ?? null;
        if (is_string($trace) && preg_match('/\A[0-9a-f]{32}\z/D', $trace) === 1 && $trace !== str_repeat('0', 32) &&
            is_string($span) && preg_match('/\A[0-9a-f]{16}\z/D', $span) === 1 && $span !== str_repeat('0', 16)) {
            $result['trace_id'] = $trace; $result['span_id'] = $span;
        }
        return $result;
    } catch (\Throwable) {
        // Never emit exception messages/stack traces/arguments on telemetry failure.
        return null;
    }
}
