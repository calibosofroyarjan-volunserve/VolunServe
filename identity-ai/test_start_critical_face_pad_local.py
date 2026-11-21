"""Safety and Windows-launcher argument tests; entirely synthetic/no camera."""
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import start_critical_face_pad_local as qa


class CriticalLocalLauncherTests(unittest.TestCase):
    def test_exit_without_consent_does_not_touch_photo_or_camera(self):
        log = []
        result = qa.run_menu(input_fn=lambda _: "0",
                             output_fn=log.append,
                             dialog=lambda *a, **k: self.fail("unexpected dialog"),
                             executor=lambda *a, **k: self.fail("unexpected process"))
        self.assertEqual(result, 0)
        self.assertTrue(any("No photo" in x for x in log))

    def test_nonconsent_blocks_all_four_activities(self):
        for choice in ("1", "2", "3", "4"):
            with self.subTest(choice=choice):
                scripted = iter((choice, "NO"))
                code = qa.run_menu(input_fn=lambda _: next(scripted),
                                   output_fn=lambda _: None,
                                   dialog=lambda *a, **k: self.fail("unexpected dialog"),
                                   executor=lambda *a, **k: self.fail("unexpected process"))
                self.assertEqual(code, 2)

    def test_private_two_photo_reuses_existing_local_no_cloud_tool(self):
        captured = []
        scripted = iter(("1", "YES"))
        code = qa.run_menu(input_fn=lambda _: next(scripted),
                           output_fn=lambda _: None,
                           dialog=lambda *a, **k: self.fail("unexpected dialog"),
                           executor=lambda argv, **kwargs: (
                               captured.append(argv), SimpleNamespace(returncode=0))[1])
        self.assertEqual(code, 0)
        self.assertEqual(len(captured), 1)
        argv = captured[0]
        self.assertEqual(argv[1], str(qa._ROOT / "choose_sface_pair_local.py"))
        self.assertEqual(len(argv), 2)
        self.assertNotIn("--download", argv)

    def test_research_pair_pilot_runs_existing_private_aggregate_evaluator(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            media = root / "images"
            media.mkdir()
            manifest = root / "pairs.csv"
            manifest.write_text("id_image,selfie_image,same_person\n",
                                encoding="utf8")
            out = root / "aggregate-private.json"
            destinations = iter((str(manifest), str(media), str(out)))
            answers = iter(("2", "YES", "0.3"))
            observed = []
            result = qa.run_menu(
                input_fn=lambda _: next(answers), output_fn=lambda _: None,
                dialog=lambda *a, **k: next(destinations),
                executor=lambda argv, **kw: (
                    observed.append(argv), SimpleNamespace(returncode=0))[1])
            self.assertEqual(result, 0)
            self.assertEqual(observed[0][1], str(qa._ROOT / "evaluate_sface_pairs_local.py"))
            self.assertIn("--consent-confirmed", observed[0])
            self.assertIn("--aggregate-json", observed[0])
            self.assertNotIn("--enable-auto-approval", observed[0])
            self.assertFalse(out.exists(), "Launcher itself must not create output")

    def test_invalid_threshold_prevents_media_access(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            media = directory / "images"
            media.mkdir()
            manifest = directory / "pairs.csv"
            manifest.write_text("id_image,selfie_image,same_person\n")
            destinations = iter((str(manifest), str(media), str(directory / "new.json")))
            for invalid in ("nan", "inf", "1.1", "-2", "not-a-number"):
                answers = iter(("2", "YES", invalid))
                destinations = iter((str(manifest), str(media), str(directory / "new.json")))
                result = qa.run_menu(input_fn=lambda _: next(answers),
                                     output_fn=lambda _: None,
                                     dialog=lambda *a, **k: next(destinations),
                                     executor=lambda *a, **k: self.fail("unexpected execution"))
                self.assertEqual(result, 2)

    def test_uses_actual_four_hypothesis_physical_pad_preview(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = str(Path(tmp) / "pad-new.json")
            answers = iter(("3", "YES"))
            calls = []
            result = qa.run_menu(
                input_fn=lambda _: next(answers), output_fn=lambda _: None,
                dialog=lambda *a, **k: report,
                executor=lambda argv, **kwargs: (
                    calls.append(argv), SimpleNamespace(returncode=0))[1])
            self.assertEqual(result, 0)
            argv = calls[0]
            self.assertEqual(argv[1], str(qa._ROOT / "run_pad_webcam_trials_local.py"))
            self.assertIn("--four-hypothesis", argv)
            self.assertIn("--preview", argv)
            self.assertIn("--consent-confirmed", argv)
            self.assertIn("--trials-per-class", argv)
            self.assertNotIn("--no-preview", argv)

    def test_does_not_write_aggregate_inside_git_or_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "new.json"
            self.assertTrue(qa._private_new_json(str(report)))
            report.write_text("synthetic")
            self.assertFalse(qa._private_new_json(str(report)))
            self.assertFalse(qa._private_new_json(str(qa._REPO / "private-output.json")))
            self.assertFalse(qa._private_new_json(str(Path(tmp) / "not-json.txt")))
            self.assertFalse(qa._private_new_json(""))

    def test_final_gate_only_reads_two_user_selected_aggregate_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            sface = Path(tmp) / "sface.json"
            pad = Path(tmp) / "pad.json"
            sface.write_text("{}", encoding="utf8")
            pad.write_text("{}", encoding="utf8")
            destinations = iter((str(sface), str(pad)))
            answers = iter(("4", "YES"))
            calls = []
            code = qa.run_menu(
                input_fn=lambda _: next(answers), output_fn=lambda _: None,
                dialog=lambda *a, **k: next(destinations),
                executor=lambda argv, **kw: (
                    calls.append(argv), SimpleNamespace(returncode=0))[1])
            self.assertEqual(code, 0)
            argv = calls[0]
            self.assertEqual(argv[1], str(qa._ROOT / "critical_biometric_risk_gate.py"))
            self.assertIn("--sface-aggregate", argv)
            self.assertIn("--pad-aggregate", argv)
            self.assertNotIn("--upload", argv)


if __name__ == "__main__":
    unittest.main()
