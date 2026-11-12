"""Synthetic-only QA for privacy-safe PAD inconclusive diagnostics."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import diagnose_passive_pad_local as diag


class FakeDetection:
    def __init__(self, status="one_face_unvalidated", box=(160, 140, 65, 65)):
        self.status = status
        self.box = box
    def inspect_frame(self, _image):
        return self.status
    def single_face_box(self, _image):
        return self.box


class FakePad:
    def __init__(self, status="inconclusive"):
        self.status = status
        self.calls = 0
    def assess_frame_shadow(self, _image):
        self.calls += 1
        return {"status": self.status}


class DiagnosisTests(unittest.TestCase):
    def setUp(self):
        self.image = np.zeros((480, 640, 3), dtype=np.uint8)

    def test_oversized_face_has_insufficient_context_without_model_call(self):
        classification = FakePad("model_prefers_live_unvalidated")
        why = diag.diagnose_frame(
            self.image, FakeDetection(box=(50, 10, 360, 380)), classification)
        self.assertEqual(why, "insufficient_face_context")
        self.assertEqual(classification.calls, 0)

    def test_face_without_context_is_distinct_from_no_face(self):
        for status, expected in [
            ("no_face", "face_not_detected"),
            ("multiple_faces", "multiple_faces"),
            ("unavailable", "face_detection_inconclusive"),
        ]:
            self.assertEqual(diag.diagnose_frame(self.image, FakeDetection(status)),
                             expected)

    def test_model_only_runs_after_safe_crop(self):
        classification = FakePad("inconclusive")
        self.assertEqual(diag.diagnose_frame(self.image, FakeDetection(), classification),
                         "model_inconclusive")
        self.assertEqual(classification.calls, 1)
        classification.status = "model_prefers_attack_unvalidated"
        self.assertEqual(diag.diagnose_frame(self.image, FakeDetection(), classification),
                         "model_prefers_attack_unvalidated")

    def test_invalid_dimensions_are_inconclusive_not_exception(self):
        self.assertEqual(diag.diagnose_frame(None), "file_unreadable")
        self.assertEqual(
            diag.diagnose_frame(np.zeros((40, 20, 3), dtype=np.uint8)),
            "invalid_image_dimensions")

    def test_aggregates_only_no_filepaths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in diag.KINDS:
                (root / group).mkdir()
            photo = root / "live" / "super_sensitive_user_face.jpg"
            photo.write_bytes(b"synthetic")
            data = diag.aggregate(root, lambda _path: "insufficient_face_context")
            self.assertEqual(data["perClass"]["live"]["trials"], 1)
            self.assertEqual(data["perClass"]["live"]["reasons"], {
                "insufficient_face_context": 1})
            encoded = json.dumps(data)
            for forbidden in ("sensitive", "user_face", "filename", "embedding",
                              "cosineSimilarity", "xCoordinate"):
                self.assertNotIn(forbidden, encoded)
            self.assertFalse(data["independentPadValidated"])
            self.assertEqual(data["identityDecisionUse"], "none")

    def test_symlinks_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / "live"
            folder.mkdir()
            private = root / "private.jpg"
            private.write_bytes(b"private")
            alias = folder / "test.jpg"
            try:
                alias.symlink_to(private)
            except OSError:
                self.skipTest("symlink not supported")
            self.assertEqual(diag.aggregate(root)["perClass"]["live"]["trials"], 0)

    def test_bad_decodes_are_inconclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "bad.jpg"
            image.write_bytes(b"not-a-jpeg")
            self.assertEqual(diag.diagnose_local_file(image), "file_unreadable")


if __name__ == "__main__":
    unittest.main()
