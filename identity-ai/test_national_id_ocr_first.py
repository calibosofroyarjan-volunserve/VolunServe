"""Offline, synthetic National ID OCR-first routing regression tests.

No real ID images, selfie photos, Firebase writes, or production API calls.
The existing face matcher is mocked to test that the route gates decisions.
"""
import asyncio
import os
import unittest
from io import BytesIO
from unittest.mock import patch

from starlette.datastructures import Headers, UploadFile
from main import verify_identity


def make_upload(name):
    return UploadFile(
        file=BytesIO(b"SYNTHETIC-TEST-NOT-AN-IMAGE"),
        filename=name,
        headers=Headers({"content-type": "image/png"}),
    )


class FakeRequest:
    headers = {"content-type": "multipart/form-data; boundary=synthetic-test"}

    def __init__(self, id_type):
        self.items = {
            "idType": id_type,
            "idDocument": make_upload("fake-id.png"),
            "selfie": make_upload("fake-selfie.png"),
        }

    async def form(self):
        return self.items


class NationalIdOcrFirstTests(unittest.TestCase):
    def exercise_route(self, id_type, screening):
        request = FakeRequest(id_type)
        fake_match = {
            "ok": True, "verificationId": "test-only", "status": "pending",
            "decision": "manual_review", "matchScore": 0.90,
            "livenessScore": None, "livenessImplemented": False,
        }
        with patch.dict(os.environ, {"IDENTITY_AI_INTERNAL_KEY": "synthetic-key"}):
            with patch("main.face_mesh_engine_ready", return_value=True):
                with patch("main.screen_government_id", return_value=screening) as screen:
                    with patch("main.run_face_verification", return_value=fake_match) as face:
                        result = asyncio.run(verify_identity(
                            request, x_volunserve_user_id="synthetic-resident",
                            x_volunserve_internal_key="synthetic-key",
                        ))
        self.assertEqual(result["documentScreening"], screening)
        self.assertEqual(result["idType"], id_type)
        screen.assert_called_once()
        for key in ("idDocument", "selfie"):
            self.assertTrue(request.items[key].file.closed)
        return result, face

    def test_unrecognized_national_id_routes_to_admin_without_face_verdict(self):
        result, face = self.exercise_route("national_id", {
            "status": "inconclusive", "detectedIdType": None,
            "authenticityVerified": False, "manualReviewRequired": True,
        })
        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["decision"], "manual_review")
        self.assertIsNone(result["matchScore"])
        self.assertIsNone(result["livenessScore"])
        self.assertIn("national_id_ocr_requires_manual_review", result["warnings"])
        face.assert_not_called()

    def test_wrong_id_type_routes_to_admin_without_face_verdict(self):
        result, face = self.exercise_route("national_id", {
            "status": "mismatch", "detectedIdType": "passport",
            "authenticityVerified": False, "manualReviewRequired": True,
        })
        self.assertEqual(result["status"], "pending")
        self.assertIsNone(result["matchScore"])
        face.assert_not_called()

    def test_consistent_national_id_proceeds_to_face_comparison(self):
        result, face = self.exercise_route("national_id", {
            "status": "text_consistent_unverified",
            "detectedIdType": "national_id",
            "authenticityVerified": False, "manualReviewRequired": True,
        })
        face.assert_called_once()
        self.assertEqual(result["decision"], "manual_review")
        self.assertEqual(result["matchScore"], 0.90)

    def test_ocr_failure_routes_to_admin_not_approval(self):
        result, face = self.exercise_route("national_id", {
            "status": "inconclusive", "detectedIdType": None,
            "warningCodes": ["ocr_unavailable"],
        })
        self.assertEqual(result["status"], "pending")
        face.assert_not_called()

    def test_other_legacy_id_type_keeps_face_match_path(self):
        result, face = self.exercise_route("drivers_license", {
            "status": "inconclusive", "detectedIdType": None,
        })
        face.assert_called_once()
        self.assertEqual(result["status"], "pending")


if __name__ == "__main__":
    unittest.main()
