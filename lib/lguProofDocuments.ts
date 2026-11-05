import type { FirebaseStorage } from "firebase/storage";
import { getBlob, getMetadata, ref, uploadBytes } from "firebase/storage";

export type LguProofKind = "employee-id" | "supporting-document";
export const LGU_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const LGU_PROOF_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
const proofKey: Record<LguProofKind, string> = {
  "employee-id": "employee-id",
  "supporting-document": "supporting-document",
};
export const lguProofPath = (uid: string, kind: LguProofKind) => {
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(uid)) throw new Error("Invalid credential owner.");
  return `lguApplicantProofs/${uid}/${proofKey[kind]}`;
};

/** File extension and browser-supplied MIME are not security controls. Check magic bytes too. */
export async function validateLguProofFile(file: File): Promise<"image/jpeg" | "image/png" | "application/pdf"> {
  if (!file || file.size <= 0 || file.size > LGU_PROOF_MAX_BYTES) {
    throw new Error("Each LGU proof must be 5 MB or smaller.");
  }
  const first = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = first[0] === 0xff && first[1] === 0xd8 && first[2] === 0xff;
  const png = [137,80,78,71,13,10,26,10].every((value,index)=>first[index]===value);
  const pdf = [37,80,68,70,45].every((value,index)=>first[index]===value);
  const detected = jpeg ? "image/jpeg" : png ? "image/png" : pdf ? "application/pdf" : null;
  if (!detected || (file.type && file.type !== detected)) {
    throw new Error("Upload only a valid JPG, PNG or PDF document.");
  }
  return detected;
}

/** Fixed private paths; no public download token and no user-controlled filename in Storage paths. */
export async function uploadLguProofFiles(storage: FirebaseStorage, uid: string, employeeId: File, supporting: File) {
  const [idType, supportingType] = await Promise.all([
    validateLguProofFile(employeeId),
    validateLguProofFile(supporting),
  ]);
  await uploadBytes(ref(storage,lguProofPath(uid,"employee-id")),employeeId,{contentType:idType});
  await uploadBytes(ref(storage,lguProofPath(uid,"supporting-document")),supporting,{contentType:supportingType});
}

/** Metadata is available to the applicant and independently authorized Super Admin only. */
export async function getLguProofState(storage: FirebaseStorage, uid: string): Promise<{employeeId:boolean;supporting:boolean}> {
  const exists = async(kind:LguProofKind) => {
    try { await getMetadata(ref(storage,lguProofPath(uid,kind)));return true; }
    catch (e:any) {
      if (e?.code === "storage/object-not-found") return false;
      throw e;
    }
  };
  const [employeeId,supporting] = await Promise.all([exists("employee-id"),exists("supporting-document")]);
  return {employeeId,supporting};
}

/**
 * Authenticated browser download: DO NOT call getDownloadURL for sensitive IDs.
 * This requires allowed Storage read rules and configured bucket CORS.
 */
export async function showLguProofFile(storage: FirebaseStorage,uid:string,kind:LguProofKind){
  if (typeof window === "undefined") throw new Error("Open LGU credentials on the secure web dashboard.");
  const popup = window.open("about:blank","_blank");
  if (!popup) throw new Error("Allow popups to view this authorized document.");
  try {
    const blob = await getBlob(ref(storage,lguProofPath(uid,kind)));
    const url=URL.createObjectURL(blob);
    popup.location.href=url;
    window.setTimeout(()=>URL.revokeObjectURL(url),120000);
  } catch(e) { popup.close();throw e; }
}
