"""Download a public, checksum-pinned ONNX model at Docker build time (staging ONLY).

No resident images, tokens or personal information are used. Fail build if the
source is unavailable or its bytes differ from the audited model card.
Model: minivision-ai MiniFASNetV2, ONNX conversion by garciafido (Apache-2.0).
Source: https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx
Upstream attribution must remain alongside this build script.
Independent PAD performance on VolunServe devices has NOT been validated.
"""
import hashlib
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = ("https://huggingface.co/"
          "garciafido/minifasnet-v2-anti-spoofing-onnx/"
          "resolve/main/minifasnet_v2.onnx")
SHA256 = "d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b"
EXPECTED_BYTES = 1_744_116
DESTINATION = Path(__file__).resolve().parent / "models" / "minifasnet_v2.onnx"


def download():
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    if DESTINATION.exists():
        data = DESTINATION.read_bytes()
        if len(data) == EXPECTED_BYTES and hashlib.sha256(data).hexdigest() == SHA256:
            print("PASS pinned passive PAD model already present")
            return
    request = Request(SOURCE, headers={"User-Agent": "VolunServe-staging-model-build/1.0"})
    with urlopen(request, timeout=60) as response:
        data = response.read(EXPECTED_BYTES + 1)
    if len(data) != EXPECTED_BYTES or hashlib.sha256(data).hexdigest() != SHA256:
        raise RuntimeError("PAD_MODEL_CHECKSUM_MISMATCH: refusing unverified third-party model")
    temp = DESTINATION.with_suffix(".download")
    temp.write_bytes(data)
    temp.replace(DESTINATION)
    print("PASS pinned passive PAD model checksum and byte length")


if __name__ == "__main__":
    download()
