"""Execute actual AI 1:1 handler with synthetic-only model predictions.

No real IDs, face media, model weights, staging Firestore or upload requests.
All passive PAD statuses are SHADOW observations and cannot become independent
liveness verification, a trusted PAD attestation or a Verified Resident grant.
"""
import ast
import math
from pathlib import Path
import unittest

import numpy as np

SOURCE = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)
HANDLER = next(
    node for node in TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "run_face_verification"
)
MODULE = ast.fix_missing_locations(ast.Module(body=[HANDLER], type_ignores=[]))


def run_real_handler(pad_status, score=0.90):
    calls = {"pad": 0, "ensemble": 0, "sface": 0}

    def shadow(_image):
        calls["pad"] += 1
        return {"status": pad_status, "independentPadValidated": False}

    def ensemble(_image, primary=None):
        calls["ensemble"] += 1
        return {"status": "inconclusive", "independentPadValidated": False,
                "identityDecisionUse": "none", "automaticApprovalAllowed": False}

    def sface(_id_image, _selfie_image):
        calls["sface"] += 1
        return {"status": "inconclusive", "independentFaceMatchValidated": False}

    env = {
        "np": np, "math": math,
        "decode_image": lambda contents, _label: contents,
        "exact_image_reuse": lambda *_: False,
        "image_quality": lambda _image: {"score": 0.95},
        "face_landmarks": lambda _image: (["synthetic-landmarks"], {"reason": ""}),
        "get_min_quality_threshold": lambda: 0.34,
        "normalize_landmarks": lambda input_points: input_points,
        "similarity_score": lambda _id_pts, _selfie_pts: {"score": score},
        "assess_frame_shadow": shadow,
        "assess_ensemble_shadow": ensemble,
        "sface_assess_pair_shadow": sface,
        "get_match_threshold": lambda: 0.78,
        "verification_id_for": lambda _uid: "synthetic-verification-id",
        "failed_attempt_result": lambda **kwargs: {
            "ok": True, "status": "failed", "decision": "failed",
            "livenessImplemented": False,
        },
        "manual_review_result": lambda **kwargs: {
            "ok": True, "status": "pending", "decision": "manual_review",
            "livenessScore": None, "livenessImplemented": False,
        },
    }
    exec(compile(MODULE, "synthetic:run_face_verification", "exec"), env)
    result = env["run_face_verification"](
        uid="synthetic-resident", id_document_bytes=b"synthetic-id-shape",
        selfie_bytes=b"synthetic-selfie-shape",
    )
    return result, calls


class PassivePadDecisionIsolationTests(unittest.TestCase):
    def assert_no_verified_identity(self, output):
        self.assertEqual(output["status"], "pending")
        self.assertEqual(output["decision"], "manual_review")
        self.assertIsNone(output.get("livenessScore"))
        self.assertFalse(output.get("livenessImplemented", True))
        self.assertNotIn("independentPadAttestation", output)
        self.assertNotIn("identityVerified", output)
        self.assertNotIn("verified", output.values())
        pad = output.get("passivePadShadow", {})
        self.assertFalse(pad.get("independentPadValidated", True))
        ensemble = output.get("ensemblePadShadow", {})
        self.assertEqual(ensemble.get("identityDecisionUse"), "none")
        self.assertFalse(ensemble.get("independentPadValidated", True))
        self.assertFalse(ensemble.get("automaticApprovalAllowed", True))

    def test_every_shadow_observation_stays_manual_review(self):
        for status in (
            "model_prefers_live_unvalidated", "model_prefers_attack_unvalidated",
            "inconclusive", "disabled", "unavailable",
        ):
            with self.subTest(shadow=status):
                output, calls = run_real_handler(status)
                self.assert_no_verified_identity(output)
                self.assertEqual(output["passivePadShadow"]["status"], status)
                self.assertEqual(calls, {"pad": 1, "ensemble": 1, "sface": 1})

    def test_even_high_1to1_similarity_never_grants_verified_resident(self):
        output, calls = run_real_handler("model_prefers_live_unvalidated", score=0.9999)
        self.assert_no_verified_identity(output)
        self.assertEqual(calls["pad"], 1)

    def test_uncertain_1to1_similarity_also_stays_manual_review(self):
        output, calls = run_real_handler("model_prefers_live_unvalidated", score=0.10)
        self.assert_no_verified_identity(output)
        self.assertEqual(calls, {"pad": 1, "ensemble": 1, "sface": 1})


if __name__ == "__main__":
    unittest.main()
