"""Synthetic only V1SE second-opinion tests; no people, images or network."""
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import download_pad_v1se_model as downloader
import pad_v1se_shadow as pad


class FakeNet:
    def __init__(self, raw=(0, 9, 0), normalized=(0, 9, 0)):
        self.raw = raw
        self.normalized = normalized
        self.blobs = []

    def setInput(self, data):
        self.input = np.array(data, copy=True)
        self.blobs.append(self.input)

    def forward(self):
        return np.asarray(
            [self.raw if self.input.max() > 2 else self.normalized],
            dtype=np.float32
        )


class SecondOpinionTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"VOLUNSERVE_PAD_V1SE_SHADOW": "1"})
        self.env.start()
        self.net = FakeNet()
        self.load = patch.object(pad, "_load_net", return_value=self.net)
        self.load.start()
        self.picture = np.full((480, 640, 3), 128, dtype=np.uint8)

    def tearDown(self):
        self.load.stop()
        self.env.stop()

    def one_face(self):
        return patch.object(pad, "single_face_box", return_value=(280, 190, 60, 60))

    def test_upstream_4x_crop_not_v2_27x_and_same_crop_both_scales(self):
        with self.one_face(), patch.object(
            pad.cv2, "resize", return_value=np.full((80, 80, 3), 128, dtype=np.uint8)
        ) as resize:
            result = pad.assess_secondary_shadow(self.picture)
        self.assertEqual(result["status"], "model_prefers_live_unvalidated")
        self.assertFalse(result["independentPadValidated"])
        self.assertEqual(result["identityDecisionUse"], "none")
        roi = resize.call_args.args[0]
        self.assertEqual(roi.shape[:2], (240, 240))
        self.assertEqual(len(self.net.blobs), 2)
        np.testing.assert_allclose(self.net.blobs[0], self.net.blobs[1] * 255,
                                   rtol=1e-6, atol=1e-5)

    def test_second_model_scale_conflict_abstains(self):
        self.net.normalized = (9, 0, 0)
        with self.one_face():
            result = pad.assess_secondary_shadow(self.picture)
        self.assertEqual(result["status"], "inconclusive")
        self.assertFalse(result["independentPadValidated"])

    def test_no_face_and_out_of_frame_fail_closed(self):
        for box in (None, (0, 0, 50, 50)):
            self.net.blobs.clear()
            with patch.object(pad, "single_face_box", return_value=box):
                value = pad.assess_secondary_shadow(self.picture)
            self.assertEqual(value["status"], "inconclusive")
            self.assertEqual(self.net.blobs, [])

    def test_model_attack_is_only_unvalidated_label(self):
        self.net.raw = (9, 0, 0)
        self.net.normalized = (9, 0, 0)
        with self.one_face():
            result = pad.assess_secondary_shadow(self.picture)
        self.assertEqual(result["status"], "model_prefers_attack_unvalidated")
        self.assertNotIn("livenessVerified", result)
        self.assertNotIn("identityVerified", result)

    def test_invalid_secondary_hypothesis_cannot_claim_live(self):
        self.net.normalized = (float("nan"), 0, 0)
        with self.one_face():
            result = pad.assess_secondary_shadow(self.picture)
        self.assertEqual(result["status"], "inconclusive")

    def test_model_missing_never_defaults_to_live(self):
        self.load.stop()
        with patch.object(pad, "_load_net", return_value=None):
            result = pad.assess_secondary_shadow(self.picture)
        self.load.start()
        self.assertEqual(result["status"], "unavailable")

    def test_disabled_model_not_loaded_or_inferred(self):
        self.load.stop()
        with patch.dict(os.environ, {"VOLUNSERVE_PAD_V1SE_SHADOW": "0"}):
            with patch.object(pad, "_load_net", side_effect=AssertionError("model loaded")):
                result = pad.assess_secondary_shadow(self.picture)
        self.load.start()
        self.assertEqual(result["status"], "disabled")

    def test_ensemble_conflicts_missing_or_different_models_abstain(self):
        live = {"status": "model_prefers_live_unvalidated"}
        attack = {"status": "model_prefers_attack_unvalidated"}
        absent = {"status": "unavailable"}
        scenarios = [
            (live, attack), (attack, live), (live, absent),
            (absent, live), (live, {"status": "inconclusive"}),
        ]
        for primary, secondary in scenarios:
            with self.subTest(primary=primary, secondary=secondary), patch.object(
                pad, "assess_secondary_shadow", return_value=secondary
            ):
                result = pad.assess_ensemble_shadow(self.picture, primary=primary)
            self.assertEqual(result["status"], "inconclusive")
            self.assertFalse(result["independentPadValidated"])
            self.assertFalse(result["automaticApprovalAllowed"])
            self.assertFalse(result["modelsIndependent"])
            self.assertEqual(result["identityDecisionUse"], "none")

    def test_same_family_agreement_never_grants_liveness(self):
        for status, expected in [
            ("model_prefers_live_unvalidated", "agreement_live_unvalidated"),
            ("model_prefers_attack_unvalidated", "agreement_attack_unvalidated"),
        ]:
            with patch.object(pad, "assess_secondary_shadow",
                              return_value={"status": status}):
                result = pad.assess_ensemble_shadow(
                    self.picture, primary={"status": status})
            self.assertEqual(result["status"], expected)
            self.assertFalse(result["independentPadValidated"])
            self.assertFalse(result["automaticApprovalAllowed"])
            self.assertFalse(result["modelsIndependent"])

    def test_model_readiness_cannot_claim_accuracy_certification(self):
        data = pad.readiness()
        for key in ("independentPadValidated", "modelClassMappingValidated",
                    "modelInputScaleValidated", "thresholdCalibrated"):
            self.assertFalse(data[key])
        self.assertEqual(data["identityDecisionUse"], "none")

    def test_sha_and_failed_download_refuses_to_write_wrong_weights(self):
        self.assertFalse(downloader._verified(b"model lookalike"))
        self.assertEqual(len(downloader.SHA256), 64)
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "model.onnx"
            class Response:
                def __enter__(self): return self
                def __exit__(self, *args): return False
                def read(self, length): return b"not a real model"
            with patch.object(downloader, "DESTINATION", target), patch.object(
                downloader, "urlopen", return_value=Response()
            ):
                with self.assertRaisesRegex(RuntimeError, "CHECKSUM_MISMATCH"):
                    downloader.download()
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
