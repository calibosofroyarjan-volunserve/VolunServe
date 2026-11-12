"""Pinned offline-build download of the optional YuNet face detector, staging only.

Upstream: OpenCV Zoo, MIT, copyright 2020 Shiqi Yu.
https://huggingface.co/opencv/opencv_zoo/tree/main/models/face_detection_yunet
No user data, face photos, IDs, logs or secrets are sent to the model source.
This model detects faces, and does NOT prove liveness/identity.
"""
import hashlib
from pathlib import Path
from urllib.request import Request, urlopen

# Pin immutable repository revision and exact model file digest.
SOURCE = ("https://huggingface.co/opencv/opencv_zoo/resolve/"
          "d4938dfc9d4ec5d098bfa33e98b3f3345a236586/"
          "models/face_detection_yunet/face_detection_yunet_2023mar.onnx")
SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
MAX_BYTES = 512 * 1024
DESTINATION = (Path(__file__).resolve().parent / "models" /
               "face_detection_yunet_2023mar.onnx")


def download():
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    if DESTINATION.is_file():
        current = DESTINATION.read_bytes()
        if current and len(current) <= MAX_BYTES and \
                hashlib.sha256(current).hexdigest() == SHA256:
            print("PASS verified YuNet model already present")
            return
    request = Request(SOURCE, headers={"User-Agent": "VolunServe-staging-model-build/1.0"})
    with urlopen(request, timeout=60) as response:
        data = response.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES or hashlib.sha256(data).hexdigest() != SHA256:
        raise RuntimeError("YUNET_MODEL_CHECKSUM_MISMATCH: refusing unverified model")
    tmp = DESTINATION.with_suffix(".download")
    tmp.write_bytes(data)
    tmp.replace(DESTINATION)
    print("PASS pinned YuNet model downloaded and verified")


if __name__ == "__main__":
    download()
