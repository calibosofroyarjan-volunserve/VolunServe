import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { safePublicAdvisoryBarangay } from "./emergencyPublicAdvisory";

type PublicModule = "event" | "donation";
type Result = "published" | "already_published" | "not_eligible";

/**
 * Post a single generic, privacy-safe announcement AFTER an Admin has
 * successfully published a Community Event or verified Donation Campaign.
 *
 * - Exact source ID is only used privately to look up the published document.
 * - No reporter/beneficiary/donor information, photos, amounts, contact
 *   details, coordinates, precise venues, or payment references in the feed.
 * - A deterministic announcement ID + transaction prevents double posts.
 * - No source document, payment, attendance or certificate is modified.
 * - Failure is handled by the caller, NEVER mistaken for publication success.
 */
export async function publishModuleAnnouncement(args: {
  kind: PublicModule;
  sourceId: string;
  adminUid: string;
}): Promise<Result> {
  const { kind, sourceId, adminUid } = args;
  if (!["event", "donation"].includes(kind) ||
      !/^[a-zA-Z0-9_-]{6,128}$/.test(sourceId) ||
      !adminUid.trim()) {
    throw new Error("Invalid published source or Admin session.");
  }

  const sourceRef = doc(db,
    kind === "event" ? "communityEvents" : "donationCampaigns",
    sourceId,
  );
  // Never create duplicate posts when a request is retried.
  const announcementRef = doc(db, "announcements",
    (kind === "event" ? "community_event_" : "donation_campaign_") + sourceId);

  return runTransaction(db, async tx => {
    // All transaction reads happen before any writes.
    const sourceSnapshot = await tx.get(sourceRef);
    const announcementSnapshot = await tx.get(announcementRef);

    if (announcementSnapshot.exists()) return "already_published";
    if (!sourceSnapshot.exists()) return "not_eligible";

    const data = sourceSnapshot.data();
    let title = "";
    let message = "";

    if (kind === "event") {
      if (data.publicationStatus !== "published" ||
          data.status !== "upcoming") return "not_eligible";

      const barangay = safePublicAdvisoryBarangay(data.barangay);
      title = "New Community Event Published";
      message = barangay
        ? `An Admin-approved Community Event is now published for Barangay ${barangay}, San Jose del Monte. View the Community Events page for the verified schedule, participation requirements, and volunteer opportunities.`
        : "An Admin-approved Community Event is now published in San Jose del Monte. View the Community Events page for the verified schedule, participation requirements, and volunteer opportunities.";
    } else {
      if (data.status !== "published" ||
          !(Number(data.monetaryGoal) > 0) ||
          !["community_needs_help", "disaster_affected"].includes(
            String(data.campaignGroup || ""))) return "not_eligible";

      title = "Verified Donation Campaign Published";
      message = "An Admin-approved donation campaign is now available in VolunServe. Visit the Donations page to review its public purpose, verified funding goal, and official contribution instructions. Private beneficiary and donor records are not included in this notice.";
    }

    tx.set(announcementRef, {
      title,
      message,
      linkUrl: "",
      imageUrl: "",
      audience: "all",
      priority: "normal",
      publishAt: serverTimestamp(),
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return "published";
  });
}
