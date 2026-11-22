"""Synthetic National ID OCR failure recovery, never real documents or users."""
from io import BytesIO
import unittest
from unittest.mock import patch
import cv2
import numpy as np

from main import (
    _avoid_national_id_back_qr_noise, extract_government_id_text,
    screen_government_id,
)
from test_synthetic_document_pipeline import synthetic_photo, NATIONAL_SAMPLE, BACK_SIDE_SAMPLE


class NationalIdPartialOcrTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.front, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back, _ = synthetic_photo(BACK_SIDE_SAMPLE)

    @staticmethod
    def fake_ocr(data, label, *, side="front", declared_type="national_id"):
        if side == "back":
            raise RuntimeError("Private test-only failure, do not log")
        return ("PHILIPPINE IDENTIFICATION CARD\n"
                "SURNAME: SAMPLE\nGIVEN NAMES: TEST\n"
                "DATE OF BIRTH: 2000-02-03")

    def test_backside_failure_keeps_front_name_check_and_fails_closed(self):
        with patch("main.extract_government_id_text", side_effect=self.fake_ocr):
            output = screen_government_id(
                declared_type="national_id", id_document_bytes=self.front,
                id_back_document_bytes=self.back,
                expected_first_name="MATEO", expected_last_name="MUNSAYAC",
            )
        self.assertEqual(output["status"], "inconclusive")
        self.assertEqual(output["detectedIdType"], "national_id")
        self.assertEqual(output["profileNameCheck"], "possible_conflict")
        self.assertIn("document_back_ocr_inconclusive", output["warningCodes"])
        self.assertFalse(output["backSideScreened"])
        self.assertFalse(output["authenticityVerified"])
        self.assertFalse(output["livenessVerified"])

    def test_frontside_failure_cannot_upgrade_back_only_ocr_to_pass(self):
        def fail_front(data, label, *, side="front", declared_type="national_id"):
            if side == "front":
                raise TimeoutError("never log OCR contents")
            return "BLOOD TYPE: O\nMARITAL STATUS: SINGLE\nPLACE OF BIRTH: DEMO"
        with patch("main.extract_government_id_text", side_effect=fail_front):
            output = screen_government_id(
                declared_type="national_id", id_document_bytes=self.front,
                id_back_document_bytes=self.back,
                expected_first_name="TEST", expected_last_name="SAMPLE",
            )
        self.assertEqual(output["status"], "inconclusive")
        self.assertIsNone(output["detectedIdType"])
        self.assertEqual(output["profileNameCheck"], "inconclusive")
        self.assertIn("ocr_unavailable", output["warningCodes"])
        self.assertFalse(output["authenticityVerified"])

    def test_school_id_stays_unsupported_when_reverse_unavailable(self):
        def fake_school(data, label, *, side="front", declared_type="national_id"):
            if side == "back":
                raise RuntimeError("synthetic-only")
            return "SCHOOL ID\nSTUDENT CARD\nSURNAME: SAMPLE\nGIVEN NAMES: TEST"
        with patch("main.extract_government_id_text", side_effect=fake_school):
            output = screen_government_id(
                declared_type="national_id", id_document_bytes=self.front,
                id_back_document_bytes=self.back,
            )
        self.assertEqual(output["status"], "unsupported")
        self.assertIn("school_id_not_supported", output["warningCodes"])

    def test_primary_ocr_timeout_retries_once_with_smaller_input(self):
        with patch("main.pytesseract.image_to_string",
                   side_effect=[RuntimeError("PRIVATE IMAGE"), "PHILIPPINE IDENTIFICATION CARD"]) as mock:
            with self.assertLogs(level="WARNING") as logger:
                text = extract_government_id_text(self.front, "synthetic card")
        self.assertEqual(text, "PHILIPPINE IDENTIFICATION CARD")
        self.assertEqual(mock.call_count, 2)
        self.assertEqual(mock.call_args_list[0].kwargs["timeout"], 20)
        self.assertEqual(mock.call_args_list[1].kwargs["timeout"], 15)
        self.assertLessEqual(max(mock.call_args_list[1].args[0].shape), 1250)
        self.assertNotIn("PRIVATE IMAGE", " ".join(logger.output))

    def test_readable_primary_ocr_only_runs_once(self):
        with patch("main.pytesseract.image_to_string", return_value="PHILIPPINE IDENTIFICATION CARD\nSURNAME: SAMPLE\nGIVEN NAMES: TEST") as mock:
            self.assertEqual(extract_government_id_text(self.front, "synthetic card"), "PHILIPPINE IDENTIFICATION CARD\nSURNAME: SAMPLE\nGIVEN NAMES: TEST")
        mock.assert_called_once()

    def test_qr_heavy_right_side_is_avoided_without_reading_qr(self):
        image = np.full((720, 1280), 250, dtype=np.uint8)
        rng = np.random.default_rng(42)
        blocks = rng.integers(0, 2, (70, 65), dtype=np.uint8)
        image[10:710, 630:1280] = cv2.resize(
            blocks * 255, (650, 700), interpolation=cv2.INTER_NEAREST
        )
        cropped = _avoid_national_id_back_qr_noise(image)
        self.assertLess(cropped.shape[1], image.shape[1])
        self.assertGreater(cropped.shape[1], 650)

    def test_landscape_without_qr_keeps_full_frame(self):
        image = np.full((720, 1280), 250, dtype=np.uint8)
        result = _avoid_national_id_back_qr_noise(image)
        self.assertEqual(result.shape, image.shape)


if __name__ == "__main__":
    unittest.main()
