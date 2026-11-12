"""Synthetic-only SFace shadow regressions: no media, weights or network."""
import os
import unittest
from unittest.mock import patch

import numpy as np

import sface_shadow as sface


class FakeMatcher:
    def __init__(self, cosine=0.62):
        self.cosine = cosine
        self.calls = 0

    def alignCrop(self, image, face):
        assert face.shape == (15,)
        return np.zeros((112, 112, 3), dtype=np.uint8)

    def feature(self, _aligned):
        return np.asarray([[1.0, 0.0]], dtype=np.float32)

    def match(self, _first, _second, _mode):
        self.calls += 1
        return self.cosine


class FakeDetector:
    def __init__(self, face_count=1):
        self.face_count = face_count

    def setInputSize(self, _size):
        pass

    def detect(self, _frame):
        row = np.array(
            [80, 60, 100, 110, 100, 90, 150, 90, 125, 115,
             110, 145, 145, 145, .99], dtype=np.float32
        )
        if self.face_count == 0:
            return 1, None
        return 1, np.repeat(row[np.newaxis, :], self.face_count, axis=0)


class SFaceShadowTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"VOLUNSERVE_SFACE_SHADOW": "1"})
        self.env.start()
        self.first = np.zeros((320, 400, 3), dtype=np.uint8)
        self.second = np.full((320, 400, 3), 127, dtype=np.uint8)

    def tearDown(self):
        self.env.stop()

    def test_matching_observation_cannot_approve_or_certify_liveness(self):
        matcher = FakeMatcher()
        with patch.object(sface, "_load_matcher", return_value=matcher), \
             patch.object(sface.yunet_shadow, "_load_detector", return_value=FakeDetector()):
            status = sface.assess_pair_shadow(self.first, self.second)
        self.assertEqual(status["status"], "similarity_observed_unvalidated")
        self.assertEqual(status["cosineSimilarity"], 0.62)
        self.assertFalse(status["independentPadValidated"])
        self.assertFalse(status["independentFaceMatchValidated"])
        self.assertEqual(status["identityDecisionUse"], "none")
        self.assertNotIn("verified", status)
        self.assertEqual(matcher.calls, 1)

    def test_bad_images_and_ambiguous_faces_fail_closed(self):
        with patch.object(sface, "_load_matcher", return_value=FakeMatcher()):
            for detector in (FakeDetector(0), FakeDetector(2)):
                with patch.object(sface.yunet_shadow, "_load_detector", return_value=detector):
                    self.assertEqual(
                        sface.assess_pair_shadow(self.first, self.second)["status"],
                        "inconclusive",
                    )
            self.assertEqual(sface.assess_pair_shadow(self.first, self.first)["status"],
                             "inconclusive")
            self.assertEqual(sface.assess_pair_shadow(None, self.second)["status"],
                             "inconclusive")

    def test_disabled_mode_does_not_attempt_to_load_weights(self):
        with patch.dict(os.environ, {"VOLUNSERVE_SFACE_SHADOW": "0"}), \
             patch.object(sface, "_load_matcher", side_effect=AssertionError("loaded")):
            self.assertEqual(
                sface.assess_pair_shadow(self.first, self.second)["status"],
                "disabled",
            )

    def test_invalid_model_scores_are_inconclusive(self):
        with patch.object(sface, "_load_matcher", return_value=FakeMatcher(float("nan"))), \
             patch.object(sface.yunet_shadow, "_load_detector", return_value=FakeDetector()):
            result = sface.assess_pair_shadow(self.first, self.second)
        self.assertEqual(result["status"], "inconclusive")

    def test_readiness_is_not_a_validation_claim(self):
        with patch.object(sface, "_load_matcher", return_value=FakeMatcher()):
            status = sface.readiness()
        self.assertTrue(status["modelLoaded"])
        self.assertFalse(status["independentFaceMatchValidated"])
        self.assertFalse(status["independentPadValidated"])
        self.assertEqual(status["identityDecisionUse"], "none")

    def test_weights_stay_out_of_git(self):
        from pathlib import Path
        self.assertEqual(len(sface.MODEL_SHA256), 64)
        self.assertIn("/identity-ai/models/", Path(".gitignore").read_text("utf-8"))


if __name__ == "__main__":
    unittest.main()
