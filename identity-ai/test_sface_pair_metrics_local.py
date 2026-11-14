"""Deterministic 1:1 accuracy math — synthetic scores only, no faces."""
import math
import tempfile
from pathlib import Path
import unittest

from sface_pair_metrics import summarize_pairs
from evaluate_sface_pairs_local import _within_root


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
