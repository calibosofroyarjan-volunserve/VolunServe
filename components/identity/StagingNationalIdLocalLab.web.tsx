import React, { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

/**
 * STAGING WEB ONLY.
 * The only image destination is a Python OCR companion bound to 127.0.0.1.
 * No API, Firestore, Firebase Storage, MediaPipe or production calls occur
 * in this component. The companion NEVER changes a Resident account.
 */
type LocalOutcome = {
  status: "national_id_format_candidate" | "unsupported_other_card" | "needs_review";
  reason: string;
  front: string;
  back: string;
  identityVerified: false;
  authenticityVerified: false;
  manualReviewRequired: true;
};

const LOOPBACK_ENDPOINT = "http://127.0.0.1:8765/check";
const LIMIT = 10 * 1024 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const knownStatuses = new Set([
  "national_id_format_candidate", "unsupported_other_card", "needs_review",
]);
const STATUS_TEXT: Record<LocalOutcome["status"], string> = {
  national_id_format_candidate: "National ID format detected on BOTH sides (unverified)",
  unsupported_other_card: "Unsupported: only a Philippine National ID is accepted",
  needs_review: "Not accepted: needs a clearer scan or human review",
};

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected photo could not be read."));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string" || !value.startsWith("data:") || !value.includes(",")) {
        reject(new Error("Invalid photo encoding."));
      } else {
        resolve(value.slice(value.indexOf(",") + 1));
      }
    };
    reader.readAsDataURL(file);
  });
}

const ui = {
  panel: { backgroundColor: "#F8FAFC", borderColor: "#CBD5E1", borderWidth: 1,
    borderRadius: 12, padding: 17, gap: 12, marginBottom: 16 } as const,
  headline: { fontSize: 17, fontWeight: "800", color: "#123358" } as const,
  small: { fontSize: 12, color: "#475569", lineHeight: 19 } as const,
  label: { fontSize: 13, color: "#1E293B", fontWeight: "700" } as const,
  action: { backgroundColor: "#12466B", paddingHorizontal: 16,
    paddingVertical: 13, borderRadius: 9, alignItems: "center" } as const,
  actionText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 } as const,
};

export default function StagingNationalIdLocalLab() {
  const router = useRouter();
  const mounted = useRef(true);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<LocalOutcome["status"] | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fileInput = (side: "front" | "back") =>
    React.createElement("input", {
      "aria-label": side === "front" ? "Choose National ID front photo" : "Choose National ID back photo",
      type: "file",
      accept: "image/jpeg,image/png,image/webp",
      disabled: working,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.files?.[0] || null;
        if (side === "front") setFront(value);
        else setBack(value);
        setStatus(null);
        setMessage("");
      },
      style: { width: "100%", color: "#334155", fontSize: 13 },
    });

  const runLocalCheck = async () => {
    if (working || !front || !back || !consent) return;
    setStatus(null);
    setMessage("");
    if (!allowed.has(front.type) || !allowed.has(back.type) ||
        front.size < 1 || back.size < 1 ||
        front.size > LIMIT || back.size > LIMIT) {
      setMessage("Choose two different JPG, PNG, or WebP photos under 10 MB each.");
      return;
    }
    setWorking(true);
    try {
      const encodedFront = await readBase64(front);
      const encodedBack = await readBase64(back);
      if (encodedFront === encodedBack) {
        throw new Error("Front and back cannot be the same photo.");
      }
      const response = await fetch(LOOPBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: encodedFront, back: encodedBack }),
        cache: "no-store",
      });
      const value: unknown = await response.json();
      if (!response.ok || !value || typeof value !== "object") {
        throw new Error("Local OCR was unavailable. Check the companion terminal.");
      }
      const data = value as Record<string, unknown>;
      if (!knownStatuses.has(String(data.status)) ||
          data.identityVerified !== false ||
          data.authenticityVerified !== false ||
          data.manualReviewRequired !== true) {
        throw new Error("Local OCR returned an invalid result. No ID was accepted.");
      }
      if (mounted.current) {
        setStatus(data.status as LocalOutcome["status"]);
        setMessage("OCR assessment only. Government issuance and Resident identity remain unverified.");
      }
    } catch (error: any) {
      if (mounted.current) {
        setStatus(null);
        setMessage(
          error instanceof TypeError
            ? "Local OCR companion not connected. Run Start-VolunServe-Staging-OCR-Companion.cmd on this PC. No document was accepted."
            : (error?.message || "Local OCR unavailable. No document was accepted."),
        );
      }
    } finally {
      if (mounted.current) setWorking(false);
    }
  };

  return (
    <View style={ui.panel} accessibilityLabel="Staging National ID front and back local OCR">
      <Text style={ui.headline}>National ID FRONT + BACK — Local OCR Preview</Text>
      <Text style={ui.small}>
        STAGING / RESEARCH ONLY. Select two photos from this computer. They are sent only
        to the Python companion running on 127.0.0.1 on the same PC, not to
        VolunServe cloud servers. No birthday, selfie, or face recognition is required.
      </Text>
      <Text style={ui.label}>National ID FRONT</Text>
      {fileInput("front")}
      <Text style={ui.label}>National ID BACK</Text>
      {fileInput("back")}
      <TouchableOpacity
        onPress={() => { setConsent(!consent); setStatus(null); setMessage(""); }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 18, color: "#12466B" }}>{consent ? "☑" : "☐"}</Text>
        <Text style={{ ...ui.small, flex: 1 }}>
          I own these photos or have permission for this private, local-only check.
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        disabled={working || !consent || !front || !back}
        style={{ ...ui.action, opacity: working || !consent || !front || !back ? 0.5 : 1 }}
        onPress={() => void runLocalCheck()}>
        <Text style={ui.actionText}>{working ? "Reading FRONT + BACK..." : "CHECK NATIONAL ID TYPE LOCALLY"}</Text>
      </TouchableOpacity>
      {status ? (
        <View style={{ backgroundColor: status === "national_id_format_candidate" ? "#ECFDF5" : "#FFF7ED",
          borderRadius: 8, padding: 12 }} accessibilityRole="alert">
          <Text style={{ color: "#1E293B", fontWeight: "800", fontSize: 13 }}>
            {STATUS_TEXT[status]}
          </Text>
          <Text style={ui.small}>No automatic account approval. Admin must independently inspect the original ID.</Text>
        </View>
      ) : null}
      {message ? <Text style={ui.small} accessibilityRole="alert">{message}</Text> : null}
      <TouchableOpacity
        onPress={() => router.push("/identity-manual-review" as any)}
        accessibilityRole="button"
        style={{ paddingVertical: 7 }}>
        <Text style={{ color: "#047857", fontWeight: "700", fontSize: 13 }}>
          Request In-Person LGU Admin Review (no image upload)
        </Text>
      </TouchableOpacity>
      <Text style={ui.small}>
        Requesting Admin review is a separate authorized action. The local OCR result is
        NOT submitted to Firebase or Admin, and it never grants Verified Resident status.
      </Text>
    </View>
  );
}
