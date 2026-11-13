"""Synthetic-only regression tests for visible local webcam preview.

Does NOT open Windows camera, a Tk window, read photos, fetch models,
save frames, or transmit any biometric data.
"""
import json
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import pad_frame_guidance_local as guide
import pad_webcam_preview_tk_local as preview
import run_pad_webcam_trials_local as webcam


def fake_frame():
    return np.zeros((480, 640, 3), dtype=np.uint8)


class FakeCapture:
    def __init__(self):
        self.released = False
    def isOpened(self):
        return True
    def release(self):
        self.released = True


class LivePreviewTests(unittest.TestCase):
    def test_original_model_independent_27x_crop_math_preserved(self):
        # 100x100 box -> 270x270 crop; no synthetic padding or relaxed ROI.
        box = (160, 90, 100, 100)
        rect = guide.context_rect_for_face(box, fake_frame().shape)
        self.assertEqual(rect, (75, 5, 345, 275))
        self.assertEqual(rect[2] - rect[0], 270)
        self.assertEqual(rect[3] - rect[1], 270)

    def test_close_face_is_not_silently_resized_or_approved(self):
        box = (100, 60, 220, 180)
        self.assertIsNone(guide.context_rect_for_face(box, fake_frame().shape))
        status = guide.analyze_framing(
            fake_frame(), detect_box=lambda _: box)
        self.assertEqual(status.code, "move_back")
        self.assertFalse(status.capture_ready)
        self.assertIsNone(status.context_rect)

    def test_face_categories_are_actionable_not_authentication(self):
        mapping = {"no_face": "no_face", "multiple_faces": "multiple_faces",
                   "one_face_unvalidated": "move_back",
                   "unavailable": "detector_unavailable"}
        for detected, expected in mapping.items():
            with self.subTest(detected=detected):
                g = guide.analyze_framing(fake_frame(), detect_box=lambda _:None,
                                          inspect=lambda _: detected)
                self.assertEqual(g.code, expected)
                self.assertFalse(g.capture_ready)
                self.assertIn(expected, guide.HELP)
                self.assertNotIn("identityVerified", str(g))

    def test_ready_face_gets_only_ephemeral_on_screen_preview(self):
        status = guide.analyze_framing(
            fake_frame(), detect_box=lambda _: (160, 90, 100, 100))
        self.assertTrue(status.capture_ready)
        view = guide.draw_guidance(fake_frame(), status, max_width=600, max_height=340)
        self.assertLessEqual(view.shape[1], 600)
        self.assertLessEqual(view.shape[0], 340)
        self.assertEqual(view.shape[2], 3)
        ok, encoded = cv2.imencode(".png", view)
        self.assertTrue(ok)
        self.assertGreater(encoded.size, 50)
        self.assertTrue(np.array_equal(fake_frame(), np.zeros_like(fake_frame())))

    def test_invalid_frame_fails_before_detector_and_never_enables_capture(self):
        with self.assertRaises(ValueError):
            guide.draw_guidance(None, guide.Guidance("camera_unavailable"))
        bad = np.full((480,640,3), 0.4, dtype=np.float32)
        g = guide.analyze_framing(bad, detect_box=lambda _:(
            _ for _ in ()).throw(AssertionError("detector invoked on invalid camera")))
        self.assertEqual(g.code, "camera_unavailable")
        self.assertFalse(g.capture_ready)

    def test_preview_crop_reuses_exact_full_27x_context(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[5:275, 75:345, 0] = 21
        frame[5:275, 75:345, 1] = 72
        frame[5:275, 75:345, 2] = 201
        status = guide.Guidance("ready",(160, 90, 100, 100),(75, 5, 345, 275))
        crop = preview.cropped_pad_input(frame, status)
        self.assertEqual(crop.shape, (80,80,3))
        self.assertTrue(np.all(crop[:,:,0] == 21))
        self.assertTrue(np.all(crop[:,:,2] == 201))
        source = []
        def assessor(_frame, *, cropper):
            data = cropper(_frame)
            source.append(data.copy())
            return ("model_prefers_live_unvalidated",
                    "model_prefers_attack_unvalidated")
        result = preview.assess_ready_frame(frame,status,assessor=assessor)
        self.assertEqual(result,(
            "model_prefers_live_unvalidated", "model_prefers_attack_unvalidated"))
        self.assertEqual(len(source),1)
        self.assertTrue(np.array_equal(source[0],crop))

    def test_out_of_frame_crop_stays_inconclusive_without_assessing_faces(self):
        invalid = guide.Guidance("move_back",(160,90,100,100),None)
        out = preview.assess_ready_frame(
            fake_frame(), invalid,
            assessor=lambda *_a, **_kw: (
                _ for _ in ()).throw(AssertionError("model should not run")))
        self.assertEqual(out,("inconclusive","inconclusive"))

    def test_unknown_model_outcome_fails_closed(self):
        valid = guide.Guidance("ready",(160,90,100,100),(75,5,345,275))
        result = preview.assess_ready_frame(
            fake_frame(), valid,
            assessor=lambda *_a, **_kw: ("verified","livenessValidated"))
        self.assertEqual(result,("inconclusive","inconclusive"))

    def test_trial_state_counts_presentations_not_camera_frames(self):
        progress = preview.TrialProgress(trials_per_class=2)
        self.assertFalse(progress.complete)
        self.assertEqual(progress.current,("live",1))
        with self.assertRaises(ValueError):
            progress.add(("verified","approved"))
        for kind in webcam.CATEGORIES:
            for _ in range(2):
                self.assertEqual(progress.current[0],kind)
                progress.add(("live","attack"))
        self.assertTrue(progress.complete)
        self.assertEqual(progress.current,(None,None))
        self.assertEqual({k:len(v) for k,v in progress.trials.items()},
                         {"live":2,"print":2,"replay":2})

    def test_framing_only_mode_cannot_capture_even_when_framing_ready(self):
        ui = preview.GuidedPadWebcamUI(
            FakeCapture(), preview_only=True,
            framing=lambda _:guide.Guidance("ready", (160,90,100,100),
                                             (75,5,345,275)),
            assessor=lambda *_a, **_kw: (
                _ for _ in ()).throw(
                    AssertionError("framing mode must never invoke PAD model")))
        ui._last_guidance = guide.Guidance(
            "ready", (160,90,100,100), (75,5,345,275))
        ui._start_capture()
        self.assertFalse(ui._capturing)
        self.assertFalse(ui.progress.complete)
        self.assertEqual(ui.progress.current, ("live", 1))
        self.assertEqual({k:len(v) for k,v in ui.progress.trials.items()},
                         {"live":0,"print":0,"replay":0})

    def test_explicit_framing_launcher_is_no_report_and_no_capture(self):
        obj=FakeCapture()
        with patch.object(preview.GuidedPadWebcamUI,"launch",return_value=None):
            result=preview.launch_webcam_preview(
                obj,trials_per_class=1,frames_per_trial=3,preview_only=True)
        self.assertIsNone(result)

    def test_explicit_preview_path_renders_without_creating_real_Tk(self):
        webcam_obj = FakeCapture()
        calls = []
        output = []
        def launcher(camera, *, trials_per_class, frames_per_trial):
            calls.append((camera,trials_per_class,frames_per_trial))
            return {k:[("live","attack")] for k in webcam.CATEGORIES}
        with patch.object(webcam.pad,"readiness",return_value={
            "modelLoaded":True, "faceDetectorShadow":{"modelLoaded":True},
        }):
            ret = webcam.run_cli(
                ["--consent-confirmed","--preview","--trials-per-class","1"],
                camera_factory=lambda _idx:webcam_obj,
                preview_launcher=launcher,
                output_fn=output.append)
        self.assertEqual(ret,0)
        self.assertTrue(webcam_obj.released)
        self.assertEqual(len(calls),1)
        aggregate = json.loads(output[-1])
        self.assertEqual(aggregate["trialCountsByPresentationType"],
                         {"live":1,"print":1,"replay":1})
        self.assertFalse(aggregate["independentPadValidated"])
        self.assertEqual(aggregate["identityDecisionUse"],"none")

    def test_preview_cancel_discards_aggregate_and_releases_camera(self):
        webcam_obj = FakeCapture()
        printed=[]
        with patch.object(webcam.pad,"readiness",return_value={
            "modelLoaded":True, "faceDetectorShadow":{"modelLoaded":True},
        }):
            status = webcam.run_cli(
                ["--consent-confirmed","--preview"],
                camera_factory=lambda _:webcam_obj,
                preview_launcher=lambda *_a, **_kw: None,
                output_fn=printed.append)
        self.assertEqual(status,130)
        self.assertTrue(webcam_obj.released)
        self.assertFalse(any("trialCountsByPresentationType" in v for v in printed))

    def test_no_consent_does_not_invoke_preview_or_camera(self):
        with patch.object(webcam.pad,"readiness",
                          side_effect=AssertionError("model before consent")):
            ret=webcam.run_cli(
                ["--preview"],
                camera_factory=lambda _:(
                    _ for _ in ()).throw(AssertionError("camera without consent")),
                preview_launcher=lambda *_a, **_kw: (
                    _ for _ in ()).throw(AssertionError("preview without consent")))
        self.assertEqual(ret,2)

    def test_legacy_no_preview_still_opt_in(self):
        obj=FakeCapture()
        with patch.object(webcam.pad,"readiness",return_value={
            "modelLoaded":True,"faceDetectorShadow":{"modelLoaded":True}
        }),patch.object(webcam,"run_pilot",return_value={
            k:[("inconclusive","inconclusive")] for k in webcam.CATEGORIES
        }):
            result = webcam.run_cli(["--consent-confirmed","--no-preview"],
                camera_factory=lambda _:obj, output_fn=lambda _x:None,
                preview_launcher=lambda *_a,**_kw: (
                    _ for _ in ()).throw(AssertionError("GUI invoked in --no-preview")))
        self.assertEqual(result,0)
        self.assertTrue(obj.released)

    def test_gui_code_has_no_cloud_or_media_persistence_calls(self):
        from pathlib import Path
        gui = Path(preview.__file__).read_text(encoding="utf-8")
        for forbidden in (
            "cv2.imwrite(", "cv2.VideoWriter(", "requests.post(",
            "urllib.request.urlopen(", "firebase_admin", "tk.filedialog",
            "persistence.save(", "torch.save(", "pickle.dump(",
        ):
            self.assertNotIn(forbidden,gui)
        self.assertIn("PhotoImage",gui)
        self.assertIn('format="png"',gui)


if __name__=="__main__":
    unittest.main()
