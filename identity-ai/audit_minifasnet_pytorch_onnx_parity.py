"""Staging QA: compare pinned original PyTorch MiniFASNetV2 vs pinned converted ONNX.

Uses ten deterministic NON-PERSON 80x80 BGR arrays in two input scales.
Checks original model/checkpoint provenance BEFORE loading the Python module
or deserializing state_dict with torch.load(weights_only=True).

This audit is deliberately diagnostic. Numerical equality supports that
the serialized ONNX preserves checkpoint output-index order for measured
inputs; it does NOT establish that any index means genuine/attack, that a
scale is correct for the trained model, or that PAD is accurate on people.

Do not import into deployed inference; QA/CI only. NO personal data.
"""
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

import cv2
import numpy as np

from audit_minifasnet_onnx_synthetic import (
    BGR_MODES, MODEL_PATH, MODEL_SHA256, checked_logits,
    inspect_graph, prepare_blob, synthetic_patches,
)

# Upstream authorship remains with MiniVisionAI; these are known public
# checkpoint and source identifiers from the audited upstream repository.
ORIGINAL_PTH_SHA256 = "a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0"
ORIGINAL_ARCH_GIT_BLOB_SHA1 = "548f77346020bcbdb5d2bcff362a10d0bb338104"
PTH_MAX_BYTES = 4_000_000
ARCH_MAX_BYTES = 100_000
PTH_URLS = (
    "https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth",
    "https://huggingface.co/spaces/Coobeliues/antispoofingdetection/resolve/main/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth",
)
ARCH_URL = "https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing/master/src/model_lib/MiniFASNet.py"

# Two equivalent float32 mathematical executions are expected to be close;
# the thresholds are deliberately conservative and fixed BEFORE seeing CI.
ATOL = 0.01
RTOL = 0.01
TOTAL_SYNTHETIC_PATTERNS = 10


def sha256_matches(data, wanted):
    return hashlib.sha256(data).hexdigest() == wanted


def git_blob_sha1(data):
    body = f"blob {len(data)}\0".encode("ascii") + data
    return hashlib.sha1(body).hexdigest()


def verify_source_checkpoint_bytes(data, kind):
    """Never import source code or deserialize checkpoint before hash check."""
    if not isinstance(data, bytes) or not data:
        return False
    if kind == "checkpoint":
        return len(data) <= PTH_MAX_BYTES and sha256_matches(data, ORIGINAL_PTH_SHA256)
    if kind == "architecture":
        return len(data) <= ARCH_MAX_BYTES and git_blob_sha1(data) == ORIGINAL_ARCH_GIT_BLOB_SHA1
    raise ValueError("UNKNOWN_UPSTREAM_ASSET_TYPE")


def bounded_download(url, size_limit, opener=urlopen):
    if not url.startswith("https://"):
        raise ValueError("HTTPS_ONLY_FOR_UPSTREAM_MODEL")
    request = Request(url, headers={"User-Agent": "VolunServe-staging-pytorch-onnx-qa/1.0"})
    with opener(request, timeout=90) as response:
        data = response.read(size_limit + 1)
    if not data or len(data) > size_limit:
        raise ValueError("UPSTREAM_ASSET_INVALID_SIZE")
    return data


def get_verified_upstream_assets():
    arch = bounded_download(ARCH_URL, ARCH_MAX_BYTES)
    if not verify_source_checkpoint_bytes(arch, "architecture"):
        raise ValueError("UPSTREAM_ARCH_GIT_BLOB_CHANGED")
    failures = []
    weights = None
    for url in PTH_URLS:
        try:
            candidate = bounded_download(url, PTH_MAX_BYTES)
            if verify_source_checkpoint_bytes(candidate, "checkpoint"):
                weights = candidate
                break
            failures.append("checkpoint_sha256_mismatch")
        except (OSError, ValueError) as exc:
            failures.append(type(exc).__name__)
    if weights is None:
        # Don't print potentially sensitive URL query parameters, response
        # bodies, filenames of private files, or untrusted remote content.
        raise ValueError("PINNED_ORIGINAL_CHECKPOINT_UNAVAILABLE: " + ",".join(failures))
    return arch, weights


