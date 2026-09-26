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

                const preferredTypes =
                  Array.isArray(
                    assistanceData
                      .preferredAssistanceTypes,
                  )
                    ? assistanceData
                        .preferredAssistanceTypes
                    : [];

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
                  preferredTypes.includes(
                    "monetary",
                  ) &&
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

      const preferredAssistanceTypes =
        Array.from(
          new Set(
            Array.isArray(
              request.body
                ?.preferredAssistanceTypes,
            )
              ? request.body
                  .preferredAssistanceTypes
                  .map(
                    (value) =>
                      cleanText(
                        value,
                        40,
                      )
                        .toLowerCase()
                        .replace(
                          /[^a-z_]/g,
                          "",
                        ),
                  )
                  .filter(
                    Boolean,
                  )
              : [],
          ),
        );

      if (
        preferredAssistanceTypes
          .length < 1 ||
        preferredAssistanceTypes
          .length > 2 ||
        preferredAssistanceTypes
          .some(
            (value) =>
              value !==
                "monetary" &&
              value !==
                "in_kind",
          )
      ) {
        throw makeHttpError(
          400,
          "invalid_assistance_preference",
          "Choose at least one valid preferred type of assistance.",
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