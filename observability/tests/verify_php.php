<?php
/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */

declare(strict_types=1);
// Offline only. Run: php -n observability/tests/verify_php.php
require __DIR__ . '/../php/record.php';
use function Runbrace\Observability\Offline\record;
use function Runbrace\Observability\Offline\traceParent;
function check(bool $ok, string $code): void { if (!$ok) throw new RuntimeException($code); }
$fixture = json_decode(file_get_contents(__DIR__ . '/../fixtures/record.json'), true, 16, JSON_THROW_ON_ERROR);
$input = $fixture; unset($input['version'], $input['resource']);
$canary = bin2hex(random_bytes(24));
$input['authorization'] = 'Bearer ' . $canary;
$input['exception'] = ['message' => $canary, 'stack' => $canary];
$input['payload'] = ['content' => $canary];
ob_start();
check(record($input) === null, 'default_disabled');
$actual = record($input, true);
$expected = $fixture; $comparison = $actual;
ksort($expected); ksort($comparison);
check($comparison === $expected, 'fixture_parity');
check(!str_contains(json_encode($actual, JSON_THROW_ON_ERROR), $canary), 'canary');
check($actual['legacy_id'] === '9223372036854775807', 'integer_precision');
$tp = '00-' . str_repeat('1', 32) . '-' . str_repeat('2', 16) . '-01';
check(traceParent($tp) === null, 'untrusted_parent');
check(traceParent($tp, true)['sampled'] === true, 'trusted_parent');
check(traceParent(str_replace('1', 'A', $tp), true) === null, 'uppercase_parent');
check(traceParent('00-' . str_repeat('0', 32) . '-' . str_repeat('2', 16) . '-01', true) === null, 'zero_parent');
$bad = $input; $bad['timestamp'] = '2026-02-30T00:00:00Z';
check(record($bad, true) === null, 'calendar');
$bad = $input; $bad['outcome'] = $canary;
check(record($bad, true)['outcome'] === 'unknown', 'unknown_outcome');
check(ob_get_clean() === '', 'no_output');
echo "PASS: 11 PHP offline checks\n";
