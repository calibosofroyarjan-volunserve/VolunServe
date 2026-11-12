"""Synthetic ICAO-specimen TD3 MRZ tests; no real passport details or IDs."""
import unittest

from passport_mrz_shadow import assess_passport_mrz, _check_digit

# ICAO Doc 9303 example: fictional Utopia passport, not a real person.
FIRST = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
SECOND = "L898902C36UTO7408122F1204159ZE184226B<<<<<10"


class TD3MrzTests(unittest.TestCase):
    def test_official_specimen_valid_but_not_government_authenticity(self):
        self.assertEqual((len(FIRST), len(SECOND)), (44, 44))
        res = assess_passport_mrz(FIRST + "\n" + SECOND, "1974-08-12")
        self.assertEqual(res["passportMrzCheck"], "checksum_consistent_unverified")
        self.assertEqual(res["passportMrzBirthDateCheck"], "possible_match")
        self.assertTrue(res["passportMrzCheckDigitsConsistent"])
        self.assertFalse(res["passportIssuerAuthenticityVerified"])
        self.assertTrue(res["passportMrzManualReviewRequired"])
        for private in ("ERIKSSON", "ANNA", "L898902C3", "1974", "740812"):
            self.assertNotIn(private, repr(res))

    def test_birth_date_conflict_is_only_possible_conflict(self):
        result = assess_passport_mrz(FIRST + "\n" + SECOND, "1973-08-12")
        self.assertEqual(result["passportMrzBirthDateCheck"], "possible_conflict")
        self.assertFalse(result["passportIssuerAuthenticityVerified"])

    def test_expiry_check_digit_corruption_requires_manual_review(self):
        corrupt = SECOND[:27] + "0" + SECOND[28:]
        res = assess_passport_mrz(FIRST + "\n" + corrupt, "1974-08-12")
        self.assertEqual(res["passportMrzCheck"], "checksum_inconsistent_or_ocr_error")
        self.assertFalse(res["passportMrzCheckDigitsConsistent"])
        self.assertEqual(res["passportMrzBirthDateCheck"], "inconclusive")

    def test_composite_digit_corruption_requires_manual_review(self):
        corrupted = SECOND[:-1] + "8"
        res = assess_passport_mrz(FIRST + "\n" + corrupted)
        self.assertEqual(res["passportMrzCheck"], "checksum_inconsistent_or_ocr_error")

    def test_missing_and_ordinary_passport_text_is_not_mrz(self):
        for text in (
            "", "PASSPORT REPUBLIC OF THE PHILIPPINES",
            "P<UTOERIKSSON<<ANNA<MARIA",
            FIRST + "\n" + SECOND.replace("<", " ", 6),
        ):
            with self.subTest(sample=text):
                # The short/truncated text must never become a valid MRZ
                # solely due to an unrelated printed passport heading.
                result = assess_passport_mrz(text, "1974-08-12")
                if text == FIRST + "\n" + SECOND.replace("<", " ", 6):
                    self.assertNotEqual(result["passportMrzCheck"], "checksum_consistent_unverified")
                else:
                    self.assertEqual(result["passportMrzCheck"], "not_detected")
                self.assertFalse(result["passportIssuerAuthenticityVerified"])

    def test_repeated_identical_ocr_passes_count_once(self):
        two_passes = FIRST + "\n" + SECOND + "\n\n" + FIRST + "\n" + SECOND
        self.assertEqual(assess_passport_mrz(two_passes)["passportMrzCheck"],
                         "checksum_consistent_unverified")

    def test_conflicting_candidates_are_not_cherry_picked(self):
        corrupted = SECOND[:-1] + "8"
        text = FIRST + "\n" + SECOND + "\n" + FIRST + "\n" + corrupted
        res = assess_passport_mrz(text)
        self.assertEqual(res["passportMrzCheck"], "multiple_candidates")
        self.assertFalse(res["passportMrzCheckDigitsConsistent"])

    def test_calendar_and_field_checks_are_strict(self):
        # valid check digit for date bytes but calendar day invalid
        invalid_dob = SECOND[:13] + "741332"
        invalid_dob += str(_check_digit("741332")) + SECOND[20:]
        res = assess_passport_mrz(FIRST + "\n" + invalid_dob)
        self.assertEqual(res["passportMrzCheck"], "checksum_inconsistent_or_ocr_error")

    def test_mrz_leap_day_is_not_invented_on_nonleap_year(self):
        # YY=99 cannot represent a leap year in either 1999 or 2099.
        impossible = SECOND[:13] + "990229"
        impossible += str(_check_digit("990229")) + SECOND[20:]
        self.assertEqual(
            assess_passport_mrz(FIRST + "\n" + impossible)["passportMrzCheck"],
            "checksum_inconsistent_or_ocr_error",
        )

    def test_no_private_profile_date_echo_and_invalid_profile_date(self):
        for date in ("2001-02-29", "secrets", ""):
            result = assess_passport_mrz(FIRST + "\n" + SECOND, date)
            self.assertEqual(result["passportMrzBirthDateCheck"], "not_checked")
            self.assertNotIn(date or "NONEXISTENT", repr(result))


if __name__ == "__main__":
    unittest.main()
