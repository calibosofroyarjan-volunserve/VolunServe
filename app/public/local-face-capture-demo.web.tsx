import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { waitForCameraPreview } from "../../lib/identityCameraPreview";
import { evaluateLocalFaceQuality } from "../../lib/localFaceQualityCheck";

/**
 * EXPLICITLY CONSENTED local-only auto-selfie demo.
 * This is framing and basic lighting guidance, NOT liveness/PAD, ID matching,
 * government authenticity, or any account verification. Never uploads photos.
 */
const MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

type Phase = "idle" | "loading" | "red" | "green" | "captured" | "error";
type ResearchOutcome = {
  status: "similarity_observed_unvalidated" | "inconclusive" | "unavailable" | "disabled";
  stage: string;
  score: number | null;
};
const COMPARE_LOCAL_ENDPOINT = "http://127.0.0.1:8765/compare-face";
const MAX_LOCAL_IMAGE_BYTES = 10 * 1024 * 1024;

function localBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected photo could not be read locally."));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === "string" && value.startsWith("data:") &&
          value.includes(",")) {
        resolve(value.slice(value.indexOf(",") + 1));
      } else {
        reject(new Error("Invalid local photo data."));
      }
    };
    reader.readAsDataURL(blob);
  });
}
const localOnly = () => __DEV__ && typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

function getApproxBrightness(video: HTMLVideoElement, canvas: HTMLCanvasElement): number {
  canvas.width = 80;
  canvas.height = 80;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  context.drawImage(video, 0, 0, 80, 80);
  const pixels = context.getImageData(0, 0, 80, 80).data;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    total += (pixels[i] * 0.21 + pixels[i + 1] * 0.72 + pixels[i + 2] * 0.07);
  }
  return total / (80 * 80);
}

async function newFaceDetector(): Promise<any> {
  // Metro cannot statically bundle the existing MediaPipe runtime module.
  // Reuse the exact official model and browser import strategy of the existing
  // Verified Resident web face scan. Only the model JS/WASM files are fetched.
  const browserImport = new Function("moduleUrl", "return import(moduleUrl);") as
    (url: string) => Promise<any>;
  const { FaceDetector, FilesetResolver } = await browserImport(MODULE_URL);
  if (!FaceDetector || !FilesetResolver) throw new Error("Face detector module unavailable.");
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const config = (delegate: string) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO", minDetectionConfidence: 0.65,
    minSuppressionThreshold: 0.3,
  });
  try {
    return await FaceDetector.createFromOptions(vision, config("GPU"));
  } catch {
    return await FaceDetector.createFromOptions(vision, config("CPU"));
  }
}

