"""Synthetic-only YuNet shadow detector tests. No actual face samples or network."""
import unittest
from unittest.mock import patch
import numpy as np
import yunet_shadow as yunet


class FakeDetector:
    def __init__(self, faces=None):
        self.faces = faces
        self.input_size = None
    def setInputSize(self, size):
        self.input_size = size
    def detect(self, _image):
        return 1, self.faces


class YuNetShadowTests(unittest.TestCase):
    def setUp(self):
        self.frame = np.zeros((360, 480, 3), dtype=np.uint8)

    def test_one_face_is_only_a_shadow_observation(self):
        fake = FakeDetector(np.zeros((1, 15), dtype=np.float32))
        with patch.object(yunet, "_load_detector", return_value=fake):
            self.assertEqual(yunet.inspect_frame(self.frame), "one_face_unvalidated")
        self.assertEqual(fake.input_size, (480, 360))

    def test_none_or_multiple_faces_never_are_liveness_evidence(self):
        for faces, expected in [
            (None, "no_face"),
            (np.zeros((3, 15), dtype=np.float32), "multiple_faces"),
        ]:
            with patch.object(yunet, "_load_detector", return_value=FakeDetector(faces)):
                self.assertEqual(yunet.inspect_frame(self.frame), expected)

    def test_bad_image_and_missing_model_fail_closed(self):
        with patch.object(yunet, "_load_detector", return_value=None):
            self.assertEqual(yunet.inspect_frame(self.frame), "unavailable")
        with patch.object(yunet, "_load_detector", return_value=FakeDetector()):
            self.assertEqual(yunet.inspect_frame(np.zeros((3, 10), np.uint8)), "inconclusive")

    def test_readiness_never_claims_pad_or_identity_approval(self):
        with patch.object(yunet, "_load_detector", return_value=FakeDetector()):
            status = yunet.readiness()
        self.assertTrue(status["modelLoaded"])
        self.assertFalse(status["independentPadValidated"])
        self.assertEqual(status["identityDecisionUse"], "none")

    def test_digest_is_pinned_and_model_stays_out_of_repository(self):
        self.assertEqual(len(yunet.MODEL_SHA256), 64)
        from pathlib import Path
        ignore = Path(".gitignore").read_text(encoding="utf8")
        self.assertIn("/identity-ai/models/", ignore)


if __name__ == "__main__":
    unittest.main()
