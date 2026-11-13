import { auth } from "./firebase";
import { identityEnvironmentTarget } from "./identityEnvironmentTarget";
import { assertIdentityMediaSubmissionAllowed } from "./identityMediaAvailability";
import { resolveIdentityPrecheckOutcome } from "./identityPrecheckContract";

export type IdentityVerificationStatus =
  | "basic"
  | "pending"
  | "verified"
  | "failed";

export type IdentityDocumentType =
  | "national_id"
  | "drivers_license"
  | "passport"
  | "umid"
  | "prc_id";

export type DocumentScreening = {
  declaredIdType: IdentityDocumentType | null;
  detectedIdType: IdentityDocumentType | null;
  status: "text_consistent_unverified" | "mismatch" | "inconclusive" | "unsupported";
  authenticityVerified: false;
  livenessVerified: false;
  manualReviewRequired: true;
  imageQualityStatus?: "low" | "adequate" | "unknown";
  backImageQualityStatus?: "low" | "adequate" | "unknown" | "not_checked" | "not_required";
  backSideProvided?: boolean;
  backSideScreened?: boolean;
  profileNameCompared?: boolean;
  profileNameCheck?: "possible_match" | "inconclusive" | "not_checked";
  profileBirthDateCompared?: boolean;
  profileBirthDateCheck?: "possible_match" | "possible_conflict" | "inconclusive" | "not_checked";
  profileAddressCompared?: boolean;
  profileAddressCheck?: "possible_match" | "inconclusive" | "not_checked";
  issuerAuthenticityStatus?: "not_verified";
  presentationAttackStatus?: "not_validated";
  // Passport-only ICAO MRZ OCR clues. Checksums do NOT verify issuance.
  passportMrzCheck?: "not_detected" | "checksum_consistent_unverified" |
    "checksum_inconsistent_or_ocr_error" | "multiple_candidates";
  passportMrzBirthDateCheck?: "not_checked" | "inconclusive" |
    "possible_match" | "possible_conflict";
  passportMrzCheckDigitsConsistent?: boolean;
  passportIssuerAuthenticityVerified?: false;
  passportMrzManualReviewRequired?: true;
  warningCodes: string[];
};

export function documentScreeningLabel(value?: DocumentScreening | null): string {
  if (value?.declaredIdType === "passport" &&
      (value.passportMrzCheck === "checksum_inconsistent_or_ocr_error" ||
       value.passportMrzCheck === "multiple_candidates" ||
       value.passportMrzBirthDateCheck === "possible_conflict")) {
    return "REVIEW: Passport machine-readable text has an unresolved checksum or profile birth-date conflict. Retake the passport bio page or request independent Admin review. This is not proof of fraud.";
  }
  if (value?.warningCodes?.includes("low_document_back_image_quality")) {
    return "RETAKE: The reverse side of your ID is too blurry. Capture the actual back again in good lighting. The front scan alone is not enough.";
  }
  if (value?.warningCodes?.includes("document_back_image_quality_unavailable")) {
    return "REVIEW: The reverse-side photo quality could not be checked. Retake the ID back; no automatic identity approval.";
  }
  if (value?.warningCodes?.includes("document_back_evidence_inconclusive") ||
      value?.warningCodes?.includes("document_back_layout_inconclusive")) {
    return "REVIEW: The reverse-side OCR text does not reliably confirm an ID back. Please rescan the actual reverse side or request Admin review.";
  }
  if (value?.warningCodes?.includes("document_image_quality_unavailable")) {
    return "RETAKE: Front ID image quality could not be checked. No ID recognition or identity approval was granted.";
  }
  if (value?.warningCodes?.includes("document_front_back_swapped")) {
    return "RETAKE: Your ID front and back appear reversed. Put the portrait/front face in Scan ID front and the reverse in Scan ID back.";
  }
  if (value?.warningCodes?.includes("document_back_looks_like_front")) {
    return "RETAKE: Scan ID back appears to show the front of the card. Confirm both sides and capture the reverse again.";
  }
  if (value?.warningCodes?.includes("document_front_side_conflict")) {
    return "RETAKE: Scan ID front appears to show the reverse of the card. Capture the portrait/front side again.";
  }
  switch (value?.status) {
    case "text_consistent_unverified":
      return value?.backSideScreened
        ? "ID text recognized and both sides screened for conflicting document labels. Authenticity is not verified."
        : "ID type matches recognized text, but authenticity is not verified.";
    case "mismatch":
      return "REJECTED: The scanned document does not match the selected government ID. Choose the correct type and scan again.";
    case "unsupported":
      return "REJECTED: School, student, employee or other unsupported ID detected. Only the five selected government ID types are accepted.";
    default:
      return value?.declaredIdType === "national_id" &&
        value?.imageQualityStatus === "low" &&
        value?.warningCodes.includes("low_document_image_quality")
        ? "BLURRY NATIONAL ID CLAIM: ID type could not be confirmed. Sent for Admin review to request a clearer scan; not identity verified."
        : "NOT ACCEPTED: The selected government ID type could not be confirmed. Retake a clearer scan and retry.";
  }
}