export default function LocalFaceCaptureDemo() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dimCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const heldSinceRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const captureLockedRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hint, setHint] = useState("Click Try Again to open the camera after consenting.");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [idFrontPhoto, setIdFrontPhoto] = useState<File | null>(null);
  const [comparisonConsent, setComparisonConsent] = useState(false);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [comparison, setComparison] = useState<ResearchOutcome | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const compareTokenRef = useRef(0);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    heldSinceRef.current = null;
    captureLockedRef.current = false;
  }, []);
  const clearPreview = useCallback(() => {
    compareTokenRef.current += 1;
    capturedBlobRef.current = null;
    setComparison(null);
    setComparisonError("");
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);
  useEffect(() => () => {
    stopCamera();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    detectorRef.current?.close?.();
    detectorRef.current = null;
    capturedBlobRef.current = null;
    compareTokenRef.current += 1;
  }, [stopCamera]);

  const capturePhoto = useCallback(async (token: number) => {
    if (captureLockedRef.current) return;
    const video = videoRef.current;
    const canvas = snapCanvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight ||
        token !== sessionRef.current || !streamRef.current) return;
    captureLockedRef.current = true;
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Snapshot canvas unavailable");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("Snapshot failed")),
          "image/jpeg", 0.88);
      });
      if (token !== sessionRef.current || !streamRef.current) return;
      const url = URL.createObjectURL(blob);
      clearPreview();
      previewUrlRef.current = url;
      capturedBlobRef.current = blob;
      setPreviewUrl(url);
      stopCamera();
      setActive(false);
      setPhase("captured");
      setProgress(100);
      setHint("Photo captured locally. Review it or press Retake.");
    } catch {
      if (token === sessionRef.current) {
        stopCamera();
        setActive(false);
        setPhase("error");
        setError("Camera photo capture failed. Press Try Again.");
      }
    } finally {
      captureLockedRef.current = false;
    }
  }, [clearPreview, stopCamera]);

  const compareFaceLocally = async () => {
    if (!localOnly() || !consent || !comparisonConsent || !idFrontPhoto ||
        !capturedBlobRef.current || comparisonBusy || phase !== "captured") {
      setComparisonError("Choose an ID front and give comparison consent after a selfie is captured.");
      return;
    }
    if (idFrontPhoto.size <= 0 || idFrontPhoto.size > MAX_LOCAL_IMAGE_BYTES ||
        capturedBlobRef.current.size > MAX_LOCAL_IMAGE_BYTES ||
        !["image/jpeg", "image/png", "image/webp"].includes(idFrontPhoto.type)) {
      setComparisonError("Choose a JPG, PNG or WebP ID front under 10 MB.");
      return;
    }
    const token = ++compareTokenRef.current;
    setComparisonBusy(true);
    setComparison(null);
    setComparisonError("");
    try {
      const selfie = capturedBlobRef.current;
      const [idFront, capturedSelfie] = await Promise.all([
        localBase64(idFrontPhoto), localBase64(selfie),
      ]);
      if (token !== compareTokenRef.current || !comparisonConsent || !consent) return;
      const response = await fetch(COMPARE_LOCAL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ idFront, capturedSelfie, consent: true }),
      });
      const json: unknown = await response.json();
      if (!response.ok || !json || typeof json !== "object") {
        throw new Error("Local SFace service unavailable. Keep the Python OCR Companion terminal running.");
      }
      const data = json as Record<string, unknown>;
      if (!["similarity_observed_unvalidated", "inconclusive",
            "unavailable", "disabled"].includes(String(data.status)) ||
          data.identityVerified !== false || data.samePersonVerified !== false ||
          data.livenessValidated !== false || data.idIssuerVerified !== false ||
          data.manualReviewRequired !== true ||
          (data.score !== null && (typeof data.score !== "number" ||
            !Number.isFinite(data.score) || Math.abs(data.score) > 1))) {
        throw new Error("Invalid local model response. No face conclusion was made.");
      }
      if (token === compareTokenRef.current) {
        setComparison({
          status: data.status as ResearchOutcome["status"],
          stage: typeof data.stage === "string" ? data.stage : "unknown",
          score: typeof data.score === "number" ? data.score : null,
        });
      }
    } catch (err: any) {
      if (token === compareTokenRef.current) {
        setComparisonError(
          err instanceof TypeError ?
            "Could not connect to local SFace. Restart the Python OCR Companion, not Expo." :
            (typeof err?.message === "string" ? err.message : "Local experimental comparison unavailable."),
        );
      }
    } finally {
      if (token === compareTokenRef.current) setComparisonBusy(false);
    }
  };

  const beginCamera = async () => {
    if (!localOnly() || !consent) {
      setError("Consent is required to use the camera.");
      return;
    }
    stopCamera();
    clearPreview();
    setComparisonBusy(false);
    const token = sessionRef.current;
    setError("");
    setPhase("loading");
    setHint("Requesting camera access...");
    setProgress(0);
    setActive(true);
    lastScanAtRef.current = 0;
    let stream: MediaStream | null = null;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera requires localhost or HTTPS and browser permission.");
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { facingMode: "user", width: { ideal: 720 },
            height: { ideal: 720 } },
        });
      } catch (e: any) {
        if (e?.name !== "OverconstrainedError" &&
            e?.name !== "ConstraintNotSatisfiedError") throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      if (token !== sessionRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview not available.");
      await waitForCameraPreview(video, stream);
      if (token !== sessionRef.current) return;
      setHint("Loading face detection model (no selfie photo is uploaded)...");
      if (!detectorRef.current) detectorRef.current = await newFaceDetector();
      if (token !== sessionRef.current) return;
      setPhase("red");
      setHint("Face the camera and move into the oval.");

      const detect = () => {
        if (token !== sessionRef.current || !streamRef.current) return;
        const element = videoRef.current;
        const now = performance.now();
        if (element && element.readyState >= 2 && now - lastScanAtRef.current > 140) {
          lastScanAtRef.current = now;
          try {
            const detections = detectorRef.current.detectForVideo(element, now)?.detections || [];
            const brightness = dimCanvasRef.current
              ? getApproxBrightness(element, dimCanvasRef.current) : 0;
            const quality = evaluateLocalFaceQuality(
              detections, element.videoWidth, element.videoHeight, brightness,
            );
            setHint(quality.label);
            if (!quality.ready) {
              heldSinceRef.current = null;
              setProgress(0);
              setPhase("red");
            } else {
              if (heldSinceRef.current === null) heldSinceRef.current = now;
              const heldMs = now - heldSinceRef.current;
              setProgress(Math.min(100, Math.round(heldMs / 1500 * 100)));
              setPhase("green");
              if (heldMs >= 1500) {
                void capturePhoto(token);
                return;
              }
            }
          } catch {
            heldSinceRef.current = null;
            setPhase("red");
            setProgress(0);
            setHint("Camera detection is temporarily unavailable. Try Again.");
          }
        }
        animationRef.current = requestAnimationFrame(detect);
      };
      animationRef.current = requestAnimationFrame(detect);
    } catch (e: any) {
      if (token !== sessionRef.current) return;
      stopCamera();
      setActive(false);
      setPhase("error");
      const code = String(e?.name || "");
      setError(code === "NotAllowedError" || code === "PermissionDeniedError"
        ? "Camera permission denied. Allow access in the browser, then try again."
        : String(e?.message || "Unable to start camera and face detector."));
    }
  };

  if (!localOnly()) {
    return <View style={{ padding: 25, backgroundColor: "#F8FAFC", flex: 1 }}>
      <Text>This face capture research demo only works on localhost development.</Text>
    </View>;
  }
  const green = phase === "green";
  return (
    <ScrollView style={{ backgroundColor: "#F2F6FA", flex: 1 }}
      contentContainerStyle={{ padding: 20, alignItems: "center", paddingBottom: 45 }}>
      <View style={{ width: "100%", maxWidth: 680, gap: 12 }}>
        <Text style={{ color: "#13395B", fontSize: 25, fontWeight: "800" }}>
          VolunServe — Auto Selfie Capture Demo
        </Text>
        <Text style={{ color: "#475569", fontSize: 13, lineHeight: 20 }}>
          LOCAL RESEARCH ONLY. Green means one centered, sufficiently well-lit
          face, NOT a real-person, liveness, or identity verification result.
          Red means adjust your position or lighting. A stable green frame
          triggers one automatic LOCAL snapshot. No selfie is uploaded or saved
          to Firebase, Render, or Admin records. The browser downloads the face
          detection model separately when first needed.
        </Text>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1",
          backgroundColor: "white", padding: 16, gap: 12 }}>
          <TouchableOpacity accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => {
              if (consent) {
                stopCamera();
                clearPreview();
                setIdFrontPhoto(null);
                setComparisonConsent(false);
                setComparisonBusy(false);
                setActive(false);
                setPhase("idle");
                setProgress(0);
                setHint("Consent withdrawn — camera stopped and local photo discarded.");
              }
              setConsent(!consent);
            }}
            style={{ flexDirection: "row", gap: 10 }}>
            <Text style={{ color: "#087F72", fontSize: 19 }}>{consent ? "☑" : "☐"}</Text>
            <Text style={{ color: "#334155", fontSize: 13, flex: 1 }}>
              I consent to camera-only face framing and local snapshot preview.
            </Text>
          </TouchableOpacity>
          <View style={{ aspectRatio: 1.25, backgroundColor: "#111827",
            borderRadius: 10, overflow: "hidden", position: "relative" }}>
            {React.createElement("video", {
              ref: videoRef, autoPlay: true, muted: true, playsInline: true,
              style: { width: "100%", height: "100%", objectFit: "cover",
                display: active ? "block" : "none", transform: "scaleX(-1)" },
            })}
            {React.createElement("canvas", { ref: dimCanvasRef,
              style: { display: "none" } })}
            {React.createElement("canvas", { ref: snapCanvasRef,
              style: { display: "none" } })}
            {previewUrl ? <Image source={{ uri: previewUrl }}
              style={{ position: "absolute", width: "100%", height: "100%" }}
              resizeMode="contain" /> : null}
            {active ? <View pointerEvents="none"
              style={{ position: "absolute", top: "12%", bottom: "12%",
                left: "24%", right: "24%", borderRadius: 200,
                borderWidth: 5, borderColor: green ? "#22C55E" : "#EF4444",
                backgroundColor: "transparent" }} /> : null}
            {!active && !previewUrl ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ color: "#E2E8F0", textAlign: "center" }}>
                  The camera starts only after consent and pressing Try Again
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ padding: 12, backgroundColor: green ? "#DCFCE7" :
            phase === "red" ? "#FEE2E2" : "#F1F5F9", borderRadius: 9 }}>
            <Text accessibilityRole="alert"
              style={{ fontSize: 15, fontWeight: "800",
                color: green ? "#166534" : phase === "red" ? "#B91C1C" : "#334155" }}>
              {green ? "GREEN — AUTO CAPTURE" :
                phase === "red" ? "RED — ADJUST FACE" :
                phase === "captured" ? "CAPTURED LOCALLY (UNVERIFIED)" :
                phase === "loading" ? "Starting camera..." : "Camera not active"}
            </Text>
            <Text style={{ color: "#475569", fontSize: 13, marginTop: 3 }}>{hint}</Text>
            {active && progress > 0 ?
              <Text style={{ color: "#475569", fontSize: 12 }}>
                Stable frame: {progress}%
              </Text> : null}
          </View>
          {error ? <Text accessibilityRole="alert"
            style={{ color: "#B91C1C", fontSize: 13 }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap" }}>
            <TouchableOpacity disabled={!consent || phase === "loading"}
              onPress={() => void beginCamera()}
              style={{ padding: 13, borderRadius: 9, flexGrow: 1,
                backgroundColor: !consent || phase === "loading" ? "#94A3B8" : "#12466B",
                alignItems: "center" }}>
              <Text style={{ color: "white", fontWeight: "800" }}>
                {previewUrl ? "Retake Selfie" : "Try Again — Open Camera"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              stopCamera();
              clearPreview();
              setIdFrontPhoto(null);
              setComparisonConsent(false);
              setComparisonBusy(false);
              setActive(false);
              setProgress(0);
              setPhase("idle");
              setError("");
              setHint("Photo discarded. Nothing was submitted.");
            }} style={{ padding: 13, borderRadius: 9, backgroundColor: "#E2E8F0" }}>
              <Text style={{ color: "#143A5B", fontWeight: "800" }}>Cancel / Discard</Text>
            </TouchableOpacity>
          </View>
          {phase === "captured" ? (
            <View style={{ gap: 10, padding: 12, borderWidth: 1,
              borderColor: "#CBD5E1", borderRadius: 9 }}>
              <Text style={{ color: "#143A5B", fontWeight: "800", fontSize: 15 }}>
                Optional: ID Photo vs Auto-Captured Selfie (SFace Research)
              </Text>
              <Text style={{ color: "#475569", lineHeight: 19, fontSize: 12 }}>
                Select only your own or expressly consented National ID FRONT photo.
                This private comparison is separate from National ID OCR and does not
                authenticate the card, validate liveness, or decide whether faces match.
                The image pair goes only to 127.0.0.1 on this PC.
              </Text>
              {React.createElement("input", {
                "aria-label": "Choose National ID FRONT photo for SFace research",
                type: "file",
                accept: "image/jpeg,image/png,image/webp",
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  compareTokenRef.current += 1;
                  setIdFrontPhoto(event.target.files?.[0] || null);
                  setComparison(null);
                  setComparisonError("");
                  setComparisonBusy(false);
                },
                style: { width: "100%", color: "#334155", fontSize: 13 },
              })}
              <TouchableOpacity accessibilityRole="checkbox"
                accessibilityState={{ checked: comparisonConsent }}
                onPress={() => {
                  compareTokenRef.current += 1;
                  setComparisonConsent(!comparisonConsent);
                  setComparison(null);
                  setComparisonError("");
                  setComparisonBusy(false);
                }}
                style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Text style={{ color: "#0F766E", fontSize: 19 }}>
                  {comparisonConsent ? "☑" : "☐"}
                </Text>
                <Text style={{ color: "#334155", fontSize: 12, flex: 1, lineHeight: 19 }}>
                  I consent to a private, one-to-one experimental comparison on this device.
                  I understand the score is uncalibrated and is not identity verification.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button"
                disabled={!comparisonConsent || !idFrontPhoto || comparisonBusy}
                onPress={() => void compareFaceLocally()}
                style={{ padding: 12, borderRadius: 8, alignItems: "center",
                  backgroundColor: !comparisonConsent || !idFrontPhoto || comparisonBusy ?
                    "#94A3B8" : "#134D78" }}>
                <Text style={{ color: "white", fontWeight: "800", fontSize: 13 }}>
                  {comparisonBusy ? "Comparing LOCALLY..." :
                    "COMPARE ID PHOTO VS SELFIE (RESEARCH ONLY)"}
                </Text>
              </TouchableOpacity>
              {comparison ? <View accessibilityRole="alert"
                style={{ padding: 12, borderRadius: 8, backgroundColor: "#F1F5F9", gap: 5 }}>
                <Text style={{ color: "#143A5B", fontWeight: "800", fontSize: 13 }}>
                  {comparison.status === "similarity_observed_unvalidated" ?
                    "SFace similarity observed (NOT a verified match)" :
                    comparison.status === "unavailable" ?
                    "Local YuNet/SFace model weights unavailable" :
                    "Comparison inconclusive — retake photos or manual review"}
                </Text>
                {comparison.score !== null ?
                  <Text style={{ color: "#334155", fontSize: 13 }}>
                    Uncalibrated cosine similarity: {comparison.score.toFixed(5)}
                  </Text> : null}
                <Text style={{ color: "#475569", fontSize: 12 }}>
                  Diagnostic stage: {comparison.stage}. No match threshold, face
                  acceptance, liveness certification, or Resident approval.
                </Text>
              </View> : null}
              {comparisonError ? <Text accessibilityRole="alert"
                style={{ color: "#B91C1C", fontSize: 12 }}>
                {comparisonError}
              </Text> : null}
            </View>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => router.push("/public/local-admin-review-demo" as any)}
          accessibilityRole="button" style={{ padding: 9 }}>
          <Text style={{ color: "#0F766E", fontWeight: "700" }}>
            Back to simulated Admin Final Review
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
