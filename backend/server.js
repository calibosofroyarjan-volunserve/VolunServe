"use strict";
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");
const {
  auth,
  db,
  FieldValue,
} = require("./firebaseAdmin");
const app = express();
const DEFAULT_ALLOWED_ORIGINS = [
  "http\://localhost:8081",
  "http\://localhost:8082",
  "http\://localhost:8083",
  "http\://localhost:19006",
  "http\://localhost:3000",
  "http\://127.0.0.1:8081",
  "http\://127.0.0.1:8082",
  "http\://127.0.0.1:8083",
  "http\://127.0.0.1:19006",
  "http\://127.0.0.1:3000",
];
const IDENTITY_UPLOAD_LIMIT = "20mb";
const IDENTITY_RETRY_DELAY_MS = 8000;
const ASSISTANCE_EVIDENCE_UPLOAD_LIMIT = "10mb";
const ASSISTANCE_EVIDENCE_MAX_BYTES =
  10 * 1024 * 1024;
const ASSISTANCE_EVIDENCE_MAX_STAGED = 12;
const ASSISTANCE_EVIDENCE_URL_TTL_SECONDS = 300;
const ASSISTANCE_PUBLIC_PHOTO_UPLOAD_LIMIT = "10mb";
const ASSISTANCE_PUBLIC_PHOTO_MAX_BYTES =
  10 * 1024 * 1024;
const ASSISTANCE_PUBLIC_PHOTO_MAX_STAGED = 4;
const ASSISTANCE_EVIDENCE_DOCUMENT_TYPES =
  new Set([
    "damage_evidence",
    "barangay_incident_reference",
    "medical_certificate",
    "hospital_estimate",
    "other_medical_support",
    "treatment_estimate",
    "other_treatment_support",
    "diagnosis_document",
    "treatment_plan_or_bill",
    "other_illness_support",
    "animal_case_photo",
    "vet_assessment",
    "other_animal_support",
    "elderly_need_evidence",
    "elderly_supporting_document",
    "basic_need_evidence",
    "barangay_social_welfare_reference",
    "other_supporting_evidence",
  ]);
const ASSISTANCE_REQUEST_CATEGORY_CONFIG = Object.freeze({
  disaster_recovery: {
    label: "Disaster Recovery",
    requestGroup: "disaster_recovery",
    allowedDocumentTypes: [
      "damage_evidence",
      "barangay_incident_reference",
    ],
    requiredDocumentTypes: [
      "damage_evidence",
    ],
    requiresPositiveAmount: false,
  },
  medical_health: {
    label: "Medical / Health",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "medical_certificate",
      "hospital_estimate",
      "other_medical_support",
    ],
    requiredDocumentTypes: [
      "medical_certificate",
      "hospital_estimate",
    ],
    requiresPositiveAmount: true,
  },
  surgery_treatment: {
    label: "Surgery / Treatment",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "medical_certificate",
      "treatment_estimate",
      "other_treatment_support",
    ],
    requiredDocumentTypes: [
      "medical_certificate",
      "treatment_estimate",
    ],
    requiresPositiveAmount: true,
  },
  cancer_serious_illness: {
    label: "Cancer / Serious Illness",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "diagnosis_document",
      "treatment_plan_or_bill",
      "other_illness_support",
    ],
    requiredDocumentTypes: [
      "diagnosis_document",
      "treatment_plan_or_bill",
    ],
    requiresPositiveAmount: true,
  },
  animal_pet_welfare: {
    label: "Animal / Pet Welfare",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "animal_case_photo",
      "vet_assessment",
      "other_animal_support",
    ],
    requiredDocumentTypes: [
      "animal_case_photo",
      "vet_assessment",
    ],
    requiresPositiveAmount: false,
  },
  elderly_assistance: {
    label: "Elderly Assistance",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "elderly_need_evidence",
      "elderly_supporting_document",
    ],
    requiredDocumentTypes: [
      "elderly_need_evidence",
    ],
    requiresPositiveAmount: false,
  },
  homeless_basic_needs: {
    label: "Homeless / Basic Needs",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "basic_need_evidence",
      "barangay_social_welfare_reference",
    ],
    requiredDocumentTypes: [
      "basic_need_evidence",
    ],
    requiresPositiveAmount: false,
  },
  other_community_assistance: {
    label: "Other Community Assistance",
    requestGroup: "community_need",
    allowedDocumentTypes: [
      "other_supporting_evidence",
    ],
    requiredDocumentTypes: [
      "other_supporting_evidence",
    ],
    requiresPositiveAmount: false,
  },
});
const ASSISTANCE_EVIDENCE_LABELS = Object.freeze({
  damage_evidence:
    "Damage / Recovery Evidence",
  barangay_incident_reference:
    "Barangay / Incident Reference",
  medical_certificate:
    "Medical Certificate / Recommendation",
  hospital_estimate:
    "Hospital Bill / Estimate",
  other_medical_support:
    "Other Supporting Document",
  treatment_estimate:
    "Surgery / Treatment Estimate",
  other_treatment_support:
    "Other Supporting Document",
  diagnosis_document:
    "Diagnosis / Medical Certificate",
  treatment_plan_or_bill:
    "Treatment Plan / Hospital Bill",
  other_illness_support:
    "Other Supporting Document",
  animal_case_photo:
    "Animal / Pet Case Photo",
  vet_assessment:
    "Veterinary Assessment / Quotation",
  other_animal_support:
    "Other Supporting Document",
  elderly_need_evidence:
    "Supporting Evidence of Need",
  elderly_supporting_document:
    "Medical / Social Welfare Document",
  basic_need_evidence:
    "Situation / Need Evidence",
  barangay_social_welfare_reference:
    "Barangay / Social Welfare Reference",
  other_supporting_evidence:
    "Supporting Evidence",
});
const ASSISTANCE_PUBLIC_BACKEND_URL =
  "https://volunserve.onrender.com";
function getAllowedOrigins() {
  const configured = String(
    process.env.ALLOWED_ORIGINS || "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configured,
  ]);
}
const allowedOrigins =
  getAllowedOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(
        new Error(
          "Origin is not allowed by VolunServe backend.",
        ),
      );
    },
    methods: [
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-File-Name",
      "X-Document-Type",
    ],
  }),
);
// =========================================================
// PAYMONGO TEST CHECKOUT + WEBHOOK
// =========================================================
// IMPORTANT: This webhook route MUST stay before express.json().
// PayMongo signs the exact raw request body, so parsing JSON first would
// invalidate the HMAC signature.
// =========================================================
const PAYMONGO_API_BASE = "https://api.paymongo.com";
const paymongoText = (value, maximumLength = 500) =>
  String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
const paymongoMode = () =>
  paymongoText(process.env.PAYMONGO_MODE || "test", 20).toLowerCase() === "live"
    ? "live"
    : "test";
const getPaymongoSecretKey = () =>
  String(process.env.PAYMONGO_SECRET_KEY || "").trim();
const getPaymongoWebhookSecret = () =>
  String(process.env.PAYMONGO_WEBHOOK_SECRET || "").trim();
