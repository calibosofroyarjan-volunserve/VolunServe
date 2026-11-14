"""Synthetic EXIF smartphone orientation and 2-picture SFace QA contract.

Only generated color pixels and fake model responses. No webcam, face,
government ID, model network request, Firebase or actual person is involved.
"""
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageOps

from evaluate_sface_pairs_local import _private_decode
from image_upload_bounds import image_dimensions_allowed
from check_sface_two_photos_local import (
    sanitize_observation, inspect_two_photos,
)


def make_phone_jpeg(path, *, orientation=None, variation=False):
    pixels=np.zeros((45,90,3), dtype=np.uint8)
    pixels[:20,:50,0]=230
    pixels[20:,:25,1]=200
    if variation:
        pixels[25:35,65:85,2]=210
    image=Image.fromarray(pixels, "RGB")
    if orientation is not None:
        exif=Image.Exif()
        exif[274]=orientation
        image.save(path, format="JPEG", exif=exif)
    else:
        image.save(path, format="JPEG")


class PhoneOrientationTests(unittest.TestCase):
    def test_exif_rotation_is_applied_before_bgr_face_matching(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"phone-camera.jpg"
            make_phone_jpeg(path, orientation=6)
            result=_private_decode(path, None, np, Image,
                                   image_dimensions_allowed)
            with Image.open(path) as image:
                expected=np.asarray(ImageOps.exif_transpose(image).convert("RGB"),
                                    dtype=np.uint8)[:,:,::-1].copy()
            self.assertEqual(result.shape,(90,45,3))
            self.assertTrue(result.flags["C_CONTIGUOUS"])
            self.assertEqual(result.dtype,np.uint8)
            np.testing.assert_array_equal(result,expected)
            self.assertFalse((Path(tmp)/"corrected.jpg").exists())

    def test_file_without_exif_remains_correct_and_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"phone.jpg"
            make_phone_jpeg(path)
            result=_private_decode(path,None,np,Image,image_dimensions_allowed)
            self.assertEqual(result.shape,(45,90,3))
            self.assertIsNone(_private_decode(path,None,np,Image,
                              lambda width,height: False))
            corrupt=Path(tmp)/"bad.jpg"
            corrupt.write_bytes(b"fake-phone-image-input-not-a-jpeg")
            self.assertIsNone(_private_decode(corrupt,None,np,Image,
                                              image_dimensions_allowed))


class TwoPhotoResearchTests(unittest.TestCase):
    def test_malicious_model_fields_never_appear_in_public_diagnostic(self):
        observation={
            "status":"similarity_observed_unvalidated",
            "qaStage":"research_score_only",
            "cosineSimilarity":0.61332,
            "privateIDNumber":"FICTIONAL_PRIVATE_ID_SAMPLE_9999",
            "embedding":[0.1,0.2],
            "identityVerified":True,
            "livenessValidated":True,
        }
        response=sanitize_observation(observation)
        self.assertEqual(response,{
            "status":"similarity_observed_unvalidated",
            "stage":"research_score_only",
            "score":0.61332,
        })
        self.assertNotIn("privateIDNumber",str(response))
        for value in (float("nan"),float("inf"),True,1.2,-1.2,"0.99",None):
            output=sanitize_observation({
                "status":"similarity_observed_unvalidated",
                "qaStage":"research_score_only",
                "cosineSimilarity":value,
            })
            self.assertEqual(output["status"],"inconclusive")
            self.assertIsNone(output["score"])
        for malicious in ("SECRET_PRIVATE_DOCUMENT_123",["bad"],None,{}):
            response=sanitize_observation({
                "status":malicious,"qaStage":malicious,
                "cosineSimilarity":0.8,
            })
            self.assertEqual(response["status"],"inconclusive")
            self.assertEqual(response["stage"],"unknown")
            self.assertIsNone(response["score"])

    def test_no_consent_refuses_before_any_model_import(self):
        args=types.SimpleNamespace(consent_confirmed=False)
        with self.assertRaisesRegex(ValueError,"informed_consent_required"):
            inspect_two_photos(args)

    def test_two_private_photos_run_only_fake_model_and_no_identity_grant(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            make_phone_jpeg(root/"id.jpg",orientation=6)
            make_phone_jpeg(root/"selfie.jpg",variation=True)
            observations=[]
            fake_sface=types.ModuleType("sface_shadow")
            fake_sface.readiness=lambda:{"modelLoaded":True}
            def shadow(first,second):
                observations.append((first.shape,second.shape))
                return {"status":"similarity_observed_unvalidated",
                        "qaStage":"research_score_only",
                        "cosineSimilarity":0.31,
                        "rawOCR":"SYNTHETIC_PRIVATE_NO_OUTPUT",
                        "identityVerified":True}
            fake_sface.assess_pair_shadow=shadow
            fake_yunet=types.ModuleType("yunet_shadow")
            fake_yunet.readiness=lambda:{"modelLoaded":True}
            fake_cv2=types.ModuleType("cv2")
            args=types.SimpleNamespace(
                consent_confirmed=True,image_root=str(root),
                id_image="id.jpg",selfie_image="selfie.jpg",
            )
            with patch.dict(sys.modules,{
                "cv2":fake_cv2,"sface_shadow":fake_sface,"yunet_shadow":fake_yunet,
            }):
                result=inspect_two_photos(args)
            self.assertEqual(result["status"],"similarity_observed_unvalidated")
            self.assertEqual(result["score"],0.31)
            self.assertEqual(observations,[((90,45,3),(45,90,3))])
            self.assertNotIn("SYNTHETIC_PRIVATE_NO_OUTPUT",str(result))
            self.assertNotIn("identityVerified",result)

    def test_identical_photos_and_missing_models_never_emit_similarity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            make_phone_jpeg(root/"id.jpg")
            args=types.SimpleNamespace(
                consent_confirmed=True,image_root=str(root),
                id_image="id.jpg",selfie_image="id.jpg",
            )
            fake_cv2=types.ModuleType("cv2")
            fake_yunet=types.ModuleType("yunet_shadow")
            fake_yunet.readiness=lambda:{"modelLoaded":True}
            fake_sface=types.ModuleType("sface_shadow")
            fake_sface.readiness=lambda:{"modelLoaded":True}
            fake_sface.assess_pair_shadow=lambda *args: (_ for _ in ()).throw(
                AssertionError("reused image entered recognition"))
            with patch.dict(sys.modules,{
                "cv2":fake_cv2,"sface_shadow":fake_sface,"yunet_shadow":fake_yunet,
            }):
                result=inspect_two_photos(args)
                self.assertEqual(result["stage"],"duplicate_capture")
                self.assertIsNone(result["score"])
                fake_sface.readiness=lambda:{"modelLoaded":False}
                result=inspect_two_photos(args)
                self.assertEqual(result["status"],"unavailable")
                self.assertEqual(result["stage"],"models_not_installed")
                self.assertIsNone(result["score"])


if __name__=="__main__":
    unittest.main()
