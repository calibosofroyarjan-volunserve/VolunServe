"""No-person, no-photo synthetic validation of the local review's safe contract."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import local_national_id_selfie_review as local


class TestLocalReview(unittest.TestCase):
    def test_nothing_is_automatically_verified(self):
        result = local.safe_summary(
            {"status": "text_consistent_unverified", "detectedIdType": "national_id",
             "imageQualityStatus": "adequate", "backImageQualityStatus": "adequate",
             "warningCodes": []},
            {"status": "pending", "decision": "manual_review", "matchScore": 0.91},
        )
        self.assertIn("NOT VERIFIED IDENTITY", result)
        self.assertIn("manual Admin review still required", result)
        self.assertIn("Uncalibrated similarity score", result)
        self.assertNotIn("Automatically approved", result)

    def test_unsupported_document_is_not_match(self):
        result = local.safe_summary({"status": "unsupported", "detectedIdType": None,
                                     "warningCodes": ["school_id_not_supported"]})
        self.assertIn("not established", result)
        self.assertIn("Not performed", result)
        self.assertIn("school_id_not_supported", result)

    def test_no_score_for_nan_infinity_or_bool(self):
        for value in (float("nan"), float("inf"), True):
            with self.subTest(value=value):
                rendered = local.safe_summary({"warningCodes": []},
                                              {"decision": "manual_review", "matchScore": value})
                self.assertNotIn("Uncalibrated similarity score", rendered)

    def test_local_input_rejects_symlinks_and_nonimages(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            bad = root / "test.txt"
            bad.write_bytes(b"not an image")
            with self.assertRaises(ValueError):
                local.read_selected_image(str(bad))
            jpg = root / "scan.jpg"
            jpg.write_bytes(b"fake synthetic bytes")
            self.assertEqual(local.read_selected_image(str(jpg)), b"fake synthetic bytes")
            link = root / "link.jpg"
            try:
                link.symlink_to(jpg)
            except OSError:
                return
            with self.assertRaises(ValueError):
                local.read_selected_image(str(link))


if __name__ == "__main__":
    unittest.main()
