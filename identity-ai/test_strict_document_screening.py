import unittest

from strict_document_screening import assess_document_text, assess_document_sides, assess_profile_name, document_ocr_unavailable, add_photo_quality, blurry_national_id_claim_needs_review


class GovernmentIdScreeningTests(unittest.TestCase):
    def test_missing_back_fail_closed_for_four_cards(self):
        for card, front in (
            ("national_id", "PHILIPPINE IDENTIFICATION CARD"),
            ("drivers_license", "DRIVER S LICENSE"),
            ("umid", "UNIFIED MULTI PURPOSE ID"),
            ("prc_id", "PRC PROFESSIONAL IDENTIFICATION CARD"),
        ):
            with self.subTest(card=card):
                outcome = assess_document_sides(card, front, None)
                self.assertEqual(outcome["status"], "inconclusive")
                self.assertIn("document_back_required", outcome["warningCodes"])
                self.assertFalse(outcome["backSideProvided"])
                self.assertFalse(outcome["authenticityVerified"])

    def test_duplicate_meaningful_front_text_needs_rescan(self):
        front = "NATIONAL ID CARD SURNAME SAMPLE GIVEN NAMES PERSON DATE OF BIRTH"
        outcome = assess_document_sides("national_id", front, front)
        self.assertEqual(outcome["status"], "inconclusive")
        self.assertIn("document_duplicate_side_text", outcome["warningCodes"])
        self.assertTrue(outcome["manualReviewRequired"])

    def test_blank_back_is_not_consistent(self):
        outcome = assess_document_sides(
            "drivers_license", "DRIVER S LICENSE LAND TRANSPORTATION OFFICE", ""
        )
        self.assertEqual(outcome["status"], "inconclusive")
        self.assertIn("document_back_ocr_inconclusive", outcome["warningCodes"])

    def test_non_supported_type_fails_even_with_matching_ocr(self):
        with self.assertRaises(ValueError):
            assess_document_sides("other_government_id", "PRC PROFESSIONAL IDENTIFICATION CARD", "")

    def test_blurry_national_id_claim_goes_to_human_rescan_review(self):
        for text in ("", "PHILIPPINE IDENTIFICATION CARD"):
            with self.subTest(text=text):
                result = add_photo_quality(
                    assess_document_text("national_id", text), 5.0
                )
                self.assertEqual(result["imageQualityStatus"], "low")
                self.assertTrue(blurry_national_id_claim_needs_review("national_id", result))
                self.assertFalse(result["authenticityVerified"])

    def test_clear_national_id_and_name_is_still_unverified(self):
        result = add_photo_quality(
            assess_document_text("national_id", "PHILIPPINE IDENTIFICATION CARD"), 120.0
        )
        self.assertEqual(result["imageQualityStatus"], "adequate")
        self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))
        self.assertFalse(result["authenticityVerified"])

    def test_school_id_does_not_become_blurry_national_id_pending(self):
        for text in (
            "UNIVERSITY STUDENT ID PHILIPPINE IDENTIFICATION CARD",
            "STUDENT ID",
            "EMPLOYEE ID NATIONAL ID CARD",
        ):
            with self.subTest(text=text):
                result = add_photo_quality(
                    assess_document_text("national_id", text), 3.0
                )
                self.assertEqual(result["status"], "unsupported")
                self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))

    def test_wrong_selected_type_stays_mismatch_even_if_blurry(self):
        result = add_photo_quality(
            assess_document_text("national_id", "DRIVER S LICENSE"), 1.0
        )
        self.assertEqual(result["status"], "mismatch")
        self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))

    def test_ocr_engine_error_does_not_open_unverified_blur_review(self):
        result = document_ocr_unavailable("national_id")
        self.assertEqual(result["imageQualityStatus"], "unknown")
        self.assertFalse(blurry_national_id_claim_needs_review("national_id", result))

    def test_account_name_may_appear_in_ocr_but_never_authenticates_id(self):
        result = assess_profile_name(
            "Maria", "Dela Cruz",
            "PHILIPPINE IDENTIFICATION CARD SURNAME DELA CRUZ GIVEN NAMES MARIA",
        )
        self.assertEqual(result["profileNameCheck"], "possible_match")
        self.assertNotIn("MARIA", repr(result))
        self.assertNotIn("CRUZ", repr(result))

    def test_ocr_missing_name_is_inconclusive_not_fraud(self):
        result = assess_profile_name(
            "Maria", "Dela Cruz",
            "NATIONAL ID CARD NAME UNREADABLE",
        )
        self.assertEqual(result["profileNameCheck"], "inconclusive")

    def test_short_or_missing_name_not_checked(self):
        result = assess_profile_name("Jo", "Li", "PHILIPPINE IDENTIFICATION CARD")
        self.assertEqual(result["profileNameCheck"], "not_checked")

    def test_generic_national_id_back_words_need_review_not_positive_screening(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD GIVEN NAMES",
            "REPUBLIKA NG PILIPINAS PSN QR CODE",
        )
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("document_back_evidence_inconclusive", result["warningCodes"])
        self.assertTrue(result["backSideProvided"])
        self.assertTrue(result["backSideScreened"])
        self.assertFalse(result["authenticityVerified"])
        self.assertTrue(result["manualReviewRequired"])

    def test_reversed_philid_front_and_back_are_not_accepted(self):
        result = assess_document_sides(
            "national_id",
            "BLOOD TYPE O MARITAL STATUS SINGLE PLACE OF BIRTH CITY",
            "PHILIPPINE IDENTIFICATION CARD SURNAME SAMPLE GIVEN NAMES TEST",
        )
        self.assertEqual(result["status"], "mismatch")
        self.assertIn("document_front_back_swapped", result["warningCodes"])
        self.assertTrue(result["manualReviewRequired"])
        self.assertFalse(result["authenticityVerified"])

    def test_double_front_scan_cannot_pass_as_front_and_back(self):
        text = "PHILIPPINE IDENTIFICATION CARD SURNAME SAMPLE GIVEN NAMES TEST"
        result = assess_document_sides("national_id", text, text)
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("document_back_looks_like_front", result["warningCodes"])

    def test_repeated_issuer_heading_alone_on_back_is_not_false_duplicate_front(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD SURNAME SAMPLE GIVEN NAMES TEST",
            "PHILID BLOOD TYPE O MARITAL STATUS SINGLE",
        )
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertNotIn("document_back_looks_like_front", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])

    def test_document_with_back_only_clues_in_front_fails_closed(self):
        result = assess_document_sides(
            "national_id",
            "BLOOD TYPE O MARITAL STATUS SINGLE",
            "UNREADABLE",
        )
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("document_front_side_conflict", result["warningCodes"])

    def test_front_header_only_on_back_remains_inconclusive_not_accepted(self):
        result = assess_document_sides(
            "drivers_license",
            "WEAK AND UNREADABLE FRONT",
            "LAND TRANSPORTATION OFFICE DRIVER S LICENSE",
        )
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("document_back_looks_like_front", result["warningCodes"])

    def test_school_id_on_swapped_pair_remains_unsupported(self):
        result = assess_document_sides(
            "national_id",
            "SCHOOL ID BLOOD TYPE O MARITAL STATUS SINGLE",
            "PHILIPPINE IDENTIFICATION CARD",
        )
        self.assertEqual(result["status"], "unsupported")
        self.assertIn("school_id_not_supported", result["warningCodes"])

    def test_valid_philid_front_and_back_labels_remain_unverified_not_swapped(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD SURNAME SAMPLE",
            "BLOOD TYPE O MARITAL STATUS SINGLE DATE OF ISSUE",
        )
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertNotIn("document_front_back_swapped", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])

    def test_wrong_type_back_flags_mismatch(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD",
            "DRIVER'S LICENSE LAND TRANSPORTATION OFFICE",
        )
        self.assertEqual(result["status"], "mismatch")
        self.assertIn("document_back_type_conflict", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])

    def test_unreadable_back_is_not_reported_as_authenticated(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD",
            "",
        )
        self.assertIn("document_back_ocr_inconclusive", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])

    def test_no_raw_private_id_data_survives_two_side_screening(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD SAMPLE PERSON 1988-11-21",
            "PSN 9999-8888-7777",
        )
        for forbidden in ("SAMPLE", "1988", "9999"):
            self.assertNotIn(forbidden, repr(result))

    def test_passport_bio_page_does_not_require_back_scan(self):
        result = assess_document_sides(
            "passport",
            "PASSPORT REPUBLIC OF THE PHILIPPINES",
            None,
        )
        self.assertFalse(result["backSideProvided"])
        self.assertEqual(result["status"], "text_consistent_unverified")

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
        actual = assess_document_text("umid", "UNIFIED MULTI-PURPOSE ID")
        self.assertEqual(actual["status"], "text_consistent_unverified")
        self.assertEqual(actual["detectedIdType"], "umid")

    def test_fifth_prc_professional_id_is_supported(self):
        for label in (
            "REPUBLIC OF THE PHILIPPINES PROFESSIONAL REGULATION COMMISSION PROFESSIONAL IDENTIFICATION CARD",
            "PRC PROFESSIONAL ID CARD",
        ):
            with self.subTest(label=label):
                actual = assess_document_text("prc_id", label)
                self.assertEqual(actual["status"], "text_consistent_unverified")
                self.assertEqual(actual["detectedIdType"], "prc_id")
                self.assertFalse(actual["authenticityVerified"])
                self.assertTrue(actual["manualReviewRequired"])

    def test_prc_label_alone_does_not_pass(self):
        for label in (
            "PRC",
            "PROFESSIONAL REGULATION COMMISSION",
            "PROFESSIONAL IDENTIFICATION CARD",
            "REPUBLIC OF THE PHILIPPINES ID CARD",
        ):
            with self.subTest(label=label):
                actual = assess_document_text("prc_id", label)
                self.assertEqual(actual["status"], "inconclusive")
                self.assertIsNone(actual["detectedIdType"])

    def test_prc_card_mismatches_selected_national_id(self):
        actual = assess_document_text(
            "national_id",
            "PROFESSIONAL REGULATION COMMISSION PROFESSIONAL IDENTIFICATION CARD",
        )
        self.assertEqual(actual["status"], "mismatch")
        self.assertEqual(actual["detectedIdType"], "prc_id")

    def test_school_employee_and_library_cards_are_unsupported(self):
        for label in (
            "SCHOOL ID",
            "STUDENT IDENTIFICATION",
            "UNIVERSITY ID",
            "COLLEGE ID",
            "LIBRARY CARD",
            "EMPLOYEE IDENTIFICATION CARD",
        ):
            with self.subTest(label=label):
                actual = assess_document_text("prc_id", label)
                self.assertEqual(actual["status"], "unsupported")
                self.assertIn("school_id_not_supported", actual["warningCodes"])

    def test_school_card_with_stolen_philid_heading_still_not_accepted(self):
        actual = assess_document_text(
            "national_id",
            "STUDENT ID PHILIPPINE IDENTIFICATION CARD SCHOOL LIBRARY",
        )
        self.assertEqual(actual["status"], "unsupported")
        self.assertFalse(actual["authenticityVerified"])

    def test_garbage_with_no_supported_issuer_cannot_pass(self):
        for declared in ("national_id", "drivers_license", "passport", "umid", "prc_id"):
            with self.subTest(declared=declared):
                actual = assess_document_text(
                    declared, "FULL NAME STUDENT NO: 12345 SCHOOL YEAR 2026"
                )
                self.assertNotEqual(actual["status"], "text_consistent_unverified")

    def test_school_id_is_unsupported_for_every_selected_id(self):
        for id_type in ("national_id", "drivers_license", "passport", "umid", "prc_id"):
            with self.subTest(id_type=id_type):
                result = assess_document_text(
                    id_type, "UNIVERSITY STUDENT ID NAME SAMPLE DOB 2001"
                )
                self.assertEqual(result["status"], "unsupported")
                self.assertIn("school_id_not_supported", result["warningCodes"])
                self.assertFalse(result["authenticityVerified"])

    def test_school_id_with_government_keywords_still_fails(self):
        result = assess_document_text(
            "national_id",
            "STUDENT IDENTIFICATION CARD / NATIONAL ID CARD SAMPLE",
        )
        self.assertEqual(result["status"], "unsupported")

    def test_unselected_real_government_id_cannot_be_accepted(self):
        result = assess_document_text(
            "national_id", "DRIVER S LICENSE LAND TRANSPORTATION OFFICE"
        )
        self.assertEqual(result["status"], "mismatch")

    def test_only_specifically_supported_id_types_allowed(self):
        for unknown in ("other_government_id", "school_id", "company_id"):
            with self.subTest(unknown=unknown):
                with self.assertRaises(ValueError):
                    assess_document_text(unknown, "NATIONAL ID CARD")

    def test_school_id_on_back_forces_unsupported(self):
        result = assess_document_sides(
            "national_id",
            "PHILIPPINE IDENTIFICATION CARD",
            "SCHOOL ID UNIVERSITY",
        )
        self.assertEqual(result["status"], "unsupported")
        self.assertIn("school_id_not_supported", result["warningCodes"])

    def test_ocr_unrecognized_government_id_requires_retry_or_review(self):
        result = assess_document_text("national_id", "CARD WITH PORTRAIT AND TEXT")
        self.assertEqual(result["status"], "inconclusive")
        self.assertNotEqual(result["status"], "text_consistent_unverified")

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
