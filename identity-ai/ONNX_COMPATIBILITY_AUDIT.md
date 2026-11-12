# VolunServe staging — MiniFASNetV2 ONNX compatibility and provenance audit

**Status: technical evaluation, NOT independently validated liveness or anti-spoofing.**
This audit does not involve real people, government IDs, identity submissions, face images, biometric embeddings, third-party face uploads, or authentication actions. The production site and staging Node upload restrictions remain unchanged.

## Source-level findings (November 13, 2026)

| Question | Verified code or source | What remains uncertain |
|---|---|---|
| What is the input tensor? | Public converted ONNX card says float32, BGR, NCHW, shape (batch,3,80,80), values 0..1. The real pinned ONNX graph is checked in the synthetic CI audit. | No proof that the converted weights were trained for 0..1 inputs. |
| Original NumPy preprocessing? | Original \`minivision-ai/Silent-Face-Anti-Spoofing/src/data_io/functional.py\` -> \`to_tensor(np.ndarray)\` uses \`torch.from_numpy(pic.transpose(2,0,1)).float()\`. Division by 255 is explicitly commented out. | This conflicts with the converted ONNX model card, which calls for \`pixel/255\`. |
| Original class order? | Original \`minivision-ai/Silent-Face-Anti-Spoofing/test.py\` prints **Real Face** only when \`argmax(prediction) == 1\`; indexes 0/2 are presentation attacks in that original implementation. | Converted ONNX card describes output \`[live, print, replay]\` (class 0 live). Graph output dimensions cannot prove which class means genuine without a vetted numerical PyTorch-to-ONNX parity check and labeled evidence. |
| Model output type? | Original MiniFASNet model's \`forward()\` ends with the \`prob\` linear layer, and original inference applies softmax separately. | The pinned ONNX graph is inspected to see whether a Softmax operator was embedded during conversion. Class semantics remain unknown. |
| Crop dimensions? | Original \`CropImage._get_new_box()\` multiplies width and height **independently** by 2.7. VolunServe staging now uses independent dimensions and requires all context inside the frame. | Source shifts/clamps edge crops; VolunServe deliberately returns inconclusive instead. Synthetic ROI consistency ≠ genuine/replay detection accuracy. |
| Weights provenance? | The downloaded ONNX is accepted **only** at SHA-256 \`d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b\`, 1,744,116 bytes. The HF model card claims export from original \`2.7_80x80_MiniFASNetV2.pth\`. | No independent same-input numerical comparison with original PyTorch checkpoint has been established. Do NOT interpret the model-card's "bit-equivalent" assertion as verified. |

## Executable real-ONNX synthetic audit

From an isolated QA checkout with Python 3.11:

\`\`\`powershell
py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python-headless==4.11.0.86 onnx==1.17.0
py -3.11 identity-ai/download_passive_pad_model.py
py -3.11 identity-ai/audit_minifasnet_onnx_synthetic.py
\`\`\`

The no-deploy staging GitHub CI also runs this audit, downloads the same checksum-pinned ONNX model, and checks its actual graph and OpenCV DNN behavior.

What the audit verifies without any face data:

1. Exact **SHA-256 and byte count** of the actual converted ONNX.
2. ONNX graph passes \`onnx.checker\`; confirms float32 input \`(batch,3,80,80)\`, three output classes, last operator, graph softmax count, and opset.
3. Generates **ten fixed non-person patterns** (solid color, gradients, checkerboard). For each, supplies identical 80×80 BGR pixels to the actual ONNX under **upstream 0..255** and **model-card 0..1** interpretations.
4. Checks all outputs have exactly three finite values. Reports aggregate \`class_0/class_1/class_2\` index histograms, cross-scale argmax disagreements, and maximum absolute logit difference.
5. Does **not** label any output index as live, attack, valid ID, verified resident, or a calibrated PAD prediction.

A difference between the synthetic outputs proves input-scale *sensitivity*, not which normalization or semantic class label is correct. Agreement likewise is **not evidence of authenticity or liveness**. The CI output contains no photos, names, UIDs, coordinates, embeddings, passport text, model predictions on people, or passwords.

## Observed private real-camera issue

One previously captured consenting *live* camera frame produced a \`class_2\` observation under **both** input-scale hypotheses, after adequate face context was obtained. This flags possible genuine-user false rejection or incorrect class interpretation. **One face cannot establish population accuracy**, and changing thresholds or reversing labels to fit it would not be evidence of safety.

## Release policy

- Keep \`VOLUNSERVE_PASSIVE_PAD_SHADOW\` inference **observation-only**. Readiness must stay \`independentPadValidated=false\`, \`modelClassMappingValidated=false\`, \`modelInputScaleValidated=false\`, \`thresholdCalibrated=false\`, \`identityDecisionUse=none\`.
- Do not upload private biometric samples, enable staging identity-media upload (HTTP 423), or grant automatic Verified Resident status as part of these compatibility checks.
- Require a separately audited PyTorch-vs-converted-ONNX numerical comparison using the *same original pinned* source checkpoint, the same synthetic input tensor, verified preprocessing, and an output-index-preserving conversion script. \`torch.load(weights_only=True)\` should be used for any future trusted checkpoint comparison. This independent parity test is **not yet completed**.
- Require consented, representative multi-device genuine/printed-photo/screen-replay trials, independent PAD review, and established privacy/security/retention policies before any liveness-gated approval. Printed/screen samples must be camera captures of actual presentations, not merely the source image file.
- Document the third-party licenses in \`identity-ai/THIRD_PARTY_MODELS.md\`. Do not remove attribution; no promotional watermark is required.

### Audited external sources

- Original preprocessing: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/data_io/functional.py
- Original detection + model inference: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/anti_spoof_predict.py
- Original 0/1/2 class convention: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/test.py
- Original crop: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/generate_patches.py
- Original model architecture: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/model_lib/MiniFASNet.py
- Converted ONNX card / pinned weight: https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx
