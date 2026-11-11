import unittest

from profile_consistency import (
    assess_profile_birth_date, assess_profile_address, profile_comparison,
)


class ProfileConsistencyTests(unittest.TestCase):
    def test_iso_dob_exact_match_is_only_possible_match(self):
        value = assess_profile_birth_date("1998-09-05", "DATE OF BIRTH: 1998-09-05")
        self.assertEqual(value["profileBirthDateCheck"], "possible_match")
        self.assertTrue(value["profileBirthDateCompared"])
        self.assertNotIn("1998", repr(value))

    def test_long_month_and_local_date(self):
        for raw in ("PETSA NG KAPANGANAKAN 05 SEPTEMBER 1998",
                    "DATE OF BIRTH SEPTEMBER 05 1998",
                    "DATE OF BIRTH 09/05/1998"):
            with self.subTest(raw=raw):
                value = assess_profile_birth_date("1998-09-05", raw)
                # Numeric 09/05 is ambiguous and must not claim a match.
                status = "inconclusive" if "/" in raw else "possible_match"
                self.assertEqual(value["profileBirthDateCheck"], status)

    def test_different_labeled_date_routes_to_manual_review_not_fraud(self):
        value = assess_profile_birth_date("1998-09-05", "DATE OF BIRTH: 1999-09-05")
        self.assertEqual(value["profileBirthDateCheck"], "possible_conflict")

    def test_unrelated_expiry_date_is_not_birth_date(self):
        value = assess_profile_birth_date("1998-09-05",
                                          "EXPIRATION DATE: 1998-09-05")
        self.assertEqual(value["profileBirthDateCheck"], "inconclusive")

    def test_old_account_without_dob_remains_not_checked(self):
        value = assess_profile_birth_date("", "DATE OF BIRTH: 1998-09-05")
        self.assertEqual(value["profileBirthDateCheck"], "not_checked")
        self.assertFalse(value["profileBirthDateCompared"])

    def test_invalid_calendar_date_not_accepted(self):
        value = assess_profile_birth_date("2001-02-29", "DATE OF BIRTH: 2001-02-29")
        self.assertEqual(value["profileBirthDateCheck"], "not_checked")

    def test_current_barangay_possible_match_only_when_address_labeled(self):
        result = assess_profile_address("Barangay Muzon", "RESIDENTIAL ADDRESS: MUZON, CITY OF SAN JOSE DEL MONTE BULACAN")
        self.assertEqual(result["profileAddressCheck"], "possible_match")
        self.assertTrue(result["profileAddressCompared"])
        self.assertNotIn("MUZON", repr(result))

    def test_birthplace_and_issuer_not_mistaken_for_current_residence(self):
        value = assess_profile_address("Muzon",
                                       "PLACE OF BIRTH: MUZON BULACAN")
        self.assertEqual(value["profileAddressCheck"], "inconclusive")

    def test_missing_address_and_missing_barangay_are_not_failures(self):
        self.assertEqual(
            assess_profile_address("Muzon", "NATIONAL ID CARD")["profileAddressCheck"],
            "inconclusive",
        )
        self.assertEqual(
            assess_profile_address("", "ADDRESS MUZON")["profileAddressCheck"],
            "not_checked",
        )

    def test_profile_comparison_never_returns_private_inputs(self):
        result = profile_comparison(
            "1998-09-05", "Muzon",
            "DATE OF BIRTH 1998-09-05 ADDRESS MUZON SAN JOSE DEL MONTE",
        )
        self.assertEqual(result["profileBirthDateCheck"], "possible_match")
        self.assertEqual(result["profileAddressCheck"], "possible_match")
        for forbidden in ("MUZON", "1998", "09-05", "SAN JOSE DEL MONTE"):
            self.assertNotIn(forbidden, repr(result))


if __name__ == "__main__":
    unittest.main()
