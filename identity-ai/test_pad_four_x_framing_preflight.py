"""Synthetic-only audit of 4x V1SE framing and identical face box across models.

The previously deployed Windows GUI accepted 2.7x-ready frames in the
V2+V1SE study. V1SE needs 4.0x, so its model sometimes never saw a crop.
No real webcam, people, face data, network or model weights required here.
"""
from functools import partial
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import evaluate_pad_ensemble_local as ensemble
import pad_frame_guidance_local as framing
import pad_webcam_preview_tk_local as preview


LIVE = "model_prefers_live_unvalidated"
UNKNOWN = "inconclusive"


class FakeNet:
    def __init__(self):
        self.inputs = []

    def setInput(self, blob):
        self.inputs.append(np.array(blob, copy=True))

    def forward(self):
        return np.array([[0.0, 9.0, 0.0]], dtype=np.float32)


class FourXContextTests(unittest.TestCase):
    def setUp(self):
        self.frame = np.full((720, 1280, 3), 100, dtype=np.uint8)
        self.frame[:, :, 0] = np.arange(1280, dtype=np.uint16)[None, :] % 255
        self.frame[:, :, 1] = np.arange(720, dtype=np.uint16)[:, None] % 255

    def test_old_v2_framing_was_ready_even_when_v1se_4x_crop_did_not_fit(self):
        # Realistic webcam geometry: 2.7x vertical face context fits,
        # while 4x reaches above the camera's top edge.
        face_box = (520, 160, 150, 150)
        detect = lambda _frame: face_box
        inspect = lambda _frame: "one_face_unvalidated"
        v2 = framing.analyze_framing(
            self.frame, detect_box=detect, inspect=inspect,
            context_scale=2.7)
        v1se = framing.analyze_framing(
            self.frame, detect_box=detect, inspect=inspect,
            context_scale=4.0)
        self.assertTrue(v2.capture_ready)
        self.assertIsNotNone(v2.context_rect)
        self.assertFalse(v1se.capture_ready)
        self.assertEqual(v1se.code, "move_back_v1se")
        self.assertIsNone(v1se.context_rect)
        self.assertIn("4.0x", framing.HELP[v1se.code])
        self.assertEqual(framing.context_rect_for_face(
            face_box, self.frame.shape, scale=4.0), None)

    def test_only_four_x_ready_after_full_context_is_visible(self):
        box = (520, 250, 100, 100)
        guide = framing.analyze_framing(
            self.frame, detect_box=lambda _: box, context_scale=4.0)
        self.assertTrue(guide.capture_ready)
        x1, y1, x2, y2 = guide.context_rect
        self.assertEqual((x2 - x1, y2 - y1), (400, 400))
        self.assertEqual(framing.context_rect_for_face(
            box, self.frame.shape, scale=2.7)[2] -
            framing.context_rect_for_face(
                box, self.frame.shape, scale=2.7)[0], 270)

    def test_invalid_scale_is_rejected_and_does_not_enable_camera(self):
        box = (520, 250, 100, 100)
        self.assertIsNone(framing.context_rect_for_face(
            box, self.frame.shape, scale=1.0))
        self.assertFalse(framing.analyze_framing(
            self.frame, detect_box=lambda _: box, context_scale=1.0
        ).capture_ready)

    def test_combined_gui_uses_4x_framing_but_existing_v2_only_stays_27x(self):
        combined = preview.GuidedPadWebcamUI(
            object(), trials_per_class=1, frames_per_trial=1,
            four_hypothesis=True)
        legacy = preview.GuidedPadWebcamUI(
            object(), trials_per_class=1, frames_per_trial=1,
            four_hypothesis=False)
        self.assertIsInstance(combined.framing, partial)
        self.assertEqual(combined.framing.keywords["context_scale"], 4.0)
        self.assertEqual(legacy.framing.keywords["context_scale"], 2.7)
        # Preview setup is pure until .launch(); no real camera opened.

    def test_one_displayed_bbox_feeds_both_models_without_re_detecting(self):
        face_box = (520, 250, 100, 100)
        net = FakeNet()
        crops = []
        def check_v2(_frame, *, cropper):
            crop = cropper(_frame)
            crops.append(crop)
            return LIVE, LIVE
        with patch.object(ensemble.scales, "assess_paired_frame",
                          side_effect=check_v2), \\
             patch.object(ensemble.v1, "_load_net", return_value=net), \\
             patch.object(ensemble.v1, "_face_crop_4x",
                          side_effect=AssertionError("unexpected re-detection")):
            result = ensemble.assess_four_hypotheses(
                self.frame, face_box=face_box)
        self.assertEqual(result, (LIVE, LIVE, LIVE, LIVE))
        self.assertEqual(len(crops), 1)
        v2_box = framing.context_rect_for_face(
            face_box, self.frame.shape, scale=2.7)
        v1_box = framing.context_rect_for_face(
            face_box, self.frame.shape, scale=4.0)
        v2_expected = cv2.resize(
            self.frame[v2_box[1]:v2_box[3], v2_box[0]:v2_box[2]],
            (80, 80), interpolation=cv2.INTER_LINEAR)
        v1_expected = cv2.resize(
            self.frame[v1_box[1]:v1_box[3], v1_box[0]:v1_box[2]],
            (80, 80), interpolation=cv2.INTER_LINEAR)
        np.testing.assert_array_equal(crops[0], v2_expected)
        self.assertEqual(len(net.inputs), 2)
        np.testing.assert_allclose(
            net.inputs[0][0], v1_expected.transpose(2, 0, 1).astype(
                np.float32), rtol=1e-6, atol=1e-5)
        np.testing.assert_allclose(
            net.inputs[0], net.inputs[1] * 255, rtol=1e-6, atol=1e-5)

    def test_4x_invalid_context_never_fabricates_v1se_live(self):
        net = FakeNet()
        face_box = (520, 160, 150, 150)  # 2.7x fits, 4.0x fails
        result = ensemble.assess_four_hypotheses(
            self.frame, face_box=face_box,
            v2_assessor=lambda _: (LIVE, LIVE), v1_net=net)
        self.assertEqual(result, (LIVE, LIVE, UNKNOWN, UNKNOWN))
        self.assertEqual(net.inputs, [])
        self.assertEqual(
            ensemble.combine_one_presentation([result])["ensemble"],
            "inconclusive")


if __name__ == "__main__":
    unittest.main()
