"""Synthetic tests: no faces, IDs, model downloads, or account actions."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

import compare_pad_input_scales_local as q


class ScaleSensitiveFakeNet:
    """Only tests blob scaling, not quality or genuine PAD semantics."""
    def setInput(self, image):
        self.blob = image

    def forward(self):
        # Simulate DIFFERENT output classes depending on input scale.
        peak = float(self.blob.max())
        return np.array([[0.1, 0.9, 0.0]] if peak > 1.0 else
                        [[0.9, 0.1, 0.0]], dtype=np.float32)


class ComparePadInputsTests(unittest.TestCase):
    def test_same_crop_tested_in_both_scales_bgr_order_preserved(self):
        image = np.zeros((80, 80, 3), dtype=np.uint8)
        image[:, :, 0] = 10
        image[:, :, 1] = 80
        image[:, :, 2] = 240
        net = ScaleSensitiveFakeNet()
        observed = {
            mode: q.classify_crop_by_mode(image, scale, net)
            for mode, scale in q.MODES
        }
        self.assertEqual(observed, {
            "source_raw_0_to_255": "class_1",
            "onnx_card_0_to_1": "class_0",
        })
        q.classify_crop_by_mode(image, 1.0, net)
        self.assertAlmostEqual(float(net.blob[0, 0, 0, 0]), 10)
        self.assertAlmostEqual(float(net.blob[0, 1, 0, 0]), 80)
        self.assertAlmostEqual(float(net.blob[0, 2, 0, 0]), 240)

    def test_missing_face_no_model_invocation(self):
        class Crash:
            def setInput(self, image):
                raise AssertionError("No model inference when no usable face")
        with patch.object(q.pad, "_face_crop", return_value=None):
            result = q.assess_local_image(
                np.zeros((480, 640, 3), dtype=np.uint8), Crash())
        self.assertEqual(set(result.values()), {"inconclusive"})

    def test_classes_are_only_unvalidated_indices_not_identity_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for label in q.KINDS:
                (root / label).mkdir()
            first = root / "live" / "private_person_name.jpg"
            first.write_bytes(b"fake image")
            def fake_assessor(_image, _net):
                return {"source_raw_0_to_255": "class_1",
                        "onnx_card_0_to_1": "class_0"}
            with patch.object(q, "read_local_image",
                              return_value=np.zeros((480, 640, 3), dtype=np.uint8)):
                report = q.aggregate(root, object(), fake_assessor)
            self.assertEqual(report["perClass"]["live"]["trials"], 1)
            self.assertEqual(report["perClass"]["live"]["classIndexCountsByInputScale"]
                             ["source_raw_0_to_255"]["class_1"], 1)
            self.assertFalse(report["independentPadValidated"])
            self.assertFalse(report["inputScaleResolved"])
            self.assertFalse(report["classIndexSemanticsValidated"])
            self.assertEqual(report["identityDecisionUse"], "none")
            text = json.dumps(report)
            for secret in ("private_person", "face_embedding", "confidence",
                           "cosineSimilarity", "imageBytes"):
                self.assertNotIn(secret, text)

    def test_missing_or_invalid_inputs_are_inconclusive(self):
        invalid = np.ones((80, 80, 1), dtype=np.uint8)
        fake = ScaleSensitiveFakeNet()
        self.assertEqual(q.classify_crop_by_mode(invalid, 1.0, fake),
                         "inconclusive")
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.jpg"
            bad.write_bytes(b"synthetic non-image")
            self.assertIsNone(q.read_local_image(bad))

    def test_empty_folders_not_misrepresented_as_zero_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for kind in q.KINDS:
                (root / kind).mkdir()
            report = q.aggregate(root, object())
            self.assertEqual(report["perClass"]["live"]["trials"], 0)
            self.assertEqual(report["perClass"]["replay"]["trials"], 0)
            self.assertFalse(report["inputScaleResolved"])

    def test_refuse_to_read_images_from_git_repo(self):
        with patch.object(q.pad, "_load_net",
                          side_effect=AssertionError("MODEL MUST NOT LOAD")):
            self.assertEqual(q.main(["--samples", str(q.REPO_ROOT)]), 2)


if __name__ == "__main__":
    unittest.main()
