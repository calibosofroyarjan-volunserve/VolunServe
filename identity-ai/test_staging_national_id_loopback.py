"""Synthetic data only: privacy/security contract for staging local OCR bridge."""
from pathlib import Path
import base64
import unittest

from staging_national_id_loopback import (
    ALLOWED_ORIGINS, allowed_origin, process_request, safe_photo_payload,
)

FRONT = b"\xff\xd8\xff" + b"not-a-real-government-id-front"
BACK = b"\xff\xd8\xff" + b"not-a-real-government-id-back"

def encode(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")

class LocalOcrBridgeTests(unittest.TestCase):
    def test_only_local_web_origins_allowed(self):
        for value in ("http://localhost:8081", "http://127.0.0.1:8081"):
            self.assertTrue(allowed_origin(value))
        for value in (
            "https://volunserve.com", "https://example.com",
            "http://evil.localhost:8081", "http://localhost:8081.evil.test",
            "null", None, "file://",
        ):
            with self.subTest(value=value):
                self.assertFalse(allowed_origin(value))
        self.assertTrue(all(origin.startswith("http://localhost:") or
                            origin.startswith("http://127.0.0.1:")
                            for origin in ALLOWED_ORIGINS))

    def test_only_front_and_back_are_permitted_in_payload(self):
        good = {"front": encode(FRONT), "back": encode(BACK)}
        for bad in (
            {**good, "selfie": "extra"},
            {**good, "uid": "someuser"},
            {"front": encode(FRONT)},
            {},
            ["front", "back"],
        ):
            with self.subTest(payload=str(type(bad))):
                with self.assertRaisesRegex(ValueError, "only_front_and_back_allowed"):
                    process_request(bad, scanner=lambda f,b: {})

    def test_photo_headers_and_size_checked(self):
        self.assertEqual(safe_photo_payload(encode(FRONT)), FRONT)
        for bad in ("not-base64", "YWJj", "", encode(b"\x00abc"),
                    encode(b"\xff\xd8\xff" + b"a" * (10 * 1024 * 1024))):
            with self.subTest(length=len(bad)):
                with self.assertRaisesRegex(ValueError, "invalid_photo_data"):
                    safe_photo_payload(bad)

    def test_classification_result_is_allowlisted_and_unverified(self):
        def fake_scanner(front, back):
            self.assertEqual(front, FRONT)
            self.assertEqual(back, BACK)
            return {
                "status": "national_id_format_candidate",
                "reason": "both_sides_format_evidence",
                "front": "national_id_heading_and_labels",
                "back": "reverse_labels_observed",
                "identityVerified": True,
                "authenticityVerified": True,
                "rawOcrText": "SECRET OCR FIELD",
                "imageBytes": front,
                "uid": "privateUid",
            }
        out = process_request({"front": encode(FRONT), "back": encode(BACK)}, fake_scanner)
        self.assertEqual(out["status"], "national_id_format_candidate")
        self.assertFalse(out["identityVerified"])
        self.assertFalse(out["authenticityVerified"])
        self.assertTrue(out["manualReviewRequired"])
        self.assertFalse(out["stored"])
        self.assertNotIn("rawOcrText", out)
        self.assertNotIn("imageBytes", out)
        self.assertNotIn("uid", out)

    def test_invalid_or_strange_results_never_upgrade(self):
        for response in (None, {}, {"status": "verified"}, {"status": "pass"}):
            with self.subTest(response=response):
                result = process_request(
                    {"front": encode(FRONT), "back": encode(BACK)},
                    scanner=lambda _f, _b: response,
                )
                self.assertEqual(result["status"], "needs_review")
                self.assertFalse(result.get("identityVerified", False))

    def test_staging_page_gate_and_no_cloud_upload(self):
        repo = Path(__file__).resolve().parent.parent
        page = (repo / "app/identity-verification.web.tsx").read_text(encoding="utf-8")
        component = (repo / "components/identity/StagingNationalIdLocalLab.web.tsx").read_text(encoding="utf-8")
        bridge = (repo / "identity-ai/staging_national_id_loopback.py").read_text(encoding="utf-8")
        self.assertIn("step === 1 && canOpenLocalFaceDemo", page)
        self.assertIn("identityEnvironmentTarget", page)
        self.assertIn('http://127.0.0.1:8765/check', component)
        for forbidden in ("volunserve.com/api", "firebase/storage", "/api/identity/verify",
                          "setDoc(", "updateDoc(", "uploadBytes("):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, component)
                self.assertNotIn(forbidden, bridge)
        self.assertIn('router.push("/identity-manual-review"', component)
        self.assertIn("manualReviewRequired", bridge)

if __name__ == "__main__":
    unittest.main()
