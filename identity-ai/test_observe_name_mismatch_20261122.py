"""Offline observation: current deployed AI OCR name-comparison behavior.

Synthetic sample ID images only. Never sends photos or profile information to
Render/Firebase or changes a real resident's verification status.
The mismatch-case assertion intentionally documents current behavior, NOT
desired security policy: an inconclusive name does not block face-scan stage.
"""
import unittest

from main import document_precheck
from test_document_precheck import FakeRequest, fake_image, internal_key
from test_synthetic_document_pipeline import synthetic_photo, NATIONAL_SAMPLE, BACK_SIDE_SAMPLE


class DeployedNameMismatchObservation(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.front, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back, _ = synthetic_photo(BACK_SIDE_SAMPLE)

    async def check(self, given, surname):
        fields = {
            "idType": "national_id",
            "idDocument": fake_image(self.front),
            "idBackDocument": fake_image(self.back),
        }
        with internal_key():
            return await document_precheck(
                FakeRequest(fields),
                x_volunserve_user_id="synthetic-only",
                x_volunserve_internal_key="test-private-key",
                x_volunserve_profile_first_name=given,
                x_volunserve_profile_last_name=surname,
                x_volunserve_profile_date_of_birth="",
                x_volunserve_profile_barangay="",
            )

    async def test_matched_account_name_is_possible_match_not_identity_proof(self):
        result = await self.check("TEST", "SAMPLE")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "possible_match")
        self.assertTrue(result["documentScreening"]["profileNameCompared"])
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])
        self.assertEqual(result["outcome"], "pass")

    async def test_mismatched_account_name_is_inconclusive_and_not_currently_blocked(self):
        result = await self.check("ALEX", "GARCIA")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "inconclusive")
        self.assertTrue(result["documentScreening"]["profileNameCompared"])
        # This confirms the EXISTING gap rather than approving a mismatch:
        # 'pass' means the ID-only preliminary check permits face scan,
        # never that the identity is verified; Admin approval remains required.
        self.assertEqual(result["outcome"], "pass")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])


if __name__ == "__main__":
    unittest.main()
