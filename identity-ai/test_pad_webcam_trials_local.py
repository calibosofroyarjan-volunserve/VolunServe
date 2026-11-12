"""Synthetic webcam-only checks. No real camera, photos, model download or network."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

import run_pad_webcam_trials_local as cam


class FakeCamera:
    def __init__(self, active=True, valid=True):
        self.active = active
        self.valid = valid
        self.read_calls = 0
        self.released = False

    def isOpened(self):
        return self.active

    def read(self):
        self.read_calls += 1
        if not self.valid:
            return False, None
        return True, np.full((240, 320, 3), 128, dtype=np.uint8)

    def release(self):
        self.released = True


class WebcamPrivacyTests(unittest.TestCase):
    def test_no_consent_means_no_camera_model_or_raw_frames_access(self):
        with patch.object(cam.pad, "readiness",
                          side_effect=AssertionError("model touched before consent")):
            self.assertEqual(cam.run_cli(
                [], camera_factory=lambda _: (_ for _ in ()).throw(
                    AssertionError("camera opened before consent"))), 2)

    def test_camera_invalid_args_do_not_start_models(self):
        with patch.object(cam.pad, "readiness",
                          side_effect=AssertionError("bad args reached model")):
            for flags in ("--camera -1", "--camera 9",
                          "--trials-per-class 0", "--trials-per-class 11",
                          "--frames-per-trial 0", "--frames-per-trial 9"):
                self.assertEqual(cam.run_cli(["--consent-confirmed"] + flags.split()), 2)

    def test_exactly_one_trial_for_three_frames_not_three_independent_trials(self):
        camera = FakeCamera()
        status = cam.capture_one_trial(
            camera, frames_per_trial=3, frame_pause_s=1,
            sleeper=lambda _: None,
            assessor=lambda _: ("model_prefers_live_unvalidated",
                                "model_prefers_attack_unvalidated"))
        self.assertEqual(status, ("live", "attack"))
        self.assertEqual(camera.read_calls, 3)

    def test_all_attack_frames_stay_attack_on_both_scales(self):
        camera = FakeCamera()
        status = cam.capture_one_trial(
            camera, frames_per_trial=3, sleeper=lambda _: None,
            assessor=lambda _: ("model_prefers_attack_unvalidated",
                                "model_prefers_attack_unvalidated"))
        self.assertEqual(status, ("attack", "attack"))

    def test_no_face_and_unknown_assessor_output_fails_closed(self):
        cam_obj = FakeCamera()
        status = cam.capture_one_trial(
            cam_obj, frames_per_trial=2, sleeper=lambda _: None,
            assessor=lambda _: ("verified", "livenessConfirmed"))
        self.assertEqual(status, ("inconclusive", "inconclusive"))
        bad = FakeCamera(valid=False)
        with self.assertRaises(cam.CameraCaptureError):
            cam.capture_one_trial(bad, sleeper=lambda _: None)

    def test_reject_wrong_camera_frame_shapes_and_dtypes(self):
        class BadCamera(FakeCamera):
            def read(self):
                return True, np.ones((240, 320, 3), dtype=np.float64)
        with self.assertRaises(cam.CameraCaptureError):
            cam.capture_one_trial(BadCamera(), sleeper=lambda _: None)
        self.assertFalse(cam.valid_frame(np.zeros((100, 120, 3), dtype=np.uint8)))
        self.assertFalse(cam.valid_frame(np.zeros((240, 320, 1), dtype=np.uint8)))

    def test_guided_three_categories_and_discrete_trial_counts(self):
        camera = FakeCamera()
        prompts = []
        output = []
        def responder(prompt):
            prompts.append(prompt)
            return ""
        report = cam.run_pilot(camera,trials_per_class=2,
            frames_per_trial=2,input_fn=responder,
            output_fn=output.append,sleeper=lambda _: None,
            sampler=lambda cap, frames_per_trial: ("live", "attack"))
        self.assertEqual(list(report), list(cam.CATEGORIES))
        self.assertTrue(all(len(report[k])==2 for k in cam.CATEGORIES))
        self.assertEqual(len(prompts), 6)
        self.assertEqual(sum("PRINT:" in x for x in output), 1)
        self.assertEqual(sum("REPLAY:" in x for x in output), 1)

    def test_explicit_user_abort_cancels_session_and_releases_camera(self):
        camera=FakeCamera()
        with patch.object(cam.pad,"readiness",return_value={
            "modelLoaded":True,"faceDetectorShadow":{"modelLoaded":True},
        }):
            result=cam.run_cli(["--consent-confirmed","--trials-per-class","1"],
                camera_factory=lambda _:camera,input_fn=lambda _: "q",
                output_fn=lambda _:None,sleeper=lambda _:None)
        self.assertEqual(result,130)
        self.assertTrue(camera.released)

    def test_missing_pinned_model_or_detector_never_starts_camera(self):
        for status in [
            {"modelLoaded":False,"faceDetectorShadow":{"modelLoaded":True}},
            {"modelLoaded":True,"faceDetectorShadow":{"modelLoaded":False}},
        ]:
            with patch.object(cam.pad,"readiness",return_value=status):
                result=cam.run_cli(["--consent-confirmed"],
                    camera_factory=lambda _:(_ for _ in ()).throw(
                        AssertionError("camera should not open")))
                self.assertEqual(result,2)

    def test_successful_synthetic_run_outputs_only_aggregate_and_releases_camera(self):
        camera = FakeCamera()
        output=[]
        with patch.object(cam.pad,"readiness",return_value={
            "modelLoaded":True,"faceDetectorShadow":{"modelLoaded":True},
        }):
            result=cam.run_cli(["--consent-confirmed","--trials-per-class","1",
                                "--frames-per-trial","1"],
                camera_factory=lambda _:camera,input_fn=lambda _: "",
                output_fn=output.append,
                sampler=lambda cap,frames_per_trial: ("live","attack"),
                sleeper=lambda _:None)
        self.assertEqual(result,0)
        self.assertTrue(camera.released)
        payload=json.loads(output[-1])
        self.assertEqual(payload["trialCountsByPresentationType"],
                         {"live":1,"print":1,"replay":1})
        self.assertEqual(payload["identityDecisionUse"],"none")
        self.assertFalse(payload["independentPadValidated"])
        self.assertEqual(payload["pairedTrialStatusDisagreements"],
                         {"live":1,"print":1,"replay":1})
        printed="\n".join(output)
        for forbidden in ("filename","face_image","embedding","faceScore",
                          "person_name","confidence_score","photo.jpg"):
            self.assertNotIn(forbidden, printed)

    def test_aggregate_json_is_new_and_outside_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/"PAD-Aggregate-Only.json"
            self.assertTrue(cam.safe_aggregate_output(target))
            report={"shadowOnly":True,"identityDecisionUse":"none","perClass":{}}
            cam.write_aggregate_exclusive(target,report)
            self.assertEqual(json.loads(target.read_text()),report)
            self.assertFalse(cam.safe_aggregate_output(target))
            with self.assertRaises(ValueError):
                cam.write_aggregate_exclusive(target,report)
            repo=Path(cam.__file__).resolve().parent.parent
            self.assertFalse(cam.safe_aggregate_output(repo/"aggregate.json"))

    def test_camera_frame_failure_prevents_report_and_releases_camera(self):
        camera=FakeCamera(valid=False)
        output=[]
        with patch.object(cam.pad,"readiness",return_value={
            "modelLoaded":True,"faceDetectorShadow":{"modelLoaded":True},
        }):
            result=cam.run_cli(["--consent-confirmed","--trials-per-class","1"],
                camera_factory=lambda _:camera,input_fn=lambda _:"",
                output_fn=output.append,sleeper=lambda _:None,
                sampler=lambda c,frames_per_trial: cam.capture_one_trial(
                    c,frames_per_trial=frames_per_trial,sleeper=lambda _:None))
        self.assertEqual(result,2)
        self.assertTrue(camera.released)
        self.assertFalse(any("perScale" in item for item in output))


if __name__=="__main__":
    unittest.main()
