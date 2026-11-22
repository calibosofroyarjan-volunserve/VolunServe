"""Synthetic, private National ID card auto-crop and OCR regression tests.

No user uploads, actual card numbers, face images, or network requests.
"""
import unittest
from unittest.mock import patch
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

from main import (
    crop_national_id_for_ocr, extract_government_id_text,
    screen_government_id, image_quality,
)
from test_synthetic_document_pipeline import (
    synthetic_photo, NATIONAL_SAMPLE, BACK_SIDE_SAMPLE,
)


class CardAutoCropTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.front_bytes, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back_bytes, _ = synthetic_photo(BACK_SIDE_SAMPLE)
        cls.front_image = cv2.imdecode(
            np.frombuffer(cls.front_bytes, dtype=np.uint8),
            cv2.IMREAD_COLOR,
        )

    def make_scene(self, angle=0):
        """Fabricated card occupies only 23% of dark camera view."""
        canvas = np.full((1200, 1600, 3), 72, dtype=np.uint8)
        card = cv2.resize(
            self.front_image, (850, 513),
            interpolation=cv2.INTER_AREA,
        )
        canvas[350:863, 365:1215] = card
        if angle:
            rotation = cv2.getRotationMatrix2D((800, 600), angle, 1)
            canvas = cv2.warpAffine(
                canvas, rotation, (1600, 1200),
                borderValue=(72, 72, 72),
            )
        return canvas

    def test_small_card_in_large_photo_is_auto_cropped(self):
        scene = self.make_scene()
        card = crop_national_id_for_ocr(scene)
        self.assertLess(card.shape[0] * card.shape[1],
                        scene.shape[0] * scene.shape[1] * 0.40)
        self.assertGreater(card.shape[1], 650)
        self.assertGreater(float(np.mean(card)), 170.0)
        self.assertLess(abs(card.shape[1] / card.shape[0] - 1.65), 0.25)

    def test_tilted_card_is_straightened(self):
        cropped = crop_national_id_for_ocr(self.make_scene(angle=8))
        self.assertLess(cropped.shape[0] * cropped.shape[1],
                        1200 * 1600 * 0.40)
        self.assertGreater(float(np.mean(cropped)), 160.0)

    def test_when_no_credible_card_edge_keep_original(self):
        image = np.full((1200, 1600, 3), 105, dtype=np.uint8)
        cropped = crop_national_id_for_ocr(image)
        self.assertEqual(cropped.shape, image.shape)
        self.assertTrue(np.array_equal(cropped, image))

    def test_full_frame_card_is_not_cropped_by_background_detector(self):
        cropped = crop_national_id_for_ocr(self.front_image)
        self.assertEqual(cropped.shape, self.front_image.shape)

    def test_scanner_uses_crop_before_tesseract(self):
        scene = self.make_scene()
        with BytesIO() as buf:
            Image.fromarray(cv2.cvtColor(scene, cv2.COLOR_BGR2RGB)).save(
                buf, format="PNG",
            )
            data = buf.getvalue()
        ocr_text = (
            "PHILIPPINE IDENTIFICATION CARD\n"
            "SURNAME: SAMPLE\nGIVEN NAMES: TEST\n"
            "DATE OF BIRTH: 2000"
        )
        with patch("main.pytesseract.image_to_string",
                   return_value=ocr_text) as mock:
            text = extract_government_id_text(
                data, "synthetic front",
                side="front", declared_type="national_id",
            )
        self.assertEqual(text, ocr_text)
        mock.assert_called_once()
        array = mock.call_args.args[0]
        self.assertLess(max(array.shape), 1401)
        self.assertGreater(min(array.shape), 350)

    def test_crop_does_not_override_different_name(self):
        scene = self.make_scene()
        with BytesIO() as buf:
            Image.fromarray(cv2.cvtColor(scene, cv2.COLOR_BGR2RGB)).save(
                buf, format="PNG",
            )
            front = buf.getvalue()
        with patch("main.extract_government_id_text",
                   side_effect=[
                       "PHILIPPINE IDENTIFICATION CARD\n"
                       "SURNAME: SAMPLE\nGIVEN NAMES: TEST",
                       "BLOOD TYPE: O\nMARITAL STATUS: SINGLE",
                   ]):
            status = screen_government_id(
                declared_type="national_id",
                id_document_bytes=front,
                id_back_document_bytes=self.back_bytes,
                expected_first_name="MATEO",
                expected_last_name="MUNSAYAC",
            )
        self.assertEqual(status["profileNameCheck"], "possible_conflict")
        self.assertFalse(status["authenticityVerified"])
        self.assertFalse(status["livenessVerified"])


if __name__ == "__main__":
    unittest.main()
