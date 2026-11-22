"""Synthetic-only tests; never include government ID images or OCR PII."""
import unittest

from national_id_both_sides_screening import assess_national_id_sides

FRONT = (
    "REPUBLIKA NG PILIPINAS PAMBANSANG PAGKAKAKILANLAN "
    "PHILIPPINE IDENTIFICATION CARD APELYIDO LAST NAME MGA PANGALAN GIVEN NAMES"
)
BACK = (
    "Araw ng Pagkakaloob / Date of Issue "
    "Kasarian / Sex Uri ng Dugo / Blood Type "
    "Kalagayang Sibil / Marital Status "
    "Lugar ng Kapanganakan / Place of Birth "
    "If found please return to nearest PSA Office."
)


class TwoSidedNationalIdTests(unittest.TestCase):
    def test_front_and_back_labels_support_unverified_format(self):
        d = assess_national_id_sides(FRONT, BACK)
        self.assertEqual(d["status"], "text_consistent_unverified")
        self.assertEqual(d["detectedIdType"], "national_id")
        self.assertFalse(d["authenticityVerified"])
        self.assertFalse(d["livenessVerified"])
        self.assertTrue(d["manualReviewRequired"])

    def test_front_only_never_passes(self):
        self.assertEqual(assess_national_id_sides(FRONT, "")["status"], "inconclusive")

    def test_back_only_never_passes(self):
        self.assertEqual(assess_national_id_sides("", BACK)["status"], "inconclusive")

    def test_back_name_photo_only_is_not_back_evidence(self):
        self.assertEqual(assess_national_id_sides(FRONT, "FIRST NAME LAST NAME PHOTO")["status"], "inconclusive")

    def test_school_id_cannot_pass_even_with_philid_words(self):
        a = assess_national_id_sides(FRONT + " STUDENT IDENTIFICATION", BACK)
        self.assertEqual(a["status"], "mismatch")

    def test_school_id_on_back_is_rejected(self):
        a = assess_national_id_sides(FRONT, BACK + " STUDENT ID")
        self.assertEqual(a["status"], "mismatch")

    def test_driver_license_clues_not_accepted(self):
        a = assess_national_id_sides(FRONT + " DRIVERS LICENSE", BACK)
        self.assertEqual(a["status"], "mismatch")

    def test_back_repeated_same_label_not_sufficient(self):
        back = "Sex Sex Sex Sex Sex Sex Sex"
        self.assertEqual(assess_national_id_sides(FRONT, back)["status"], "inconclusive")

    def test_no_raw_text_in_result(self):
        sentinel = "PRIVATE_TEST_SENTINEL_123456"
        a = assess_national_id_sides(FRONT + sentinel, BACK)
        self.assertNotIn(sentinel, str(a))
        self.assertTrue(set(a).issubset({
            "method", "declaredIdType", "detectedIdType", "status",
            "authenticityVerified", "livenessVerified", "manualReviewRequired", "warningCodes"
        }))


if __name__ == "__main__":
    unittest.main()
