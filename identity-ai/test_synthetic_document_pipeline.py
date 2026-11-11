"""Synthetic image-to-OCR-to-review-routing integration checks.

These images are fabricated in RAM, clearly marked DEMO and are not IDs.
Exercises actual OpenCV + Tesseract + government-ID OCR code without sending
photos, enrolling people, calling providers, or writing to Firestore.
A recognized *label* is never proof of genuine document issuance.
"""
import unittest
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

from main import image_quality, screen_government_id
from document_screening import blurry_national_id_claim_needs_review


def synthetic_photo(lines, *, blur=False):
    """Render large legible black text to a clearly fake card-shaped image."""
    img = np.full((760, 1260, 3), 245, dtype=np.uint8)
    cv2.rectangle(img, (25, 25), (1230, 725), (35, 35, 35), 5)
    for index, line in enumerate(lines):
        cv2.putText(
            img, line, (50, 115 + index * 96),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.45 if index < 2 else 1.28,
            (20, 20, 20), 3, cv2.LINE_AA,
        )
    if blur:
        img = cv2.GaussianBlur(img, (31, 31), 9)
    buf = BytesIO()
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(buf, format="PNG")
    return buf.getvalue(), image_quality(img)


NATIONAL_SAMPLE = (
    "PHILIPPINE IDENTIFICATION CARD",
    "DEMO SAMPLE - NOT A REAL ID",
    "SURNAME: SAMPLE",
    "GIVEN NAMES: TEST",
    "DATE OF BIRTH: 2000",
)
BACK_SIDE_SAMPLE = (
    "BLOOD TYPE: O",
    "MARITAL STATUS: SINGLE",
    "PLACE OF BIRTH: TEST CITY",
    "DEMO - NOT A REAL ID",
)

SCHOOL_SAMPLE = (
    "SCHOOL ID",
    "DEMO SAMPLE - NOT A REAL ID",
    "STUDENT CARD",
    "SURNAME: SAMPLE",
)
EMPLOYEE_SAMPLE = (
    "EMPLOYEE ID",
    "DEMO SAMPLE - NOT A REAL ID",
    "STAFF CARD",
)


class SyntheticDocumentImagePipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.national_clear, cls.quality_clear = synthetic_photo(NATIONAL_SAMPLE)
        cls.national_blurry, cls.quality_blurry = synthetic_photo(
            NATIONAL_SAMPLE, blur=True
        )

    def test_clear_synthetic_header_and_profile_name_are_not_authenticity(self):
        result = screen_government_id(
            declared_type="national_id",
            id_document_bytes=self.national_clear,
            expected_first_name="TEST",
            expected_last_name="SAMPLE",
        )
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertEqual(result["detectedIdType"], "national_id")
        self.assertEqual(result["profileNameCheck"], "possible_match")
        self.assertEqual(result["imageQualityStatus"], "adequate")
        self.assertFalse(result["authenticityVerified"])
        self.assertTrue(result["manualReviewRequired"])

    def test_blurry_synthetic_claim_routes_for_human_rescan_not_approval(self):
        result = screen_government_id(
            declared_type="national_id",
            id_document_bytes=self.national_blurry,
            expected_first_name="TEST",
            expected_last_name="SAMPLE",
        )
        self.assertGreater(self.quality_clear["blurVariance"], 40.0)
        self.assertLess(self.quality_blurry["blurVariance"], 40.0)
        self.assertEqual(result["imageQualityStatus"], "low")
        self.assertIn("low_document_image_quality", result["warningCodes"])
        self.assertTrue(blurry_national_id_claim_needs_review("national_id", result))
        self.assertFalse(result["authenticityVerified"])

    def test_correct_synthetic_philid_front_and_back_are_not_reversed(self):
        reverse_image, _ = synthetic_photo(BACK_SIDE_SAMPLE)
        result = screen_government_id(
            declared_type="national_id",
            id_document_bytes=self.national_clear,
            id_back_document_bytes=reverse_image,
        )
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertNotIn("document_front_back_swapped", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])
        self.assertTrue(result["manualReviewRequired"])

    def test_synthetic_swapped_philid_sides_are_rejected_before_face_matching(self):
        reverse_image, _ = synthetic_photo(BACK_SIDE_SAMPLE)
        result = screen_government_id(
            declared_type="national_id",
            id_document_bytes=reverse_image,
            id_back_document_bytes=self.national_clear,
        )
        self.assertEqual(result["status"], "mismatch")
        self.assertIn("document_front_back_swapped", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))

    def test_synthetic_duplicate_front_image_is_not_accepted_as_front_and_back(self):
        result = screen_government_id(
            declared_type="national_id",
            id_document_bytes=self.national_clear,
            id_back_document_bytes=self.national_clear,
        )
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("document_back_looks_like_front", result["warningCodes"])

    def test_school_card_claiming_national_id_is_unsupported_not_reviewable(self):
        image, _ = synthetic_photo(SCHOOL_SAMPLE)
        result = screen_government_id(
            declared_type="national_id", id_document_bytes=image
        )
        self.assertEqual(result["status"], "unsupported")
        self.assertIn("school_id_not_supported", result["warningCodes"])
        self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))

    def test_employee_id_claiming_national_id_is_unsupported(self):
        image, _ = synthetic_photo(EMPLOYEE_SAMPLE)
        result = screen_government_id(
            declared_type="national_id", id_document_bytes=image
        )
        self.assertEqual(result["status"], "unsupported")
        self.assertFalse(result["authenticityVerified"])

    def test_national_id_text_with_passport_selection_is_mismatch(self):
        result = screen_government_id(
            declared_type="passport", id_document_bytes=self.national_clear
        )
        self.assertEqual(result["status"], "mismatch")
        self.assertEqual(result["detectedIdType"], "national_id")

    def test_corrupt_image_does_not_become_blurry_approval_candidate(self):
        result = screen_government_id(
            declared_type="national_id",
            id_document_bytes=b"not-an-image",
        )
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["imageQualityStatus"], "unknown")
        self.assertIn("ocr_unavailable", result["warningCodes"])
        self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))


if __name__ == "__main__":
    unittest.main()
