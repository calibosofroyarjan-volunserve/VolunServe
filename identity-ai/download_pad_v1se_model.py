"""Fetch integrity-pinned MiniFASNetV1SE ONNX model for staging-only PAD research.

Weights: minivision-ai Silent-Face-Anti-Spoofing (Apache-2.0).
ONNX distribution: yakhyo/face-anti-spoofing GitHub release `weights`.
A matching SHA-256 proves file identity, NOT anti-spoofing accuracy.
Never download from client requests, never accept unverified source bytes.
"""
import hashlib
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = ("https://github.com/yakhyo/face-anti-spoofing/releases/"
          "download/weights/MiniFASNetV1SE.onnx")
SHA256 = "ebab7f90c7833fbccd46d3a555410e78d969db5438e169b6524be444862b3676"
MIN_BYTES = 1_000_000
MAX_BYTES = 3_000_000
DESTINATION = Path(__file__).resolve().parent / "models" / "minifasnet_v1se.onnx"


def _verified(data):
    return (MIN_BYTES <= len(data) <= MAX_BYTES and
            hashlib.sha256(data).hexdigest() == SHA256)


def download():
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    if DESTINATION.is_file() and _verified(DESTINATION.read_bytes()):
        print("PASS checksum-pinned V1SE secondary PAD model already present")
        return
    req = Request(SOURCE, headers={"User-Agent": "VolunServe-staging-PAD-model-build/1.0"})
    with urlopen(req, timeout=90) as response:
        data = response.read(MAX_BYTES + 1)
    if not _verified(data):
        raise RuntimeError("PAD_V1SE_CHECKSUM_MISMATCH: refusing unverified model")
    temp = DESTINATION.with_suffix(".download")
    try:
        temp.write_bytes(data)
        temp.replace(DESTINATION)
    finally:
        temp.unlink(missing_ok=True)
    print("PASS checksum-pinned V1SE ONNX SHA256; no human data downloaded")


if __name__ == "__main__":
    download()
