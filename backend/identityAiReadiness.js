"use strict";

// Only idempotent GET checks are retried. Never replay /verify or consume an AI attempt.
const DEFAULT_HEALTH_TIMEOUTS_MS = [45000, 20000];
const DEFAULT_AUTH_TIMEOUTS_MS = [12000, 6000];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notReady(error, message) {
  return {statusCode: 503, body: {ok: false, ready: false, error, message}};
}

function canRetry(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function probeIdentityAiReadiness({
  endpoint,
  internalKey,
  fetchImpl = fetch,
  wait = pause,
  healthTimeoutsMs = DEFAULT_HEALTH_TIMEOUTS_MS,
  authTimeoutsMs = DEFAULT_AUTH_TIMEOUTS_MS,
}) {
  if (!endpoint) {
    return notReady("identity_ai_not_configured", "Configure IDENTITY_AI_SERVICE_URL on the VolunServe backend.");
  }
  if (!internalKey) {
    return notReady("identity_ai_key_missing", "Configure IDENTITY_AI_INTERNAL_KEY on the VolunServe backend.");
  }
  const healthUrl = endpoint.endsWith("/verify")
    ? endpoint.slice(0, -"/verify".length) + "/health"
    : endpoint.replace(/\/+$/, "") + "/health";
  let health = null;
  let lastHealthFailure = notReady(
    "identity_ai_unreachable",
    "The Python AI service is unavailable. Check its Render status and try again.",
  );
  for (let attempt = 0; attempt < healthTimeoutsMs.length; attempt++) {
    try {
      const healthResponse = await fetchImpl(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(healthTimeoutsMs[attempt]),
      });
      const body = await responseJson(healthResponse);
      if (!healthResponse.ok) {
        lastHealthFailure = notReady(
          "identity_ai_warming_up",
          "The AI server may be waking up. Please try again shortly; no identity attempt was used.",
        );
        if (!canRetry(healthResponse.status)) return lastHealthFailure;
      } else if (body?.internalAuthConfigured === false) {
        return notReady(
          "identity_ai_key_missing_on_ai",
          "The Python AI service has no internal authentication configured in Render.",
        );
      } else if (body?.ok !== true || body?.verificationEngineReady !== true ||
                 body?.internalAuthConfigured !== true) {
        lastHealthFailure = notReady(
          "identity_ai_not_ready",
          "The Python AI engine is not yet ready. Check AI Render logs if this persists.",
        );
      } else {
        health = body;
        break;
      }
    } catch (error) {
      // Do not log URLs, user information, secrets, or biometrics.
      lastHealthFailure = notReady(
        "identity_ai_unreachable",
        "The Python AI service timed out or could not be reached. No identity attempt was used.",
      );
    }
    if (attempt + 1 < healthTimeoutsMs.length) await wait(1200);
  }
  if (!health) return lastHealthFailure;

  // The public /health check cannot prove that the two Render secrets match.
  // This private GET proves the secret without sending ID or facial images.
  const authCheckUrl = healthUrl.slice(0, -"/health".length) + "/api/internal/auth-check";
  let lastAuthFailure = notReady(
    "identity_ai_auth_check_failed", "The private AI authentication check did not complete.",
  );
  for (let attempt = 0; attempt < authTimeoutsMs.length; attempt++) {
    try {
      const authResponse = await fetchImpl(authCheckUrl, {
        method: "GET",
        headers: {"X-VolunServe-Internal-Key": internalKey},
        signal: AbortSignal.timeout(authTimeoutsMs[attempt]),
      });
      if (authResponse.status === 401 || authResponse.status === 403) {
        return notReady(
          "identity_ai_auth_mismatch",
          "The internal authentication secrets differ between the Node and Python Render services.",
        );
      }
      if (authResponse.status === 404) {
        return notReady(
          "identity_ai_auth_check_missing",
          "Deploy the latest Python AI service; the private auth-check endpoint is missing.",
        );
      }
      if (!authResponse.ok) {
        lastAuthFailure = notReady(
          "identity_ai_auth_check_failed",
          "The AI authentication service is temporarily unavailable. Please try again shortly.",
        );
        if (!canRetry(authResponse.status)) return lastAuthFailure;
      } else {
        const authResult = await responseJson(authResponse);
        if (authResult?.authenticated === true) {
          return {statusCode: 200, body: {
            ok: true,
            ready: true,
            provider: "volunserve-custom-ai",
            livenessImplemented: health.livenessImplemented === true,
            message: "The AI engine and private backend authentication are ready. Liveness and ID authenticity are not fully verified.",
          }};
        }
        return notReady(
          "identity_ai_auth_check_invalid",
          "The AI service did not confirm private backend authentication.",
        );
      }
    } catch (error) {
      lastAuthFailure = notReady(
        "identity_ai_auth_check_unreachable",
        "The private AI authentication endpoint timed out. Please try again shortly.",
      );
    }
    if (attempt + 1 < authTimeoutsMs.length) await wait(800);
  }
  return lastAuthFailure;
}

module.exports = {probeIdentityAiReadiness};
