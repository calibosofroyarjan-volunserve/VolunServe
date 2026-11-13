"""Synthetic-only tests for V2+V1SE same-presentation evaluation. No webcam/IDs/network."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

import evaluate_pad_ensemble_local as qa


LIVE = "model_prefers_live_unvalidated"
ATTACK = "model_prefers_attack_unvalidated"
UNKNOWN = "inconclusive"


class FakeScaleNet:
    def __init__(self, raw=(0, 9, 0), normalized=(9, 0, 0)):
        self.raw = raw
        self.normalized = normalized
        self.blobs = []

    def setInput(self, blob):
        self.blob = np.array(blob, copy=True)
        self.blobs.append(self.blob)

    def forward(self):
        return np.asarray(
            [self.raw if self.blob.max() > 2 else self.normalized],
            dtype=np.float32,
        )


class FakeVideo:
    def __init__(self):
        self.released = False
        self.frames_read = 0

    def isOpened(self):
        return True

    def get(self, prop):
        return 15 if prop == cv2.CAP_PROP_FPS else 35

    def set(self, _prop, _value):
        return True

    def read(self):
        self.frames_read += 1
        return True, np.full((360, 480, 3), 140, dtype=np.uint8)

    def release(self):
        self.released = True


def row(values, consensus=None, any_live=None):
    return {"hypotheses": values,
            "ensemble": consensus or ("live" if all(x == "live" for x in values)
                                      else "attack" if all(x == "attack" for x in values)
                                      else "inconclusive"),
            "anyHypothesisObservedLive": (
                any(x == "live" for x in values) if any_live is None else any_live)}


class EnsembleResearchTests(unittest.TestCase):
    def test_both_architectures_use_same_frame_and_two_input_scales(self):
        frame = np.full((400, 500, 3), 125, dtype=np.uint8)
        fake = FakeScaleNet()
        crop = np.full((80, 80, 3), 125, dtype=np.uint8)
        touched = []
        def first(image):
            touched.append(image)
            return (LIVE, ATTACK)
        def second(image):
            touched.append(image)
            return crop
        statuses = qa.assess_four_hypotheses(
            frame, v2_assessor=first, v1_crop=second, v1_net=fake)
        self.assertEqual(statuses, (LIVE, ATTACK, LIVE, ATTACK))
        self.assertEqual(len(touched), 2)
        self.assertIs(touched[0], frame)
        self.assertIs(touched[1], frame)  # exact same original frame
        self.assertEqual(len(fake.blobs), 2)
        np.testing.assert_allclose(fake.blobs[0], fake.blobs[1] * 255,
                                   atol=1e-5, rtol=1e-6)

    def test_missing_v1_weight_is_inconclusive_not_inherited_from_v2(self):
        frame = np.full((400, 500, 3), 125, dtype=np.uint8)
        with patch.object(qa.v1, "_load_net", return_value=None):
            outputs = qa.assess_four_hypotheses(
                frame, v2_assessor=lambda _: (LIVE, LIVE))
        self.assertEqual(outputs, (LIVE, LIVE, UNKNOWN, UNKNOWN))
        obs = qa.combine_one_presentation([outputs])
        self.assertEqual(obs["ensemble"], "inconclusive")

    def test_invalid_frame_skips_all_models(self):
        for invalid in [None, np.zeros((200, 200, 3), dtype=np.float32),
                        np.zeros((100, 200, 3), dtype=np.uint8)]:
            self.assertEqual(qa.assess_four_hypotheses(
                invalid,
                v2_assessor=lambda _: (_ for _ in ()).throw(AssertionError()),
                v1_crop=lambda _: (_ for _ in ()).throw(AssertionError())),
                qa.UNDECIDED)

    def test_print_false_live_on_one_of_four_is_visible_risk(self):
        trial = qa.combine_one_presentation(
            [(LIVE, ATTACK, ATTACK, ATTACK)])
        self.assertEqual(trial["ensemble"], "inconclusive")
        self.assertTrue(trial["anyHypothesisObservedLive"])
        result = qa.summarize_four_hypotheses({
            "live": [row(("attack",) * 4)],
            "print": [trial],
            "replay": [row(("attack",) * 4)],
        })
        self.assertEqual(result["researchRiskCounts"]["printOrReplayAnyHypothesisObservedLive"], 1)
        self.assertEqual(result["researchRiskCounts"]["printOrReplayFourWayLive"], 0)
        self.assertEqual(result["researchRiskCounts"]["genuineNotFourWayLive"], 1)
        self.assertFalse(result["independentPadValidated"])
        self.assertFalse(result["automaticApprovalAllowed"])
        self.assertEqual(result["identityDecisionUse"], "none")

    def test_four_agreed_live_still_never_validates_anything(self):
        output = qa.summarize_four_hypotheses({
            "live": [qa.combine_one_presentation([(LIVE,) * 4])],
            "print": [qa.combine_one_presentation([(LIVE,) * 4])],
            "replay": [qa.combine_one_presentation([(ATTACK,) * 4])],
        })
        self.assertEqual(output["researchRiskCounts"]["printOrReplayFourWayLive"], 1)
        self.assertEqual(output["fourHypothesisConsensus"]["print"]["observedLive"], 1)
        self.assertFalse(output["modelClassMappingValidated"])
        self.assertFalse(output["independentPadValidated"])
        self.assertEqual(output["releaseRecommendation"], "do_not_enable_biometric_identity_approval")

    def test_one_recording_with_three_frames_is_ONE_trial(self):
        cam = FakeVideo()
        with tempfile.TemporaryDirectory() as tmp:
            media = Path(tmp) / "private_attack.mp4"
            media.write_bytes(b"synthetic mock only")
            with patch.object(qa.cv2, "VideoCapture", return_value=cam):
                trial = qa.evaluate_one_media(
                    media, assessor=lambda frame: (ATTACK,) * 4)
        self.assertTrue(cam.released)
        self.assertEqual(cam.frames_read, 3)
        self.assertEqual(trial["ensemble"], "attack")
        counts = qa.summarize_four_hypotheses({
            "live": [], "print": [trial], "replay": []})
        self.assertEqual(counts["trialCountsByPresentationType"]["print"], 1)

    def test_conflict_between_frames_abstains_in_strict_ensemble(self):
        trial = qa.combine_one_presentation(
            [(LIVE,) * 4, (ATTACK,) * 4, (LIVE,) * 4])
        self.assertEqual(trial["ensemble"], "inconclusive")
        self.assertTrue(trial["anyHypothesisObservedLive"])

    def test_no_real_person_identifiers_or_media_leak_in_json(self):
        result = qa.summarize_four_hypotheses({
            "live": [row(("live",) * 4)],
            "print": [row(("attack",) * 4)],
            "replay": [row(("inconclusive",) * 4)],
        }, camera_type="laptop_built_in", lighting="indoor_artificial")
        serialized = json.dumps(result)
        for term in ["uid", "filename", "imageBytes", "embedding", "personName",
                     "confidenceScore", "facePhoto", "videoData", "governmentId"]:
            self.assertNotIn(term, serialized)
        self.assertFalse(result["operatorLabelsIndependentlyVerified"])
        self.assertFalse(result["modelFamilyIndependent"])
        self.assertTrue(result["allPresentationTypesSampled"])

    def test_missing_class_never_claims_all_presentation_types_sampled(self):
        result = qa.summarize_four_hypotheses({
            "live": [row(("live",) * 4)], "print": [], "replay": []})
        self.assertFalse(result["allPresentationTypesSampled"])
        self.assertIsNone(result["researchRiskCounts"]["exploratoryAnyHypothesisAttackLiveFraction"])

    def test_malformed_trials_refused_and_no_fabricated_counts(self):
        for malformed in [
            {"hypotheses": ["live", "attack"], "ensemble": "live",
             "anyHypothesisObservedLive": True},
            {"hypotheses": ["verified"] * 4, "ensemble": "live",
             "anyHypothesisObservedLive": True},
            {"hypotheses": ["live"] * 4, "ensemble": "verified",
             "anyHypothesisObservedLive": True},
        ]:
            with self.assertRaises(ValueError):
                qa.summarize_four_hypotheses({
                    "live": [malformed], "print": [], "replay": []})

    def test_missing_consent_and_label_review_never_load_models(self):
        with patch.object(qa.v2, "readiness",
                          side_effect=AssertionError("No model before consent")):
            with tempfile.TemporaryDirectory() as tmp:
                for args in [
                    ["--samples", tmp],
                    ["--samples", tmp, "--consent-confirmed"],
                    ["--samples", tmp, "--operator-labels-reviewed"],
                ]:
                    self.assertEqual(qa.main(args), 2)

    def test_local_report_path_new_outside_checkout_and_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "samples"
            source.mkdir()
            target = Path(tmp) / "aggregate.json"
            self.assertTrue(qa.safe_output(target, source))
            self.assertFalse(qa.safe_output(source / "report.json", source))
            result = qa.summarize_four_hypotheses(
                {"live": [], "print": [], "replay": []})
            qa.write_exclusive(target, result)
            self.assertFalse(qa.safe_output(target, source))
            self.assertEqual(json.loads(target.read_text())["auditType"],
                             "private_local_four_hypothesis_pad_exploratory")
            with self.assertRaises(FileExistsError):
                qa.write_exclusive(target, result)

    def test_symlinked_samples_cannot_be_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "samples"
            source.mkdir()
            (source / "print").mkdir()
            actual = Path(tmp) / "private.png"
            actual.write_bytes(b"fake")
            (source / "print" / "shortcut.png").symlink_to(actual)
            with self.assertRaises(ValueError):
                qa.collect_private_presentations(
                    source, evaluator=lambda _: row(("live",) * 4))

    def test_empty_folder_refuses_fake_accuracy(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(qa.v2, "readiness", return_value={
                "modelLoaded": True, "faceDetectorShadow": {"modelLoaded": True},
            }), patch.object(qa.v1, "readiness", return_value={
                "modelLoaded": True,
            }):
                self.assertEqual(qa.main([
                    "--samples", tmp, "--consent-confirmed", "--operator-labels-reviewed"
                ]), 2)


if __name__ == "__main__":
    unittest.main()
