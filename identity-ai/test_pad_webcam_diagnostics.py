"""Synthetic-only tests for local PAD inconclusive reason reporting; no real faces."""
import json
import unittest
from unittest.mock import patch

import numpy as np

import diagnose_pad_webcam_local as diag


class FakeNet:
    def __init__(self, output):
        self.output = output
        self.blobs = []

    def setInput(self, blob):
        self.blobs.append(np.array(blob, copy=True))

    def forward(self):
        return np.asarray(self.output, dtype=np.float32).reshape(1, -1)


class FakeCamera:
    def __init__(self, *, working=True):
        self.working = working
        self.released = False
        self.reads = 0

    def isOpened(self):
        return True

    def read(self):
        self.reads += 1
        if not self.working:
            return False, None
        return True, np.zeros((480, 640, 3), dtype=np.uint8)

    def release(self):
        self.released = True


def synthetic_frame():
    return np.zeros((480, 640, 3), dtype=np.uint8)


def synthetic_crop():
    return np.full((80, 80, 3), 64, dtype=np.uint8)


class WebcamDiagnosticTests(unittest.TestCase):
    def test_crop_missing_reasons_distinguish_face_detection_vs_context(self):
        mapped = {
            "no_face": "face_not_detected",
            "multiple_faces": "multiple_faces",
            "one_face_unvalidated": "face_context_out_of_frame",
            "unavailable": "face_detection_inconclusive",
        }
        for observed, expected in mapped.items():
            with self.subTest(observed=observed):
                record = diag.diagnose_one_frame(
                    synthetic_frame(), net=FakeNet([0, 9, 0]),
                    cropper=lambda _: None, inspector=lambda _: observed,
                )
                self.assertEqual(record[0], expected)
                self.assertEqual(record[1], ("inconclusive", "inconclusive"))
                self.assertEqual(record[2], (expected, expected))

    def test_model_confidence_reason_is_not_mistaken_for_missing_face(self):
        network = FakeNet([0, 0, 0])
        result = diag.diagnose_one_frame(
            synthetic_frame(), net=network, cropper=lambda _: synthetic_crop())
        self.assertEqual(result[0], "low_model_confidence")
        self.assertEqual(result[1], ("inconclusive", "inconclusive"))
        self.assertEqual(len(network.blobs), 2)

    def test_model_shadow_class_observed_but_never_verified(self):
        network = FakeNet([0, 9, 0])
        result = diag.diagnose_one_frame(
            synthetic_frame(), net=network, cropper=lambda _: synthetic_crop())
        self.assertEqual(result[0], "shadow_class_observed")
        self.assertEqual(result[1], ("model_prefers_live_unvalidated",) * 2)
        report = diag.summarize_diagnostics([result])
        self.assertFalse(report["independentPadValidated"])
        self.assertEqual(report["identityDecisionUse"], "none")
        self.assertEqual(report["framesInspected"], 1)

    def test_invalid_logits_do_not_create_liveness_claim(self):
        for invalid in ([float("nan"), 0, 0], [float("inf"), 0, 0], [1, 2]):
            with self.subTest(invalid=invalid):
                result = diag.diagnose_one_frame(
                    synthetic_frame(), net=FakeNet(invalid),
                    cropper=lambda _: synthetic_crop())
                self.assertEqual(result[0], "model_output_invalid")
                self.assertEqual(result[1], ("inconclusive", "inconclusive"))

    def test_nonimage_input_does_not_call_face_model(self):
        bad = np.full((480, 640, 3), 0.2, dtype=np.float32)
        result = diag.diagnose_one_frame(bad,net=FakeNet([0, 9, 0]),
            cropper=lambda _: (_ for _ in ()).throw(
                AssertionError("Invalid frame reached face crop")))
        self.assertEqual(result[0], "invalid_camera_frame")

    def test_two_scales_use_same_crop_and_input_order(self):
        network = FakeNet([0, 0, 9])
        crop_calls = []
        def cropper(_image):
            crop_calls.append(True)
            return synthetic_crop()
        result = diag.diagnose_one_frame(synthetic_frame(),net=network,cropper=cropper)
        self.assertEqual(crop_calls, [True])
        self.assertEqual(len(network.blobs), 2)
        np.testing.assert_allclose(network.blobs[0],network.blobs[1] * 255,
                                   atol=1e-5,rtol=1e-6)
        self.assertEqual(result[1], ("model_prefers_attack_unvalidated",) * 2)

    def test_only_aggregate_reason_counts_without_pixel_or_person_data(self):
        records=[
            ("face_not_detected",("inconclusive",)*2,("face_not_detected",)*2),
            ("face_context_out_of_frame",("inconclusive",)*2,("face_context_out_of_frame",)*2),
            ("low_model_confidence",("inconclusive",)*2,("low_model_confidence",)*2),
        ]
        report=diag.summarize_diagnostics(records)
        self.assertEqual(report["framesInspected"],3)
        self.assertEqual(report["diagnosticReasonCounts"]["face_not_detected"],1)
        self.assertEqual(report["diagnosticReasonCounts"]["face_context_out_of_frame"],1)
        self.assertEqual(report["diagnosticReasonCounts"]["low_model_confidence"],1)
        self.assertFalse(report["independentPadValidated"])
        printed=json.dumps(report)
        for forbidden in ("png","jpg","base64","personId","filename","face_box",
                          "biometricTemplate","rawPixels","faceEmbedding"):
            self.assertNotIn(forbidden,printed)

    def test_counts_cannot_be_injected_with_unrecognized_model_output(self):
        report=diag.summarize_diagnostics([
            ("fake_reason",("identityVerified","verified"),
             ("accepted","trusted_pad"))
        ])
        self.assertEqual(report["framesInspected"],1)
        self.assertEqual(report["identityDecisionUse"],"none")
        self.assertEqual(report["diagnosticReasonCounts"]["face_detection_inconclusive"],1)
        self.assertEqual(report["perScale"][diag.MODE_NAMES[0]]
                         ["shadowObservationCounts"]["inconclusive"],1)
        self.assertNotIn("identityVerified",str(report))

    def test_consent_required_before_camera_or_model_access(self):
        with patch.object(diag.pad,"readiness",
                          side_effect=AssertionError("model read before consent")):
            self.assertEqual(diag.run_cli([],camera_factory=lambda _:(
                _ for _ in ()).throw(AssertionError("camera before consent"))),2)

    def test_bad_parameters_are_rejected_without_camera_access(self):
        with patch.object(diag.pad,"readiness",
                          side_effect=AssertionError("model read before validated flags")):
            for flags in (["--camera","-1"], ["--camera","9"],
                          ["--frames","0"],["--frames","21"],
                          ["--interval","nan"],["--interval","0.1"],
                          ["--interval","4"]):
                self.assertEqual(diag.run_cli(["--consent-confirmed"]+flags,
                                              camera_factory=lambda _:None),2)

    def test_fake_webcam_success_aggregates_and_releases_camera(self):
        webcam = FakeCamera()
        output=[]
        with patch.object(diag.pad,"readiness",return_value={
            "modelLoaded":True,"faceDetectorShadow":{"modelLoaded":True},
        }):
            exit_code=diag.run_cli(
                ["--consent-confirmed","--frames","3"],
                camera_factory=lambda _:webcam,
                input_fn=lambda _:"",
                output_fn=output.append,sleeper=lambda _:None,
                assessor=lambda _:(
                    "face_context_out_of_frame",("inconclusive",)*2,
                    ("face_context_out_of_frame",)*2))
        self.assertEqual(exit_code,0)
        self.assertTrue(webcam.released)
        self.assertEqual(webcam.reads,3)
        report=json.loads(output[-1])
        self.assertEqual(report["framesInspected"],3)
        self.assertEqual(report["diagnosticReasonCounts"]["face_context_out_of_frame"],3)
        self.assertIn("Move farther",report["suggestion"])

    def test_abort_and_frame_failure_never_publish_partial_results(self):
        with patch.object(diag.pad,"readiness",return_value={
            "modelLoaded":True,"faceDetectorShadow":{"modelLoaded":True},
        }):
            bad=FakeCamera(working=False)
            out=[]
            status=diag.run_cli(["--consent-confirmed","--frames","2"],
                camera_factory=lambda _:bad,input_fn=lambda _:"",
                output_fn=out.append,sleeper=lambda _:None)
            self.assertEqual(status,2)
            self.assertTrue(bad.released)
            self.assertFalse(any('"framesInspected"' in x for x in out))
            cancelled=FakeCamera()
            status2=diag.run_cli(["--consent-confirmed","--frames","2"],
                camera_factory=lambda _:cancelled,input_fn=lambda _:"q",
                output_fn=lambda _:None,sleeper=lambda _:None)
            self.assertEqual(status2,130)
            self.assertTrue(cancelled.released)

    def test_unavailable_model_never_opens_camera(self):
        with patch.object(diag.pad,"readiness",return_value={
            "modelLoaded":False,"faceDetectorShadow":{"modelLoaded":True},
        }):
            exit_code=diag.run_cli(["--consent-confirmed"],
                camera_factory=lambda _: (_ for _ in ()).throw(
                    AssertionError("camera opened for missing model")))
        self.assertEqual(exit_code,2)


if __name__=="__main__":
    unittest.main()
