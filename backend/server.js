"use strict";

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const {
  auth,
  db,
  FieldValue,
} = require("./firebaseAdmin");

const {
  createDiditSession,
} = require("./didit");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:19006",
  "http://localhost:3000",
];

function getAllowedOrigins() {
  const configured = String(
    process.env.ALLOWED_ORIGINS || "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(
    configured.length > 0
      ? configured
      : DEFAULT_ALLOWED_ORIGINS,
  );
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
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Signature-V2",
      "X-Timestamp",
    ],
  }),
);

app.use(
  express.json({
    limit: "1mb",

    verify(request, response, buffer) {
      request.rawBody =
        Buffer.from(buffer);
    },
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

function normalizeStatus(
  value,
) {
  return cleanText(
    value,
    80,
  )
    .toLowerCase()
    .replace(
      /[_-]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    );
}

function mapDiditStatusToIdentityStatus(
  providerStatus,
) {
  const status =
    normalizeStatus(
      providerStatus,
    );

  if (
    status === "approved"
  ) {
    return "verified";
  }

  if (
    status === "not started" ||
    status === "not finished" ||
    status === "in progress" ||
    status === "in review" ||
    status === "resubmitted"
  ) {
    return "pending";
  }

  if (
    status === "declined" ||
    status === "abandoned" ||
    status === "expired" ||
    status === "kyc expired"
  ) {
    return "failed";
  }

  return null;
}

function getBearerToken(
  request,
) {
  const authorization =
    String(
      request.headers.authorization ||
      "",
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
            "Sign in before starting identity verification.",
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

function safeEqualBuffers(
  first,
  second,
) {
  if (
    !Buffer.isBuffer(first) ||
    !Buffer.isBuffer(second)
  ) {
    return false;
  }

  if (
    first.length !==
    second.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    first,
    second,
  );
}

function decodeWebhookSignature(
  signatureValue,
) {
  let signature =
    String(
      signatureValue || "",
    ).trim();

  signature =
    signature.replace(
      /^sha256=/i,
      "",
    );

  if (
    /^[a-f0-9]{64}$/i.test(
      signature,
    )
  ) {
    return Buffer.from(
      signature,
      "hex",
    );
  }

  try {
    const decoded =
      Buffer.from(
        signature,
        "base64",
      );

    if (
      decoded.length === 32
    ) {
      return decoded;
    }
  } catch {
    return null;
  }

  return null;
}

function verifyDiditWebhook(
  request,
) {
  const webhookSecret =
    String(
      process.env
        .DIDIT_WEBHOOK_SECRET ||
      "",
    ).trim();

  if (!webhookSecret) {
    console.error(
      "DIDIT_WEBHOOK_SECRET is not configured.",
    );

    return false;
  }

  const signatureHeader =
    String(
      request.headers[
        "x-signature-v2"
      ] ||
      "",
    ).trim();

  const timestampHeader =
    String(
      request.headers[
        "x-timestamp"
      ] ||
      "",
    ).trim();

  if (
    !signatureHeader ||
    !timestampHeader
  ) {
    return false;
  }

  const timestamp =
    Number(
      timestampHeader,
    );

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return false;
  }

  const currentTimestamp =
    Math.floor(
      Date.now() / 1000,
    );

  if (
    Math.abs(
      currentTimestamp -
      timestamp,
    ) > 300
  ) {
    return false;
  }

  if (
    !Buffer.isBuffer(
      request.rawBody,
    )
  ) {
    console.error(
      "Raw webhook body was not captured.",
    );

    return false;
  }

  const receivedSignature =
    decodeWebhookSignature(
      signatureHeader,
    );

  if (!receivedSignature) {
    return false;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        webhookSecret,
      )
      .update(
        request.rawBody,
      )
      .digest();

  return safeEqualBuffers(
    expectedSignature,
    receivedSignature,
  );
}

async function findFirebaseUid({
  vendorData,
  sessionId,
}) {
  if (sessionId) {
    const snapshot =
      await db
        .collection(
          "identityVerifications",
        )
        .where(
          "sessionId",
          "==",
          sessionId,
        )
        .limit(1)
        .get();

    if (
      !snapshot.empty
    ) {
      return snapshot
        .docs[0]
        .id;
    }
  }

  const uid =
    cleanText(
      vendorData,
      200,
    );

  if (!uid) {
    return "";
  }

  const userSnapshot =
    await db
      .collection(
        "users",
      )
      .doc(uid)
      .get();

  if (
    !userSnapshot.exists
  ) {
    return "";
  }

  return uid;
}

app.get(
  "/health",
  (
    request,
    response,
  ) => {
    response.json({
      ok: true,

      service:
        "volunserve-identity-backend",

      time:
        new Date()
          .toISOString(),
    });
  },
);

app.post(
  "/api/identity/session",

  requireFirebaseUser,

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
        cleanText(
          profile.identityStatus ||
          "basic",
          30,
        ).toLowerCase();

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

      const lastRequestTime =
        verificationData
          .sessionRequestedAt
          ?.toMillis?.() ||
        0;

      if (
        Date.now() -
          lastRequestTime <
        8000
      ) {
        response
          .status(429)
          .json({
            error:
              "too_many_requests",

            message:
              "Please wait a few seconds before requesting another verification session.",
          });

        return;
      }

      await verificationRef.set(
        {
          uid,

          provider:
            "didit",

          sessionRequestedAt:
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

      const session =
        await createDiditSession(
          {
            uid,

            email:
              cleanText(
                profile.email ||
                request
                  .firebaseUser
                  .email,
                240,
              ),
          },
        );

      await verificationRef.set(
        {
          uid,

          provider:
            "didit",

          sessionId:
            session.sessionId,

          sessionNumber:
            session.sessionNumber,

          workflowId:
            session.workflowId,

          workflowVersion:
            session.workflowVersion,

          providerStatus:
            session.providerStatus,

          status:
            "pending",

          createdAt:
            verificationData.createdAt ||
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

      await userRef.set(
        {
          identityStatus:
            "pending",

          identityVerified:
            false,

          identityVerificationProvider:
            "didit",

          identityVerificationSessionId:
            session.sessionId,

          identityVerificationStartedAt:
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

      response
        .status(201)
        .json({
          ok:
            true,

          sessionId:
            session.sessionId,

          url:
            session.url,

          status:
            "pending",
        });
    } catch (error) {
      console.error(
        "Create identity session failed:",
        error,
      );

      const providerStatusCode =
        Number(
          error?.statusCode,
        );

      const statusCode =
        providerStatusCode >= 400 &&
        providerStatusCode <= 599
          ? providerStatusCode
          : 500;

      response
        .status(
          statusCode,
        )
        .json({
          error:
            "session_create_failed",

          message:
            error?.message ||
            "Unable to create an identity verification session.",
        });
    }
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

      response.json({
        ok:
          true,

        identityStatus:
          cleanText(
            profile.identityStatus ||
            "basic",
            30,
          ).toLowerCase(),

        identityVerified:
          profile.identityVerified ===
          true,

        provider:
          cleanText(
            verification.provider ||
            "",
            40,
          ),

        providerStatus:
          cleanText(
            verification.providerStatus ||
            "",
            80,
          ),

        sessionId:
          cleanText(
            verification.sessionId ||
            "",
            200,
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
  "/api/identity/webhook",

  async (
    request,
    response,
  ) => {
    if (
      !verifyDiditWebhook(
        request,
      )
    ) {
      console.warn(
        "Rejected invalid Didit webhook.",
      );

      response
        .status(401)
        .json({
          error:
            "invalid_webhook",
        });

      return;
    }

    const event =
      request.body ||
      {};

    const webhookType =
      cleanText(
        event.webhook_type ||
        event.type ||
        "",
        80,
      );

    if (
      webhookType !==
      "status.updated"
    ) {
      response.json({
        ok:
          true,

        ignored:
          true,
      });

      return;
    }

    const configuredEnvironment =
      cleanText(
        process.env
          .DIDIT_ENVIRONMENT ||
        "",
        20,
      ).toLowerCase();

    const eventEnvironment =
      cleanText(
        event.environment ||
        "",
        20,
      ).toLowerCase();

    if (
      configuredEnvironment &&
      eventEnvironment &&
      configuredEnvironment !==
        eventEnvironment
    ) {
      console.warn(
        "Ignored Didit webhook from another environment.",
      );

      response.json({
        ok:
          true,

        ignored:
          true,
      });

      return;
    }

    const eventId =
      cleanText(
        event.event_id ||
        event.id ||
        "",
        200,
      );

    const sessionId =
      cleanText(
        event.session_id ||
        event.session?.id ||
        event.data?.session_id ||
        "",
        200,
      );

    const workflowId =
      cleanText(
        event.workflow_id ||
        event.session?.workflow_id ||
        event.data?.workflow_id ||
        "",
        200,
      );

    const vendorData =
      cleanText(
        event.vendor_data ||
        event.session?.vendor_data ||
        event.data?.vendor_data ||
        "",
        200,
      );

    const providerStatus =
      cleanText(
        event.status ||
        event.session?.status ||
        event.data?.status ||
        event.decision?.status ||
        "",
        80,
      );

    const configuredWorkflowId =
      cleanText(
        process.env
          .DIDIT_WORKFLOW_ID ||
        "",
        200,
      );

    if (
      configuredWorkflowId &&
      workflowId &&
      configuredWorkflowId !==
        workflowId
    ) {
      console.warn(
        "Ignored Didit webhook from another workflow.",
      );

      response.json({
        ok:
          true,

        ignored:
          true,
      });

      return;
    }

    try {
      const uid =
        await findFirebaseUid(
          {
            vendorData,
            sessionId,
          },
        );

      if (!uid) {
        console.warn(
          "Didit webhook could not be linked to a VolunServe user.",
        );

        response.json({
          ok:
            true,

          ignored:
            true,
        });

        return;
      }

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
        console.warn(
          "Didit webhook user does not exist:",
          uid,
        );

        response.json({
          ok:
            true,

          ignored:
            true,
        });

        return;
      }

      const verificationData =
        verificationSnapshot.exists
          ? verificationSnapshot.data() ||
            {}
          : {};

      const storedSessionId =
        cleanText(
          verificationData.sessionId ||
          "",
          200,
        );

      if (
        storedSessionId &&
        sessionId &&
        storedSessionId !==
          sessionId
      ) {
        console.warn(
          "Ignored stale Didit verification session.",
        );

        response.json({
          ok:
            true,

          ignored:
            true,
        });

        return;
      }

      const previousEventId =
        cleanText(
          verificationData.lastEventId ||
          "",
          200,
        );

      if (
        eventId &&
        previousEventId &&
        eventId === previousEventId
      ) {
        response.json({
          ok:
            true,

          duplicate:
            true,
        });

        return;
      }

      const identityStatus =
        mapDiditStatusToIdentityStatus(
          providerStatus,
        );

      const batch =
        db.batch();

      const verificationUpdate = {
        uid,

        provider:
          "didit",

        providerStatus,

        webhookType,

        status:
          identityStatus ||
          "pending",

        lastWebhookAt:
          FieldValue
            .serverTimestamp(),

        updatedAt:
          FieldValue
            .serverTimestamp(),
      };

      if (sessionId) {
        verificationUpdate.sessionId =
          sessionId;
      }

      if (workflowId) {
        verificationUpdate.workflowId =
          workflowId;
      }

      if (eventId) {
        verificationUpdate.lastEventId =
          eventId;
      }

      if (eventEnvironment) {
        verificationUpdate.environment =
          eventEnvironment;
      }

      batch.set(
        verificationRef,
        verificationUpdate,
        {
          merge:
            true,
        },
      );

      if (
        identityStatus ===
        "verified"
      ) {
        batch.set(
          userRef,
          {
            identityStatus:
              "verified",

            identityVerified:
              true,

            identityVerifiedAt:
              FieldValue
                .serverTimestamp(),

            identityVerifiedBy:
              "didit",

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
      } else if (
        identityStatus ===
        "failed"
      ) {
        batch.set(
          userRef,
          {
            identityStatus:
              "failed",

            identityVerified:
              false,

            identityFailureReason:
              providerStatus ||
              "Identity verification was not approved.",

            updatedAt:
              FieldValue
                .serverTimestamp(),
          },
          {
            merge:
              true,
          },
        );
      } else if (
        identityStatus ===
        "pending"
      ) {
        batch.set(
          userRef,
          {
            identityStatus:
              "pending",

            identityVerified:
              false,

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
        });
    } catch (error) {
      console.error(
        "Didit webhook processing failed:",
        error,
      );

      response
        .status(500)
        .json({
          error:
            "webhook_processing_failed",
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

    response
      .status(500)
      .json({
        error:
          "server_error",

        message:
          "The VolunServe identity service encountered an error.",
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
      `VolunServe identity backend listening on port ${port}`,
    );
  },
);