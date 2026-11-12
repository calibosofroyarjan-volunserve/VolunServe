"""Synthetic, media-free tests for privacy-preserving local PAD evaluation."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

import evaluate_passive_pad_local as e


class FakeVideo:
    def __init__(self):
        self.released = False
        self.frames = 0
    def isOpened(self):
        return True
    def get(self, prop):
        import cv2
        return 15 if prop == cv2.CAP_PROP_FPS else 45
    def set(self, _prop, _value):
        return True
    def read(self):
        self.frames += 1
        return True, np.zeros((200, 200, 3), dtype=np.uint8)
    def release(self):
        self.released = True


class LocalPadEvalTests(unittest.TestCase):
    def test_exploratory_aggregate_accounting(self):
        result = e.summarize_observations({
            "live": ["live", "attack", "inconclusive"],
            "print": ["attack", "live"],
            "replay": ["attack", "inconclusive", "live"],
        })
        self.assertEqual(result["perClass"]["print"]["trials"], 2)
        self.assertEqual(result["perClass"]["replay"]["observedLive"], 1)
        self.assertEqual(result["exploratoryAttackAcceptedFraction"], 0.4)
        self.assertEqual(result["exploratoryGenuineNotAcceptedFraction"], 0.6667)
        self.assertFalse(result["independentPadValidated"])
        self.assertEqual(result["identityDecisionUse"], "none")
        self.assertFalse(result["thresholdCalibrated"])

    def test_no_denominator_does_not_fabricate_rates(self):
        result = e.summarize_observations({})
        self.assertIsNone(result["exploratoryAttackAcceptedFraction"])
        self.assertIsNone(result["exploratoryGenuineNotAcceptedFraction"])

    def test_any_live_video_frame_counts_as_one_possible_attack_accept(self):
        self.assertEqual(e.combine_frame_observations([
            e.OBSERVED_ATTACK, e.OBSERVED_LIVE, e.OBSERVED_ATTACK]), "live")
        self.assertEqual(e.combine_frame_observations([
            e.OBSERVED_ATTACK] * 8), "attack")
        self.assertEqual(e.combine_frame_observations([
            e.OBSERVED_ATTACK, "inconclusive"]), "inconclusive")

    def test_local_image_processed_without_upload_or_filenames_in_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "private_person_test.jpg"
            path.write_bytes(b"synthetic JPEG fixture bytes")
            with patch.object(e.cv2, "imread",
                              return_value=np.zeros((200, 200, 3), dtype=np.uint8)):
                result = e.evaluate_media(path, lambda frame: {"status": e.OBSERVED_ATTACK})
            self.assertEqual(result, "attack")
            self.assertNotIn("person", result)

    def test_video_counts_one_trial_no_matter_how_many_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "private_replay.mp4"
            path.write_bytes(b"synthetic video fixture bytes")
            cap = FakeVideo()
            with patch.object(e.cv2, "VideoCapture", return_value=cap):
                result = e.evaluate_media(path, lambda frame: {"status": e.OBSERVED_LIVE})
            self.assertEqual(result, "live")
            self.assertEqual(cap.frames, 3)
            self.assertTrue(cap.released)

    def test_symlinked_images_are_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for kind in e.KINDS:
                (root / kind).mkdir()
            private = root / "secret.jpg"
            private.write_bytes(b"private file")
            (root / "live" / "link.jpg").symlink_to(private)
            data = e.gather(root, lambda frame: {"status": e.OBSERVED_LIVE})
            self.assertEqual(data, {"live": [], "print": [], "replay": []})

    def test_oversized_or_invalid_file_is_inconclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.jpg"
            path.write_bytes(b"not a real image")
            self.assertEqual(e.evaluate_media(path), "inconclusive")

    def test_no_biometrics_leak_into_counts(self):
        r = e.summarize_observations({"live": ["live"]})
        from json import dumps
        text = dumps(r)
        for forbidden in ("filename", "imageData", "embedding", "uid", "faceScore"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
