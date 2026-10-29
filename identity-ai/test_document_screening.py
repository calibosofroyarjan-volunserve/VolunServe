import unittest

from document_screening import assess_document_text, document_ocr_unavailable


class GovernmentIdScreeningTests(unittest.TestCase):
    def test_national_id_header(self):
        actual = assess_document_text("national_id", "REPUBLIKA NG PILIPINAS PHILIPPINE IDENTIFICATION CARD")
        self.assertEqual(actual["status"], "text_consistent_unverified")
        self.assertEqual(actual["detectedIdType"], "national_id")
        self.assertFalse(actual["authenticityVerified"])
        self.assertTrue(actual["manualReviewRequired"])

    def test_drivers_license(self):
        actual = assess_document_text("drivers_license", "Republic of the Philippines Land Transportation Office DRIVER'S LICENSE")
        self.assertEqual(actual["detectedIdType"], "drivers_license")
        self.assertEqual(actual["status"], "text_consistent_unverified")

    def test_passport(self):
        actual = assess_document_text("passport", "REPUBLIC OF THE PHILIPPINES PASAPORTE / PASSPORT")
        self.assertEqual(actual["detectedIdType"], "passport")
        self.assertEqual(actual["status"], "text_consistent_unverified")

    def test_umid(self):
        actual = assess_document_text("other_government_id", "UNIFIED MULTI-PURPOSE ID")
        self.assertEqual(actual["status"], "text_consistent_unverified")
        self.assertEqual(actual["detectedIdType"], "other_government_id")

    def test_declared_type_mismatch(self):
        actual = assess_document_text("passport", "LAND TRANSPORTATION OFFICE DRIVER'S LICENSE")
        self.assertEqual(actual["status"], "mismatch")
        self.assertIn("selected_id_type_conflicts_with_ocr", actual["warningCodes"])

    def test_unrecognizable_or_forged_looking_text_cannot_pass(self):
        for raw in ("", "hello 123 personal card", "John Doe 0000 1111"):
            actual = assess_document_text("national_id", raw)
            self.assertEqual(actual["status"], "inconclusive")
            self.assertIsNone(actual["detectedIdType"])
            self.assertFalse(actual["authenticityVerified"])

    def test_multiple_document_keywords_are_ambiguous(self):
        actual = assess_document_text("national_id", "PHILSYS Passport Driver's License")
        self.assertEqual(actual["status"], "inconclusive")
        self.assertIn("multiple_document_type_signals", actual["warningCodes"])

    def test_no_biometric_or_ocr_personal_data_returned(self):
        text = "Philippine Identification Card Jane Example 1997-07-12 1234-5678-9012"
        actual = assess_document_text("national_id", text)
        serialized = repr(actual)
        for private in ("Jane", "1997", "1234", "9012"):
            self.assertNotIn(private, serialized)
        self.assertFalse(actual["livenessVerified"])

    def test_ocr_outage_never_grants_verification(self):
        actual = document_ocr_unavailable("national_id")
        self.assertEqual(actual["status"], "inconclusive")
        self.assertFalse(actual["authenticityVerified"])
        self.assertEqual(actual["warningCodes"], ["ocr_unavailable"])

    def test_unsupported_id_type_rejected(self):
        with self.assertRaises(ValueError):
            assess_document_text("student_card", "PhilSys")


if __name__ == "__main__":
    unittest.main()
