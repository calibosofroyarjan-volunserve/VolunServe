"""Offline synthetic-only tests for source-vs-ONNX input-scale audit helpers."""
import unittest
from unittest.mock import patch

import numpy as np
import audit_minifasnet_onnx_synthetic as compat


class OnnxCompatibilityTests(unittest.TestCase):
    def test_synthetic_patches_do_not_read_personal_media(self):
        patches = compat.synthetic_patches()
        self.assertEqual(len(patches), 10)
        self.assertTrue(all(p.shape == (80, 80, 3) and p.dtype == np.uint8
                            for p in patches))
        self.assertTrue(np.all(patches[0] == 0))
        self.assertTrue(np.all(patches[1] == 255))
        self.assertEqual(int(patches[-2][0, 0, 0]), 255)
        self.assertEqual(int(patches[-2][0, 0, 2]), 0)
        self.assertEqual(int(patches[-1][0, 0, 2]), 255)

    def test_bgr_nchw_range_exactly_two_documented_hypotheses(self):
        bgr = np.zeros((80, 80, 3), dtype=np.uint8)
        bgr[:, :, 0] = 10
        bgr[:, :, 1] = 80
        bgr[:, :, 2] = 240
        raw = compat.prepare_blob(bgr, 1.0)
        norm = compat.prepare_blob(bgr, 1.0 / 255)
        self.assertEqual(raw.shape, (1, 3, 80, 80))
        self.assertEqual(norm.shape, raw.shape)
        self.assertAlmostEqual(float(raw[0, 0, 5, 5]), 10.0)
        self.assertAlmostEqual(float(raw[0, 1, 5, 5]), 80.0)
        self.assertAlmostEqual(float(raw[0, 2, 5, 5]), 240.0)
        np.testing.assert_allclose(norm, raw / 255, rtol=1e-6, atol=1e-6)
        for wrong in (0.5, 0, -1):
            with self.assertRaises(ValueError):
                compat.prepare_blob(bgr, wrong)

    def test_logits_are_only_indices_not_live_or_attack_labels(self):
        pairs = [
            (np.array([9., 1., 0.]), np.array([0., 9., 1.])),
            (np.array([0., 5., 1.]), np.array([0., 1., 8.])),
            (np.array([0., 0., 4.]), np.array([0., 0., 4.])),
        ]
        result = compat.analyze_synthetic_predictions(pairs)
        self.assertEqual(result["syntheticPatterns"], 3)
        self.assertEqual(result["argmaxDisagreementsAcrossScales"], 2)
        self.assertEqual(result["argmaxHistogramsByScale"][
            "upstream_numpy_raw_0_to_255"], {
                "class_0": 1, "class_1": 1, "class_2": 1,
            })
        for key in ("classIndexSemanticsValidated", "inputScaleValidatedWithRealLabels",
                    "accuracyMeasured", "thresholdCalibrated",
                    "independentPadValidated"):
            self.assertFalse(result[key])
        self.assertEqual(result["identityDecisionUse"], "none")
        self.assertNotIn("live", repr(result).lower())

    def test_invalid_or_nonfinite_onnx_outputs_fail_closed(self):
        for fake in (
            np.array([1., 2.]),
            np.array([float("nan"), 0., 1.]),
            np.array([float("inf"), 0., 1.]),
        ):
            with self.subTest(fake=fake):
                with self.assertRaises(ValueError):
                    compat.analyze_synthetic_predictions([(fake, np.array([0., 1., 2.]))])

    def test_model_hash_validation_refuses_untrusted_or_missing_weights(self):
        from pathlib import Path
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fake_model.onnx"
            path.write_bytes(b"not a pinned trained model")
            self.assertFalse(compat.pinned_model_ok(path))
            self.assertFalse(compat.pinned_model_ok(path.with_suffix(".missing")))

    def test_report_never_claims_pad_validation_even_when_logits_favor_index(self):
        fake = [(np.array([0., 100., 0.]), np.array([0., 100., 0.]))]
        report = compat.analyze_synthetic_predictions(fake)
        self.assertEqual(report["argmaxDisagreementsAcrossScales"], 0)
        self.assertFalse(report["classIndexSemanticsValidated"])
        self.assertFalse(report["independentPadValidated"])
        self.assertEqual(report["identityDecisionUse"], "none")


if __name__ == "__main__":
    unittest.main()