function parseDocumentScreening(value: unknown): DocumentScreening | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const allowed = ["national_id", "drivers_license", "passport", "umid", "prc_id"];
  const type = (x: unknown) => allowed.includes(String(x)) ? x as IdentityDocumentType : null;
  return {
    declaredIdType: type(raw.declaredIdType),
    detectedIdType: type(raw.detectedIdType),
    status: raw.status === "mismatch" || raw.status === "text_consistent_unverified" ||
      raw.status === "unsupported" ? raw.status : "inconclusive",
    authenticityVerified: false,
    livenessVerified: false,
    manualReviewRequired: true,
    imageQualityStatus: raw.imageQualityStatus === "low" || raw.imageQualityStatus === "adequate"
      ? raw.imageQualityStatus : "unknown",
    backImageQualityStatus: [
      "low", "adequate", "unknown", "not_checked", "not_required",
    ].includes(String(raw.backImageQualityStatus)) ?
      raw.backImageQualityStatus as DocumentScreening["backImageQualityStatus"] : "unknown",
    backSideProvided: raw.backSideProvided === true,
    backSideScreened: raw.backSideScreened === true,
    profileNameCompared: raw.profileNameCompared === true,
    profileNameCheck: raw.profileNameCheck === "possible_match" || raw.profileNameCheck === "inconclusive"
      ? raw.profileNameCheck : "not_checked",
    profileBirthDateCompared: raw.profileBirthDateCompared === true,
    profileBirthDateCheck: raw.profileBirthDateCheck === "possible_match" ||
      raw.profileBirthDateCheck === "possible_conflict" || raw.profileBirthDateCheck === "inconclusive"
      ? raw.profileBirthDateCheck : "not_checked",
    profileAddressCompared: raw.profileAddressCompared === true,
    profileAddressCheck: raw.profileAddressCheck === "possible_match" ||
      raw.profileAddressCheck === "inconclusive" ? raw.profileAddressCheck : "not_checked",
    issuerAuthenticityStatus: "not_verified",
    presentationAttackStatus: "not_validated",
    ...(type(raw.declaredIdType) === "passport" ? {
      passportMrzCheck:
        raw.passportMrzCheck === "checksum_consistent_unverified" ||
        raw.passportMrzCheck === "checksum_inconsistent_or_ocr_error" ||
        raw.passportMrzCheck === "multiple_candidates"
          ? raw.passportMrzCheck : "not_detected" as const,
      passportMrzBirthDateCheck:
        raw.passportMrzBirthDateCheck === "possible_match" ||
        raw.passportMrzBirthDateCheck === "possible_conflict" ||
        raw.passportMrzBirthDateCheck === "inconclusive"
          ? raw.passportMrzBirthDateCheck : "not_checked" as const,
      passportMrzCheckDigitsConsistent:
        raw.passportMrzCheck === "checksum_consistent_unverified" &&
        raw.passportMrzCheckDigitsConsistent === true,
      passportIssuerAuthenticityVerified: false as const,
      passportMrzManualReviewRequired: true as const,
    } : {}),
    warningCodes: Array.isArray(raw.warningCodes)
      ? raw.warningCodes.filter((x): x is string => typeof x === "string").slice(0, 4) : [],
  };
}

