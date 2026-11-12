import {spawnSync} from 'node:child_process';

// Fixed local worker in the CLI; alternate argv exists only for controlled tests.
export function runBounded(argv, timeout = 40000) {
  const result = spawnSync(process.execPath, argv, {encoding: 'utf8', timeout,
    maxBuffer: 1024 * 1024, windowsHide: true});
  if (result.error || result.signal || result.status === null) {
    const timedOut = result.error?.code === 'ETIMEDOUT';
    return {summary: {status: 'error', code: timedOut ? 'execution_timeout' : 'worker_failed'},
      exitCode: timedOut ? 4 : 2};
  }
  try {
    return {summary: JSON.parse(result.stdout),
      exitCode: [0, 1, 2, 3, 4].includes(result.status) ? result.status : 2};
  } catch {
    return {summary: {status: 'error', code: 'worker_protocol'}, exitCode: 2};
  }
}
