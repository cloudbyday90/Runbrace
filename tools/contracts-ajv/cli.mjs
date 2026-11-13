/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Runbrace Contributors
 */

// Parent watchdog: synchronous schema compilation/regex work cannot evade it.
import {HERE} from './registry.mjs';
import {runBounded} from './watchdog.mjs';
import path from 'node:path';

const result = runBounded(['--max-old-space-size=128', path.join(HERE, 'worker.mjs'), ...process.argv.slice(2)]);
process.stdout.write(JSON.stringify(result.summary) + '\n');
process.exitCode = result.exitCode;
