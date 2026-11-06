import unittest
from id_portrait_selection import has_clear_primary_id_portrait


class IdPortraitSelectionTests(unittest.TestCase):
    def test_small_security_portrait_does_not_block_main_photo(self):
        self.assertTrue(has_clear_primary_id_portrait([(50, 100, 112, 128), (210, 110, 36, 40)]))

    def test_two_people_are_never_selected_by_just_slightly_bigger_photo(self):
        self.assertFalse(has_clear_primary_id_portrait([(5, 5, 100, 110), (190, 5, 92, 105)]))

    def test_one_face_is_not_a_multiple_portrait_case(self):
        self.assertFalse(has_clear_primary_id_portrait([(5, 5, 100, 110)]))

    def test_many_small_secondary_portraits_remain_unambiguous(self):
        self.assertTrue(has_clear_primary_id_portrait([(5, 5, 150, 170), (170, 5, 40, 50), (220, 5, 35, 40)]))

    def test_two_big_faces_still_rejected_even_with_small_security_portrait(self):
        self.assertFalse(has_clear_primary_id_portrait([(5, 5, 120, 150), (170, 5, 100, 130), (280, 5, 20, 25)]))

    def test_zero_area_faces_are_invalid(self):
        self.assertFalse(has_clear_primary_id_portrait([(5, 5, 100, 110), (190, 5, 0, 0)]))


if __name__ == "__main__":
    unittest.main()
