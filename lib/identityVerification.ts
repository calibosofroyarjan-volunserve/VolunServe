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
  warningCodes: string[];
};

export function documentScreeningLabel(value?: DocumentScreening | null): string {
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
  selfie: CapturedIdentityMedia;
};

const FALLBACK_BACKEND_URL = "https://volunserve.onrender.com";

function getBackendBaseUrl() {
  // The Resident app must always call the main VolunServe backend.
  // The separate AI service is private and is reached only server-to-server.
  let value =
    process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.trim() ||
    FALLBACK_BACKEND_URL;

  value = value.replace(/\/+$/, "");

  const verifySuffix = "/api/identity/verify";
  const statusSuffix = "/api/identity/status";

  if (value.endsWith(verifySuffix)) {
    value = value.slice(0, -verifySuffix.length);
  }

  if (value.endsWith(statusSuffix)) {
    value = value.slice(0, -statusSuffix.length);
  }

  return value;
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
