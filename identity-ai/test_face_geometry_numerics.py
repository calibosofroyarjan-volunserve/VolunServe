"""Synthetic numerical guards from actual face-comparison code.

No photos, no model weights, no Firebase, no network or human face samples.
The handler functions are extracted from main.py to test real source logic
without importing MediaPipe or an externally hosted model.
"""
import ast
import math
from pathlib import Path
import unittest

import numpy as np
from face_pair_integrity import exact_image_reuse


def real_functions():
    source = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
    parsed = ast.parse(source)
    nodes = [
        node for node in parsed.body
        if isinstance(node, ast.FunctionDef)
        and node.name in ("normalize_landmarks", "run_face_verification")
    ]
    assert len(nodes) == 2
    module = ast.Module(body=nodes, type_ignores=[])
    ast.fix_missing_locations(module)
    names = [
        10, 152, 127, 234, 454, 356,
        33, 133, 362, 263,
        70, 63, 105, 66, 107,
        336, 296, 334, 293, 300,
        1, 2, 98, 327, 168, 197,
        61, 291, 78, 308, 0, 17,
        172, 136, 150, 149, 176, 148,
        377, 400, 378, 379, 365, 397,
    ]
    environment = {
        "np": np, "math": math, "MATCH_LANDMARKS": names,
        "LEFT_EYE_OUTER": 33, "RIGHT_EYE_OUTER": 263,
        "exact_image_reuse": exact_image_reuse,
    }
    exec(compile(module, "main.py:real_face_functions", "exec"), environment)
    return environment


def sample_points():
    pts = np.full((480, 2), 0.5, dtype=np.float64)
    pts[:, 0] = np.linspace(0.3, 0.7, 480)
    pts[:, 1] = np.linspace(0.4, 0.6, 480)
    pts[33] = (0.32, 0.44)
    pts[263] = (0.69, 0.44)
    return pts


class FaceGeometryNumericalTests(unittest.TestCase):
    def setUp(self):
        self.env = real_functions()
        self.normalize = self.env["normalize_landmarks"]

    def test_valid_synthetic_landmarks_are_finite(self):
        output = self.normalize(sample_points())
        self.assertEqual(output.shape, (len(self.env["MATCH_LANDMARKS"]), 2))
        self.assertTrue(np.isfinite(output).all())

    def test_nan_inf_wrong_shape_out_of_bounds_and_zero_eye_distance_fail(self):
        base = sample_points()
        bad = [
            np.array([0.5, 0.3]),
            base[:20],
            np.full((480, 3), 0.3),
            np.where(np.indices(base.shape)[0] == 6, np.nan, base),
            np.where(np.indices(base.shape)[0] == 8, np.inf, base),
            np.where(np.indices(base.shape)[0] == 4, 99.0, base),
        ]
        coincident = sample_points()
        coincident[263] = coincident[33]
        bad.append(coincident)
        for candidate in bad:
            with self.subTest(shape=getattr(candidate, "shape", None)):
                with self.assertRaises(ValueError):
                    self.normalize(candidate)

    def test_bad_similarity_never_returns_a_score_or_verified_status(self):
        env = self.env
        env["decode_image"] = lambda b, _: np.full((320, 320, 3),
                                            0 if b == b"a" else 1, np.uint8)
        env["image_quality"] = lambda _: {"score": 0.95}
        env["face_landmarks"] = lambda _: (sample_points(), {"reason": ""})
        env["get_min_quality_threshold"] = lambda: 0.34
        env["manual_review_result"] = lambda **kw: {
            "status": "pending", "decision": "manual_review",
            "matchScore": kw.get("match_score"), "livenessScore": None,
            "warnings": [kw.get("warning")],
        }
        env["similarity_score"] = lambda *_: {"score": float("nan")}
        for value in (float("nan"), float("inf"), -0.2, 1.2, None, True, "0.9"):
            env["similarity_score"] = lambda *_, v=value: {"score": v}
            result = env["run_face_verification"](
                uid="synthetic", id_document_bytes=b"a", selfie_bytes=b"b")
            self.assertEqual(result["status"], "pending")
            self.assertEqual(result["decision"], "manual_review")
            self.assertIsNone(result["matchScore"])
            self.assertIsNone(result["livenessScore"])
            self.assertIn("face_geometry_unreliable", result["warnings"])

    def test_finite_similarity_is_still_manual_review_not_identity_approval(self):
        env = self.env
        env["decode_image"] = lambda b, _: np.full((320, 320, 3),
                                            0 if b == b"a" else 1, np.uint8)
        env["image_quality"] = lambda _: {"score": 0.95}
        env["face_landmarks"] = lambda _: (sample_points(), {"reason": ""})
        env["get_min_quality_threshold"] = lambda: 0.34
        env["similarity_score"] = lambda *_: {"score": 0.92}
        env["assess_frame_shadow"] = lambda _: {"status": "disabled"}
        env["assess_ensemble_shadow"] = lambda _, primary=None: {"status": "inconclusive", "independentPadValidated": False, "identityDecisionUse": "none", "automaticApprovalAllowed": False}
        env["sface_assess_pair_shadow"] = lambda *_: {"status": "disabled"}
        env["get_match_threshold"] = lambda: 0.78
        env["verification_id_for"] = lambda _: "synthetic-verification"
        result = env["run_face_verification"](
            uid="synthetic", id_document_bytes=b"a", selfie_bytes=b"b")
        self.assertEqual(result["decision"], "manual_review")
        self.assertEqual(result["status"], "pending")
        self.assertIsNone(result["livenessScore"])
        self.assertFalse(result["livenessImplemented"])


if __name__ == "__main__":
    unittest.main()