export type CapturedIdentityMedia = {
  uri: string;
  name: string;
  type: string;
  file?: any;
};

export type IdentityVerificationStatusResult = {
  identityStatus: IdentityVerificationStatus;
  identityVerified: boolean;
  verificationId?: string;
  decision?: string;
  matchScore?: number;
  livenessScore?: number;
  documentScreening?: DocumentScreening;
  message?: string;
};

export type IdentityVerificationResult = {
  status: "pending" | "verified" | "failed";
  verificationId?: string;
  decision?: string;
  matchScore?: number;
  livenessScore?: number;
  documentScreening?: DocumentScreening;
  message?: string;
};

export type DocumentPrecheckResult = {
  outcome: "pass" | "review" | "retry";
  detectedIdType: IdentityDocumentType | null;
  documentScreening?: DocumentScreening;
  message: string;
};

/**
 * Private authenticated ID-only OCR screening before face capture.
 * Explicit user consent is required. Photos are transient and do not
 * consume a limited face-verification attempt; no selfie is sent.
 */
export async function precheckIdentityDocument(input: {
  idType: IdentityDocumentType;
  idDocument: CapturedIdentityMedia;
  idBackDocument?: CapturedIdentityMedia | null;
  consent: boolean;
}): Promise<DocumentPrecheckResult> {
  if (!input.consent) {
    throw new Error("Consent is required before uploading an ID for preliminary AI document screening.");
  }
  if (!["national_id", "drivers_license", "passport", "umid", "prc_id"].includes(input.idType)) {
    throw new Error("Select a supported government ID.");
  }
  validateMedia(input.idDocument, "ID front scan");
  if (input.idType !== "passport") {
    validateMedia(input.idBackDocument || undefined, "ID reverse scan");
  }
  // Independent of screen navigation: no direct caller may build or send
  // sensitive staging multipart data while the Node capability says paused.
  await ensureStagingIdentityMediaTransferReady();
  const user = await getAuthenticatedUser();
  const token = await user.getIdToken(true);
  const body = new FormData();
  body.append("idType", input.idType);
  appendMedia(body, "idDocument", input.idDocument);
  if (input.idType !== "passport" && input.idBackDocument) {
    appendMedia(body, "idBackDocument", input.idBackDocument);
  }
  const response = await fetchWithTimeout(
    `${getBackendBaseUrl()}/api/identity/document/precheck`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-VolunServe-Document-Precheck-Consent": "true",
      },
      body,
    },
    70000,
  );
  const data = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(getResponseMessage(data,
      "Document screening is unavailable. No face-verification attempt was used."));
  }
  const screening = parseDocumentScreening(data?.documentScreening);
  const outcome = resolveIdentityPrecheckOutcome(
    input.idType, data?.outcome, data?.documentScreening,
  );
  return {
    outcome,
    detectedIdType: screening?.detectedIdType || null,
    documentScreening: screening,
    message: outcome === "retry" && data?.outcome !== "retry"
      ? "The ID precheck returned incomplete or conflicting evidence. Retake the ID; no selfie or account approval was granted."
      : getResponseMessage(data, "Retake the scanned government ID."),
  };
}

export type SubmitIdentityVerificationInput = {
  idType: IdentityDocumentType;
  idDocument: CapturedIdentityMedia;
  idBackDocument?: CapturedIdentityMedia | null;
  selfie: CapturedIdentityMedia;
};

const FALLBACK_BACKEND_URL = "https://volunserve.onrender.com";

