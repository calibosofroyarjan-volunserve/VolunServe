/**
 * Staging-only, consented, ON-DEVICE FACE DETECTION DEMO.
 * Face detection is NOT identity recognition, liveness/PAD, or ID validation.
 * No selfie, images, embeddings, video recordings, biometrics, or results
 * are uploaded, persisted, sent to Firestore or passed to Node.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { identityEnvironmentTarget } from "../lib/identityEnvironmentTarget";
import { waitForCameraPreview } from "../lib/identityCameraPreview";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";

type LocalDetector = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    detections?: unknown[];
  };
  close: () => void;
};
type DemoPhase = "idle" | "opening" | "loading_model" | "scanning" | "error";

function stagingOnly(): boolean {
  try {
    return identityEnvironmentTarget({
      runtimeEnv: process.env.EXPO_PUBLIC_VOLUNSERVE_ENV,
      firebaseTarget: process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET,
      projectId: auth.app.options.projectId,
    }) === "staging";
  } catch {
    return false;
  }
}

export default function IdentityFaceDemoWeb() {
  const [signedIn, setSignedIn] = useState(!!auth.currentUser);
  const [consented, setConsented] = useState(false);
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [error, setError] = useState("");
  const [faces, setFaces] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<LocalDetector | null>(null);
  const frameRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const busyRef = useRef(false);
  const allowed = stagingOnly();

  const releaseCamera = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    detectorRef.current?.close();
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    busyRef.current = false;
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1; // invalidate in-flight permission / model load
    releaseCamera();
    setFaces(null);
    setPhase("idle");
  }, [releaseCamera]);

  useEffect(() => onAuthStateChanged(auth, user => setSignedIn(!!user)), []);
  useEffect(() => {
    if (!signedIn || !allowed) stop();
  }, [signedIn, allowed, stop]);
  useEffect(() => () => {
    sessionRef.current += 1;
    releaseCamera();
  }, [releaseCamera]);

  const start = async () => {
    if (!allowed || !signedIn || !consented || busyRef.current || streamRef.current)
      return;
    busyRef.current = true;
    const session = ++sessionRef.current;
    setError("");
    setFaces(null);
    setPhase("opening");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires a supported HTTPS browser or localhost.");
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 720 }, height: { ideal: 720 } },
        });
      } catch (err: any) {
        if (!["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(String(err?.name)))
          throw err;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      if (session !== sessionRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview is not mounted.");
      await waitForCameraPreview(video, stream);
      if (session !== sessionRef.current) return;

      // First show the actual video preview; model download may be slow.
      setPhase("loading_model");
      // Metro cannot bundle dynamic import expressions from this MediaPipe
      // version, so mirror the already-reviewed web-only loader.
      const browserImport = new Function(
        "moduleUrl", "return import(moduleUrl);",
      ) as (url: string) => Promise<any>;
      const { FaceDetector, FilesetResolver } = await browserImport(VISION_URL);
      if (session !== sessionRef.current) return;
      if (!FaceDetector || !FilesetResolver) throw new Error("Face detector module unavailable.");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      if (session !== sessionRef.current) return;
      const detector: LocalDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.65,
        minSuppressionThreshold: 0.3,
      });
      if (session !== sessionRef.current) {
        detector.close();
        return;
      }
      detectorRef.current = detector;
      setPhase("scanning");
      let lastFrameAt = 0;
      const scan = (now: number) => {
        if (session !== sessionRef.current || !videoRef.current || !detectorRef.current)
          return;
        if (now - lastFrameAt >= 180 && videoRef.current.readyState >= 2) {
          lastFrameAt = now;
          try {
            const count = detectorRef.current.detectForVideo(videoRef.current, now)
              .detections?.length || 0;
            setFaces(count);
          } catch {
            releaseCamera();
            setError("The local detector could not read the video frame. Restart the demo.");
            setPhase("error");
            return;
          }
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch (err: any) {
      if (session === sessionRef.current) {
        releaseCamera();
        setError(String(err?.message || "Could not start the local face detection demo."));
        setPhase("error");
      }
    } finally {
      busyRef.current = false;
    }
  };

  const notice = !allowed
    ? "Available only in the isolated VolunServe full-staging environment."
    : !signedIn
      ? "Sign in to your staging account to open the local camera demo."
      : !consented
        ? "Check consent before opening your camera."
        : "This private camera demo is ready.";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F4F8FC" }}
      contentContainerStyle={{ alignItems: "center", padding: 24 }}>
      <View style={{ width: "100%", maxWidth: 800, gap: 14 }}>
        <Text style={{ fontSize: 23, fontWeight: "800", color: "#0F2F5A" }}>
          Local Face Detection — Staging Demo
        </Text>
        <Text style={{ color: "#475569", lineHeight: 21 }}>
          Experimental camera face detection only. This does not recognize your
          identity, match a government ID, validate liveness, or grant Verified Resident.
          No webcam image, biometric template, recording, or detection result is sent
          to VolunServe servers or saved to your account. MediaPipe model files
          are downloaded to the browser; camera frames stay on your device.
        </Text>
        <View style={{ backgroundColor: "#E0F2FE", padding: 14, borderRadius: 10 }}>
          <Text style={{ color: "#0C4A6E" }}>{notice}</Text>
        </View>
        <TouchableOpacity
          disabled={!allowed || !signedIn || phase !== "idle" && phase !== "error"}
          onPress={() => setConsented(value => !value)}
          style={{ padding: 12, borderRadius: 9, backgroundColor: "#FFFFFF" }}>
          <Text style={{ color: "#0F172A" }}>
            {consented ? "☑" : "☐"} I consent to local webcam analysis for this demo only
          </Text>
        </TouchableOpacity>
        <View style={{ height: 410, backgroundColor: "#0F172A", borderRadius: 12, overflow: "hidden" }}>
          {React.createElement("video" as any, {
            ref: videoRef, autoPlay: true, muted: true, playsInline: true,
            style: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" },
          })}
        </View>
        <Text style={{ color: "#334155", fontWeight: "700" }}>
          {phase === "scanning"
            ? faces === 1 ? "One face detected (not identity verified)"
              : faces === 0 ? "No face detected" : String(faces) + " faces visible — show only one"
            : phase === "loading_model" ? "Camera preview visible — loading local detector..."
              : phase === "opening" ? "Opening webcam and waiting for first visible frame..."
                : phase === "error" ? "Camera demo unavailable" : "Camera is off"}
        </Text>
        {error ? <Text accessibilityRole="alert" style={{ color: "#B91C1C" }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          <TouchableOpacity
            disabled={!allowed || !signedIn || !consented || phase === "opening" ||
              phase === "loading_model" || phase === "scanning"}
            onPress={() => void start()}
            style={{ padding: 13, backgroundColor: "#2563EB", borderRadius: 9, opacity:
              !allowed || !signedIn || !consented ? 0.5 : 1 }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
              Start private face detection
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={stop}
            style={{ padding: 13, backgroundColor: "#E2E8F0", borderRadius: 9 }}>
            <Text style={{ color: "#0F172A", fontWeight: "700" }}>Stop & release camera</Text>
          </TouchableOpacity>
        </View>
        {(phase === "opening" || phase === "loading_model") &&
          <ActivityIndicator size="small" color="#2563EB" />}
        <Text style={{ color: "#64748B", fontSize: 12 }}>
          ID/selfie uploads remain disabled (HTTP 423). This demo never approves an
          account. A real biometric verification release requires independent PAD,
          ID issuer verification, privacy approval, and authorized end-to-end tests.
        </Text>
      </View>
    </ScrollView>
  );
}
