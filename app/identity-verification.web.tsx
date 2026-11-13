import { liveUi as designUi } from "../constants/volunserveLiveUi";
import DocumentScreeningSummary from "../components/identity/DocumentScreeningSummary";
import type { DocumentScreening } from "../lib/identityVerification";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { db } from "../lib/firebase";
import { waitForCameraPreview } from "../lib/identityCameraPreview";
import {
    getIdentityStatus,
    onAuthChange,
    UserProfile,
} from "../lib/firebaseAuth";
import {
    CapturedIdentityMedia,
    getIdentityVerificationStatus,
    checkIdentityEngineReady,
    IdentityDocumentType,
    IdentityVerificationStatusResult,
    precheckIdentityDocument,
    submitIdentityVerification,
} from "../lib/identityVerification";

const MEDIAPIPE_VERSION = "1.1.0";
const MEDIAPIPE_MODULE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const WASM_ROOT =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const COLORS = {
  navy: "#0F2F5A",
  blue: "#2563EB",
  blueSoft: "#EFF6FF",
  teal: "#0F9F8F",
  tealDark: "#0F766E",
  tealSoft: "#ECFDF5",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  bg: "#F4F8FC",
  white: "#FFFFFF",
  success: "#15803D",
  successBg: "#DCFCE7",
  warning: "#92400E",
  warningBg: "#FEF3C7",
  danger: "#B91C1C",
  dangerBg: "#FEE2E2",
};

type WizardStep = 1 | 2 | 3;

type ScanState =
  | "idle"
  | "loading"
  | "camera_error"
  | "camera_missing"
  | "camera_busy"
  | "model_error"
  | "no_face"
  | "multiple_faces"
  | "too_far"
  | "too_close"
  | "off_center"
  | "hold_still"
  | "challenge_center"
  | "challenge_left"
  | "challenge_right"
  | "challenge_return"
  | "ready"
  | "captured";

type LiveChecks = {
  faceDetected: boolean;
  oneFace: boolean;
  centered: boolean;
  distanceGood: boolean;
  stable: boolean;
};

type MovementCheck = { direction: "left" | "right"; stage: "center" | "move" | "return" | "complete"; since: number | null };

const EMPTY_CHECKS: LiveChecks = {
  faceDetected: false,
  oneFace: false,
  centered: false,
  distanceGood: false,
  stable: false,
};

const ID_TYPES: Array<{
  value: IdentityDocumentType;
  label: string;
  helper: string;
}> = [
  {
    value: "national_id",
    label: "National ID",
    helper: "PhilSys / National ID",
  },
  {
    value: "drivers_license",
    label: "Driver's License",
    helper: "Valid government-issued license",
  },
  {
    value: "passport",
    label: "Passport",
    helper: "Valid passport bio page",
  },
  {
    value: "umid",
    label: "UMID",
    helper: "SSS / GSIS Unified Multi-Purpose ID",
  },
  {
    value: "prc_id",
    label: "PRC Professional ID",
    helper: "PRC Professional Identification Card (PIC)",
  },
];

function scanCopy(scanState: ScanState) {
  switch (scanState) {
    case "loading":
      return {
        title: "Starting secure face scan...",
        text: "Waiting for visible camera frames, then loading the face detector. Camera access alone is not enough.",
        color: COLORS.blue,
      };
    case "camera_error":
      return {
        title: "Camera access is blocked",
        text: "Allow camera access for this website in your browser settings, then try again.",
        color: COLORS.danger,
      };
    case "camera_missing":
      return {
        title: "No webcam detected",
        text: "Connect or enable a webcam and retry. The browser did not find a video input.",
        color: COLORS.danger,
      };
    case "camera_busy":
      return {
        title: "Camera unavailable",
        text: "Close other apps using the webcam, then try again.",
        color: COLORS.danger,
      };
    case "model_error":
      return {
        title: "Face detector could not load",
        text: "Check your internet connection and reload the face scan.",
        color: COLORS.danger,
      };
    case "no_face":
      return {
        title: "No face detected",
        text: "Move in front of the camera and keep your whole face visible.",
        color: COLORS.warning,
      };
    case "multiple_faces":
      return {
        title: "Only one face allowed",
        text: "Make sure you are the only person visible in the camera.",
        color: COLORS.warning,
      };
    case "too_far":
      return {
        title: "Move closer",
        text: "Your face is detected, but it is too far from the camera.",
        color: COLORS.warning,
      };
    case "too_close":
      return {
        title: "Move back a little",
        text: "Keep your full face comfortably inside the oval.",
        color: COLORS.warning,
      };
    case "off_center":
      return {
        title: "Center your face",
        text: "Move your face toward the center of the oval.",
        color: COLORS.warning,
      };
    case "challenge_center":
      return { title: "Start in the center", text: "Center your face briefly before the movement prompt.", color: COLORS.blue };
    case "challenge_left":
      return { title: "Move left on screen", text: "Move your face toward the LEFT side of the mirrored preview.", color: COLORS.blue };
    case "challenge_right":
      return { title: "Move right on screen", text: "Move your face toward the RIGHT side of the mirrored preview.", color: COLORS.blue };
    case "challenge_return":
      return { title: "Return to the center", text: "Come back to the oval and hold still for the final selfie.", color: COLORS.blue };
    case "hold_still":
      return {
        title: "Face detected — hold still",
        text: "Keep looking directly at the camera while the scan confirms a stable frame.",
        color: COLORS.tealDark,
      };
    case "ready":
      return {
        title: "Face scan ready",
        text: "Capturing your face automatically...",
        color: COLORS.success,
      };
    case "captured":
      return {
        title: "Face scan captured",
        text: "Your live camera frame is ready for private AI comparison.",
        color: COLORS.success,
      };
    default:
      return {
        title: "Ready to start",
        text: "Allow camera access to begin real-time face detection.",
        color: COLORS.muted,
      };
  }
}

