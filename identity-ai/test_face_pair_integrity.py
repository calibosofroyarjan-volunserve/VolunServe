"""Real source contract, synthetic pixel arrays only: no human photos.

A pixel-identical ID and selfie cannot be an independent capture. This
check does not make any liveness, identity or anti-deepfake claims.
"""
import ast
from pathlib import Path
import unittest
import numpy as np

from face_pair_integrity import exact_image_reuse

SOURCE=Path(__file__).with_name("main.py").read_text(encoding="utf8")
TREE=ast.parse(SOURCE)
FUNC=next(node for node in TREE.body if isinstance(node,ast.FunctionDef)
          and node.name=="run_face_verification")
MODULE=ast.fix_missing_locations(ast.Module(body=[FUNC],type_ignores=[]))


class ExactPixelReuseTests(unittest.TestCase):
    def test_identical_pixels_even_across_copies_are_detected(self):
        first=np.zeros((240,320,3),dtype=np.uint8)
        first[60:110,80:140,:]=72
        self.assertTrue(exact_image_reuse(first,first.copy()))
        same_encoded_different_buffer=np.array(first,copy=True)
        self.assertTrue(exact_image_reuse(first,same_encoded_different_buffer))

    def test_different_captures_do_not_trigger_exact_only_check(self):
        first=np.zeros((240,320,3),dtype=np.uint8)
        different=first.copy()
        different[20,35,1]=1
        self.assertFalse(exact_image_reuse(first,different))
        self.assertFalse(exact_image_reuse(first,np.zeros((240,321,3),dtype=np.uint8)))
        self.assertFalse(exact_image_reuse(first,None))
        self.assertFalse(exact_image_reuse(first,"JPEG file"))
        self.assertFalse(exact_image_reuse(first,np.zeros((240,320,3),dtype=np.float32)))
        self.assertFalse(exact_image_reuse(first,np.zeros((240,320),dtype=np.uint8)))
        self.assertFalse(exact_image_reuse(first,np.zeros((240,320,4),dtype=np.uint8)))

    def test_actual_face_handler_rejects_reused_picture_before_any_face_score(self):
        image=np.full((220,250,3),41,dtype=np.uint8)
        calls={"landmarks":0,"quality":0,"sface":0}
        def no_landmarks(_):
            calls["landmarks"]+=1
            raise AssertionError("reused photo reached face recognition")
        def no_quality(_):
            calls["quality"]+=1
            raise AssertionError("reused photo reached face quality checks")
        def no_sface(*_):
            calls["sface"]+=1
            raise AssertionError("reused photo reached SFace")
        env={
            "decode_image":lambda content,label:image.copy(),
            "exact_image_reuse":exact_image_reuse,
            "image_quality":no_quality,
            "face_landmarks":no_landmarks,
            "sface_assess_pair_shadow":no_sface,
            "failed_attempt_result":lambda **kwargs:{
                "status":"failed","decision":"failed",
                "livenessScore":None,"matchScore":None,
                "warning":kwargs.get("warning"),
                "message":kwargs.get("message"),
                "identityVerified":False,
            },
        }
        exec(compile(MODULE,"main.py:real_face_verification","exec"),env)
        result=env["run_face_verification"](
            uid="FICTIONAL_ONLY",id_document_bytes=b"a",selfie_bytes=b"b")
        self.assertEqual(result["status"],"failed")
        self.assertEqual(result["decision"],"failed")
        self.assertEqual(result["warning"],"identical_id_selfie_image")
        self.assertFalse(result["identityVerified"])
        self.assertIsNone(result["livenessScore"])
        self.assertIn("fresh selfie",result["message"])
        self.assertEqual(calls,{"landmarks":0,"quality":0,"sface":0})


if __name__=="__main__":
    unittest.main()
