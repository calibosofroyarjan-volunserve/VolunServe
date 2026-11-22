"""Regression checks: mild OCR blur vs severe blur and real name differences.

Fabricated DEMO images only. No real IDs, account credentials, face images,
network calls, database access or biometrics.
"""
from io import BytesIO
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image

from main import (
    _ocr_readability_clues, extract_government_id_text,
    screen_government_id, document_precheck, image_quality,
)
from test_synthetic_document_pipeline import synthetic_photo, NATIONAL_SAMPLE, BACK_SIDE_SAMPLE
from test_document_precheck import FakeRequest, fake_image, internal_key


FRONT_TEXT = (
    "PHILIPPINE IDENTIFICATION CARD\n"
    "SURNAME: SAMPLE\n"
    "GIVEN NAMES: TEST\n"
    "DATE OF BIRTH: 2000-02-03"
)
BACK_TEXT = (
    "BLOOD TYPE: O\n"
    "MARITAL STATUS: SINGLE\n"
    "PLACE OF BIRTH: TEST CITY"
)


def blurred_photo(original: bytes, *, sigma: float) -> tuple[bytes, float]:
    img = cv2.imdecode(np.frombuffer(original, dtype=np.uint8), cv2.IMREAD_COLOR)
    result = cv2.GaussianBlur(img, (0, 0), sigmaX=sigma)
    with BytesIO() as buf:
        Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB)).save(buf, format="PNG")
        return buf.getvalue(), float(image_quality(result)["blurVariance"])


class SyntheticBlurAndFallbackUnitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.front, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back, _ = synthetic_photo(BACK_SIDE_SAMPLE)

    def test_garbage_ocr_is_not_accepted_without_second_read(self):
        with patch("main.pytesseract.image_to_string",
                   side_effect=["random noise 888", FRONT_TEXT]) as mock:
            text = extract_government_id_text(
                self.front, "fabricated", side="front", declared_type="national_id"
            )
        self.assertEqual(text, FRONT_TEXT)
        self.assertEqual(mock.call_count, 2)

    def test_labeled_clean_name_needs_one_pass(self):
        with patch("main.pytesseract.image_to_string", return_value=FRONT_TEXT) as mock:
            text = extract_government_id_text(
                self.front, "fabricated", side="front", declared_type="national_id"
            )
        self.assertEqual(text, FRONT_TEXT)
        mock.assert_called_once()

    def test_school_card_clue_does_not_get_replaced_by_fallback(self):
        text_school = "SCHOOL ID\nSTUDENT CARD\nSURNAME: SAMPLE"
        with patch("main.pytesseract.image_to_string", return_value=text_school) as mock:
            result = extract_government_id_text(
                self.front, "fabricated", side="front", declared_type="national_id"
            )
        self.assertEqual(result, text_school)
        mock.assert_called_once()

    def test_moderate_blur_is_allowed_if_both_name_fields_are_readable(self):
        mildly_blurred, variance = blurred_photo(self.front, sigma=2.4)
        self.assertGreaterEqual(variance, 12, f"synthetic mild blur variance={variance}")
        self.assertLess(variance, 40, f"synthetic mild blur variance={variance}")
        with patch("main.extract_government_id_text",
                   side_effect=[FRONT_TEXT, BACK_TEXT]):
            result = screen_government_id(
                declared_type="national_id",
                id_document_bytes=mildly_blurred, id_back_document_bytes=self.back,
                expected_first_name="TEST", expected_last_name="SAMPLE",
            )
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertEqual(result["imageQualityStatus"], "adequate")
        self.assertEqual(result["profileNameCheck"], "possible_match")
        self.assertFalse(result["authenticityVerified"])

    def test_blur_does_not_allow_different_account_name(self):
        mildly_blurred, variance = blurred_photo(self.front, sigma=2.4)
        self.assertGreaterEqual(variance, 12)
        self.assertLess(variance, 40)
        with patch("main.extract_government_id_text",
                   side_effect=[FRONT_TEXT, BACK_TEXT]):
            result = screen_government_id(
                declared_type="national_id",
                id_document_bytes=mildly_blurred, id_back_document_bytes=self.back,
                expected_first_name="MATEO", expected_last_name="MUNSAYAC",
            )
        self.assertEqual(result["imageQualityStatus"], "adequate")
        self.assertEqual(result["profileNameCheck"], "possible_conflict")
        self.assertFalse(result["authenticityVerified"])

    def test_severely_blurred_remains_low_even_when_fake_ocr_returns_labels(self):
        severely_blurred, variance = blurred_photo(self.front, sigma=7.0)
        self.assertLess(variance, 12)
        with patch("main.extract_government_id_text",
                   side_effect=[FRONT_TEXT, BACK_TEXT]):
            result = screen_government_id(
                declared_type="national_id",
                id_document_bytes=severely_blurred, id_back_document_bytes=self.back,
                expected_first_name="TEST", expected_last_name="SAMPLE",
            )
        self.assertEqual(result["imageQualityStatus"], "low")
        self.assertIn("low_document_image_quality", result["warningCodes"])


class SyntheticNamePrecheckTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.front, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back, _ = synthetic_photo(BACK_SIDE_SAMPLE)

    async def check(self, given, surname, front_text=FRONT_TEXT):
        fields = {
            "idType": "national_id",
            "idDocument": fake_image(self.front),
            "idBackDocument": fake_image(self.back),
        }
        with internal_key(), patch("main.extract_government_id_text",
                                   side_effect=[front_text, BACK_TEXT]):
            return await document_precheck(
                FakeRequest(fields), x_volunserve_user_id="synthetic-test-only",
                x_volunserve_internal_key="test-private-key",
                x_volunserve_profile_first_name=given,
                x_volunserve_profile_last_name=surname,
                x_volunserve_profile_date_of_birth="",
                x_volunserve_profile_barangay="",
            )

    async def test_clear_different_name_is_explicitly_blocked_before_face_scan(self):
        result = await self.check("MATEO", "MUNSAYAC")
        self.assertEqual(result["outcome"], "retry")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "possible_conflict")
        self.assertIn("appears different", result["message"])
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])
        for forbidden in ("MATEO", "MUNSAYAC", "SAMPLE", "TEST"):
            self.assertNotIn(forbidden, repr(result).upper())

    async def test_unreadable_account_name_prevents_face_scan(self):
        result = await self.check("MATEO", "MUNSAYAC",
                                  front_text="PHILIPPINE IDENTIFICATION CARD")
        self.assertEqual(result["outcome"], "retry")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "inconclusive")
        self.assertIn("could not be confirmed", result["message"])

    async def test_matching_account_can_continue_to_face_scan_but_not_auto_verify(self):
        result = await self.check("TEST", "SAMPLE")
        self.assertEqual(result["outcome"], "pass")
        self.assertEqual(result["documentScreening"]["profileNameCheck"], "possible_match")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])


if __name__ == "__main__":
    unittest.main()
