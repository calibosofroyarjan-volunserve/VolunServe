"""No-camera, no-model, no-Firebase regression tests for actual 1:1 handler.

Ensures optional PAD/SFace *shadow* diagnostics never block primary
landmark comparison or grant Verified Resident / independent liveness.
"""
import ast
import math
from pathlib import Path
from types import SimpleNamespace
import unittest
from face_pair_integrity import exact_image_reuse

SOURCE = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)
FUNC = next(n for n in TREE.body if isinstance(n, ast.FunctionDef)
            and n.name == "run_face_verification")
MODULE = ast.fix_missing_locations(ast.Module(body=[FUNC], type_ignores=[]))


def execute(*, primary=None, ensemble=None, sface=None, score=0.91, quality=0.95):
    calls = {"primary": 0, "ensemble": 0, "sface": 0}

    def shadow(name, configured):
        def fake(*args, **kwargs):
            calls[name] += 1
            if isinstance(configured, BaseException):
                raise configured
            return configured
        return fake

    environment = {
        "np": SimpleNamespace(number=float), "math": math,
        "decode_image": lambda contents, _label: contents,
        "exact_image_reuse": exact_image_reuse,
        "image_quality": lambda _image: {"score": quality},
        "face_landmarks": lambda _image: (["fictional-landmarks"], {"reason": ""}),
        "get_min_quality_threshold": lambda: 0.34,
        "normalize_landmarks": lambda points: points,
        "similarity_score": lambda _one, _two: {"score": score},
        "assess_frame_shadow": shadow(
            "primary", {"status": "disabled"} if primary is None else primary),
        "assess_ensemble_shadow": shadow(
            "ensemble", {"status": "inconclusive"} if ensemble is None else ensemble),
        "sface_assess_pair_shadow": shadow(
            "sface", {"status": "disabled"} if sface is None else sface),
        "get_match_threshold": lambda: 0.78,
        "verification_id_for": lambda _: "fictional-verification-id",
        "failed_attempt_result": lambda **kwargs: {
            "status": "failed", "decision": "failed",
            "livenessImplemented": False,
        },
        "manual_review_result": lambda **kwargs: {
            "status": "pending", "decision": "manual_review",
            "livenessScore": None, "livenessImplemented": False,
            "matchScore": kwargs.get("match_score"),
        },
    }
    exec(compile(MODULE, "main.py:actual_face_handler", "exec"), environment)
    result = environment["run_face_verification"](
        uid="fictional-resident",
        id_document_bytes=b"fictional-image-1",
        selfie_bytes=b"fictional-image-2",
    )
    return result, calls


def assert_only_review(case, result):
    case.assertEqual(result["status"], "pending")
    case.assertEqual(result["decision"], "manual_review")
    case.assertIsNone(result["livenessScore"])
    case.assertFalse(result["livenessImplemented"])
    case.assertNotIn("identityVerified", result)
    case.assertNotIn("independentPadAttestation", result)
    case.assertFalse(result["passivePadShadow"]["independentPadValidated"])
    case.assertEqual(result["passivePadShadow"]["identityDecisionUse"], "none")
    case.assertFalse(result["ensemblePadShadow"]["automaticApprovalAllowed"])
    case.assertFalse(result["ensemblePadShadow"]["modelsIndependent"])
    case.assertFalse(result["ensemblePadShadow"]["independentPadValidated"])
    case.assertEqual(result["ensemblePadShadow"]["identityDecisionUse"], "none")
    case.assertFalse(result["sFaceShadow"]["independentFaceMatchValidated"])
    case.assertFalse(result["sFaceShadow"]["independentPadValidated"])
    case.assertEqual(result["sFaceShadow"]["identityDecisionUse"], "none")


class OptionalFaceShadowFailureTests(unittest.TestCase):
    def test_all_three_shadow_exceptions_still_request_human_review(self):
        scenarios = (
            dict(primary=RuntimeError("fictional sensitive provider error")),
            dict(ensemble=ValueError("fictional corrupted ONNX output")),
            dict(sface=KeyError("fictional SFace status missing")),
            dict(primary=MemoryError("fictional model resource unavailable"),
                 ensemble=RuntimeError("fictional secondary model failed"),
                 sface=RuntimeError("fictional SFace failed")),
        )
        for scenario in scenarios:
            with self.subTest(models=list(scenario)):
                outcome, calls = execute(**scenario)
                assert_only_review(self, outcome)
                self.assertEqual(calls, {"primary": 1, "ensemble": 1, "sface": 1})
                self.assertNotIn("fictional sensitive provider error", str(outcome))
                for value in ("passivePadShadow", "ensemblePadShadow", "sFaceShadow"):
                    self.assertNotEqual(outcome[value]["status"], "verified")
                for name, key in [("primary", "passivePadShadow"),
                                  ("ensemble", "ensemblePadShadow"),
                                  ("sface", "sFaceShadow")]:
                    if name in scenario:
                        self.assertEqual(outcome[key]["status"], "unavailable")

    def test_untrusted_shadow_dict_cannot_inject_validated_or_approved_flags(self):
        result, _ = execute(
            primary={"status": "model_prefers_live_unvalidated",
                     "independentPadValidated": True, "identityVerified": True},
            ensemble={"status": "agreement_live_unvalidated",
                      "automaticApprovalAllowed": True, "independentPadValidated": True,
                      "identityDecisionUse": "auto_approve"},
            sface={"status": "similarity_observed_unvalidated",
                   "independentFaceMatchValidated": True,
                   "identityDecisionUse": "verified",
                   "cosineSimilarity": 0.99999},
        )
        assert_only_review(self, result)
        self.assertNotIn("cosineSimilarity", str(result))
        self.assertNotIn("identityVerified", result["passivePadShadow"])
        self.assertEqual(result["sFaceShadow"]["status"],
                         "similarity_observed_unvalidated")

    def test_malformed_shadow_outputs_fail_closed_without_crashing(self):
        for bad in (object(), [], "verified", 1, {"status": "approved"}, {}):
            with self.subTest(kind=type(bad).__name__):
                result, _ = execute(primary=bad, ensemble=bad, sface=bad)
                assert_only_review(self, result)
                for key in ("passivePadShadow", "ensemblePadShadow", "sFaceShadow"):
                    self.assertEqual(result[key]["status"], "unavailable")

    def test_valid_research_statuses_remain_observational_only(self):
        result, calls = execute(
            primary={"status": "model_prefers_attack_unvalidated"},
            ensemble={"status": "agreement_attack_unvalidated"},
            sface={"status": "inconclusive"},
        )
        assert_only_review(self, result)
        self.assertEqual(calls, {"primary": 1, "ensemble": 1, "sface": 1})
        self.assertEqual(result["passivePadShadow"]["status"],
                         "model_prefers_attack_unvalidated")

    def test_low_landmark_similarity_keeps_manual_review_even_without_shadows(self):
        result, _ = execute(score=0.10,
            primary=RuntimeError("shadow disabled"),
            ensemble=RuntimeError("shadow disabled"),
            sface=RuntimeError("shadow disabled"))
        assert_only_review(self, result)
        self.assertEqual(result["matchScore"], 0.1)

    def test_low_quality_does_not_run_any_shadow_model(self):
        result, calls = execute(quality=0.10)
        self.assertEqual(result["decision"], "failed")
        self.assertEqual(calls, {"primary": 0, "ensemble": 0, "sface": 0})


if __name__ == "__main__":
    unittest.main()
