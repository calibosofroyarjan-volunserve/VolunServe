"""Deterministic 1:1 accuracy math — synthetic scores only, no faces."""
import math
import tempfile
from pathlib import Path
import unittest

from sface_pair_metrics import summarize_pairs
from evaluate_sface_pairs_local import _within_root, _write_aggregate_only, _safe_aggregate_target
import json


class SFaceMetricsTests(unittest.TestCase):
    def test_counts_observed_false_accepts_and_false_rejects(self):
        data=[
            (True,0.9), (True,0.2), (True,None),
            (False,0.8), (False,-0.3), (False,None),
        ]
        summary=summarize_pairs(data,0.5)
        self.assertEqual(summary["sameScored"],2)
        self.assertEqual(summary["differentScored"],2)
        self.assertEqual(summary["sameUnscorable"],1)
        self.assertEqual(summary["differentUnscorable"],1)
        self.assertEqual(summary["trueAccepts"],1)
        self.assertEqual(summary["falseRejects"],1)
        self.assertEqual(summary["falseAccepts"],1)
        self.assertEqual(summary["trueRejects"],1)
        self.assertEqual(summary["observedFalseAcceptRate"],0.5)
        self.assertEqual(summary["observedFalseRejectRate"],0.5)
        self.assertEqual(summary["sampleAdequacy"],"small_or_incomplete_sample")
        self.assertEqual(summary["identityDecisionUse"],"none")
        self.assertFalse(summary["independentPadValidated"])
        self.assertFalse(summary["faceMatchAccuracyCertified"])

    def test_threshold_is_inclusive_and_denominator_excludes_unscorable(self):
        result=summarize_pairs([(True,0.42),(False,0.42),(True,None),(False,None)],0.42)
        self.assertEqual(result["trueAccepts"],1)
        self.assertEqual(result["falseAccepts"],1)
        self.assertEqual(result["observedFalseAcceptRate"],1.0)
        self.assertEqual(result["observedFalseRejectRate"],0.0)

    def test_no_scored_pairs_never_claim_accuracy(self):
        result=summarize_pairs([(True,None),(False,None)],0.3)
        for key in ("observedFalseAcceptRate","observedFalseRejectRate",
                    "observedTrueAcceptRate","observedTrueRejectRate"):
            self.assertIsNone(result[key])

    def test_invalid_thresholds_and_scores_are_refused(self):
        for value in (float("nan"),float("inf"),False,1.2,-1.2):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    summarize_pairs([(True,0.2)],value)
        for score in (True,float("nan"),float("-inf"),1.5,-1.1,"0.5"):
            with self.subTest(score=score):
                with self.assertRaises(ValueError):
                    summarize_pairs([(False,score)],0.42)
        with self.assertRaises(ValueError):
            summarize_pairs([("yes",0.5)],0.3)

    def test_zero_false_accepts_on_small_sample_is_not_proof_of_safety(self):
        result=summarize_pairs([(False,0.1)]*3 + [(True,0.8)]*2,0.5)
        self.assertEqual(result["observedFalseAcceptRate"],0.0)
        self.assertGreater(result["observedFalseAcceptUpper95ScoredPairs"],0.40)
        self.assertLess(result["observedFalseAcceptUpper95ScoredPairs"],1.0)
        self.assertEqual(result["sampleAdequacy"],"small_or_incomplete_sample")
        self.assertFalse(result["faceMatchAccuracyCertified"])

    def test_unscorable_real_faces_count_toward_genuine_failure_risk(self):
        result=summarize_pairs([
            (True,0.9),(True,0.3),(True,None),(True,None),
            (False,0.1),(False,None),
        ],0.5)
        self.assertEqual(result["samePairScoreCoverage"],0.5)
        self.assertEqual(result["differentPairScoreCoverage"],0.5)
        self.assertEqual(result["observedFalseRejectRate"],0.5)
        self.assertEqual(result["observedGenuineNoPositiveResultFraction"],0.75)
        self.assertGreater(result["observedFalseRejectUpper95ScoredPairs"],0.5)

    def test_missing_class_never_fabricates_confidence_bounds(self):
        result=summarize_pairs([(True,None)],0.5)
        self.assertIsNone(result["observedFalseAcceptUpper95ScoredPairs"])
        self.assertIsNone(result["observedFalseRejectUpper95ScoredPairs"])
        self.assertEqual(result["samePairScoreCoverage"],0.0)
        self.assertIsNone(result["differentPairScoreCoverage"])
        self.assertEqual(result["observedGenuineNoPositiveResultFraction"],1.0)

    def test_private_aggregate_only_export_is_exclusive_and_stays_outside_photo_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp).resolve()
            media=base/"private-media"
            media.mkdir()
            destination=base/"private-aggregate.json"
            summary=summarize_pairs([(True,0.9),(False,0.1)],0.5)
            _write_aggregate_only(destination,media,summary)
            report=json.loads(destination.read_text(encoding="utf8"))
            self.assertEqual(report["auditType"],"private_sface_1to1_exploratory")
            self.assertFalse(report["automaticApprovalAllowed"])
            self.assertFalse(report["faceMatchAccuracyCertified"])
            self.assertFalse(report["groundTruthLabelsIndependentlyValidated"])
            self.assertIn("observedFalseAcceptUpper95ScoredPairs",report)
            self.assertNotIn("id_image",report)
            self.assertNotIn("selfie_image",report)
            with self.assertRaises(ValueError):
                _write_aggregate_only(destination,media,summary)
            for unsafe in (media/"inside.json",base/"misnamed.txt"):
                with self.subTest(unsafe=unsafe.name):
                    with self.assertRaises(ValueError):
                        _safe_aggregate_target(unsafe,media)

    def test_private_dataset_paths_stay_under_explicit_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve()
            private=root/"id.jpg"
            private.write_bytes(b"synthetic-bytes-only")
            self.assertEqual(_within_root(root,"id.jpg"),private)
            for path in ("../outside.png","/etc/passwd","https://example.com/a.jpg",
                         "id.pdf","",r"C:\private.jpg"):
                self.assertIsNone(_within_root(root,path))
            outside=root.parent/"outside-fake-picture.jpg"
            # The nonexistent path is also rejected, no name printed.
            self.assertIsNone(_within_root(root,"../../outside-fake-picture.jpg"))


if __name__=="__main__":
    unittest.main()
