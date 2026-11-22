"""Privacy and decision-safety contract for local browser SFace research.

Only synthetic bytes and fake model output. Never use real IDs or people in CI.
"""
from __future__ import annotations

import base64
from pathlib import Path
import unittest

from staging_national_id_loopback import allowed_origin, process_request
from local_sface_browser_pair import process_pair

FRONT = b"\xff\xd8\xff" + b"synthetic-id-front-not-real"
SELFIE = b"\xff\xd8\xff" + b"synthetic-selfie-not-real"

def encode(value):
    return base64.b64encode(value).decode("ascii")


class LocalSFaceBrowserPairTests(unittest.TestCase):
    def test_only_id_front_and_captured_selfie_are_accepted(self):
        good = {"idFront": encode(FRONT), "capturedSelfie": encode(SELFIE)}
        for bad in (
            {}, {"front": encode(FRONT), "back": encode(SELFIE)},
            {**good, "uid": "mock-user"},
            {**good, "authToken": "mock-token"},
            {**good, "consent": True},  # consent handled ONLY by local HTTP handler
            {**good, "back": encode(FRONT)},
        ):
            with self.subTest(keys=list(bad.keys())):
                with self.assertRaisesRegex(ValueError, "only_id_front_and_selfie_allowed"):
                    process_pair(bad, evaluator=lambda a,b: {})
        self.assertNotIn("uid", good)

    def test_comparison_returns_only_unverified_uncalibrated_score(self):
        def fake_model(front, selfie):
            self.assertEqual(front, FRONT)
            self.assertEqual(selfie, SELFIE)
            return {
                "status": "similarity_observed_unvalidated",
                "qaStage": "research_score_only",
                "cosineSimilarity": 0.73125,
                "privateEmbedding": [1,2,3,4],
                "rawFaceImage": "SECRET_FACE_IMAGE",
                "isMatch": True,
                "identityVerified": True,
                "uid": "SECRET_USER_ID",
            }
        out = process_pair(
            {"idFront": encode(FRONT), "capturedSelfie": encode(SELFIE)},
            evaluator=fake_model,
        )
        self.assertEqual(out["status"], "similarity_observed_unvalidated")
        self.assertEqual(out["score"], 0.73125)
        self.assertEqual(out["stage"], "research_score_only")
        self.assertEqual(set(out), {
            "status","stage","score","identityVerified","samePersonVerified",
            "livenessValidated","idIssuerVerified","manualReviewRequired","stored"
        })
        self.assertFalse(out["identityVerified"])
        self.assertFalse(out["samePersonVerified"])
        self.assertFalse(out["livenessValidated"])
        self.assertFalse(out["idIssuerVerified"])
        self.assertTrue(out["manualReviewRequired"])
        self.assertFalse(out["stored"])

    def test_duplicate_image_never_calls_model(self):
        calls = []
        result = process_pair(
            {"idFront":encode(FRONT),"capturedSelfie":encode(FRONT)},
            evaluator=lambda a,b:calls.append((a,b)),
        )
        self.assertEqual(result["status"],"inconclusive")
        self.assertEqual(result["stage"],"duplicate_capture")
        self.assertIsNone(result["score"])
        self.assertEqual(calls, [])

    def test_model_invalid_scores_do_not_produce_success(self):
        values=[float("nan"),float("inf"),-3.4,2.0,True,"0.8",None]
        for value in values:
            with self.subTest(value=str(value)):
                result=process_pair(
                    {"idFront":encode(FRONT),"capturedSelfie":encode(SELFIE)},
                    evaluator=lambda a,b:{
                        "status":"similarity_observed_unvalidated",
                        "qaStage":"research_score_only",
                        "cosineSimilarity":value
                    },
                )
                self.assertEqual(result["status"],"inconclusive")
                self.assertIsNone(result["score"])
                self.assertFalse(result["samePersonVerified"])

    def test_unknown_status_and_extra_fields_do_not_leak(self):
        for raw in (None, {}, {"status":"verified","uid":"secret"},
                    {"status":"MATCH","isMatch":True}):
            with self.subTest(value=str(raw)):
                result=process_pair(
                    {"idFront":encode(FRONT),"capturedSelfie":encode(SELFIE)},
                    evaluator=lambda a,b:raw,
                )
                self.assertEqual(result["status"],"inconclusive")
                self.assertFalse(result["identityVerified"])
                self.assertNotIn("uid",result)
                self.assertNotIn("isMatch",result)

    def test_old_ocr_endpoint_still_accepts_only_front_back(self):
        out=process_request(
            {"front":encode(FRONT),"back":encode(SELFIE)},
            scanner=lambda a,b:{"status":"needs_review","reason":"side_consistency_inconclusive"},
        )
        self.assertEqual(out["status"],"needs_review")
        with self.assertRaises(ValueError):
            process_request(
                {"front":encode(FRONT),"capturedSelfie":encode(SELFIE)},
                scanner=lambda a,b:{"status":"national_id_format_candidate"},
            )

    def test_research_route_requires_consent_and_local_origin(self):
        repo=Path(__file__).resolve().parent.parent
        bridge=(repo/"identity-ai/staging_national_id_loopback.py").read_text(encoding="utf-8")
        page=(repo/"app/public/local-face-capture-demo.web.tsx").read_text(encoding="utf-8")
        self.assertIn('"/compare-face"',bridge)
        self.assertIn('"consent"',bridge)
        self.assertIn('data.get("consent") is not True',bridge)
        self.assertIn('self._permitted()',bridge)
        self.assertIn('http://127.0.0.1:8765/compare-face',page)
        self.assertIn('consent: true',page)
        self.assertIn('!comparisonConsent',page)
        self.assertIn('phase !== "captured"',page)
        self.assertIn('setComparison(null)',page)
        self.assertIn('URL.revokeObjectURL',page)
        self.assertTrue(allowed_origin("http://localhost:8081"))
        self.assertFalse(allowed_origin("https://volunserve.com"))
        self.assertNotIn("uploadBytes(",page)
        self.assertNotIn("setDoc(",page)
        self.assertNotIn("updateDoc(",page)
        self.assertNotIn("Same person confirmed",page)

    def test_photo_validation_rejects_arbitrary_payloads(self):
        for encoded in ("", "not-base64", encode(b"plaintext"), encode(b"\x00\x11\x22")):
            with self.subTest(value=encoded[:20]):
                with self.assertRaises(ValueError):
                    process_pair({"idFront":encoded, "capturedSelfie":encode(SELFIE)},
                        evaluator=lambda a,b:{"status":"similarity_observed_unvalidated"})
        self.assertFalse(allowed_origin("http://localhost:8081.malicious.example"))

if __name__ == "__main__":
    unittest.main()
