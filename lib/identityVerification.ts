import { auth } from "./firebase";

export type IdentityVerificationStatus =
  | "basic"
  | "pending"
  | "verified"
  | "failed";

export type IdentityDocumentType =
  | "national_id"
  | "drivers_license"
  | "passport"
  | "other_government_id";

export type DocumentScreening = {
  declaredIdType: IdentityDocumentType | null;
  detectedIdType: IdentityDocumentType | null;
  status: "text_consistent_unverified" | "mismatch" | "inconclusive";
  authenticityVerified: false;
  livenessVerified: false;
  manualReviewRequired: true;
  backSideProvided?: boolean;
  backSideScreened?: boolean;
  warningCodes: string[];
};

export function documentScreeningLabel(value?: DocumentScreening | null): string {
  if (value?.warningCodes.includes("non_government_id_detected")) {
    return "School or company ID detected. Upload a supported government-issued photo ID.";
  }
  switch (value?.status) {
    case "text_consistent_unverified":
      return "ID type matches recognized text, but authenticity is not verified.";
    case "mismatch":
      return "Selected ID type does not match recognized document text. Review required.";
    default:
      return "ID type could not be confirmed automatically. Review required.";
  }
}

function parseDocumentScreening(value: unknown): DocumentScreening | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const allowed = ["national_id", "drivers_license", "passport", "other_government_id"];
  const type = (x: unknown) => allowed.includes(String(x)) ? x as IdentityDocumentType : null;
  return {
    declaredIdType: type(raw.declaredIdType),
    detectedIdType: type(raw.detectedIdType),
    status: raw.status === "mismatch" || raw.status === "text_consistent_unverified" ?
      raw.status : "inconclusive",
    authenticityVerified: false,
    livenessVerified: false,
    manualReviewRequired: true,
    backSideProvided: raw.backSideProvided === true,
    backSideScreened: raw.backSideScreened === true,
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

export type SubmitIdentityVerificationInput = {
  idType: IdentityDocumentType;
  idDocument: CapturedIdentityMedia;
  idBackDocument?: CapturedIdentityMedia | null;
  selfie: CapturedIdentityMedia;
};

export type PrecheckIdentityDocumentInput = {
  idType: IdentityDocumentType;
  idDocument: CapturedIdentityMedia;
  idBackDocument?: CapturedIdentityMedia | null;
  consent: true;
};

export type PrecheckIdentityDocumentResult = {
  outcome: "pass" | "retry" | "rejected";
  documentScreening: DocumentScreening;
  message: string;
};

const FALLBACK_BACKEND_URL = "https://volunserve.onrender.com";

/**
 * Resolve the identity API without ever silently sending staging ID photos or
 * Firebase tokens to production. This is intentionally independent of any
 * legacy staging branches and keeps the established live endpoint intact.
 */
export function resolveIdentityBackendBaseUrl(
  firebaseTarget: string,
  firebaseProjectId: string,
  configuredUrl?: string,
): string {
  if (firebaseTarget !== "production" && firebaseTarget !== "staging") {
    throw new Error("Identity verification requires an explicit valid Firebase target.");
  }
  const projectId = String(firebaseProjectId || "").trim();
  const productionProjectId = "volunserve-3aa5b";
  if (firebaseTarget === "production" && projectId !== productionProjectId) {
    throw new Error("Identity verification blocked: production Firebase project mismatch.");
  }
  if (firebaseTarget === "staging" && (!projectId || projectId === productionProjectId)) {
    throw new Error("Identity verification blocked: staging requires separate Firebase.");
  }

  const trimmed = String(configuredUrl || "").trim();
  if (firebaseTarget === "staging" && !trimmed) {
    throw new Error("Staging identity API URL is required; refusing production fallback.");
  }
  let value = trimmed || FALLBACK_BACKEND_URL;
  value = value.replace(/\/+$/, "");
  const suffixes = ["/api/identity/verify", "/api/identity/status"];
  for (const suffix of suffixes) {
    if (value.endsWith(suffix)) value = value.slice(0, -suffix.length);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Identity verification API URL is invalid.");
  }
  const host = parsed.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.protocol !== "https:" && !(firebaseTarget === "staging" && isLocal && parsed.protocol === "http:"))) {
    throw new Error("Identity verification requires a secure API URL.");
  }
  const knownProductionHosts = [
    "volunserve.onrender.com", "volunserve.com", "www.volunserve.com",
    "volunserve.org", "www.volunserve.org",
  ];
  if (firebaseTarget === "staging" && knownProductionHosts.includes(host)) {
    throw new Error("Staging identity verification cannot connect to production.");
  }
  if (firebaseTarget === "production" &&
      (host.includes("staging") || isLocal)) {
    throw new Error("Production identity verification cannot connect to staging.");
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

function getBackendBaseUrl() {
  const firebaseTarget =
    process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET || "production";
  const projectId = String(auth.app.options.projectId || "");
  return resolveIdentityBackendBaseUrl(
    firebaseTarget,
    projectId,
    process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL,
  );
}

async function getAuthenticatedUser() {
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
}

/**
 * Sends the Resident's government ID image and live/selfie capture
 * directly to the VolunServe backend.
 *
 * The backend will later forward the private media to the project's
 * own Python/OpenCV face-verification service. No third-party identity
 * verification provider is used here.
 */
/**
 * Consent-required, non-decisional OCR check before starting the selfie camera.
 * No face upload, no AI attempt consumed and no identity role changes.
 */
export async function precheckIdentityDocument(
  input: PrecheckIdentityDocumentInput,
): Promise<PrecheckIdentityDocumentResult> {
  if (!input || input.consent !== true) {
    throw new Error("Consent is required before screening the ID photos.");
  }
  validateMedia(input.idDocument, "Government ID front image");
  if (input.idType !== "passport") {
    if (!input.idBackDocument) {
      throw new Error("Scan the front and back of your government ID.");
    }
    validateMedia(input.idBackDocument, "Government ID back image");
  } else if (input.idBackDocument) {
    throw new Error("Use only the passport bio page.");
  }
  const user = await getAuthenticatedUser();
  const token = await user.getIdToken(true);
  const formData = new FormData();
  formData.append("idType", input.idType);
  formData.append("consent", "true");
  appendMedia(formData, "idDocument", input.idDocument);
  if (input.idBackDocument) {
    appendMedia(formData, "idBackDocument", input.idBackDocument);
  }
  const response = await fetchWithTimeout(
    `${getBackendBaseUrl()}/api/identity/document/precheck`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
    65000,
  );
  const body = await readResponseBody(response);
  if (!response.ok || body?.ok !== true) {
    throw new Error(
      getResponseMessage(body, "ID screening is unavailable. No face verification was started."),
    );
  }
  const screening = parseDocumentScreening(body?.documentScreening);
  if (!screening || !["pass", "retry", "rejected"].includes(body?.outcome)) {
    throw new Error("The ID screening service returned an invalid result. Please retry.");
  }
  return {
    outcome: body.outcome,
    documentScreening: screening,
    message: String(body.message || "ID screening completed.").slice(0, 240),
  };
}

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

  if (input.idBackDocument) {
    validateMedia(input.idBackDocument, "Government ID back image");
  }

  validateMedia(
    input.selfie,
    "Live selfie",
  );

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
    appendMedia(formData, "idBackDocument", input.idBackDocument);
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
