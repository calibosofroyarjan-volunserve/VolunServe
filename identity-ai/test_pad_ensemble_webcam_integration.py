"""NO human camera/GUI: prove optional four-hypothesis path stays private and fail-closed."""
import json
import tempfile
import io
from contextlib import redirect_stdout
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

import evaluate_pad_ensemble_local as research
import pad_webcam_preview_tk_local as preview
import run_pad_webcam_trials_local as cli
import start_pad_laptop_gui as gui


LIVE = "model_prefers_live_unvalidated"
ATTACK = "model_prefers_attack_unvalidated"


class MockCamera:
    def __init__(self):
        self.released = False
    def isOpened(self):
        return True
    def read(self):
        return True, np.full((720, 1280, 3), 120, dtype=np.uint8)
    def release(self):
        self.released = True


class CombinedWebcamTests(unittest.TestCase):
    def test_window_pilot_args_require_consent_and_flag_has_correct_scope(self):
        with self.assertRaises(ValueError):
            gui.pilot_args(consent=False, four_hypothesis=True)
        with self.assertRaises(ValueError):
            gui.pilot_args(consent=True, four_hypothesis="yes")
        self.assertIn("--four-hypothesis", gui.pilot_args(
            consent=True, four_hypothesis=True))
        self.assertNotIn("--four-hypothesis", gui.pilot_args(consent=True))
        self.assertIn("combined_quick", Path(gui.__file__).read_text())
        self.assertIn("combined_full", Path(gui.__file__).read_text())
        self.assertIn("camera_only", Path(gui.__file__).read_text())

    def test_legacy_progress_still_requires_two_observations(self):
        p = preview.TrialProgress(trials_per_class=1)
        with self.assertRaises(ValueError):
            p.add(("live", "attack", "live", "attack"))
        p.add(("live", "attack"))
        self.assertEqual(len(p.trials["live"]), 1)

    def test_optional_combined_progress_requires_valid_count_only_trial(self):
        p = preview.TrialProgress(trials_per_class=1, four_hypothesis=True)
        valid = research.combine_one_presentation([(LIVE, ATTACK, ATTACK, ATTACK)])
        p.add(valid)
        self.assertEqual(len(p.trials["live"]), 1)
        with self.assertRaises(ValueError):
            p.add(("live", "attack"))
        q = preview.TrialProgress(trials_per_class=1, four_hypothesis=True)
        with self.assertRaises(ValueError):
            q.add({"hypotheses": ["live", "attack"],
                   "ensemble": "live", "anyHypothesisObservedLive": True})

    def test_cli_fails_before_camera_if_secondary_model_not_loaded(self):
        camera = MockCamera()
        status = {"modelLoaded": True, "faceDetectorShadow": {"modelLoaded": True}}
        with patch.object(cli.pad, "readiness", return_value=status):
            with patch("pad_v1se_shadow.readiness", return_value={
                "modelLoaded": False}):
                code = cli.run_cli(["--consent-confirmed", "--four-hypothesis",
                                    "--preview"], camera_factory=lambda _: (
                                        _ for _ in ()).throw(AssertionError("camera opened")))
        self.assertEqual(code, 2)

    def test_cli_requires_visible_consent_window_for_combined_capture(self):
        with patch.object(cli.pad, "readiness",
                          side_effect=AssertionError("loaded a model before checking mode")):
            self.assertEqual(cli.run_cli(["--consent-confirmed",
                                          "--four-hypothesis", "--no-preview"]), 2)

    def test_preview_combined_path_yields_no_video_and_aggregate_only(self):
        camera = MockCamera()
        output = []
        observed = {}
        def mocked_tk(cam, **kwargs):
            self.assertIs(cam, camera)
            observed.update(kwargs)
            self.assertTrue(kwargs["four_hypothesis"])
            guidance = type("Guidance", (), {"capture_ready": True})()
            with patch.object(research, "assess_four_hypotheses",
                              return_value=(LIVE,) * 4):
                results = kwargs["assessor"](np.zeros((720, 1280, 3), np.uint8),
                                             guidance)
            self.assertEqual(results, (LIVE,) * 4)
            fake_trial = research.combine_one_presentation([results])
            return {"live": [fake_trial], "print": [fake_trial],
                    "replay": [fake_trial]}

        with patch.object(cli.pad, "readiness", return_value={
            "modelLoaded": True,
            "faceDetectorShadow": {"modelLoaded": True},
        }), patch("pad_v1se_shadow.readiness", return_value={
            "modelLoaded": True,
        }):
            result = cli.run_cli(
                ["--consent-confirmed", "--four-hypothesis", "--preview",
                 "--trials-per-class", "1", "--frames-per-trial", "1"],
                camera_factory=lambda _: camera,
                preview_launcher=mocked_tk, output_fn=output.append)
        self.assertEqual(result, 0)
        self.assertTrue(camera.released)
        data = json.loads(output[-1])
        self.assertEqual(data["auditType"], "private_local_four_hypothesis_pad_exploratory")
        self.assertEqual(data["researchRiskCounts"]["printOrReplayFourWayLive"], 2)
        self.assertFalse(data["automaticApprovalAllowed"])
        self.assertFalse(data["independentPadValidated"])
        self.assertEqual(data["identityDecisionUse"], "none")
        summary = gui.format_aggregate(data)
        self.assertIn("V2 + V1SE", summary)
        self.assertIn("PRINT/REPLAY", summary)
        self.assertIn("NOT ID VERIFICATION", summary)

    def test_gui_aggregate_export_only_new_file_outside_git(self):
        report = research.summarize_four_hypotheses({
            "live": [], "print": [], "replay": []})
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "Private-Combined-Counts.json"
            gui.research_export(report, lighting="daylight",
                                camera_type="external_usb", path=target)
            result = json.loads(target.read_text())
            self.assertEqual(result["researchSessionContext"]["cameraType"],
                             "external_usb")
            self.assertFalse(result["automaticApprovalAllowed"])
            with self.assertRaises((OSError, ValueError)):
                gui.research_export(report, lighting="daylight",
                                    camera_type="external_usb", path=target)

    def test_four_model_breakdown_is_copyable_and_rejects_unsafe_counts(self):
        trials = {
            "live": [research.combine_one_presentation(
                [(LIVE, ATTACK, ATTACK, ATTACK)])],
            "print": [research.combine_one_presentation([(ATTACK,) * 4])],
            "replay": [research.combine_one_presentation([(ATTACK,) * 4])],
        }
        report = research.summarize_four_hypotheses(trials)
        detailed = gui.format_combined_detailed_counts(report)
        for expected in (
            "V2 raw 0", "V2 normalized 0", "V1SE raw 0",
            "V1SE normalized 0", "LIVE: trials=1",
            "PRINT: trials=1", "REPLAY: trials=1",
            "model-LIVE=1", "NOT BIOMETRIC VERIFICATION",
        ):
            self.assertIn(expected, detailed)
        for forbidden in ("faceImage", "personName", "embedding", "rawScore"):
            self.assertNotIn(forbidden, detailed)
        malformed = json.loads(json.dumps(report))
        malformed["perHypothesis"]["v2_raw_0_to_255"]["live"]["observedLive"] = 15
        with self.assertRaisesRegex(ValueError, "INVALID_AGGREGATE_COUNT"):
            gui.format_combined_detailed_counts(malformed)
        malformed = json.loads(json.dumps(report))
        malformed["automaticApprovalAllowed"] = True
        with self.assertRaisesRegex(ValueError, "UNSAFE_OR_NOT_COMBINED"):
            gui.format_combined_detailed_counts(malformed)

    def test_combined_gui_prints_all_four_counts_even_if_user_never_saves(self):
        report = research.summarize_four_hypotheses({
            "live": [research.combine_one_presentation(
                [(LIVE, ATTACK, ATTACK, ATTACK)])],
            "print": [research.combine_one_presentation([(ATTACK,) * 4])],
            "replay": [research.combine_one_presentation([(ATTACK,) * 4])],
        })
        settings = {"accepted": True, "mode": "combined_quick",
                    "camera": 0, "trials": 1,
                    "lighting": "indoor_artificial",
                    "cameraType": "laptop_built_in"}
        def mocked_cli(args, output_fn):
            self.assertIn("--four-hypothesis", args)
            output_fn(json.dumps(report, sort_keys=True))
            return 0
        terminal = io.StringIO()
        with patch.object(gui.sys, "platform", "win32"), \\
             patch.object(gui, "ask_user_settings", return_value=settings), \\
             patch.object(gui, "setup_required", return_value=False), \\
             patch("run_pad_webcam_trials_local.run_cli", side_effect=mocked_cli), \\
             patch.object(gui, "show_copyable_combined_counts") as copy_window, \\
             patch.object(gui, "notify",
                          side_effect=AssertionError("Legacy modal should not hide counts")), \\
             redirect_stdout(terminal):
            self.assertEqual(gui.main(), 0)
        self.assertEqual(copy_window.call_count, 1)
        self.assertEqual(copy_window.call_args.kwargs["camera_type"],
                         "laptop_built_in")
        displayed = terminal.getvalue()
        self.assertIn("V2 raw 0", displayed)
        self.assertIn("V1SE normalized 0", displayed)
        self.assertIn("PRINT: trials=1", displayed)
        self.assertIn("model-LIVE=1", displayed)
        self.assertIn("identity verification", displayed.lower())
        self.assertNotIn("faceImage", displayed)

    def test_direct_copy_save_controls_exist_without_automatic_export(self):
        code = Path(gui.__file__).read_text(encoding="utf-8")
        self.assertIn('text="Copy detailed counts"', code)
        self.assertIn('text="Save anonymous JSON"', code)
        self.assertIn('title="Save anonymous aggregate counts', code)
        self.assertIn('root.clipboard_append(summary +', code)
        self.assertIn("No biometric data is written.", code)
        self.assertIn("return 0\n        else:\n            notify", code)

    def test_gui_secondary_downloader_requires_separate_approved_setup(self):
        cmds = []
        with patch.object(gui, "dependencies_present", return_value=True), \
             patch.object(gui, "models_present", side_effect=[True, False, True]):
            gui.install_prerequisites(
                approved=True, include_v1se=True,
                runner=lambda argv, **kw: cmds.append((argv, kw)))
        self.assertEqual(len(cmds), 1)
        self.assertTrue(cmds[0][0][-1].endswith("download_pad_v1se_model.py"))
        with self.assertRaises(PermissionError):
            gui.install_prerequisites(approved=False, include_v1se=True,
                                      runner=lambda *_args, **_kw: None)


if __name__ == "__main__":
    unittest.main()
