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

## Independent original-PyTorch vs ONNX numerical parity audit

**Prepared on November 13, 2026 — result depends on the isolated GitHub workflow.** The original checkpoint's published SHA-256 is `a5eb02e1843f19b5386b953cc4c9f011c3f985d0ee2bb9819eea9a142099bec0`. The upstream `MiniFASNet.py` Git blob SHA-1 observed from the original repository is `548f77346020bcbdb5d2bcff362a10d0bb338104`. The converted ONNX SHA-256 remains `d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b`.

A standalone **NO DEPLOY** GitHub Actions workflow, `.github/workflows/identity-pytorch-onnx-parity-no-deploy.yml`, uses an isolated CPU-only PyTorch 2.2.2 QA environment and `identity-ai/audit_minifasnet_pytorch_onnx_parity.py`. Before importing external upstream Python source or calling `torch.load(weights_only=True)`, it verifies both original source Git blob ID and checkpoint SHA-256. It rejects modified or unrelated checkpoint bytes, requires a strict matching `MiniFASNetV2` state dict with `conv6_kernel=(5,5)`, and checks the already pinned real ONNX graph.

It feeds the **same synthetic, non-person, 80×80 BGR float32 tensor** into both networks for each of ten fixed patterns at both 0–255 and 0–1 input scales. It compares **un-softmaxed** corresponding logit indices with fixed absolute/relative tolerances and checks whether the argmax indices remain equal. Unlike comparing two versions' final softmax class descriptions, this can detect an output-index permutation or wrongly converted parameters without knowing which index represents live/attack.

The output reports numerical max differences and `pytorchToOnnxIndexParityOnSyntheticInputs`. **Only a completed successful run** can substantiate numeric parity; simply having a model card claim of "bit equivalent" or a CI script in the repository is insufficient. If source download, checksum, strict state_dict loading, CPU dependencies or numerical tolerance fail, the result is **inconclusive or mismatched** and no automation should silently flip labels.

Even if parity is confirmed, the original training-time input distribution and independently labeled class semantics **remain unvalidated**. The original upstream `test.py` uses class 1 for real; the converted ONNX card says class 0 live. The original NumPy pathway does not divide by 255, while the card prescribes 0–1. No production or staging liveness threshold, class mapping, automatic Verified Resident grant, private-ID policy or model weights are changed by this audit.

### Independently reproducible QA (never run with real photos)

```powershell
py -3.11 -m pip install --index-url https://download.pytorch.org/whl/cpu "torch==2.2.2+cpu"
py -3.11 -m pip install numpy==1.26.4 opencv-contrib-python-headless==4.11.0.86 onnx==1.17.0
py -3.11 identity-ai/download_passive_pad_model.py
$env:PYTHONPATH="identity-ai"
py -3.11 identity-ai/audit_minifasnet_pytorch_onnx_parity.py
```

Original public checkpoint source: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth

Original model architecture source: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/src/model_lib/MiniFASNet.py

Public checkpoint mirror with matching published hash: https://huggingface.co/spaces/Coobeliues/antispoofingdetection/blob/main/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth

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
