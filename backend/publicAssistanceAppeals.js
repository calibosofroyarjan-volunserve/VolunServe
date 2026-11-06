"use strict";

// Separate non-monetary, privacy-safe community appeals from financial campaigns.
// No PayMongo, donation receipt, or money-goal fields are written here.
function installPublicAssistanceAppeals({
  app, db, FieldValue, requireFirebaseUser, requireOperationalAdmin, cleanText, makeHttpError,
}) {
  const categoryLabels = Object.freeze({
    animal_pet_welfare: "Animal and Pet Welfare",
    homeless_basic_needs: "Basic Needs",
    elderly_assistance: "Elderly Support",
    disaster_recovery: "Disaster Recovery",
    medical_health: "Health Assistance",
    surgery_treatment: "Medical Assistance",
    cancer_serious_illness: "Serious Illness Support",
  });
  const errorResponse = (response, error, fallback) =>
    response.status(Number(error?.statusCode) || 500).json({
      ok: false,
      error: cleanText(error?.code || "assistance_appeal_error", 100),
      message: cleanText(error?.message || fallback, 500),
    });

  app.post(
    "/api/admin/assistance/requests/:requestId/public-appeal",
    requireFirebaseUser,
    requireOperationalAdmin,
    async (request, response) => {
      try {
        const id = cleanText(request.params?.requestId || "", 120);
        if (!/^[A-Za-z0-9_-]{10,120}$/.test(id)) {
          throw makeHttpError(400, "invalid_assistance_request_id", "Invalid Assistance Request.");
        }
        const action = cleanText(request.body?.action || "", 20).toLowerCase();
        if (!["publish", "close"].includes(action)) {
          throw makeHttpError(400, "invalid_appeal_action", "Select Publish or Close.");
        }
        const sourceRef = db.collection("assistanceRequests").doc(id);
        const reviewRef = db.collection("assistanceVerificationReviews").doc(id);
        const appealRef = db.collection("publicAssistanceAppeals").doc(id);
        const result = await db.runTransaction(async (transaction) => {
          const [sourceSnapshot, reviewSnapshot, appealSnapshot] = await Promise.all([
            transaction.get(sourceRef),
            transaction.get(reviewRef),
            transaction.get(appealRef),
          ]);
          if (!sourceSnapshot.exists || !reviewSnapshot.exists) {
            throw makeHttpError(404, "verified_request_missing", "The verified request could not be found.");
          }
          const source = sourceSnapshot.data() || {};
          const review = reviewSnapshot.data() || {};
          if (source.verificationStatus !== "verified" || review.finalDecision !== "verified") {
            throw makeHttpError(409, "verification_required", "The Admin must approve the request before publishing.");
          }
          const currentStatus = String(appealSnapshot.data()?.status || "").toLowerCase();
          if (action === "close") {
            if (currentStatus !== "published") {
              throw makeHttpError(409, "appeal_not_published", "No published Assistance Appeal exists.");
            }
            transaction.update(appealRef, {
              status: "closed",
              closedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(sourceRef, {
              publicAppealStatus: "closed",
              updatedAt: FieldValue.serverTimestamp(),
            });
            return { appealId: id, status: "closed" };
          }
          if (["assistance_provided", "closed", "rejected"].includes(String(source.status || "").toLowerCase())) {
            throw makeHttpError(409, "case_finished", "Only an open verified request can be published.");
          }
          if (cleanText(source.donationCampaignId || "", 160)) {
            throw makeHttpError(409, "monetary_campaign_already_linked", "An existing Donation Campaign is linked to this request.");
          }
          if (currentStatus === "published") {
            return { appealId: id, status: "published", alreadyPublished: true };
          }
          const label = categoryLabels[String(source.category || "").toLowerCase()] || "Community Assistance";
          const consentedPhoto = source.publicCampaignPhotoConsent === true &&
            /^https:\/\//i.test(String(source.publicCampaignPhotoUrl || ""))
            ? cleanText(source.publicCampaignPhotoUrl, 1000) : "";
          transaction.set(appealRef, {
            status: "published",
            sourceAssistanceRequestId: id,
            title: label + " Support",
            category: label,
            generalArea: "City of San Jose del Monte, Bulacan",
            description: "An LGU-verified community need is open for in-kind or partner assistance. Coordinate supplies or services with the authorized LGU. No monetary donations are collected through this appeal.",
            supportType: "in_kind_coordination",
            paymentEnabled: false,
            monetaryGoal: 0,
            publicPhotoUrl: consentedPhoto,
            publicOfficeName: cleanText(source.assignedLocationName || "", 160),
            publicOfficeAddress: cleanText(source.assignedLocationAddress || "", 300),
            publishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(sourceRef, {
            publicAppealStatus: "published",
            publicAppealPublishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { appealId: id, status: "published" };
        });
        return response.status(200).json({ ok: true, ...result });
      } catch (error) {
        console.error("Assistance appeal action failed:", error?.message);
        return errorResponse(response, error, "Unable to update this Assistance Appeal.");
      }
    },
  );

  // Intentionally public but strictly whitelisted: no Resident names, IDs, addresses, or private evidence.
  app.get("/api/public/assistance/appeals", async (_request, response) => {
    try {
      const snapshot = await db.collection("publicAssistanceAppeals")
        .where("status", "==", "published")
        .limit(50).get();
      const appeals = snapshot.docs.map((doc) => {
        const value = doc.data() || {};
        return {
          id: doc.id,
          title: cleanText(value.title || "Community Assistance", 160),
          category: cleanText(value.category || "Community Assistance", 100),
          description: cleanText(value.description || "", 600),
          generalArea: "City of San Jose del Monte, Bulacan",
          publicPhotoUrl: cleanText(value.publicPhotoUrl || "", 1000),
          publicOfficeName: cleanText(value.publicOfficeName || "", 160),
          publicOfficeAddress: cleanText(value.publicOfficeAddress || "", 300),
          supportType: "in_kind_coordination",
          paymentEnabled: false,
          publishedAt: typeof value.publishedAt?.toMillis === "function"
            ? value.publishedAt.toMillis() : 0,
        };
      }).sort((a, b) => b.publishedAt - a.publishedAt);
      return response.status(200).json({ ok: true, appeals });
    } catch (error) {
      console.error("Public assistance appeals unavailable:", error?.message);
      return response.status(503).json({ ok: false, appeals: [], message: "Appeals temporarily unavailable." });
    }
  });
}

module.exports = { installPublicAssistanceAppeals };
