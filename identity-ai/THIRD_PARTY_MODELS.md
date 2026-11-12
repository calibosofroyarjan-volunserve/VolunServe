# Third-party model notices — VolunServe Identity AI (STAGING)

VolunServe integrates pretrained third-party components. The VolunServe product user interface may use its own design and branding: these models do not require a third-party logo or visual watermark. **Do not remove or falsify model provenance, copyright notices, or license conditions.** Academic documentation should describe which models are pretrained and what was built specifically for VolunServe.

## 1. MiniFASNet-V2, anti-spoofing shadow model

- Upstream: MinivisionAI, [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing)
- Converted ONNX model: [garciafido/minifasnet-v2-anti-spoofing-onnx](https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx)
- License: **Apache-2.0**, copyright 2020 Minivision and applicable contributors, [full license](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/LICENSE).
- Pinned weight SHA-256: `d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b`
- Use: an **uncalibrated single-frame shadow classifier only**; it cannot establish liveness or Verified Resident status. Original upstream maps class 1 to a real face, while the ONNX model card describes another class order; evaluate independently on labeled test material.

## 2. YuNet 2023mar, face detector

- Upstream: [OpenCV Zoo / YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- License: **MIT**, copyright (c) 2020 Shiqi Yu. The full license notice is reproduced in `licenses/YuNet-MIT.txt`.
- Pinned model SHA-256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`
- Use: **face detection diagnostics only**. It does not detect spoofing and is not evidence that a face is alive or belongs to the submitting Resident.

## 3. SFace 2021dec, 1-to-1 face-recognition shadow model

- Upstream: [OpenCV Zoo / SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface).
- License: **Apache-2.0**, OpenCV Zoo and applicable SFace contributors ([full license](https://github.com/opencv/opencv_zoo/blob/main/models/face_recognition_sface/LICENSE)). Retain upstream notices and provide the full license with any redistributed model.
- Pinned official model SHA-256: `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`.
- Use: **experimental in-memory 1-to-1 matching observation only**. This is not a verified identity decision, calibrated similarity threshold, proof of real camera capture, ID issuer verification, or PAD/liveness validation.
- Docker staging build downloads from the official OpenCV Zoo mirror and refuses unexpected bytes. The 38.7 MB weights are excluded from Git and are not fetched at request time.

## 4. Other installed runtime components

- MediaPipe FaceMesh / face-landmark runtime: upstream Google MediaPipe (Apache-2.0), [project and licenses](https://github.com/google-ai-edge/mediapipe).
- OpenCV: [licenses](https://github.com/opencv/opencv/tree/4.x/LICENSES).
- Tesseract OCR: [license and project](https://github.com/tesseract-ocr/tesseract).
- These are image processing and OCR helpers, not certified government-ID authenticity or biometric PAD services.

## Security and privacy

- Download weights at **staging Docker build time** only after exact SHA-256 verification. Runtime verification does not fetch models from the vendor.
- User photos, videos and government IDs must not be committed to source control, logged, or uploaded to a model provider.
- Face/ID uploads remain blocked in the staging Node backend until privacy controls and independent PAD testing are approved; automatic Verified Resident promotion remains disabled.
- Staging SHA hashes and license references are auditable even though the resident-facing UI has **no third-party watermark or promotional brand badge**.
