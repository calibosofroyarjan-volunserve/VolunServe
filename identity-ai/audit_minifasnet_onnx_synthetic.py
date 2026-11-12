"""Audit the SHA-pinned *actual* MiniFASNetV2 ONNX graph and synthetic inference.

NO photos, faces, ID images, profile records, uploads, or predictions on people.
Results cannot validate class labels, real-world accuracy, liveness or identity.

Run AFTER downloading the pinned model:
    python download_passive_pad_model.py
    python audit_minifasnet_onnx_synthetic.py

Requires numpy, opencv-contrib-python-headless and onnx (QA/CI only).
The ONNX package is NOT needed or imported by the deployed inference service.
"""
from collections import Counter
import hashlib
import json
import math

import cv2
import numpy as np

from passive_pad_shadow import MODEL_BYTES, MODEL_PATH, MODEL_SHA256

INPUT_HWC = (80, 80, 3)
BGR_MODES = (("upstream_numpy_raw_0_to_255", 1.0),
             ("converted_model_card_0_to_1", 1.0 / 255.0))
MODEL_OUTPUT_CLASSES = 3


def pinned_model_ok(path=MODEL_PATH):
    """Fail closed on a substitute ONNX file, unexpected size or hash."""
    try:
        if not path.is_file() or path.stat().st_size != MODEL_BYTES:
            return False
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return digest == MODEL_SHA256
    except (OSError, ValueError):
        return False


def dims(value):
    """Model graph shape, preserving unknown/dynamic batch as None."""
    out = []
    for item in value.type.tensor_type.shape.dim:
        out.append(int(item.dim_value) if item.HasField("dim_value") else None)
    return out


def inspect_graph(model_path=MODEL_PATH):
    """Validate ONNX shape/type/ops without inferring any class semantics."""
    import onnx  # pinned QA dependency, not required in production Docker
    if not pinned_model_ok(model_path):
        raise ValueError("ONNX_CHECKSUM_OR_SIZE_MISMATCH")
    model = onnx.load(str(model_path))
    onnx.checker.check_model(model)
    graph = model.graph
    if len(graph.input) != 1 or len(graph.output) != 1 or not graph.node:
        raise ValueError("ONNX_UNEXPECTED_GRAPH_IO")
    source, output = graph.input[0], graph.output[0]
    src_shape, out_shape = dims(source), dims(output)
    if (src_shape[1:] != [3, 80, 80] or
            out_shape[-1:] != [MODEL_OUTPUT_CLASSES] or
            len(src_shape) != 4 or len(out_shape) != 2 or
            source.type.tensor_type.elem_type != onnx.TensorProto.FLOAT or
            output.type.tensor_type.elem_type != onnx.TensorProto.FLOAT):
        raise ValueError("ONNX_INPUT_OUTPUT_CONTRACT_MISMATCH")
    input_op = graph.node[0].op_type
    last_op = graph.node[-1].op_type
    softmax_ops = sum(node.op_type == "Softmax" for node in graph.node)
    result = {
        "inputShape": ["batch" if i == 0 and d is None else d
                       for i, d in enumerate(src_shape)],
        "outputShape": ["batch" if i == 0 and d is None else d
                        for i, d in enumerate(out_shape)],
        "onnxOpset": max((entry.version for entry in model.opset_import
                          if not entry.domain), default=0),
        "firstOperator": input_op,
        "lastOperator": last_op,
        "softmaxOperatorCount": softmax_ops,
        "outputIsModelLogits": last_op != "Softmax",
        # Weights/graph do not encode training class semantics or raw-vs-0..1
        # expected preprocessing. Even a verified graph cannot prove labels.
        "classMappingCertifiedByGraph": False,
        "inputScaleCertifiedByGraph": False,
        "pytorchExportParityVerified": False,
    }
    if result["onnxOpset"] <= 0:
        raise ValueError("ONNX_MISSING_OPSET")
    return result


