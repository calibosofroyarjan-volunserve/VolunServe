"""Standard-library tests; no biometric samples or government IDs required."""
import unittest

from back_quality_policy import back_quality_warning


class NationalIdBackQualityTests(unittest.TestCase):
    def test_mild_blur_above_threshold_is_not_automatically_rejected(self):
        self.assertIsNone(back_quality_warning(0.52, 0.34))

    def test_very_blurry_image_requires_manual_review(self):
        self.assertEqual(
            back_quality_warning(0.10, 0.34),
            "low_id_back_image_quality",
        )

    def test_quality_exactly_at_threshold_is_allowed(self):
        self.assertIsNone(back_quality_warning(0.34, 0.34))

    def test_missing_or_invalid_score_requires_inconclusive_review(self):
        for score in (None, float("nan"), float("inf"), "bad"):
            with self.subTest(score=score):
                self.assertEqual(
                    back_quality_warning(score, 0.34),
                    "id_back_image_quality_inconclusive",
                )


if __name__ == "__main__":
    unittest.main()