function getBackendBaseUrl() {
  // The separate Python AI service is private; clients use the Node backend.
  // A staging build must NEVER silently send ID or selfie images to production.
  const staging = identityEnvironmentTarget({
    runtimeEnv: process.env.EXPO_PUBLIC_VOLUNSERVE_ENV,
    firebaseTarget: process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET,
    projectId: auth.app.options.projectId,
  }) === "staging";
  const configured = process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.trim();
  if (staging && !configured) {
    throw new Error("Staging identity backend URL is required before verification.");
  }
  let value = configured || FALLBACK_BACKEND_URL;

  value = value.replace(/\/+$/, "");

  const verifySuffix = "/api/identity/verify";
  const statusSuffix = "/api/identity/status";

  if (value.endsWith(verifySuffix)) {
    value = value.slice(0, -verifySuffix.length);
  }

  if (value.endsWith(statusSuffix)) {
    value = value.slice(0, -statusSuffix.length);
  }

  if (staging) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Staging identity backend URL is invalid.");
    }
    // Only the audited staging Node gateway may receive private ID/selfie
    // uploads. The reserved .invalid host is for compile-only CI exports.
    // Do not allow arbitrary HTTPS destinations or direct Python AI services.
    const allowedOrigins = [
      "https://volunserve-backend-staging.onrender.com",
      "https://identity-bundle-smoke.invalid",
    ];
    if (
      !allowedOrigins.includes(parsed.origin.toLowerCase()) ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      throw new Error(
        "Staging verification cannot use the production identity endpoint or an unauthorized URL. Use the approved staging Node backend.",
      );
    }
  }

  return value;
}

async function getAuthenticatedUser() {
  // Fail closed: the staging UI must not silently read production Firebase
  // accounts or forward production-issued Firebase tokens to a test backend.
  // A dedicated staging Firebase project must be explicitly configured first.
  identityEnvironmentTarget({
    runtimeEnv: process.env.EXPO_PUBLIC_VOLUNSERVE_ENV,
    firebaseTarget: process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET,
    projectId: auth.app.options.projectId,
  });

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Please sign in again before starting identity verification.",
    );
  }

  return user;
}

async function readResponseBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getResponseMessage(body: any, fallback: string) {
  const message = String(
    body?.message ||
      body?.detail ||
      body?.error ||
      "",
  ).trim();

  return message || fallback;
}

function normalizeStatus(value: unknown): IdentityVerificationStatus {
  const raw = String(value || "basic")
    .trim()
    .toLowerCase();

  if (
    raw === "pending" ||
    raw === "verified" ||
    raw === "failed"
  ) {
    return raw;
  }

  return "basic";
}

function optionalNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function validateMedia(
  media: CapturedIdentityMedia | undefined,
  label: string,
) {
  if (!media) {
    throw new Error(`${label} is required.`);
  }

  const uri = String(media.uri || "").trim();
  const name = String(media.name || "").trim();
  const type = String(media.type || "").trim();

  if (!uri && !media.file) {
    throw new Error(`${label} could not be read.`);
  }

  if (!name) {
    throw new Error(`${label} is missing a file name.`);
  }

  if (!type) {
    throw new Error(`${label} is missing a file type.`);
  }
}

