# SPDX-License-Identifier: GPL-3.0-only
"""Standard-library regressions for the Python differential reader."""
import errno
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runbrace_differential", Path(__file__).resolve().parents[1] / "differential.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="runbrace-python-reader-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / "input.json"
        self.file.write_bytes(b"{}")

    def test_regular_exact_limit_and_oversize(self):
        self.assertEqual(module.read_bounded(self.file), b"{}")
        self.file.write_bytes(b"")
        self.assertEqual(module.read_bounded(self.file), b"")
        self.file.write_bytes(b"x" * 65536)
        self.assertEqual(len(module.read_bounded(self.file)), 65536)
        self.file.write_bytes(b"x" * 65537)
        with self.assertRaises(ValueError):
            module.read_bounded(self.file)
        with self.assertRaises((ValueError, OSError)):
            module.read_bounded(self.root)

    @unittest.skipIf(os.name == "nt", "symlink creation needs Windows privilege")
    def test_symlink_refused(self):
        link = self.root / "link.json"
        link.symlink_to(self.file)
        with self.assertRaises((ValueError, OSError)):
            module.read_bounded(link)

    def test_path_identity_mismatch_after_open_is_refused_and_closed(self):
        original = os.open
        opened = []
        replacement = self.root / "replacement.json"
        replacement.write_bytes(b"[]")
        replacement_info = os.lstat(replacement)
        def tracked(path, flags):
            fd = original(path, flags)
            opened.append(fd)
            return fd
        # Inject the post-open identity change without relying on Windows
        # permitting rename of a CRT-open file (FILE_SHARE_DELETE differs).
        with patch.object(module.os, "open", side_effect=tracked), patch.object(module.os, "lstat", return_value=replacement_info):
            with self.assertRaises(ValueError):
                module.read_bounded(self.file)
        with self.assertRaises(OSError) as error:
            os.fstat(opened[0])
        self.assertEqual(error.exception.errno, errno.EBADF)

    def test_growth_after_checks_is_bounded(self):
        original = os.read
        sizes = []
        def grow(fd, size):
            sizes.append(size)
            if len(sizes) == 1:
                with self.file.open("ab") as stream:
                    stream.write(b"x" * 131072)
            return original(fd, size)
        with patch.object(module.os, "read", side_effect=grow):
            with self.assertRaises(ValueError):
                module.read_bounded(self.file)
        self.assertLessEqual(sum(sizes), 65537)

    def test_read_failure_closes_descriptor(self):
        original = os.open
        opened = []
        def tracked(path, flags):
            fd = original(path, flags)
            opened.append(fd)
            return fd
        with patch.object(module.os, "open", side_effect=tracked), patch.object(module.os, "read", side_effect=OSError("synthetic")):
            with self.assertRaises(OSError):
                module.read_bounded(self.file)
        with self.assertRaises(OSError) as error:
            os.fstat(opened[0])
        self.assertEqual(error.exception.errno, errno.EBADF)

    @unittest.skipIf(os.name == "nt", "POSIX FIFO only")
    def test_fifo_refused_without_waiting(self):
        self.file.unlink()
        os.mkfifo(self.file)
        with self.assertRaises(ValueError):
            module.read_bounded(self.file)

    def test_later_unchanged_check_rejects_oversized_replacement(self):
        before = module.read_bounded(self.file)
        self.assertEqual(before, b"{}")
        self.file.write_bytes(b"x" * 65537)
        with self.assertRaises(ValueError):
            module.read_bounded(self.file)

    def test_binary_bytes_and_short_reads_are_preserved(self):
        raw = b"\r\n\x1a\x00\xffsynthetic"
        self.file.write_bytes(raw)
        original = os.read
        with patch.object(module.os, "read", side_effect=lambda fd, size: original(fd, min(size, 2))):
            self.assertEqual(module.read_bounded(self.file), raw)


if __name__ == "__main__":
    unittest.main()
