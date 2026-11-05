// Private, idempotent inbox delivery for new published community announcements.
// No client can choose recipients: recipient UIDs are obtained from Firestore.
const {getFirestore, FieldValue, FieldPath} = require("firebase-admin/firestore");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

const {eligibleRecipient} = require("./announcementAudience");

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
      let delivered = 0;
      let eligibleRecipients = 0;
      let lastUser = null;

      // Paginate user profiles so mixed-case barangay labels still receive
      // the same notices shown by the Resident web announcement feed.
      // Never accept a recipient UID supplied by the publishing client.
      while (true) {
        let userPageQuery = database.collection("users")
            .orderBy(FieldPath.documentId()).limit(200);
        if (lastUser) userPageQuery = userPageQuery.startAfter(lastUser);
        const page = await userPageQuery.get();
        if (page.empty) break;
        lastUser = page.docs[page.docs.length - 1];

        const recipients = page.docs.filter((userDoc) =>
          eligibleRecipient(userDoc.data(), audience));
        eligibleRecipients += recipients.length;

        if (recipients.length) {
          const references = recipients.map((userDoc) =>
            database.collection("notifications")
                .doc(`announcement_${event.params.announcementId}_` +
                  userDoc.id));
          const existing = await database.getAll(...references);
          const batch = database.batch();
          let pending = 0;
          existing.forEach((notificationSnapshot, index) => {
            if (notificationSnapshot.exists) return;
            batch.create(references[index], {
              userId: recipients[index].id,
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
        if (page.size < 200) break;
      }

      logger.info("Announcement inbox delivery complete", {
        announcementId: event.params.announcementId,
        eligibleRecipients,
        newlyDelivered: delivered,
      });
    },
);