function appendMedia(
  formData: FormData,
  fieldName: string,
  media: CapturedIdentityMedia,
) {
  if (media.file) {
    formData.append(fieldName, media.file);
    return;
  }

  formData.append(
    fieldName,
    {
      uri: media.uri,
      name: media.name,
      type: media.type,
    } as any,
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 65000,
) {
  if (typeof AbortController === "undefined") {
    return Promise.race([
      fetch(input, init),
      new Promise<Response>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              "The identity verification service is taking too long to respond. Please try again.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(
        "The identity verification service is taking too long to respond. Please try again.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check the deployed Python AI engine before submitting private identity
 * media or consuming an AI attempt. This endpoint requires Firebase auth.
 */
export async function checkIdentityEngineReady(): Promise<void> {
  const user = await getAuthenticatedUser();
  const token = await user.getIdToken();
  const response = await fetchWithTimeout(
    `${getBackendBaseUrl()}/api/identity/engine-health`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    // Both Render backend and the Python AI service can cold-start.
    150000,
  );
  const body = await readResponseBody(response);
  if (!response.ok || body?.ready !== true) {
    throw new Error(
      getResponseMessage(
        body,
        `Cannot confirm AI engine availability (HTTP ${response.status}). Check that the Python AI service is deployed and connected in Render.`,
      ),
    );
  }
  // A healthy Python AI service is NOT permission to POST private ID/selfie
  // media. Staging Node currently rejects those requests with HTTP 423.
  // Fail closed before any multipart body is assembled or a camera opened.
  assertIdentityMediaSubmissionAllowed(body);
}

/**
 * Guard the actual shared upload functions, not only their UI callers.
 * Production behavior is preserved; staging always requires the current
 * authenticated Node capability before we construct any FormData.
 */
async function ensureStagingIdentityMediaTransferReady(): Promise<void> {
  const target = identityEnvironmentTarget({
    runtimeEnv: process.env.EXPO_PUBLIC_VOLUNSERVE_ENV,
    firebaseTarget: process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET,
    projectId: auth.app.options.projectId,
  });
  if (target === "staging") {
    await checkIdentityEngineReady();
  }
}

/**
 * Sends the Resident's government ID image and live/selfie capture
 * directly to the VolunServe backend.
 *
 * The backend will later forward the private media to the project's
 * own Python/OpenCV face-verification service. No third-party identity
 * verification provider is used here.
 */
export const submitIdentityVerification = async (
  input: SubmitIdentityVerificationInput,
): Promise<IdentityVerificationResult> => {
  if (!input?.idType) {
    throw new Error("Select the government ID type.");
  }

  validateMedia(
    input.idDocument,
    "Government ID image",
  );

  if (input.idType !== "passport") {
    validateMedia(
      input.idBackDocument || undefined,
      "Government ID back image",
    );
  } else if (input.idBackDocument) {
    validateMedia(input.idBackDocument, "Passport supplementary image");
  }

  validateMedia(
    input.selfie,
    "Live selfie",
  );

  // Final submit is independently guarded against an expired or bypassed
  // frontend camera preflight. No staging ID/selfie FormData while HTTP 423.
  await ensureStagingIdentityMediaTransferReady();
  const user = await getAuthenticatedUser();
  const token = await user.getIdToken(true);

  const formData = new FormData();

  formData.append(
    "idType",
    input.idType,
  );

  appendMedia(
    formData,
    "idDocument",
    input.idDocument,
  );

  if (input.idBackDocument) {
    appendMedia(
      formData,
      "idBackDocument",
      input.idBackDocument,
    );
  }

  appendMedia(
    formData,
    "selfie",
    input.selfie,
  );

  const endpoint =
    `${getBackendBaseUrl()}/api/identity/verify`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
  );

  const body = await readResponseBody(response);

  if (!response.ok) {
    if (
      response.status === 409 &&
      body?.error === "already_verified"
    ) {
      throw new Error(
        "Your identity is already verified.",
      );
    }

    if (response.status === 429) {
      throw new Error(
        "Please wait before submitting another identity verification.",
      );
    }

    throw new Error(
      getResponseMessage(
        body,
        `Identity verification service returned ${response.status}.`,
      ),
    );
  }

  const status = normalizeStatus(
    body?.status ||
      body?.identityStatus ||
      "pending",
  );

  if (status === "basic") {
    throw new Error(
      "The identity verification service returned an invalid status.",
    );
  }

  return {
    status,
    verificationId: body?.verificationId
      ? String(body.verificationId)
      : undefined,
    decision: body?.decision
      ? String(body.decision)
      : undefined,
    matchScore: optionalNumber(
      body?.matchScore,
    ),
    livenessScore: optionalNumber(
      body?.livenessScore,
    ),
    documentScreening: parseDocumentScreening(body?.documentScreening),
    message: body?.message
      ? String(body.message)
      : undefined,
  };
};

export const getIdentityVerificationStatus =
  async (): Promise<IdentityVerificationStatusResult> => {
    const user = await getAuthenticatedUser();
    const token = await user.getIdToken();

    const endpoint =
      `${getBackendBaseUrl()}/api/identity/status`;

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      30000,
    );

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new Error(
        getResponseMessage(
          body,
          `Identity verification status returned ${response.status}.`,
        ),
      );
    }

    const identityStatus =
      normalizeStatus(
        body?.identityStatus,
      );

    return {
      identityStatus,
      identityVerified:
        body?.identityVerified === true ||
        identityStatus === "verified",
      verificationId:
        body?.verificationId
          ? String(body.verificationId)
          : undefined,
      decision: body?.decision
        ? String(body.decision)
        : undefined,
      matchScore: optionalNumber(
        body?.matchScore,
      ),
      livenessScore: optionalNumber(
        body?.livenessScore,
      ),
      documentScreening: parseDocumentScreening(body?.documentScreening),
      message: body?.message
        ? String(body.message)
        : undefined,
    };
  };