export default function IdentityVerificationWeb() {
  const router = useRouter();

  const videoRef = useRef<any>(null);
  const idVideoRef = useRef<HTMLVideoElement | null>(null);
  const idCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const idStreamRef = useRef<MediaStream | null>(null);
  const idCameraSessionRef = useRef(0);
  const documentPrecheckRevisionRef = useRef(0);
  const pendingFaceStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCaptureLockRef = useRef(false);
  const idAutoFramesRef = useRef<{ previous: Uint8Array | null; steadySince: number | null }>({ previous: null, steadySince: null });
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const visionModuleRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const stableSinceRef = useRef<number | null>(null);
  const movementRef = useRef<MovementCheck>({ direction: "left", stage: "center", since: null });
  const lastDetectAtRef = useRef(0);
  const captureLockRef = useRef(false);
  const cameraStartingRef = useRef(false);
  const cameraRequestRef = useRef(0);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [step, setStep] = useState<WizardStep>(1);

  const [idType, setIdType] =
    useState<IdentityDocumentType>("national_id");
  const [idDocument, setIdDocument] =
    useState<CapturedIdentityMedia | null>(null);
  const [idBackDocument, setIdBackDocument] =
    useState<CapturedIdentityMedia | null>(null);
  const [selfie, setSelfie] =
    useState<CapturedIdentityMedia | null>(null);

  const [consent, setConsent] = useState(false);
  const [documentConsent, setDocumentConsent] = useState(false);
  const [documentChecking, setDocumentChecking] = useState(false);
  const [documentPrecheckMessage, setDocumentPrecheckMessage] = useState("");
  const [documentPrecheckOutcome, setDocumentPrecheckOutcome] = useState<"pass" | "review" | "retry" | null>(null);
  useEffect(() => () => {
    // An in-flight OCR response cannot reopen the selfie screen after navigation.
    documentPrecheckRevisionRef.current += 1;
  }, []);

  const [retryingFailed, setRetryingFailed] = useState(false);
  const [idCameraOpen, setIdCameraOpen] = useState(false);
  const [idCameraSide, setIdCameraSide] = useState<"front" | "back">("front");
  const [idCameraReady, setIdCameraReady] = useState(false);
  const [idCameraError, setIdCameraError] = useState("");
  const [idAutoHint, setIdAutoHint] = useState("Keep the complete document visible and steady.");
  const [idAutoProgress, setIdAutoProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusResult, setStatusResult] =
    useState<IdentityVerificationStatusResult | null>(null);
  const [localMessage, setLocalMessage] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  // In-memory only: never write captured government IDs to Firestore or browser storage.
  const [submittedIdPreviewUri, setSubmittedIdPreviewUri] = useState<string | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [liveChecks, setLiveChecks] =
    useState<LiveChecks>(EMPTY_CHECKS);
  const [movementCompleted, setMovementCompleted] = useState(false);
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    let stopProfile: (() => void) | undefined;

    const stopAuth = onAuthChange((user) => {
      if (stopProfile) {
        stopProfile();
        stopProfile = undefined;
      }

      if (!user) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);

      stopProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          setProfile(
            snapshot.exists()
              ? (snapshot.data() as UserProfile)
              : null,
          );
          setLoadingProfile(false);
        },
        (error) => {
          console.log(
            "Identity profile listener error:",
            error,
          );
          setLoadingProfile(false);
        },
      );
    });

    return () => {
      stopAuth();
      if (stopProfile) stopProfile();
    };
  }, []);

  // Release the private camera snapshot when replaced or leaving the page.
  // This preview is intentionally temporary; secure server-side evidence
  // retention would require separate consent, access controls and deletion.
  useEffect(() => {
    const uri = idDocument?.uri;
    return () => {
      if (uri?.startsWith("blob:")) URL.revokeObjectURL(uri);
    };
  }, [idDocument?.uri]);

  useEffect(() => {
    const uri = idBackDocument?.uri;
    return () => {
      if (uri?.startsWith("blob:")) URL.revokeObjectURL(uri);
    };
  }, [idBackDocument?.uri]);

  // Selfie snapshots are sensitive biometric evidence. Revoke the temporary
  // browser URL on replacement/unmount just as we do for ID front/back.
  useEffect(() => {
    const uri = selfie?.uri;
    return () => {
      if (uri?.startsWith("blob:")) URL.revokeObjectURL(uri);
    };
  }, [selfie?.uri]);

  const identityStatus = getIdentityStatus(profile);
  const currentIdentityStatus =
    statusResult?.identityStatus || identityStatus;
  // A failed attempt must not lock the Resident out of retrying.
  // Only hide FAILED while the user actively retries; never hide
  // PENDING or VERIFIED statuses received from the backend.
  const effectiveStatus =
    retryingFailed && currentIdentityStatus === "failed"
      ? "basic"
      : currentIdentityStatus;

  const selectedIdLabel = useMemo(
    () =>
      ID_TYPES.find((item) => item.value === idType)?.label ||
      "Government ID",
    [idType],
  );

  const stopCamera = useCallback(() => {
    // Cancel any deferred camera start when navigating back or unmounting.
    if (pendingFaceStartRef.current !== null) {
      clearTimeout(pendingFaceStartRef.current);
      pendingFaceStartRef.current = null;
    }
    cameraRequestRef.current += 1;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // Ignore browser cleanup differences.
      }
    }

    setCameraActive(false);
    stableSinceRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, [stopCamera]);

  const refreshStatus = async (silent = false) => {
    if (checkingStatus) return;

    try {
      setCheckingStatus(true);
      const result = await getIdentityVerificationStatus();
      setStatusResult(result);

      if (!silent && result.message) {
        setLocalMessage(result.message);
      }
    } catch (error: any) {
      if (!silent) {
        setLocalMessage(
          error?.message
            ? `Unable to check verification status: ${error.message}`
            : "Unable to check verification status. Please try again.",
        );
      }
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (!profile || identityStatus === "basic") return;
    void refreshStatus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, identityStatus]);

  // Scan the physical ID directly from the camera; do not accept gallery
  // images as identity evidence. Live face detection is a separate step.
  const stopIdCamera = useCallback(() => {
    // Invalidate pending toBlob callbacks before closing/cancelling camera.
    idCameraSessionRef.current += 1;
    const stream = idStreamRef.current;
    idStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (idVideoRef.current) {
      idVideoRef.current.srcObject = null;
    }
    setIdCameraReady(false);
    idAutoFramesRef.current = { previous: null, steadySince: null };
    setIdAutoProgress(0);
  }, []);

  useEffect(() => {
    if (!idCameraOpen) {
      stopIdCamera();
      return;
    }
    let cancelled = false;
    const open = async () => {
      try {
        setIdCameraError("");
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS and a browser with camera support.");
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
        } catch (error: any) {
          if (error?.name === "NotAllowedError" || error?.name === "SecurityError") throw error;
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        idStreamRef.current = stream;
        const element = idVideoRef.current;
        if (!element) throw new Error("Unable to initialize the ID camera preview.");
        await waitForCameraPreview(element, stream);
        if (!cancelled) setIdCameraReady(true);
      } catch (error: any) {
        if (!cancelled) {
          setIdCameraError(
            error?.name === "NotAllowedError"
              ? "Camera permission denied. Enable camera access for this site and retry."
              : error?.message || "Unable to open the ID camera.",
          );
          stopIdCamera();
        }
      }
    };
    void open();
    return () => {
      cancelled = true;
      stopIdCamera();
    };
  }, [idCameraOpen, stopIdCamera]);

  const chooseIdDocument = (side: "front" | "back") => {
    documentPrecheckRevisionRef.current += 1;
    setDocumentPrecheckOutcome(null);
    setDocumentPrecheckMessage("");
    idCameraSessionRef.current += 1;
    setIdCameraSide(side);
    setIdCameraReady(false);
    setIdCameraError("");
    setIdAutoHint("Keep all corners of the ID visible. Auto-capture checks image steadiness, not authenticity.");
    setIdAutoProgress(0);
    idAutoFramesRef.current = { previous: null, steadySince: null };
    setIdCameraOpen(true);
  };

  const captureIdDocument = async () => {
    if (idCaptureLockRef.current) return;
    idCaptureLockRef.current = true;
    const captureSession = idCameraSessionRef.current;
    const captureSide = idCameraSide;
    const video = idVideoRef.current;
    const canvas = idCanvasRef.current;
    if (!idCameraReady || !video || !canvas || !video.videoWidth || !video.videoHeight) {
      idCaptureLockRef.current = false;
      return;
    }
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not access the ID capture camera.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (image) => image ? resolve(image) : reject(new Error("Camera image was empty.")),
          "image/jpeg",
          0.92,
        );
      });
      // A cancelled camera, route change, or side change must not save a
      // stale snapshot after an asynchronous canvas.toBlob() finishes.
      if (captureSession !== idCameraSessionRef.current || !idStreamRef.current) return;
      const name = `government-id-${captureSide}-camera-${Date.now()}.jpg`;
      const file = new File([blob], name, { type: "image/jpeg" });
      const media: CapturedIdentityMedia = { uri: URL.createObjectURL(blob), name, type: "image/jpeg", file };
      documentPrecheckRevisionRef.current += 1;
      setDocumentPrecheckOutcome(null);
      setDocumentPrecheckMessage("");
      if (captureSide === "front") {
        setIdDocument(media);
      } else {
        setIdBackDocument(media);
      }
      setLocalMessage("");
      setIdCameraOpen(false);
    } catch (error: any) {
      if (captureSession === idCameraSessionRef.current) {
        setIdCameraError(error?.message || "ID capture failed; please retry.");
      }
    } finally {
      idCaptureLockRef.current = false;
    }
  };

  // Non-biometric quality assist: sample a small local preview. It neither
  // recognizes government IDs nor authenticates them; backend screening is separate.
  useEffect(() => {
    if (!idCameraOpen || !idCameraReady) return;
    const sample = document.createElement("canvas");
    sample.width = 160;
    sample.height = 120;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setIdAutoHint("Auto-capture unavailable. Use the manual capture button.");
      return;
    }
    const timer = window.setInterval(() => {
      const video = idVideoRef.current;
      if (!video || !idStreamRef.current || !video.videoWidth || idCaptureLockRef.current) return;
      try {
        ctx.drawImage(video, 0, 0, 160, 120);
        const pixels = ctx.getImageData(0, 0, 160, 120).data;
        const frame = new Uint8Array(80 * 60);
        let sum = 0, glare = 0, edges = 0, moving = 0, count = 0;
        const previous = idAutoFramesRef.current.previous;
        // Ignore the extreme border. Texture is a framing aid, not ID detection.
        for (let y = 8; y < 52; y++) {
          for (let x = 8; x < 72; x++) {
            const pixel = ((y * 2) * 160 + x * 2) * 4;
            const gray = Math.round(0.299 * pixels[pixel] + 0.587 * pixels[pixel + 1] + 0.114 * pixels[pixel + 2]);
            const at = y * 80 + x;
            frame[at] = gray;
            sum += gray;
            if (gray > 238) glare++;
            const right = pixel + 8;
            const down = pixel + 160 * 8;
            const r = 0.299 * pixels[right] + 0.587 * pixels[right + 1] + 0.114 * pixels[right + 2];
            const d = 0.299 * pixels[down] + 0.587 * pixels[down + 1] + 0.114 * pixels[down + 2];
            if (Math.abs(gray - r) + Math.abs(gray - d) > 34) edges++;
            if (previous) moving += Math.abs(gray - previous[at]);
            count++;
          }
        }
        idAutoFramesRef.current.previous = frame;
        const brightness = sum / count;
        const qualityOk = video.videoWidth >= 640 && brightness >= 55 && brightness <= 210 && glare / count < 0.23 && edges / count >= 0.12;
        const steady = Boolean(previous) && moving / count < 6;
        if (!qualityOk || !steady) {
          idAutoFramesRef.current.steadySince = null;
          setIdAutoProgress(0);
          setIdAutoHint(!qualityOk
            ? "Improve lighting, avoid glare, and keep printed details visible. Manual capture is available."
            : "Hold the document and camera still for automatic capture.");
          return;
        }
        const now = performance.now();
        if (idAutoFramesRef.current.steadySince === null) idAutoFramesRef.current.steadySince = now;
        const heldFor = now - idAutoFramesRef.current.steadySince;
        setIdAutoProgress(Math.min(100, Math.round(heldFor / 1300 * 100)));
        setIdAutoHint("Image looks steady; auto-capturing. Review the result before continuing.");
        if (heldFor >= 1300) void captureIdDocument();
      } catch {
        idAutoFramesRef.current.steadySince = null;
        setIdAutoHint("Camera analysis unavailable. Use Capture manually.");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [idCameraOpen, idCameraReady, idCameraSide]);

  const discardIdDocument = () => {
    documentPrecheckRevisionRef.current += 1;
    setDocumentPrecheckOutcome(null);
    setDocumentPrecheckMessage("");
    setIdDocument(null);
  };
  const discardIdBackDocument = () => {
    documentPrecheckRevisionRef.current += 1;
    setDocumentPrecheckOutcome(null);
    setDocumentPrecheckMessage("");
    setIdBackDocument(null);
  };

  const ensureDetector = async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    if (!visionModuleRef.current) {
      // IMPORTANT:
      // Expo/Metro cannot statically bundle MediaPipe 1.1.0 because the
      // package itself contains a runtime import(expression). On web we
      // intentionally let the browser load the official ESM bundle from
      // jsDelivr instead of importing it through Metro.
      const browserImport = new Function(
        "moduleUrl",
        "return import(moduleUrl);",
      ) as (moduleUrl: string) => Promise<any>;

      visionModuleRef.current =
        await browserImport(
          MEDIAPIPE_MODULE_URL,
        );
    }

    const {
      FaceDetector,
      FilesetResolver,
    } =
      visionModuleRef.current;

    if (
      !FaceDetector ||
      !FilesetResolver
    ) {
      throw new Error(
        "The MediaPipe face detector module did not load correctly.",
      );
    }

    const vision =
      await FilesetResolver.forVisionTasks(
        WASM_ROOT,
      );

    try {
      detectorRef.current =
        await FaceDetector.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                FACE_MODEL,
              delegate:
                "GPU",
            },
            runningMode:
              "VIDEO",
            minDetectionConfidence:
              0.65,
            minSuppressionThreshold:
              0.3,
          },
        );
    } catch {
      detectorRef.current =
        await FaceDetector.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                FACE_MODEL,
              delegate:
                "CPU",
            },
            runningMode:
              "VIDEO",
            minDetectionConfidence:
              0.65,
            minSuppressionThreshold:
              0.3,
          },
        );
    }

    return detectorRef.current;
  };

  const captureFrame = useCallback(async () => {
    if (captureLockRef.current) return;
    const captureSession = cameraRequestRef.current;

    const video = videoRef.current as HTMLVideoElement | null;
    const canvas = canvasRef.current as HTMLCanvasElement | null;

    if (
      !video ||
      !canvas ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    captureLockRef.current = true;
    setScanState("ready");

    try {
      const width = video.videoWidth;
      const height = video.videoHeight;

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create the face capture canvas.");
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => {
            if (value) resolve(value);
            else reject(new Error("Unable to capture the webcam frame."));
          },
          "image/jpeg",
          0.92,
        );
      });

      // Never save a selfie captured after the user left/cancelled this scan.
      if (captureSession !== cameraRequestRef.current || !streamRef.current) return;
      const name = `identity-face-scan-${Date.now()}.jpg`;
      const file = new File([blob], name, {
        type: "image/jpeg",
      });
      const uri = URL.createObjectURL(blob);

      setSelfie({
        uri,
        name,
        type: "image/jpeg",
        file,
      });
      setScanProgress(100);
      setScanState("captured");
      stopCamera();
    } catch (error: any) {
      if (captureSession === cameraRequestRef.current) {
        setScanState("camera_error");
        setCameraError(
          error?.message || "The face scan could not capture a frame.",
        );
      }
    } finally {
      captureLockRef.current = false;
    }
  }, [stopCamera]);

  const detectLoop = useCallback(() => {
    const run = () => {
      const video = videoRef.current as HTMLVideoElement | null;
      const detector = detectorRef.current;

      if (
        !video ||
        !detector ||
        !streamRef.current
      ) {
        return;
      }

      const now = performance.now();

      if (
        video.readyState >= 2 &&
        now - lastDetectAtRef.current >= 120
      ) {
        lastDetectAtRef.current = now;

        try {
          const result = detector.detectForVideo(video, now);
          const detections = result.detections || [];
          const faceDetected = detections.length > 0;
          const oneFace = detections.length === 1;

          if (!faceDetected) {
            movementRef.current.stage = "center";
            movementRef.current.since = null;
            setMovementCompleted(false);
            stableSinceRef.current = null;
            setScanProgress(0);
            setLiveChecks(EMPTY_CHECKS);
            setScanState("no_face");
          } else if (!oneFace) {
            movementRef.current.stage = "center";
            movementRef.current.since = null;
            setMovementCompleted(false);
            stableSinceRef.current = null;
            setScanProgress(0);
            setLiveChecks({
              faceDetected: true,
              oneFace: false,
              centered: false,
              distanceGood: false,
              stable: false,
            });
            setScanState("multiple_faces");
          } else {
            const detection = detections[0];
            const box = detection.boundingBox;
            const videoWidth = video.videoWidth || 1;
            const videoHeight = video.videoHeight || 1;

            if (!box) {
              movementRef.current.stage = "center";
              movementRef.current.since = null;
              setMovementCompleted(false);
              stableSinceRef.current = null;
              setScanProgress(0);
              setLiveChecks({
                faceDetected: true,
                oneFace: true,
                centered: false,
                distanceGood: false,
                stable: false,
              });
              setScanState("off_center");
            } else {
              const centerX =
                box.originX + box.width / 2;
              const centerY =
                box.originY + box.height / 2;
              const dx =
                Math.abs(centerX - videoWidth / 2) /
                videoWidth;
              const dy =
                Math.abs(centerY - videoHeight / 2) /
                videoHeight;
              const widthRatio = box.width / videoWidth;
              const heightRatio = box.height / videoHeight;

              const centered =
                dx <= 0.13 &&
                dy <= 0.16;
              const tooFar =
                widthRatio < 0.24 ||
                heightRatio < 0.32;
              const tooClose =
                widthRatio > 0.72 ||
                heightRatio > 0.88;
              const distanceGood =
                !tooFar &&
                !tooClose;

              if (!distanceGood) {
                movementRef.current.stage = "center";
                movementRef.current.since = null;
                setMovementCompleted(false);
                stableSinceRef.current = null;
                setScanProgress(0);
                setLiveChecks({
                  faceDetected: true,
                  oneFace: true,
                  centered,
                  distanceGood: false,
                  stable: false,
                });
                setScanState(
                  tooFar ? "too_far" : "too_close",
                );
              } else if (movementRef.current.stage !== "complete") {
                // Camera-motion prompt only: replay or moved photo may still pass.
                // Never treat this as validated liveness or presentation-attack detection.
                const movement = movementRef.current;
                const displayOffset = 0.5 - centerX / videoWidth; // mirrored preview
                const onSide = movement.direction === "left"
                  ? displayOffset <= -0.15 : displayOffset >= 0.15;
                const qualifies = movement.stage === "move" ? onSide : centered;
                if (!qualifies) {
                  movement.since = null;
                } else {
                  if (movement.since === null) movement.since = now;
                  const held = now - movement.since;
                  if (movement.stage === "center" && held >= 550) {
                    movement.stage = "move"; movement.since = null;
                  } else if (movement.stage === "move" && held >= 400) {
                    movement.stage = "return"; movement.since = null;
                  } else if (movement.stage === "return" && held >= 650) {
                    movement.stage = "complete"; movement.since = null;
                    setMovementCompleted(true);
                  }
                }
                stableSinceRef.current = null;
                setScanProgress(0);
                setLiveChecks({ faceDetected: true, oneFace: true, centered, distanceGood: true, stable: false });
                setScanState(movement.stage === "center" ? "challenge_center"
                  : movement.stage === "move"
                    ? movement.direction === "left" ? "challenge_left" : "challenge_right"
                    : "challenge_return");
              } else if (!centered) {
                stableSinceRef.current = null;
                setScanProgress(0);
                setLiveChecks({
                  faceDetected: true,
                  oneFace: true,
                  centered: false,
                  distanceGood: true,
                  stable: false,
                });
                setScanState("off_center");
              } else {
                if (stableSinceRef.current === null) {
                  stableSinceRef.current = now;
                }

                const heldFor =
                  now - stableSinceRef.current;
                const progress =
                  Math.min(
                    100,
                    Math.round((heldFor / 1400) * 100),
                  );

                setScanProgress(progress);
                setLiveChecks({
                  faceDetected: true,
                  oneFace: true,
                  centered: true,
                  distanceGood: true,
                  stable: heldFor >= 900,
                });

                if (heldFor >= 1400) {
                  setScanState("ready");
                  void captureFrame();
                  return;
                }

                setScanState("hold_still");
              }
            }
          }
        } catch (error) {
          console.log("Live face detection error:", error);
        }
      }

      animationRef.current =
        requestAnimationFrame(run);
    };

    animationRef.current =
      requestAnimationFrame(run);
  }, [captureFrame]);

  const startCamera = async () => {
    if (cameraStartingRef.current || streamRef.current) return;
    cameraStartingRef.current = true;
    const requestId = ++cameraRequestRef.current;

    setCameraError("");
    setScanState("loading");
    setScanProgress(0);
    setLiveChecks(EMPTY_CHECKS);
    captureLockRef.current = false;
    stableSinceRef.current = null;
    // Randomized motion guidance, not validated anti-spoofing.
    movementRef.current = { direction: Math.random() < 0.5 ? "left" : "right", stage: "center", since: null };
    setMovementCompleted(false);

    let stream: MediaStream | null = null;
    let phase: "camera" | "preview" | "detector" = "camera";

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Webcam access requires localhost or HTTPS in a supported browser.",
        );
      }

      // Request the camera FIRST, separately from MediaPipe, so its real
      // browser error cannot be mislabeled as a face-detector failure.
      // No facingMode requirement: desktop USB/integrated webcams are valid.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 720 }, height: { ideal: 720 } },
        });
      } catch (firstError: any) {
        // Some camera drivers reject even ideal constraints; retry once
        // without constraints only for constraint-related failures.
        if (firstError?.name !== "OverconstrainedError" &&
            firstError?.name !== "ConstraintNotSatisfiedError") throw firstError;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false, video: true,
        });
      }

      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      phase = "preview";
      const video = videoRef.current as HTMLVideoElement | null;
      if (!video) throw new Error("Webcam preview element was not mounted.");
      await waitForCameraPreview(video, stream);
      if (requestId !== cameraRequestRef.current) return;
      // Reveal visible live pixels immediately, before the MediaPipe bundle
      // loads; a slow detector must never hide a working camera behind
      // the full-screen "Allow Camera" overlay.
      setCameraActive(true);
      phase = "detector";
      await ensureDetector();
      if (requestId !== cameraRequestRef.current) return;
      setScanState("no_face");
      detectLoop();
    } catch (error: any) {
      if (requestId !== cameraRequestRef.current) return;
      const name = String(error?.name || "");
      let state: ScanState = "camera_error";
      let message = String(error?.message || "The camera could not be opened.");

      if (phase === "detector") {
        state = "model_error";
        message = `Webcam opened, but face detector failed: ${message}`;
      } else if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        message = "Camera access was denied or blocked. Allow camera for this site in browser settings and retry.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        state = "camera_missing";
        message = "The browser could not find a connected or enabled webcam.";
      } else if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
        state = "camera_busy";
        message = "The webcam could not start. Close other camera apps and check Windows camera privacy settings.";
      }
      stopCamera();
      setCameraError(message);
      setScanState(state);
      console.warn("VolunServe face scan startup:", { phase, name, message });
    } finally {
      cameraStartingRef.current = false;
    }
  };

  const openFaceScan = async () => {
    if (documentChecking) return;
    if (!idDocument) {
      setDocumentPrecheckMessage("Capture the front of your government ID first.");
      return;
    }
    if (idType !== "passport" && !idBackDocument) {
      setDocumentPrecheckMessage("Capture the reverse of your government ID before proceeding.");
      return;
    }
    if (!documentConsent) {
      setDocumentPrecheckMessage(
        "Please consent to uploading these ID photos for a preliminary OCR document check before opening the face camera.",
      );
      return;
    }
    const revision = documentPrecheckRevisionRef.current;
    setDocumentChecking(true);
    setDocumentPrecheckOutcome(null);
    setDocumentPrecheckMessage("Checking the selected ID type, front/back arrangement and image quality...");
    try {
      await checkIdentityEngineReady();
      if (revision !== documentPrecheckRevisionRef.current) return;
      const result = await precheckIdentityDocument({
        idType, idDocument,
        idBackDocument: idType === "passport" ? null : idBackDocument,
        consent: documentConsent,
      });
      if (revision !== documentPrecheckRevisionRef.current) return;
      setDocumentPrecheckOutcome(result.outcome);
      setDocumentPrecheckMessage(result.message);
      if (result.outcome === "retry") return;
      // PASS is preliminary OCR plausibility; REVIEW is a blurry-National-ID
      // human rescan case. Neither authenticates an ID or establishes liveness.
      setSelfie(null);
      stopCamera();
      setStep(2);
      pendingFaceStartRef.current = setTimeout(() => {
        pendingFaceStartRef.current = null;
        void startCamera();
      }, 250);
    } catch (error: any) {
      if (revision === documentPrecheckRevisionRef.current) {
        setDocumentPrecheckOutcome("retry");
        setDocumentPrecheckMessage(
          error?.message || "ID recognition is unavailable. Retake or retry after checking the connection.",
        );
      }
    } finally {
      setDocumentChecking(false);
    }
  };

  const retake = () => {
    if (selfie?.uri?.startsWith("blob:")) {
      URL.revokeObjectURL(selfie.uri);
    }

    setSelfie(null);
    setMovementCompleted(false);
    setScanProgress(0);
    setLiveChecks(EMPTY_CHECKS);
    setScanState("idle");
    if (pendingFaceStartRef.current !== null) clearTimeout(pendingFaceStartRef.current);
    pendingFaceStartRef.current = setTimeout(() => {
      pendingFaceStartRef.current = null;
      void startCamera();
    }, 100);
  };

  const submitVerification = async () => {
    if (submitting) return;

    if (!idDocument) {
      setStep(1);
      Alert.alert(
        "Government ID Required",
        "Select a clear image of your government-issued ID.",
      );
      return;
    }

    if (idType !== "passport" && !idBackDocument) {
      setStep(1);
      setLocalMessage("The back-side ID scan is required before submission.");
      return;
    }

    if (!selfie) {
      setStep(2);
      Alert.alert(
        "Face Scan Required",
        "Complete the live face scan before starting AI verification.",
      );
      return;
    }

    if (!consent) {
      Alert.alert(
        "Consent Required",
        "Confirm that VolunServe may process the submitted identity images for account verification.",
      );
      return;
    }

    stopCamera();

    let requestStarted = false;
    try {
      setSubmitting(true);
      setLocalMessage("");
      setSubmissionError("");
      // Check the separate Render Python engine before private images
      // are uploaded or a limited AI attempt is consumed.
      await checkIdentityEngineReady();
      setStep(3);
      requestStarted = true;

      const result =
        await submitIdentityVerification({
          idType,
          idDocument,
          idBackDocument: idType === "passport" ? null : idBackDocument,
          selfie,
        });

      setRetryingFailed(false);
      setSubmittedIdPreviewUri(idDocument.uri);
      setStatusResult({
        identityStatus: result.status,
        identityVerified: result.status === "verified",
        verificationId: result.verificationId,
        decision: result.decision,
        matchScore: result.matchScore,
        livenessScore: result.livenessScore,
        documentScreening: result.documentScreening,
        message: result.message,
      });

      setLocalMessage(
        result.message ||
          (result.status === "verified"
            ? "Identity verification completed successfully."
            : result.status === "failed"
              ? "This verification attempt failed. Please try again with clear identity images."
              : "Your submission is pending LGU/Admin review."),
      );
    } catch (error: any) {
      // In web builds React Native Alert.alert may be unavailable/silent.
      // Never send the Resident back to face scan without an explanation.
      const reason = String(
        error?.message || "The AI verification service could not complete your submission.",
      );
      console.error("[Identity Verification] Submission failed", {
        stage: "submit",
        message: reason,
      });

      // Readiness failures did not send any face/ID media; show the actual
      // infrastructure error, and allow a retry only after setup is fixed.
      if (!requestStarted) {
        setSubmissionError(reason);
        setStep(2);
        return;
      }

      // The backend might have completed the Firestore transaction even
      // though its response was interrupted; check before suggesting retry.
      let latest: IdentityVerificationStatusResult | null = null;
      try {
        latest = await getIdentityVerificationStatus();
      } catch (statusError: any) {
        console.warn("[Identity Verification] Unable to confirm saved status", {
          message: String(statusError?.message || "unknown status error"),
        });
      }
      if (
        latest &&
        (latest.identityStatus === "verified" ||
          latest.identityStatus === "pending" ||
          latest.identityStatus === "failed")
      ) {
        setSubmittedIdPreviewUri(idDocument.uri);
        setStatusResult(latest);
        setLocalMessage(latest.message || reason);
        setSubmissionError("");
      } else {
        setSubmissionError(reason);
        setStep(2);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={styles.centeredText}>
          Loading identity status...
        </Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Ionicons
          name="person-circle-outline"
          size={54}
          color="#94A3B8"
        />
        <Text style={styles.statusTitle}>
          Account unavailable
        </Text>
        <Text style={styles.centeredText}>
          Sign in again before opening identity verification.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.primaryButtonText}>
            Go to Sign In
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (effectiveStatus === "failed") {
    return (
      <StatusScreen
        icon="alert-circle-outline"
        title="Verification Attempt Failed"
        message={
          localMessage ||
          statusResult?.message ||
          "We could not verify the submitted identity images. Your Resident account is not banned; you can try again."
        }
        background={COLORS.dangerBg}
        color={COLORS.danger}
        badge="Failed · Retry Allowed"
        idPreviewUri={submittedIdPreviewUri}
        idPreviewLabel={selectedIdLabel}
        primaryLabel="Try Verification Again"
        primaryAction={() => {
          stopCamera();
          if (selfie?.uri?.startsWith("blob:")) {
            URL.revokeObjectURL(selfie.uri);
          }
          setRetryingFailed(true);
          setStatusResult(null);
          setLocalMessage("");
          setSubmittedIdPreviewUri(null);
          setIdDocument(null);
          setIdBackDocument(null);
          setSelfie(null);
          setConsent(false);
          setScanState("idle");
          setScanProgress(0);
          setLiveChecks(EMPTY_CHECKS);
          setCameraError("");
          setStep(1);
        }}
        secondaryLabel="Back to Profile"
        secondaryAction={() => router.back()}
      />
    );
  }

  if (effectiveStatus === "verified") {
    return (
      <StatusScreen
        icon="checkmark-circle"
        title="Verified Resident"
        message={
          localMessage ||
          statusResult?.message ||
          "Your identity has been successfully verified."
        }
        background={COLORS.successBg}
        color={COLORS.success}
        badge="Verified"
        idPreviewUri={submittedIdPreviewUri}
        idPreviewLabel={selectedIdLabel}
        documentScreening={statusResult?.documentScreening}
        primaryLabel="Back to Profile"
        primaryAction={() => router.back()}
      />
    );
  }

  if (effectiveStatus === "pending") {
    return (
      <StatusScreen
        icon="hourglass-outline"
        title="Verification in Review"
        message={
          localMessage ||
          statusResult?.message ||
          "Your identity verification is pending LGU/Admin review."
        }
        background={COLORS.warningBg}
        color={COLORS.warning}
        badge="Pending"
        idPreviewUri={submittedIdPreviewUri}
        idPreviewLabel={selectedIdLabel}
        documentScreening={statusResult?.documentScreening}
        primaryLabel={
          checkingStatus ? "Checking..." : "Check Status"
        }
        primaryAction={() => void refreshStatus()}
        loading={checkingStatus}
        secondaryLabel="Back to Profile"
        secondaryAction={() => router.back()}
      />
    );
  }

  const copy = scanCopy(scanState);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (step === 1) {
              router.back();
            } else {
              stopCamera();
              setStep(step === 3 ? 2 : 1);
            }
          }}
          disabled={submitting}
        >
          <Ionicons
            name="arrow-back"
            size={19}
            color={COLORS.text}
          />
          <Text style={styles.backText}>
            {step === 1 ? "Back to Profile" : "Back"}
          </Text>
        </TouchableOpacity>

        <View style={styles.securePill}>
          <Ionicons
            name="lock-closed"
            size={14}
            color={COLORS.tealDark}
          />
          <Text style={styles.securePillText}>
            Secure Verification
          </Text>
        </View>
      </View>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>
          VOLUNSERVE IDENTITY VERIFICATION
        </Text>
        <Text style={styles.title}>
          Become a Verified Resident
        </Text>
        <Text style={styles.subtitle}>
          Government ID + real-time face detection + private
          1-to-1 AI face comparison.
        </Text>
      </View>

      <WizardProgress step={step} />

      {step === 1 ? (
        <UploadIdStep
          idType={idType}
          setIdType={(value) => {
            if (idType !== value) {
              discardIdDocument();
              discardIdBackDocument();
              documentPrecheckRevisionRef.current += 1;
              idCameraSessionRef.current += 1;
              setIdCameraOpen(false);
            }
            setIdType(value);
          }}
          idDocument={idDocument}
          idBackDocument={idBackDocument}
          cameraSide={idCameraSide}
          selectedIdLabel={selectedIdLabel}
          cameraOpen={idCameraOpen}
          cameraReady={idCameraReady}
          cameraError={idCameraError}
          autoHint={idAutoHint}
          autoProgress={idAutoProgress}
          idVideoRef={idVideoRef}
          idCanvasRef={idCanvasRef}
          onPick={() => chooseIdDocument("front")}
          onPickBack={() => chooseIdDocument("back")}
          onCapture={() => void captureIdDocument()}
          onCancel={() => {
            idCameraSessionRef.current += 1;
            setIdCameraOpen(false);
          }}
          onNext={() => void openFaceScan()}
          documentConsent={documentConsent}
          onDocumentConsentChange={(allowed) => {
            if (!allowed) {
              documentPrecheckRevisionRef.current += 1;
              setDocumentPrecheckOutcome(null);
              setDocumentPrecheckMessage("");
            }
            setDocumentConsent(allowed);
          }}
          documentChecking={documentChecking}
          documentPrecheckMessage={documentPrecheckMessage}
          documentPrecheckOutcome={documentPrecheckOutcome}
          onRemove={discardIdDocument}
          onRemoveBack={discardIdBackDocument}
        />
      ) : null}

      {step === 2 ? (
        <View style={styles.stepCard}>
          {documentPrecheckOutcome === "review" ? (
            <View style={styles.truthNote} accessibilityRole="alert">
              <Ionicons name="information-circle-outline" size={18} color={COLORS.danger}/>
              <Text style={styles.truthText}>{documentPrecheckMessage}</Text>
            </View>
          ) : null}
          <View style={styles.stepHeader}>
            <View style={styles.stepHeaderNumber}>
              <Text style={styles.stepHeaderNumberText}>
                2
              </Text>
            </View>
            <View style={styles.stepHeaderCopy}>
              <Text style={styles.stepTitle}>
                Real-time Face Scan
              </Text>
              <Text style={styles.stepSubtitle}>
                VolunServe checks camera alignment, asks for a random sideways movement, then captures a still selfie. This is not validated anti-spoofing.
              </Text>
            </View>
          </View>

          <View style={styles.scanGrid}>
            <View style={styles.cameraCard}>
              {selfie ? (
                <Image
                  source={{ uri: selfie.uri }}
                  style={styles.cameraPreview}
                  resizeMode="cover"
                />
              ) : (
                React.createElement("video" as any, {
                  ref: videoRef,
                  autoPlay: true,
                  muted: true,
                  playsInline: true,
                  style: {
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)",
                    background: "#0F172A",
                  },
                })
              )}

              {React.createElement("canvas" as any, {
                ref: canvasRef,
                style: {
                  display: "none",
                },
              })}

              {!selfie ? (
                <View
                  pointerEvents="none"
                  style={styles.scanOverlay}
                >
                  <View
                    style={[
                      styles.faceOval,
                      {
                        borderColor:
                          liveChecks.faceDetected &&
                          liveChecks.oneFace &&
                          liveChecks.centered &&
                          liveChecks.distanceGood
                            ? "#34D399"
                            : "#FFFFFF",
                      },
                    ]}
                  />

                  <View
                    style={[
                      styles.scanStatusPill,
                      {
                        backgroundColor:
                          "rgba(15,23,42,0.78)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.scanStatusDot,
                        {
                          backgroundColor: copy.color,
                        },
                      ]}
                    />
                    <Text style={styles.scanStatusText}>
                      {copy.title}
                    </Text>
                  </View>

                  {scanState === "hold_still" ||
                  scanState === "ready" ? (
                    <View style={styles.holdProgressTrack}>
                      <View
                        style={[
                          styles.holdProgressFill,
                          {
                            width: `${scanProgress}%`,
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {!cameraActive &&
              !selfie ? (
                <View style={styles.cameraStartOverlay}>
                  <Ionicons
                    name="scan-outline"
                    size={44}
                    color={COLORS.blue}
                  />
                  <Text style={styles.cameraStartTitle}>
                    {copy.title}
                  </Text>
                  <Text style={styles.cameraStartText}>
                    {cameraError || copy.text}
                  </Text>
                  <TouchableOpacity
                    style={styles.cameraStartButton}
                    onPress={() => void startCamera()}
                  >
                    <Ionicons
                      name="camera-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.cameraStartButtonText}>
                      {scanState === "loading"
                        ? "Starting..."
                        : "Allow Camera & Start Scan"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.requirementsCard}>
              <Text style={styles.requirementsTitle}>
                Live checks
              </Text>

              <LiveCheck
                passed={liveChecks.faceDetected}
                label="Face detected"
              />
              <LiveCheck
                passed={liveChecks.oneFace}
                label="Only one face in frame"
              />
              <LiveCheck
                passed={liveChecks.centered}
                label="Face centered in oval"
              />
              <LiveCheck
                passed={liveChecks.distanceGood}
                label="Good camera distance"
              />
              <LiveCheck
                passed={liveChecks.stable}
                label="Face held still"
              />
              <LiveCheck
                passed={movementCompleted}
                label="Movement prompt completed (not proof of liveness)"
              />

              <View style={styles.guidanceCard}>
                <Text
                  style={[
                    styles.guidanceTitle,
                    { color: copy.color },
                  ]}
                >
                  {copy.title}
                </Text>
                <Text style={styles.guidanceText}>
                  {cameraError || copy.text}
                </Text>
              </View>

              <View style={styles.truthNote}>
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color="#475569"
                />
                <Text style={styles.truthText}>
                  This is real-time face detection and auto-capture.
                  It is not the same as bank-grade liveness or
                  anti-spoofing.
                </Text>
              </View>
            </View>
          </View>

          {submissionError ? (
            <View style={styles.submissionErrorCard} accessibilityRole="alert">
              <Ionicons
                name="alert-circle-outline"
                size={22}
                color={COLORS.danger}
              />
              <View style={styles.submissionErrorContent}>
                <Text style={styles.submissionErrorTitle}>
                  AI verification was not completed
                </Text>
                <Text style={styles.submissionErrorText}>
                  {submissionError}
                </Text>
                <Text style={styles.submissionErrorHint}>
                  Your account has not been marked as verified. Check your connection and
                  the message above before resubmitting; each completed AI result can count as an attempt.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.captureActions}>
            {selfie ? (
              <TouchableOpacity
                style={styles.secondaryWideButton}
                onPress={retake}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={COLORS.blue}
                />
                <Text style={styles.secondaryWideButtonText}>
                  Retake Face Scan
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.secondaryWideButton,
                  cameraActive && styles.disabledButton,
                ]}
                disabled={cameraActive}
                onPress={() => void startCamera()}
              >
                <Ionicons
                  name="camera-outline"
                  size={18}
                  color={COLORS.blue}
                />
                <Text style={styles.secondaryWideButtonText}>
                  Start Camera
                </Text>
              </TouchableOpacity>
            )}


          </View>

          <TouchableOpacity
            style={styles.consentRow}
            onPress={() => setConsent(!consent)}
          >
            <View
              style={[
                styles.checkbox,
                consent && styles.checkboxActive,
              ]}
            >
              {consent ? (
                <Ionicons
                  name="checkmark"
                  size={15}
                  color="#FFFFFF"
                />
              ) : null}
            </View>
            <Text style={styles.consentText}>
              I consent to VolunServe processing my
              government ID and captured face image for
              private 1-to-1 identity verification.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.verifyButton,
              (!selfie || !consent) &&
                styles.disabledButton,
            ]}
            disabled={!selfie || !consent}
            onPress={() => void submitVerification()}
          >
            <Ionicons
              name="scan-outline"
              size={19}
              color="#FFFFFF"
            />
            <Text style={styles.verifyButtonText}>
              Start AI Verification
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 3 ? (
        <AiVerificationStep
          submitting={submitting}
          idLabel={selectedIdLabel}
        />
      ) : null}

      <View style={styles.privacyNote}>
        <Ionicons
          name="shield-checkmark-outline"
          size={18}
          color={COLORS.tealDark}
        />
        <Text style={styles.privacyNoteText}>
          Live face detection runs in your browser. Only
          the captured verification image is submitted to
          the VolunServe backend for the ID-to-selfie
          comparison.
        </Text>
      </View>
    </ScrollView>
  );
}

function LiveCheck({
  passed,
  label,
}: {
  passed: boolean;
  label: string;
}) {
  return (
    <View style={styles.requirementRow}>
      <View
        style={[
          styles.requirementCheck,
          !passed && styles.requirementCheckOff,
        ]}
      >
        <Ionicons
          name={passed ? "checkmark" : "ellipse-outline"}
          size={13}
          color={passed ? "#FFFFFF" : "#94A3B8"}
        />
      </View>
      <Text
        style={[
          styles.requirementText,
          passed && styles.requirementTextPassed,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function WizardProgress({
  step,
}: {
  step: WizardStep;
}) {
  const items = [
    { number: 1, label: "Government ID" },
    { number: 2, label: "Face Scan" },
    { number: 3, label: "AI Verification" },
  ];

  return (
    <View style={styles.progressCard}>
      {items.map((item, index) => {
        const active = step === item.number;
        const complete = step > item.number;

        return (
          <React.Fragment key={item.number}>
            <View style={styles.progressItem}>
              <View
                style={[
                  styles.progressCircle,
                  (active || complete) &&
                    styles.progressCircleActive,
                ]}
              >
                {complete ? (
                  <Ionicons
                    name="checkmark"
                    size={17}
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={[
                      styles.progressNumber,
                      (active || complete) &&
                        styles.progressNumberActive,
                    ]}
                  >
                    {item.number}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  active && styles.progressLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </View>

            {index < items.length - 1 ? (
              <View
                style={[
                  styles.progressLine,
                  complete && styles.progressLineActive,
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function UploadIdStep({
  idType,
  setIdType,
  idDocument,
  idBackDocument,
  cameraSide,
  selectedIdLabel,
  cameraOpen,
  cameraReady,
  cameraError,
  autoHint,
  autoProgress,
  idVideoRef,
  idCanvasRef,
  onPick,
  onPickBack,
  onCapture,
  onCancel,
  onNext,
  documentConsent,
  onDocumentConsentChange,
  documentChecking,
  documentPrecheckMessage,
  documentPrecheckOutcome,
  onRemove,
  onRemoveBack,
}: {
  idType: IdentityDocumentType;
  setIdType: (value: IdentityDocumentType) => void;
  idDocument: CapturedIdentityMedia | null;
  idBackDocument: CapturedIdentityMedia | null;
  cameraSide: "front" | "back";
  selectedIdLabel: string;
  cameraOpen: boolean;
  cameraReady: boolean;
  cameraError: string;
  autoHint: string;
  autoProgress: number;
  idVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  idCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  onPick: () => void;
  onPickBack: () => void;
  onCapture: () => void;
  onCancel: () => void;
  onNext: () => void;
  documentConsent: boolean;
  onDocumentConsentChange: (value: boolean) => void;
  documentChecking: boolean;
  documentPrecheckMessage: string;
  documentPrecheckOutcome: "pass" | "review" | "retry" | null;
  onRemove: () => void;
  onRemoveBack: () => void;
}) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <View style={styles.stepHeaderNumber}>
          <Text style={styles.stepHeaderNumberText}>
            1
          </Text>
        </View>
        <View style={styles.stepHeaderCopy}>
          <Text style={styles.stepTitle}>
            Scan Government ID
          </Text>
          <Text style={styles.stepSubtitle}>
            Scan your physical government ID. Put the portrait/front in Front and the reverse in Back. Auto-capture checks steadiness, not which side is shown; OCR checks orientation after submission.
          </Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>
        ID Type
      </Text>

      <View style={styles.idTypeGrid}>
        {ID_TYPES.map((item) => {
          const selected = idType === item.value;

          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.idTypeButton,
                selected && styles.idTypeButtonActive,
              ]}
              onPress={() => setIdType(item.value)}
            >
              <Ionicons
                name={
                  selected
                    ? "checkmark-circle"
                    : "card-outline"
                }
                size={18}
                color={
                  selected
                    ? COLORS.blue
                    : "#64748B"
                }
              />
              <View style={styles.idTypeCopy}>
                <Text
                  style={[
                    styles.idTypeLabel,
                    selected && styles.idTypeLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
                <Text style={styles.idTypeHelper}>
                  {item.helper}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {([
        { side: "front" as const, label: "Front of ID", media: idDocument, open: onPick, remove: onRemove },
        ...(idType === "passport" ? [] : [
          { side: "back" as const, label: "Back of ID", media: idBackDocument, open: onPickBack, remove: onRemoveBack },
        ]),
      ]).map(({ side, label, media, open, remove }) => (
        <View key={side}>
          <Text style={styles.fieldLabel}>{label}</Text>
          {media ? (
            <View style={styles.mediaPreviewCard}>
              <Image
                source={{ uri: media.uri }}
                style={styles.idPreview}
                resizeMode="cover"
              />
              <View style={styles.mediaPreviewInfo}>
                <View style={styles.mediaSuccessIcon}>
                  <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                </View>
                <View style={styles.mediaPreviewCopy}>
                  <Text style={styles.mediaPreviewTitle}>
                    {label} captured — side not yet validated
                  </Text>
                  <Text style={styles.mediaPreviewText} numberOfLines={1}>
                    {media.name}
                  </Text>
                </View>
                <TouchableOpacity style={styles.iconButton} onPress={remove}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ) : cameraOpen && cameraSide === side ? (
            <View style={styles.mediaPreviewCard}>
              <View style={styles.idLivePreview}>
                {React.createElement("video" as any, {
                  ref: idVideoRef,
                  autoPlay: true,
                  muted: true,
                  playsInline: true,
                  style: { width: "100%", height: "100%", objectFit: "contain", background: "#111827" },
                })}
                {React.createElement("canvas" as any, {
                  ref: idCanvasRef,
                  style: { display: "none" },
                })}
              </View>
              <Text style={styles.uploadText}>
                Hold {side === "front" ? "the portrait/front side" : "the reverse/back side"} of the ID flat and steady. Keep all four edges visible. Auto-capture alone cannot confirm the correct side.
              </Text>
              <Text style={styles.uploadText}>{autoHint} {autoProgress > 0 ? `(${autoProgress}%)` : ""}</Text>
              {cameraError ? <Text style={styles.idCameraError}>{cameraError}</Text> : null}
              <View style={styles.idCameraActions}>
                <TouchableOpacity
                  style={[styles.nextButton, !cameraReady && styles.disabledButton]}
                  onPress={onCapture}
                  disabled={!cameraReady}
                >
                  <Ionicons name="camera" size={19} color="#FFFFFF" />
                  <Text style={styles.nextButtonText}>Capture manually: {label}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryWideButton} onPress={onCancel}>
                  <Text style={styles.secondaryWideButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadZone}
              onPress={open}
              disabled={cameraOpen}
            >
              <View style={styles.uploadIcon}>
                <Ionicons name="camera-outline" size={29} color={COLORS.blue} />
              </View>
              <Text style={styles.uploadTitle}>Open Camera — {label}</Text>
              <Text style={styles.uploadText}>
                The camera may capture the wrong side. Review the preview, then tap Check ID: the AI will screen the ID type and front/back layout before you enter the face scan. This is not proof of authenticity.
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: documentConsent }}
        style={styles.consentRow}
        onPress={() => onDocumentConsentChange(!documentConsent)}
      >
        <View style={[styles.checkbox, documentConsent && styles.checkboxActive]}>
          {documentConsent ? <Ionicons name="checkmark" color="#FFFFFF" size={15} /> : null}
        </View>
        <Text style={styles.consentText}>
          I agree to securely submit my ID front/back images for a preliminary OCR
          scan before the selfie. No selfie is uploaded at this stage.
          The check does not confirm government issuance.
        </Text>
      </TouchableOpacity>
      {documentPrecheckMessage ? (
        <View style={styles.truthNote} accessibilityRole="alert">
          <Ionicons
            name={documentPrecheckOutcome === "pass" ? "checkmark-circle-outline" : "information-circle-outline"}
            size={18}
            color={documentPrecheckOutcome === "pass" ? COLORS.tealDark : COLORS.danger}
          />
          <Text style={styles.truthText}>{documentPrecheckMessage}</Text>
        </View>
      ) : null}
      <View style={styles.stepFooter}>
        <TouchableOpacity
          style={[
            styles.nextButton,
            (!idDocument || (idType !== "passport" && !idBackDocument) || documentChecking) && styles.disabledButton,
          ]}
          disabled={!idDocument || (idType !== "passport" && !idBackDocument) || documentChecking}
          onPress={onNext}
        >
          <Text style={styles.nextButtonText}>
            {documentChecking ? "Checking government ID..." : "Check ID, then Face Scan"}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AiVerificationStep({
  submitting,
  idLabel,
}: {
  submitting: boolean;
  idLabel: string;
}) {
  return (
    <View style={[styles.stepCard, styles.aiCard]}>
      <View style={styles.stepHeader}>
        <View style={styles.stepHeaderNumber}>
          <Text style={styles.stepHeaderNumberText}>
            3
          </Text>
        </View>
        <View style={styles.stepHeaderCopy}>
          <Text style={styles.stepTitle}>
            AI Verification
          </Text>
          <Text style={styles.stepSubtitle}>
            VolunServe is comparing the face from your
            {` ${idLabel}`} with the captured face scan.
          </Text>
        </View>
      </View>

      <View style={styles.aiCenter}>
        <View style={styles.aiScanIcon}>
          {submitting ? (
            <ActivityIndicator
              size="large"
              color={COLORS.blue}
            />
          ) : (
            <Ionicons
              name="scan-outline"
              size={38}
              color={COLORS.blue}
            />
          )}
        </View>

        <Text style={styles.aiTitle}>
          Comparing faces...
        </Text>
        <Text style={styles.aiText}>
          Checking image quality, detecting facial landmarks,
          and calculating the private 1-to-1 match score.
        </Text>

        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>

        <Text style={styles.aiFootnote}>
          This may take a few seconds.
        </Text>
      </View>
    </View>
  );
}

function StatusScreen({
  icon,
  title,
  message,
  background,
  color,
  badge,
  documentScreening,
  idPreviewUri,
  idPreviewLabel,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryAction,
  loading = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  message: string;
  background: string;
  color: string;
  badge: string;
  documentScreening?: DocumentScreening;
  idPreviewUri?: string | null;
  idPreviewLabel?: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  loading?: boolean;
}) {
  return (
    <ScrollView style={styles.statusScreen} contentContainerStyle={styles.statusScreenContent} showsVerticalScrollIndicator={false}>
      <View
        style={[
          styles.statusCard,
          { borderColor: background },
        ]}
      >
        <View
          style={[
            styles.statusIcon,
            { backgroundColor: background },
          ]}
        >
          <Ionicons
            name={icon}
            size={42}
            color={color}
          />
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: background },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color },
            ]}
          >
            {badge}
          </Text>
        </View>

        <Text style={styles.statusTitle}>
          {title}
        </Text>
        <Text style={styles.statusMessage}>
          {message}
        </Text>

                <DocumentScreeningSummary screening={documentScreening} />

        {idPreviewUri ? (
          <View style={styles.submittedIdCard}>
            <View style={styles.submittedIdTitleRow}>
              <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.tealDark} />
              <Text style={styles.submittedIdTitle}>Your scanned Government ID</Text>
            </View>
            <Image
              source={{ uri: idPreviewUri }}
              style={styles.submittedIdImage}
              resizeMode="contain"
              accessibilityLabel="Private preview of the government ID you just scanned"
            />
            <Text style={styles.submittedIdLabel}>{idPreviewLabel || "Government ID"}</Text>
            <Text style={styles.submittedIdPrivacy}>
              Private preview from this scan only. It disappears after reloading or leaving this page;
              the ID image is not retained in your account or shown to Admin reviewers.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={primaryAction}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {primaryLabel}
            </Text>
          )}
        </TouchableOpacity>

        {secondaryLabel && secondaryAction ? (
          <TouchableOpacity
            style={styles.statusSecondaryButton}
            onPress={secondaryAction}
          >
            <Text style={styles.statusSecondaryButtonText}>
              {secondaryLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  page: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 70,
  },
  centered: {
    flex: 1,
    minHeight: 520,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: COLORS.bg,
  },
  centeredText: {
    marginTop: 10,
    maxWidth: 480,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  securePill: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: COLORS.tealSoft,
  },
  securePillText: {
    color: COLORS.tealDark,
    fontSize: 10.5,
    fontWeight: "900",
  },
  heading: {
    marginBottom: 18,
  },
  eyebrow: {
    color: COLORS.tealDark,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    lineHeight: designUi.type.page.lineHeight,
    marginTop: 5,
    color: COLORS.navy,
    fontSize: designUi.type.page.fontSize,
    fontWeight: designUi.type.page.fontWeight,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontWeight: designUi.type.body.fontWeight,
    marginTop: 6,
    maxWidth: 760,
    color: COLORS.muted,
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight,
  },
  progressCard: {
    width: "100%",
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressItem: {
    alignItems: "center",
    minWidth: 100,
  },
  progressCircle: {
    width: 33,
    height: 33,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  progressCircleActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  progressNumber: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "900",
  },
  progressNumberActive: {
    color: "#FFFFFF",
  },
  progressLabel: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  progressLabelActive: {
    color: COLORS.blue,
  },
  progressLine: {
    flex: 1,
    height: 2,
    maxWidth: 150,
    marginHorizontal: 8,
    marginBottom: 22,
    backgroundColor: "#E2E8F0",
  },
  progressLineActive: {
    backgroundColor: COLORS.blue,
  },
  stepCard: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 2,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 20,
  },
  stepHeaderNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.blue,
  },
  stepHeaderNumberText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  stepHeaderCopy: {
    flex: 1,
  },
  stepTitle: {
    lineHeight: designUi.type.section.lineHeight,
    color: COLORS.navy,
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight,
  },
  stepSubtitle: {
    fontWeight: designUi.type.body.fontWeight,
    marginTop: 4,
    color: COLORS.muted,
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight,
  },
  fieldLabel: {
    lineHeight: designUi.type.label.lineHeight,
    marginTop: 2,
    marginBottom: 8,
    color: "#334155",
    fontSize: designUi.type.label.fontSize,
    fontWeight: designUi.type.label.fontWeight,
  },
  idTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 19,
  },
  idTypeButton: {
    flex: 1,
    minWidth: 210,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
  },
  idTypeButtonActive: {
    borderColor: "#93C5FD",
    backgroundColor: COLORS.blueSoft,
  },
  idTypeCopy: {
    flex: 1,
  },
  idTypeLabel: {
    color: "#334155",
    fontSize: 11.5,
    fontWeight: "900",
  },
  idTypeLabelActive: {
    color: "#1D4ED8",
  },
  idTypeHelper: {
    marginTop: 2,
    color: "#94A3B8",
    fontSize: 9.5,
  },
  uploadZone: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
  },
  uploadIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DBEAFE",
  },
  uploadTitle: {
    marginTop: 12,
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: "900",
  },
  uploadText: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 10.5,
    textAlign: "center",
  },
  mediaPreviewCard: {
    overflow: "hidden",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#FFFFFF",
  },
  idPreview: {
    width: "100%",
    height: 240,
    backgroundColor: "#E2E8F0",
  },
  mediaPreviewInfo: {
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mediaSuccessIcon: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
  },
  mediaPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  mediaPreviewTitle: {
    color: COLORS.text,
    fontSize: 11.5,
    fontWeight: "900",
  },
  mediaPreviewText: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 9.5,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  stepFooter: {
    marginTop: 17,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  nextButton: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: COLORS.blue,
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  scanGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  cameraCard: {
    flex: 1.45,
    minWidth: 330,
    height: 430,
    overflow: "hidden",
    position: "relative",
    borderRadius: 16,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  cameraPreview: {
    width: "100%",
    height: "100%",
  },
  submissionErrorCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: COLORS.dangerBg,
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
  },
  submissionErrorContent: { flex: 1 },
  submissionErrorTitle: { fontSize: 14, fontWeight: "800", color: COLORS.danger },
  submissionErrorText: { fontSize: 12.5, lineHeight: 19, marginTop: 5, color: "#7F1D1D" },
  submissionErrorHint: { fontSize: 11.5, lineHeight: 17, marginTop: 6, color: "#991B1B" },
  idLivePreview: { width: "100%", height: 290, backgroundColor: "#111827", borderRadius: 12, overflow: "hidden" },
  idCameraError: { marginTop: 8, color: "#B91C1C", fontSize: 12 },
  idCameraActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  faceOval: {
    width: 235,
    height: 310,
    borderRadius: 118,
    borderWidth: 3,
    backgroundColor: "transparent",
  },
  scanStatusPill: {
    position: "absolute",
    bottom: 46,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  scanStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  scanStatusText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  holdProgressTrack: {
    position: "absolute",
    bottom: 23,
    width: "58%",
    height: 7,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  holdProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#34D399",
  },
  cameraStartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#F8FAFC",
  },
  cameraStartTitle: {
    marginTop: 12,
    color: COLORS.navy,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  cameraStartText: {
    marginTop: 6,
    maxWidth: 390,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: "center",
  },
  cameraStartButton: {
    minHeight: 43,
    marginTop: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: COLORS.blue,
  },
  cameraStartButtonText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  requirementsCard: {
    flex: 0.9,
    minWidth: 250,
    minHeight: 330,
    padding: 17,
    borderRadius: 15,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  requirementsTitle: {
    lineHeight: designUi.type.section.lineHeight,
    marginBottom: 10,
    color: COLORS.navy,
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight,
  },
  requirementRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  requirementCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
  },
  requirementCheckOff: {
    backgroundColor: "#E2E8F0",
  },
  requirementText: {
    flex: 1,
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "700",
  },
  requirementTextPassed: {
    color: "#166534",
  },
  guidanceCard: {
    marginTop: 10,
    padding: 11,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  guidanceTitle: {
    fontSize: 11,
    fontWeight: "900",
  },
  guidanceText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },
  truthNote: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  truthText: {
    flex: 1,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },
  captureActions: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  secondaryWideButton: {
    minHeight: 47,
    flex: 1,
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
  },
  secondaryWideButtonText: {
    color: COLORS.blue,
    fontSize: 11.5,
    fontWeight: "900",
  },
  uploadSelfieButton: {
    minHeight: 47,
    flex: 1,
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  uploadSelfieButtonText: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "900",
  },
  consentRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxActive: {
    borderColor: COLORS.teal,
    backgroundColor: COLORS.teal,
  },
  consentText: {
    flex: 1,
    color: "#334155",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  verifyButton: {
    minHeight: 50,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: COLORS.teal,
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
  aiCard: {
    minHeight: 430,
  },
  aiCenter: {
    flex: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  aiScanIcon: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.blueSoft,
    borderWidth: 5,
    borderColor: "#DBEAFE",
  },
  aiTitle: {
    marginTop: 17,
    color: COLORS.navy,
    fontSize: 17,
    fontWeight: "900",
  },
  aiText: {
    marginTop: 6,
    maxWidth: 520,
    color: "#64748B",
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: "center",
  },
  progressTrack: {
    width: "70%",
    maxWidth: 430,
    height: 7,
    marginTop: 20,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
  },
  progressFill: {
    width: "58%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.blue,
  },
  aiFootnote: {
    marginTop: 8,
    color: "#94A3B8",
    fontSize: 10,
  },
  privacyNote: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
  },
  privacyNoteText: {
    flex: 1,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
  },
  statusScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  statusScreenContent: {
    flexGrow: 1,
    minHeight: 590,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    paddingVertical: 32,
  },
  submittedIdCard: {
    width: "100%",
    maxWidth: 500,
    marginTop: 16,
    marginBottom: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  submittedIdTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  submittedIdTitle: {
    color: COLORS.navy,
    fontWeight: "800",
    fontSize: 13,
  },
  submittedIdImage: {
    width: "100%",
    height: 170,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  submittedIdLabel: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  submittedIdPrivacy: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.muted,
  },
  statusCard: {
    width: "100%",
    maxWidth: 620,
    alignItems: "center",
    padding: 32,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 3,
  },
  statusIcon: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    minHeight: 29,
    marginTop: 14,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: "900",
  },
  statusTitle: {
    lineHeight: designUi.type.section.lineHeight,
    marginTop: 14,
    color: COLORS.navy,
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight,
    textAlign: "center",
  },
  statusMessage: {
    marginTop: 8,
    maxWidth: 500,
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: "center",
  },
  primaryButton: {
    minWidth: 210,
    minHeight: 47,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: COLORS.teal,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  statusSecondaryButton: {
    minWidth: 210,
    minHeight: 43,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
  },
  statusSecondaryButtonText: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "900",
  },
});
