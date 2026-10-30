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

    def test_philid_paper_and_digital_variants(self):
        samples = (
            "REPUBLIKA NG PILIPINAS PAMBANSANG PAGKAKAKILANLAN",
            "NATIONAL ID CARD APelyido Juan",
            "NATIONAL ID IN PAPER FIRST NAME DATE OF BIRTH",
            "Digital National ID first name last name",
            "ePhilID Republic of the Philippines",
        )
        for sample in samples:
            with self.subTest(sample=sample):
                outcome = assess_document_text("national_id", sample)
                self.assertEqual(outcome["detectedIdType"], "national_id")
                self.assertEqual(outcome["status"], "text_consistent_unverified")
                self.assertFalse(outcome["authenticityVerified"])
                self.assertTrue(outcome["manualReviewRequired"])

    def test_philsys_brand_alone_does_not_establish_card_type(self):
        for sample in (
            "PhilSys",
            "Philippine Identification System information campaign",
            "National ID system registration center",
            "Republic of the Philippines ID for everyone",
        ):
            with self.subTest(sample=sample):
                outcome = assess_document_text("national_id", sample)
                self.assertIsNone(outcome["detectedIdType"])
                self.assertEqual(outcome["status"], "inconclusive")

    def test_weak_brand_plus_multiple_card_fields(self):
        sample = "PhilSys APELYIDO DELA CRUZ MGA PANGALAN ANA PETSA NG KAPANGANAKAN 1990"
        actual = assess_document_text("national_id", sample)
        self.assertEqual(actual["detectedIdType"], "national_id")
        self.assertEqual(actual["status"], "text_consistent_unverified")
        self.assertNotIn("ANA", repr(actual))
        self.assertNotIn("1990", repr(actual))

    def test_wrong_declared_id_not_approved_by_national_id_text(self):
        result = assess_document_text("drivers_license", "NATIONAL ID IN PAPER GIVEN NAMES TEST")
        self.assertEqual(result["status"], "mismatch")
        self.assertFalse(result["authenticityVerified"])

    def test_combined_id_documents_need_manual_review(self):
        result = assess_document_text("national_id", "PhilID with PASSPORT")
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("multiple_document_type_signals", result["warningCodes"])

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
