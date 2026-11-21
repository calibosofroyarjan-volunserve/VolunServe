"""Synthetic-only regression: fail-closed fusion of SFace and PAD evidence."""
import unittest
from critical_biometric_risk_gate import assess_critical_risks
from sface_pair_metrics import summarize_pairs


def face(pairs):
    return {
        "auditType":"private_sface_1to1_exploratory",
        "automaticApprovalAllowed":False,
        **summarize_pairs(pairs,0.5)
    }


def pad(live=4, physical_print=4, replay=4, false_live=0, genuine_rejected=0):
    return {
        "auditType":"private_local_four_hypothesis_pad_exploratory",
        "shadowOnly":True,
        "identityDecisionUse":"none",
        "independentPadValidated":False,
        "automaticApprovalAllowed":False,
        "trialCountsByPresentationType":{
            "live":live,"print":physical_print,"replay":replay
        },
        "researchRiskCounts":{
            "printOrReplayAnyHypothesisObservedLive":false_live,
            "printOrReplayFourWayLive":0,
            "genuineNotFourWayLive":genuine_rejected,
            "totalPrintAndReplay":physical_print+replay,
            "totalGenuine":live
        }
    }


class CriticalBiometricGateTests(unittest.TestCase):
    def test_zero_observed_errors_never_authorizes_verified_resident(self):
        report=assess_critical_risks(
            face([(True,0.9)]*5+[(False,0.1)]*5), pad()
        )
        self.assertFalse(report["automaticIdentityApprovalAllowed"])
        self.assertEqual(report["status"],"research_evidence_only_release_blocked")
        self.assertTrue(report["residentVerificationRequiresIndependentAdminReview"])
        self.assertIn("mini_fasnet_pad_not_independently_validated",report["blockingReasonCodes"])

    def test_print_replay_false_live_flags_attacks_even_if_consensus_inconclusive(self):
        report=assess_critical_risks(
            face([(True,0.9),(False,0.1)]),
            pad(false_live=1,genuine_rejected=2),
        )
        self.assertIn("print_or_replay_any_model_live_red_flag",report["blockingReasonCodes"])
        self.assertIn("genuine_presentations_not_consistently_live",report["blockingReasonCodes"])
        self.assertEqual(report["pad"]["anyModelLiveOnAttack"],1)

    def test_missing_different_person_samples_never_conflate_with_accuracy(self):
        report=assess_critical_risks(face([(True,0.9),(True,None)]),
                                    pad(physical_print=0,replay=0))
        self.assertIn("same_and_different_photo_pairs_not_both_scored",report["blockingReasonCodes"])
        self.assertIn("genuine_print_and_replay_presentations_not_all_sampled",report["blockingReasonCodes"])
        self.assertIn("unscorable_face_pairs_need_investigation",report["blockingReasonCodes"])

    def test_incorrect_or_spoofed_release_claims_are_rejected(self):
        for key,value in [
            ("automaticApprovalAllowed",True),
            ("faceMatchAccuracyCertified",True),
            ("identityDecisionUse","verified"),
        ]:
            with self.subTest(field=key):
                datum=face([(True,0.9),(False,0.1)])
                datum[key]=value
                with self.assertRaises(ValueError):
                    assess_critical_risks(datum,pad())
        tampered=pad()
        tampered["independentPadValidated"]=True
        with self.assertRaises(ValueError):
            assess_critical_risks(face([(True,0.9),(False,0.1)]),tampered)

    def test_fake_statistics_cannot_claim_zero_risk(self):
        datum=face([(True,0.7),(False,0.1)])
        datum["falseAccepts"]=2
        with self.assertRaises(ValueError):
            assess_critical_risks(datum,pad())
        attack=pad(physical_print=1,replay=1,false_live=3)
        with self.assertRaises(ValueError):
            assess_critical_risks(face([(True,0.8),(False,0.1)]),attack)

    def test_output_never_exposes_extra_user_supplied_biometric_data(self):
        datum=face([(True,0.8),(False,0.1)])
        datum.update({"name":"PRIVATE TEST PERSON","photoPath":"PRIVATE PATH","embedding":[.25,.4]})
        result=assess_critical_risks(datum,pad())
        self.assertNotIn("PRIVATE TEST PERSON",str(result))
        self.assertNotIn("PRIVATE PATH",str(result))
        self.assertNotIn("embedding",str(result))
        self.assertFalse(result["automaticIdentityApprovalAllowed"])


if __name__=="__main__":
    unittest.main()
