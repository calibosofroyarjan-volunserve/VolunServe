"""Synthetic tests for no-model camera-only preview. Never opens a webcam."""
import inspect
import unittest
from unittest.mock import Mock, patch

import cv2
import numpy as np

import pad_camera_clarity_preview_local as clarity
import start_pad_laptop_gui as launcher


class CameraOnlyTests(unittest.TestCase):
    def test_camera_only_shows_native_size_and_never_upscales(self):
        low = np.full((480, 640, 3), 86, dtype=np.uint8)
        self.assertIs(clarity.fit_camera_preview(low), low)
        frame = np.random.default_rng(7).integers(
            0, 256, size=(720, 1280, 3), dtype=np.uint8)
        copy = frame.copy()
        display = clarity.fit_camera_preview(frame)
        self.assertLessEqual(display.shape[1], clarity.MAX_DISPLAY_W)
        self.assertLessEqual(display.shape[0], clarity.MAX_DISPLAY_H)
        np.testing.assert_array_equal(copy, frame)

    def test_camera_only_is_independent_of_pad_models_and_no_network(self):
        code = inspect.getsource(clarity)
        self.assertIn("No face analysis", code)
        self.assertNotIn("passive_pad_shadow", code)
        self.assertNotIn("evaluate_pad_scales_local", code)
        self.assertNotIn("yunet_shadow", code)
        for forbidden in ("cv2.imwrite(", "cv2.VideoWriter(", "requests.post(",
                          "firebase", "uploadBytes", "toBlob(", "setInput(",
                          "face_recognition", "verifyIdentity("):
            self.assertNotIn(forbidden, code)

    def test_camera_is_released_after_normal_preview_or_exception(self):
        camera = Mock()
        camera.isOpened.return_value = True
        with patch.object(clarity.cv2, "VideoCapture", return_value=camera), \
             patch.object(clarity, "launch_camera_clarity_preview") as gui, \
             patch.object(clarity, "request_supported_resolution") as req:
            self.assertIsNone(clarity.open_camera_clarity(0))
            gui.assert_called_once_with(camera)
            req.assert_called_once_with(camera)
        camera.release.assert_called_once()

        camera = Mock()
        camera.isOpened.return_value = True
        with patch.object(clarity.cv2, "VideoCapture", return_value=camera), \
             patch.object(clarity, "launch_camera_clarity_preview",
                          side_effect=RuntimeError("camera preview error")):
            with self.assertRaises(RuntimeError):
                clarity.open_camera_clarity(0)
        camera.release.assert_called_once()

    def test_invalid_camera_index_never_accesses_device(self):
        for index in (-1, 4, "0", True):
            with patch.object(clarity.cv2, "VideoCapture",
                              side_effect=AssertionError("must not access")):
                with self.assertRaisesRegex(ValueError, "INVALID_CAMERA_INDEX"):
                    clarity.open_camera_clarity(index)

    def test_camera_only_requires_prior_gui_consent_and_skips_pad_download(self):
        accepted = {"accepted": True, "mode": "camera_only", "camera": 0}
        with patch.object(launcher.sys, "platform", "win32"), \
             patch.object(launcher, "ask_user_settings", return_value=accepted), \
             patch.object(launcher, "dependencies_present", return_value=True), \
             patch.object(launcher, "setup_required",
                          side_effect=AssertionError("no PAD models")), \
             patch.object(launcher, "models_present",
                          side_effect=AssertionError("no pinned model checks")), \
             patch.object(launcher, "pilot_args",
                          side_effect=AssertionError("no PAD args")), \
             patch.object(launcher, "run_camera_only", return_value=0) as run:
            self.assertEqual(launcher.main(), 0)
            run.assert_called_once_with(0)

        with patch.object(launcher.sys, "platform", "win32"), \
             patch.object(launcher, "ask_user_settings",
                          return_value={"accepted": False}), \
             patch.object(launcher, "run_camera_only",
                          side_effect=AssertionError("no consent")):
            self.assertEqual(launcher.main(), 0)

    def test_camera_only_package_install_requires_separate_approval(self):
        calls = []
        with self.assertRaises(PermissionError):
            launcher.install_camera_prerequisites(
                approved=False, runner=lambda *args, **kw: calls.append(args))
        self.assertEqual(calls, [])
        with patch.object(launcher, "dependencies_present", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "dependencies unavailable"):
                launcher.install_camera_prerequisites(
                    approved=True, runner=lambda args, **kw: calls.append(args))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:4],
                         [launcher.sys.executable, "-m", "pip", "install"])
        self.assertTrue(all("download_" not in str(item) for item in calls[0]))


if __name__ == "__main__":
    unittest.main()
