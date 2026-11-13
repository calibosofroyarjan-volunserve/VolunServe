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
    def __init__(self, face_count=1, retval=1):
        self.face_count = face_count
        self.retval = retval
        self.sizes = []

    def setInputSize(self, size):
        self.sizes.append(size)

    def detect(self, _frame):
        row = np.array(
            [80, 60, 100, 110, 100, 90, 150, 90, 125, 115,
             110, 145, 145, 145, .99], dtype=np.float32
        )
        if self.face_count == 0:
            return self.retval, None
        return self.retval, np.repeat(row[np.newaxis, :], self.face_count, axis=0)


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

    def test_camera_size_changes_are_applied_before_each_detection(self):
        matcher = FakeMatcher()
        detector = FakeDetector()
        different_size_selfie = np.full((520, 640, 3), 127, np.uint8)
        with patch.object(sface, "_load_matcher", return_value=matcher), \
             patch.object(sface.yunet_shadow, "_load_detector", return_value=detector):
            output = sface.assess_pair_shadow(self.first, different_size_selfie)
        self.assertEqual(output["status"], "similarity_observed_unvalidated")
        self.assertEqual(detector.sizes, [(400, 320), (640, 520)])
        self.assertEqual(matcher.calls, 1)

    def test_detector_failure_cannot_use_stale_face_coordinates(self):
        matcher = FakeMatcher()
        with patch.object(sface, "_load_matcher", return_value=matcher), \
             patch.object(sface.yunet_shadow, "_load_detector",
                          return_value=FakeDetector(retval=0)):
            result = sface.assess_pair_shadow(self.first, self.second)
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(matcher.calls, 0)

    def test_embedding_integrity_blocks_invalid_model_outputs(self):
        for feature in (
            None,
            np.zeros((1, 128), dtype=np.float32),
            np.full((1, 128), np.nan, dtype=np.float32),
            np.full((1, 128), np.inf, dtype=np.float32),
            np.ones((2, 128), dtype=np.float32),
            np.ones((1, 1), dtype=np.float32),
            np.ones((1, 4097), dtype=np.float32),
            np.array([[1, 2]], dtype=object),
        ):
            with self.subTest(feature_type=str(getattr(feature, "shape", None))):
                matcher = FakeMatcher()
                matcher.feature = lambda _aligned, output=feature: output
                with patch.object(sface, "_load_matcher", return_value=matcher), \
                     patch.object(sface.yunet_shadow, "_load_detector",
                                  return_value=FakeDetector()):
                    result = sface.assess_pair_shadow(self.first, self.second)
                self.assertEqual(result["status"], "inconclusive")
                self.assertNotIn("cosineSimilarity", result)
                self.assertEqual(matcher.calls, 0)

    def test_invalid_aligned_crops_cannot_yield_similarity(self):
        for crop in (
            None,
            np.ones((112, 112), dtype=np.uint8),
            np.ones((112, 112, 3), dtype=np.float32),
            np.ones((12, 12, 3), dtype=np.uint8),
            np.ones((112, 112, 4), dtype=np.uint8),
        ):
            with self.subTest(alignment=str(getattr(crop, "shape", None))):
                matcher = FakeMatcher()
                matcher.alignCrop = lambda _image, _face, output=crop: output
                with patch.object(sface, "_load_matcher", return_value=matcher), \
                     patch.object(sface.yunet_shadow, "_load_detector",
                                  return_value=FakeDetector()):
                    result = sface.assess_pair_shadow(self.first, self.second)
                self.assertEqual(result["status"], "inconclusive")
                self.assertEqual(matcher.calls, 0)

    def test_finite_negative_or_tiny_embedding_remains_valid_api_output(self):
        # Integrity checks do not claim any calibrated ID match. A nonzero
        # signed embedding may be valid; a score is still shadow-only.
        self.assertTrue(sface._valid_embedding(
            np.array([[-1.0, 0.0, 0.5]], dtype=np.float32)))
        self.assertFalse(sface._valid_embedding(
            np.array([[1e-12, 0.0]], dtype=np.float32)))

    def test_qa_stage_distinguishes_id_portrait_from_selfie_failure(self):
        with patch.object(sface, "_load_matcher", return_value=FakeMatcher()), \
             patch.object(sface, "_single_face_row") as detect:
            detect.return_value = None
            id_issue = sface.assess_pair_shadow(self.first, self.second)
            self.assertEqual(id_issue["status"], "inconclusive")
            self.assertEqual(id_issue["qaStage"], "id_face_not_detected")
            self.assertEqual(detect.call_count, 1)

            detect.reset_mock()
            valid_face = FakeDetector().detect(self.first)[1][0]
            detect.side_effect = [valid_face, None]
            selfie_issue = sface.assess_pair_shadow(self.first, self.second)
            self.assertEqual(selfie_issue["status"], "inconclusive")
            self.assertEqual(selfie_issue["qaStage"], "selfie_face_not_detected")
            self.assertEqual(detect.call_count, 2)

    def test_qa_stage_identifies_alignment_and_embedding_failures_without_score(self):
        valid_face = FakeDetector().detect(self.first)[1][0]
        valid_crop = np.zeros((112, 112, 3), dtype=np.uint8)
        valid_feature = np.asarray([[1.0, 0.0]], dtype=np.float32)
        with patch.object(sface, "_single_face_row", return_value=valid_face):
            for alignment, expected in (
                ([None], "id_alignment_invalid"),
                ([valid_crop, None], "selfie_alignment_invalid"),
            ):
                with self.subTest(stage=expected):
                    matcher = FakeMatcher()
                    matcher.alignCrop = unittest.mock.Mock(side_effect=alignment)
                    with patch.object(sface, "_load_matcher", return_value=matcher):
                        result = sface.assess_pair_shadow(self.first, self.second)
                    self.assertEqual(result["qaStage"], expected)
                    self.assertNotIn("cosineSimilarity", result)
                    self.assertEqual(matcher.calls, 0)
            for feature, expected in (
                ([None], "id_embedding_invalid"),
                ([valid_feature, np.zeros((1, 2), np.float32)],
                 "selfie_embedding_invalid"),
            ):
                with self.subTest(stage=expected):
                    matcher = FakeMatcher()
                    matcher.feature = unittest.mock.Mock(side_effect=feature)
                    with patch.object(sface, "_load_matcher", return_value=matcher):
                        result = sface.assess_pair_shadow(self.first, self.second)
                    self.assertEqual(result["qaStage"], expected)
                    self.assertNotIn("cosineSimilarity", result)
                    self.assertEqual(matcher.calls, 0)

    def test_qa_stage_has_no_personal_or_biometric_data(self):
        with patch.object(sface, "_load_matcher", return_value=FakeMatcher()), \
             patch.object(sface.yunet_shadow, "_load_detector",
                          return_value=FakeDetector(0)):
            result = sface.assess_pair_shadow(self.first, self.second)
        self.assertEqual(set(result), {
            "status", "qaStage", "identityDecisionUse",
            "independentFaceMatchValidated", "independentPadValidated",
        })
        self.assertEqual(result["qaStage"], "id_face_not_detected")
        self.assertFalse(result["independentFaceMatchValidated"])
        self.assertFalse(result["independentPadValidated"])
        self.assertEqual(result["identityDecisionUse"], "none")

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
