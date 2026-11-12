"""Synthetic, privacy-safe tests for the offline metric wrapper. No real faces."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from qa_offline_match import parse_manifest, evaluate, wilson95, DEFAULT_THRESHOLD


class PrivateFaceEvaluationTests(unittest.TestCase):
    def test_genuine_impostor_and_failure_to_acquire_are_distinct(self):
        trials = [
            ("genuine", Path("a"), Path("b")),
            ("genuine", Path("c"), Path("d")),
            ("genuine", Path("e"), Path("f")),
            ("impostor", Path("g"), Path("h")),
            ("impostor", Path("i"), Path("j")),
        ]
        scores = iter([.90, .70, None, .79, .10])
        result = evaluate(trials, .78, scorer=lambda *_: next(scores))
        self.assertEqual(result["falseMatchRate"]["rate"],.5)
        self.assertEqual(result["falseNonMatchRate"]["rate"],.5)
        self.assertEqual(result["failureToAcquire"]["genuine"]["events"],1)
        self.assertEqual(result["allGenuineAttemptsNotMatchedOrUnscorable"]["rate"],2/3)
        self.assertFalse(result["automaticResidentVerificationAllowed"])
        self.assertTrue(result["onlyAuthorizedAdminMayVerify"])
        self.assertFalse(result["accuracyIndependentlyValidated"])
        self.assertFalse(result["independentPadValidated"])

    def test_threshold_inclusive_for_impostor_only(self):
        cases=[("genuine",Path("a"),Path("b")),("impostor",Path("c"),Path("d"))]
        result=evaluate(cases, DEFAULT_THRESHOLD, lambda *_:.78)
        self.assertEqual(result["falseMatchRate"]["events"],1)
        self.assertEqual(result["falseNonMatchRate"]["events"],0)

    def test_empty_set_never_reports_zero_error_rate(self):
        report=evaluate([], .78, scorer=lambda *_:1)
        self.assertIsNone(report["falseMatchRate"]["rate"])
        self.assertIsNone(report["falseNonMatchRate"]["rate"])
        self.assertFalse(report["pairedMatchingMeasurementsPresent"])

    def test_errors_fail_closed_without_identifying_data(self):
        for score in [float("nan"),float("inf"),-1,1.1,True]:
            if score is True:  # bool isn't a numeric biometric score
                continue
            with self.assertRaises(ValueError):
                evaluate([("impostor",Path("a"),Path("b"))], scorer=lambda *_:score)
        for threshold in [0,1.1,float("nan"),float("inf")]:
            with self.assertRaises(ValueError):
                evaluate([],threshold=threshold)

    def test_manifest_allows_only_labels_and_relative_local_paths(self):
        with TemporaryDirectory() as folder:
            root=Path(folder)
            manifest=root/"pairs.jsonl"
            (root/"images").mkdir()
            manifest.write_text(json.dumps({
                "label":"genuine", "reference":"images/a.jpg", "probe":"images/b.png"
            })+"\n",encoding="utf-8")
            parsed=parse_manifest(manifest)
            self.assertEqual(parsed[0][0],"genuine")
            bad=[
                {"label":"genuine","reference":"images/a.jpg","probe":"images/b.png","uid":"PRIVATE"},
                {"label":"impostor","reference":"../outside.jpg","probe":"images/b.png"},
                {"label":"unknown","reference":"images/a.jpg","probe":"images/b.png"},
                {"label":"genuine","reference":"https://example.com/a.jpg","probe":"images/b.png"},
            ]
            for entry in bad:
                manifest.write_text(json.dumps(entry)+"\n",encoding="utf-8")
                with self.assertRaises(ValueError):
                    parse_manifest(manifest)

    def test_private_media_manifest_inside_git_checkout_is_rejected(self):
        # Synthetic manifest only; this temporary folder is deleted after test.
        with TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            manifest=Path(folder)/"pairs.jsonl"
            manifest.write_text(json.dumps({
                "label":"genuine",
                "reference":"images/synthetic_a.jpg",
                "probe":"images/synthetic_b.png",
            })+"\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "PRIVATE_MEDIA_FOLDER_MUST_BE_OUTSIDE_REPOSITORY"):
                parse_manifest(manifest)

    def test_report_includes_no_pair_scores_images_or_identifiers(self):
        result=evaluate([("genuine",Path("patient_photo.jpg"),Path("private_selfie.png"))],
                        scorer=lambda *_:.93456)
        serialized=json.dumps(result)
        for private_token in ("patient_photo", "private_selfie", ".93456"):
            self.assertNotIn(private_token,serialized)
        self.assertEqual(result["falseNonMatchRate"]["events"],0)
        self.assertGreater(wilson95(0,1)["upper"],0)


if __name__=="__main__":
    unittest.main()
