import unittest

from document_screening import assess_document_text, document_ocr_unavailable, combine_document_sides


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

    def test_ocr_apostrophe_split_in_drivers_license(self):
        # Tesseract often separates DRIVER'S into DRIVER S.
        for text in ("DRIVER'S LICENSE", "DRIVER S LICENSE", "DRIVERS LICENSE"):
            with self.subTest(text=text):
                actual = assess_document_text("drivers_license", text)
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

    def test_school_id_explicitly_rejected_even_if_declared_national(self):
        samples = (
            "STI COLLEGE STUDENT ID 2026-0001",
            "UNIVERSITY OF EXAMPLE STUDENT NUMBER 1234",
            "School ID Name: Sample Student",
            "STUDENT IDENTIFICATION CARD 2026",
        )
        for sample in samples:
            with self.subTest(sample=sample):
                result = assess_document_text("national_id", sample)
                self.assertEqual(result["status"], "mismatch")
                self.assertIsNone(result["detectedIdType"])
                self.assertIn("non_government_id_detected", result["warningCodes"])
                self.assertFalse(result["authenticityVerified"])

    def test_private_employee_id_rejected(self):
        result = assess_document_text("other_government_id", "ACME COMPANY ID - EMPLOYEE ID")
        self.assertEqual(result["status"], "mismatch")
        self.assertIn("non_government_id_detected", result["warningCodes"])

    def test_school_id_keywords_conflicting_with_government_id_need_review(self):
        result = assess_document_text(
            "national_id", "PHILIPPINE IDENTIFICATION CARD STUDENT ID")
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("multiple_document_type_signals", result["warningCodes"])
        self.assertIsNone(result["detectedIdType"])

    def test_school_name_alone_does_not_reject_genuine_id_type(self):
        result = assess_document_text(
            "national_id", "PHILIPPINE IDENTIFICATION CARD University of Sample")
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertEqual(result["detectedIdType"], "national_id")

    def test_front_only_old_clients_remain_compatible(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        merged = combine_document_sides(front, None)
        self.assertEqual(merged["status"], front["status"])
        self.assertEqual(merged["warningCodes"], front["warningCodes"])
        self.assertFalse(merged["backSideProvided"])
        self.assertFalse(merged["backSideScreened"])

    def test_school_id_on_back_rejects_even_with_good_front(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        back = assess_document_text("national_id", "STI SCHOOL ID STUDENT NUMBER 0001")
        merged = combine_document_sides(front, back)
        self.assertEqual(merged["status"], "mismatch")
        self.assertIn("non_government_id_detected", merged["warningCodes"])
        self.assertIsNone(merged["detectedIdType"])
        self.assertTrue(merged["backSideProvided"])
        self.assertTrue(merged["backSideScreened"])
        self.assertFalse(merged["authenticityVerified"])

    def test_unrecognized_back_text_does_not_require_front_heading(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        back = assess_document_text("national_id", "BLOOD TYPE O DATE OF ISSUE")
        merged = combine_document_sides(front, back)
        # A National ID reverse can have QR / issuance text, not the front header.
        # Quality is independently checked by the private precheck route.
        self.assertEqual(merged["status"], "text_consistent_unverified")
        self.assertEqual(merged["backTypeRecognized"], False)
        self.assertTrue(merged["manualReviewRequired"])
        self.assertFalse(merged["authenticityVerified"])

    def test_back_ocr_outage_is_inconclusive(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        merged = combine_document_sides(front, document_ocr_unavailable("national_id"))
        self.assertEqual(merged["status"], "inconclusive")
        self.assertIn("document_back_evidence_inconclusive", merged["warningCodes"])

    def test_two_different_government_types_need_review(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        back = assess_document_text("national_id", "DRIVER'S LICENSE")
        merged = combine_document_sides(front, back)
        self.assertEqual(merged["status"], "inconclusive")
        self.assertIn("document_back_type_conflict", merged["warningCodes"])
        self.assertFalse(merged["authenticityVerified"])

    def test_exact_duplicate_front_back_never_passes(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        merged = combine_document_sides(front, dict(front), duplicate=True)
        self.assertEqual(merged["status"], "inconclusive")
        self.assertIn("document_front_back_duplicate", merged["warningCodes"])

    def test_unavailable_back_ocr_never_proves_id(self):
        front = assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD")
        merged = combine_document_sides(front, document_ocr_unavailable("national_id"))
        self.assertEqual(merged["status"], "inconclusive")
        self.assertFalse(merged["backSideScreened"])
        self.assertFalse(merged["livenessVerified"])

    def test_unsupported_id_type_rejected(self):
        with self.assertRaises(ValueError):
            assess_document_text("student_card", "PhilSys")


if __name__ == "__main__":
    unittest.main()
