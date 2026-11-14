import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import {
  buildPublicEmergencyAdvisory,
  safePublicAdvisoryBarangay,
} from "./emergencyPublicAdvisory";

type PublicationResult = "published" | "already_published" | "not_eligible";

/**
 * Called only AFTER Admin successfully validates a private emergency report.
 * A confirmed public-impact checkbox + confirmed incident barangay are required.
 *
 * Fail separately from case validation: a notice delivery failure must NEVER
 * prevent an emergency report from becoming validated or being offered to
 * qualified Volunteers.
 *
 * Transactional private-case publication pointer prevents duplicate public
 * announcements even when two Admin browser sessions attempt this concurrently.
 * The public announcement has no case ID, resident identity, photo or GPS.
 */
export async function publishVerifiedCommunityAdvisory(args: {
  caseId: string;
  adminUid: string;
  confirmedIncidentBarangay: string;
}): Promise<PublicationResult> {
  const barangay = safePublicAdvisoryBarangay(args.confirmedIncidentBarangay);
  if (!args.caseId || !args.adminUid || !barangay) {
    throw new Error("A validated case and confirmed SJDM incident barangay are required.");
  }

  const privateCaseRef = doc(db, "disasterCases", args.caseId);
  const noticeRef = doc(collection(db, "announcements"));

  return runTransaction(db, async transaction => {
    const caseSnapshot = await transaction.get(privateCaseRef);
    if (!caseSnapshot.exists()) throw new Error("The emergency report no longer exists.");

    const current = caseSnapshot.data();

    if (typeof current.publicAdvisoryId === "string" && current.publicAdvisoryId) {
      return "already_published";
    }

    // Only an Admin-validated active HIGH/CRITICAL community-impact case can
    // create a generic public warning. A person's private medical emergency
    // must not be automatically broadcast merely for being critical.
    if (!["high", "critical"].includes(String(current.severity || ""))) {
      return "not_eligible";
    }

    const draft = buildPublicEmergencyAdvisory(current, barangay);
    if (!draft) return "not_eligible";

    transaction.set(noticeRef, {
      title: draft.title,
      message: draft.message,
      audience: "all",
      priority: "urgent",
      publishAt: serverTimestamp(),
      linkUrl: "",
      imageUrl: "",
      createdBy: args.adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // This linkage is PRIVATE. No case reference is placed in announcement data.
    transaction.update(privateCaseRef, {
      publicAdvisoryId: noticeRef.id,
      publicAdvisoryBarangay: barangay,
      publicAdvisoryPublishedAt: serverTimestamp(),
    });

    return "published";
  });
}
