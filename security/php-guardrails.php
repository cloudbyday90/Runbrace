<?php
// SPDX-License-Identifier: GPL-3.0-only
// Scanner-only synthetic fixtures. Never execute this file.
// ruleid: runbrace-php-no-eval
eval($untrusted);
// ok: runbrace-php-no-eval
json_decode($json, true, 16, JSON_THROW_ON_ERROR);
// ruleid: runbrace-php-no-unserialize
unserialize($untrusted);
// ok: runbrace-php-no-unserialize
json_encode($data, JSON_THROW_ON_ERROR);
// ruleid: runbrace-php-no-process-execution
exec($command);
// ruleid: runbrace-php-no-process-execution
system($command);
// ruleid: runbrace-php-no-process-execution
shell_exec($command);
// ruleid: runbrace-php-no-process-execution
passthru($command);
// ruleid: runbrace-php-no-process-execution
popen($command, 'r');
// ruleid: runbrace-php-no-process-execution
proc_open($command, [], $pipes);
// ok: runbrace-php-no-process-execution
sprintf('%s', $value);
