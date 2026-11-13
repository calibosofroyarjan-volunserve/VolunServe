"""No-person, no-network tests for paired local-only real-device PAD QA."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

import evaluate_pad_scales_local as evals


class FakeScaleNet:
    """A non-biometric fake model to expose the actual 255x input difference."""
    def __init__(self):
        self.blobs = []

    def setInput(self, blob):
        self.current = np.array(blob, copy=True)
        self.blobs.append(self.current)

    def forward(self):
        # Fake a different winning class from the two input-scale hypotheses.
        return np.array([[0, 8, 0]] if self.current.max() >= 2 else
                        [[8, 0, 0]], dtype=np.float32)


class FakeVideo:
    def __init__(self):
        self.released = False
        self.reads = 0

    def isOpened(self):
        return True

    def get(self, prop):
        return 15 if prop == cv2.CAP_PROP_FPS else 45

    def set(self, _prop, _value):
        return True

    def read(self):
        self.reads += 1
        return True, np.zeros((250, 250, 3), dtype=np.uint8)

    def release(self):
        self.released = True


class PairedPrivatePadTests(unittest.TestCase):
    def test_same_crop_is_used_for_both_scale_hypotheses(self):
        net = FakeScaleNet()
        crop = np.zeros((80, 80, 3), dtype=np.uint8)
        crop[:, :, 0] = 10
        crop[:, :, 1] = 80
        crop[:, :, 2] = 240
        calls = []
        def cropper(_image):
            calls.append(1)
            return crop
        statuses = evals.assess_paired_frame(np.zeros((250, 250, 3), dtype=np.uint8),
                                            net=net, cropper=cropper)
        self.assertEqual(statuses, ("model_prefers_live_unvalidated",
                                    "model_prefers_attack_unvalidated"))
        self.assertEqual(calls, [1])
        self.assertEqual(len(net.blobs), 2)
        self.assertEqual(net.blobs[0].shape, (1, 3, 80, 80))
        np.testing.assert_allclose(net.blobs[0], net.blobs[1] * 255, rtol=1e-6, atol=1e-5)
        self.assertAlmostEqual(float(net.blobs[0][0, 0, 1, 1]), 10)
        self.assertAlmostEqual(float(net.blobs[0][0, 1, 1, 1]), 80)
        self.assertAlmostEqual(float(net.blobs[0][0, 2, 1, 1]), 240)

    def test_uncertain_or_bad_logits_are_never_granted_liveness(self):
        for values in ([0, 0, 0], [float("inf"), 0, 1], [float("nan"), 4, 0],
                       [1, 2], [], [1, 1, 1]):
            with self.subTest(values=values):
                self.assertEqual(evals.interpret_logits(values), "inconclusive")
        self.assertEqual(evals.interpret_logits([1, 7, 0]),
                         "model_prefers_live_unvalidated")
        self.assertEqual(evals.interpret_logits([7, 0, 0]),
                         "model_prefers_attack_unvalidated")

    def test_no_face_or_invalid_crop_fails_both_modes_closed(self):
        net = FakeScaleNet()
        self.assertEqual(evals.assess_paired_frame(None, net=net, cropper=lambda _: None),
                         ("inconclusive", "inconclusive"))
        self.assertEqual(evals.assess_paired_frame(None, net=net,
            cropper=lambda _: np.zeros((80, 80, 3), dtype=np.float32)),
            ("inconclusive", "inconclusive"))
        self.assertFalse(net.blobs)

    def test_video_is_one_pair_per_file_not_per_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            sample = Path(tmp) / "private_local_replay.mp4"
            sample.write_bytes(b"synthetic mock")
            video = FakeVideo()
            called = []
            def assessor(_image):
                called.append(1)
                return ("model_prefers_live_unvalidated", "model_prefers_attack_unvalidated")
            with patch.object(evals.cv2, "VideoCapture", return_value=video):
                result = evals.evaluate_paired_media(sample, assessor)
            self.assertEqual(result, ("live", "attack"))
            self.assertEqual(len(called), 3)
            self.assertTrue(video.released)

    def test_one_uncertain_frame_does_not_create_extra_genuine_trials(self):
        values = [
            ("model_prefers_attack_unvalidated", "model_prefers_attack_unvalidated"),
            ("inconclusive", "model_prefers_attack_unvalidated"),
        ]
        self.assertEqual(evals.combine_paired_frames(values),
                         ("inconclusive", "attack"))
        self.assertEqual(evals.combine_paired_frames([]),
                         ("inconclusive", "inconclusive"))

    def test_no_per_person_or_media_names_in_aggregate_output(self):
        report = evals.aggregate_paired({
            "live": [("live", "attack"), ("inconclusive", "inconclusive")],
            "print": [("attack", "live")],
            "replay": [("inconclusive", "attack")],
        })
        self.assertEqual(report["pairedTrialStatusDisagreements"],
                         {"live": 1, "print": 1, "replay": 1})
        self.assertEqual(report["perScale"]["upstream_raw_0_to_255"]["perClass"]["live"]["trials"], 2)
        self.assertEqual(report["perScale"]["converted_card_0_to_1"]["perClass"]["print"]["observedLive"], 1)
        self.assertTrue(report["allPresentationTypesSampled"])
        for k in ("classOrderSemanticsConfirmedOnRealSamples", "modelInputScaleValidatedOnRealSamples",
                  "modelThresholdCalibrated", "independentPadValidated"):
            self.assertFalse(report[k])
        self.assertEqual(report["identityDecisionUse"], "none")
        serialized = json.dumps(report)
        for forbidden in ("filename", "photo", "faceScore", "uid", "embedding",
                          "private_jane", "videoBytes", "password"):
            self.assertNotIn(forbidden, serialized)

    def test_print_false_live_is_safety_flag_even_when_scales_disagree(self):
        # Synthetic analogue of observed 9-trial run: 3 genuine LIVE,
        # 3 PRINT (one raw scale false-live, two raw inconclusive),
        # 3 REPLAY attack at both scales.
        report = evals.aggregate_paired({
            "live": [("live", "attack")] * 3,
            "print": [("live", "attack")] +
                     [("inconclusive", "attack")] * 2,
            "replay": [("attack", "attack")] * 3,
        })
        risk = report["conservativeShadowRisk"]
        self.assertEqual(risk["printPresentationsAnyScalePredictedLive"], 1)
        self.assertEqual(risk["replayPresentationsAnyScalePredictedLive"], 0)
        self.assertEqual(risk["unsafeAttackObservations"], 1)
        self.assertEqual(risk["perClass"]["print"]["scaleAgreedLive"], 0)
        self.assertEqual(risk["perClass"]["print"]["conflictOrUncertain"], 3)
        self.assertEqual(risk["perClass"]["live"]["conflictOrUncertain"], 3)
        self.assertEqual(risk["perClass"]["replay"]["scaleAgreedAttack"], 3)
        self.assertEqual(risk["releaseRecommendation"],
                         "do_not_enable_biometric_identity_approval")
        self.assertFalse(risk["independentPadValidated"])
        self.assertEqual(risk["identityDecisionUse"], "none")
        self.assertFalse(report["modelInputScaleValidatedOnRealSamples"])

    def test_conflicts_and_unknown_values_abstain_never_create_live_agreement(self):
        for candidate in [
            None, (), ["live"], ("live", "attack"),
            ("attack", "live"), ("inconclusive", "live"),
            ("inconclusive", "inconclusive"), ("verified", "verified"),
            ("live", "verified"), ("live", "live", "live"),
        ]:
            with self.subTest(candidate=candidate):
                self.assertEqual(evals.conservative_shadow_status(candidate),
                                 "inconclusive")
        self.assertEqual(
            evals.conservative_shadow_status(("live", "live")),
            "agreement_live_unvalidated")
        self.assertEqual(
            evals.conservative_shadow_status(("attack", "attack")),
            "agreement_attack_unvalidated")

    def test_no_print_trials_never_fake_negative_risk_as_validated(self):
        report = evals.aggregate_paired({"live": [("live", "live")]})
        risk = report["conservativeShadowRisk"]
        self.assertEqual(risk["perClass"]["print"]["trials"], 0)
        self.assertTrue(risk["operatorLabelsNotIndependentlyVerified"])
        self.assertFalse(risk["researchConsensusIsAuthentication"])
        self.assertFalse(report["allPresentationTypesSampled"])
        self.assertEqual(risk["releaseRecommendation"],
                         "do_not_enable_biometric_identity_approval")

    def test_missing_presentation_types_prohibit_completeness_claim(self):
        report = evals.aggregate_paired({"live": [("live", "live")]})
        self.assertFalse(report["allPresentationTypesSampled"])
        self.assertIsNone(
            report["perScale"]["upstream_raw_0_to_255"]["exploratoryAttackAcceptedFraction"]
        )

    def test_consent_explicitly_required_before_reading_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(evals.pad, "readiness",
                              side_effect=AssertionError("model access before consent")):
                result = evals.main(["--samples", tmp])
            self.assertEqual(result, 2)

    def test_reject_samples_inside_repository_and_report_in_media_folder(self):
        repo = Path(evals.__file__).resolve().parent.parent
        self.assertFalse(evals.safe_local_paths(repo, None))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "PAD-PRIVATE"
            folder.mkdir()
            self.assertTrue(evals.safe_local_paths(folder, None))
            self.assertFalse(evals.safe_local_paths(folder, folder / "report.json"))
            self.assertFalse(evals.safe_local_paths(folder, repo / "qa-report.json"))

    def test_reject_out_of_scope_media_and_symlink_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            sample = Path(tmp) / "not_photo.txt"
            sample.write_text("synthetic fixture")
            self.assertEqual(evals.evaluate_paired_media(sample),
                             ("inconclusive", "inconclusive"))
            link = Path(tmp) / "fake-face.jpg"
            link.symlink_to(sample)
            self.assertEqual(evals.evaluate_paired_media(link),
                             ("inconclusive", "inconclusive"))


if __name__ == "__main__":
    unittest.main()
