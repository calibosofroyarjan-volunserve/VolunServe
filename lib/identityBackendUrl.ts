/**
 * Single identity API endpoint resolver used by Residents and Admin reviewers.
 * Never silently send staging ID/biometric submissions to production services.
 */
const LIVE_BACKEND = "https://volunserve.onrender.com";

export function getIdentityBackendBaseUrl(): string {
  const explicit = (process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL || "").trim();
  const firebaseTarget = (process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET || "production").trim();
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const isPreviewHost =
    host.endsWith(".onrender.com") ||
    host.includes("staging") ||
    host.includes("preview");
  const isStaging = firebaseTarget === "staging" || isPreviewHost;

  if (isStaging && firebaseTarget !== "staging") {
    throw new Error(
      "Identity staging requires EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET=staging. Refusing to connect to live accounts.",
    );
  }
  if (isStaging && !explicit) {
    throw new Error(
      "Identity staging backend is not configured. Set EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL to the isolated staging backend.",
    );
  }
  let value = explicit || LIVE_BACKEND;
  value = value.replace(/\/+$/, "");
  for (const suffix of ["/api/identity/verify", "/api/identity/status", "/api/identity/engine-health"]) {
    if (value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
    }
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Identity backend URL is invalid.");
  }
  if (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("Identity backend must use HTTPS, except for local testing.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Identity backend URL must be an origin without credentials or query parameters.");
  }
  if (isStaging && ["volunserve.onrender.com", "volunserve.com", "www.volunserve.com"].includes(parsed.hostname)) {
    throw new Error("Staging Identity Verification cannot use the live VolunServe backend.");
  }
  if (firebaseTarget === "production" && explicit && parsed.hostname.includes("staging")) {
    throw new Error("Production Identity Verification cannot use a staging backend.");
  }
  return parsed.origin;
}
