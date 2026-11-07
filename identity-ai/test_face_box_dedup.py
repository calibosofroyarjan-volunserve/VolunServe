"""Regression tests for conservative duplicate face-box filtering.

Run from identity-ai/: python -m unittest test_face_box_dedup.py
These tests do not process real government IDs or biometric data.
"""
import unittest

from face_boxes import deduplicate_face_boxes


class FaceBoxDedupTests(unittest.TestCase):
    def test_single_face_unchanged(self):
        self.assertEqual(deduplicate_face_boxes([(10, 20, 100, 120)]), [(10, 20, 100, 120)])

    def test_near_identical_detections_count_as_one(self):
        result = deduplicate_face_boxes([(10, 10, 100, 100), (13, 12, 98, 99)])
        self.assertEqual(len(result), 1)

    def test_distinct_faces_still_count_as_two(self):
        result = deduplicate_face_boxes([(10, 10, 100, 100), (200, 10, 100, 100)])
        self.assertEqual(len(result), 2)

    def test_partial_overlap_not_automatically_merged(self):
        result = deduplicate_face_boxes([(10, 10, 100, 100), (65, 10, 100, 100)])
        self.assertEqual(len(result), 2)

    def test_nested_detector_box_is_deduplicated(self):
        result = deduplicate_face_boxes([(10, 10, 100, 100), (15, 15, 85, 85)])
        self.assertEqual(len(result), 1)

    def test_distinct_small_face_inside_large_box_is_not_discarded(self):
        result = deduplicate_face_boxes([(10, 10, 160, 160), (20, 20, 65, 65)])
        self.assertEqual(len(result), 2)

    def test_invalid_boxes_cannot_count_as_faces(self):
        self.assertEqual(deduplicate_face_boxes([(1, 1, 0, 100), (1, 1, 10, -1)]), [])


if __name__ == "__main__":
    unittest.main()
