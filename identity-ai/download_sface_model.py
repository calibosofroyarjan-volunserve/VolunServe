"""Fetch official OpenCV Zoo SFace weights for *staging-only* shadow QA.

Upstream: https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
Apache-2.0; SFace contributors and OpenCV Zoo. The exact SHA-256 is
published by OpenCV's Hugging Face distribution. Never fetch at request time.
No resident media or credentials are sent to this source.
"""
import hashlib
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = (
    "https://huggingface.co/opencv/opencv_zoo/resolve/main/"
    "models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
)
SHA256 = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
MIN_BYTES = 30 * 1024 * 1024
MAX_BYTES = 45 * 1024 * 1024
DESTINATION = (
    Path(__file__).resolve().parent / "models" /
    "face_recognition_sface_2021dec.onnx"
)


def _verified(data):
    return MIN_BYTES <= len(data) <= MAX_BYTES and hashlib.sha256(data).hexdigest() == SHA256


def download():
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    if DESTINATION.is_file() and _verified(DESTINATION.read_bytes()):
        print("PASS pinned OpenCV SFace already present")
        return
    req = Request(SOURCE, headers={"User-Agent": "VolunServe-staging-build/1.0"})
    with urlopen(req, timeout=90) as response:
        data = response.read(MAX_BYTES + 1)
    if not _verified(data):
        raise RuntimeError("SFACE_CHECKSUM_MISMATCH: refusing unverified recognition weights")
    tmp = DESTINATION.with_suffix(".download")
    tmp.write_bytes(data)
    tmp.replace(DESTINATION)
    print("PASS pinned OpenCV SFace SHA256")


if __name__ == "__main__":
    download()
