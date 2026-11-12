"""Synthetic-only tests; no checkpoint download, personal media or real images."""
import hashlib
import unittest
from unittest.mock import MagicMock

import numpy as np

from audit_minifasnet_pytorch_onnx_parity import (
    ARCH_MAX_BYTES, PTH_MAX_BYTES,
    ORIGINAL_ARCH_GIT_BLOB_SHA1, ORIGINAL_PTH_SHA256,
    git_blob_sha1, sha256_matches, verify_source_checkpoint_bytes,
    bounded_download, validate_numeric_parity,
)


class SafeParityAuditTests(unittest.TestCase):
    def test_checksum_must_match_original_checkpoint_and_source_blob(self):
        self.assertEqual(git_blob_sha1(b"abc"),
                         hashlib.sha1(b"blob 3\0abc").hexdigest())
        self.assertFalse(verify_source_checkpoint_bytes(b"not official", "checkpoint"))
        self.assertFalse(verify_source_checkpoint_bytes(b"not official", "architecture"))
        self.assertFalse(verify_source_checkpoint_bytes(b"", "checkpoint"))
        self.assertEqual(len(ORIGINAL_PTH_SHA256), 64)
        self.assertEqual(len(ORIGINAL_ARCH_GIT_BLOB_SHA1), 40)

    def test_no_unbounded_or_insecure_checkpoint_download(self):
        class FakeResult:
            def __init__(self, data):
                self.data = data
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self, n):
                return self.data[:n]
        opened = []
        def fake_opener(request,timeout):
            opened.append((request.full_url,timeout))
            return FakeResult(b"SYNTHETIC_OK")
        self.assertEqual(
            bounded_download("https://example.test/fixture", ARCH_MAX_BYTES, fake_opener),
            b"SYNTHETIC_OK",
        )
        self.assertEqual(len(opened), 1)
        with self.assertRaises(ValueError):
            bounded_download("http://example.test/bad", PTH_MAX_BYTES, fake_opener)
        self.assertEqual(len(opened), 1)
        with self.assertRaises(ValueError):
            bounded_download("https://example.test/oversize", 3, fake_opener)

    def test_parity_compares_unsoftmaxed_logits_without_permutation(self):
        a = np.array([1.2, 5.2, -0.7], dtype=np.float32)
        close = np.array([1.201, 5.198, -0.701], dtype=np.float32)
        result = validate_numeric_parity(a, close)
        self.assertTrue(result["withinTolerance"])
        self.assertTrue(result["argmaxIndexMatches"])
        reversed_values = np.array([5.2, 1.2, -0.7], dtype=np.float32)
        report = validate_numeric_parity(a, reversed_values)
        self.assertFalse(report["withinTolerance"])
        self.assertFalse(report["argmaxIndexMatches"])

    def test_same_argmax_does_not_hide_large_numerical_mismatch(self):
        ref = [10., 1., 0.]
        bad = [1000., 1., 0.]
        result = validate_numeric_parity(ref, bad)
        self.assertTrue(result["argmaxIndexMatches"])
        self.assertFalse(result["withinTolerance"])

    def test_invalid_logits_and_nonfinite_values_fail_closed(self):
        for a,b in (
            ([1.,2.],[1.,2.,3.]),
            ([1.,float("nan"),3.],[1.,2.,3.]),
            ([1.,2.,3.],[1.,float("inf"),3.]),
        ):
            with self.subTest(a=a,b=b):
                with self.assertRaises(ValueError):
                    validate_numeric_parity(a,b)

    def test_bad_tolerance_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_numeric_parity([1,2,3],[1,2,3],atol=0.5)

    def test_does_not_import_or_load_untrusted_source(self):
        with self.assertRaises(ValueError):
            from audit_minifasnet_pytorch_onnx_parity import load_original_model
            load_original_model(b"untrusted script", b"untrusted pickle", ".")


if __name__ == "__main__":
    unittest.main()
