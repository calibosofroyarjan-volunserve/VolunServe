"""Synthetic-only shadow PAD tests; no resident media or trained model required."""
import os
import unittest
from unittest.mock import patch

import cv2
import numpy as np
import passive_pad_shadow as pad


class FakeNet:
    def __init__(self, values):
        self.values = values
        self.last_input = None
        self.blobs = []

    def setInput(self, blob):
        self.last_input = blob
        self.blobs.append(np.array(blob, copy=True))

    def forward(self):
        return np.array([self.values], dtype=np.float32)


class PassivePadShadowTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"VOLUNSERVE_PASSIVE_PAD_SHADOW": "1"})
        self.env.start()
        self.net = FakeNet([0, 6, 0])
        self.model = patch.object(pad, "_load_net", return_value=self.net)
        self.model.start()
        self.image = np.full((400, 400, 3), 128, dtype=np.uint8)

    def tearDown(self):
        self.model.stop()
        self.env.stop()

    def evaluate(self, faces, logits):
        self.net.values = logits
        box = faces[0] if len(faces) == 1 else None
        with patch.object(pad, "single_face_box", return_value=box):
            return pad.assess_frame_shadow(self.image)

    def test_live_like_output_is_not_identity_approval(self):
        result = self.evaluate([(165, 165, 70, 70)], [0, 7, 0])
        self.assertEqual(result["status"], "model_prefers_live_unvalidated")
        self.assertFalse(result["independentPadValidated"])
        self.assertFalse("verified" in result)

    def test_attack_like_output_is_not_certified_pad(self):
        for logits in ([7, 0, 0], [0, 0, 7]):
            result = self.evaluate([(165, 165, 70, 70)], logits)
            self.assertEqual(result["status"], "model_prefers_attack_unvalidated")
            self.assertFalse(result["independentPadValidated"])

    def test_upstream_class_zero_is_attack_not_live(self):
        """Regression: MiniVisionAI test.py defines only class 1 as live."""
        self.assertEqual(self.evaluate([(165, 165, 70, 70)], [9, 1, 0])["status"],
                         "model_prefers_attack_unvalidated")
        self.assertEqual(self.evaluate([(165, 165, 70, 70)], [0, 9, 1])["status"],
                         "model_prefers_live_unvalidated")

    def test_uncertain_or_invalid_predictions_are_inconclusive(self):
        for logits in ([0, 0, 0], [float("nan"), 1, 0]):
            self.assertEqual(self.evaluate([(165, 165, 70, 70)], logits)["status"],
                             "inconclusive")

    def test_no_face_multiple_faces_and_missing_context_are_inconclusive(self):
        for faces in ([], [(70, 70, 50, 50), (180, 180, 55, 55)],
                      [(0, 0, 70, 70)]):
            self.assertEqual(self.evaluate(faces, [0, 6, 0])["status"], "inconclusive")

    def test_yunet_boundary_is_required_for_any_shadow_inference(self):
        with patch.object(pad, "single_face_box", return_value=None):
            result = pad.assess_frame_shadow(self.image)
        self.assertEqual(result["status"], "inconclusive")
        self.assertFalse(result["independentPadValidated"])
        self.assertIsNone(self.net.last_input,
                          "No frame must reach the classifier when YuNet fails")


    def test_rectangular_face_roi_matches_upstream_separate_width_and_height(self):
        """A genuine landscape bbox should not be expanded into square background."""
        image = np.zeros((480, 640, 3), dtype=np.uint8)
        with patch.object(pad, "single_face_box", return_value=(160, 60, 150, 50)), \
             patch.object(pad.cv2, "resize",
                          return_value=np.zeros((80, 80, 3), dtype=np.uint8)) as resize:
            crop = pad._face_crop(image)
        self.assertEqual(crop.shape, (80, 80, 3))
        raw_roi = resize.call_args.args[0]
        # 150*2.7=405 and 50*2.7=135. Previously an oversized
        # 405x405 square left the frame and returned inconclusive.
        # Python's bankers rounding can vary each edge by one pixel.
        self.assertTrue(134 <= raw_roi.shape[0] <= 136)
        self.assertTrue(404 <= raw_roi.shape[1] <= 406)
        self.assertGreater(raw_roi.shape[1], raw_roi.shape[0])

    def test_untrusted_frame_dtype_and_near_edge_face_fail_closed(self):
        with patch.object(pad, "single_face_box",
                          side_effect=AssertionError("invalid image reached detector")):
            bad = np.ones((480, 640, 3), dtype=np.float32)
            self.assertIsNone(pad._face_crop(bad))
        with patch.object(pad, "single_face_box", return_value=(0, 0, 120, 55)):
            self.assertIsNone(pad._face_crop(np.zeros((480, 640, 3), dtype=np.uint8)))

    def test_same_crop_has_raw_upstream_and_normalized_hypotheses(self):
        photo = np.zeros((480, 640, 3), dtype=np.uint8)
        photo[:, :, 0] = 10
        photo[:, :, 1] = 80
        photo[:, :, 2] = 240
        with patch.object(pad, "single_face_box", return_value=(260, 180, 60, 60)):
            output = pad.assess_frame_shadow(photo)
        self.assertFalse(output["independentPadValidated"])
        self.assertEqual(output["identityDecisionUse"], "none")
        self.assertTrue(output["scaleHypothesesAgree"])
        self.assertEqual(len(self.net.blobs), 2)
        raw, normalized = self.net.blobs
        self.assertEqual(raw.shape, (1, 3, 80, 80))
        np.testing.assert_allclose(raw, normalized * 255, atol=1e-5, rtol=1e-6)
        self.assertAlmostEqual(float(raw[0, 0, 20, 20]), 10, places=5)
        self.assertAlmostEqual(float(raw[0, 1, 20, 20]), 80, places=5)
        self.assertAlmostEqual(float(raw[0, 2, 20, 20]), 240, places=5)

    def test_conflicting_scale_labels_abstain_even_if_raw_calls_live(self):
        class ScaleSensitiveModel:
            def __init__(self):
                self.blobs = []
            def setInput(self, data):
                self.current = np.asarray(data)
                self.blobs.append(np.array(data, copy=True))
            def forward(self):
                if self.current.max() >= 2:
                    return np.array([[0.0, 8.0, 0.0]], dtype=np.float32)
                return np.array([[8.0, 0.0, 0.0]], dtype=np.float32)

        model = ScaleSensitiveModel()
        self.model.stop()
        with patch.object(pad, "_load_net", return_value=model), \\
             patch.object(pad, "single_face_box", return_value=(165, 165, 70, 70)):
            report = pad.assess_frame_shadow(self.image)
        self.model.start()
        self.assertEqual(report["status"], "inconclusive")
        self.assertFalse(report["scaleHypothesesAgree"])
        self.assertFalse(report["independentPadValidated"])
        self.assertEqual(report["identityDecisionUse"], "none")
        self.assertEqual(len(model.blobs), 2)

    def test_invalid_secondary_model_output_cannot_inherit_raw_live(self):
        class InvalidSecondPass:
            def setInput(self, blob):
                self.max_value = np.asarray(blob).max()
            def forward(self):
                return (np.array([[0.0, 7.0, 0.0]], dtype=np.float32)
                        if self.max_value >= 2 else
                        np.array([[float("nan"), 0.0, 0.0]], dtype=np.float32))
        crop = np.full((80, 80, 3), 128, dtype=np.uint8)
        self.assertEqual(pad._two_scale_shadow(crop, InvalidSecondPass()),
                         ("inconclusive", False))

    def test_invalid_crop_avoids_any_model_calls(self):
        with patch.object(self.net, "setInput",
                          side_effect=AssertionError("invalid crop reached model")):
            self.assertEqual(pad._two_scale_shadow(None, self.net),
                             ("inconclusive", False))
            self.assertEqual(pad._two_scale_shadow(
                np.zeros((80, 80, 3), dtype=np.float32), self.net),
                ("inconclusive", False))

    def test_readiness_does_not_claim_label_or_input_scale_validated(self):
        report = pad.readiness()
        for key in ("independentPadValidated", "modelClassMappingValidated",
                    "modelInputScaleValidated", "thresholdCalibrated"):
            self.assertFalse(report[key])
        self.assertEqual(report["identityDecisionUse"], "none")

    def test_conflicting_model_probabilities_are_not_certified(self):
        for logits in ([5, 0, 0], [0, 5, 0], [0, 0, 5],
                       [0, 0, 0], [float("inf"), 0, 0]):
            with self.subTest(logits=logits):
                result = self.evaluate([(165, 165, 70, 70)], logits)
                self.assertFalse(result["independentPadValidated"])
                self.assertNotIn("identityVerified", result)
                self.assertNotIn("livenessVerified", result)
                self.assertIn(result["status"], (
                    "model_prefers_live_unvalidated",
                    "model_prefers_attack_unvalidated", "inconclusive"))

    def test_no_model_returns_unavailable_without_crashing(self):
        self.model.stop()
        with patch.object(pad, "_load_net", return_value=None):
            result = pad.assess_frame_shadow(self.image)
        self.model.start()
        self.assertEqual(result["status"], "unavailable")
        self.assertFalse(result["independentPadValidated"])

    def test_disabled_mode_never_loads_model(self):
        self.model.stop()
        with patch.dict(os.environ, {"VOLUNSERVE_PASSIVE_PAD_SHADOW": "0"}), \
             patch.object(pad, "_load_net", side_effect=AssertionError("loaded")):
            self.assertEqual(pad.assess_frame_shadow(self.image)["status"], "disabled")
        self.model.start()

    def test_untrusted_model_no_status_claims_certification(self):
        result = pad.readiness()
        self.assertFalse(result["independentPadValidated"])
        self.assertEqual(result["identityDecisionUse"], "none")


if __name__ == "__main__":
    unittest.main()
