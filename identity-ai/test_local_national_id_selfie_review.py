"""Synthetic no-media tests for camera-only National ID local research UI."""
import inspect
import unittest
import local_national_id_selfie_review as local


class CameraOnlyLocalReviewTests(unittest.TestCase):
    def test_no_file_upload_or_picker_in_user_interface(self):
        source = inspect.getsource(local.main)
        self.assertNotIn("askopenfilename", source)
        self.assertNotIn("filedialog", source)
        self.assertNotIn("read_selected_image", source)
        self.assertIn("START LIVE SCAN", source)
        self.assertIn("run_ocr_worker", source)
        self.assertIn("evaluate_camera_side", source)
        self.assertIn("evaluate_selfie_face", source)

    def test_automatic_review_does_not_verify_any_identity(self):
        result = local.safe_summary(
            {"status": "text_consistent_unverified",
             "detectedIdType": "national_id",
             "imageQualityStatus": "adequate",
             "backImageQualityStatus": "adequate",
             "warningCodes": []},
            {"status": "pending", "decision": "manual_review",
             "matchScore": 0.91},
        )
        self.assertIn("NOT VERIFIED IDENTITY", result)
        self.assertIn("manual Admin review still required", result)
        self.assertIn("Uncalibrated similarity score", result)

    def test_unsupported_id_stays_unmatched(self):
        result = local.safe_summary(
            {"status": "unsupported", "detectedIdType": None,
             "warningCodes": ["school_id_not_supported"]})
        self.assertIn("not established", result)
        self.assertIn("Not performed", result)
        self.assertIn("school_id_not_supported", result)

    def test_nan_inf_and_boolean_not_displayed_as_scores(self):
        for value in (float("nan"), float("inf"), True):
            with self.subTest(value=str(value)):
                text = local.safe_summary({"warningCodes": []},
                    {"decision": "manual_review", "matchScore": value})
                self.assertNotIn("Uncalibrated similarity score", text)

    def test_no_account_or_network_calls_in_camera_application(self):
        source = inspect.getsource(local.main)
        for forbidden in (
            "requests.post", "requests.get", "firebase", "httpx",
            "urlopen(", "Cloudinary", "verified=True", "open(\"",
            "cv2.imwrite", "filedialog"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
