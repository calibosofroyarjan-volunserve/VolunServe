import * as ImagePicker from "expo-image-picker";
import { getIdToken, type User } from "firebase/auth";
import { auth } from "./firebase";

/**
 * Cloudinary LGU documents are delivered ONLY through token-verified Render
 * endpoints. Never use public Cloudinary URLs, unsigned presets or Firebase
 * Storage (which requires Blaze in this project).
 */
export type LguProofKind = "staff-id" | "appointment-letter";
export type LguProofImage = {
  uri: string;
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};
const LIMIT = 3 * 1024 * 1024;
const permitted = new Set(["image/jpeg", "image/png", "image/webp"]);
const API = "https://volunserve.onrender.com";

async function backendJson(response: Response) {
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(String(body?.message || "Secure LGU credential service is not ready."));
  }
  return body;
}

export async function pickLguProofImage(): Promise<LguProofImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"], allowsEditing: false, base64: true, quality: 0.78,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  const ext = a.fileName?.toLowerCase().split(".").pop();
  const mime = a.mimeType?.toLowerCase() ||
    (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  if (!permitted.has(mime)) throw Error("Choose a JPG, PNG, or WEBP image.");
  if (!a.base64) throw Error("Could not read the photo. Choose it again.");
  const bytes = Math.floor(a.base64.length * 3 / 4);
  if (bytes > LIMIT || (a.fileSize ?? bytes) > LIMIT) {
    throw Error("Each image must be under 3 MB.");
  }
  return { uri: a.uri, base64: a.base64, mimeType: mime as LguProofImage["mimeType"] };
}

async function sendWithUser(user: User, path: string, options: RequestInit) {
  const token = await getIdToken(user, true);
  const response = await fetch(API + path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + token },
  });
  return backendJson(response);
}

export async function createPendingLguApplication(user: User, details: {
  fullName: string;
  lguOffice: string;
  lguPosition: string;
  appointmentReference: string;
  barangay: string;
}) {
  return sendWithUser(user, "/api/lgu-staff/application", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
}

export async function uploadLguProof(
  applicant: User, uid: string, kind: LguProofKind, image: LguProofImage,
) {
  if (applicant.uid !== uid) throw Error("LGU applicant identity mismatch.");
  if (!permitted.has(image.mimeType)) throw Error("Unsupported image type.");
  // Only the authenticated applicant uploads the bytes. No unsigned upload
  // preset, Cloudinary secret, or public image URL ever reaches the browser.
  const binary = atob(image.base64);
  if (binary.length > LIMIT) throw Error("Each image must be under 3 MB.");
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: image.mimeType });
  return sendWithUser(applicant, "/api/lgu-staff/credentials/" + encodeURIComponent(kind), {
    method: "POST", headers: { "Content-Type": image.mimeType }, body: blob,
  });
}

export async function loadLguProofForSuperAdmin(uid: string, kind: LguProofKind): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) throw Error("Invalid LGU applicant reference.");
  const user = auth.currentUser;
  if (!user) throw Error("Super Admin session expired. Sign in again.");
  const token = await getIdToken(user, true);
  const response = await fetch(API + "/api/superadmin/lgu-credentials/" +
    encodeURIComponent(uid) + "/" + kind + "/access", {
    method: "GET", headers: { Authorization: "Bearer " + token, "Cache-Control": "no-cache" },
  });
  if (response.status === 404) return null;
  const result = await backendJson(response);
  if (!result.url || !String(result.url).startsWith("https://")) {
    throw Error("The private credential link could not be retrieved.");
  }
  // The link expires after 5 minutes and should remain only in React UI state.
  return String(result.url);
}

export async function reviewPendingLguApplication(user: User, uid: string,
  action: "approve" | "reject", details: Record<string, unknown>,
) {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) throw Error("Invalid applicant UID.");
  return sendWithUser(user, "/api/superadmin/lgu-applications/" +
    encodeURIComponent(uid) + "/" + action, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
}
