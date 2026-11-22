"""Synthetic, offline National ID name feedback regression tests.

No genuine IDs, Firebase requests, network calls, selfies or account writes.
"""
import unittest

from document_screening import assess_profile_name
from main import document_precheck
from test_document_precheck import FakeRequest, fake_image, internal_key
from test_synthetic_document_pipeline import (
    synthetic_photo, NATIONAL_SAMPLE, BACK_SIDE_SAMPLE,
)


class NameFeedbackUnitTests(unittest.TestCase):
    def test_matching_labeled_fields(self):
        text = "PHILIPPINE IDENTIFICATION CARD\nSURNAME: SAMPLE\nGIVEN NAMES: TEST\nDATE OF BIRTH: 2000-02-03"
        state = assess_profile_name("TEST", "SAMPLE", text)
        self.assertEqual(state["profileNameCheck"], "possible_match")

    def test_different_labeled_names_are_potential_conflict(self):
        text = "PHILIPPINE IDENTIFICATION CARD\nSURNAME: SAMPLE\nGIVEN NAMES: TEST"
        state = assess_profile_name("MATEO", "MUNSAYAC", text)
        self.assertEqual(state["profileNameCheck"], "possible_conflict")
        self.assertTrue(state["profileNameCompared"])
        self.assertNotIn("MATEO", repr(state))
        self.assertNotIn("TEST", repr(state))

    def test_tagalog_bilingual_labels_can_be_read(self):
        text = ("PHILIPPINE IDENTIFICATION CARD\n"
                "APELYIDO/LAST NAME\nSAMPLE\n"
                "MGA PANGALAN/GIVEN NAMES\nTEST")
        self.assertEqual(assess_profile_name("TEST", "SAMPLE", text)["profileNameCheck"], "possible_match")

    def test_unreadable_fields_are_not_a_false_conflict(self):
        text = "PHILIPPINE IDENTIFICATION CARD\n? ? OCR ???"
        self.assertEqual(assess_profile_name("MATEO", "MUNSAYAC", text)["profileNameCheck"], "inconclusive")

    def test_unrelated_text_with_other_name_is_not_conflict(self):
        text = "PHILIPPINE IDENTIFICATION CARD\nDATE OF BIRTH 2000\nDEMO TEST SAMPLE"
        self.assertEqual(assess_profile_name("MATEO", "MUNSAYAC", text)["profileNameCheck"], "inconclusive")

    def test_partial_labels_are_inconclusive(self):
        text = "SURNAME: SAMPLE\nSOME OTHER OCR"
        self.assertEqual(assess_profile_name("MATEO", "MUNSAYAC", text)["profileNameCheck"], "inconclusive")

    def test_no_profile_name_is_not_checked(self):
        text = "SURNAME: SAMPLE\nGIVEN NAMES: TEST"
        self.assertEqual(assess_profile_name("", "SAMPLE", text)["profileNameCheck"], "not_checked")


class NameFeedbackPrivatePrecheckTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.front, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back, _ = synthetic_photo(BACK_SIDE_SAMPLE)

    async def precheck(self, given, surname):
        fields = {
            "idType": "national_id",
            "idDocument": fake_image(self.front),
            "idBackDocument": fake_image(self.back),
        }
        with internal_key():
            return await document_precheck(
                FakeRequest(fields),
                x_volunserve_user_id="synthetic-privacy-test",
                x_volunserve_internal_key="test-private-key",
                x_volunserve_profile_first_name=given,
                x_volunserve_profile_last_name=surname,
                x_volunserve_profile_date_of_birth="",
                x_volunserve_profile_barangay="",
            )

    async def test_matching_name_allows_preliminary_ocr_only(self):
        result = await self.precheck("TEST", "SAMPLE")
        self.assertEqual(result["outcome"], "pass")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "possible_match")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])

    async def test_confident_different_name_requests_rescan_not_face_scan(self):
        result = await self.precheck("MATEO", "MUNSAYAC")
        self.assertEqual(result["outcome"], "retry")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "possible_conflict")
        self.assertIn("Please check the name", result["message"])
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])
        # Neither raw OCR nor profile names are echoed in the response.
        for private in ("MATEO", "MUNSAYAC", "SAMPLE", "TEST"):
            self.assertNotIn(private, repr(result).upper())


if __name__ == "__main__":
    unittest.main()
