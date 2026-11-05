import * as ImagePicker from "expo-image-picker";
import { getBytes, getMetadata, ref, uploadString, type FirebaseStorage } from "firebase/storage";
import { storage as reviewerStorage } from "./firebase";

export type LguProofKind = "staff-id" | "appointment-letter";
export type LguProofImage = { uri: string; base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };
const LIMIT = 3 * 1024 * 1024;
const permitted = new Set(["image/jpeg", "image/png", "image/webp"]);
export const lguProofPath = (uid: string, kind: LguProofKind) => {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) throw Error("Invalid applicant UID");
  return "lguStaffProof/" + uid + "/" + kind;
};

export async function pickLguProofImage(): Promise<LguProofImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"], allowsEditing: false, base64: true, quality: 0.78,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  const ext = a.fileName?.toLowerCase().split(".").pop();
  const mime = a.mimeType?.toLowerCase() || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  if (!permitted.has(mime)) throw Error("Choose a JPG, PNG, or WEBP image.");
  if (!a.base64) throw Error("Could not read the photo. Choose it again.");
  const bytes = Math.floor(a.base64.length * 3 / 4);
  if (bytes > LIMIT || (a.fileSize ?? bytes) > LIMIT) throw Error("Each image must be under 3 MB.");
  return { uri: a.uri, base64: a.base64, mimeType: mime as LguProofImage["mimeType"] };
}

export async function uploadLguProof(
  applicantStorage: FirebaseStorage, uid: string, kind: LguProofKind, image: LguProofImage,
) {
  await uploadString(ref(applicantStorage, lguProofPath(uid, kind)), image.base64, "base64", {
    contentType: image.mimeType, cacheControl: "private, no-store, max-age=0",
  });
}

export async function loadLguProofForSuperAdmin(uid: string, kind: LguProofKind): Promise<string | null> {
  const r = ref(reviewerStorage, lguProofPath(uid, kind));
  try {
    const metadata = await getMetadata(r);
    const mime = metadata.contentType?.toLowerCase() || "";
    if (!permitted.has(mime)) throw Error("Unsupported credential image");
    const data = new Uint8Array(await getBytes(r, LIMIT));
    let binary = "";
    for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.slice(i, i + 8192));
    return "data:" + mime + ";base64," + btoa(binary);
  } catch (error) {
    if ((error as { code?: string }).code === "storage/object-not-found") return null;
    throw error;
  }
}