def load_original_model(arch, weights, tmp_dir):
    """Imports SHA1-checked original architecture, loads hash-pinned weights."""
    if not verify_source_checkpoint_bytes(arch, "architecture"):
        raise ValueError("UNVERIFIED_ARCHITECTURE")
    if not verify_source_checkpoint_bytes(weights, "checkpoint"):
        raise ValueError("UNVERIFIED_ORIGINAL_CHECKPOINT")
    import torch  # QA-only, never added to identity-ai Docker
    if not hasattr(torch, "load"):
        raise ValueError("TORCH_NOT_AVAILABLE")
    source_path = Path(tmp_dir) / "minivision_upstream_arch_verified.py"
    model_path = Path(tmp_dir) / "upstream_verified.pth"
    source_path.write_bytes(arch)
    model_path.write_bytes(weights)
    spec = importlib.util.spec_from_file_location("verified_minivision_model_qa", source_path)
    if spec is None or spec.loader is None:
        raise ValueError("ORIGINAL_ARCH_IMPORT_NOT_AVAILABLE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Original model filename 2.7_80x80_MiniFASNetV2.pth implies
    # conv6_kernel=(5,5); a wrong variant fails strict state_dict loading.
    model = module.MiniFASNetV2(
        embedding_size=128, conv6_kernel=(5, 5),
        drop_p=0.2, num_classes=3, img_channel=3,
    )
    try:
        state = torch.load(str(model_path), map_location="cpu", weights_only=True)
    except Exception as exc:
        raise ValueError("PINNED_CHECKPOINT_SAFE_LOAD_FAILED") from exc
    if not isinstance(state, dict) or not state:
        raise ValueError("CHECKPOINT_EXPECTED_STATE_DICT")
    if all(key.startswith("module.") for key in state):
        state = {key.removeprefix("module."): value for key, value in state.items()}
    try:
        model.load_state_dict(state, strict=True)
    except (RuntimeError, ValueError) as exc:
        raise ValueError("ORIGINAL_ARCH_WEIGHTS_INCOMPATIBLE") from exc
    model.eval()
    return model


def validate_numeric_parity(pt_logits, onnx_logits, *, atol=ATOL, rtol=RTOL):
    """Uses unsoftmaxed outputs so index permutations cannot hide behind softmax."""
    a = np.asarray(pt_logits, dtype=np.float64).reshape(-1)
    b = np.asarray(onnx_logits, dtype=np.float64).reshape(-1)
    if a.shape != (3,) or b.shape != (3,) or not (np.isfinite(a).all() and np.isfinite(b).all()):
        raise ValueError("NONFINITE_OR_MALFORMED_LOGITS")
    if not 0 <= atol < 0.1 or not 0 <= rtol < 0.1:
        raise ValueError("INVALID_PARITY_TOLERANCE")
    error = float(np.max(np.abs(a - b)))
    within = bool(np.all(np.abs(a - b) <= atol + rtol * np.abs(a)))
    exact_class_order = int(np.argmax(a)) == int(np.argmax(b))
    return {"withinTolerance": within, "argmaxIndexMatches": exact_class_order, "maxAbsoluteLogitDifference": error}


def compare_models(torch_model, onnx_net):
    """Same blob bytes fed to both networks; no face input or private recordings."""
    import torch
    if torch.is_grad_enabled():
        raise ValueError("TORCH_AUTOGRAD_MUST_BE_DISABLED")
    all_results = {}
    for name, scale in BGR_MODES:
        comparisons = []
        for patch in synthetic_patches():
            blob = prepare_blob(patch, scale)
            with torch.no_grad():
                pt = torch_model(torch.from_numpy(blob.copy())).detach().cpu().numpy()
            onn = checked_logits(onnx_net, patch, scale)
            comparisons.append(validate_numeric_parity(pt, onn))
        all_results[name] = {
            "patterns": len(comparisons),
            "withinToleranceCount": sum(t["withinTolerance"] for t in comparisons),
            "argmaxIndexMatchesCount": sum(t["argmaxIndexMatches"] for t in comparisons),
            "maximumAbsoluteLogitDifference": round(
                max(t["maxAbsoluteLogitDifference"] for t in comparisons), 7),
        }
    tested = sum(x["patterns"] for x in all_results.values())
    equivalent = tested == 2 * TOTAL_SYNTHETIC_PATTERNS and all(
        x["withinToleranceCount"] == x["patterns"] and
        x["argmaxIndexMatchesCount"] == x["patterns"]
        for x in all_results.values())
    return {
        "test": "identical synthetic BGR 80x80 tensors in both scales",
        "numericToleranceAbsolute": ATOL,
        "numericToleranceRelative": RTOL,
        "testedForwardPasses": tested,
        "perScale": all_results,
        "pytorchToOnnxIndexParityOnSyntheticInputs": equivalent,
        "semanticLiveClassIndependentlyValidated": False,
        "correctTrainingInputScaleValidated": False,
        "independentLivenessValidated": False,
        "identityDecisionUse": "none",
    }


def audit():
    # The ONNX is also SHA-256 checked + graph-checked before inference.
    onnx_graph = inspect_graph(MODEL_PATH)
    if onnx_graph["softmaxOperatorCount"] or not onnx_graph["outputIsModelLogits"]:
        raise ValueError("ONNX_OUTPUT_LOGITS_CONTRACT_CHANGED")
    arch, checkpoint = get_verified_upstream_assets()
    with tempfile.TemporaryDirectory(prefix="volunserve-pad-parity-qa-") as tmp:
        original = load_original_model(arch, checkpoint, tmp)
        import torch
        torch.set_num_threads(1)
        cv2.setNumThreads(1)
        onnx_net = cv2.dnn.readNetFromONNX(str(MODEL_PATH))
        with torch.no_grad():
            numeric = compare_models(original, onnx_net)
    return {
        "auditType": "sha_pinned_pytorch_to_onnx_synthetic_parity",
        "upstreamArchitectureGitBlobSha1": ORIGINAL_ARCH_GIT_BLOB_SHA1,
        "originalPyTorchCheckpointSha256": ORIGINAL_PTH_SHA256,
        "convertedOnnxSha256": MODEL_SHA256,
        "onnxGraphOutputIsLogits": True,
        "numeric": numeric,
        "note": ("Parity on synthetic tensors does not identify a genuine face, "
                 "verify original training normalization or evaluate attack detection. "
                 "The converted model card's class-0-live description conflicts "
                 "with upstream class-1-real; do not enable identity decisions."),
    }


def main():
    try:
        report = audit()
        print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
        return 0 if report["numeric"]["pytorchToOnnxIndexParityOnSyntheticInputs"] else 3
    except (ValueError, ImportError, OSError, cv2.error) as exc:
        print("PYTORCH_ONNX_PARITY_INCONCLUSIVE: " + str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
