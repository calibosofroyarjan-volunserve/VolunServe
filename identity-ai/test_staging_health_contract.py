"""No-media unit test: staging health fields used by Node and the web UI."""
import ast
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)
HEALTH = next(
    node for node in TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "health"
)
HEALTH_HAS_ROUTE = any(
    isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
    and d.func.attr == "get"
    and isinstance(d.func.value, ast.Name) and d.func.value.id == "app"
    and d.args and isinstance(d.args[0], ast.Constant) and d.args[0].value == "/health"
    for d in HEALTH.decorator_list
)
HEALTH.decorator_list = []
MODULE = ast.Module(body=[HEALTH], type_ignores=[])
ast.fix_missing_locations(MODULE)


def evaluate(ocr_ready, profile_ready):
    namespace = {
        "get_internal_key": lambda: "synthetic-internal-key",
        "face_mesh_engine_ready": lambda: True,
        "get_match_threshold": lambda: 0.78,
        "passive_pad_readiness": lambda: {"shadowEnabled": True, "modelLoaded": False,
                                          "independentPadValidated": False,
                                          "identityDecisionUse": "none"},
        "sface_readiness": lambda: {"shadowEnabled": True, "modelLoaded": False,
                                    "independentFaceMatchValidated": False,
                                    "independentPadValidated": False,
                                    "identityDecisionUse": "none"},
        "document_ocr_ready": lambda: ocr_ready,
        "profile_comparison": (lambda *args: {}) if profile_ready else None,
        "datetime": datetime, "timezone": timezone,
        "mp": SimpleNamespace(__version__="synthetic"),
    }
    exec(compile(MODULE, "main.py:health_only", "exec"), namespace)
    return namespace["health"]()


class StagingHealthContractTests(unittest.TestCase):
    def test_health_route_is_registered_on_correct_handler(self):
        self.assertTrue(HEALTH_HAS_ROUTE, "/health must call health(), not OCR helper")
        helper = next(n for n in TREE.body if isinstance(n, ast.FunctionDef)
                      and n.name == "document_ocr_ready")
        self.assertFalse(helper.decorator_list, "OCR helper must not be an HTTP route")

    def test_healthy_server_reports_all_ui_required_checks(self):
        result = evaluate(True, True)
        self.assertTrue(result["ok"])
        self.assertTrue(result["verificationEngineReady"])
        self.assertTrue(result["internalAuthConfigured"])
        self.assertTrue(result["documentOcrReady"])
        self.assertTrue(result["profileComparisonReady"])
        self.assertTrue(result["documentPrecheckReady"])
        self.assertFalse(result["livenessImplemented"])
        self.assertFalse(result["passivePadShadow"]["independentPadValidated"])
        self.assertEqual(result["passivePadShadow"]["identityDecisionUse"], "none")
        self.assertFalse(result["sFaceShadow"]["independentFaceMatchValidated"])
        self.assertFalse(result["sFaceShadow"]["independentPadValidated"])
        self.assertEqual(result["sFaceShadow"]["identityDecisionUse"], "none")
        self.assertFalse(result["idDocumentAuthenticityVerified"])

    def test_missing_ocr_is_not_misreported_ready(self):
        result = evaluate(False, True)
        self.assertFalse(result["documentOcrReady"])
        self.assertFalse(result["documentPrecheckReady"])

    def test_missing_profile_matching_is_not_misreported_ready(self):
        result = evaluate(True, False)
        self.assertFalse(result["profileComparisonReady"])
        self.assertFalse(result["documentPrecheckReady"])

    def test_real_ocr_helper_checks_executable_availability(self):
        helper = next(n for n in TREE.body if isinstance(n, ast.FunctionDef)
                      and n.name == "document_ocr_ready")
        module = ast.Module(body=[helper], type_ignores=[])
        ast.fix_missing_locations(module)
        for available in [True, False]:
            class SyntheticOCR:
                @staticmethod
                def get_tesseract_version():
                    if not available:
                        raise OSError("synthetic missing binary")
                    return "synthetic"
            scope = {"pytesseract": SyntheticOCR}
            exec(compile(module, "main.py:ocr_ready_only", "exec"), scope)
            self.assertEqual(scope["document_ocr_ready"](), available)


if __name__ == "__main__":
    unittest.main()
