"use strict";

const DIDIT_BASE_URL =
  "https://verification.didit.me/v3";

function getRequiredEnvironmentVariable(
  name,
) {
  const value =
    String(
      process.env[name] || "",
    ).trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  return value;
}

async function readResponseJson(
  response,
) {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message:
        text.slice(
          0,
          500,
        ),
    };
  }
}

async function createDiditSession({
  uid,
  email,
}) {
  const apiKey =
    getRequiredEnvironmentVariable(
      "DIDIT_API_KEY",
    );

  const workflowId =
    getRequiredEnvironmentVariable(
      "DIDIT_WORKFLOW_ID",
    );

  const callbackUrl =
    String(
      process.env
        .VOLUNSERVE_CALLBACK_URL ||
        "",
    ).trim();

  const payload = {
    workflow_id:
      workflowId,

    vendor_data:
      uid,

    language:
      "en",

    metadata: {
      source:
        "volunserve",

      firebase_uid:
        uid,
    },
  };

  if (email) {
    payload.contact_details = {
      email,

      send_notification_emails:
        false,

      email_lang:
        "en",
    };
  }

  if (callbackUrl) {
    payload.callback =
      callbackUrl;

    payload.callback_method =
      "both";
  }

  const response =
    await fetch(
      `${DIDIT_BASE_URL}/session/`,
      {
        method:
          "POST",

        headers: {
          "x-api-key":
            apiKey,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            payload,
          ),
      },
    );

  const data =
    await readResponseJson(
      response,
    );

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      data?.error ||
      `Didit session creation failed with HTTP ${response.status}.`;

    const error =
      new Error(message);

    error.statusCode =
      response.status;

    error.providerResponse =
      data;

    throw error;
  }

  if (
    !data ||
    !data.session_id ||
    !data.url
  ) {
    throw new Error(
      "Didit returned an incomplete verification session.",
    );
  }

  return {
    sessionId:
      String(
        data.session_id,
      ),

    sessionNumber:
      data.session_number ??
      null,

    sessionToken:
      data.session_token ??
      null,

    url:
      String(
        data.url,
      ),

    providerStatus:
      String(
        data.status ||
        "Not Started",
      ),

    workflowId:
      String(
        data.workflow_id ||
        workflowId,
      ),

    workflowVersion:
      data.workflow_version ??
      null,

    vendorData:
      String(
        data.vendor_data ||
        uid,
      ),
  };
}

module.exports = {
  createDiditSession,
};