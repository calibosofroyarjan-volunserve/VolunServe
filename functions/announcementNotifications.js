// Private, idempotent inbox delivery for new published community announcements.
// No client can choose recipients: recipient UIDs are obtained from Firestore.
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

function eligibleRecipient(profile) {
  const role = String(profile.role || "").toLowerCase();
  if (["admin", "superadmin", "lgu_personnel", "applicant"].includes(role)) {
    return false;
  }
  const approved = profile.status === "approved" ||
    (profile.status === undefined && role !== "applicant");
  return approved && (profile.residentAccess === true ||
    profile.volunteerAccess === true || role === "resident" ||
    role === "volunteer");
}

exports.notifyAnnouncementAudience = onDocumentCreated(
    {
      document: "announcements/{announcementId}",
      region: "us-central1",
      retry: true,
      timeoutSeconds: 300,
      maxInstances: 5,
    },
    async (event) => {
      const announcement = event.data?.data();
      if (!announcement) return;
      const audience = String(announcement.audience || "").trim();
      const title = String(announcement.title || "").trim();
      const message = String(announcement.message || "").trim();
      // Only immediate announcements are supported by the current Admin form.
      const publishAt = announcement.publishAt;
      if (!audience || !title || !message ||
          !publishAt || typeof publishAt.toMillis !== "function" ||
          publishAt.toMillis() > Date.now()) {
        return;
      }

      const database = getFirestore();
      // Barangay targeting is preserved: other barangays NEVER receive
      // private inbox records for local LGU announcements.
      const userQuery = audience.toLowerCase() === "all" ?
        database.collection("users") :
        database.collection("users").where("barangay", "==", audience);
      const userSnapshots = await userQuery.get();
      const recipients = userSnapshots.docs.filter((userDoc) =>
        eligibleRecipient(userDoc.data()));
      let delivered = 0;

      // Deterministic notification IDs, plus existence checks, make retries
      // safe: an already-read notification is never reset to unread.
      for (let i = 0; i < recipients.length; i += 200) {
        const batchRecipients = recipients.slice(i, i + 200);
        const references = batchRecipients.map((userDoc) =>
          database.collection("notifications")
              .doc(`announcement_${event.params.announcementId}_` +
                userDoc.id));
        const existing = await database.getAll(...references);
        const batch = database.batch();
        let pending = 0;
        existing.forEach((notificationSnapshot, index) => {
          if (notificationSnapshot.exists) return;
          batch.create(references[index], {
            userId: batchRecipients[index].id,
            audience: "resident",
            type: "community_announcement",
            announcementId: event.params.announcementId,
            title: title.slice(0, 160),
            message: message.slice(0, 500),
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
          pending++;
        });
        if (pending) {
          await batch.commit();
          delivered += pending;
        }
      }

      logger.info("Announcement inbox delivery complete", {
        announcementId: event.params.announcementId,
        eligibleRecipients: recipients.length,
        newlyDelivered: delivered,
      });
    },
);
