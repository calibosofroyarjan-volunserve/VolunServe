"""No-camera tests: easy green selfie framing is NOT liveness or ID matching."""
import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import cv2
import numpy as np

import pad_frame_guidance_local as framing
import pad_webcam_preview_tk_local as gui_preview
import start_pad_laptop_gui as launcher


class FakeCamera:
    def __init__(self):
        self.released = False
    def isOpened(self):
        return True
    def release(self):
        self.released = True


class EasyGreenSelfieTests(unittest.TestCase):
    def setUp(self):
        self.frame = np.full((720, 1280, 3), 120, dtype=np.uint8)

    def test_regular_webcam_face_is_green_even_when_v1se_4x_does_not_fit(self):
        # Camera from previous pilot: face visible at normal seating distance,
        # but V1SE's 4x context is off-frame (not necessary for ID selfie).
        bbox = (490, 210, 230, 260)
        normal = framing.analyze_selfie_preview(
            self.frame, detect_box=lambda image: bbox)
        strict = framing.analyze_framing(
            self.frame, detect_box=lambda image: bbox, context_scale=4.0)
        self.assertEqual(normal.code, "face_visible")
        self.assertIsNone(normal.context_rect)
        self.assertFalse(normal.capture_ready)
        self.assertFalse(strict.capture_ready)
        self.assertEqual(normal.face_rect, bbox)
        self.assertIn("NOT", framing.HELP["face_visible"])

    def test_visual_box_is_green_but_still_cannot_authenticate_anyone(self):
        state = framing.analyze_selfie_preview(
            self.frame, detect_box=lambda image: (490, 210, 230, 260))
        overlay = framing.draw_guidance(self.frame, state)
        self.assertEqual(overlay.dtype, np.uint8)
        self.assertEqual(overlay.shape[2], 3)
        self.assertFalse(state.capture_ready)
        self.assertEqual(state.code, "face_visible")
        self.assertIn("NOT ID MATCH", __import__("inspect").getsource(framing.draw_guidance))
        self.assertNotIn("identityVerified", state.__dict__)
        self.assertNotIn("livenessVerified", state.__dict__)

    def test_no_face_multiple_face_and_tiny_truncated_faces_never_green(self):
        for inspection, expected in (
            ("no_face", "no_face"),
            ("multiple_faces", "multiple_faces"),
            ("unavailable", "detector_unavailable"),
        ):
            guide = framing.analyze_selfie_preview(
                self.frame, detect_box=lambda image: None,
                inspect=lambda image: inspection)
            self.assertEqual(guide.code, expected)
        for box in [(0, 90, 230, 260), (490, 210, 20, 30),
                    (1150, 260, 230, 250)]:
            guide = framing.analyze_selfie_preview(
                self.frame, detect_box=lambda image, box=box: box)
            self.assertEqual(guide.code, "adjust_selfie")
            self.assertFalse(guide.capture_ready)

    def test_bad_camera_frame_cannot_turn_green(self):
        for frame in [None, np.zeros((50, 50, 3), np.uint8),
                      np.zeros((720, 1280, 3), np.float32)]:
            state = framing.analyze_selfie_preview(
                frame, detect_box=lambda _: (490, 210, 230, 260))
            self.assertEqual(state.code, "camera_unavailable")

    def test_easy_preview_forces_no_capture_and_does_not_change_pad_modes(self):
        easy = gui_preview.GuidedPadWebcamUI(
            object(), trials_per_class=1, frames_per_trial=3,
            id_selfie_preview=True)
        self.assertTrue(easy.preview_only)
        self.assertIs(easy.framing, framing.analyze_selfie_preview)
        self.assertFalse(easy.four_hypothesis)
        ordinary = gui_preview.GuidedPadWebcamUI(
            object(), trials_per_class=1, frames_per_trial=3)
        self.assertNotEqual(ordinary.framing, framing.analyze_selfie_preview)
        self.assertEqual(ordinary.framing.keywords["context_scale"], 2.7)
        combined = gui_preview.GuidedPadWebcamUI(
            object(), trials_per_class=1, frames_per_trial=3,
            four_hypothesis=True)
        self.assertEqual(combined.framing.keywords["context_scale"], 4.0)
        with self.assertRaisesRegex(ValueError, "NOT_PAD"):
            gui_preview.GuidedPadWebcamUI(
                object(), trials_per_class=1, frames_per_trial=3,
                four_hypothesis=True, id_selfie_preview=True)

    def test_selfie_preview_starts_only_after_consent_and_never_runs_pad(self):
        settings = {"accepted": True, "camera": 0, "trials": 1,
                    "mode": "id_selfie_preview"}
        fake_camera = FakeCamera()
        output = io.StringIO()
        with patch.object(launcher.sys, "platform", "win32"), \
             patch.object(launcher, "ask_user_settings",
                          return_value=settings), \
             patch.object(launcher, "dependencies_present",
                          return_value=True), \
             patch.object(launcher, "yunet_present", return_value=True), \
             patch.object(cv2, "VideoCapture", return_value=fake_camera), \
             patch("pad_camera_quality_local.request_supported_resolution"), \
             patch("pad_webcam_preview_tk_local.launch_webcam_preview") as shown, \
             patch("run_pad_webcam_trials_local.run_cli",
                   side_effect=AssertionError("PAD should not run")), \
             redirect_stdout(output):
            self.assertEqual(launcher.main(), 0)
        self.assertTrue(fake_camera.released)
        self.assertTrue(shown.call_args.kwargs["id_selfie_preview"])
        self.assertTrue(shown.call_args.kwargs["preview_only"])
        self.assertIn("No face matched", output.getvalue())
        self.assertNotIn("identity approved", output.getvalue().lower())

    def test_easy_preview_only_downloads_yunet_with_explicit_permission(self):
        with self.assertRaises(PermissionError):
            launcher.setup_selfie_preview(approved=False)
        calls = []
        with patch.object(launcher, "dependencies_present", return_value=True), \
             patch.object(launcher, "yunet_present",
                          side_effect=[False, True]):
            launcher.setup_selfie_preview(
                approved=True, runner=lambda args, **kwargs: calls.append(args))
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0][-1].endswith("download_yunet_model.py"))
        self.assertFalse(any("minifasnet" in " ".join(args).lower()
                             for args in calls))


if __name__ == "__main__":
    unittest.main()
