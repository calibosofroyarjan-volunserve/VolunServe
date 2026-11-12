"""Privacy-safe synthetic test for private SFace matching QA. No real face data."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np

import evaluate_sface_local as qa


class LocalSFaceQATests(unittest.TestCase):
    def test_same_and_different_pair_error_rates_are_conservative(self):
        result = qa.summarize({
            "same": [0.7, 0.4, None, float("nan")],
            "different": [0.8, 0.2, None, float("inf")],
        })
        target = next(row for row in result["exploratoryComparisons"]
                      if row["exploratoryThreshold"] == 0.45)
        self.assertEqual(result["samePersonPairs"], 4)
        self.assertEqual(result["differentPersonPairs"], 4)
        self.assertEqual(result["samePersonInconclusive"], 2)
        self.assertEqual(result["differentPersonInconclusive"], 2)
        self.assertEqual(target["samePersonNotAccepted"], 3)
        self.assertEqual(target["differentPersonPotentiallyAccepted"], 1)
        self.assertEqual(target["samePersonNotAcceptedFraction"], 0.75)
        self.assertEqual(target["differentPersonPotentiallyAcceptedFraction"], 0.25)
        self.assertFalse(result["thresholdCalibrated"])
        self.assertFalse(result["realDeviceAccuracyValidated"])
        self.assertFalse(result["independentFaceMatchValidated"])
        self.assertFalse(result["independentPadValidated"])
        self.assertEqual(result["identityDecisionUse"], "none")

    def test_empty_samples_never_claim_zero_errors(self):
        result = qa.summarize({})
        for metrics in result["exploratoryComparisons"]:
            self.assertIsNone(metrics["samePersonNotAcceptedFraction"])
            self.assertIsNone(metrics["differentPersonPotentiallyAcceptedFraction"])

    def test_symlinks_and_incomplete_pairs_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "first.jpg"
            a.write_bytes(b"synthetic bytes")
            pair = root / "pair"
            pair.mkdir()
            (pair / "first.jpg").symlink_to(a)
            (pair / "second.jpg").write_bytes(b"synthetic bytes")
            self.assertIsNone(qa.evaluate_pair(pair))
            (pair / "first.jpg").unlink()
            self.assertIsNone(qa.evaluate_pair(pair))

    def test_two_local_images_only_and_score_never_returned_with_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "private_pair"
            folder.mkdir()
            (folder / "very_sensitive_name_a.jpg").write_bytes(b"synthetic")
            (folder / "very_sensitive_name_b.jpg").write_bytes(b"synthetic")
            def score(first, second):
                self.assertEqual(first.shape, (320, 400, 3))
                self.assertEqual(second.shape, (320, 400, 3))
                return {"status": "similarity_observed_unvalidated", "cosineSimilarity": 0.83}
            with patch.object(qa.cv2, "imread",
                              return_value=np.zeros((320, 400, 3), dtype=np.uint8)):
                observed = qa.evaluate_pair(folder, score)
            self.assertEqual(observed, 0.83)
            published = json.dumps(qa.summarize({"same": [observed], "different": []}))
            self.assertNotIn("sensitive", published)
            self.assertNotIn("embedding", published)
            self.assertNotIn("0.83", published)

    def test_missing_model_status_does_not_leak_or_enable_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "same").mkdir()
            (root / "different").mkdir()
            with patch.object(qa.face, "readiness", return_value={"modelLoaded": False}):
                self.assertEqual(qa.main(["--samples", str(root)]), 2)

    def test_output_refuses_inside_repo_or_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in qa.CLASSES:
                (root / name).mkdir()
                (root / name / "pair1").mkdir()
            with patch.object(qa.face, "readiness", return_value={"modelLoaded": True}), \
                 patch.object(qa, "gather", return_value={"same": [0.7], "different": [0.2]}):
                self.assertEqual(
                    qa.main(["--samples", str(root),
                             "--aggregate-json", str(root / "results.json")]), 2)
                self.assertFalse((root / "results.json").exists())

    def test_only_ephemeral_valid_scores_are_aggregated(self):
        result = qa.summarize({
            "same": [None, False, 2.0, float("-inf"), 0.1],
            "different": [None, "0.9", -2.0, 0.8],
        })
        self.assertEqual(result["samePersonInconclusive"], 4)
        self.assertEqual(result["differentPersonInconclusive"], 3)
        self.assertNotIn("cosineSimilarity", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
