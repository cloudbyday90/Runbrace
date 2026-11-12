// SPDX-License-Identifier: GPL-3.0-only
import fs from 'node:fs';
import {LIMITS, Refusal} from './parse.mjs';

// Bind type/size checks and bytes to one descriptor, never a checked pathname.
// O_NOFOLLOW is defense in depth where supported. The descriptor/path identity
// check is also required, including on Windows where that flag is unavailable.
// This is not a directory sandbox: callers must trust the source checkout.
export function readInput(file, refusalCode = 'input_bytes_limit') {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
    | (fs.constants.O_NONBLOCK ?? 0);
  let fd;
  try {
    fd = fs.openSync(file, flags);
    const before = fs.fstatSync(fd, {bigint: true});
    const named = fs.lstatSync(file, {bigint: true});
    if (!before.isFile() || !named.isFile() || named.isSymbolicLink()
        || named.dev !== before.dev || named.ino !== before.ino
        || before.size > BigInt(LIMITS.bytes)) throw new Refusal(refusalCode);
    const buffer = Buffer.alloc(LIMITS.bytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length > LIMITS.bytes) throw new Refusal(refusalCode);
    const after = fs.fstatSync(fd, {bigint: true});
    if (after.size !== before.size || after.mtimeNs !== before.mtimeNs
        || after.ctimeNs !== before.ctimeNs || BigInt(length) !== after.size)
      throw new Refusal('source_bytes_changed');
    return buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof Refusal) throw error;
    if (error.code === 'ELOOP') throw new Refusal('symlink_refused');
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
