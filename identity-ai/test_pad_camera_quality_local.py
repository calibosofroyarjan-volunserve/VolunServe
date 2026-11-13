"""Headless/synthetic local webcam quality hints; no webcam or biometric media."""
import unittest
from unittest.mock import Mock

import cv2
import numpy as np

import pad_camera_quality_local as quality
from pad_webcam_preview_tk_local import fit_preview_only


class LocalQualityTests(unittest.TestCase):
    def test_720p_requested_without_claiming_capture_support(self):
        fake = Mock()
        quality.request_supported_resolution(fake)
        fake.set.assert_any_call(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        fake.set.assert_any_call(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.assertEqual(fake.set.call_count, 2)
        fake.get.assert_not_called()
        fake.read.assert_not_called()

    def test_unsupported_capture_driver_does_not_crash(self):
        class Unsupported:
            def set(self, *_args):
                raise AttributeError("driver does not expose resolution")
        quality.request_supported_resolution(Unsupported())

    def test_actual_frame_size_not_requested_resolution_is_reported(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        hint = quality.quality_hint(frame)
        self.assertIn("Actual camera frame: 640x480", hint)
        self.assertIn("webcam/driver below 720p", hint)
        self.assertIn("Dark image", hint)
        self.assertIn("Soft image", hint)
        self.assertNotIn("Verified", hint)

    def test_720p_detailed_frame_display_is_resized_only_in_preview(self):
        rng = np.random.default_rng(123)
        frame = rng.integers(0, 255, size=(720, 1280, 3),
                             dtype=np.uint8)
        copy = frame.copy()
        hint = quality.quality_hint(frame, (350, 120, 250, 300))
        self.assertIn("1280x720", hint)
        self.assertIn("NOT proof of liveness", hint)
        view = fit_preview_only(frame)
        self.assertLessEqual(view.shape[1], 690)
        self.assertLessEqual(view.shape[0], 450)
        self.assertEqual(frame.shape, (720, 1280, 3))
        np.testing.assert_array_equal(frame, copy)

    def test_no_upscale_or_padding_camera_frame(self):
        frame = np.ones((320, 420, 3), dtype=np.uint8)
        self.assertIs(fit_preview_only(frame), frame)

    def test_bad_frames_cannot_infer_biometric_identity(self):
        self.assertIn("unavailable", quality.quality_hint(None))
        self.assertIn("unavailable", quality.quality_hint(
            np.zeros((20, 20, 3), dtype=np.uint8)))
        self.assertNotIn("live", quality.quality_hint(
            np.zeros((480, 640, 3), dtype=np.uint8)).lower())
        frame = np.full((720, 1280, 3), 252, dtype=np.uint8)
        self.assertIn("Very bright", quality.quality_hint(frame))

    def test_rough_photo_sharpness_never_used_as_PAD_decision(self):
        source = __import__("inspect").getsource(quality.quality_hint)
        for forbidden in (
            "approved", "Verified Resident", "identityDecisionUse",
            "pad.SHADOW_THRESHOLD", "cv2.imwrite", "requests.post",
            "firebase_admin",
        ):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
