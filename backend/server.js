"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const {
  auth,
  db,
  FieldValue,
} = require("./firebaseAdmin");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:19006",
  "http://localhost:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
];

const IDENTITY_UPLOAD_LIMIT = "20mb";
const IDENTITY_RETRY_DELAY_MS = 8000;

const ASSISTANCE_EVIDENCE_UPLOAD_LIMIT = "10mb";
const ASSISTANCE_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const ASSISTANCE_EVIDENCE_MAX_STAGED = 12;
const ASSISTANCE_EVIDENCE_URL_TTL_SECONDS = 300;

const ASSISTANCE_EVIDENCE_DOCUMENT_TYPES = new Set([
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

const allowedOrigins = getAllowedOrigins();

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
    // AI-assisted verification does not permanently reject a Resident.
    // A non-match is sent to LGU/Admin manual review.
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
    const token = getBearerToken(
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
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function getCloudinaryConfig() {
  const cloudName = cleanText(
    process.env.CLOUDINARY_CLOUD_NAME ||
      "netjawtz",
    120,
  );

  const apiKey = cleanText(
    process.env.CLOUDINARY_API_KEY || "",
    200,
  );

  const apiSecret = String(
    process.env.CLOUDINARY_API_SECRET || "",
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

function cloudinarySign(
  parameters,
  apiSecret,
) {
  const serialized = Object.keys(
    parameters,
  )
    .filter((key) => {
      const value = parameters[key];

      return (
        value !== undefined &&
        value !== null &&
        value !== ""
      );
    })
    .sort()
    .map(
      (key) =>
        `${key}=${String(
          parameters[key],
        )}`,
    )
    .join("&");

  return crypto
    .createHash("sha1")
    .update(
      `${serialized}${apiSecret}`,
      "utf8",
    )
    .digest("hex");
}

function sanitizeFileName(
  value,
) {
  const cleaned = cleanText(
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
    !Buffer.isBuffer(buffer) ||
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
      mimeType: "image/jpeg",
      extension: "jpg",
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
      mimeType: "image/png",
      extension: "png",
    };
  }

  if (
    buffer
      .subarray(0, 4)
      .toString("ascii") ===
      "RIFF" &&
    buffer
      .subarray(8, 12)
      .toString("ascii") ===
      "WEBP"
  ) {
    return {
      mimeType: "image/webp",
      extension: "webp",
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
      profile?.status || "",
      40,
    ).toLowerCase() ===
    "approved"
  );
}

function isVerifiedResidentProfile(
  profile,
) {
  return (
    isApprovedAccount(profile) &&
    profile?.residentAccess === true &&
    (
      profile?.identityVerified ===
        true ||
      normalizeIdentityStatus(
        profile?.identityStatus,
      ) === "verified"
    )
  );
}

function isOperationalAdminProfile(
  profile,
) {
  return (
    isApprovedAccount(profile) &&
    getProfileRole(profile) ===
      "admin"
  );
}

async function loadUserProfile(
  uid,
) {
  const snapshot =
    await db
      .collection("users")
      .doc(uid)
      .get();

  if (!snapshot.exists) {
    throw makeHttpError(
      404,
      "profile_not_found",
      "Your VolunServe profile was not found.",
    );
  }

  return snapshot.data() || {};
}

async function requireVerifiedResident(
  request,
  response,
  next,
) {
  try {
    const profile =
      await loadUserProfile(
        request.firebaseUser.uid,
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

    request.volunServeProfile =
      profile;

    next();
  } catch (error) {
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

async function uploadAssistanceEvidenceToCloudinary({
  buffer,
  mimeType,
  extension,
  uid,
}) {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } = getCloudinaryConfig();

  if (
    typeof fetch !== "function" ||
    typeof FormData ===
      "undefined" ||
    typeof Blob === "undefined"
  ) {
    throw makeHttpError(
      500,
      "secure_upload_runtime_unavailable",
      "This backend runtime does not provide the secure upload APIs required by VolunServe.",
    );
  }

  const timestamp =
    Math.floor(
      Date.now() / 1000,
    );

  const uniqueId =
    typeof crypto.randomUUID ===
    "function"
      ? crypto.randomUUID()
      : crypto
          .randomBytes(18)
          .toString("hex");

  const publicId =
    `volunserve/assistance-evidence/${uid}/${uniqueId}`;

  const signedParameters = {
    public_id: publicId,
    timestamp,
  };

  const signature =
    cloudinarySign(
      signedParameters,
      apiSecret,
    );

  const form =
    new FormData();

  form.append(
    "file",
    new Blob(
      [buffer],
      {
        type: mimeType,
      },
    ),
    `evidence.${extension}`,
  );

  form.append(
    "api_key",
    apiKey,
  );

  form.append(
    "timestamp",
    String(timestamp),
  );

  form.append(
    "public_id",
    publicId,
  );

  form.append(
    "signature",
    signature,
  );

  const response =
    await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        cloudName,
      )}/image/authenticated`,
      {
        method: "POST",
        body: form,
      },
    );

  const result =
    await readJsonResponse(
      response,
    );

  if (
    !response.ok ||
    !result?.asset_id ||
    !result?.public_id
  ) {
    throw makeHttpError(
      response.status >= 400 &&
        response.status <= 599
        ? response.status
        : 502,
      "secure_cloudinary_upload_failed",
      cleanText(
        result?.error?.message ||
          result?.message ||
          "Cloudinary could not securely store the assistance evidence.",
        500,
      ),
    );
  }

  return result;
}

function createCloudinaryPrivateDownloadUrl({
  publicId,
  format,
  resourceType = "image",
  deliveryType = "authenticated",
}) {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } = getCloudinaryConfig();

  const safePublicId = cleanText(
    publicId,
    500,
  );

  const safeFormat = cleanText(
    format,
    30,
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      "",
    );

  const safeResourceType = cleanText(
    resourceType,
    30,
  ).toLowerCase();

  const safeDeliveryType = cleanText(
    deliveryType,
    40,
  ).toLowerCase();

  if (!safePublicId || !safeFormat) {
    throw makeHttpError(
      409,
      "evidence_storage_reference_missing",
      "This evidence record is missing the protected Cloudinary public ID or format.",
    );
  }

  if (
    safeResourceType !== "image"
  ) {
    throw makeHttpError(
      409,
      "unsupported_evidence_resource_type",
      "This assistance evidence resource type is not supported.",
    );
  }

  if (
    safeDeliveryType !== "authenticated"
  ) {
    throw makeHttpError(
      409,
      "evidence_not_protected",
      "This assistance evidence is not stored using authenticated Cloudinary delivery.",
    );
  }

  const timestamp =
    Math.floor(
      Date.now() / 1000,
    );

  const expiresAt =
    timestamp +
    ASSISTANCE_EVIDENCE_URL_TTL_SECONDS;

  const signedParameters = {
    expires_at: expiresAt,
    format: safeFormat,
    public_id: safePublicId,
    timestamp,
    type: safeDeliveryType,
  };

  const signature =
    cloudinarySign(
      signedParameters,
      apiSecret,
    );

  const query =
    new URLSearchParams({
      timestamp:
        String(timestamp),
      public_id:
        safePublicId,
      format:
        safeFormat,
      expires_at:
        String(expiresAt),
      type:
        safeDeliveryType,
      signature,
      api_key:
        apiKey,
    });

  return {
    url:
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        cloudName,
      )}/${encodeURIComponent(
        safeResourceType,
      )}/download?${query.toString()}`,

    expiresAt,
  };
}

async function destroyAssistanceEvidenceFromCloudinary(
  publicId,
) {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } = getCloudinaryConfig();

  if (
    typeof fetch !== "function" ||
    typeof FormData ===
      "undefined"
  ) {
    throw makeHttpError(
      500,
      "secure_delete_runtime_unavailable",
      "This backend runtime does not provide the secure deletion APIs required by VolunServe.",
    );
  }

  const timestamp =
    Math.floor(
      Date.now() / 1000,
    );

  const signedParameters = {
    invalidate: "true",
    public_id: publicId,
    timestamp,
    type: "authenticated",
  };

  const signature =
    cloudinarySign(
      signedParameters,
      apiSecret,
    );

  const form =
    new FormData();

  form.append(
    "public_id",
    publicId,
  );

  form.append(
    "timestamp",
    String(timestamp),
  );

  form.append(
    "type",
    "authenticated",
  );

  form.append(
    "invalidate",
    "true",
  );

  form.append(
    "api_key",
    apiKey,
  );

  form.append(
    "signature",
    signature,
  );

  const response =
    await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        cloudName,
      )}/image/destroy`,
      {
        method: "POST",
        body: form,
      },
    );

  const result =
    await readJsonResponse(
      response,
    );

  if (
    !response.ok ||
    (
      result?.result !== "ok" &&
      result?.result !==
        "not found"
    )
  ) {
    throw makeHttpError(
      response.status >= 400 &&
        response.status <= 599
        ? response.status
        : 502,
      "secure_cloudinary_delete_failed",
      cleanText(
        result?.error?.message ||
          result?.message ||
          "Cloudinary could not delete the staged evidence.",
        500,
      ),
    );
  }

  return result;
}

async function getEvidenceAccessContext(
  uid,
  evidenceData,
) {
  if (
    evidenceData?.ownerUid === uid
  ) {
    return {
      owner: true,
      admin: false,
    };
  }

  const profile =
    await loadUserProfile(uid);

  if (
    isOperationalAdminProfile(
      profile,
    )
  ) {
    return {
      owner: false,
      admin: true,
    };
  }

  throw makeHttpError(
    403,
    "evidence_access_denied",
    "You are not authorized to access this private assistance evidence.",
  );
}

function getIdentityAiEndpoint() {
  const configured = cleanText(
    process.env.IDENTITY_AI_SERVICE_URL || "",
    1000,
  );

  if (!configured) {
    return "";
  }

  const baseUrl =
    configured.replace(/\/+$/, "");

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
      request.headers["content-type"],

    "X-VolunServe-User-Id":
      request.firebaseUser.uid,
  };

  const internalKey = String(
    process.env.IDENTITY_AI_INTERNAL_KEY || "",
  ).trim();

  if (internalKey) {
    headers[
      "X-VolunServe-Internal-Key"
    ] = internalKey;
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
    return JSON.parse(text);
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
    const error = new Error(
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
    request.body.length === 0
  ) {
    const error = new Error(
      "Government ID and selfie files are required.",
    );

    error.code =
      "missing_identity_media";

    error.statusCode =
      400;

    throw error;
  }

  const contentType = String(
    request.headers["content-type"] || "",
  ).toLowerCase();

  if (
    !contentType.startsWith(
      "multipart/form-data",
    )
  ) {
    const error = new Error(
      "Identity verification must be submitted as multipart form data.",
    );

    error.code =
      "invalid_content_type";

    error.statusCode =
      415;

    throw error;
  }

  if (
    typeof fetch !== "function"
  ) {
    const error = new Error(
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

  if (!aiResponse.ok) {
    const error = new Error(
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
      aiResponse.status >= 400 &&
      aiResponse.status <= 599
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
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
          ? "secure_cloudinary_configured"
          : "secure_cloudinary_not_configured",

      assistanceEvidenceViewer:
        "time_limited_private_download_v1",

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
            .doc(uid)
            .get(),

          db
            .collection(
              "identityVerifications",
            )
            .doc(uid)
            .get(),
        ]);

      if (
        !userSnapshot.exists
      ) {
        response
          .status(404)
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
          profile.identityStatus ||
            verification.status ||
            "basic",
        );

      response.json({
        ok:
          true,

        identityStatus,

        identityVerified:
          profile.identityVerified ===
            true ||
          identityStatus ===
            "verified",

        verificationId:
          cleanText(
            verification.verificationId ||
              "",
            200,
          ),

        decision:
          cleanText(
            verification.aiDecision ||
              verification.decision ||
              "",
            80,
          ),

        matchScore:
          numberOrNull(
            verification.matchScore,
          ),

        livenessScore:
          numberOrNull(
            verification.livenessScore,
          ),

        message:
          cleanText(
            verification.message ||
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
          .doc(uid);

      const verificationRef =
        db
          .collection(
            "identityVerifications",
          )
          .doc(uid);

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
          .status(404)
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
          .status(403)
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
          profile.identityStatus ||
            "basic",
        );

      if (
        profile.identityVerified ===
          true ||
        currentIdentityStatus ===
          "verified"
      ) {
        response
          .status(409)
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
          .status(429)
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
          aiResult?.matchScore,
        );

      const livenessScore =
        numberOrNull(
          aiResult?.livenessScore,
        );

      const verificationId =
        cleanText(
          aiResult?.verificationId ||
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
            verificationData.createdAt ||
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
        .status(200)
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
          error?.statusCode,
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
        request.firebaseUser.uid;

      if (
        !Buffer.isBuffer(
          request.body,
        ) ||
        request.body.length === 0
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
          .createHash("sha256")
          .update(
            request.body,
          )
          .digest("hex");

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
                .randomBytes(18)
                .toString("hex")
        }`;

      await db
        .collection(
          "assistanceEvidenceAssets",
        )
        .doc(evidenceId)
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
            "authenticated",

          width:
            numberOrNull(
              uploadedCloudinaryAsset.width,
            ),

          height:
            numberOrNull(
              uploadedCloudinaryAsset.height,
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
        .status(201)
        .json({
          ok:
            true,

          evidence: {
            evidenceId,

            documentType,

            fileName,

            mimeType:
              detected.mimeType,

            bytes:
              Number(
                uploadedCloudinaryAsset.bytes ||
                  request.body.length,
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
        uploadedCloudinaryAsset?.public_id
      ) {
        try {
          await destroyAssistanceEvidenceFromCloudinary(
            uploadedCloudinaryAsset.public_id,
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
            error?.statusCode,
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
  "/api/assistance/evidence/attach",

  requireFirebaseUser,

  requireVerifiedResident,

  async (
    request,
    response,
  ) => {
    try {
      const uid =
        request.firebaseUser.uid;

      const requestId =
        cleanText(
          request.body?.requestId ||
            "",
          200,
        );

      const evidenceIds =
        Array.from(
          new Set(
            Array.isArray(
              request.body?.evidenceIds,
            )
              ? request.body.evidenceIds
                  .map((value) =>
                    cleanText(
                      value,
                      200,
                    ),
                  )
                  .filter(Boolean)
              : [],
          ),
        );

      if (
        !requestId ||
        evidenceIds.length === 0 ||
        evidenceIds.length > 8
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
          .doc(requestId);

      const assistanceSnapshot =
        await assistanceRef.get();

      if (
        !assistanceSnapshot.exists
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
        assistanceData.requesterUid !==
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

      for (
        let index = 0;
        index <
        evidenceSnapshots.length;
        index += 1
      ) {
        const snapshot =
          evidenceSnapshots[index];

        const data =
          snapshot.exists
            ? snapshot.data() || {}
            : null;

        if (!data) {
          throw makeHttpError(
            404,
            "evidence_not_found",
            "One of the evidence files could not be found.",
          );
        }

        if (
          data.ownerUid !== uid
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
            error?.statusCode,
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
        request.firebaseUser.uid;

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
          .doc(evidenceId)
          .get();

      if (
        !evidenceSnapshot.exists
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
          evidenceData.status ||
            "",
          40,
        ).toLowerCase();

      const requestId =
        cleanText(
          evidenceData.requestId ||
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
            .doc(requestId)
            .get();

        if (
          !assistanceSnapshot.exists
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
            assistanceData.requesterUid ||
              "",
            200,
          ) !==
          cleanText(
            evidenceData.ownerUid ||
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
              evidenceData.ownerUid ||
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
          signedAccess.expiresAt,

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
            error?.statusCode,
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
        request.firebaseUser.uid;

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
          .doc(evidenceId);

      const evidenceSnapshot =
        await evidenceRef.get();

      if (
        !evidenceSnapshot.exists
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
            error?.statusCode,
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
          request?.path || "",
        ).startsWith(
          "/api/assistance/evidence/",
        );

      response
        .status(413)
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
      .status(500)
      .json({
        error:
          "server_error",

        message:
          "The VolunServe backend encountered an error.",
      });
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