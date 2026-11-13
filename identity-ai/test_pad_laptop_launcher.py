"""Safe synthetic tests for Windows GUI bootstrap; never open webcam/UI."""
import importlib.util
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
import unittest

PATH = Path(__file__).with_name("start_pad_laptop_gui.py")
spec = importlib.util.spec_from_file_location("start_pad_laptop_gui", PATH)
gui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gui)


class LaptopLauncherTests(TestCase):
    def test_consent_required_before_camera_args(self):
        with self.assertRaisesRegex(ValueError, "CONSENT"):
            gui.pilot_args(consent=False)
        for camera in (-1, 4, "0", True):
            with self.assertRaisesRegex(ValueError, "CAMERA"):
                gui.pilot_args(camera=camera, consent=True)
        for trials in (0, 2, 9, "3", True):
            with self.assertRaisesRegex(ValueError, "TRIAL"):
                gui.pilot_args(trials=trials, consent=True)

    def test_strict_local_camera_settings_only(self):
        self.assertEqual(
            gui.pilot_args(camera=1, trials=3, consent=True),
            ["--consent-confirmed", "--preview",
             "--camera", "1", "--trials-per-class", "3",
             "--frames-per-trial", "3"],
        )
        args = gui.pilot_args(consent=True)
        self.assertNotIn("--no-preview", args)
        self.assertNotIn("--aggregate-json", args)
        self.assertNotIn("--url", args)
        self.assertNotIn("--identity-verify", args)

    def test_setup_fails_closed_without_separate_permission(self):
        calls = []
        with self.assertRaises(PermissionError):
            gui.install_prerequisites(
                approved=False, runner=lambda *a, **k: calls.append((a, k)))
        self.assertEqual(calls, [])

    def test_packages_and_downloads_only_run_on_explicit_permission(self):
        calls = []
        def record(command, **kwargs):
            calls.append((command, kwargs))
        with patch.object(gui, "dependencies_present", return_value=False), \
             patch.object(gui, "models_present", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "setup incomplete"):
                gui.install_prerequisites(approved=True, runner=record)
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0][0][:4],
                         [gui.sys.executable, "-m", "pip", "install"])
        self.assertIn("numpy==1.26.4", calls[0][0])
        self.assertIn("opencv-contrib-python-headless==4.11.0.86", calls[0][0])
        self.assertTrue(calls[1][0][-1].endswith("download_passive_pad_model.py"))
        self.assertTrue(calls[2][0][-1].endswith("download_yunet_model.py"))
        self.assertTrue(all(x[1]["cwd"] == str(gui.ROOT) for x in calls))

    def test_fake_aggregate_contains_counts_without_personal_media(self):
        data = {
            "identityDecisionUse": "none",
            "independentPadValidated": False,
            "trialCountsByPresentationType": {"live": 1, "print": 1, "replay": 1},
            "pairedTrialStatusDisagreements": {"live": 1, "print": 0, "replay": 1},
            "perScale": {
                "upstream_raw_0_to_255": {
                    "perClass": {
                        "live": {"trials": 1, "observedLive": 0, "observedAttack": 0,
                                 "inconclusive": 1},
                        "print": {"trials": 1, "observedLive": 0, "observedAttack": 1,
                                  "inconclusive": 0},
                    }
                },
            },
        }
        summary = gui.format_aggregate(data)
        self.assertIn("LIVE: 1 trial(s)", summary)
        self.assertIn("inconclusive=1", summary)
        self.assertIn("Live presentations not accepted: 1/1", summary)
        self.assertIn("Print/replay presentations seen as live: 0/1", summary)
        self.assertIn("Physical labels are confirmed by the operator", summary)
        self.assertIn("NOT calibrated APCER/BPCER", summary)
        self.assertIn("Liveness independently validated: NO", summary)
        self.assertIn("Permission to approve Verified Resident: NO", summary)
        for private in ("faceImage", "embedding", "userId", "photo.jpg", "private_key"):
            self.assertNotIn(private, summary)

    def test_print_false_live_risk_surfaces_in_gui_without_false_certification(self):
        report = {
            "identityDecisionUse": "none",
            "independentPadValidated": False,
            "trialCountsByPresentationType": {"live": 3, "print": 3, "replay": 3},
            "pairedTrialStatusDisagreements": {"live": 3, "print": 3, "replay": 0},
            "perScale": {},
            "conservativeShadowRisk": {
                "printPresentationsAnyScalePredictedLive": 1,
                "replayPresentationsAnyScalePredictedLive": 0,
                "operatorLabelsNotIndependentlyVerified": True,
                "identityDecisionUse": "none",
                "independentPadValidated": False,
            },
        }
        summary = gui.format_aggregate(report)
        self.assertIn("PRINT trials predicted LIVE by either scale: 1", summary)
        self.assertIn("REPLAY trials predicted LIVE by either scale: 0", summary)
        self.assertIn("false acceptance needs independent investigation", summary)
        self.assertIn("Automatic biometric approval remains BLOCKED", summary)
        self.assertIn("Cross-scale disagreements/unknowns => INCONCLUSIVE", summary)
        self.assertNotIn("biometric validation passed", summary.lower())

    def test_no_work_is_started_when_windows_consent_is_cancelled(self):
        with patch.object(gui.sys, "platform", "win32"), \
             patch.object(gui, "ask_user_settings",
                          return_value={"accepted": False}), \
             patch.object(gui, "setup_required",
                          side_effect=AssertionError("setup checked")), \
             patch.object(gui, "notify",
                          side_effect=AssertionError("UI notification started")):
            self.assertEqual(gui.main(), 0)

    def test_windows_entrypoint_uses_311_and_staging_only_script(self):
        cmd = (gui.ROOT / "Start-VolunServe-Camera-Test.cmd").read_text(
            encoding="utf-8")
        self.assertIn("py -3.11", cmd)
        self.assertIn("identity-ai\\start_pad_laptop_gui.py", cmd)
        self.assertNotIn("volunserve.com", cmd)
        self.assertNotIn("firebase", cmd.lower())
        script = PATH.read_text(encoding="utf-8")
        self.assertIn('from run_pad_webcam_trials_local import run_cli', script)
        self.assertNotIn('submitIdentityVerification(', script)
        self.assertNotIn('uploadBytes(', script)
        self.assertNotIn('requests.post(', script)


if __name__ == "__main__":
    unittest.main()
