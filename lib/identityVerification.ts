import { auth } from "./firebase";

export type IdentityVerificationStatus =
  | "basic"
  | "pending"
  | "verified"
  | "failed";

export type IdentityVerificationSessionResult = {
  status: "pending";
  sessionId: string;
  url: string;
  message?: string;
};

export type IdentityVerificationStatusResult = {
  identityStatus: IdentityVerificationStatus;
  identityVerified: boolean;
  provider?: string;
  providerStatus?: string;
  sessionId?: string;
};

export type IdentityDocumentType =
  | "national_id"
  | "drivers_license"
  | "passport"
  | "other_government_id";

export type CapturedIdentityMedia = {
  uri: string;
  name: string;
  type: string;
  file?: any;
};

export type IdentityVerificationResult = {
  status:
    | "pending"
    | "verified"
    | "failed";
  verificationId?: string;
  sessionId?: string;
  url?: string;
  message?: string;
};

type SubmitIdentityVerificationInput = {
  idType?: IdentityDocumentType;
  idDocument?: CapturedIdentityMedia;
  selfie?: CapturedIdentityMedia;
};

const FALLBACK_BACKEND_URL =
  "https://volunserve.onrender.com";

function getBackendBaseUrl() {
  let value =
    process.env
      .EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL
      ?.trim() ||
    FALLBACK_BACKEND_URL;

  value =
    value.replace(
      /\/+$/,
      "",
    );

  const sessionSuffix =
    "/api/identity/session";

  const statusSuffix =
    "/api/identity/status";

  if (
    value.endsWith(
      sessionSuffix,
    )
  ) {
    value =
      value.slice(
        0,
        -sessionSuffix.length,
      );
  }

  if (
    value.endsWith(
      statusSuffix,
    )
  ) {
    value =
      value.slice(
        0,
        -statusSuffix.length,
      );
  }

  return value;
}

async function getAuthenticatedUser() {
  const user =
    auth.currentUser;

  if (!user) {
    throw new Error(
      "Please sign in again before starting identity verification.",
    );
  }

  return user;
}

async function readResponseBody(
  response: Response,
) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getResponseMessage(
  body: any,
  fallback: string,
) {
  const message =
    String(
      body?.message ||
      body?.detail ||
      body?.error ||
      "",
    ).trim();

  return (
    message ||
    fallback
  );
}

export function isTrustedIdentityVerificationUrl(
  value: string,
) {
  const url =
    String(
      value || "",
    ).trim();

  if (!url) {
    return false;
  }

  return /^https:\/\/([a-z0-9-]+\.)*didit\.me(?:\/|$)/i.test(
    url,
  );
}

export const createIdentityVerificationSession =
  async (): Promise<IdentityVerificationSessionResult> => {
    const user =
      await getAuthenticatedUser();

    const token =
      await user.getIdToken(
        true,
      );

    const endpoint =
      `${getBackendBaseUrl()}/api/identity/session`;

    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({}),
        },
      );

    const body =
      await readResponseBody(
        response,
      );

    if (!response.ok) {
      if (
        response.status ===
          409 &&
        body?.error ===
          "already_verified"
      ) {
        throw new Error(
          "Your identity is already verified.",
        );
      }

      if (
        response.status ===
        429
      ) {
        throw new Error(
          "Please wait a few seconds before starting another verification session.",
        );
      }

      throw new Error(
        getResponseMessage(
          body,
          `Identity verification service returned ${response.status}.`,
        ),
      );
    }

    const sessionId =
      String(
        body?.sessionId ||
        "",
      ).trim();

    const url =
      String(
        body?.url ||
        "",
      ).trim();

    if (
      !sessionId ||
      !url
    ) {
      throw new Error(
        "The identity verification service returned an incomplete verification session.",
      );
    }

    if (
      !isTrustedIdentityVerificationUrl(
        url,
      )
    ) {
      throw new Error(
        "The identity verification service returned an invalid verification link.",
      );
    }

    return {
      status:
        "pending",

      sessionId,

      url,

      message:
        body?.message,
    };
  };

export const getIdentityVerificationStatus =
  async (): Promise<IdentityVerificationStatusResult> => {
    const user =
      await getAuthenticatedUser();

    const token =
      await user.getIdToken();

    const endpoint =
      `${getBackendBaseUrl()}/api/identity/status`;

    const response =
      await fetch(
        endpoint,
        {
          method:
            "GET",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        },
      );

    const body =
      await readResponseBody(
        response,
      );

    if (!response.ok) {
      throw new Error(
        getResponseMessage(
          body,
          `Identity verification status returned ${response.status}.`,
        ),
      );
    }

    const rawStatus =
      String(
        body?.identityStatus ||
        "basic",
      )
        .trim()
        .toLowerCase();

    const identityStatus:
      IdentityVerificationStatus =
      rawStatus ===
        "pending" ||
      rawStatus ===
        "verified" ||
      rawStatus ===
        "failed"
        ? rawStatus
        : "basic";

    return {
      identityStatus,

      identityVerified:
        body?.identityVerified ===
        true,

      provider:
        body?.provider
          ? String(
              body.provider,
            )
          : undefined,

      providerStatus:
        body?.providerStatus
          ? String(
              body.providerStatus,
            )
          : undefined,

      sessionId:
        body?.sessionId
          ? String(
              body.sessionId,
            )
          : undefined,
    };
  };

export const submitIdentityVerification =
  async (
    _input?: SubmitIdentityVerificationInput,
  ): Promise<IdentityVerificationResult> => {
    const session =
      await createIdentityVerificationSession();

    return {
      status:
        "pending",

      verificationId:
        session.sessionId,

      sessionId:
        session.sessionId,

      url:
        session.url,

      message:
        session.message,
    };
  };