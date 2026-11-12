"""Synthetic-only local webcam capture tests: no physical camera, network or PII."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import capture_private_camera_qa as camera


def frame(value):
    return np.full((320, 400, 3), value, dtype=np.uint8)


class FakeCamera:
    def __init__(self):
        self.released = False
        self.reads = 0

    def isOpened(self):
        return True

    def set(self, *_args):
        return True

    def read(self):
        self.reads += 1
        return True, frame(self.reads)

    def release(self):
        self.released = True


class CapturePrivateCameraTests(unittest.TestCase):
    def test_two_face_photos_saved_only_locally_never_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "private"
            a = camera.save_frames(root, "same", [frame(17), frame(20)])
            self.assertEqual(a.name, "pair001")
            self.assertTrue((a / "first.jpg").is_file())
            self.assertTrue((a / "second.jpg").is_file())
            self.assertNotEqual((a / "first.jpg").read_bytes(),
                                (a / "second.jpg").read_bytes())
            old = (a / "first.jpg").read_bytes()
            b = camera.save_frames(root, "same", [frame(25), frame(30)])
            self.assertEqual(b.name, "pair002")
            self.assertEqual((a / "first.jpg").read_bytes(), old)

    def test_single_pad_photo_stored_per_class(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "private"
            for kind in camera.PAD_KINDS:
                first = camera.save_frames(root, kind, [frame(12)])
                second = camera.save_frames(root, kind, [frame(13)])
                self.assertEqual(first.name, "trial001.jpg")
                self.assertEqual(second.name, "trial002.jpg")
                self.assertTrue(first.is_file())
                self.assertTrue(second.is_file())

    def test_reject_repo_paths_and_symlink_folders(self):
        with self.assertRaises(ValueError):
            camera.validated_root(camera.REPO_ROOT / "identity-ai" / "temp")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = root / "private"
            original.mkdir()
            alias = root / "alias"
            try:
                alias.symlink_to(original, target_is_directory=True)
            except OSError:
                self.skipTest("Symlink permissions unavailable on this platform")
            with self.assertRaises(ValueError):
                camera.validated_root(alias)

    def test_no_duplicate_or_missing_pair_or_giant_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(ValueError):
                camera.save_frames(root, "same", [frame(20), frame(20)])
            with self.assertRaises(ValueError):
                camera.save_frames(root, "different", [frame(20)])
            with self.assertRaises(ValueError):
                camera.save_frames(root, "live", [frame(20), frame(30)])
            with self.assertRaises(ValueError):
                camera.save_frames(root, "unknown", [frame(20)])
            with self.assertRaises(ValueError):
                camera.encode_frame(np.zeros((4, 4, 3), dtype=np.uint8))
            with self.assertRaises(ValueError):
                camera.encode_frame(np.zeros((320, 400, 3), dtype=np.float32))
            self.assertFalse((root / "face").exists())
            self.assertFalse((root / "pad").exists())

    def test_camera_cancellation_releases_camera_without_writes(self):
        fake = FakeCamera()
        with patch.object(camera.cv2, "VideoCapture", return_value=fake), \
             patch.object(camera.cv2, "imshow"), \
             patch.object(camera.cv2, "waitKey", return_value=ord("q")):
            result = camera.capture_from_camera("live")
        self.assertIsNone(result)
        self.assertTrue(fake.released)

    def test_camera_capture_requires_intentional_c_key(self):
        fake = FakeCamera()
        with patch.object(camera.cv2, "VideoCapture", return_value=fake), \
             patch.object(camera.cv2, "imshow"), \
             patch.object(camera.cv2, "waitKey", side_effect=[-1, ord("c"), ord("c")]):
            result = camera.capture_from_camera("different")
        self.assertEqual(len(result), 2)
        self.assertFalse(np.array_equal(result[0], result[1]))
        self.assertTrue(fake.released)

    def test_no_camera_access_without_explicit_consent(self):
        with tempfile.TemporaryDirectory() as tmp, \
             patch("builtins.input", return_value="NO"), \
             patch.object(camera.cv2, "VideoCapture",
                          side_effect=AssertionError("Camera accessed without consent")):
            result = camera.main(["--kind", "live", "--output", tmp])
        self.assertEqual(result, 1)
        self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_windows_camera_setup_error_does_not_leave_camera_open(self):
        fake = FakeCamera()
        with patch.object(camera.cv2, "VideoCapture", return_value=fake), \
             patch.object(camera.cv2, "imshow", side_effect=cv2.error("GUI unavailable")):
            with self.assertRaises(RuntimeError):
                camera.capture_from_camera("same")
        self.assertTrue(fake.released)


if __name__ == "__main__":
    unittest.main()