const maskDonationName = (value) => {
  const parts = paymongoText(value || "Donor", 160)
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Anonymous Donor";
  return parts
    .map((part) => {
      if (part.length <= 1) return `${part}*`;
      return `${part[0]}${"*".repeat(Math.max(1, part.length - 2))}${part[part.length - 1]}`;
    })
    .join(" ")
    .slice(0, 160);
};
const parsePaymongoSignature = (headerValue) => {
  const result = {};
  String(headerValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const separator = item.indexOf("=");
      if (separator <= 0) return;
      const key = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      if (key) result[key] = value;
    });
  return result;
};
const verifyPaymongoWebhookSignature = (rawBody, signatureHeader) => {
  const secret = getPaymongoWebhookSecret();
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  const parts = parsePaymongoSignature(signatureHeader);
  const timestamp = String(parts.t || "").trim();
  const signatureKey = paymongoMode() === "live" ? "li" : "te";
  const provided = String(parts[signatureKey] || "").trim().toLowerCase();
  if (!timestamp || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const rawText = rawBody.toString("utf8");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawText}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
};
const finalizePaymongoDonation = async (session) => {
  const sessionId = paymongoText(session?.id || "", 180);
  const attributes = session?.attributes || {};
  const donationId = paymongoText(attributes.reference_number || "", 180);
  if (!sessionId || !donationId) {
    const error = new Error("PayMongo checkout session is missing its reference number.");
    error.statusCode = 400;
    error.code = "paymongo_reference_missing";
    throw error;
  }
  if (paymongoMode() === "test" && attributes.livemode === true) {
    const error = new Error("Live PayMongo events are disabled while VolunServe is in test mode.");
    error.statusCode = 409;
    error.code = "live_paymongo_event_blocked";
    throw error;
  }
  const donationRef = db.collection("donations").doc(donationId);
  const activityRef = db.collection("adminActivityLogs").doc();
  return db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      const error = new Error("The PayMongo donation record was not found yet.");
      error.statusCode = 404;
      error.code = "paymongo_donation_not_found";
      throw error;
    }
    const donation = donationSnapshot.data() || {};
    if (
      paymongoText(donation.paymentProvider || "", 40).toLowerCase() !== "paymongo"
    ) {
      const error = new Error("This donation is not linked to PayMongo.");
      error.statusCode = 409;
      error.code = "paymongo_donation_link_required";
      throw error;
    }
    const storedSessionId = paymongoText(
      donation.paymongoCheckoutSessionId || "",
      180,
    );
    if (storedSessionId && storedSessionId !== sessionId) {
      const error = new Error("The PayMongo checkout session does not match this donation.");
      error.statusCode = 409;
      error.code = "paymongo_session_mismatch";
      throw error;
    }
    if (
      paymongoText(donation.status || "", 40).toLowerCase() === "received" &&
      paymongoText(donation.paymentStatus || "", 40).toLowerCase() === "paid"
    ) {
      return {
        donationId,
        campaignId: paymongoText(donation.campaignId || "", 160),
        alreadyProcessed: true,
      };
    }
    if (
      !["payment_creating", "payment_pending"].includes(
        paymongoText(donation.status || "", 40).toLowerCase(),
      )
    ) {
      const error = new Error("This PayMongo donation is not awaiting payment confirmation.");
      error.statusCode = 409;
      error.code = "paymongo_donation_not_pending";
      throw error;
    }
    const amount = Number(donation.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("The stored PayMongo donation amount is invalid.");
      error.statusCode = 409;
      error.code = "paymongo_amount_invalid";
      throw error;
    }
    const campaignId = paymongoText(donation.campaignId || "", 160);
    if (!campaignId) {
      const error = new Error("This PayMongo donation is not linked to a campaign.");
      error.statusCode = 409;
      error.code = "paymongo_campaign_link_required";
      throw error;
    }
    const campaignRef = db.collection("donationCampaigns").doc(campaignId);
    const campaignSnapshot = await transaction.get(campaignRef);
    if (!campaignSnapshot.exists) {
      const error = new Error("The linked Donation Campaign was not found.");
      error.statusCode = 404;
      error.code = "campaign_not_found";
      throw error;
    }
    const campaign = campaignSnapshot.data() || {};
    const currentVerified = Number(campaign.verifiedAmountReceived || 0);
    const nextVerified =
      (Number.isFinite(currentVerified) ? currentVerified : 0) + amount;
    transaction.update(campaignRef, {
      verifiedAmountReceived: nextVerified,
      updatedBy: "paymongo_webhook",
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(donationRef, {
      status: "received",
      paymentStatus: "paid",
      actualAmountReceived: amount,
      transactionReference: sessionId,
      paymongoCheckoutSessionId: sessionId,
      paymongoReferenceNumber: donationId,
      paymongoLivemode: attributes.livemode === true,
      paidAt: FieldValue.serverTimestamp(),
      verifiedBy: "paymongo_webhook",
      verifiedAt: FieldValue.serverTimestamp(),
      receivedBy: "paymongo_webhook",
      receivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      rejectionReason: "",
    });
    transaction.set(activityRef, {
      action: "PayMongo Donation Automatically Verified",
      donationId,
      campaignId,
      donationType: "monetary",
      actualReceived: amount,
      paymentProvider: "paymongo",
      paymongoCheckoutSessionId: sessionId,
      performedBy: "paymongo_webhook",
      timestamp: FieldValue.serverTimestamp(),
    });
    return {
      donationId,
      campaignId,
      verifiedAmountReceived: nextVerified,
      alreadyProcessed: false,
    };
  });
};
app.post(
  "/api/paymongo/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (request, response) => {
    try {
      const signatureHeader =
        request.headers["paymongo-signature"] ||
        request.headers["x-paymongo-signature"] ||
        "";
      if (!getPaymongoWebhookSecret()) {
        return response.status(503).json({
          ok: false,
          error: "paymongo_webhook_secret_not_configured",
        });
      }
      if (!verifyPaymongoWebhookSignature(request.body, signatureHeader)) {
        return response.status(401).json({
          ok: false,
          error: "invalid_paymongo_signature",
        });
      }
      let payload;
      try {
        payload = JSON.parse(request.body.toString("utf8"));
      } catch {
        return response.status(400).json({
          ok: false,
          error: "invalid_paymongo_webhook_json",
        });
      }
      // PayMongo webhook payloads use an event envelope:
      // data.type === "event"
      // data.attributes.type === "checkout_session.payment.paid"
      // data.attributes.data === the Checkout Session resource.
      // Keep a small compatibility fallback for older/simplified examples.
      const eventEnvelope = payload?.data || {};
      const eventAttributes = eventEnvelope?.attributes || {};
      const eventType = paymongoText(
        eventAttributes?.type ||
          eventEnvelope?.event_type ||
          payload?.event_type ||
          (eventEnvelope?.type !== "event" ? eventEnvelope?.type : "") ||
          "",
        120,
      );
      if (paymongoMode() === "test" && eventAttributes?.livemode === true) {
        return response.status(409).json({
          ok: false,
          error: "live_paymongo_event_blocked",
          message: "Live PayMongo events are disabled while VolunServe is in test mode.",
        });
      }
      if (eventType !== "checkout_session.payment.paid") {
        return response.status(200).json({
          ok: true,
          ignored: true,
          eventType,
        });
      }
      const checkoutSession =
        eventAttributes?.data || eventEnvelope?.data || {};
      try {
        const result = await finalizePaymongoDonation(checkoutSession);
        return response.status(200).json({
          ok: true,
          eventType,
          ...result,
        });
      } catch (error) {
        // PayMongo's dashboard test event uses a sample checkout reference
        // that does not exist in VolunServe. A valid signed event with an
        // unknown merchant reference can be acknowledged without creating or
        // changing any donation record.
        if (error?.code === "paymongo_donation_not_found") {
          return response.status(200).json({
            ok: true,
            ignored: true,
            eventType,
            reason: "unknown_volunserve_reference",
          });
        }
        throw error;
      }
    } catch (error) {
      console.error("PayMongo webhook processing failed:", error);
      return response.status(Number(error?.statusCode) || 500).json({
        ok: false,
        error: paymongoText(error?.code || "paymongo_webhook_failed", 120),
        message: paymongoText(
          error?.message || "Unable to process the PayMongo webhook.",
          700,
        ),
      });
    }
  },
);
app.use(
  express.json({
    limit: "1mb",
  }),
);
function cleanText(
  value,
  maximumLength = 240,
) {
  return String(
    value || "",
  )
    .replace(
      /[\u0000-\u001F\u007F]/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      maximumLength,
    );
}
function normalizeIdentityStatus(
  value,
) {
  const status = cleanText(
    value,
    40,
  ).toLowerCase();
  if (
    status === "pending" ||
    status === "verified" ||
    status === "failed"
  ) {
    return status;
  }
  return "basic";
}
function normalizeAiDecision(
  value,
) {
  const decision = cleanText(
    value,
    80,
  )
    .toLowerCase()
    .replace(
      /[\s-]+/g,
      "_",
    );
  if (
    decision === "verified" ||
    decision === "approved" ||
    decision === "match" ||
    decision === "matched"
  ) {
    return "verified";
  }
  if (
    decision === "manual_review" ||
    decision === "review" ||
    decision === "needs_review" ||
    decision === "pending"
  ) {
    return "manual_review";
  }
  if (
    decision === "failed" ||
    decision === "rejected" ||
    decision === "no_match" ||
    decision === "not_matched"
  ) {
    // AI-assisted verification does not
    // permanently reject a Resident.
    // A non-match is sent to LGU/Admin
    // manual review.
    return "manual_review";
  }
  return "manual_review";
}
function numberOrNull(
  value,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : null;
}
function getBearerToken(
  request,
) {
  const authorization = String(
    request.headers.authorization || "",
  ).trim();
  if (
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    return "";
  }
  return authorization
    .slice(7)
    .trim();
}
async function requireFirebaseUser(
  request,
  response,
  next,
) {
  try {
    const token =
      getBearerToken(
        request,
      );
    if (!token) {
      response
        .status(401)
        .json({
          error:
            "unauthenticated",
          message:
            "Sign in to continue.",
        });
      return;
    }
    const decodedToken =
      await auth.verifyIdToken(
        token,
        true,
      );
    request.firebaseUser =
      decodedToken;
    next();
  } catch (error) {
    console.error(
      "Firebase token verification failed:",
      error?.message,
    );
    response
      .status(401)
      .json({
        error:
          "invalid_token",
        message:
          "Your sign-in session could not be verified. Please sign in again.",
      });
  }
}
function makeHttpError(
  statusCode,
  code,
  message,
) {
  const error =
    new Error(message);
  error.statusCode =
    statusCode;
  error.code =
    code;
  return error;
}
function getCloudinaryConfig() {
  const cloudName =
    cleanText(
      process.env
        .CLOUDINARY_CLOUD_NAME ||
        "netjawtz",
      120,
    );
  const apiKey =
    cleanText(
      process.env
        .CLOUDINARY_API_KEY ||
        "",
      200,
    );
  const apiSecret =
    String(
      process.env
        .CLOUDINARY_API_SECRET ||
        "",
    ).trim();
  if (
    !cloudName ||
    !apiKey ||
    !apiSecret
  ) {
    throw makeHttpError(
      503,
      "cloudinary_not_configured",
      "Secure assistance evidence storage is not configured on the backend yet.",
    );
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
  };
}
function configureCloudinary() {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } =
    getCloudinaryConfig();
  cloudinary.config({
    cloud_name:
      cloudName,
    api_key:
      apiKey,
    api_secret:
      apiSecret,
    secure:
      true,
  });
  return {
    cloudName,
    apiKey,
    apiSecret,
  };
}
function sanitizeFileName(
  value,
) {
  const cleaned =
    cleanText(
      value,
      180,
    )
      .replace(
        /[^A-Za-z0-9._ -]/g,
        "_",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();
  return (
    cleaned ||
    `evidence-${Date.now()}.jpg`
  );
}
function detectAssistanceImage(
  buffer,
) {
  if (
    !Buffer.isBuffer(
      buffer,
    ) ||
    buffer.length < 12
  ) {
    return null;
  }
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      mimeType:
        "image/jpeg",
      extension:
        "jpg",
    };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      mimeType:
        "image/png",
      extension:
        "png",
    };
  }
  if (
    buffer
      .subarray(
        0,
        4,
      )
      .toString(
        "ascii",
      ) === "RIFF" &&
    buffer
      .subarray(
        8,
        12,
      )
      .toString(
        "ascii",
      ) === "WEBP"
  ) {
    return {
      mimeType:
        "image/webp",
      extension:
        "webp",
    };
  }
  return null;
}
function getProfileRole(
  profile,
) {
  return cleanText(
    profile?.primaryRole ||
      profile?.role ||
      "",
    40,
  ).toLowerCase();
}
function isApprovedAccount(
  profile,
) {
  return (
    cleanText(
      profile?.status ||
        "",
      40,
    ).toLowerCase() ===
    "approved"
  );
}
function isVerifiedResidentProfile(
  profile,
) {
  return (
    isApprovedAccount(
      profile,
    ) &&
    profile?.residentAccess ===
      true &&
    (
      profile
        ?.identityVerified ===
        true ||
      normalizeIdentityStatus(
        profile
          ?.identityStatus,
      ) === "verified"
    )
  );
}
function isOperationalAdminProfile(
  profile,
) {
  return (
    isApprovedAccount(
      profile,
    ) &&
    getProfileRole(
      profile,
    ) === "admin"
  );
}
async function loadUserProfile(
  uid,
) {
  const snapshot =
    await db
      .collection(
        "users",
      )
      .doc(uid)
      .get();
  if (
    !snapshot.exists
  ) {
    throw makeHttpError(
      404,
      "profile_not_found",
      "Your VolunServe profile was not found.",
    );
  }
  return (
    snapshot.data() ||
    {}
  );
}
async function requireVerifiedResident(
  request,
  response,
  next,
) {
  try {
    const profile =
      await loadUserProfile(
        request
          .firebaseUser
          .uid,
      );
    if (
      !isVerifiedResidentProfile(
        profile,
      )
    ) {
      response
        .status(403)
        .json({
          error:
            "verified_resident_required",
          message:
            "Only a Verified Resident can upload Request Assistance evidence.",
        });
      return;
    }
    request
      .volunServeProfile =
      profile;
    next();
  } catch (error) {
    response
      .status(
        Number(
          error
            ?.statusCode,
        ) || 500,
      )
      .json({
        error:
          cleanText(
            error?.code ||
              "profile_check_failed",
            100,
          ),
        message:
          cleanText(
            error?.message ||
              "Unable to verify the Resident account.",
            500,
          ),
      });
  }
}
async function requireOperationalAdmin(
  request,
  response,
  next,
) {
  try {
    const profile =
      await loadUserProfile(
        request
          .firebaseUser
          .uid,
      );
    if (
      !isOperationalAdminProfile(
        profile,
      )
    ) {
      response
        .status(403)
        .json({
          error:
            "operational_admin_required",
          message:
            "Only an approved operational Admin can manage Assistance Request reviews.",
        });
      return;
    }
    request
      .volunServeProfile =
      profile;
    next();
  } catch (error) {
    response
      .status(
        Number(
          error
            ?.statusCode,
        ) || 500,
      )
      .json({
        error:
          cleanText(
            error?.code ||
              "admin_profile_check_failed",
            100,
          ),
        message:
          cleanText(
            error?.message ||
              "Unable to verify the Admin account.",
            500,
          ),
      });
  }
}
function isAdminOrSuperAdminProfile(profile) {
  if (!isApprovedAccount(profile)) return false;
  return ["admin", "superadmin"].includes(getProfileRole(profile));
}
function isVerifiedLguPersonnelProfile(profile) {
  return (
    isApprovedAccount(profile) &&
    getProfileRole(profile) === "lgu_personnel" &&
    profile?.lguVerified === true &&
    cleanText(profile?.employmentStatus || "", 40).toLowerCase() === "active"
  );
}
async function requireAdminOrSuperAdmin(request, response, next) {
  try {
    const profile = await loadUserProfile(request.firebaseUser.uid);
    if (!isAdminOrSuperAdminProfile(profile)) {
      response.status(403).json({
        error: "admin_or_superadmin_required",
        message: "Only an approved Admin or Super Admin can manage LGU test personnel.",
      });
      return;
    }
    request.volunServeProfile = profile;
    next();
  } catch (error) {
    response.status(Number(error?.statusCode) || 500).json({
      error: cleanText(error?.code || "admin_profile_check_failed", 100),
      message: cleanText(error?.message || "Unable to verify the Admin account.", 500),
    });
  }
}
async function requireVerifiedLguPersonnel(request, response, next) {
  try {
    const uid = request.firebaseUser.uid;
    const [profile, personnelSnapshot] = await Promise.all([
      loadUserProfile(uid),
      db.collection("lguPersonnel").doc(uid).get(),
    ]);
    if (!isVerifiedLguPersonnelProfile(profile) || !personnelSnapshot.exists) {
      response.status(403).json({
        error: "verified_lgu_personnel_required",
        message: "Only verified active LGU Personnel can use LGU duty functions.",
      });
      return;
    }
    const personnel = personnelSnapshot.data() || {};
    if (
      cleanText(personnel.verificationStatus || "", 40).toLowerCase() !== "verified" ||
      cleanText(personnel.employmentStatus || "", 40).toLowerCase() !== "active"
    ) {
      response.status(403).json({
        error: "lgu_personnel_not_active",
        message: "This LGU Personnel record is not currently active and verified.",
      });
      return;
    }
    request.volunServeProfile = profile;
    request.lguPersonnelRecord = personnel;
    next();
  } catch (error) {
    response.status(Number(error?.statusCode) || 500).json({
      error: cleanText(error?.code || "lgu_profile_check_failed", 100),
      message: cleanText(error?.message || "Unable to verify the LGU Personnel account.", 500),
    });
  }
}
function makeTestLguPassword() {
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}
function makeLguTemporaryPassword() {
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}
function normalizeLguCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, 20);
}
function getManilaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
}
function testLguEmailFromEmployeeId(employeeId) {
  const localPart = cleanText(employeeId, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || `lgu.${Date.now()}`;
  return `${localPart}@volunserve.test`;
}
app.post(
  "/api/admin/lgu/personnel",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    let createdAuthUser = null;
    try {
      const adminUid = request.firebaseUser.uid;
      const fullName = cleanText(request.body?.fullName || "", 120);
      const department = cleanText(request.body?.department || "", 120);
      const position = cleanText(request.body?.position || "", 120);
      const employeeId = cleanText(
        request.body?.employeeId || "",
        80,
      ).toUpperCase();
      const email = cleanText(
        request.body?.email || "",
        160,
      ).toLowerCase();
      const phoneNumber = cleanText(
        request.body?.phoneNumber || "",
        40,
      );
      const capabilities = normalizeLguCapabilities(
        request.body?.capabilities,
      );

      if (fullName.length < 2) {
        throw makeHttpError(
          400,
          "invalid_lgu_name",
          "Enter the LGU Personnel full name.",
        );
      }

      if (department.length < 2 || position.length < 2) {
        throw makeHttpError(
          400,
          "invalid_lgu_position",
          "Enter the LGU department and position.",
        );
      }

      if (
        employeeId.length < 2 ||
        employeeId.startsWith("TEST-LGU-")
      ) {
        throw makeHttpError(
          400,
          "invalid_lgu_employee_id",
          "Enter the real LGU employee ID. TEST-LGU- IDs are reserved for development accounts.",
        );
      }

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        /@volunserve[.]test$/i.test(email)
      ) {
        throw makeHttpError(
          400,
          "invalid_lgu_email",
          "Enter the staff member's real working email address. @volunserve.test is reserved for TEST accounts.",
        );
      }

      const duplicatePersonnel = await db
        .collection("lguPersonnel")
        .where("employeeId", "==", employeeId)
        .limit(1)
        .get();

      if (!duplicatePersonnel.empty) {
        throw makeHttpError(
          409,
          "lgu_employee_id_exists",
          "This LGU employee ID is already registered.",
        );
      }

      try {
        await auth.getUserByEmail(email);
        throw makeHttpError(
          409,
          "lgu_email_exists",
          "This email address is already used by another VolunServe account.",
        );
      } catch (error) {
        if (error?.code !== "auth/user-not-found") {
          throw error;
        }
      }

      const password = makeLguTemporaryPassword();

      createdAuthUser = await auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: false,
        disabled: false,
      });

      const uid = createdAuthUser.uid;
      const userRef = db.collection("users").doc(uid);
      const personnelRef = db.collection("lguPersonnel").doc(uid);
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const activityRef = db.collection("adminActivityLogs").doc();
      const batch = db.batch();

      batch.set(userRef, {
        uid,
        fullName,
        email,
        phoneNumber,
        role: "lgu_personnel",
        requestedRole: "lgu_personnel",
        primaryRole: "lgu_personnel",
        residentAccess: false,
        volunteerAccess: false,
        volunteerStatus: "not_applied",
        activeMode: "lgu_personnel",
        status: "approved",
        lguVerified: true,
        employmentStatus: "active",
        department,
        position,
        employeeId,
        isTestAccount: false,
        accountSource: "admin_verified_lgu_staff",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: adminUid,
      });

      batch.set(personnelRef, {
        uid,
        fullName,
        email,
        phoneNumber,
        department,
        position,
        employeeId,
        capabilities,
        verificationStatus: "verified",
        employmentStatus: "active",
        isTestAccount: false,
        verificationMethod: "admin_lgu_staff_verification",
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: adminUid,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      });

      batch.set(dutyRef, {
        uid,
        dutyStatus: "off_duty",
        availabilityStatus: "unavailable",
        activeCaseId: "",
        activeAssignmentId: "",
        shiftDate: "",
        timeInAt: null,
        timeOutAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      });

      batch.set(activityRef, {
        action: "LGU Personnel Created",
        personnelUid: uid,
        employeeId,
        email,
        department,
        position,
        performedBy: adminUid,
        timestamp: FieldValue.serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        try {
          await auth.deleteUser(uid);
        } catch (rollbackError) {
          console.error(
            "LGU Personnel Auth rollback failed:",
            rollbackError,
          );
        }
        createdAuthUser = null;
        throw error;
      }

      response.status(201).json({
        ok: true,
        testAccount: false,
        uid,
        fullName,
        email,
        temporaryPassword: password,
        employeeId,
        department,
        position,
        dutyStatus: "off_duty",
        availabilityStatus: "unavailable",
        message:
          "Verified LGU Personnel account created. Save the temporary password now and share it securely with the staff member.",
      });
    } catch (error) {
      if (createdAuthUser?.uid) {
        try {
          await auth.deleteUser(createdAuthUser.uid);
        } catch (rollbackError) {
          console.error(
            "LGU Personnel Auth cleanup failed:",
            rollbackError,
          );
        }
      }

      const authCode = cleanText(error?.code || "", 120);
      const statusCode =
        authCode === "auth/email-already-exists"
          ? 409
          : Number(error?.statusCode) || 500;

      response.status(statusCode).json({
        error: authCode || "lgu_personnel_creation_failed",
        message: cleanText(
          error?.message ||
            "Unable to create the verified LGU Personnel account.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/admin/lgu/test-personnel",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    let createdAuthUser = null;
    try {
      const adminUid = request.firebaseUser.uid;
      const fullName = cleanText(request.body?.fullName || "", 120);
      const department = cleanText(request.body?.department || "", 120);
      const position = cleanText(request.body?.position || "", 120);
      const employeeId = cleanText(request.body?.employeeId || "", 80).toUpperCase();
      const phoneNumber = cleanText(request.body?.phoneNumber || "", 40);
      const capabilities = normalizeLguCapabilities(request.body?.capabilities);
      const requestedEmail = cleanText(request.body?.email || "", 160).toLowerCase();
      const email = requestedEmail || testLguEmailFromEmployeeId(employeeId);
      if (fullName.length < 2) {
        throw makeHttpError(400, "invalid_lgu_name", "Enter the TEST LGU Personnel full name.");
      }
      if (department.length < 2 || position.length < 2) {
        throw makeHttpError(400, "invalid_lgu_position", "Enter the LGU department and position.");
      }
      if (!/^TEST-LGU-[A-Z0-9_-]{1,60}$/.test(employeeId)) {
        throw makeHttpError(
          400,
          "invalid_test_lgu_employee_id",
          "Test LGU employee IDs must start with TEST-LGU- so they cannot be mistaken for real personnel.",
        );
      }
      if (!/^[^\s@]+@volunserve[.]test$/i.test(email)) {
        throw makeHttpError(
          400,
          "invalid_test_lgu_email",
          "Test LGU accounts must use the reserved @volunserve.test email domain.",
        );
      }
      const duplicatePersonnel = await db
        .collection("lguPersonnel")
        .where("employeeId", "==", employeeId)
        .limit(1)
        .get();
      if (!duplicatePersonnel.empty) {
        throw makeHttpError(409, "test_lgu_employee_id_exists", "This TEST LGU employee ID already exists.");
      }
      try {
        await auth.getUserByEmail(email);
        throw makeHttpError(409, "test_lgu_email_exists", "This TEST LGU email already exists.");
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
      const password = makeTestLguPassword();
      createdAuthUser = await auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: true,
        disabled: false,
      });
      const uid = createdAuthUser.uid;
      const userRef = db.collection("users").doc(uid);
      const personnelRef = db.collection("lguPersonnel").doc(uid);
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const activityRef = db.collection("adminActivityLogs").doc();
      const batch = db.batch();
      batch.set(userRef, {
        uid,
        fullName,
        email,
        phoneNumber,
        role: "lgu_personnel",
        requestedRole: "lgu_personnel",
        primaryRole: "lgu_personnel",
        residentAccess: false,
        volunteerAccess: false,
        volunteerStatus: "not_applied",
        activeMode: "lgu_personnel",
        status: "approved",
        lguVerified: true,
        employmentStatus: "active",
        department,
        position,
        employeeId,
        isTestAccount: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUid,
        reviewedBy: adminUid,
      });
      batch.set(personnelRef, {
        uid,
        fullName,
        email,
        phoneNumber,
        department,
        position,
        employeeId,
        capabilities,
        verificationStatus: "verified",
        employmentStatus: "active",
        isTestAccount: true,
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: adminUid,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      });
      batch.set(dutyRef, {
        uid,
        dutyStatus: "off_duty",
        availabilityStatus: "unavailable",
        activeCaseId: "",
        activeAssignmentId: "",
        shiftDate: "",
        timeInAt: null,
        timeOutAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      });
      batch.set(activityRef, {
        action: "Test LGU Personnel Created",
        personnelUid: uid,
        employeeId,
        department,
        position,
        performedBy: adminUid,
        timestamp: FieldValue.serverTimestamp(),
      });
      try {
        await batch.commit();
      } catch (error) {
        try {
          await auth.deleteUser(uid);
        } catch (rollbackError) {
          console.error("TEST LGU Auth rollback failed:", rollbackError);
        }
        createdAuthUser = null;
        throw error;
      }
      response.status(201).json({
        ok: true,
        testAccount: true,
        uid,
        fullName,
        email,
        temporaryPassword: password,
        employeeId,
        department,
        position,
        dutyStatus: "off_duty",
        availabilityStatus: "unavailable",
        message: "TEST LGU Personnel created. Save the temporary password now because it is returned only in this response.",
      });
    } catch (error) {
      if (createdAuthUser?.uid) {
        try {
          await auth.deleteUser(createdAuthUser.uid);
        } catch (rollbackError) {
          console.error("TEST LGU Auth cleanup failed:", rollbackError);
        }
      }
      const authCode = cleanText(error?.code || "", 120);
      const statusCode = authCode === "auth/email-already-exists" ? 409 : Number(error?.statusCode) || 500;
      response.status(statusCode).json({
        error: authCode || "test_lgu_creation_failed",
        message: cleanText(error?.message || "Unable to create the TEST LGU Personnel account.", 700),
      });
    }
  },
);
app.post(
  "/api/admin/lgu/test-personnel/:uid/reset-password",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const targetUid = cleanText(request.params?.uid || "", 160);
      if (!targetUid) {
        throw makeHttpError(400, "lgu_uid_required", "The TEST LGU Personnel account ID is required.");
      }
      const [profile, personnelSnapshot] = await Promise.all([
        loadUserProfile(targetUid),
        db.collection("lguPersonnel").doc(targetUid).get(),
      ]);
      if (!profile || !personnelSnapshot.exists) {
        throw makeHttpError(404, "test_lgu_not_found", "The TEST LGU Personnel account was not found.");
      }
      const personnel = personnelSnapshot.data() || {};
      const employeeId = cleanText(personnel.employeeId || profile.employeeId || "", 80).toUpperCase();
      const email = cleanText(personnel.email || profile.email || "", 160).toLowerCase();
      const fullName = cleanText(personnel.fullName || profile.fullName || "", 120);
      const isSafeTestAccount =
        profile.role === "lgu_personnel" &&
        profile.isTestAccount === true &&
        personnel.isTestAccount === true &&
        employeeId.startsWith("TEST-LGU-") &&
        /^[^\s@]+@volunserve[.]test$/i.test(email);
      if (!isSafeTestAccount) {
        throw makeHttpError(
          403,
          "test_lgu_reset_only",
          "Password reset from this endpoint is allowed only for clearly marked TEST LGU Personnel accounts.",
        );
      }
      const temporaryPassword = makeTestLguPassword();
      await auth.updateUser(targetUid, {
        password: temporaryPassword,
        disabled: false,
      });
      await auth.revokeRefreshTokens(targetUid);
      await db.collection("adminActivityLogs").add({
        action: "Test LGU Personnel Password Reset",
        personnelUid: targetUid,
        employeeId,
        email,
        performedBy: adminUid,
        timestamp: FieldValue.serverTimestamp(),
      });
      response.json({
        ok: true,
        uid: targetUid,
        fullName,
        email,
        employeeId,
        temporaryPassword,
        message: "TEST LGU password reset successfully. Save the new temporary password now because it is returned only in this response.",
      });
    } catch (error) {
      console.error("TEST LGU password reset failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "test_lgu_password_reset_failed", 120),
        message: cleanText(error?.message || "Unable to reset the TEST LGU Personnel password.", 700),
      });
    }
  },
);
app.patch(
  "/api/admin/lgu/personnel/:uid",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const targetUid = cleanText(request.params?.uid || "", 160);

      if (!targetUid) {
        throw makeHttpError(
          400,
          "lgu_uid_required",
          "The LGU Personnel account ID is required.",
        );
      }

      const [profile, personnelSnapshot] = await Promise.all([
        loadUserProfile(targetUid),
        db.collection("lguPersonnel").doc(targetUid).get(),
      ]);

      if (!profile || !personnelSnapshot.exists) {
        throw makeHttpError(
          404,
          "lgu_personnel_not_found",
          "The LGU Personnel account was not found.",
        );
      }

      const personnel = personnelSnapshot.data() || {};

      if (
        getProfileRole(profile) !== "lgu_personnel" ||
        personnel.isTestAccount === true ||
        profile.isTestAccount === true
      ) {
        throw makeHttpError(
          403,
          "real_lgu_personnel_required",
          "This management action is available only for real LGU Personnel accounts.",
        );
      }

      const fullName = cleanText(
        request.body?.fullName ?? personnel.fullName ?? profile.fullName ?? "",
        120,
      );
      const phoneNumber = cleanText(
        request.body?.phoneNumber ?? personnel.phoneNumber ?? profile.phoneNumber ?? "",
        40,
      );
      const department = cleanText(
        request.body?.department ?? personnel.department ?? profile.department ?? "",
        120,
      );
      const position = cleanText(
        request.body?.position ?? personnel.position ?? profile.position ?? "",
        120,
      );
      const capabilities = normalizeLguCapabilities(
        request.body?.capabilities ?? personnel.capabilities ?? [],
      );

      if (fullName.length < 2) {
        throw makeHttpError(
          400,
          "invalid_lgu_name",
          "Enter the LGU Personnel full name.",
        );
      }

      if (department.length < 2 || position.length < 2) {
        throw makeHttpError(
          400,
          "invalid_lgu_position",
          "Enter the LGU department and position.",
        );
      }

      await auth.updateUser(targetUid, {
        displayName: fullName,
      });

      const batch = db.batch();
      const userRef = db.collection("users").doc(targetUid);
      const personnelRef = db.collection("lguPersonnel").doc(targetUid);
      const activityRef = db.collection("adminActivityLogs").doc();

      batch.set(
        userRef,
        {
          fullName,
          phoneNumber,
          department,
          position,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

      batch.set(
        personnelRef,
        {
          fullName,
          phoneNumber,
          department,
          position,
          capabilities,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

      batch.set(activityRef, {
        action: "LGU Personnel Profile Updated",
        personnelUid: targetUid,
        employeeId: cleanText(personnel.employeeId || "", 80),
        department,
        position,
        performedBy: adminUid,
        timestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();

      response.json({
        ok: true,
        uid: targetUid,
        fullName,
        phoneNumber,
        department,
        position,
        capabilities,
        message: "LGU Personnel information updated successfully.",
      });
    } catch (error) {
      console.error("LGU Personnel profile update failed:", error);

      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(
          error?.code || "lgu_personnel_update_failed",
          120,
        ),
        message: cleanText(
          error?.message || "Unable to update the LGU Personnel account.",
          700,
        ),
      });
    }
  },
);

app.post(
  "/api/admin/lgu/personnel/:uid/status",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const targetUid = cleanText(request.params?.uid || "", 160);
      const nextStatus = cleanText(
        request.body?.employmentStatus || "",
        40,
      ).toLowerCase();
      const reason = cleanText(request.body?.reason || "", 700);

      if (!targetUid) {
        throw makeHttpError(
          400,
          "lgu_uid_required",
          "The LGU Personnel account ID is required.",
        );
      }

      if (!["active", "suspended", "inactive"].includes(nextStatus)) {
        throw makeHttpError(
          400,
          "invalid_lgu_employment_status",
          "Employment status must be active, suspended, or inactive.",
        );
      }

      if (
        ["suspended", "inactive"].includes(nextStatus) &&
        reason.length < 3
      ) {
        throw makeHttpError(
          400,
          "lgu_status_reason_required",
          "Enter a short reason for suspending or deactivating this LGU Personnel account.",
        );
      }

      const [profile, personnelSnapshot, dutySnapshot] = await Promise.all([
        loadUserProfile(targetUid),
        db.collection("lguPersonnel").doc(targetUid).get(),
        db.collection("lguDutyStatus").doc(targetUid).get(),
      ]);

      if (!profile || !personnelSnapshot.exists) {
        throw makeHttpError(
          404,
          "lgu_personnel_not_found",
          "The LGU Personnel account was not found.",
        );
      }

      const personnel = personnelSnapshot.data() || {};
      const duty = dutySnapshot.exists ? dutySnapshot.data() || {} : {};

      if (
        getProfileRole(profile) !== "lgu_personnel" ||
        personnel.isTestAccount === true ||
        profile.isTestAccount === true
      ) {
        throw makeHttpError(
          403,
          "real_lgu_personnel_required",
          "Employment access management is available only for real LGU Personnel accounts.",
        );
      }

      const currentStatus = cleanText(
        personnel.employmentStatus || profile.employmentStatus || "active",
        40,
      ).toLowerCase();

      if (currentStatus === nextStatus) {
        response.json({
          ok: true,
          uid: targetUid,
          employmentStatus: nextStatus,
          message: `LGU Personnel is already ${nextStatus}.`,
        });
        return;
      }

      const dutyStatus = cleanText(
        duty.dutyStatus || "off_duty",
        40,
      ).toLowerCase();
      const availabilityStatus = cleanText(
        duty.availabilityStatus || "unavailable",
        40,
      ).toLowerCase();
      const activeCaseId = cleanText(duty.activeCaseId || "", 160);
      const activeAssignmentId = cleanText(
        duty.activeAssignmentId || "",
        180,
      );

      if (
        nextStatus !== "active" &&
        (
          dutyStatus === "on_duty" ||
          ["assigned", "responding", "on_site"].includes(
            availabilityStatus,
          ) ||
          activeCaseId ||
          activeAssignmentId
        )
      ) {
        throw makeHttpError(
          409,
          "lgu_personnel_currently_on_duty",
          "This LGU Personnel account cannot be suspended or deactivated while On Duty or handling an active emergency. Complete the response and Time Out first.",
        );
      }

      if (nextStatus === "active") {
        await auth.updateUser(targetUid, {
          disabled: false,
        });
      } else {
        await auth.updateUser(targetUid, {
          disabled: true,
        });
        await auth.revokeRefreshTokens(targetUid);
      }

      const userRef = db.collection("users").doc(targetUid);
      const personnelRef = db.collection("lguPersonnel").doc(targetUid);
      const dutyRef = db.collection("lguDutyStatus").doc(targetUid);
      const activityRef = db.collection("adminActivityLogs").doc();
      const batch = db.batch();

      batch.set(
        userRef,
        {
          status:
            nextStatus === "active"
              ? "approved"
              : nextStatus,
          employmentStatus: nextStatus,
          lguVerified: true,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

      batch.set(
        personnelRef,
        {
          employmentStatus: nextStatus,
          verificationStatus: "verified",
          statusReason: nextStatus === "active" ? "" : reason,
          statusUpdatedAt: FieldValue.serverTimestamp(),
          statusUpdatedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

      batch.set(
        dutyRef,
        {
          uid: targetUid,
          dutyStatus: "off_duty",
          availabilityStatus: "unavailable",
          activeCaseId: "",
          activeAssignmentId: "",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

      batch.set(activityRef, {
        action:
          nextStatus === "active"
            ? "LGU Personnel Reactivated"
            : nextStatus === "suspended"
              ? "LGU Personnel Suspended"
              : "LGU Personnel Deactivated",
        personnelUid: targetUid,
        employeeId: cleanText(personnel.employeeId || "", 80),
        previousEmploymentStatus: currentStatus,
        employmentStatus: nextStatus,
        reason,
        performedBy: adminUid,
        timestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();

      response.json({
        ok: true,
        uid: targetUid,
        employmentStatus: nextStatus,
        message:
          nextStatus === "active"
            ? "LGU Personnel access reactivated successfully."
            : nextStatus === "suspended"
              ? "LGU Personnel access suspended successfully."
              : "LGU Personnel account deactivated successfully. Historical attendance and emergency records were preserved.",
      });
    } catch (error) {
      console.error("LGU Personnel status update failed:", error);

      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(
          error?.code || "lgu_personnel_status_update_failed",
          120,
        ),
        message: cleanText(
          error?.message || "Unable to update LGU Personnel access status.",
          700,
        ),
      });
    }
  },
);
app.get(
  "/api/admin/lgu/personnel",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    try {
      const snapshot = await db.collection("lguPersonnel").limit(200).get();
      const people = await Promise.all(
        snapshot.docs.map(async (document) => {
          const personnel = document.data() || {};
          const dutySnapshot = await db.collection("lguDutyStatus").doc(document.id).get();
          const duty = dutySnapshot.exists ? dutySnapshot.data() || {} : {};
          return {
            uid: document.id,
            fullName: cleanText(personnel.fullName || "", 120),
            email: cleanText(personnel.email || "", 160),
            phoneNumber: cleanText(personnel.phoneNumber || "", 40),
            department: cleanText(personnel.department || "", 120),
            position: cleanText(personnel.position || "", 120),
            employeeId: cleanText(personnel.employeeId || "", 80),
            capabilities: Array.isArray(personnel.capabilities) ? personnel.capabilities : [],
            verificationStatus: cleanText(personnel.verificationStatus || "", 40),
            employmentStatus: cleanText(personnel.employmentStatus || "", 40),
            isTestAccount: personnel.isTestAccount === true,
            dutyStatus: cleanText(duty.dutyStatus || "off_duty", 40),
            availabilityStatus: cleanText(duty.availabilityStatus || "unavailable", 40),
            activeCaseId: cleanText(duty.activeCaseId || "", 160),
            activeAssignmentId: cleanText(duty.activeAssignmentId || "", 180),
            shiftDate: cleanText(duty.shiftDate || "", 20),
            timeInAt: duty.timeInAt || null,
            timeOutAt: duty.timeOutAt || null,
          };
        }),
      );
      people.sort((a, b) => a.fullName.localeCompare(b.fullName));
      response.json({ ok: true, personnel: people });
    } catch (error) {
      console.error("LGU Personnel list failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_personnel_list_failed", 120),
        message: cleanText(error?.message || "Unable to load LGU Personnel.", 700),
      });
    }
  },
);
app.get(
  "/api/admin/lgu/attendance",
  requireFirebaseUser,
  requireAdminOrSuperAdmin,
  async (request, response) => {
    try {
      const requestedLimit = Number(request.query?.limit);
      const safeLimit =
        Number.isFinite(requestedLimit) && requestedLimit > 0
          ? Math.min(Math.floor(requestedLimit), 500)
          : 200;

      const [attendanceSnapshot, personnelSnapshot] = await Promise.all([
        db.collection("lguAttendance").limit(500).get(),
        db.collection("lguPersonnel").limit(200).get(),
      ]);

      const personnelByUid = new Map();

      personnelSnapshot.docs.forEach((document) => {
        const data = document.data() || {};

        personnelByUid.set(document.id, {
          employeeId: cleanText(data.employeeId || "", 80),
          isTestAccount: data.isTestAccount === true,
          email: cleanText(data.email || "", 160),
        });
      });

      const timestampIso = (value) => {
        try {
          if (!value) return "";

          if (typeof value.toDate === "function") {
            return value.toDate().toISOString();
          }

          if (value instanceof Date) {
            return value.toISOString();
          }

          return "";
        } catch {
          return "";
        }
      };

      const records = attendanceSnapshot.docs
        .map((document) => {
          const data = document.data() || {};
          const uid = cleanText(data.uid || "", 160);
          const personnelMeta = personnelByUid.get(uid) || {};

          return {
            id: document.id,
            uid,
            fullName: cleanText(data.fullName || "", 120),
            department: cleanText(data.department || "", 120),
            position: cleanText(data.position || "", 120),
            employeeId: cleanText(personnelMeta.employeeId || "", 80),
            email: cleanText(personnelMeta.email || "", 160),
            isTestAccount: personnelMeta.isTestAccount === true,
            shiftDate: cleanText(data.shiftDate || "", 20),
            status: cleanText(data.status || "", 40),
            timeInAt: timestampIso(data.timeInAt),
            timeOutAt: timestampIso(data.timeOutAt),
            createdAt: timestampIso(data.createdAt),
            updatedAt: timestampIso(data.updatedAt),
          };
        })
        .sort((a, b) => {
          const aTime = a.timeInAt
            ? new Date(a.timeInAt).getTime()
            : 0;
          const bTime = b.timeInAt
            ? new Date(b.timeInAt).getTime()
            : 0;

          return bTime - aTime;
        })
        .slice(0, safeLimit);

      response.json({
        ok: true,
        records,
      });
    } catch (error) {
      console.error("LGU attendance history load failed:", error);

      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(
          error?.code || "lgu_attendance_history_failed",
          120,
        ),
        message: cleanText(
          error?.message || "Unable to load LGU attendance history.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/admin/lgu/assignments",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const caseId = cleanText(request.body?.caseId || "", 160);
      const personnelUid = cleanText(request.body?.personnelUid || "", 160);

      if (!caseId) {
        throw makeHttpError(400, "case_id_required", "Select an emergency case before assigning LGU Personnel.");
      }

      if (!personnelUid) {
        throw makeHttpError(400, "lgu_personnel_uid_required", "Select an LGU Personnel account to assign.");
      }

      const caseRef = db.collection("disasterCases").doc(caseId);
      const personnelRef = db.collection("lguPersonnel").doc(personnelUid);
      const personnelUserRef = db.collection("users").doc(personnelUid);
      const dutyRef = db.collection("lguDutyStatus").doc(personnelUid);
      const assignmentRef = db.collection("lguAssignments").doc();
      const personnelNotificationRef = db.collection("notifications").doc();
      const residentNotificationRef = db.collection("notifications").doc();
      const activityLogRef = db.collection("adminActivityLogs").doc();

      let assignedPersonnel = null;

      await db.runTransaction(async (transaction) => {
        const [
          caseSnapshot,
          personnelSnapshot,
          personnelUserSnapshot,
          dutySnapshot,
        ] = await Promise.all([
          transaction.get(caseRef),
          transaction.get(personnelRef),
          transaction.get(personnelUserRef),
          transaction.get(dutyRef),
        ]);

        if (!caseSnapshot.exists) {
          throw makeHttpError(404, "emergency_case_not_found", "The emergency case no longer exists.");
        }

        if (!personnelSnapshot.exists || !personnelUserSnapshot.exists) {
          throw makeHttpError(404, "lgu_personnel_not_found", "The selected LGU Personnel account was not found.");
        }

        if (!dutySnapshot.exists) {
          throw makeHttpError(
            409,
            "lgu_personnel_not_timed_in",
            "The selected LGU Personnel has no active duty record. They must Time In first.",
          );
        }

        const emergencyCase = caseSnapshot.data() || {};
        const personnel = personnelSnapshot.data() || {};
        const personnelUser = personnelUserSnapshot.data() || {};
        const duty = dutySnapshot.data() || {};

        const caseStatus = cleanText(emergencyCase.status || "", 40).toLowerCase();
        const verificationStatus = cleanText(
          emergencyCase.verificationStatus ||
            (["validated", "assigned", "in_progress"].includes(caseStatus)
              ? "validated"
              : "pending_verification"),
          60,
        ).toLowerCase();

        if (verificationStatus !== "validated") {
          throw makeHttpError(
            409,
            "emergency_not_validated",
            "Validate the emergency report before assigning official LGU Personnel.",
          );
        }

        if (!["validated", "assigned", "in_progress"].includes(caseStatus)) {
          throw makeHttpError(
            409,
            "emergency_not_assignable",
            "This emergency case is not currently eligible for LGU assignment.",
          );
        }

        if (emergencyCase.dispatchBlocked === true) {
          throw makeHttpError(
            409,
            "emergency_dispatch_blocked",
            "LGU dispatch is blocked while this case is awaiting verification or additional evidence.",
          );
        }

        if (
          cleanText(
            emergencyCase.officialLguResponseStatus || "",
            80,
          ).toLowerCase() === "completed_pending_admin_review"
        ) {
          throw makeHttpError(
            409,
            "lgu_field_report_review_required",
            "Review the completed official LGU field report before assigning another official responder.",
          );
        }

        if (cleanText(emergencyCase.reporterUid || "", 160) === personnelUid) {
          throw makeHttpError(
            409,
            "responder_is_reporter",
            "The resident who reported this emergency cannot be assigned as the official LGU responder.",
          );
        }

        if (
          cleanText(personnel.verificationStatus || "", 40).toLowerCase() !== "verified" ||
          cleanText(personnel.employmentStatus || "", 40).toLowerCase() !== "active"
        ) {
          throw makeHttpError(
            409,
            "lgu_personnel_not_verified",
            "Only verified and active LGU Personnel can be assigned.",
          );
        }

        if (!isVerifiedLguPersonnelProfile(personnelUser)) {
          throw makeHttpError(
            409,
            "lgu_account_not_verified",
            "The selected account is not an approved verified LGU Personnel account.",
          );
        }

        const dutyStatus = cleanText(duty.dutyStatus || "", 40).toLowerCase();
        const availabilityStatus = cleanText(duty.availabilityStatus || "", 40).toLowerCase();
        const activeCaseId = cleanText(duty.activeCaseId || "", 160);
        const activeAssignmentId = cleanText(duty.activeAssignmentId || "", 180);

        if (
          dutyStatus !== "on_duty" ||
          availabilityStatus !== "available" ||
          activeCaseId ||
          activeAssignmentId
        ) {
          throw makeHttpError(
            409,
            "lgu_personnel_not_available",
            "The selected LGU Personnel must be On Duty and Available with no active emergency assignment.",
          );
        }

        const currentOfficialUid = cleanText(
          emergencyCase.activeLguResponderUid || "",
          160,
        );

        if (currentOfficialUid) {
          throw makeHttpError(
            409,
            "official_lgu_responder_exists",
            currentOfficialUid === personnelUid
              ? "This LGU Personnel is already the official responder for the case."
              : "This emergency case already has an official LGU responder assigned.",
          );
        }

        const currentPrimaryUid = cleanText(
          emergencyCase.activeResponderUid || "",
          160,
        );
        const currentPrimaryKind = cleanText(
          emergencyCase.activeResponderKind || "",
          80,
        ).toLowerCase();

        if (
          currentPrimaryUid &&
          currentPrimaryUid !== personnelUid &&
          currentPrimaryKind &&
          !["lgu", "official_lgu", "lgu_personnel"].includes(currentPrimaryKind)
        ) {
          throw makeHttpError(
            409,
            "primary_responder_conflict",
            "This case currently has another active primary responder. Clear or finish that response before assigning the official LGU responder.",
          );
        }

        const personnelName =
          cleanText(
            personnel.fullName ||
              personnelUser.fullName ||
              personnelUser.email ||
              "LGU Responder",
            120,
          ) || "LGU Responder";

        const department = cleanText(personnel.department || "", 120);
        const position = cleanText(personnel.position || "", 120);

        if (department.length < 2 || position.length < 2) {
          throw makeHttpError(
            409,
            "lgu_personnel_profile_incomplete",
            "The selected LGU Personnel record is missing a valid department or position.",
          );
        }

        transaction.set(assignmentRef, {
          caseId,
          personnelUid,
          personnelName,
          department,
          position,
          status: "assigned",
          assignedBy: adminUid,
          assignedAt: FieldValue.serverTimestamp(),
          acknowledgedAt: null,
          responseStartedAt: null,
          arrivedAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelledBy: "",
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(dutyRef, {
          availabilityStatus: "assigned",
          activeCaseId: caseId,
          activeAssignmentId: assignmentRef.id,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        });

        const casePatch = {
          activeResponderUid: personnelUid,
          activeResponderName: personnelName,
          activeResponderAssignmentId: assignmentRef.id,
          activeResponderKind: "lgu",
          activeLguResponderUid: personnelUid,
          activeLguResponderName: personnelName,
          activeLguHeartbeatAt: null,
          assignedLguPersonnelIds: FieldValue.arrayUnion(personnelUid),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (caseStatus === "validated") {
          casePatch.status = "assigned";
          casePatch.assignedAt = FieldValue.serverTimestamp();
        }

        transaction.update(caseRef, casePatch);

        transaction.set(personnelNotificationRef, {
          userId: personnelUid,
          audience: "lgu_personnel",
          type: "lgu_response_assignment",
          caseId,
          assignmentId: assignmentRef.id,
          title: "New official emergency assignment",
          message: `You were assigned as the official LGU responder for ${cleanText(
            emergencyCase.title || "an emergency case",
            160,
          )}. Open the LGU Responder Portal to review the assignment.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        const reporterUid = cleanText(emergencyCase.reporterUid || "", 160);
        if (reporterUid) {
          transaction.set(residentNotificationRef, {
            userId: reporterUid,
            audience: "resident",
            type: "official_lgu_assigned",
            caseId,
            assignmentId: assignmentRef.id,
            responderId: personnelUid,
            responderName: personnelName,
            title: "Official LGU responder assigned",
            message: `${personnelName} from ${department} was assigned to your emergency case.`,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.set(activityLogRef, {
          action: "Official LGU Personnel Assigned",
          caseId,
          assignmentId: assignmentRef.id,
          personnelUid,
          personnelName,
          department,
          position,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });

        assignedPersonnel = {
          uid: personnelUid,
          fullName: personnelName,
          department,
          position,
        };
      });

      response.json({
        ok: true,
        assignmentId: assignmentRef.id,
        caseId,
        personnel: assignedPersonnel,
        dutyStatus: "on_duty",
        availabilityStatus: "assigned",
        caseStatus: "assigned",
        message: "Official LGU Personnel assigned successfully.",
      });
    } catch (error) {
      console.error("Official LGU assignment failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "official_lgu_assignment_failed", 120),
        message: cleanText(error?.message || "Unable to assign official LGU Personnel.", 700),
      });
    }
  },
);
app.post(
  "/api/lgu/assignments/:assignmentId/acknowledge",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const assignmentId = cleanText(request.params?.assignmentId || "", 180);

      if (!assignmentId) {
        throw makeHttpError(
          400,
          "assignment_id_required",
          "The LGU assignment ID is required.",
        );
      }

      const assignmentRef = db.collection("lguAssignments").doc(assignmentId);
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const activityLogRef = db.collection("adminActivityLogs").doc();

      let acknowledgedAssignment = null;

      await db.runTransaction(async (transaction) => {
        const [assignmentSnapshot, dutySnapshot] = await Promise.all([
          transaction.get(assignmentRef),
          transaction.get(dutyRef),
        ]);

        if (!assignmentSnapshot.exists) {
          throw makeHttpError(
            404,
            "lgu_assignment_not_found",
            "This LGU assignment no longer exists.",
          );
        }

        if (!dutySnapshot.exists) {
          throw makeHttpError(
            409,
            "lgu_duty_not_found",
            "Your LGU duty record could not be found.",
          );
        }

        const assignment = assignmentSnapshot.data() || {};
        const duty = dutySnapshot.data() || {};

        if (cleanText(assignment.personnelUid || "", 160) !== uid) {
          throw makeHttpError(
            403,
            "lgu_assignment_forbidden",
            "This emergency assignment does not belong to your LGU account.",
          );
        }

        const assignmentStatus = cleanText(
          assignment.status || "",
          40,
        ).toLowerCase();

        if (assignmentStatus !== "assigned") {
          throw makeHttpError(
            409,
            "lgu_assignment_not_acknowledgeable",
            assignmentStatus === "acknowledged"
              ? "This emergency assignment has already been acknowledged."
              : "This emergency assignment already changed. Refresh and check its latest status.",
          );
        }

        if (
          cleanText(duty.dutyStatus || "", 40).toLowerCase() !== "on_duty" ||
          cleanText(duty.availabilityStatus || "", 40).toLowerCase() !== "assigned" ||
          cleanText(duty.activeAssignmentId || "", 180) !== assignmentId ||
          cleanText(duty.activeCaseId || "", 160) !==
            cleanText(assignment.caseId || "", 160)
        ) {
          throw makeHttpError(
            409,
            "lgu_duty_assignment_mismatch",
            "Your active duty record no longer matches this emergency assignment.",
          );
        }

        transaction.update(assignmentRef, {
          status: "acknowledged",
          acknowledgedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.set(activityLogRef, {
          action: "Official LGU Assignment Acknowledged",
          caseId: cleanText(assignment.caseId || "", 160),
          assignmentId,
          personnelUid: uid,
          personnelName: cleanText(assignment.personnelName || "LGU Responder", 120),
          performedBy: uid,
          timestamp: FieldValue.serverTimestamp(),
        });

        acknowledgedAssignment = {
          id: assignmentId,
          caseId: cleanText(assignment.caseId || "", 160),
          personnelUid: uid,
          status: "acknowledged",
        };
      });

      response.json({
        ok: true,
        assignment: acknowledgedAssignment,
        message: "Emergency assignment acknowledged successfully.",
      });
    } catch (error) {
      console.error("LGU acknowledge assignment failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_acknowledge_failed", 120),
        message: cleanText(
          error?.message || "Unable to acknowledge the emergency assignment.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/lgu/assignments/:assignmentId/start-response",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const assignmentId = cleanText(request.params?.assignmentId || "", 180);

      if (!assignmentId) {
        throw makeHttpError(
          400,
          "assignment_id_required",
          "The LGU assignment ID is required.",
        );
      }

      const assignmentRef = db.collection("lguAssignments").doc(assignmentId);
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const residentNotificationRef = db.collection("notifications").doc();
      const activityLogRef = db.collection("adminActivityLogs").doc();

      let responseResult = null;

      await db.runTransaction(async (transaction) => {
        const [assignmentSnapshot, dutySnapshot] = await Promise.all([
          transaction.get(assignmentRef),
          transaction.get(dutyRef),
        ]);

        if (!assignmentSnapshot.exists) {
          throw makeHttpError(
            404,
            "lgu_assignment_not_found",
            "This LGU assignment no longer exists.",
          );
        }

        if (!dutySnapshot.exists) {
          throw makeHttpError(
            409,
            "lgu_duty_not_found",
            "Your LGU duty record could not be found.",
          );
        }

        const assignment = assignmentSnapshot.data() || {};
        const duty = dutySnapshot.data() || {};
        const caseId = cleanText(assignment.caseId || "", 160);

        if (cleanText(assignment.personnelUid || "", 160) !== uid) {
          throw makeHttpError(
            403,
            "lgu_assignment_forbidden",
            "This emergency assignment does not belong to your LGU account.",
          );
        }

        if (!caseId) {
          throw makeHttpError(
            409,
            "lgu_assignment_case_missing",
            "This LGU assignment is not linked to a valid emergency case.",
          );
        }

        const assignmentStatus = cleanText(
          assignment.status || "",
          40,
        ).toLowerCase();

        if (assignmentStatus !== "acknowledged") {
          throw makeHttpError(
            409,
            "lgu_assignment_not_ready_to_respond",
            assignmentStatus === "assigned"
              ? "Acknowledge the emergency assignment before starting the response."
              : assignmentStatus === "responding"
                ? "This emergency response has already started."
                : "This emergency assignment is not ready to start a response.",
          );
        }

        if (
          cleanText(duty.dutyStatus || "", 40).toLowerCase() !== "on_duty" ||
          cleanText(duty.availabilityStatus || "", 40).toLowerCase() !== "assigned" ||
          cleanText(duty.activeAssignmentId || "", 180) !== assignmentId ||
          cleanText(duty.activeCaseId || "", 160) !== caseId
        ) {
          throw makeHttpError(
            409,
            "lgu_duty_assignment_mismatch",
            "Your active duty record no longer matches this emergency assignment.",
          );
        }

        const caseRef = db.collection("disasterCases").doc(caseId);
        const caseSnapshot = await transaction.get(caseRef);

        if (!caseSnapshot.exists) {
          throw makeHttpError(
            404,
            "emergency_case_not_found",
            "The linked emergency case no longer exists.",
          );
        }

        const emergencyCase = caseSnapshot.data() || {};
        const caseStatus = cleanText(
          emergencyCase.status || "",
          40,
        ).toLowerCase();

        if (!["validated", "assigned", "in_progress"].includes(caseStatus)) {
          throw makeHttpError(
            409,
            "emergency_case_not_active",
            "This emergency case is no longer active for official response.",
          );
        }

        if (
          cleanText(emergencyCase.activeLguResponderUid || "", 160) !== uid
        ) {
          throw makeHttpError(
            409,
            "official_lgu_responder_mismatch",
            "You are no longer the active official LGU responder for this case.",
          );
        }

        transaction.update(assignmentRef, {
          status: "responding",
          responseStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(dutyRef, {
          availabilityStatus: "responding",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });

        const casePatch = {
          activeResponderUid: uid,
          activeResponderKind: "lgu",
          activeLguResponderUid: uid,
          activeLguResponderName: cleanText(
            assignment.personnelName || "LGU Responder",
            120,
          ),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (caseStatus !== "in_progress") {
          casePatch.status = "in_progress";
        }

        transaction.update(caseRef, casePatch);

        const reporterUid = cleanText(emergencyCase.reporterUid || "", 160);

        if (reporterUid) {
          transaction.set(residentNotificationRef, {
            userId: reporterUid,
            audience: "resident",
            type: "official_lgu_responding",
            caseId,
            assignmentId,
            responderId: uid,
            responderName: cleanText(
              assignment.personnelName || "LGU Responder",
              120,
            ),
            title: "Official LGU response started",
            message: `${cleanText(
              assignment.personnelName || "Your assigned LGU responder",
              120,
            )} has started responding to your emergency case.`,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.set(activityLogRef, {
          action: "Official LGU Response Started",
          caseId,
          assignmentId,
          personnelUid: uid,
          personnelName: cleanText(
            assignment.personnelName || "LGU Responder",
            120,
          ),
          performedBy: uid,
          timestamp: FieldValue.serverTimestamp(),
        });

        responseResult = {
          id: assignmentId,
          caseId,
          personnelUid: uid,
          status: "responding",
        };
      });

      response.json({
        ok: true,
        assignment: responseResult,
        dutyStatus: "on_duty",
        availabilityStatus: "responding",
        caseStatus: "in_progress",
        message: "Official LGU emergency response started successfully.",
      });
    } catch (error) {
      console.error("LGU start response failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_start_response_failed", 120),
        message: cleanText(
          error?.message || "Unable to start the official LGU emergency response.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/lgu/assignments/:assignmentId/arrive",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const assignmentId = cleanText(request.params?.assignmentId || "", 180);

      if (!assignmentId) {
        throw makeHttpError(
          400,
          "assignment_id_required",
          "The LGU assignment ID is required.",
        );
      }

      const assignmentRef = db.collection("lguAssignments").doc(assignmentId);
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const residentNotificationRef = db.collection("notifications").doc();
      const activityLogRef = db.collection("adminActivityLogs").doc();

      let arrivalResult = null;

      await db.runTransaction(async (transaction) => {
        const [assignmentSnapshot, dutySnapshot] = await Promise.all([
          transaction.get(assignmentRef),
          transaction.get(dutyRef),
        ]);

        if (!assignmentSnapshot.exists) {
          throw makeHttpError(
            404,
            "lgu_assignment_not_found",
            "This LGU assignment no longer exists.",
          );
        }

        if (!dutySnapshot.exists) {
          throw makeHttpError(
            409,
            "lgu_duty_not_found",
            "Your LGU duty record could not be found.",
          );
        }

        const assignment = assignmentSnapshot.data() || {};
        const duty = dutySnapshot.data() || {};
        const caseId = cleanText(assignment.caseId || "", 160);

        if (cleanText(assignment.personnelUid || "", 160) !== uid) {
          throw makeHttpError(
            403,
            "lgu_assignment_forbidden",
            "This emergency assignment does not belong to your LGU account.",
          );
        }

        if (!caseId) {
          throw makeHttpError(
            409,
            "lgu_assignment_case_missing",
            "This LGU assignment is not linked to a valid emergency case.",
          );
        }

        const assignmentStatus = cleanText(
          assignment.status || "",
          40,
        ).toLowerCase();

        if (assignmentStatus !== "responding") {
          throw makeHttpError(
            409,
            "lgu_assignment_not_ready_for_arrival",
            assignmentStatus === "on_site"
              ? "You have already marked this emergency response as On Site."
              : "Start the official response before marking arrival.",
          );
        }

        if (
          cleanText(duty.dutyStatus || "", 40).toLowerCase() !== "on_duty" ||
          cleanText(duty.availabilityStatus || "", 40).toLowerCase() !== "responding" ||
          cleanText(duty.activeAssignmentId || "", 180) !== assignmentId ||
          cleanText(duty.activeCaseId || "", 160) !== caseId
        ) {
          throw makeHttpError(
            409,
            "lgu_duty_assignment_mismatch",
            "Your active duty record no longer matches this responding emergency assignment.",
          );
        }

        const caseRef = db.collection("disasterCases").doc(caseId);
        const caseSnapshot = await transaction.get(caseRef);

        if (!caseSnapshot.exists) {
          throw makeHttpError(
            404,
            "emergency_case_not_found",
            "The linked emergency case no longer exists.",
          );
        }

        const emergencyCase = caseSnapshot.data() || {};
        const caseStatus = cleanText(
          emergencyCase.status || "",
          40,
        ).toLowerCase();

        if (caseStatus !== "in_progress") {
          throw makeHttpError(
            409,
            "emergency_case_not_in_progress",
            "The emergency case must be In Progress before arrival can be recorded.",
          );
        }

        if (
          cleanText(emergencyCase.activeLguResponderUid || "", 160) !== uid
        ) {
          throw makeHttpError(
            409,
            "official_lgu_responder_mismatch",
            "You are no longer the active official LGU responder for this case.",
          );
        }

        transaction.update(assignmentRef, {
          status: "on_site",
          arrivedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(dutyRef, {
          availabilityStatus: "on_site",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });

        transaction.update(caseRef, {
          updatedAt: FieldValue.serverTimestamp(),
        });

        const reporterUid = cleanText(emergencyCase.reporterUid || "", 160);

        if (reporterUid) {
          transaction.set(residentNotificationRef, {
            userId: reporterUid,
            audience: "resident",
            type: "official_lgu_on_site",
            caseId,
            assignmentId,
            responderId: uid,
            responderName: cleanText(
              assignment.personnelName || "LGU Responder",
              120,
            ),
            title: "Official LGU responder arrived",
            message: `${cleanText(
              assignment.personnelName || "Your assigned LGU responder",
              120,
            )} has arrived at the emergency location.`,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.set(activityLogRef, {
          action: "Official LGU Responder Arrived On Site",
          caseId,
          assignmentId,
          personnelUid: uid,
          personnelName: cleanText(
            assignment.personnelName || "LGU Responder",
            120,
          ),
          performedBy: uid,
          timestamp: FieldValue.serverTimestamp(),
        });

        arrivalResult = {
          id: assignmentId,
          caseId,
          personnelUid: uid,
          status: "on_site",
        };
      });

      response.json({
        ok: true,
        assignment: arrivalResult,
        dutyStatus: "on_duty",
        availabilityStatus: "on_site",
        caseStatus: "in_progress",
        message: "Arrival recorded. You are now On Site.",
      });
    } catch (error) {
      console.error("LGU mark arrival failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_arrival_failed", 120),
        message: cleanText(
          error?.message || "Unable to mark the LGU responder as On Site.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/lgu/assignments/:assignmentId/complete",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const assignmentId = cleanText(request.params?.assignmentId || "", 180);
      const situationSummary = cleanText(request.body?.situationSummary || "", 1000);
      const actionsTaken = cleanText(request.body?.actionsTaken || "", 1500);
      const peopleAssistedRaw = Number(request.body?.peopleAssisted);
      const outcome = cleanText(request.body?.outcome || "", 80).toLowerCase();
      const remainingNeeds = cleanText(request.body?.remainingNeeds || "", 1000);
      const notes = cleanText(request.body?.notes || "", 1000);

      const allowedOutcomes = [
        "resolved_on_site",
        "stabilized",
        "referred",
        "needs_follow_up",
      ];

      if (!assignmentId) {
        throw makeHttpError(
          400,
          "assignment_id_required",
          "The LGU assignment ID is required.",
        );
      }

      if (situationSummary.length < 10) {
        throw makeHttpError(
          400,
          "situation_summary_required",
          "Enter a short situation summary of at least 10 characters.",
        );
      }

      if (actionsTaken.length < 10) {
        throw makeHttpError(
          400,
          "actions_taken_required",
          "Describe the response actions taken using at least 10 characters.",
        );
      }

      if (
        !Number.isInteger(peopleAssistedRaw) ||
        peopleAssistedRaw < 0 ||
        peopleAssistedRaw > 999
      ) {
        throw makeHttpError(
          400,
          "people_assisted_invalid",
          "People assisted must be a whole number from 0 to 999.",
        );
      }

      if (!allowedOutcomes.includes(outcome)) {
        throw makeHttpError(
          400,
          "response_outcome_invalid",
          "Select a valid field response outcome.",
        );
      }

      if (
        ["referred", "needs_follow_up"].includes(outcome) &&
        remainingNeeds.length < 3
      ) {
        throw makeHttpError(
          400,
          "remaining_needs_required",
          "Describe the remaining need or referral before completing this response.",
        );
      }

      const assignmentRef = db.collection("lguAssignments").doc(assignmentId);
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const reportRef = db.collection("lguFieldReports").doc(assignmentId);
      const residentNotificationRef = db.collection("notifications").doc();
      const activityLogRef = db.collection("adminActivityLogs").doc();

      let completionResult = null;

      await db.runTransaction(async (transaction) => {
        const [
          assignmentSnapshot,
          dutySnapshot,
          existingReportSnapshot,
        ] = await Promise.all([
          transaction.get(assignmentRef),
          transaction.get(dutyRef),
          transaction.get(reportRef),
        ]);

        if (!assignmentSnapshot.exists) {
          throw makeHttpError(
            404,
            "lgu_assignment_not_found",
            "This LGU assignment no longer exists.",
          );
        }

        if (!dutySnapshot.exists) {
          throw makeHttpError(
            409,
            "lgu_duty_not_found",
            "Your LGU duty record could not be found.",
          );
        }

        const assignment = assignmentSnapshot.data() || {};
        const duty = dutySnapshot.data() || {};
        const caseId = cleanText(assignment.caseId || "", 160);

        if (cleanText(assignment.personnelUid || "", 160) !== uid) {
          throw makeHttpError(
            403,
            "lgu_assignment_forbidden",
            "This emergency assignment does not belong to your LGU account.",
          );
        }

        if (!caseId) {
          throw makeHttpError(
            409,
            "lgu_assignment_case_missing",
            "This LGU assignment is not linked to a valid emergency case.",
          );
        }

        const assignmentStatus = cleanText(
          assignment.status || "",
          40,
        ).toLowerCase();

        if (assignmentStatus !== "on_site") {
          throw makeHttpError(
            409,
            "lgu_assignment_not_ready_for_completion",
            assignmentStatus === "completed"
              ? "This official LGU response has already been completed."
              : "Mark the responder as On Site before submitting the completion report.",
          );
        }

        if (existingReportSnapshot.exists) {
          throw makeHttpError(
            409,
            "lgu_field_report_exists",
            "A field completion report already exists for this assignment.",
          );
        }

        if (
          cleanText(duty.dutyStatus || "", 40).toLowerCase() !== "on_duty" ||
          cleanText(duty.availabilityStatus || "", 40).toLowerCase() !== "on_site" ||
          cleanText(duty.activeAssignmentId || "", 180) !== assignmentId ||
          cleanText(duty.activeCaseId || "", 160) !== caseId
        ) {
          throw makeHttpError(
            409,
            "lgu_duty_assignment_mismatch",
            "Your active duty record no longer matches this On Site emergency assignment.",
          );
        }

        const caseRef = db.collection("disasterCases").doc(caseId);
        const liveLocationRef = db.collection("lguResponseLocations").doc(caseId);
        const caseSnapshot = await transaction.get(caseRef);

        if (!caseSnapshot.exists) {
          throw makeHttpError(
            404,
            "emergency_case_not_found",
            "The linked emergency case no longer exists.",
          );
        }

        const emergencyCase = caseSnapshot.data() || {};
        const caseStatus = cleanText(
          emergencyCase.status || "",
          40,
        ).toLowerCase();

        if (caseStatus !== "in_progress") {
          throw makeHttpError(
            409,
            "emergency_case_not_in_progress",
            "The emergency case is no longer active for LGU field completion.",
          );
        }

        if (
          cleanText(emergencyCase.activeLguResponderUid || "", 160) !== uid
        ) {
          throw makeHttpError(
            409,
            "official_lgu_responder_mismatch",
            "You are no longer the active official LGU responder for this case.",
          );
        }

        const personnelName = cleanText(
          assignment.personnelName || "LGU Responder",
          120,
        );
        const department = cleanText(assignment.department || "", 120);
        const position = cleanText(assignment.position || "", 120);

        transaction.set(reportRef, {
          reportId: assignmentId,
          assignmentId,
          caseId,
          personnelUid: uid,
          personnelName,
          department,
          position,
          caseTitle: cleanText(emergencyCase.title || "Emergency Case", 180),
          caseCategory: cleanText(emergencyCase.category || "Emergency", 120),
          caseSeverity: cleanText(emergencyCase.severity || "", 40),
          responseLocation: cleanText(
            emergencyCase.location || emergencyCase.reporterAddress || "",
            320,
          ),
          situationSummary,
          actionsTaken,
          peopleAssisted: peopleAssistedRaw,
          outcome,
          remainingNeeds,
          notes,
          adminReviewStatus: "pending",
          submittedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(assignmentRef, {
          status: "completed",
          completionReportId: assignmentId,
          completionOutcome: outcome,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(dutyRef, {
          availabilityStatus: "available",
          activeCaseId: "",
          activeAssignmentId: "",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });

        const casePatch = {
          activeLguResponderUid: "",
          activeLguResponderName: "",
          activeLguHeartbeatAt: null,
          officialLguResponseStatus: "completed_pending_admin_review",
          latestLguFieldReportId: assignmentId,
          updatedAt: FieldValue.serverTimestamp(),
        };

        const activeResponderUid = cleanText(
          emergencyCase.activeResponderUid || "",
          160,
        );
        const activeResponderKind = cleanText(
          emergencyCase.activeResponderKind || "",
          80,
        ).toLowerCase();

        if (
          activeResponderUid === uid &&
          ["lgu", "official_lgu", "lgu_personnel"].includes(activeResponderKind)
        ) {
          casePatch.activeResponderUid = "";
          casePatch.activeResponderName = "";
          casePatch.activeResponderAssignmentId = "";
          casePatch.activeResponderKind = "";
        }

        transaction.update(caseRef, casePatch);
        transaction.delete(liveLocationRef);

        const reporterUid = cleanText(emergencyCase.reporterUid || "", 160);

        if (reporterUid) {
          transaction.set(residentNotificationRef, {
            userId: reporterUid,
            audience: "resident",
            type: "official_lgu_field_response_completed",
            caseId,
            assignmentId,
            responderId: uid,
            responderName: personnelName,
            title: "LGU field response completed",
            message:
              "The official LGU responder submitted the field response report. Your emergency case remains under LGU/Admin review.",
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.set(activityLogRef, {
          action: "Official LGU Field Response Completed",
          caseId,
          assignmentId,
          reportId: assignmentId,
          personnelUid: uid,
          personnelName,
          outcome,
          peopleAssisted: peopleAssistedRaw,
          performedBy: uid,
          timestamp: FieldValue.serverTimestamp(),
        });

        completionResult = {
          assignmentId,
          reportId: assignmentId,
          caseId,
          personnelUid: uid,
          status: "completed",
          outcome,
        };
      });

      response.json({
        ok: true,
        completion: completionResult,
        assignmentStatus: "completed",
        dutyStatus: "on_duty",
        availabilityStatus: "available",
        caseStatus: "in_progress",
        adminReviewRequired: true,
        message:
          "Field response completed. The case is now awaiting LGU/Admin review.",
      });
    } catch (error) {
      console.error("LGU complete response failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_complete_response_failed", 120),
        message: cleanText(
          error?.message || "Unable to complete the official LGU field response.",
          700,
        ),
      });
    }
  },
);
app.get(
  "/api/admin/lgu/field-reports",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const caseId = cleanText(request.query?.caseId || "", 160);

      if (!caseId) {
        throw makeHttpError(
          400,
          "case_id_required",
          "The emergency case ID is required.",
        );
      }

      const snapshot = await db
        .collection("lguFieldReports")
        .where("caseId", "==", caseId)
        .get();

      const timestampIso = (value) => {
        try {
          if (!value) return "";
          if (typeof value.toDate === "function") {
            return value.toDate().toISOString();
          }
          if (value instanceof Date) {
            return value.toISOString();
          }
          return "";
        } catch {
          return "";
        }
      };

      const reports = snapshot.docs
        .map((documentSnapshot) => {
          const data = documentSnapshot.data() || {};

          return {
            id: documentSnapshot.id,
            assignmentId: cleanText(
              data.assignmentId || documentSnapshot.id,
              180,
            ),
            caseId: cleanText(data.caseId || "", 160),
            personnelUid: cleanText(data.personnelUid || "", 160),
            personnelName: cleanText(
              data.personnelName || "LGU Responder",
              120,
            ),
            department: cleanText(data.department || "", 120),
            position: cleanText(data.position || "", 120),
            caseTitle: cleanText(data.caseTitle || "Emergency Case", 180),
            caseCategory: cleanText(data.caseCategory || "Emergency", 120),
            caseSeverity: cleanText(data.caseSeverity || "", 40),
            responseLocation: cleanText(data.responseLocation || "", 320),
            situationSummary: cleanText(data.situationSummary || "", 1000),
            actionsTaken: cleanText(data.actionsTaken || "", 1500),
            peopleAssisted: Number(data.peopleAssisted || 0),
            outcome: cleanText(data.outcome || "", 80),
            remainingNeeds: cleanText(data.remainingNeeds || "", 1000),
            notes: cleanText(data.notes || "", 1000),
            adminReviewStatus: cleanText(
              data.adminReviewStatus || "pending",
              40,
            ),
            adminReviewNote: cleanText(
              data.adminReviewNote || "",
              1500,
            ),
            submittedAt: timestampIso(data.submittedAt || data.createdAt),
            reviewedAt: timestampIso(data.reviewedAt),
            reviewedBy: cleanText(data.reviewedBy || "", 160),
          };
        })
        .sort((a, b) => {
          const aTime = a.submittedAt
            ? new Date(a.submittedAt).getTime()
            : 0;
          const bTime = b.submittedAt
            ? new Date(b.submittedAt).getTime()
            : 0;
          return bTime - aTime;
        });

      response.json({
        ok: true,
        caseId,
        reports,
      });
    } catch (error) {
      console.error("Admin LGU field report load failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(
          error?.code || "admin_lgu_field_report_load_failed",
          120,
        ),
        message: cleanText(
          error?.message || "Unable to load official LGU field reports.",
          700,
        ),
      });
    }
  },
);

app.post(
  "/api/admin/lgu/field-reports/:reportId/review",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const reportId = cleanText(request.params?.reportId || "", 180);
      const adminReviewNote = cleanText(
        request.body?.adminReviewNote || "",
        1500,
      );

      if (!reportId) {
        throw makeHttpError(
          400,
          "report_id_required",
          "The official LGU field report ID is required.",
        );
      }

      const reportRef = db.collection("lguFieldReports").doc(reportId);
      const activityLogRef = db.collection("adminActivityLogs").doc();

      let reviewResult = null;

      await db.runTransaction(async (transaction) => {
        const reportSnapshot = await transaction.get(reportRef);

        if (!reportSnapshot.exists) {
          throw makeHttpError(
            404,
            "lgu_field_report_not_found",
            "The official LGU field report no longer exists.",
          );
        }

        const report = reportSnapshot.data() || {};
        const caseId = cleanText(report.caseId || "", 160);

        if (!caseId) {
          throw makeHttpError(
            409,
            "lgu_field_report_case_missing",
            "This LGU field report is not linked to a valid emergency case.",
          );
        }

        const currentReviewStatus = cleanText(
          report.adminReviewStatus || "pending",
          40,
        ).toLowerCase();

        if (currentReviewStatus === "reviewed") {
          throw makeHttpError(
            409,
            "lgu_field_report_already_reviewed",
            "This official LGU field report has already been reviewed.",
          );
        }

        const caseRef = db.collection("disasterCases").doc(caseId);
        const caseSnapshot = await transaction.get(caseRef);

        if (!caseSnapshot.exists) {
          throw makeHttpError(
            404,
            "emergency_case_not_found",
            "The linked emergency case no longer exists.",
          );
        }

        const emergencyCase = caseSnapshot.data() || {};
        const latestReportId = cleanText(
          emergencyCase.latestLguFieldReportId || "",
          180,
        );

        if (latestReportId && latestReportId !== reportId) {
          throw makeHttpError(
            409,
            "newer_lgu_field_report_exists",
            "A newer official LGU field report exists for this case. Review the latest report instead.",
          );
        }

        transaction.update(reportRef, {
          adminReviewStatus: "reviewed",
          adminReviewNote,
          reviewedAt: FieldValue.serverTimestamp(),
          reviewedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(caseRef, {
          officialLguResponseStatus: "reviewed",
          latestLguFieldReportId: reportId,
          lguFieldReportReviewedAt: FieldValue.serverTimestamp(),
          lguFieldReportReviewedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.set(activityLogRef, {
          action: "Official LGU Field Report Reviewed",
          caseId,
          assignmentId: cleanText(report.assignmentId || reportId, 180),
          reportId,
          personnelUid: cleanText(report.personnelUid || "", 160),
          personnelName: cleanText(
            report.personnelName || "LGU Responder",
            120,
          ),
          adminReviewNote,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });

        reviewResult = {
          reportId,
          caseId,
          status: "reviewed",
        };
      });

      response.json({
        ok: true,
        review: reviewResult,
        message:
          "Official LGU field report reviewed. The Admin may now decide whether to resolve the emergency or continue follow-up.",
      });
    } catch (error) {
      console.error("Admin LGU field report review failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(
          error?.code || "admin_lgu_field_report_review_failed",
          120,
        ),
        message: cleanText(
          error?.message || "Unable to review the official LGU field report.",
          700,
        ),
      });
    }
  },
);
app.get(
  "/api/lgu/me",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const dutySnapshot = await db.collection("lguDutyStatus").doc(uid).get();
      const duty = dutySnapshot.exists ? dutySnapshot.data() || {} : {};
      const personnel = request.lguPersonnelRecord || {};
      response.json({
        ok: true,
        personnel: {
          uid,
          fullName: cleanText(personnel.fullName || request.volunServeProfile?.fullName || "", 120),
          email: cleanText(personnel.email || request.volunServeProfile?.email || "", 160),
          department: cleanText(personnel.department || "", 120),
          position: cleanText(personnel.position || "", 120),
          employeeId: cleanText(personnel.employeeId || "", 80),
          capabilities: Array.isArray(personnel.capabilities) ? personnel.capabilities : [],
          isTestAccount: personnel.isTestAccount === true,
        },
        duty: {
          dutyStatus: cleanText(duty.dutyStatus || "off_duty", 40),
          availabilityStatus: cleanText(duty.availabilityStatus || "unavailable", 40),
          activeCaseId: cleanText(duty.activeCaseId || "", 160),
          activeAssignmentId: cleanText(duty.activeAssignmentId || "", 180),
          shiftDate: cleanText(duty.shiftDate || "", 20),
        },
      });
    } catch (error) {
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_profile_load_failed", 120),
        message: cleanText(error?.message || "Unable to load the LGU Personnel profile.", 700),
      });
    }
  },
);
app.post(
  "/api/lgu/duty/time-in",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const personnel = request.lguPersonnelRecord || {};
      const shiftDate = getManilaDateKey();
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      const attendanceRef = db.collection("lguAttendance").doc(`${uid}_${shiftDate}`);
      await db.runTransaction(async (transaction) => {
        const [dutySnapshot, attendanceSnapshot] = await Promise.all([
          transaction.get(dutyRef),
          transaction.get(attendanceRef),
        ]);
        const duty = dutySnapshot.exists ? dutySnapshot.data() || {} : {};
        if (cleanText(duty.dutyStatus || "off_duty", 40) === "on_duty") {
          throw makeHttpError(409, "already_on_duty", "You are already timed in for LGU duty.");
        }
        if (["assigned", "responding", "on_site"].includes(cleanText(duty.availabilityStatus || "", 40))) {
          throw makeHttpError(409, "active_lgu_assignment", "You cannot Time In while an emergency assignment is still active.");
        }
        if (attendanceSnapshot.exists) {
          throw makeHttpError(409, "attendance_already_recorded", "Today already has an LGU attendance record for this account.");
        }
        transaction.set(dutyRef, {
          uid,
          dutyStatus: "on_duty",
          availabilityStatus: "available",
          activeCaseId: "",
          activeAssignmentId: "",
          shiftDate,
          timeInAt: FieldValue.serverTimestamp(),
          timeOutAt: null,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
        transaction.set(attendanceRef, {
          uid,
          fullName: cleanText(personnel.fullName || "", 120),
          department: cleanText(personnel.department || "", 120),
          position: cleanText(personnel.position || "", 120),
          shiftDate,
          status: "on_duty",
          timeInAt: FieldValue.serverTimestamp(),
          timeOutAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      response.json({
        ok: true,
        dutyStatus: "on_duty",
        availabilityStatus: "available",
        shiftDate,
      });
    } catch (error) {
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_time_in_failed", 120),
        message: cleanText(error?.message || "Unable to Time In for LGU duty.", 700),
      });
    }
  },
);
app.post(
  "/api/lgu/duty/time-out",
  requireFirebaseUser,
  requireVerifiedLguPersonnel,
  async (request, response) => {
    try {
      const uid = request.firebaseUser.uid;
      const dutyRef = db.collection("lguDutyStatus").doc(uid);
      let completedShiftDate = "";
      await db.runTransaction(async (transaction) => {
        const dutySnapshot = await transaction.get(dutyRef);
        if (!dutySnapshot.exists) {
          throw makeHttpError(409, "not_on_duty", "Time In before attempting to Time Out.");
        }
        const duty = dutySnapshot.data() || {};
        const dutyStatus = cleanText(duty.dutyStatus || "", 40);
        const availabilityStatus = cleanText(duty.availabilityStatus || "", 40);
        const shiftDate = cleanText(duty.shiftDate || "", 20);
        if (dutyStatus !== "on_duty") {
          throw makeHttpError(409, "not_on_duty", "This LGU Personnel account is not currently on duty.");
        }
        if (availabilityStatus !== "available") {
          throw makeHttpError(409, "active_lgu_assignment", "Complete or release the active emergency assignment before Time Out.");
        }
        if (!shiftDate) {
          throw makeHttpError(409, "attendance_shift_missing", "The active LGU duty record is missing its shift date.");
        }
        const attendanceRef = db.collection("lguAttendance").doc(`${uid}_${shiftDate}`);
        const attendanceSnapshot = await transaction.get(attendanceRef);
        if (!attendanceSnapshot.exists) {
          throw makeHttpError(409, "attendance_record_missing", "The active LGU attendance record was not found.");
        }
        completedShiftDate = shiftDate;
        transaction.update(dutyRef, {
          dutyStatus: "off_duty",
          availabilityStatus: "unavailable",
          activeCaseId: "",
          activeAssignmentId: "",
          timeOutAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
        transaction.update(attendanceRef, {
          status: "completed",
          timeOutAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      response.json({
        ok: true,
        dutyStatus: "off_duty",
        availabilityStatus: "unavailable",
        shiftDate: completedShiftDate,
      });
    } catch (error) {
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "lgu_time_out_failed", 120),
        message: cleanText(error?.message || "Unable to Time Out from LGU duty.", 700),
      });
    }
  },
);
async function uploadAssistanceEvidenceToCloudinary({
  buffer,
  mimeType,
  extension,
  uid,
}) {
  configureCloudinary();
  if (
    !Buffer.isBuffer(
      buffer,
    ) ||
    buffer.length === 0
  ) {
    throw makeHttpError(
      400,
      "evidence_file_required",
      "A valid evidence image is required.",
    );
  }
  const uniqueId =
    typeof crypto.randomUUID ===
    "function"
      ? crypto.randomUUID()
      : crypto
          .randomBytes(18)
          .toString(
            "hex",
          );
  const publicId =
    `volunserve/assistance-evidence/${uid}/${uniqueId}`;
  try {
    const result =
      await new Promise(
        (
          resolve,
          reject,
        ) => {
          const uploadStream =
            cloudinary
              .uploader
              .upload_stream(
                {
                  resource_type:
                    "image",
                  type:
                    "authenticated",
                  public_id:
                    publicId,
                  overwrite:
                    false,
                  unique_filename:
                    false,
                  use_filename:
                    false,
                },
                (
                  error,
                  uploadResult,
                ) => {
                  if (
                    error
                  ) {
                    reject(
                      error,
                    );
                    return;
                  }
                  resolve(
                    uploadResult,
                  );
                },
              );
          uploadStream.on(
            "error",
            reject,
          );
          uploadStream.end(
            buffer,
          );
        },
      );
    if (
      !result?.asset_id ||
      !result?.public_id
    ) {
      throw makeHttpError(
        502,
        "secure_cloudinary_upload_failed",
        "Cloudinary did not return a complete secure upload result.",
      );
    }
    return result;
  } catch (error) {
    if (
      error?.code ===
      "secure_cloudinary_upload_failed"
    ) {
      throw error;
    }
    const statusCode =
      Number(
        error?.http_code ||
          error?.statusCode ||
          error?.status ||
          502,
      );
    throw makeHttpError(
      statusCode >= 400 &&
        statusCode <= 599
        ? statusCode
        : 502,
      "secure_cloudinary_upload_failed",
      cleanText(
        error?.message ||
          "Cloudinary could not securely store the assistance evidence.",
        500,
      ),
    );
  }
}
async function uploadAssistancePublicPhotoToCloudinary({
  buffer,
  uid,
}) {
  configureCloudinary();
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0
  ) {
    throw makeHttpError(
      400,
      "public_photo_file_required",
      "A valid public campaign photo is required.",
    );
  }
  const uniqueId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(18).toString("hex");
  const publicId =
    `volunserve/public-campaign-photos/${uid}/${uniqueId}`;
  try {
    const result = await new Promise(
      (resolve, reject) => {
        const uploadStream =
          cloudinary.uploader.upload_stream(
            {
              resource_type: "image",
              type: "upload",
              public_id: publicId,
              overwrite: false,
              unique_filename: false,
              use_filename: false,
            },
            (error, uploadResult) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(uploadResult);
            },
          );
        uploadStream.on("error", reject);
        uploadStream.end(buffer);
      },
    );
    if (
      !result?.asset_id ||
      !result?.public_id ||
      typeof result?.secure_url !== "string"
    ) {
      throw makeHttpError(
        502,
        "public_photo_upload_failed",
        "Cloudinary did not return a complete public photo upload result.",
      );
    }
    return result;
  } catch (error) {
    if (error?.code === "public_photo_upload_failed") {
      throw error;
    }
    const statusCode =
      Number(
        error?.http_code ||
          error?.statusCode ||
          error?.status ||
          502,
      );
    throw makeHttpError(
      statusCode >= 400 && statusCode <= 599
        ? statusCode
        : 502,
      "public_photo_upload_failed",
      cleanText(
        error?.message ||
          "Cloudinary could not store the public campaign photo.",
        500,
      ),
    );
  }
}
function createCloudinaryPrivateDownloadUrl({
  publicId,
  format,
  resourceType = "image",
  deliveryType = "authenticated",
}) {
  configureCloudinary();
  const safePublicId =
    cleanText(
      publicId,
      500,
    );
  const safeFormat =
    cleanText(
      format,
      30,
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        "",
      );
  const safeResourceType =
    cleanText(
      resourceType,
      30,
    ).toLowerCase();
  const safeDeliveryType =
    cleanText(
      deliveryType,
      40,
    ).toLowerCase();
  if (
    !safePublicId ||
    !safeFormat
  ) {
    throw makeHttpError(
      409,
      "evidence_storage_reference_missing",
      "This evidence record is missing the protected Cloudinary public ID or format.",
    );
  }
  if (
    safeResourceType !==
    "image"
  ) {
    throw makeHttpError(
      409,
      "unsupported_evidence_resource_type",
      "This assistance evidence resource type is not supported.",
    );
  }
  if (
    safeDeliveryType !==
    "authenticated"
  ) {
    throw makeHttpError(
      409,
      "evidence_not_protected",
      "This assistance evidence is not stored using authenticated Cloudinary delivery.",
    );
  }
  const expiresAt =
    Math.floor(
      Date.now() /
        1000,
    ) +
    ASSISTANCE_EVIDENCE_URL_TTL_SECONDS;
  try {
    const url =
      cloudinary
        .utils
        .private_download_url(
          safePublicId,
          safeFormat,
          {
            resource_type:
              safeResourceType,
            type:
              safeDeliveryType,
            expires_at:
              expiresAt,
          },
        );
    return {
      url,
      expiresAt,
    };
  } catch (error) {
    throw makeHttpError(
      502,
      "secure_cloudinary_access_url_failed",
      cleanText(
        error?.message ||
          "Cloudinary could not create a temporary private evidence URL.",
        500,
      ),
    );
  }
}
async function destroyAssistanceEvidenceFromCloudinary(
  publicId,
) {
  configureCloudinary();
  const safePublicId =
    cleanText(
      publicId,
      500,
    );
  if (
    !safePublicId
  ) {
    return {
      result:
        "not found",
    };
  }
  try {
    const result =
      await cloudinary
        .uploader
        .destroy(
          safePublicId,
          {
            resource_type:
              "image",
            type:
              "authenticated",
            invalidate:
              true,
          },
        );
    if (
      result?.result !==
        "ok" &&
      result?.result !==
        "not found"
    ) {
      throw makeHttpError(
        502,
        "secure_cloudinary_delete_failed",
        "Cloudinary could not delete the staged evidence.",
      );
    }
    return result;
  } catch (error) {
    if (
      error?.code ===
      "secure_cloudinary_delete_failed"
    ) {
      throw error;
    }
    const statusCode =
      Number(
        error?.http_code ||
          error?.statusCode ||
          error?.status ||
          502,
      );
    throw makeHttpError(
      statusCode >= 400 &&
        statusCode <= 599
        ? statusCode
        : 502,
      "secure_cloudinary_delete_failed",
      cleanText(
        error?.message ||
          "Cloudinary could not delete the staged evidence.",
        500,
      ),
    );
  }
}
async function destroyAssistancePublicPhotoFromCloudinary(
  publicId,
) {
  configureCloudinary();
  const safePublicId = cleanText(
    publicId,
    500,
  );
  if (!safePublicId) {
    return {
      result: "not found",
    };
  }
  try {
    const result =
      await cloudinary.uploader.destroy(
        safePublicId,
        {
          resource_type: "image",
          type: "upload",
          invalidate: true,
        },
      );
    if (
      result?.result !== "ok" &&
      result?.result !== "not found"
    ) {
      throw makeHttpError(
        502,
        "public_photo_delete_failed",
        "Cloudinary could not delete the staged public campaign photo.",
      );
    }
    return result;
  } catch (error) {
    if (
      error?.code ===
      "public_photo_delete_failed"
    ) {
      throw error;
    }
    const statusCode =
      Number(
        error?.http_code ||
          error?.statusCode ||
          error?.status ||
          502,
      );
    throw makeHttpError(
      statusCode >= 400 &&
        statusCode <= 599
        ? statusCode
        : 502,
      "public_photo_delete_failed",
      cleanText(
        error?.message ||
          "Cloudinary could not delete the staged public campaign photo.",
        500,
      ),
    );
  }
}
async function getEvidenceAccessContext(
  uid,
  evidenceData,
) {
  if (
    evidenceData?.ownerUid ===
    uid
  ) {
    return {
      owner:
        true,
      admin:
        false,
    };
  }
  const profile =
    await loadUserProfile(
      uid,
    );
  if (
    isOperationalAdminProfile(
      profile,
    )
  ) {
    return {
      owner:
        false,
      admin:
        true,
    };
  }
  throw makeHttpError(
    403,
    "evidence_access_denied",
    "You are not authorized to access this private assistance evidence.",
  );
}
function getIdentityAiEndpoint() {
  const configured =
    cleanText(
      process.env
        .IDENTITY_AI_SERVICE_URL ||
        "",
      1000,
    );
  if (!configured) {
    return "";
  }
  const baseUrl =
    configured.replace(
      /\/+$/,
      "",
    );
  if (
    baseUrl.endsWith(
      "/verify",
    )
  ) {
    return baseUrl;
  }
  return `${baseUrl}/verify`;
}
function getIdentityAiHeaders(
  request,
) {
  const headers = {
    "Content-Type":
      request.headers[
        "content-type"
      ],
    "X-VolunServe-User-Id":
      request
        .firebaseUser
        .uid,
  };
  const internalKey =
    String(
      process.env
        .IDENTITY_AI_INTERNAL_KEY ||
        "",
    ).trim();
  if (
    internalKey
  ) {
    headers[
      "X-VolunServe-Internal-Key"
    ] =
      internalKey;
  }
  return headers;
}
async function readJsonResponse(
  response,
) {
  const text =
    await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(
      text,
    );
  } catch {
    return {
      message:
        cleanText(
          text,
          500,
        ),
    };
  }
}
async function callIdentityAiService(
  request,
) {
  const endpoint =
    getIdentityAiEndpoint();
  if (!endpoint) {
    const error =
      new Error(
        "The VolunServe AI identity service is not configured yet.",
      );
    error.code =
      "identity_ai_not_configured";
    error.statusCode =
      503;
    throw error;
  }
  if (
    !Buffer.isBuffer(
      request.body,
    ) ||
    request.body.length ===
      0
  ) {
    const error =
      new Error(
        "Government ID and selfie files are required.",
      );
    error.code =
      "missing_identity_media";
    error.statusCode =
      400;
    throw error;
  }
  const contentType =
    String(
      request.headers[
        "content-type"
      ] || "",
    ).toLowerCase();
  if (
    !contentType.startsWith(
      "multipart/form-data",
    )
  ) {
    const error =
      new Error(
        "Identity verification must be submitted as multipart form data.",
      );
    error.code =
      "invalid_content_type";
    error.statusCode =
      415;
    throw error;
  }
  if (
    typeof fetch !==
    "function"
  ) {
    const error =
      new Error(
        "This backend runtime does not provide the fetch API required by the AI verification proxy.",
      );
    error.code =
      "fetch_unavailable";
    error.statusCode =
      500;
    throw error;
  }
  const aiResponse =
    await fetch(
      endpoint,
      {
        method:
          "POST",
        headers:
          getIdentityAiHeaders(
            request,
          ),
        body:
          request.body,
      },
    );
  const body =
    await readJsonResponse(
      aiResponse,
    );
  if (
    !aiResponse.ok
  ) {
    const error =
      new Error(
        cleanText(
          body?.message ||
            body?.detail ||
            body?.error ||
            "The VolunServe AI identity service could not process the submission.",
          500,
        ),
      );
    error.code =
      cleanText(
        body?.error ||
          "identity_ai_failed",
        100,
      );
    error.statusCode =
      aiResponse.status >=
        400 &&
      aiResponse.status <=
        599
        ? aiResponse.status
        : 502;
    throw error;
  }
  return body;
}
function diditCleanupFields() {
  return {
    provider:
      FieldValue.delete(),
    providerStatus:
      FieldValue.delete(),
    sessionId:
      FieldValue.delete(),
    sessionNumber:
      FieldValue.delete(),
    workflowId:
      FieldValue.delete(),
    workflowVersion:
      FieldValue.delete(),
    lastEventId:
      FieldValue.delete(),
    webhookType:
      FieldValue.delete(),
    environment:
      FieldValue.delete(),
    lastWebhookAt:
      FieldValue.delete(),
    sessionRequestedAt:
      FieldValue.delete(),
  };
}
app.get(
  "/health",
  (
    request,
    response,
  ) => {
    response.json({
      ok:
        true,
      service:
        "volunserve-backend",
      identityEngine:
        getIdentityAiEndpoint()
          ? "volunserve_ai_configured"
          : "volunserve_ai_not_configured",
      assistanceEvidenceStorage:
        process.env
          .CLOUDINARY_API_KEY &&
        process.env
          .CLOUDINARY_API_SECRET
          ? "secure_cloudinary_configured"
          : "secure_cloudinary_not_configured",
      assistanceEvidenceViewer:
        "time_limited_private_download_v1",
      paymongoMode:
        paymongoMode(),
      paymongoCheckout:
        getPaymongoSecretKey()
          ? "configured"
          : "not_configured",
      paymongoWebhook:
        getPaymongoWebhookSecret()
          ? "configured"
          : "not_configured",
      time:
        new Date()
          .toISOString(),
    });
  },
);
app.get(
  "/api/identity/status",
  requireFirebaseUser,
  async (
    request,
    response,
  ) => {
    try {
      const uid =
        request
          .firebaseUser
          .uid;
      const [
        userSnapshot,
        verificationSnapshot,
      ] =
        await Promise.all([
          db
            .collection(
              "users",
            )
            .doc(
              uid,
            )
            .get(),
          db
            .collection(
              "identityVerifications",
            )
            .doc(
              uid,
            )
            .get(),
        ]);
      if (
        !userSnapshot.exists
      ) {
        response
          .status(
            404,
          )
          .json({
            error:
              "profile_not_found",
            message:
              "Your VolunServe profile was not found.",
          });
        return;
      }
      const profile =
        userSnapshot.data() ||
        {};
      const verification =
        verificationSnapshot.exists
          ? verificationSnapshot.data() ||
            {}
          : {};
      const identityStatus =
        normalizeIdentityStatus(
          profile
            .identityStatus ||
            verification.status ||
            "basic",
        );
      response.json({
        ok:
          true,
        identityStatus,
        identityVerified:
          profile
            .identityVerified ===
            true ||
          identityStatus ===
            "verified",
        verificationId:
          cleanText(
            verification
              .verificationId ||
              "",
            200,
          ),
        decision:
          cleanText(
            verification
              .aiDecision ||
              verification
                .decision ||
              "",
            80,
          ),
        matchScore:
          numberOrNull(
            verification
              .matchScore,
          ),
        livenessScore:
          numberOrNull(
            verification
              .livenessScore,
          ),
        message:
          cleanText(
            verification
              .message ||
              "",
            500,
          ),
      });
    } catch (error) {
      console.error(
        "Identity status failed:",
        error,
      );
      response
        .status(500)
        .json({
          error:
            "status_failed",
          message:
            "Unable to load identity verification status.",
        });
    }
  },
);
app.post(
  "/api/identity/verify",
  requireFirebaseUser,
  express.raw({
    type:
      "multipart/form-data",
    limit:
      IDENTITY_UPLOAD_LIMIT,
  }),
  async (
    request,
    response,
  ) => {
    const uid =
      request
        .firebaseUser
        .uid;
    try {
      const userRef =
        db
          .collection(
            "users",
          )
          .doc(
            uid,
          );
      const verificationRef =
        db
          .collection(
            "identityVerifications",
          )
          .doc(
            uid,
          );
      const [
        userSnapshot,
        verificationSnapshot,
      ] =
        await Promise.all([
          userRef.get(),
          verificationRef.get(),
        ]);
      if (
        !userSnapshot.exists
      ) {
        response
          .status(
            404,
          )
          .json({
            error:
              "profile_not_found",
            message:
              "Your VolunServe profile was not found.",
          });
        return;
      }
      const profile =
        userSnapshot.data() ||
        {};
      const accountStatus =
        cleanText(
          profile.status ||
            "approved",
          40,
        ).toLowerCase();
      if (
        accountStatus !==
        "approved"
      ) {
        response
          .status(
            403,
          )
          .json({
            error:
              "account_not_active",
            message:
              "This VolunServe account is not active.",
          });
        return;
      }
      const currentIdentityStatus =
        normalizeIdentityStatus(
          profile
            .identityStatus ||
            "basic",
        );
      if (
        profile
          .identityVerified ===
          true ||
        currentIdentityStatus ===
          "verified"
      ) {
        response
          .status(
            409,
          )
          .json({
            error:
              "already_verified",
            message:
              "Your identity is already verified.",
          });
        return;
      }
      const verificationData =
        verificationSnapshot.exists
          ? verificationSnapshot.data() ||
            {}
          : {};
      const lastSubmissionTime =
        verificationData
          .lastSubmissionAt
          ?.toMillis?.() ||
        0;
      if (
        Date.now() -
          lastSubmissionTime <
        IDENTITY_RETRY_DELAY_MS
      ) {
        response
          .status(
            429,
          )
          .json({
            error:
              "too_many_requests",
            message:
              "Please wait a few seconds before submitting another identity verification.",
          });
        return;
      }
      const aiResult =
        await callIdentityAiService(
          request,
        );
      const decision =
        normalizeAiDecision(
          aiResult?.decision ||
            aiResult?.status,
        );
      const matchScore =
        numberOrNull(
          aiResult
            ?.matchScore,
        );
      const livenessScore =
        numberOrNull(
          aiResult
            ?.livenessScore,
        );
      const verificationId =
        cleanText(
          aiResult
            ?.verificationId ||
            `identity_${uid}_${Date.now()}`,
          200,
        );
      const resultMessage =
        cleanText(
          aiResult?.message ||
            (
              decision ===
              "verified"
                ? "Identity verification completed successfully."
                : "The submission requires LGU/Admin manual review."
            ),
          500,
        );
      const batch =
        db.batch();
      batch.set(
        verificationRef,
        {
          ...diditCleanupFields(),
          uid,
          verificationId,
          verificationMethod:
            "volunserve_ai",
          status:
            decision ===
            "verified"
              ? "verified"
              : "pending",
          aiDecision:
            decision,
          matchScore,
          livenessScore,
          message:
            resultMessage,
          requiresManualReview:
            decision !==
            "verified",
          lastSubmissionAt:
            FieldValue
              .serverTimestamp(),
          updatedAt:
            FieldValue
              .serverTimestamp(),
          createdAt:
            verificationData
              .createdAt ||
            FieldValue
              .serverTimestamp(),
        },
        {
          merge:
            true,
        },
      );
      if (
        decision ===
        "verified"
      ) {
        batch.set(
          userRef,
          {
            identityStatus:
              "verified",
            identityVerified:
              true,
            identityVerificationProvider:
              FieldValue.delete(),
            identityVerificationSessionId:
              FieldValue.delete(),
            identityVerificationMethod:
              "volunserve_ai",
            identityVerificationStartedAt:
              FieldValue
                .serverTimestamp(),
            identityVerifiedAt:
              FieldValue
                .serverTimestamp(),
            identityVerifiedBy:
              "volunserve_ai",
            identityFailureReason:
              FieldValue.delete(),
            updatedAt:
              FieldValue
                .serverTimestamp(),
          },
          {
            merge:
              true,
          },
        );
      } else {
        batch.set(
          userRef,
          {
            identityStatus:
              "pending",
            identityVerified:
              false,
            identityVerificationProvider:
              FieldValue.delete(),
            identityVerificationSessionId:
              FieldValue.delete(),
            identityVerificationMethod:
              "volunserve_ai",
            identityVerificationStartedAt:
              FieldValue
                .serverTimestamp(),
            identityFailureReason:
              FieldValue.delete(),
            updatedAt:
              FieldValue
                .serverTimestamp(),
          },
          {
            merge:
              true,
          },
        );
      }
      await batch.commit();
      response
        .status(
          200,
        )
        .json({
          ok:
            true,
          status:
            decision ===
            "verified"
              ? "verified"
              : "pending",
          verificationId,
          decision,
          matchScore,
          livenessScore,
          message:
            resultMessage,
        });
    } catch (error) {
      console.error(
        "Identity verification failed:",
        error,
      );
      const statusCode =
        Number(
          error
            ?.statusCode,
        );
      response
        .status(
          statusCode >= 400 &&
          statusCode <= 599
            ? statusCode
            : 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "identity_verification_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to process identity verification.",
              500,
            ),
        });
    }
  },
);
app.post(
  "/api/admin/assistance/requests/:requestId/start-review",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (
    request,
    response,
  ) => {
    try {
      const adminUid =
        request
          .firebaseUser
          .uid;
      const requestId =
        cleanText(
          request.params
            ?.requestId ||
            "",
          120,
        );
      if (
        !requestId ||
        !/^[A-Za-z0-9_-]{10,120}$/.test(
          requestId,
        )
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_request_id",
          "The Request Assistance ID is invalid.",
        );
      }
      const assistanceRef =
        db
          .collection(
            "assistanceRequests",
          )
          .doc(
            requestId,
          );
      const reviewRef =
        db
          .collection(
            "assistanceVerificationReviews",
          )
          .doc(
            requestId,
          );
      const result =
        await db
          .runTransaction(
            async (
              transaction,
            ) => {
              const [
                assistanceSnapshot,
                reviewSnapshot,
              ] =
                await Promise.all([
                  transaction.get(
                    assistanceRef,
                  ),
                  transaction.get(
                    reviewRef,
                  ),
                ]);
              if (
                !assistanceSnapshot
                  .exists
              ) {
                throw makeHttpError(
                  404,
                  "assistance_request_not_found",
                  "The Assistance Request was not found.",
                );
              }
              const assistanceData =
                assistanceSnapshot
                  .data() ||
                {};
              const currentStatus =
                cleanText(
                  assistanceData
                    .status ||
                    "pending",
                  40,
                ).toLowerCase();
              const currentVerificationStatus =
                cleanText(
                  assistanceData
                    .verificationStatus ||
                    "pending_review",
                  40,
                ).toLowerCase();
              if (
                ![
                  "pending",
                  "under_review",
                ].includes(
                  currentStatus,
                ) ||
                ![
                  "pending_review",
                  "under_review",
                ].includes(
                  currentVerificationStatus,
                )
              ) {
                throw makeHttpError(
                  409,
                  "assistance_review_cannot_start",
                  "This Assistance Request is no longer eligible to start a new LGU review.",
                );
              }
              const requesterUid =
                cleanText(
                  assistanceData
                    .requesterUid ||
                    "",
                  200,
                );
              const category =
                cleanText(
                  assistanceData
                    .category ||
                    "",
                  80,
                )
                  .toLowerCase()
                  .replace(
                    /[^a-z0-9_]/g,
                    "",
                  );
              if (
                !requesterUid ||
                !ASSISTANCE_REQUEST_CATEGORY_CONFIG[
                  category
                ]
              ) {
                throw makeHttpError(
                  409,
                  "assistance_request_invalid_for_review",
                  "This Assistance Request is missing required review data.",
                );
              }
              let alreadyCreated =
                false;
              if (
                reviewSnapshot
                  .exists
              ) {
                const existingReview =
                  reviewSnapshot
                    .data() ||
                  {};
                const sameRequest =
                  cleanText(
                    existingReview
                      .requestId ||
                      "",
                    120,
                  ) ===
                    requestId &&
                  cleanText(
                    existingReview
                      .requesterUid ||
                      "",
                    200,
                  ) ===
                    requesterUid &&
                  cleanText(
                    existingReview
                      .category ||
                      "",
                    80,
                  ) ===
                    category;
                const reviewStillOpen =
                  cleanText(
                    existingReview
                      .reviewStatus ||
                      "",
                    60,
                  ) ===
                    "in_progress" &&
                  cleanText(
                    existingReview
                      .finalDecision ||
                      "",
                    60,
                  ) ===
                    "pending";
                if (
                  !sameRequest ||
                  !reviewStillOpen
                ) {
                  throw makeHttpError(
                    409,
                    "assistance_review_conflict",
                    "A protected review record already exists and cannot be restarted.",
                  );
                }
                alreadyCreated =
                  true;
              } else {
                const facilityRequired =
                  [
                    "medical_health",
                    "surgery_treatment",
                    "cancer_serious_illness",
                    "animal_pet_welfare",
                  ].includes(
                    category,
                  );
                const residentEstimatedAmount =
                  Number(
                    assistanceData
                      .estimatedAmount ||
                      0,
                  );
                const costRequired =
                  Number.isFinite(
                    residentEstimatedAmount,
                  ) &&
                  residentEstimatedAmount >
                    0;
                transaction.set(
                  reviewRef,
                  {
                    requestId,
                    requesterUid,
                    category,
                    reviewStatus:
                      "in_progress",
                    documentConsistencyStatus:
                      "pending",
                    documentConsistencyNotes:
                      "",
                    duplicateCheckStatus:
                      "pending",
                    duplicateRequestIds:
                      [],
                    duplicateCheckNotes:
                      "",
                    beneficiaryCheckStatus:
                      "pending",
                    beneficiaryCheckNotes:
                      "",
                    facilityVerificationRequired:
                      facilityRequired,
                    facilityVerificationStatus:
                      facilityRequired
                        ? "pending"
                        : "not_required",
                    facilityName:
                      "",
                    facilityType:
                      "",
                    facilityDepartment:
                      "",
                    professionalName:
                      "",
                    facilityReferenceNumber:
                      "",
                    facilityVerificationMethod:
                      "not_applicable",
                    facilityVerifiedWith:
                      "",
                    facilityVerifiedAt:
                      null,
                    facilityNotes:
                      "",
                    costVerificationRequired:
                      costRequired,
                    residentEstimatedAmount:
                      Number.isFinite(
                        residentEstimatedAmount,
                      )
                        ? Math.max(
                            0,
                            residentEstimatedAmount,
                          )
                        : 0,
                    verifiedGrossCost:
                      0,
                    confirmedExistingAssistanceAmount:
                      0,
                    verifiedUncoveredAmount:
                      0,
                    costVerificationStatus:
                      costRequired
                        ? "pending"
                        : "not_required",
                    costReferenceNumber:
                      "",
                    costNotes:
                      "",
                    residencyVerificationStatus:
                      "pending",
                    residencyVerificationMethod:
                      "profile_address",
                    privateAddressSnapshot:
                      cleanText(
                        assistanceData
                          .requesterAddress ||
                          "",
                        300,
                      ),
                    privateLatitude:
                      null,
                    privateLongitude:
                      null,
                    locationVerifiedAt:
                      null,
                    locationVerifiedBy:
                      "",
                    residencyNotes:
                      "",
                    videoVerificationRequired:
                      false,
                    videoVerificationStatus:
                      "not_required",
                    videoVerificationAt:
                      null,
                    videoVerificationNotes:
                      "",
                    siteVisitRequired:
                      false,
                    siteVisitStatus:
                      "not_required",
                    siteVisitAt:
                      null,
                    siteVisitBy:
                      "",
                    siteVisitNotes:
                      "",
                    riskFlags:
                      [],
                    internalNotes:
                      "",
                    finalDecision:
                      "pending",
                    finalDecisionReason:
                      "",
                    finalDecisionAt:
                      null,
                    finalDecisionBy:
                      "",
                    createdAt:
                      FieldValue
                        .serverTimestamp(),
                    createdBy:
                      adminUid,
                    updatedAt:
                      FieldValue
                        .serverTimestamp(),
                    updatedBy:
                      adminUid,
                  },
                );
              }
              transaction.update(
                assistanceRef,
                {
                  status:
                    "under_review",
                  verificationStatus:
                    "under_review",
                  reviewedAt:
                    FieldValue
                      .serverTimestamp(),
                  reviewedBy:
                    adminUid,
                  updatedAt:
                    FieldValue
                      .serverTimestamp(),
                },
              );
              return {
                alreadyCreated,
              };
            },
          );
      response
        .status(200)
        .json({
          ok:
            true,
          requestId,
          status:
            "under_review",
          verificationStatus:
            "under_review",
          reviewRecord:
            result
              .alreadyCreated
              ? "existing"
              : "created",
        });
    } catch (error) {
      console.error(
        "Assistance Start Review failed:",
        error,
      );
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_start_review_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to start the LGU Assistance Request review.",
              500,
            ),
        });
    }
  },
);
function normalizeReviewChoice(
  value,
  allowed,
  fallback,
) {
  const normalized =
    cleanText(
      value,
      80,
    )
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        "_",
      );
  return allowed.includes(
    normalized,
  )
    ? normalized
    : fallback;
}
function splitReviewList(
  value,
  maximumItems = 20,
  maximumLength = 160,
) {
  const values =
    Array.isArray(value)
      ? value
      : String(
          value || "",
        ).split(
          /[\n,]/,
        );
  return Array.from(
    new Set(
      values
        .map((item) =>
          cleanText(
            item,
            maximumLength,
          ),
        )
        .filter(Boolean),
    ),
  ).slice(
    0,
    maximumItems,
  );
}
function parseOptionalCoordinate(
  value,
  minimum,
  maximum,
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }
  const parsed =
    Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw makeHttpError(
      400,
      "invalid_private_coordinates",
      "The private verification coordinates are invalid.",
    );
  }
  return parsed;
}
function buildAssistanceReviewPayload({
  requestId,
  assistanceData,
  existingReview,
  reviewInput,
  action,
  decisionReason,
  adminUid,
}) {
  const category =
    cleanText(
      assistanceData
        ?.category ||
        "",
      80,
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9_]/g,
        "",
      );
  const requesterUid =
    cleanText(
      assistanceData
        ?.requesterUid ||
        "",
      200,
    );
  if (
    !requesterUid ||
    !ASSISTANCE_REQUEST_CATEGORY_CONFIG[
      category
    ]
  ) {
    throw makeHttpError(
      409,
      "assistance_request_invalid_for_review",
      "This Assistance Request is missing required review data.",
    );
  }
  const documentConsistencyStatus =
    normalizeReviewChoice(
      reviewInput
        ?.documentConsistencyStatus,
      [
        "pending",
        "consistent",
        "inconsistent",
        "needs_more_information",
      ],
      "pending",
    );
  const duplicateCheckStatus =
    normalizeReviewChoice(
      reviewInput
        ?.duplicateCheckStatus,
      [
        "pending",
        "clear",
        "potential_duplicate",
        "confirmed_duplicate",
      ],
      "pending",
    );
  const beneficiaryCheckStatus =
    normalizeReviewChoice(
      reviewInput
        ?.beneficiaryCheckStatus,
      [
        "pending",
        "confirmed",
        "needs_more_information",
        "inconsistent",
      ],
      "pending",
    );
  const facilityRequired =
    [
      "medical_health",
      "surgery_treatment",
      "cancer_serious_illness",
      "animal_pet_welfare",
    ].includes(
      category,
    );
  const facilityVerificationStatus =
    facilityRequired
      ? normalizeReviewChoice(
          reviewInput
            ?.facilityVerificationStatus,
          [
            "pending",
            "confirmed",
            "unable_to_confirm",
            "inconsistent",
          ],
          "pending",
        )
      : "not_required";
  const facilityVerificationMethod =
    facilityRequired
      ? normalizeReviewChoice(
          reviewInput
            ?.facilityVerificationMethod,
          [
            "official_phone",
            "official_email",
            "official_record",
            "in_person",
            "other",
          ],
          "not_applicable",
        )
      : "not_applicable";
  const residentEstimatedAmount =
    Number(
      assistanceData
        ?.estimatedAmount ||
        0,
    );
  const safeResidentEstimatedAmount =
    Number.isFinite(
      residentEstimatedAmount,
    ) &&
    residentEstimatedAmount >= 0
      ? Math.min(
          residentEstimatedAmount,
          100000000,
        )
      : 0;
  const costRequired =
    safeResidentEstimatedAmount >
    0;
  const verifiedGrossCost =
    costRequired
      ? Number(
          reviewInput
            ?.verifiedGrossCost ||
            0,
        )
      : 0;
  const confirmedExistingAssistanceAmount =
    costRequired
      ? Number(
          reviewInput
            ?.confirmedExistingAssistanceAmount ||
            0,
        )
      : 0;
  if (
    !Number.isFinite(
      verifiedGrossCost,
    ) ||
    verifiedGrossCost <
      0 ||
    verifiedGrossCost >
      100000000 ||
    !Number.isFinite(
      confirmedExistingAssistanceAmount,
    ) ||
    confirmedExistingAssistanceAmount <
      0 ||
    confirmedExistingAssistanceAmount >
      100000000 ||
    confirmedExistingAssistanceAmount >
      verifiedGrossCost
  ) {
    throw makeHttpError(
      400,
      "invalid_cost_verification",
      "The verified cost and existing assistance amounts are invalid.",
    );
  }
  const verifiedUncoveredAmount =
    costRequired
      ? Math.max(
          0,
          verifiedGrossCost -
            confirmedExistingAssistanceAmount,
        )
      : 0;
  const costVerificationStatus =
    costRequired
      ? normalizeReviewChoice(
          reviewInput
            ?.costVerificationStatus,
          [
            "pending",
            "confirmed",
            "inconsistent",
          ],
          "pending",
        )
      : "not_required";
  const residencyVerificationStatus =
    normalizeReviewChoice(
      reviewInput
        ?.residencyVerificationStatus,
      [
        "pending",
        "verified",
        "unable_to_verify",
        "inconsistent",
        "not_required",
      ],
      "pending",
    );
  const residencyVerificationMethod =
    normalizeReviewChoice(
      reviewInput
        ?.residencyVerificationMethod,
      [
        "not_applicable",
        "profile_address",
        "barangay_confirmation",
        "resident_confirmation",
        "site_visit",
        "other",
      ],
      "profile_address",
    );
  const privateLatitude =
    parseOptionalCoordinate(
      reviewInput
        ?.privateLatitude,
      -90,
      90,
    );
  const privateLongitude =
    parseOptionalCoordinate(
      reviewInput
        ?.privateLongitude,
      -180,
      180,
    );
  if (
    (privateLatitude === null) !==
    (privateLongitude === null)
  ) {
    throw makeHttpError(
      400,
      "incomplete_private_coordinates",
      "Enter both private latitude and longitude, or leave both blank.",
    );
  }
  const videoVerificationRequired =
    reviewInput
      ?.videoVerificationRequired ===
    true;
  const videoVerificationStatus =
    videoVerificationRequired
      ? normalizeReviewChoice(
          reviewInput
            ?.videoVerificationStatus,
          [
            "pending",
            "requested",
            "completed",
            "unable_to_complete",
          ],
          "pending",
        )
      : "not_required";
  const siteVisitRequired =
    reviewInput
      ?.siteVisitRequired ===
    true;
  const siteVisitStatus =
    siteVisitRequired
      ? normalizeReviewChoice(
          reviewInput
            ?.siteVisitStatus,
          [
            "pending",
            "scheduled",
            "completed",
            "unable_to_complete",
          ],
          "pending",
        )
      : "not_required";
  const riskFlags =
    splitReviewList(
      reviewInput
        ?.riskFlags,
      20,
      160,
    );
  const duplicateRequestIds =
    splitReviewList(
      reviewInput
        ?.duplicateRequestIds,
      20,
      200,
    );
  const finalDecision =
    action ===
      "verify"
      ? "verified"
      : action ===
          "reject"
        ? "rejected"
        : action ===
            "more_information"
          ? "needs_more_information"
          : "pending";
  const reviewStatus =
    finalDecision ===
      "verified"
      ? "verified"
      : finalDecision ===
          "rejected"
        ? "rejected"
        : finalDecision ===
            "needs_more_information"
          ? "needs_more_information"
          : "in_progress";
  const cleanDecisionReason =
    finalDecision ===
      "pending"
      ? ""
      : cleanText(
          decisionReason,
          2000,
        );
  if (
    finalDecision ===
      "needs_more_information" &&
    cleanDecisionReason.length <
      10
  ) {
    throw makeHttpError(
      400,
      "more_information_reason_required",
      "Explain exactly what information or evidence the Resident must clarify or provide.",
    );
  }
  if (
    finalDecision ===
      "rejected" &&
    cleanDecisionReason.length <
      3
  ) {
    throw makeHttpError(
      400,
      "rejection_reason_required",
      "Enter a clear evidence-based reason for rejecting the Assistance Request.",
    );
  }
  if (
    finalDecision ===
    "verified"
  ) {
    const ready =
      documentConsistencyStatus ===
        "consistent" &&
      duplicateCheckStatus ===
        "clear" &&
      beneficiaryCheckStatus ===
        "confirmed" &&
      residencyVerificationStatus ===
        "verified" &&
      (
        !facilityRequired ||
        facilityVerificationStatus ===
          "confirmed"
      ) &&
      (
        !costRequired ||
        costVerificationStatus ===
          "confirmed"
      ) &&
      [
        "not_required",
        "completed",
      ].includes(
        videoVerificationStatus,
      ) &&
      [
        "not_required",
        "completed",
      ].includes(
        siteVisitStatus,
      ) &&
      riskFlags.length ===
        0;
    if (!ready) {
      throw makeHttpError(
        409,
        "private_verification_incomplete",
        "Complete every required private verification check and resolve all risk flags before verifying the need.",
      );
    }
  }
  if (
    facilityVerificationStatus ===
      "confirmed" &&
    (
      cleanText(
        reviewInput
          ?.facilityName,
        160,
      ).length <
        2 ||
      facilityVerificationMethod ===
        "not_applicable"
    )
  ) {
    throw makeHttpError(
      400,
      "facility_verification_details_required",
      "Enter the facility name and an independent verification method before confirming the facility.",
    );
  }
  if (
    costVerificationStatus ===
      "confirmed" &&
    verifiedGrossCost <=
      0
  ) {
    throw makeHttpError(
      400,
      "verified_cost_required",
      "Enter a verified gross cost greater than zero before confirming the cost.",
    );
  }
  if (
    residencyVerificationStatus ===
      "verified" &&
    residencyVerificationMethod ===
      "not_applicable"
  ) {
    throw makeHttpError(
      400,
      "residency_verification_method_required",
      "Choose how the Resident's address or residency was verified.",
    );
  }
  const now =
    FieldValue
      .serverTimestamp();
  const preserveOrStamp = (
    existingValue,
    shouldStamp,
  ) =>
    shouldStamp
      ? existingValue ||
        now
      : null;
  return {
    requestId,
    requesterUid,
    category,
    reviewStatus,
    documentConsistencyStatus,
    documentConsistencyNotes:
      cleanText(
        reviewInput
          ?.documentConsistencyNotes,
        2000,
      ),
    duplicateCheckStatus,
    duplicateRequestIds,
    duplicateCheckNotes:
      cleanText(
        reviewInput
          ?.duplicateCheckNotes,
        2000,
      ),
    beneficiaryCheckStatus,
    beneficiaryCheckNotes:
      cleanText(
        reviewInput
          ?.beneficiaryCheckNotes,
        2000,
      ),
    facilityVerificationRequired:
      facilityRequired,
    facilityVerificationStatus,
    facilityName:
      cleanText(
        reviewInput
          ?.facilityName,
        160,
      ),
    facilityType:
      cleanText(
        reviewInput
          ?.facilityType,
        80,
      ),
    facilityDepartment:
      cleanText(
        reviewInput
          ?.facilityDepartment,
        160,
      ),
    professionalName:
      cleanText(
        reviewInput
          ?.professionalName,
        160,
      ),
    facilityReferenceNumber:
      cleanText(
        reviewInput
          ?.facilityReferenceNumber,
        160,
      ),
    facilityVerificationMethod,
    facilityVerifiedWith:
      cleanText(
        reviewInput
          ?.facilityVerifiedWith,
        160,
      ),
    facilityVerifiedAt:
      preserveOrStamp(
        existingReview
          ?.facilityVerifiedAt,
        facilityRequired &&
          facilityVerificationStatus ===
            "confirmed",
      ),
    facilityNotes:
      cleanText(
        reviewInput
          ?.facilityNotes,
        2000,
      ),
    costVerificationRequired:
      costRequired,
    residentEstimatedAmount:
      safeResidentEstimatedAmount,
    verifiedGrossCost,
    confirmedExistingAssistanceAmount,
    verifiedUncoveredAmount,
    costVerificationStatus,
    costReferenceNumber:
      cleanText(
        reviewInput
          ?.costReferenceNumber,
        160,
      ),
    costNotes:
      cleanText(
        reviewInput
          ?.costNotes,
        2000,
      ),
    residencyVerificationStatus,
    residencyVerificationMethod,
    privateAddressSnapshot:
      cleanText(
        reviewInput
          ?.privateAddressSnapshot ||
          assistanceData
            ?.requesterAddress ||
          "",
        300,
      ),
    privateLatitude,
    privateLongitude,
    locationVerifiedAt:
      preserveOrStamp(
        existingReview
          ?.locationVerifiedAt,
        residencyVerificationStatus ===
          "verified",
      ),
    locationVerifiedBy:
      residencyVerificationStatus ===
        "verified"
        ? adminUid
        : "",
    residencyNotes:
      cleanText(
        reviewInput
          ?.residencyNotes,
        2000,
      ),
    videoVerificationRequired,
    videoVerificationStatus,
    videoVerificationAt:
      preserveOrStamp(
        existingReview
          ?.videoVerificationAt,
        videoVerificationRequired &&
          videoVerificationStatus ===
            "completed",
      ),
    videoVerificationNotes:
      cleanText(
        reviewInput
          ?.videoVerificationNotes,
        2000,
      ),
    siteVisitRequired,
    siteVisitStatus,
    siteVisitAt:
      preserveOrStamp(
        existingReview
          ?.siteVisitAt,
        siteVisitRequired &&
          siteVisitStatus ===
            "completed",
      ),
    siteVisitBy:
      siteVisitRequired &&
      siteVisitStatus ===
        "completed"
        ? adminUid
        : "",
    siteVisitNotes:
      cleanText(
        reviewInput
          ?.siteVisitNotes,
        2000,
      ),
    riskFlags,
    internalNotes:
      cleanText(
        reviewInput
          ?.internalNotes,
        3000,
      ),
    finalDecision,
    finalDecisionReason:
      cleanDecisionReason,
    finalDecisionAt:
      finalDecision ===
        "pending"
        ? null
        : now,
    finalDecisionBy:
      finalDecision ===
        "pending"
        ? ""
        : adminUid,
    createdAt:
      existingReview
        ?.createdAt ||
      now,
    createdBy:
      cleanText(
        existingReview
          ?.createdBy ||
          adminUid,
        160,
      ),
    updatedAt:
      now,
    updatedBy:
      adminUid,
  };
}
app.post(
  "/api/admin/assistance/requests/:requestId/review",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (
    request,
    response,
  ) => {
    try {
      const adminUid =
        request
          .firebaseUser
          .uid;
      const requestId =
        cleanText(
          request.params
            ?.requestId ||
            "",
          120,
        );
      if (
        !requestId ||
        !/^[A-Za-z0-9_-]{10,120}$/.test(
          requestId,
        )
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_request_id",
          "The Request Assistance ID is invalid.",
        );
      }
      const action =
        normalizeReviewChoice(
          request.body
            ?.action,
          [
            "save_progress",
            "more_information",
            "verify",
            "reject",
          ],
          "",
        );
      if (!action) {
        throw makeHttpError(
          400,
          "invalid_review_action",
          "Choose a valid LGU review action.",
        );
      }
      const reviewInput =
        request.body
          ?.review &&
        typeof request.body
          .review ===
          "object"
          ? request.body
              .review
          : {};
      const decisionReason =
        cleanText(
          request.body
            ?.decisionReason ||
            "",
          2000,
        );
      const adminNote =
        cleanText(
          request.body
            ?.adminNote ||
            "",
          2000,
        );
      const assistanceRef =
        db
          .collection(
            "assistanceRequests",
          )
          .doc(
            requestId,
          );
      const reviewRef =
        db
          .collection(
            "assistanceVerificationReviews",
          )
          .doc(
            requestId,
          );
      const result =
        await db
          .runTransaction(
            async (
              transaction,
            ) => {
              const [
                assistanceSnapshot,
                reviewSnapshot,
              ] =
                await Promise.all([
                  transaction.get(
                    assistanceRef,
                  ),
                  transaction.get(
                    reviewRef,
                  ),
                ]);
              if (
                !assistanceSnapshot
                  .exists
              ) {
                throw makeHttpError(
                  404,
                  "assistance_request_not_found",
                  "The Assistance Request was not found.",
                );
              }
              if (
                !reviewSnapshot
                  .exists
              ) {
                throw makeHttpError(
                  409,
                  "assistance_review_not_started",
                  "Start Review before saving verification progress.",
                );
              }
              const assistanceData =
                assistanceSnapshot
                  .data() ||
                {};
              const existingReview =
                reviewSnapshot
                  .data() ||
                {};
              const existingFinalDecision =
                cleanText(
                  existingReview
                    .finalDecision ||
                    "pending",
                  60,
                ).toLowerCase();
              if (
                ![
                  "pending",
                  "needs_more_information",
                ].includes(
                  existingFinalDecision,
                )
              ) {
                throw makeHttpError(
                  409,
                  "assistance_review_locked",
                  "This Assistance Request review is already finalized.",
                );
              }
              const sameRequest =
                cleanText(
                  existingReview
                    .requestId ||
                    "",
                  120,
                ) ===
                  requestId &&
                cleanText(
                  existingReview
                    .requesterUid ||
                    "",
                  200,
                ) ===
                  cleanText(
                    assistanceData
                      .requesterUid ||
                      "",
                    200,
                  ) &&
                cleanText(
                  existingReview
                    .category ||
                    "",
                  80,
                ) ===
                  cleanText(
                    assistanceData
                      .category ||
                      "",
                    80,
                  );
              if (
                !sameRequest
              ) {
                throw makeHttpError(
                  409,
                  "assistance_review_record_mismatch",
                  "The protected review record does not match this Assistance Request.",
                );
              }
              const reviewPayload =
                buildAssistanceReviewPayload({
                  requestId,
                  assistanceData,
                  existingReview,
                  reviewInput,
                  action,
                  decisionReason,
                  adminUid,
                });
              transaction.set(
                reviewRef,
                reviewPayload,
                {
                  merge:
                    false,
                },
              );
              const requestUpdate = {
                reviewedAt:
                  FieldValue
                    .serverTimestamp(),
                reviewedBy:
                  adminUid,
                updatedAt:
                  FieldValue
                    .serverTimestamp(),
              };
              if (
                action ===
                "save_progress"
              ) {
                requestUpdate.status =
                  "under_review";
                requestUpdate.verificationStatus =
                  "under_review";
              }
              if (
                action ===
                "more_information"
              ) {
                requestUpdate.status =
                  "under_review";
                requestUpdate.verificationStatus =
                  "under_review";
                requestUpdate.supportDecision =
                  "pending";
                requestUpdate.remainingAmount =
                  0;
                requestUpdate.adminNote =
                  [
                    "[MORE INFORMATION REQUIRED]",
                    decisionReason,
                  ]
                    .join(
                      "\n",
                    )
                    .slice(
                      0,
                      2000,
                    );
              }
              if (
                action ===
                "verify"
              ) {
                requestUpdate.status =
                  "verified";
                requestUpdate.verificationStatus =
                  "verified";
                requestUpdate.supportDecision =
                  "pending";
                requestUpdate.remainingAmount =
                  0;
                requestUpdate.adminNote =
                  adminNote;
                requestUpdate.verifiedAt =
                  FieldValue
                    .serverTimestamp();
                requestUpdate.verifiedBy =
                  adminUid;
                requestUpdate.rejectedAt =
                  null;
                requestUpdate.rejectionReason =
                  "";
              }
              if (
                action ===
                "reject"
              ) {
                requestUpdate.status =
                  "rejected";
                requestUpdate.verificationStatus =
                  "rejected";
                requestUpdate.supportDecision =
                  "rejected";
                requestUpdate.remainingAmount =
                  0;
                requestUpdate.adminNote =
                  adminNote;
                requestUpdate.verifiedAt =
                  null;
                requestUpdate.verifiedBy =
                  "";
                requestUpdate.rejectedAt =
                  FieldValue
                    .serverTimestamp();
                requestUpdate.rejectionReason =
                  decisionReason
                    .slice(
                      0,
                      1000,
                    );
              }
              transaction.update(
                assistanceRef,
                requestUpdate,
              );
              return {
                reviewPayload,
              };
            },
          );
      response
        .status(200)
        .json({
          ok:
            true,
          requestId,
          action,
          status:
            action ===
              "verify"
              ? "verified"
              : action ===
                  "reject"
                ? "rejected"
                : "under_review",
          verificationStatus:
            action ===
              "verify"
              ? "verified"
              : action ===
                  "reject"
                ? "rejected"
                : "under_review",
          reviewStatus:
            result
              .reviewPayload
              .reviewStatus,
          finalDecision:
            result
              .reviewPayload
              .finalDecision,
        });
    } catch (error) {
      console.error(
        "Assistance Review action failed:",
        error,
      );
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_review_action_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to save the LGU Assistance Request review.",
              500,
            ),
        });
    }
  },
);
app.post(
  "/api/admin/assistance/requests/:requestId/operation",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (
    request,
    response,
  ) => {
    try {
      const adminUid =
        request
          .firebaseUser
          .uid;
      const requestId =
        cleanText(
          request.params
            ?.requestId ||
            "",
          120,
        );
      if (
        !requestId ||
        !/^[A-Za-z0-9_-]{10,120}$/.test(
          requestId,
        )
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_request_id",
          "The Request Assistance ID is invalid.",
        );
      }
      const action =
        cleanText(
          request.body
            ?.action ||
            "",
          60,
        ).toLowerCase();
      if (
        ![
          "resource_assessment",
          "assistance_provided",
          "save_location",
          "clear_location",
        ].includes(action)
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_operation",
          "Choose a valid Assistance Request operation.",
        );
      }
      const assistanceRef =
        db
          .collection(
            "assistanceRequests",
          )
          .doc(
            requestId,
          );
      const reviewRef =
        db
          .collection(
            "assistanceVerificationReviews",
          )
          .doc(
            requestId,
          );
      const result =
        await db
          .runTransaction(
            async (
              transaction,
            ) => {
              const [
                assistanceSnapshot,
                reviewSnapshot,
              ] =
                await Promise.all([
                  transaction.get(
                    assistanceRef,
                  ),
                  transaction.get(
                    reviewRef,
                  ),
                ]);
              if (
                !assistanceSnapshot
                  .exists
              ) {
                throw makeHttpError(
                  404,
                  "assistance_request_not_found",
                  "The Assistance Request was not found.",
                );
              }
              if (
                !reviewSnapshot
                  .exists
              ) {
                throw makeHttpError(
                  409,
                  "assistance_review_not_found",
                  "The protected LGU verification review was not found.",
                );
              }
              const assistanceData =
                assistanceSnapshot
                  .data() ||
                {};
              const reviewData =
                reviewSnapshot
                  .data() ||
                {};
              const verificationStatus =
                cleanText(
                  assistanceData
                    .verificationStatus ||
                    "",
                  60,
                ).toLowerCase();
              const finalDecision =
                cleanText(
                  reviewData
                    .finalDecision ||
                    "",
                  60,
                ).toLowerCase();
              if (
                verificationStatus !==
                  "verified" ||
                finalDecision !==
                  "verified"
              ) {
                throw makeHttpError(
                  409,
                  "verified_need_required",
                  "Complete final LGU verification before recording post-verification assistance actions.",
                );
              }
              const commonUpdate = {
                reviewedAt:
                  FieldValue
                    .serverTimestamp(),
                reviewedBy:
                  adminUid,
                updatedAt:
                  FieldValue
                    .serverTimestamp(),
              };
              if (
                action ===
                "resource_assessment"
              ) {
                const supportDecision =
                  cleanText(
                    request.body
                      ?.supportDecision ||
                      "",
                    60,
                  ).toLowerCase();
                if (
                  ![
                    "internal_support",
                    "donation_support",
                    "not_required",
                  ].includes(
                    supportDecision,
                  )
                ) {
                  throw makeHttpError(
                    400,
                    "support_decision_required",
                    "Select how the verified need will be supported.",
                  );
                }
                const requestedAmount =
                  Number(
                    request.body
                      ?.remainingAmount ??
                      0,
                  );
                if (
                  !Number.isFinite(
                    requestedAmount,
                  ) ||
                  requestedAmount < 0
                ) {
                  throw makeHttpError(
                    400,
                    "invalid_remaining_amount",
                    "Enter a valid verified remaining unmet amount.",
                  );
                }
                const verifiedCap =
                  Number(
                    reviewData
                      .verifiedUncoveredAmount ||
                      0,
                  );
                if (
                  supportDecision ===
                    "donation_support" &&
                  requestedAmount >
                    verifiedCap
                ) {
                  throw makeHttpError(
                    400,
                    "remaining_amount_exceeds_verified_need",
                    `Donation support cannot exceed the LGU-verified uncovered amount of PHP ${verifiedCap.toLocaleString("en-PH")}.`,
                  );
                }
                if (
                  supportDecision ===
                    "donation_support" &&
                  requestedAmount <= 0
                ) {
                  throw makeHttpError(
                    400,
                    "remaining_amount_required",
                    "For a monetary shortage, enter the verified remaining unmet amount before opening Donation Support.",
                  );
                }
                const remainingAmount =
                  supportDecision ===
                    "donation_support"
                    ? requestedAmount
                    : 0;
                transaction.update(
                  assistanceRef,
                  {
                    ...commonUpdate,
                    status:
                      "verified",
                    verificationStatus:
                      "verified",
                    supportDecision,
                    remainingAmount,
                    adminNote:
                      cleanText(
                        request.body
                          ?.adminNote ||
                          assistanceData
                            .adminNote ||
                          "",
                        2000,
                      ),
                  },
                );
                return {
                  supportDecision,
                  remainingAmount,
                };
              }
              if (
                action ===
                "assistance_provided"
              ) {
                const requestedDecision =
                  cleanText(
                    request.body
                      ?.supportDecision ||
                      assistanceData
                        .supportDecision ||
                      "",
                    60,
                  ).toLowerCase();
                if (
                  ![
                    "internal_support",
                    "not_required",
                  ].includes(
                    requestedDecision,
                  )
                ) {
                  throw makeHttpError(
                    409,
                    "assistance_provided_not_allowed",
                    "Mark Assistance Provided only when LGU/partner support is available or no additional support is required.",
                  );
                }
                transaction.update(
                  assistanceRef,
                  {
                    ...commonUpdate,
                    status:
                      "assistance_provided",
                    verificationStatus:
                      "verified",
                    supportDecision:
                      requestedDecision,
                    remainingAmount:
                      0,
                    adminNote:
                      cleanText(
                        request.body
                          ?.adminNote ||
                          assistanceData
                            .adminNote ||
                          "",
                        2000,
                      ),
                  },
                );
                return {
                  supportDecision:
                    requestedDecision,
                  remainingAmount:
                    0,
                };
              }
              if (
                action ===
                "save_location"
              ) {
                const locationType =
                  cleanText(
                    request.body
                      ?.assignedLocationType ||
                      "",
                    80,
                  ).toLowerCase();
                const allowedLocationTypes = [
                  "barangay_hall",
                  "lgu_office",
                  "hospital_social_service",
                  "social_welfare_office",
                  "vet_clinic",
                  "authorized_public_point",
                ];
                const locationName =
                  cleanText(
                    request.body
                      ?.assignedLocationName ||
                      "",
                    160,
                  );
                const locationAddress =
                  cleanText(
                    request.body
                      ?.assignedLocationAddress ||
                      "",
                    300,
                  );
                if (
                  !allowedLocationTypes
                    .includes(
                      locationType,
                    ) ||
                  locationName.length <
                    3 ||
                  locationAddress.length <
                    5
                ) {
                  throw makeHttpError(
                    400,
                    "official_location_required",
                    "Select a valid public location type and enter the official location name and address.",
                  );
                }
                transaction.update(
                  assistanceRef,
                  {
                    ...commonUpdate,
                    assignedLocationType:
                      locationType,
                    assignedLocationName:
                      locationName,
                    assignedLocationAddress:
                      locationAddress,
                    assignedLocationNotes:
                      cleanText(
                        request.body
                          ?.assignedLocationNotes ||
                          "",
                        1000,
                      ),
                    assignedLocationSetBy:
                      adminUid,
                    assignedLocationSetAt:
                      FieldValue
                        .serverTimestamp(),
                    adminNote:
                      cleanText(
                        request.body
                          ?.adminNote ||
                          assistanceData
                            .adminNote ||
                          "",
                        2000,
                      ),
                  },
                );
                return {
                  assignedLocationType:
                    locationType,
                  assignedLocationName:
                    locationName,
                  assignedLocationAddress:
                    locationAddress,
                };
              }
              transaction.update(
                assistanceRef,
                {
                  ...commonUpdate,
                  assignedLocationType:
                    "",
                  assignedLocationName:
                    "",
                  assignedLocationAddress:
                    "",
                  assignedLocationNotes:
                    "",
                  assignedLocationSetBy:
                    "",
                  assignedLocationSetAt:
                    null,
                  adminNote:
                    cleanText(
                      request.body
                        ?.adminNote ||
                        assistanceData
                          .adminNote ||
                        "",
                      2000,
                    ),
                },
              );
              return {
                assignedLocationType:
                  "",
                assignedLocationName:
                  "",
                assignedLocationAddress:
                  "",
              };
            },
          );
      response
        .status(200)
        .json({
          ok:
            true,
          requestId,
          action,
          ...result,
        });
    } catch (error) {
      console.error(
        "Assistance post-verification operation failed:",
        error,
      );
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_operation_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to save the Assistance Request operation.",
              500,
            ),
        });
    }
  },
);
app.post(
  "/api/assistance/public-photo/upload",
  requireFirebaseUser,
  requireVerifiedResident,
  express.raw({
    type: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/octet-stream",
    ],
    limit: ASSISTANCE_PUBLIC_PHOTO_UPLOAD_LIMIT,
  }),
  async (request, response) => {
    let uploadedCloudinaryAsset = null;
    try {
      const uid = request.firebaseUser.uid;
      if (
        !Buffer.isBuffer(request.body) ||
        request.body.length === 0
      ) {
        throw makeHttpError(
          400,
          "public_photo_file_required",
          "Choose a JPG, PNG, or WebP public campaign photo before uploading.",
        );
      }
      if (
        request.body.length >
        ASSISTANCE_PUBLIC_PHOTO_MAX_BYTES
      ) {
        throw makeHttpError(
          413,
          "public_photo_upload_too_large",
          "Public campaign photo must be 10 MB or smaller.",
        );
      }
      const detected =
        detectAssistanceImage(
          request.body,
        );
      if (!detected) {
        throw makeHttpError(
          415,
          "unsupported_public_photo",
          "Only valid JPG, PNG, and WebP images are accepted as a public campaign photo.",
        );
      }
      const stagedSnapshot =
        await db
          .collection(
            "assistancePublicPhotoAssets",
          )
          .where(
            "ownerUid",
            "==",
            uid,
          )
          .where(
            "status",
            "==",
            "staged",
          )
          .limit(
            ASSISTANCE_PUBLIC_PHOTO_MAX_STAGED,
          )
          .get();
      if (
        stagedSnapshot.size >=
        ASSISTANCE_PUBLIC_PHOTO_MAX_STAGED
      ) {
        throw makeHttpError(
          429,
          "too_many_staged_public_photos",
          "You already have unfinished public photo uploads. Finish or remove them before uploading another one.",
        );
      }
      const fileName =
        sanitizeFileName(
          request.headers[
            "x-file-name"
          ] ||
            `public-campaign-photo.${detected.extension}`,
        );
      const contentSha256 =
        crypto
          .createHash("sha256")
          .update(request.body)
          .digest("hex");
      uploadedCloudinaryAsset =
        await uploadAssistancePublicPhotoToCloudinary({
          buffer: request.body,
          uid,
        });
      const assetId =
        `publicphoto_${
          typeof crypto.randomUUID ===
          "function"
            ? crypto
                .randomUUID()
                .replace(/-/g, "")
            : crypto
                .randomBytes(18)
                .toString("hex")
        }`;
      const publicUrl =
        cleanText(
          uploadedCloudinaryAsset.secure_url ||
            "",
          1000,
        );
      if (
        !publicUrl.startsWith(
          "https://",
        )
      ) {
        throw makeHttpError(
          502,
          "public_photo_url_missing",
          "The public campaign photo did not return a secure public URL.",
        );
      }
      await db
        .collection(
          "assistancePublicPhotoAssets",
        )
        .doc(assetId)
        .set({
          assetId,
          ownerUid: uid,
          requestId: "",
          status: "staged",
          publicUrl,
          originalFileName: fileName,
          mimeType: detected.mimeType,
          bytes: Number(
            uploadedCloudinaryAsset.bytes ||
              request.body.length,
          ),
          contentSha256,
          cloudinaryAssetId:
            cleanText(
              uploadedCloudinaryAsset.asset_id,
              300,
            ),
          cloudinaryPublicId:
            cleanText(
              uploadedCloudinaryAsset.public_id,
              500,
            ),
          cloudinaryVersion:
            Number(
              uploadedCloudinaryAsset.version ||
                0,
            ),
          cloudinaryFormat:
            cleanText(
              uploadedCloudinaryAsset.format ||
                detected.extension,
              30,
            ),
          cloudinaryResourceType:
            "image",
          cloudinaryDeliveryType:
            "upload",
          width:
            numberOrNull(
              uploadedCloudinaryAsset.width,
            ),
          height:
            numberOrNull(
              uploadedCloudinaryAsset.height,
            ),
          createdAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
          attachedAt: null,
          deletedAt: null,
        });
      response
        .status(201)
        .json({
          ok: true,
          photo: {
            assetId,
            publicUrl,
            fileName,
          },
        });
    } catch (error) {
      if (
        uploadedCloudinaryAsset
          ?.public_id
      ) {
        try {
          await destroyAssistancePublicPhotoFromCloudinary(
            uploadedCloudinaryAsset.public_id,
          );
        } catch (cleanupError) {
          console.error(
            "Public campaign photo cleanup failed after upload error:",
            cleanupError?.message,
          );
        }
      }
      console.error(
        "Assistance public campaign photo upload failed:",
        error,
      );
      response
        .status(
          Number(
            error?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_public_photo_upload_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to upload the public campaign photo.",
              500,
            ),
        });
    }
  },
);
app.delete(
  "/api/assistance/public-photo/:assetId",
  requireFirebaseUser,
  requireVerifiedResident,
  async (request, response) => {
    try {
      const uid =
        request.firebaseUser.uid;
      const assetId =
        cleanText(
          request.params?.assetId ||
            "",
          200,
        );
      if (!assetId) {
        throw makeHttpError(
          400,
          "public_photo_asset_id_required",
          "A public campaign photo asset ID is required.",
        );
      }
      const photoRef =
        db
          .collection(
            "assistancePublicPhotoAssets",
          )
          .doc(assetId);
      const photoSnapshot =
        await photoRef.get();
      if (!photoSnapshot.exists) {
        response
          .status(404)
          .json({
            ok: false,
            error:
              "public_photo_not_found",
            message:
              "The staged public campaign photo was not found.",
          });
        return;
      }
      const photo =
        photoSnapshot.data() ||
        {};
      if (
        photo.ownerUid !== uid
      ) {
        throw makeHttpError(
          403,
          "public_photo_delete_denied",
          "You are not authorized to remove this public campaign photo.",
        );
      }
      if (
        photo.status !==
        "staged"
      ) {
        throw makeHttpError(
          409,
          "attached_public_photo_cannot_be_deleted",
          "A public campaign photo already attached to a Request Assistance record cannot be deleted from the staging endpoint.",
        );
      }
      await destroyAssistancePublicPhotoFromCloudinary(
        photo.cloudinaryPublicId,
      );
      await photoRef.delete();
      response.json({
        ok: true,
        assetId,
      });
    } catch (error) {
      console.error(
        "Assistance public campaign photo delete failed:",
        error,
      );
      response
        .status(
          Number(
            error?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_public_photo_delete_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to remove the staged public campaign photo.",
              500,
            ),
        });
    }
  },
);
app.post(
  "/api/assistance/evidence/upload",
  requireFirebaseUser,
  requireVerifiedResident,
  express.raw({
    type: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/octet-stream",
    ],
    limit:
      ASSISTANCE_EVIDENCE_UPLOAD_LIMIT,
  }),
  async (
    request,
    response,
  ) => {
    let uploadedCloudinaryAsset =
      null;
    try {
      const uid =
        request
          .firebaseUser
          .uid;
      if (
        !Buffer.isBuffer(
          request.body,
        ) ||
        request.body.length ===
          0
      ) {
        throw makeHttpError(
          400,
          "evidence_file_required",
          "Choose a JPG, PNG, or WebP image before uploading.",
        );
      }
      if (
        request.body.length >
        ASSISTANCE_EVIDENCE_MAX_BYTES
      ) {
        throw makeHttpError(
          413,
          "evidence_upload_too_large",
          "Assistance evidence must be 10 MB or smaller.",
        );
      }
      const detected =
        detectAssistanceImage(
          request.body,
        );
      if (!detected) {
        throw makeHttpError(
          415,
          "unsupported_evidence_file",
          "Only valid JPG, PNG, and WebP images are accepted for assistance evidence.",
        );
      }
      const documentType =
        cleanText(
          request.headers[
            "x-document-type"
          ] || "",
          100,
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9_]/g,
            "",
          );
      if (
        !ASSISTANCE_EVIDENCE_DOCUMENT_TYPES.has(
          documentType,
        )
      ) {
        throw makeHttpError(
          400,
          "invalid_document_type",
          "The supporting document type is not valid for Request Assistance.",
        );
      }
      const stagedSnapshot =
        await db
          .collection(
            "assistanceEvidenceAssets",
          )
          .where(
            "ownerUid",
            "==",
            uid,
          )
          .where(
            "status",
            "==",
            "staged",
          )
          .limit(
            ASSISTANCE_EVIDENCE_MAX_STAGED,
          )
          .get();
      const stagedCount =
        stagedSnapshot.size;
      if (
        stagedCount >=
        ASSISTANCE_EVIDENCE_MAX_STAGED
      ) {
        throw makeHttpError(
          429,
          "too_many_staged_evidence_files",
          "You already have several unfinished assistance evidence uploads. Finish or remove them before uploading more.",
        );
      }
      const fileName =
        sanitizeFileName(
          request.headers[
            "x-file-name"
          ] ||
            `evidence.${detected.extension}`,
        );
      const contentSha256 =
        crypto
          .createHash(
            "sha256",
          )
          .update(
            request.body,
          )
          .digest(
            "hex",
          );
      uploadedCloudinaryAsset =
        await uploadAssistanceEvidenceToCloudinary(
          {
            buffer:
              request.body,
            mimeType:
              detected.mimeType,
            extension:
              detected.extension,
            uid,
          },
        );
      const evidenceId =
        `evidence_${
          typeof crypto.randomUUID ===
          "function"
            ? crypto
                .randomUUID()
                .replace(
                  /-/g,
                  "",
                )
            : crypto
                .randomBytes(
                  18,
                )
                .toString(
                  "hex",
                )
        }`;
      await db
        .collection(
          "assistanceEvidenceAssets",
        )
        .doc(
          evidenceId,
        )
        .set({
          evidenceId,
          ownerUid:
            uid,
          requestId:
            "",
          status:
            "staged",
          documentType,
          originalFileName:
            fileName,
          mimeType:
            detected.mimeType,
          bytes:
            Number(
              uploadedCloudinaryAsset
                .bytes ||
                request.body
                  .length,
            ),
          contentSha256,
          cloudinaryAssetId:
            cleanText(
              uploadedCloudinaryAsset
                .asset_id,
              300,
            ),
          cloudinaryPublicId:
            cleanText(
              uploadedCloudinaryAsset
                .public_id,
              500,
            ),
          cloudinaryVersion:
            Number(
              uploadedCloudinaryAsset
                .version ||
                0,
            ),
          cloudinaryFormat:
            cleanText(
              uploadedCloudinaryAsset
                .format ||
                detected
                  .extension,
              30,
            ),
          cloudinaryResourceType:
            "image",
          cloudinaryDeliveryType:
            "authenticated",
          width:
            numberOrNull(
              uploadedCloudinaryAsset
                .width,
            ),
          height:
            numberOrNull(
              uploadedCloudinaryAsset
                .height,
            ),
          createdAt:
            FieldValue
              .serverTimestamp(),
          updatedAt:
            FieldValue
              .serverTimestamp(),
          attachedAt:
            null,
          deletedAt:
            null,
        });
      response
        .status(
          201,
        )
        .json({
          ok:
            true,
          evidence: {
            evidenceId,
            documentType,
            fileName,
            mimeType:
              detected
                .mimeType,
            bytes:
              Number(
                uploadedCloudinaryAsset
                  .bytes ||
                  request.body
                    .length,
              ),
            status:
              "staged",
          },
        });
    } catch (error) {
      console.error(
        "Assistance evidence upload failed:",
        error,
      );
      if (
        uploadedCloudinaryAsset
          ?.public_id
      ) {
        try {
          await destroyAssistanceEvidenceFromCloudinary(
            uploadedCloudinaryAsset
              .public_id,
          );
        } catch (
          cleanupError
        ) {
          console.error(
            "Cloudinary rollback failed after evidence metadata error:",
            cleanupError,
          );
        }
      }
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_evidence_upload_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to securely upload the assistance evidence.",
              500,
            ),
        });
    }
  },
);
app.post(
  "/api/assistance/requests",
  requireFirebaseUser,
  requireVerifiedResident,
  async (
    request,
    response,
  ) => {
    try {
      const uid =
        request.firebaseUser.uid;
      const profile =
        request.volunServeProfile ||
        {};
      const requestId =
        cleanText(
          request.body?.requestId ||
            "",
          120,
        );
      if (
        !requestId ||
        !/^[A-Za-z0-9_-]{10,120}$/.test(
          requestId,
        )
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_request_id",
          "The Request Assistance ID is invalid.",
        );
      }
      const assistanceRef =
        db
          .collection(
            "assistanceRequests",
          )
          .doc(
            requestId,
          );
      const existingSnapshot =
        await assistanceRef.get();
      if (
        existingSnapshot.exists
      ) {
        const existingData =
          existingSnapshot.data() ||
          {};
        if (
          existingData.requesterUid !==
          uid
        ) {
          throw makeHttpError(
            409,
            "assistance_request_id_conflict",
            "This Request Assistance ID is already in use.",
          );
        }
        response.json({
          ok: true,
          requestId,
          status:
            cleanText(
              existingData.status ||
                "pending",
              40,
            ) ||
            "pending",
          alreadyCreated:
            true,
        });
        return;
      }
      const category =
        cleanText(
          request.body?.category ||
            "",
          80,
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9_]/g,
            "",
          );
      const categoryConfig =
        ASSISTANCE_REQUEST_CATEGORY_CONFIG[
          category
        ];
      if (!categoryConfig) {
        throw makeHttpError(
          400,
          "invalid_assistance_category",
          "Choose a valid Request Assistance category.",
        );
      }
      const beneficiaryType =
        cleanText(
          request.body
            ?.beneficiaryType ||
            "",
          40,
        )
          .toLowerCase()
          .replace(
            /[^a-z_]/g,
            "",
          );
      if (
        beneficiaryType !==
          "self" &&
        beneficiaryType !==
          "someone_else"
      ) {
        throw makeHttpError(
          400,
          "invalid_beneficiary_type",
          "Choose who needs assistance.",
        );
      }
      const requesterName =
        cleanText(
          profile?.fullName ||
            request.firebaseUser
              ?.name ||
            "Resident",
          160,
        ) ||
        "Resident";
      const requesterEmail =
        cleanText(
          profile?.email ||
            request.firebaseUser
              ?.email ||
            "",
          160,
        );
      const requesterBarangay =
        cleanText(
          profile?.barangay ||
            profile?.availability
              ?.barangay ||
            "",
          120,
        );
      if (!requesterBarangay) {
        throw makeHttpError(
          400,
          "resident_barangay_required",
          "Your VolunServe account has no barangay information. Update your account before submitting a Request Assistance.",
        );
      }
      const requesterAddress =
        cleanText(
          profile?.address ||
            "",
          240,
        );
      const contactNumber =
        cleanText(
          profile?.phoneNumber ||
            profile?.contactNumber ||
            "",
          30,
        );
      if (
        contactNumber.length < 8
      ) {
        throw makeHttpError(
          400,
          "resident_contact_required",
          "Add a valid contact number to your VolunServe account before submitting a Request Assistance.",
        );
      }
      const beneficiaryName =
        beneficiaryType ===
        "self"
          ? requesterName
          : cleanText(
              request.body
                ?.beneficiaryName ||
                "",
              160,
            );
      const relationshipToBeneficiary =
        beneficiaryType ===
        "self"
          ? "self"
          : cleanText(
              request.body
                ?.relationshipToBeneficiary ||
                "",
              120,
            );
      if (
        beneficiaryName.length < 1
      ) {
        throw makeHttpError(
          400,
          "beneficiary_name_required",
          "Enter the beneficiary name.",
        );
      }
      if (
        relationshipToBeneficiary
          .length < 1
      ) {
        throw makeHttpError(
          400,
          "beneficiary_relationship_required",
          "Enter your relationship to the beneficiary.",
        );
      }
      const title =
        cleanText(
          request.body?.title ||
            "",
          160,
        );
      if (title.length < 5) {
        throw makeHttpError(
          400,
          "assistance_title_required",
          "Enter a clear request title using at least 5 characters.",
        );
      }
      const description =
        cleanText(
          request.body
            ?.description ||
            "",
          2000,
        );
      if (
        description.length < 20
      ) {
        throw makeHttpError(
          400,
          "assistance_description_required",
          "Describe the current need using at least 20 characters.",
        );
      }
      const estimatedAmount =
        Number(
          request.body
            ?.estimatedAmount ??
            0,
        );
      if (
        !Number.isFinite(
          estimatedAmount,
        ) ||
        estimatedAmount < 0 ||
        estimatedAmount >
          100000000
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_amount",
          "Enter a valid estimated amount.",
        );
      }
      if (
        categoryConfig
          .requiresPositiveAmount &&
        estimatedAmount <= 0
      ) {
        throw makeHttpError(
          400,
          "assistance_amount_required",
          "Enter the estimated amount needed for this medical request.",
        );
      }
      const currentSituation =
        cleanText(
          request.body
            ?.currentSituation ||
            "",
          240,
        );
      if (
        currentSituation.length <
        2
      ) {
        throw makeHttpError(
          400,
          "current_situation_required",
          "Select or describe the current situation.",
        );
      }
      const preferredAssistanceTypes = ["monetary"];
      const publicCampaignPhotoAssetId =
        cleanText(
          request.body
            ?.publicCampaignPhotoAssetId ||
            "",
          200,
        );
      const publicCampaignPhotoConsent =
        request.body
          ?.publicCampaignPhotoConsent ===
        true;
      if (
        !publicCampaignPhotoAssetId
      ) {
        throw makeHttpError(
          400,
          "public_campaign_photo_required",
          "Upload the required public campaign photo before submitting the Request Assistance.",
        );
      }
      if (
        !publicCampaignPhotoConsent
      ) {
        throw makeHttpError(
          400,
          "public_campaign_photo_consent_required",
          "Confirm public photo consent before submitting the Request Assistance.",
        );
      }
      const publicPhotoRef =
        db
          .collection(
            "assistancePublicPhotoAssets",
          )
          .doc(
            publicCampaignPhotoAssetId,
          );
      const publicPhotoSnapshot =
        await publicPhotoRef.get();
      if (
        !publicPhotoSnapshot.exists
      ) {
        throw makeHttpError(
          404,
          "public_campaign_photo_not_found",
          "The required public campaign photo could not be found.",
        );
      }
      const publicPhotoData =
        publicPhotoSnapshot.data() ||
        {};
      if (
        publicPhotoData.ownerUid !==
        uid
      ) {
        throw makeHttpError(
          403,
          "public_campaign_photo_owner_mismatch",
          "The public campaign photo belongs to another account.",
        );
      }
      if (
        publicPhotoData.status !==
        "staged"
      ) {
        throw makeHttpError(
          409,
          "public_campaign_photo_not_staged",
          "The public campaign photo is no longer available for this request.",
        );
      }
      const publicCampaignPhotoUrl =
        cleanText(
          publicPhotoData.publicUrl ||
            "",
          1000,
        );
      if (
        !publicCampaignPhotoUrl.startsWith(
          "https://",
        )
      ) {
        throw makeHttpError(
          409,
          "public_campaign_photo_url_invalid",
          "The public campaign photo is missing a valid secure URL.",
        );
      }
      const evidenceIds =
        Array.from(
          new Set(
            Array.isArray(
              request.body
                ?.evidenceIds,
            )
              ? request.body
                  .evidenceIds
                  .map(
                    (value) =>
                      cleanText(
                        value,
                        200,
                      ),
                  )
                  .filter(
                    Boolean,
                  )
              : [],
          ),
        );
      if (
        evidenceIds.length < 1 ||
        evidenceIds.length > 8
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_evidence",
          "Attach between 1 and 8 supporting evidence files.",
        );
      }
      const evidenceRefs =
        evidenceIds.map(
          (evidenceId) =>
            db
              .collection(
                "assistanceEvidenceAssets",
              )
              .doc(
                evidenceId,
              ),
        );
      const evidenceSnapshots =
        await Promise.all(
          evidenceRefs.map(
            (ref) =>
              ref.get(),
          ),
        );
      const documents = [];
      const submittedDocumentTypes =
        new Set();
      for (
        let index = 0;
        index <
        evidenceSnapshots.length;
        index += 1
      ) {
        const snapshot =
          evidenceSnapshots[
            index
          ];
        const data =
          snapshot.exists
            ? snapshot.data() ||
              {}
            : null;
        if (!data) {
          throw makeHttpError(
            404,
            "evidence_not_found",
            "One of the supporting evidence files could not be found.",
          );
        }
        if (
          data.ownerUid !==
          uid
        ) {
          throw makeHttpError(
            403,
            "evidence_owner_mismatch",
            "One of the supporting evidence files belongs to another account.",
          );
        }
        if (
          data.status !==
          "staged"
        ) {
          throw makeHttpError(
            409,
            "evidence_not_staged",
            "One of the supporting evidence files is no longer available for this request.",
          );
        }
        const documentType =
          cleanText(
            data.documentType ||
              "",
            100,
          )
            .toLowerCase()
            .replace(
              /[^a-z0-9_]/g,
              "",
            );
        if (
          !ASSISTANCE_EVIDENCE_DOCUMENT_TYPES
            .has(
              documentType,
            ) ||
          !categoryConfig
            .allowedDocumentTypes
            .includes(
              documentType,
            )
        ) {
          throw makeHttpError(
            400,
            "evidence_category_mismatch",
            "One of the supporting evidence files does not match the selected assistance category.",
          );
        }
        submittedDocumentTypes
          .add(
            documentType,
          );
        const fileName =
          sanitizeFileName(
            data.originalFileName ||
              "Supporting image",
          );
        documents.push({
          documentType,
          label:
            ASSISTANCE_EVIDENCE_LABELS[
              documentType
            ] ||
            "Supporting Evidence",
          url:
            `${ASSISTANCE_PUBLIC_BACKEND_URL}/api/assistance/evidence/${encodeURIComponent(
              evidenceIds[index],
            )}/access`,
          fileName,
        });
      }
      const missingRequiredType =
        categoryConfig
          .requiredDocumentTypes
          .find(
            (documentType) =>
              !submittedDocumentTypes
                .has(
                  documentType,
                ),
          );
      if (
        missingRequiredType
      ) {
        throw makeHttpError(
          400,
          "required_evidence_missing",
          `Upload the required supporting evidence: ${
            ASSISTANCE_EVIDENCE_LABELS[
              missingRequiredType
            ] ||
            missingRequiredType
          }.`,
        );
      }
      const assistanceData = {
        requestId,
        requesterUid:
          uid,
        requesterName,
        requesterEmail,
        requesterBarangay,
        requesterAddress,
        contactNumber,
        beneficiaryType,
        beneficiaryName,
        relationshipToBeneficiary,
        requestGroup:
          categoryConfig
            .requestGroup,
        category,
        categoryLabel:
          categoryConfig.label,
        title,
        description,
        estimatedAmount,
        currentSituation,
        preferredAssistanceTypes,
        documents,
        publicCampaignPhotoUrl,
        publicCampaignPhotoConsent:
          true,
        publicCampaignPhotoFileName:
          sanitizeFileName(
            publicPhotoData.originalFileName ||
              "Public Campaign Photo",
          ),
        publicCampaignPhotoSetAt:
          FieldValue.serverTimestamp(),
        status:
          "pending",
        verificationStatus:
          "pending_review",
        supportDecision:
          "pending",
        remainingAmount:
          0,
        assignedLocationType:
          "",
        assignedLocationName:
          "",
        assignedLocationAddress:
          "",
        assignedLocationNotes:
          "",
        assignedLocationSetBy:
          "",
        assignedLocationSetAt:
          null,
        donationCampaignId:
          "",
        adminNote:
          "",
        reviewedAt:
          null,
        reviewedBy:
          "",
        verifiedAt:
          null,
        verifiedBy:
          "",
        rejectedAt:
          null,
        rejectionReason:
          "",
        createdAt:
          FieldValue
            .serverTimestamp(),
        updatedAt:
          FieldValue
            .serverTimestamp(),
      };
      const batch =
        db.batch();
      batch.set(
        assistanceRef,
        assistanceData,
      );
      batch.set(
        publicPhotoRef,
        {
          status:
            "attached",
          requestId,
          consentConfirmed:
            true,
          attachedAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge:
            true,
        },
      );
      evidenceRefs.forEach(
        (ref) => {
          batch.set(
            ref,
            {
              status:
                "attached",
              requestId,
              attachedAt:
                FieldValue
                  .serverTimestamp(),
              updatedAt:
                FieldValue
                  .serverTimestamp(),
            },
            {
              merge:
                true,
            },
          );
        },
      );
      await batch.commit();
      response
        .status(201)
        .json({
          ok: true,
          requestId,
          status:
            "pending",
          attachedEvidenceCount:
            evidenceIds.length,
          publicCampaignPhotoAttached:
            true,
        });
    } catch (error) {
      console.error(
        "Assistance request creation failed:",
        error,
      );
      response
        .status(
          Number(
            error?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_request_creation_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to save the Request Assistance record.",
              500,
            ),
        });
    }
  },
);
app.post(
  "/api/assistance/evidence/attach",
  requireFirebaseUser,
  requireVerifiedResident,
  async (
    request,
    response,
  ) => {
    try {
      const uid =
        request
          .firebaseUser
          .uid;
      const requestId =
        cleanText(
          request.body
            ?.requestId ||
            "",
          200,
        );
      const evidenceIds =
        Array.from(
          new Set(
            Array.isArray(
              request.body
                ?.evidenceIds,
            )
              ? request.body
                  .evidenceIds
                  .map(
                    (
                      value,
                    ) =>
                      cleanText(
                        value,
                        200,
                      ),
                  )
                  .filter(
                    Boolean,
                  )
              : [],
          ),
        );
      if (
        !requestId ||
        evidenceIds.length ===
          0 ||
        evidenceIds.length >
          8
      ) {
        throw makeHttpError(
          400,
          "invalid_evidence_attachment",
          "A valid Request Assistance ID and 1 to 8 evidence files are required.",
        );
      }
      const assistanceRef =
        db
          .collection(
            "assistanceRequests",
          )
          .doc(
            requestId,
          );
      const assistanceSnapshot =
        await assistanceRef.get();
      if (
        !assistanceSnapshot
          .exists
      ) {
        throw makeHttpError(
          404,
          "assistance_request_not_found",
          "The Request Assistance record was not found.",
        );
      }
      const assistanceData =
        assistanceSnapshot.data() ||
        {};
      if (
        assistanceData
          .requesterUid !==
        uid
      ) {
        throw makeHttpError(
          403,
          "assistance_request_owner_mismatch",
          "You cannot attach evidence to another Resident's request.",
        );
      }
      const evidenceRefs =
        evidenceIds.map(
          (
            evidenceId,
          ) =>
            db
              .collection(
                "assistanceEvidenceAssets",
              )
              .doc(
                evidenceId,
              ),
        );
      const evidenceSnapshots =
        await Promise.all(
          evidenceRefs.map(
            (
              ref,
            ) =>
              ref.get(),
          ),
        );
      for (
        let index = 0;
        index <
        evidenceSnapshots.length;
        index += 1
      ) {
        const snapshot =
          evidenceSnapshots[
            index
          ];
        const data =
          snapshot.exists
            ? snapshot.data() ||
              {}
            : null;
        if (!data) {
          throw makeHttpError(
            404,
            "evidence_not_found",
            "One of the evidence files could not be found.",
          );
        }
        if (
          data.ownerUid !==
          uid
        ) {
          throw makeHttpError(
            403,
            "evidence_owner_mismatch",
            "One of the evidence files belongs to another account.",
          );
        }
        if (
          data.status !==
            "staged" &&
          !(
            data.status ===
              "attached" &&
            data.requestId ===
              requestId
          )
        ) {
          throw makeHttpError(
            409,
            "evidence_already_attached",
            "One of the evidence files is already attached to another request.",
          );
        }
      }
      const batch =
        db.batch();
      evidenceRefs.forEach(
        (
          ref,
        ) => {
          batch.set(
            ref,
            {
              status:
                "attached",
              requestId,
              attachedAt:
                FieldValue
                  .serverTimestamp(),
              updatedAt:
                FieldValue
                  .serverTimestamp(),
            },
            {
              merge:
                true,
            },
          );
        },
      );
      await batch.commit();
      response.json({
        ok:
          true,
        requestId,
        attachedEvidenceCount:
          evidenceIds.length,
      });
    } catch (error) {
      console.error(
        "Assistance evidence attach failed:",
        error,
      );
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_evidence_attach_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to attach the private evidence to the assistance request.",
              500,
            ),
        });
    }
  },
);
app.get(
  "/api/assistance/evidence/:evidenceId/access",
  requireFirebaseUser,
  async (
    request,
    response,
  ) => {
    try {
      response.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private",
      );
      response.set(
        "Pragma",
        "no-cache",
      );
      response.set(
        "X-Robots-Tag",
        "noindex, nofollow, noarchive",
      );
      const uid =
        request
          .firebaseUser
          .uid;
      const evidenceId =
        cleanText(
          request.params
            .evidenceId ||
            "",
          200,
        );
      if (!evidenceId) {
        throw makeHttpError(
          400,
          "evidence_id_required",
          "An evidence ID is required.",
        );
      }
      const evidenceSnapshot =
        await db
          .collection(
            "assistanceEvidenceAssets",
          )
          .doc(
            evidenceId,
          )
          .get();
      if (
        !evidenceSnapshot
          .exists
      ) {
        throw makeHttpError(
          404,
          "evidence_not_found",
          "The private assistance evidence was not found.",
        );
      }
      const evidenceData =
        evidenceSnapshot.data() ||
        {};
      const accessContext =
        await getEvidenceAccessContext(
          uid,
          evidenceData,
        );
      const evidenceStatus =
        cleanText(
          evidenceData
            .status ||
            "",
          40,
        ).toLowerCase();
      const requestId =
        cleanText(
          evidenceData
            .requestId ||
            "",
          200,
        );
      if (
        accessContext.admin
      ) {
        if (
          evidenceStatus !==
            "attached" ||
          !requestId
        ) {
          throw makeHttpError(
            403,
            "admin_evidence_not_attached",
            "LGU/Admin access is available only after evidence is attached to a submitted assistance request.",
          );
        }
        const assistanceSnapshot =
          await db
            .collection(
              "assistanceRequests",
            )
            .doc(
              requestId,
            )
            .get();
        if (
          !assistanceSnapshot
            .exists
        ) {
          throw makeHttpError(
            404,
            "assistance_request_not_found",
            "The Request Assistance record linked to this evidence was not found.",
          );
        }
        const assistanceData =
          assistanceSnapshot.data() ||
          {};
        if (
          cleanText(
            assistanceData
              .requesterUid ||
              "",
            200,
          ) !==
          cleanText(
            evidenceData
              .ownerUid ||
              "",
            200,
          )
        ) {
          throw makeHttpError(
            409,
            "evidence_request_owner_mismatch",
            "The evidence owner does not match the linked Request Assistance record.",
          );
        }
      }
      const cloudinaryPublicId =
        cleanText(
          evidenceData
            .cloudinaryPublicId ||
            "",
          500,
        );
      const cloudinaryFormat =
        cleanText(
          evidenceData
            .cloudinaryFormat ||
            "",
          30,
        );
      const cloudinaryResourceType =
        cleanText(
          evidenceData
            .cloudinaryResourceType ||
            "image",
          30,
        );
      const cloudinaryDeliveryType =
        cleanText(
          evidenceData
            .cloudinaryDeliveryType ||
            "",
          40,
        );
      const signedAccess =
        createCloudinaryPrivateDownloadUrl({
          publicId:
            cloudinaryPublicId,
          format:
            cloudinaryFormat,
          resourceType:
            cloudinaryResourceType,
          deliveryType:
            cloudinaryDeliveryType,
        });
      if (
        accessContext.admin
      ) {
        const accessLogRef =
          db
            .collection(
              "assistanceEvidenceAccessLogs",
            )
            .doc();
        await accessLogRef.set({
          accessLogId:
            accessLogRef.id,
          evidenceId,
          requestId,
          ownerUid:
            cleanText(
              evidenceData
                .ownerUid ||
                "",
              200,
            ),
          accessedBy:
            uid,
          accessedByRole:
            "admin",
          action:
            "temporary_view_url_issued",
          createdAt:
            FieldValue
              .serverTimestamp(),
        });
      }
      response.json({
        ok:
          true,
        evidence: {
          evidenceId,
          requestId,
          documentType:
            cleanText(
              evidenceData
                .documentType ||
                "",
              100,
            ),
          fileName:
            sanitizeFileName(
              evidenceData
                .originalFileName ||
                "evidence",
            ),
          mimeType:
            cleanText(
              evidenceData
                .mimeType ||
                "image/jpeg",
              100,
            ),
          status:
            evidenceStatus,
        },
        accessUrl:
          signedAccess.url,
        expiresAt:
          signedAccess
            .expiresAt,
        expiresInSeconds:
          ASSISTANCE_EVIDENCE_URL_TTL_SECONDS,
      });
    } catch (error) {
      console.error(
        "Assistance evidence access failed:",
        error,
      );
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_evidence_access_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to open the private assistance evidence.",
              500,
            ),
        });
    }
  },
);
app.delete(
  "/api/assistance/evidence/:evidenceId",
  requireFirebaseUser,
  async (
    request,
    response,
  ) => {
    try {
      const uid =
        request
          .firebaseUser
          .uid;
      const evidenceId =
        cleanText(
          request.params
            .evidenceId ||
            "",
          200,
        );
      if (!evidenceId) {
        throw makeHttpError(
          400,
          "evidence_id_required",
          "An evidence ID is required.",
        );
      }
      const evidenceRef =
        db
          .collection(
            "assistanceEvidenceAssets",
          )
          .doc(
            evidenceId,
          );
      const evidenceSnapshot =
        await evidenceRef.get();
      if (
        !evidenceSnapshot
          .exists
      ) {
        response.json({
          ok:
            true,
          deleted:
            false,
          message:
            "The staged evidence was already removed.",
        });
        return;
      }
      const evidenceData =
        evidenceSnapshot.data() ||
        {};
      const access =
        await getEvidenceAccessContext(
          uid,
          evidenceData,
        );
      if (
        evidenceData.status !==
        "staged"
      ) {
        throw makeHttpError(
          409,
          "attached_evidence_cannot_be_deleted",
          "Evidence attached to a submitted assistance request is preserved for the LGU audit trail.",
        );
      }
      if (
        !access.owner &&
        !access.admin
      ) {
        throw makeHttpError(
          403,
          "evidence_delete_denied",
          "You are not authorized to remove this staged evidence.",
        );
      }
      const publicId =
        cleanText(
          evidenceData
            .cloudinaryPublicId ||
            "",
          500,
        );
      if (publicId) {
        await destroyAssistanceEvidenceFromCloudinary(
          publicId,
        );
      }
      await evidenceRef.delete();
      response.json({
        ok:
          true,
        deleted:
          true,
        evidenceId,
      });
    } catch (error) {
      console.error(
        "Assistance evidence delete failed:",
        error,
      );
      response
        .status(
          Number(
            error
              ?.statusCode,
          ) || 500,
        )
        .json({
          error:
            cleanText(
              error?.code ||
                "assistance_evidence_delete_failed",
              100,
            ),
          message:
            cleanText(
              error?.message ||
                "Unable to remove the staged assistance evidence.",
              500,
            ),
        });
    }
  },
);
app.use(
  (
    error,
    request,
    response,
    next,
  ) => {
    console.error(
      "Unhandled backend error:",
      error,
    );
    if (
      error?.type ===
      "entity.too.large"
    ) {
      const assistanceEvidenceRequest =
        String(
          request?.path ||
            "",
        ).startsWith(
          "/api/assistance/evidence/",
        );
      response
        .status(
          413,
        )
        .json({
          error:
            assistanceEvidenceRequest
              ? "evidence_upload_too_large"
              : "identity_upload_too_large",
          message:
            assistanceEvidenceRequest
              ? "Assistance evidence must be 10 MB or smaller."
              : "The identity verification upload is too large.",
        });
      return;
    }
    response
      .status(
        500,
      )
      .json({
        error:
          "server_error",
        message:
          "The VolunServe backend encountered an error.",
      });
  },
);
// =========================================================
// PAYMONGO HOSTED CHECKOUT — TEST MODE
// =========================================================
// Resident creates a PayMongo Checkout Session through this backend. The
// browser never receives the secret API key. Payment is counted ONLY after the
// signed checkout_session.payment.paid webhook is processed above.
// =========================================================
const validatedPaymongoReturnBaseUrl = (value) => {
  const raw = cleanText(value || "", 700);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw makeHttpError(
      400,
      "invalid_checkout_return_url",
      "The Donation page return URL is invalid.",
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw makeHttpError(
      400,
      "invalid_checkout_return_url",
      "The Donation page return URL must use HTTP or HTTPS.",
    );
  }
  if (!allowedOrigins.has(parsed.origin)) {
    throw makeHttpError(
      403,
      "checkout_return_origin_not_allowed",
      "This Donation page origin is not allowed by the VolunServe backend.",
    );
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed;
};
const paymongoCheckoutErrorMessage = (payload, fallback) => {
  const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  return cleanText(
    firstError?.detail ||
      firstError?.title ||
      payload?.message ||
      fallback ||
      "PayMongo could not create the test checkout session.",
    700,
  );
};
app.post(
  "/api/paymongo/checkout-session",
  requireFirebaseUser,
  async (request, response) => {
    let donationRef = null;
    try {
      if (paymongoMode() !== "test") {
        throw makeHttpError(
          503,
          "paymongo_test_mode_required",
          "VolunServe payment integration is currently locked to PayMongo Test Mode.",
        );
      }
      const secretKey = getPaymongoSecretKey();
      if (!secretKey || !secretKey.startsWith("sk_test_")) {
        throw makeHttpError(
          503,
          "paymongo_test_key_not_configured",
          "Configure a PayMongo Secret Test key on the backend before starting checkout.",
        );
      }
      if (typeof fetch !== "function") {
        throw makeHttpError(
          500,
          "fetch_unavailable",
          "The backend runtime cannot connect to PayMongo.",
        );
      }
      const uid = request.firebaseUser.uid;
      const profile = await loadUserProfile(uid);
      const role = getProfileRole(profile);
      if (
        !isApprovedAccount(profile) ||
        profile?.residentAccess !== true ||
        ["admin", "superadmin"].includes(role)
      ) {
        throw makeHttpError(
          403,
          "resident_donor_required",
          "Only an approved Resident account can start a Donation checkout.",
        );
      }
      const campaignId = cleanText(request.body?.campaignId || "", 160);
      const amount = Number(request.body?.amount ?? 0);
      if (!campaignId || !/^[A-Za-z0-9_-]{6,160}$/.test(campaignId)) {
        throw makeHttpError(
          400,
          "invalid_campaign_id",
          "Choose a valid Donation Campaign.",
        );
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        throw makeHttpError(
          400,
          "invalid_donation_amount",
          "Enter a valid donation amount greater than zero.",
        );
      }
      const amountCentavos = Math.round(amount * 100);
      if (!Number.isSafeInteger(amountCentavos) || amountCentavos <= 0) {
        throw makeHttpError(
          400,
          "invalid_donation_amount",
          "The donation amount could not be converted to PHP centavos.",
        );
      }
      const returnBaseUrl = validatedPaymongoReturnBaseUrl(
        request.body?.returnBaseUrl,
      );
      const campaignRef = db.collection("donationCampaigns").doc(campaignId);
      const campaignSnapshot = await campaignRef.get();
      if (!campaignSnapshot.exists) {
        throw makeHttpError(
          404,
          "campaign_not_found",
          "The selected Donation Campaign was not found.",
        );
      }
      const campaign = campaignSnapshot.data() || {};
      if (cleanText(campaign.status || "", 40).toLowerCase() !== "published") {
        throw makeHttpError(
          409,
          "campaign_not_open",
          "This Donation Campaign is no longer open.",
        );
      }
      const acceptedTypes = cleanDonationTypes(campaign.acceptedDonationTypes);
      if (!acceptedTypes.includes("monetary")) {
        throw makeHttpError(
          409,
          "monetary_donation_unavailable",
          "This campaign is not accepting monetary donations.",
        );
      }
      const goal = Number(campaign.monetaryGoal || 0);
      const raised = Number(campaign.verifiedAmountReceived || 0);
      const publicLocationName = cleanText(
        campaign.handoffLocationName || "",
        180,
      );
      const publicLocationAddress = cleanText(
        campaign.handoffAddress || "",
        320,
      );
      if (!Number.isFinite(goal) || goal <= 0) {
        throw makeHttpError(
          409,
          "campaign_funding_goal_missing",
          "This campaign is missing its verified monetary goal. Ask the LGU/Admin to complete the campaign setup first.",
        );
      }
      if (!publicLocationName || !publicLocationAddress) {
        throw makeHttpError(
          409,
          "campaign_public_location_missing",
          "This campaign is missing its LGU-approved public service location. Ask the LGU/Admin to complete the campaign setup first.",
        );
      }
      const safeRaised = Number.isFinite(raised) ? Math.max(0, raised) : 0;
      const remaining = Math.max(0, goal - safeRaised);
      if (remaining <= 0) {
        throw makeHttpError(
          409,
          "campaign_fully_funded",
          "This campaign has already reached its verified funding goal.",
        );
      }
      if (amount - remaining > 0.009) {
        throw makeHttpError(
          409,
          "donation_exceeds_remaining_goal",
          `The remaining verified funding need is PHP ${remaining.toFixed(2)}. Enter an amount that does not exceed the remaining goal.`,
        );
      }
      donationRef = db.collection("donations").doc();
      const donationId = donationRef.id;
      const donorName = cleanText(
        profile?.fullName ||
          request.firebaseUser?.name ||
          request.firebaseUser?.email ||
          "Donor",
        160,
      );
      const successUrl = new URL(returnBaseUrl.toString());
      successUrl.searchParams.set("payment", "success");
      successUrl.searchParams.set("donationId", donationId);
      const cancelUrl = new URL(returnBaseUrl.toString());
      cancelUrl.searchParams.set("payment", "cancelled");
      cancelUrl.searchParams.set("donationId", donationId);
      await donationRef.set({
        donationId,
        source: "campaign_submission",
        campaignId,
        campaignTitle: cleanText(
          campaign.title || "LGU Donation Campaign",
          160,
        ),
        campaignBarangays: Array.isArray(campaign.barangays)
          ? campaign.barangays.slice(0, 20)
          : [],
        donorUid: uid,
        donorName,
        donorDisplayName: maskDonationName(donorName),
        donationType: "monetary",
        amount,
        transactionReference: "",
        donorNote: "",
        proofUrls: [],
        status: "payment_creating",
        actualAmountReceived: 0,
        rejectionReason: "",
        paymentProvider: "paymongo",
        paymentMode: "test",
        paymentStatus: "creating_checkout",
        paymongoReferenceNumber: donationId,
        paymongoCheckoutSessionId: "",
        paymongoCheckoutUrl: "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const checkoutResponse = await fetch(
        `${PAYMONGO_API_BASE}/v2/checkout_sessions`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
            "Content-Type": "application/json",
            "Idempotency-Key": donationId,
          },
          body: JSON.stringify({
            data: {
              attributes: {
                line_items: [
                  {
                    name: cleanText(
                      `VolunServe Donation - ${campaign.title || "Campaign"}`,
                      120,
                    ),
                    amount: amountCentavos,
                    currency: "PHP",
                    quantity: 1,
                  },
                ],
                payment_method_types: ["gcash"],
                success_url: successUrl.toString(),
                cancel_url: cancelUrl.toString(),
                reference_number: donationId,
                description: cleanText(
                  `Test donation for ${campaign.title || "VolunServe campaign"}`,
                  255,
                ),
              },
            },
          }),
        },
      );
      const checkoutPayload = await checkoutResponse.json().catch(() => null);
      if (!checkoutResponse.ok) {
        const message = paymongoCheckoutErrorMessage(
          checkoutPayload,
          `PayMongo checkout failed with HTTP ${checkoutResponse.status}.`,
        );
        await donationRef.set(
          {
            status: "payment_failed",
            paymentStatus: "checkout_creation_failed",
            paymentError: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        throw makeHttpError(
          checkoutResponse.status >= 400 && checkoutResponse.status < 500
            ? 400
            : 502,
          "paymongo_checkout_creation_failed",
          message,
        );
      }
      const session = checkoutPayload?.data || {};
      const sessionId = cleanText(session?.id || "", 180);
      const checkoutUrl = cleanText(
        session?.attributes?.checkout_url || "",
        1200,
      );
      if (!sessionId || !checkoutUrl.startsWith("https://checkout.paymongo.com/")) {
        await donationRef.set(
          {
            status: "payment_failed",
            paymentStatus: "invalid_checkout_response",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        throw makeHttpError(
          502,
          "invalid_paymongo_checkout_response",
          "PayMongo did not return a valid hosted checkout URL.",
        );
      }
      await donationRef.set(
        {
          status: "payment_pending",
          paymentStatus: "awaiting_payment",
          transactionReference: sessionId,
          paymongoCheckoutSessionId: sessionId,
          paymongoCheckoutUrl: checkoutUrl,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return response.status(200).json({
        ok: true,
        mode: "test",
        donationId,
        checkoutSessionId: sessionId,
        checkoutUrl,
      });
    } catch (error) {
      console.error("PayMongo checkout creation failed:", error);
      if (donationRef && error?.code !== "paymongo_checkout_creation_failed") {
        try {
          await donationRef.set(
            {
              status: "payment_failed",
              paymentStatus: "checkout_creation_failed",
              paymentError: cleanText(error?.message || "Checkout creation failed.", 700),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } catch (writeError) {
          console.error("Unable to record PayMongo checkout failure:", writeError);
        }
      }
      return response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "paymongo_checkout_creation_failed", 120),
        message: cleanText(
          error?.message || "Unable to start PayMongo test checkout.",
          700,
        ),
      });
    }
  },
);
// =========================================================
// SECURE ADMIN DONATION OPERATIONS
// =========================================================
// All privileged Donation Admin mutations run through Firebase Admin SDK.
// Client apps may keep Firestore listeners for allowed reads, but campaign
// publication/closure and receipt verification/rejection are backend-gated.
// =========================================================
const normalizeDonationReference = (value) =>
  cleanText(value || "", 160)
    .toLowerCase()
    .replace(/\s+/g, "");
const normalizePrivacyComparableText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const publicCopyContainsPrivateAssistanceValue = (publicCopy, privateValue) => {
  const publicComparable = normalizePrivacyComparableText(publicCopy);
  const privateComparable = normalizePrivacyComparableText(privateValue);
  return (
    privateComparable.length >= 6 &&
    publicComparable.includes(privateComparable)
  );
};
const assistanceCategoryToPublicCategory = (value) => {
  const category = cleanText(value || "", 80).toLowerCase();
  if (
    [
      "medical_health",
      "surgery_treatment",
      "cancer_serious_illness",
    ].includes(category)
  ) {
    return "medical";
  }
  if (category === "disaster_recovery") return "other";
  if (category === "homeless_basic_needs") return "other";
  if (category === "elderly_assistance") return "other";
  if (category === "animal_pet_welfare") return "other";
  return "other";
};
const assistanceLocationToDonationLocationType = (value) => {
  const type = cleanText(value || "", 80).toLowerCase();
  const mapping = {
    barangay_hall: "barangay_relief_desk",
    lgu_office: "city_hall",
    hospital_social_service: "hospital_social_service",
    social_welfare_office: "social_welfare_office",
    vet_clinic: "veterinary_clinic",
    authorized_public_point: "other",
  };
  return mapping[type] || "other";
};
const cleanDonationTypes = (value) => {
  if (!Array.isArray(value)) return ["monetary"];
  return value
    .map((item) => cleanText(item || "", 30).toLowerCase())
    .includes("monetary")
    ? ["monetary"]
    : [];
};
app.post(
  "/api/admin/donations/campaigns",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const sourceType = cleanText(request.body?.sourceType || "", 80).toLowerCase();
      const sourceId = cleanText(request.body?.sourceId || "", 160);
      if (
        ![
          "disaster_relief_need",
          "community_assistance_request",
        ].includes(sourceType)
      ) {
        throw makeHttpError(
          400,
          "invalid_campaign_source",
          "Choose a valid verified Donation Campaign source.",
        );
      }
      if (!sourceId || !/^[A-Za-z0-9_-]{6,160}$/.test(sourceId)) {
        throw makeHttpError(
          400,
          "invalid_campaign_source_id",
          "The verified Donation Campaign source ID is invalid.",
        );
      }
      const title = cleanText(request.body?.title || "", 160);
      const description = cleanText(request.body?.description || "", 1200);
      const story = cleanText(request.body?.publicStory || "", 1200);
      const incidentType = cleanText(request.body?.publicIncidentType || "", 120);
      const severity = cleanText(request.body?.publicSeverity || "", 80);
      const acceptedDonationTypes = cleanDonationTypes(
        request.body?.acceptedDonationTypes,
      );
      const officialChannelLabel = cleanText(
        request.body?.officialChannelLabel || "",
        160,
      );
      const officialChannelInstructions = cleanText(
        request.body?.officialChannelInstructions || "",
        1000,
      );
      const requestedGoal = Number(request.body?.monetaryGoal ?? 0);
      const requestedPublicLocation = cleanText(
        request.body?.publicLocationLabel || "",
        240,
      );
      const requestedHandoffLocationName = cleanText(
        request.body?.handoffLocationName || "",
        180,
      );
      const requestedHandoffAddress = cleanText(
        request.body?.handoffAddress || "",
        320,
      );
      const requestedHandoffNotes = cleanText(
        request.body?.handoffNotes || "",
        600,
      );
      const requestedPhotoUrls = Array.isArray(request.body?.publicPhotoUrls)
        ? request.body.publicPhotoUrls
            .map((item) => cleanText(item || "", 1000))
            .filter((item) => item.startsWith("https://"))
            .slice(0, 5)
        : [];
      if (requestedPhotoUrls.length < 1) {
        throw makeHttpError(
          400,
          "public_campaign_photo_required",
          "Add at least one LGU-approved public campaign photo before publishing.",
        );
      }
      if (title.length < 5) {
        throw makeHttpError(400, "campaign_title_required", "Enter a clear campaign title.");
      }
      if (description.length < 15) {
        throw makeHttpError(
          400,
          "campaign_description_required",
          "Enter a clear privacy-safe campaign description.",
        );
      }
      if (story.length < 30) {
        throw makeHttpError(
          400,
          "campaign_story_required",
          "Enter a privacy-safe public situation summary before publishing.",
        );
      }
      if (incidentType.length < 2 || severity.length < 2) {
        throw makeHttpError(
          400,
          "campaign_public_details_required",
          "Confirm the public case category and LGU-assessed priority.",
        );
      }
      if (acceptedDonationTypes.length !== 1 || acceptedDonationTypes[0] !== "monetary") {
        throw makeHttpError(
          400,
          "monetary_donation_required",
          "Donation campaigns currently accept monetary support only.",
        );
      }
      if (!Number.isFinite(requestedGoal) || requestedGoal <= 0) {
        throw makeHttpError(
          400,
          "funding_goal_required",
          "Enter the verified monetary amount still needed.",
        );
      }
      if (officialChannelLabel.length < 3 || officialChannelInstructions.length < 10) {
        throw makeHttpError(
          400,
          "official_channel_required",
          "Enter the official LGU monetary channel and clear payment or receipt instructions.",
        );
      }
      const campaignRef = db.collection("donationCampaigns").doc();
      const activityRef = db.collection("adminActivityLogs").doc();
      let sourceSummary = null;
      if (sourceType === "community_assistance_request") {
        const assistanceRef = db.collection("assistanceRequests").doc(sourceId);
        const reviewRef = db.collection("assistanceVerificationReviews").doc(sourceId);
        sourceSummary = await db.runTransaction(async (transaction) => {
          const [assistanceSnapshot, reviewSnapshot] = await Promise.all([
            transaction.get(assistanceRef),
            transaction.get(reviewRef),
          ]);
          if (!assistanceSnapshot.exists) {
            throw makeHttpError(
              404,
              "assistance_request_not_found",
              "The verified Assistance Request was not found.",
            );
          }
          if (!reviewSnapshot.exists) {
            throw makeHttpError(
              409,
              "assistance_review_not_found",
              "The protected LGU verification record was not found.",
            );
          }
          const assistance = assistanceSnapshot.data() || {};
          const review = reviewSnapshot.data() || {};
          if (
            cleanText(assistance.verificationStatus || "", 60).toLowerCase() !== "verified" ||
            cleanText(review.finalDecision || "", 60).toLowerCase() !== "verified"
          ) {
            throw makeHttpError(
              409,
              "verified_assistance_required",
              "Only a final LGU-verified Assistance Request can open Donation Support.",
            );
          }
          if (
            cleanText(assistance.supportDecision || "", 60).toLowerCase() !==
            "donation_support"
          ) {
            throw makeHttpError(
              409,
              "donation_support_not_approved",
              "LGU Resource Assessment must confirm Donation Support Needed first.",
            );
          }
          const sourcePublicPhotoUrl =
            cleanText(
              assistance.publicCampaignPhotoUrl || "",
              1000,
            );
          if (
            assistance.publicCampaignPhotoConsent !== true ||
            !sourcePublicPhotoUrl.startsWith("https://")
          ) {
            throw makeHttpError(
              409,
              "resident_public_campaign_photo_required",
              "The Assistance Request must include the Resident-consented public campaign photo before Donation Support can be published.",
            );
          }
          const remainingAmount = Number(assistance.remainingAmount || 0);
          if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
            throw makeHttpError(
              409,
              "verified_shortage_required",
              "A verified remaining unmet amount is required before publishing Donation Support.",
            );
          }
          const locationName = cleanText(assistance.assignedLocationName || "", 180);
          const locationAddress = cleanText(assistance.assignedLocationAddress || "", 320);
          const locationNotes = cleanText(assistance.assignedLocationNotes || "", 600);
          const sourceLocationType = cleanText(
            assistance.assignedLocationType || "",
            80,
          ).toLowerCase();
          if (locationName.length < 3 || locationAddress.length < 5) {
            throw makeHttpError(
              409,
              "official_location_required",
              "Save the LGU-approved public service location before publishing a community campaign.",
            );
          }
          const preferredTypes = Array.isArray(assistance.preferredAssistanceTypes)
            ? assistance.preferredAssistanceTypes
                .map((item) => cleanText(item || "", 30).toLowerCase())
                .filter((item) => item === "monetary")
            : [];
          if (
            acceptedDonationTypes.some(
              (item) => preferredTypes.length && !preferredTypes.includes(item),
            )
          ) {
            throw makeHttpError(
              400,
              "donation_type_not_verified",
              "The selected donation type was not part of the verified Assistance Request.",
            );
          }
          if (
            acceptedDonationTypes.includes("monetary") &&
            Math.abs(requestedGoal - remainingAmount) > 0.009
          ) {
            throw makeHttpError(
              400,
              "funding_goal_must_match_verified_shortage",
              `The public funding goal must match the verified remaining unmet amount of PHP ${remainingAmount.toLocaleString("en-PH")}.`,
            );
          }
          const linkedCampaignId = cleanText(assistance.donationCampaignId || "", 160);
          if (linkedCampaignId) {
            const linkedCampaignRef = db.collection("donationCampaigns").doc(linkedCampaignId);
            const linkedCampaignSnapshot = await transaction.get(linkedCampaignRef);
            if (
              linkedCampaignSnapshot.exists &&
              cleanText(linkedCampaignSnapshot.data()?.status || "", 40).toLowerCase() ===
                "published"
            ) {
              throw makeHttpError(
                409,
                "campaign_already_active",
                "This verified Assistance Request already has an active Donation Campaign.",
              );
            }
          }
          const barangay =
            cleanText(assistance.requesterBarangay || "", 120) ||
            "San Jose del Monte";
          const generalArea = barangay.toLowerCase().includes("san jose del monte")
            ? barangay
            : `${barangay}, City of San Jose del Monte, Bulacan`;
          const category =
            cleanText(assistance.category || "community_assistance", 80)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "") || "community_assistance";
          const categoryLabel =
            cleanText(
              assistance.categoryLabel || assistance.category || "Community Assistance",
              120,
            ) || "Community Assistance";
          // Community Assistance campaigns are intentionally privacy-safe.
          // Do not allow public copy to repeat private source values from the
          // Assistance Request, even though those private fields are never
          // copied into the public campaign document itself.
          const publicCopy = [title, description, story].join(" ");
          const privateSourceValues = [
            assistance.requesterAddress,
            assistance.contactNumber,
            assistance.requesterEmail,
            assistance.requesterName,
            assistance.beneficiaryName,
          ];
          if (
            privateSourceValues.some((value) =>
              publicCopyContainsPrivateAssistanceValue(publicCopy, value),
            )
          ) {
            throw makeHttpError(
              400,
              "private_assistance_data_in_public_copy",
              "Remove private Resident identity, contact, or home-address details from the public campaign text.",
            );
          }
          const publicCategory = assistanceCategoryToPublicCategory(category);
          const publicNeeds = [
            {
              category: publicCategory,
              label: `${categoryLabel} support`,
              needed: remainingAmount,
              unit: "PHP",
            },
          ];
          const campaignPayload = {
            campaignId: campaignRef.id,
            title,
            description,
            status: "published",
            sourceType: "community_assistance_request",
            campaignGroup: "community_needs_help",
            campaignCategory: category,
            beneficiaryType: "Verified Resident Assistance",
            generalArea,
            sourceNeedAssessmentIds: [],
            sourceAssistanceRequestId: sourceId,
            barangays: [barangay],
            acceptedDonationTypes,
            officialChannelLabel,
            officialChannelInstructions,
            monetaryGoal: remainingAmount,
            verifiedAmountReceived: 0,
            handoffLocationType: assistanceLocationToDonationLocationType(
              sourceLocationType,
            ),
            handoffLocationName: locationName,
            handoffAddress: locationAddress,
            handoffNotes: locationNotes,
            publicStory: story,
            publicLocationLabel: generalArea,
            publicIncidentType: categoryLabel,
            publicSeverity: "LGU verified need",
            publicPhotoUrls: requestedPhotoUrls,
            affectedHouseholds: 1,
            affectedPeople: 1,
            publicNeeds,
            createdBy: adminUid,
            createdAt: FieldValue.serverTimestamp(),
            updatedBy: adminUid,
            updatedAt: FieldValue.serverTimestamp(),
          };
          transaction.set(campaignRef, campaignPayload);
          // Link the campaign without rewriting the original LGU review
          // timestamp/person. The activity log below records who published it.
          transaction.update(assistanceRef, {
            donationCampaignId: campaignRef.id,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.set(activityRef, {
            action: "Community Assistance Donation Campaign Published",
            campaignId: campaignRef.id,
            assistanceRequestId: sourceId,
            performedBy: adminUid,
            timestamp: FieldValue.serverTimestamp(),
          });
          return {
            campaignId: campaignRef.id,
            campaignGroup: "community_needs_help",
            sourceType: "community_assistance_request",
            monetaryGoal: campaignPayload.monetaryGoal,
          };
        });
      } else {
        const assessmentRef = db.collection("barangayNeedAssessments").doc(sourceId);
        const existingCampaignsSnapshot = await db
          .collection("donationCampaigns")
          .where("status", "==", "published")
          .get();
        const duplicate = existingCampaignsSnapshot.docs.some((item) => {
          const ids = item.data()?.sourceNeedAssessmentIds;
          return Array.isArray(ids) && ids.includes(sourceId);
        });
        if (duplicate) {
          throw makeHttpError(
            409,
            "campaign_already_active",
            "This verified relief need already has an active Donation Campaign.",
          );
        }
        sourceSummary = await db.runTransaction(async (transaction) => {
          const assessmentSnapshot = await transaction.get(assessmentRef);
          if (!assessmentSnapshot.exists) {
            throw makeHttpError(
              404,
              "relief_need_not_found",
              "The selected verified relief need no longer exists.",
            );
          }
          const assessment = assessmentSnapshot.data() || {};
          const status = cleanText(assessment.status || "", 60).toLowerCase();
          if (!["verified", "partially_allocated"].includes(status)) {
            throw makeHttpError(
              409,
              "relief_need_not_active",
              "Only an active verified relief need can open Donation Support.",
            );
          }
          if (requestedPublicLocation.length < 3) {
            throw makeHttpError(
              400,
              "public_location_required",
              "Enter a privacy-safe public area before publishing.",
            );
          }
          if (
            requestedHandoffLocationName.length < 3 ||
            requestedHandoffAddress.length < 5
          ) {
            throw makeHttpError(
              400,
              "official_public_location_required",
              "Set the LGU-approved public service or coordination point before publishing the disaster campaign.",
            );
          }
          const barangay = cleanText(assessment.barangay || "", 120);
          const categoryPairs = [
            ["food", Number(assessment.peopleNeedingFood || 0), "Food support", "people"],
            ["water", Number(assessment.peopleNeedingWater || 0), "Drinking water", "people"],
            ["clothing", Number(assessment.peopleNeedingClothing || 0), "Clothing", "people"],
            ["medical", Number(assessment.peopleNeedingMedical || 0), "Medical support", "people"],
            ["shelter", Number(assessment.householdsNeedingShelter || 0), "Temporary shelter", "households"],
            ["hygiene", Number(assessment.householdsNeedingHygiene || 0), "Hygiene kits", "households"],
          ];
          const publicNeeds = categoryPairs
            .filter((item) => Number(item[1]) > 0)
            .map((item) => ({
              category: item[0],
              label: item[2],
              needed: Number(item[1]),
              unit: item[3],
            }))
            .slice(0, 6);
          const otherNeedDescription = cleanText(
            assessment.otherNeedDescription || "",
            160,
          );
          if (otherNeedDescription && publicNeeds.length < 7) {
            publicNeeds.push({
              category: "other",
              label: otherNeedDescription,
            });
          }
          const campaignCategory =
            cleanText(request.body?.campaignCategory || incidentType || "disaster_relief", 80)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "") || "disaster_relief";
          const affectedHouseholds = Math.max(
            1,
            Math.trunc(Number(assessment.affectedHouseholds || 1)),
          );
          const affectedPeople = Math.max(
            1,
            Math.trunc(Number(assessment.affectedPeople || 1)),
          );
          const campaignPayload = {
            campaignId: campaignRef.id,
            title,
            description,
            status: "published",
            sourceType: "disaster_relief_need",
            campaignGroup: "disaster_affected",
            campaignCategory,
            beneficiaryType:
              affectedHouseholds === 1 ? "Household Relief" : "Community Relief",
            generalArea: requestedPublicLocation,
            sourceNeedAssessmentIds: [sourceId],
            sourceAssistanceRequestId: "",
            barangays: [barangay || "San Jose del Monte"],
            acceptedDonationTypes,
            officialChannelLabel,
            officialChannelInstructions,
            monetaryGoal: requestedGoal,
            verifiedAmountReceived: 0,
            handoffLocationType: "lgu_public_service_point",
            handoffLocationName: requestedHandoffLocationName,
            handoffAddress: requestedHandoffAddress,
            handoffNotes: requestedHandoffNotes,
            publicStory: story,
            publicLocationLabel: requestedPublicLocation,
            publicIncidentType: incidentType,
            publicSeverity: severity,
            publicPhotoUrls: requestedPhotoUrls,
            affectedHouseholds,
            affectedPeople,
            publicNeeds,
            createdBy: adminUid,
            createdAt: FieldValue.serverTimestamp(),
            updatedBy: adminUid,
            updatedAt: FieldValue.serverTimestamp(),
          };
          transaction.set(campaignRef, campaignPayload);
          transaction.set(activityRef, {
            action: "Donation Campaign Published",
            campaignId: campaignRef.id,
            needAssessmentId: sourceId,
            barangay,
            performedBy: adminUid,
            timestamp: FieldValue.serverTimestamp(),
          });
          return {
            campaignId: campaignRef.id,
            campaignGroup: "disaster_affected",
            sourceType: "disaster_relief_need",
            monetaryGoal: campaignPayload.monetaryGoal,
          };
        });
      }
      response.status(201).json({
        ok: true,
        ...sourceSummary,
      });
    } catch (error) {
      console.error("Donation campaign publication failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "donation_campaign_failed", 120),
        message: cleanText(
          error?.message || "Unable to publish the Donation Campaign.",
          700,
        ),
      });
    }
  },
);
// Complete or repair a published disaster campaign that predates the
// monetary-only public-location requirements. Community Assistance locations
// remain locked to their verified Assistance Request source.
app.post(
  "/api/admin/donations/campaigns/:campaignId/public-setup",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const campaignId = cleanText(request.params?.campaignId || "", 160);
      const monetaryGoal = Number(request.body?.monetaryGoal ?? 0);
      const handoffLocationName = cleanText(
        request.body?.handoffLocationName || "",
        180,
      );
      const handoffAddress = cleanText(
        request.body?.handoffAddress || "",
        320,
      );
      const handoffNotes = cleanText(
        request.body?.handoffNotes || "",
        600,
      );
      if (!campaignId || !/^[A-Za-z0-9_-]{6,160}$/.test(campaignId)) {
        throw makeHttpError(400, "invalid_campaign_id", "Choose a valid Donation Campaign.");
      }
      if (!Number.isFinite(monetaryGoal) || monetaryGoal <= 0) {
        throw makeHttpError(
          400,
          "funding_goal_required",
          "Enter the verified monetary goal for this campaign.",
        );
      }
      if (handoffLocationName.length < 3 || handoffAddress.length < 5) {
        throw makeHttpError(
          400,
          "official_public_location_required",
          "Enter the LGU-approved public service location name and address.",
        );
      }
      const campaignRef = db.collection("donationCampaigns").doc(campaignId);
      const activityRef = db.collection("adminActivityLogs").doc();
      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(campaignRef);
        if (!snapshot.exists) {
          throw makeHttpError(404, "campaign_not_found", "The Donation Campaign was not found.");
        }
        const campaign = snapshot.data() || {};
        const sourceType = cleanText(campaign.sourceType || "", 80).toLowerCase();
        const status = cleanText(campaign.status || "", 40).toLowerCase();
        const verifiedAmountReceived = Number(campaign.verifiedAmountReceived || 0);
        if (sourceType !== "disaster_relief_need") {
          throw makeHttpError(
            409,
            "community_location_locked",
            "Community Assistance campaign locations must remain linked to the verified Assistance Request.",
          );
        }
        if (status !== "published") {
          throw makeHttpError(
            409,
            "published_campaign_required",
            "Only a currently published disaster campaign can be completed from this screen.",
          );
        }
        if (
          Number.isFinite(verifiedAmountReceived) &&
          monetaryGoal + 0.009 < Math.max(0, verifiedAmountReceived)
        ) {
          throw makeHttpError(
            409,
            "funding_goal_below_verified_amount",
            "The funding goal cannot be lower than the amount already verified for this campaign.",
          );
        }
        transaction.update(campaignRef, {
          monetaryGoal,
          handoffLocationType: "lgu_public_service_point",
          handoffLocationName,
          handoffAddress,
          handoffNotes,
          updatedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(activityRef, {
          action: "Donation Campaign Public Setup Completed",
          campaignId,
          monetaryGoal,
          handoffLocationName,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });
        return {
          campaignId,
          monetaryGoal,
          handoffLocationName,
          handoffAddress,
        };
      });
      response.json({ ok: true, ...result });
    } catch (error) {
      console.error("Donation campaign public setup update failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "campaign_public_setup_failed", 120),
        message: cleanText(
          error?.message || "Unable to update the Donation Campaign public setup.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/admin/donations/campaigns/:campaignId/public-photos",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const campaignId = cleanText(request.params?.campaignId || "", 160);
      const rawPhotoUrls = request.body?.publicPhotoUrls;
      if (!campaignId) {
        throw makeHttpError(
          400,
          "invalid_campaign_id",
          "The Donation Campaign ID is invalid.",
        );
      }
      if (!Array.isArray(rawPhotoUrls)) {
        throw makeHttpError(
          400,
          "invalid_public_photo_list",
          "Public campaign photos must be submitted as a list.",
        );
      }
      if (rawPhotoUrls.length > 5) {
        throw makeHttpError(
          400,
          "public_photo_limit",
          "A Donation Campaign may publish up to 5 public photos.",
        );
      }
      const publicPhotoUrls = Array.from(
        new Set(
          rawPhotoUrls
            .map((item) => cleanText(item || "", 1000))
            .filter((item) => item.startsWith("https://")),
        ),
      ).slice(0, 5);
      if (publicPhotoUrls.length !== rawPhotoUrls.length) {
        throw makeHttpError(
          400,
          "invalid_public_photo_url",
          "Every public campaign photo must use a valid HTTPS URL.",
        );
      }
      const campaignRef = db.collection("donationCampaigns").doc(campaignId);
      const activityRef = db.collection("adminActivityLogs").doc();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(campaignRef);
        if (!snapshot.exists) {
          throw makeHttpError(
            404,
            "campaign_not_found",
            "The Donation Campaign no longer exists.",
          );
        }
        const campaign = snapshot.data() || {};
        if (String(campaign.status || "") !== "published") {
          throw makeHttpError(
            409,
            "campaign_not_published",
            "Only a published Donation Campaign can update public photos.",
          );
        }
        transaction.update(campaignRef, {
          publicPhotoUrls,
          updatedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(activityRef, {
          action: "Donation Campaign Public Photos Updated",
          campaignId,
          publicPhotoCount: publicPhotoUrls.length,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });
      });
      response.json({
        ok: true,
        campaignId,
        publicPhotoUrls,
      });
    } catch (error) {
      console.error("Donation campaign public photo update failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "donation_public_photos_failed", 120),
        message: cleanText(
          error?.message || "Unable to update public campaign photos.",
          700,
        ),
      });
    }
  },
);
app.post(
  "/api/admin/donations/campaigns/:campaignId/close",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const campaignId = cleanText(request.params?.campaignId || "", 160);
      if (!campaignId) {
        throw makeHttpError(400, "invalid_campaign_id", "The Donation Campaign ID is invalid.");
      }
      const campaignRef = db.collection("donationCampaigns").doc(campaignId);
      const activityRef = db.collection("adminActivityLogs").doc();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(campaignRef);
        if (!snapshot.exists) {
          throw makeHttpError(404, "campaign_not_found", "The Donation Campaign was not found.");
        }
        if (cleanText(snapshot.data()?.status || "", 40).toLowerCase() !== "published") {
          throw makeHttpError(409, "campaign_not_active", "Only a published campaign can be closed.");
        }
        transaction.update(campaignRef, {
          status: "closed",
          closedBy: adminUid,
          closedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(activityRef, {
          action: "Donation Campaign Closed",
          campaignId,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });
      });
      response.status(200).json({ ok: true, campaignId, status: "closed" });
    } catch (error) {
      console.error("Donation campaign close failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "donation_campaign_close_failed", 120),
        message: cleanText(error?.message || "Unable to close the Donation Campaign.", 700),
      });
    }
  },
);
app.post(
  "/api/admin/donations/:donationId/verify",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const donationId = cleanText(request.params?.donationId || "", 160);
      const actual = Number(request.body?.actualValue ?? 0);
      if (!donationId) {
        throw makeHttpError(400, "invalid_donation_id", "The Donation submission ID is invalid.");
      }
      if (!Number.isFinite(actual) || actual <= 0) {
        throw makeHttpError(
          400,
          "actual_receipt_required",
          "Enter the actual monetary amount confirmed by the LGU.",
        );
      }
      const donationRef = db.collection("donations").doc(donationId);
      const activityRef = db.collection("adminActivityLogs").doc();
      const existingSnapshot = await donationRef.get();
      if (!existingSnapshot.exists) {
        throw makeHttpError(404, "donation_not_found", "The Donation submission was not found.");
      }
      const existing = existingSnapshot.data() || {};
      const donationType = cleanText(existing.donationType || "", 40).toLowerCase();
      if (donationType !== "monetary") {
        throw makeHttpError(
          409,
          "monetary_donation_required",
          "Only monetary donation submissions are supported in the current thesis scope.",
        );
      }
      let monetaryReferenceRegistryRef = null;
      {
        const normalizedReference = normalizeDonationReference(existing.transactionReference);
        if (normalizedReference.length < 4) {
          throw makeHttpError(
            409,
            "transaction_reference_invalid",
            "This monetary submission does not contain a valid donor transaction reference.",
          );
        }
        // Use a single-field query so this backend path does not require a
        // new composite Firestore index just to check older verified records.
        // The hashed registry below is the atomic guard for new verifications.
        const receivedSnapshot = await db
          .collection("donations")
          .where("status", "==", "received")
          .get();
        const duplicate = receivedSnapshot.docs.find(
          (item) =>
            item.id !== donationId &&
            cleanText(item.data()?.donationType || "", 40).toLowerCase() ===
              "monetary" &&
            normalizeDonationReference(item.data()?.transactionReference) ===
              normalizedReference,
        );
        if (duplicate) {
          throw makeHttpError(
            409,
            "duplicate_transaction_reference",
            "This donor transaction reference is already linked to another verified donation.",
          );
        }
        const referenceHash = crypto
          .createHash("sha256")
          .update(normalizedReference)
          .digest("hex");
        monetaryReferenceRegistryRef = db
          .collection("donationTransactionReferences")
          .doc(referenceHash);
      }
      const result = await db.runTransaction(async (transaction) => {
        const donationSnapshot = await transaction.get(donationRef);
        if (!donationSnapshot.exists) {
          throw makeHttpError(404, "donation_not_found", "The Donation submission was not found.");
        }
        const current = donationSnapshot.data() || {};
        if (cleanText(current.status || "", 40).toLowerCase() !== "submitted") {
          throw makeHttpError(409, "donation_already_reviewed", "This donation has already been reviewed.");
        }
        const currentType = cleanText(current.donationType || "", 40).toLowerCase();
        if (currentType !== "monetary") {
          throw makeHttpError(
            409,
            "monetary_donation_required",
            "Only monetary donation submissions are supported in the current thesis scope.",
          );
        }
        let nextVerifiedAmountReceived = 0;
        let campaignRef = null;
        {
          if (monetaryReferenceRegistryRef) {
            const registrySnapshot = await transaction.get(monetaryReferenceRegistryRef);
            if (registrySnapshot.exists && registrySnapshot.data()?.donationId !== donationId) {
              throw makeHttpError(
                409,
                "duplicate_transaction_reference",
                "This donor transaction reference has already been verified.",
              );
            }
          }
          const campaignId = cleanText(current.campaignId || "", 160);
          if (!campaignId) {
            throw makeHttpError(
              409,
              "campaign_link_required",
              "This monetary donation is not linked to a Donation Campaign.",
            );
          }
          campaignRef = db.collection("donationCampaigns").doc(campaignId);
          const campaignSnapshot = await transaction.get(campaignRef);
          if (!campaignSnapshot.exists) {
            throw makeHttpError(
              404,
              "campaign_not_found",
              "The linked Donation Campaign was not found.",
            );
          }
          const currentVerifiedAmount = Number(
            campaignSnapshot.data()?.verifiedAmountReceived || 0,
          );
          nextVerifiedAmountReceived =
            (Number.isFinite(currentVerifiedAmount) ? currentVerifiedAmount : 0) + actual;
        }
        if (campaignRef) {
          transaction.update(campaignRef, {
            verifiedAmountReceived: nextVerifiedAmountReceived,
            updatedBy: adminUid,
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (monetaryReferenceRegistryRef) {
            transaction.set(monetaryReferenceRegistryRef, {
              donationId,
              campaignId: cleanText(current.campaignId || "", 160),
              verifiedBy: adminUid,
              verifiedAt: FieldValue.serverTimestamp(),
            });
          }
        }
        transaction.update(donationRef, {
          status: "received",
          actualAmountReceived: actual,
          verifiedBy: adminUid,
          verifiedAt: FieldValue.serverTimestamp(),
          receivedBy: adminUid,
          receivedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          rejectionReason: "",
        });
        transaction.set(activityRef, {
          action: "Donation Verified as Received",
          donationId,
          campaignId: cleanText(current.campaignId || "", 160),
          donationType: "monetary",
          actualReceived: actual,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });
        return {
          donationType: "monetary",
          verifiedAmountReceived: nextVerifiedAmountReceived,
        };
      });
      response.status(200).json({ ok: true, donationId, ...result });
    } catch (error) {
      console.error("Donation verification failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "donation_verification_failed", 120),
        message: cleanText(error?.message || "Unable to verify the Donation submission.", 700),
      });
    }
  },
);
app.post(
  "/api/admin/donations/:donationId/reject",
  requireFirebaseUser,
  requireOperationalAdmin,
  async (request, response) => {
    try {
      const adminUid = request.firebaseUser.uid;
      const donationId = cleanText(request.params?.donationId || "", 160);
      const reason = cleanText(request.body?.rejectionReason || "", 600);
      if (!donationId) {
        throw makeHttpError(400, "invalid_donation_id", "The Donation submission ID is invalid.");
      }
      if (reason.length < 5) {
        throw makeHttpError(400, "rejection_reason_required", "Enter a clear rejection reason.");
      }
      const donationRef = db.collection("donations").doc(donationId);
      const activityRef = db.collection("adminActivityLogs").doc();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(donationRef);
        if (!snapshot.exists) {
          throw makeHttpError(404, "donation_not_found", "The Donation submission was not found.");
        }
        if (cleanText(snapshot.data()?.status || "", 40).toLowerCase() !== "submitted") {
          throw makeHttpError(409, "donation_already_reviewed", "This donation has already been reviewed.");
        }
        transaction.update(donationRef, {
          status: "rejected",
          rejectionReason: reason,
          rejectedBy: adminUid,
          rejectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(activityRef, {
          action: "Donation Submission Rejected",
          donationId,
          campaignId: cleanText(snapshot.data()?.campaignId || "", 160),
          reason,
          performedBy: adminUid,
          timestamp: FieldValue.serverTimestamp(),
        });
      });
      response.status(200).json({ ok: true, donationId, status: "rejected" });
    } catch (error) {
      console.error("Donation rejection failed:", error);
      response.status(Number(error?.statusCode) || 500).json({
        error: cleanText(error?.code || "donation_rejection_failed", 120),
        message: cleanText(error?.message || "Unable to reject the Donation submission.", 700),
      });
    }
  },
);
const port =
  Number(
    process.env.PORT ||
      10000,
  );
app.listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      `VolunServe backend listening on port ${port}`,
    );
  },
);