def synthetic_patches():
    """10 deterministic non-face patches; never load anything from disk."""
    out = []
    out.append(np.zeros(INPUT_HWC, dtype=np.uint8))
    out.append(np.full(INPUT_HWC, 255, dtype=np.uint8))
    for brightness in (32, 96, 160, 224):
        out.append(np.full(INPUT_HWC, brightness, dtype=np.uint8))
    gradient = np.tile(np.arange(80, dtype=np.uint8), (80, 1))
    gradient = np.clip(gradient.astype(np.uint16) * 3, 0, 255).astype(np.uint8)
    out.append(np.dstack((gradient, np.flipud(gradient), np.fliplr(gradient))))
    checker = ((np.indices((80, 80)).sum(axis=0) % 2) * 255).astype(np.uint8)
    out.append(np.dstack((checker, 255 - checker, checker)))
    # Solid colors expose possible BGR/RGB mistakes without any real image.
    blue = np.zeros(INPUT_HWC, dtype=np.uint8)
    blue[:, :, 0] = 255
    out.append(blue)
    red = np.zeros(INPUT_HWC, dtype=np.uint8)
    red[:, :, 2] = 255
    out.append(red)
    return out


def prepare_blob(patch, scale):
    if (not isinstance(patch, np.ndarray) or
            patch.shape != INPUT_HWC or patch.dtype != np.uint8 or
            scale not in (1.0, 1.0 / 255.0)):
        raise ValueError("INVALID_SYNTHETIC_ONNX_INPUT")
    return cv2.dnn.blobFromImage(patch, scalefactor=scale, size=(80, 80),
                                 mean=(0, 0, 0), swapRB=False, crop=False)


def checked_logits(net, patch, scale):
    net.setInput(prepare_blob(patch, scale))
    raw = np.asarray(net.forward(), dtype=np.float64).reshape(-1)
    if raw.shape != (MODEL_OUTPUT_CLASSES,) or not np.isfinite(raw).all():
        raise ValueError("ONNX_NONFINITE_OR_BAD_OUTPUT")
    return raw


def analyze_synthetic_predictions(raw_and_normalized):
    """Return only numerical/shape checks; never assign a 'live' class."""
    if not raw_and_normalized:
        raise ValueError("MISSING_SYNTHETIC_PROBES")
    hist = {name: Counter() for name, _ in BGR_MODES}
    disagreement = 0
    delta = []
    for item in raw_and_normalized:
        if len(item) != 2:
            raise ValueError("EXPECTED_TWO_ONNX_MODES")
        predicted = []
        for (name, _factor), logits in zip(BGR_MODES, item):
            values = np.asarray(logits, dtype=np.float64)
            if values.shape != (3,) or not np.isfinite(values).all():
                raise ValueError("INVALID_ONNX_LOGITS")
            idx = int(np.argmax(values))
            hist[name][idx] += 1
            predicted.append(idx)
        disagreement += predicted[0] != predicted[1]
        delta.append(float(np.max(np.abs(item[0] - item[1]))))
    if not np.isfinite(delta).all():
        raise ValueError("ONNX_SCALE_DELTA_NONFINITE")
    return {
        "syntheticPatterns": len(raw_and_normalized),
        "argmaxHistogramsByScale": {
            name: {f"class_{i}": counts.get(i, 0) for i in range(3)}
            for name, counts in hist.items()
        },
        "argmaxDisagreementsAcrossScales": int(disagreement),
        "maximumAbsoluteLogitDeltaAcrossScales": round(max(delta), 6),
        # Synthetic patches have no face ground truth. Never infer a live class.
        "classIndexSemanticsValidated": False,
        "inputScaleValidatedWithRealLabels": False,
        "accuracyMeasured": False,
        "thresholdCalibrated": False,
        "independentPadValidated": False,
        "identityDecisionUse": "none",
    }


def audit():
    graph = inspect_graph()
    try:
        net = cv2.dnn.readNetFromONNX(str(MODEL_PATH))
        pairs = []
        for patch in synthetic_patches():
            a = checked_logits(net, patch, BGR_MODES[0][1])
            b = checked_logits(net, patch, BGR_MODES[1][1])
            pairs.append((a, b))
    except cv2.error as exc:
        raise ValueError("ONNX_OPENCV_INFERENCE_FAILED") from exc
    report = {
        "auditType": "pinned_onnx_synthetic_only",
        "modelSha256": MODEL_SHA256,
        "graph": graph,
        "numeric": analyze_synthetic_predictions(pairs),
        "caveat": (
            "This reports deterministic compatibility and output-scale sensitivity "
            "on non-face patches only; it cannot identify the live class, prove "
            "PyTorch-to-ONNX parity, certify spoof detection, or approve Residents."
        ),
    }
    return report


def main():
    try:
        print(json.dumps(audit(), indent=2, sort_keys=True, allow_nan=False))
        return 0
    except (ValueError, ImportError, OSError, OverflowError) as exc:
        print("ONNX_SYNTHETIC_AUDIT_UNAVAILABLE: " + str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
