"""Tests for bounded OCR runtime using fabricated in-memory images only."""
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from main import extract_government_id_text


class BoundedOcrTests(unittest.TestCase):
    def _png(self, width, height):
        img = np.full((height, width, 3), 240, dtype=np.uint8)
        cv2.putText(img, "DEMO TEST NOT ID", (20, min(height - 25, 110)),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.15, (20, 20, 20), 2)
        ok, encoded = cv2.imencode(".png", img)
        self.assertTrue(ok)
        return encoded.tobytes()

    def test_large_image_is_resized_and_only_one_bounded_ocr_pass_is_used(self):
        with patch("main.pytesseract.image_to_string", return_value="SYNTHETIC OCR") as mock:
            result = extract_government_id_text(self._png(2600, 1800), "fabricated photo")
        self.assertEqual(result, "SYNTHETIC OCR")
        mock.assert_called_once()
        image = mock.call_args.args[0]
        self.assertLessEqual(max(image.shape), 1400)
        self.assertEqual(mock.call_args.kwargs["timeout"], 40)
        self.assertEqual(mock.call_args.kwargs["config"], "--oem 1 --psm 11")

    def test_readable_normal_image_not_needlessly_upscaled(self):
        with patch("main.pytesseract.image_to_string", return_value="DEMO") as mock:
            extract_government_id_text(self._png(1260, 760), "fabricated photo")
        self.assertEqual(mock.call_args.args[0].shape, (760, 1260))

    def test_small_capture_is_upscaled_but_stays_bounded(self):
        with patch("main.pytesseract.image_to_string", return_value="DEMO") as mock:
            extract_government_id_text(self._png(750, 450), "fabricated photo")
        img = mock.call_args.args[0]
        self.assertLessEqual(max(img.shape), 1400)
        self.assertGreaterEqual(max(img.shape), 750)


if __name__ == "__main__":
    unittest.main()
