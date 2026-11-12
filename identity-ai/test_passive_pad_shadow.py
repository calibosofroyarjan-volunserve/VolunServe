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

    def setInput(self, blob):
        self.last_input = blob

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


    def test_crop_matches_upstream_2p7_independent_bbox_dimensions(self):
        """A rectangular face must NOT be overcropped into a square ROI."""
        # Original MiniVisionAI expands the bbox width and height separately.
        # Previous implementation used max(w,h) for both dimensions.
        with patch.object(pad, "single_face_box", return_value=(200, 150, 80, 50)), \
             patch.object(pad.cv2, "resize",
                          return_value=np.zeros((80, 80, 3), dtype=np.uint8)) as resize:
            crop = pad._face_crop(np.zeros((480, 640, 3), dtype=np.uint8))
        self.assertEqual(crop.shape, (80, 80, 3))
        source_roi = resize.call_args.args[0]
        self.assertGreater(source_roi.shape[1], source_roi.shape[0])
        self.assertEqual(source_roi.shape[1], 216)
        self.assertTrue(130 <= source_roi.shape[0] <= 136)

    def test_preprocessing_is_bgr_nchw_scaled_0_to_1(self):
        """Original source uses BGR tensor values divided by 255."""
        photo = np.zeros((480, 640, 3), dtype=np.uint8)
        photo[:, :, 0] = 10  # Blue
        photo[:, :, 1] = 80  # Green
        photo[:, :, 2] = 240  # Red (not swapped)
        with patch.object(pad, "single_face_box", return_value=(260, 180, 60, 60)):
            observation = pad.assess_frame_shadow(photo)
        self.assertIn(observation["status"], (
            "model_prefers_live_unvalidated", "model_prefers_attack_unvalidated",
            "inconclusive"))
        blob = self.net.last_input
        self.assertIsNotNone(blob)
        self.assertEqual(blob.shape, (1, 3, 80, 80))
        self.assertAlmostEqual(float(blob[0, 0, 20, 20]), 10 / 255, places=5)
        self.assertAlmostEqual(float(blob[0, 1, 20, 20]), 80 / 255, places=5)
        self.assertAlmostEqual(float(blob[0, 2, 20, 20]), 240 / 255, places=5)

    def test_rectangular_context_can_fit_without_square_overcrop(self):
        image = np.zeros((480, 640, 3), dtype=np.uint8)
        # A 150 x 50 face with enough vertical rectangular context; an
        # artificial 405x405 square fails because it extends beyond top.
        with patch.object(pad, "single_face_box", return_value=(160, 60, 150, 50)):
            crop = pad._face_crop(image)
        self.assertEqual(crop.shape, (80, 80, 3))

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
