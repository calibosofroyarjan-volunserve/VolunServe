/**
 * Staging backend allowlist: staging must never silently call production Render.
 * In the current visual-only build a .invalid host deliberately fails requests
 * without touching production. Real interaction tests require a separate backend.
 */
export const PRODUCTION_VOLUNSERVE_BACKEND = "https://volunserve.onrender.com";
export const DISABLED_STAGING_BACKEND = "https://volunserve-staging-disabled.invalid";

export const isStagingPreview =
  process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE === "1";

export function getSafeVolunServeBackendBaseUrl(): string {
  if (!isStagingPreview) return PRODUCTION_VOLUNSERVE_BACKEND;
  const proposed = (process.env.EXPO_PUBLIC_STAGING_BACKEND_URL || "").trim();
  if (!proposed) return DISABLED_STAGING_BACKEND;
  let url: URL;
  try {
    url = new URL(proposed);
  } catch {
    throw new Error("STAGING BLOCKED: staging backend URL is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username || url.password || url.search || url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  ) {
    throw new Error("STAGING BLOCKED: staging backend must be a clean HTTPS origin");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "volunserve.onrender.com" ||
    host === "volunserve.com" ||
    host.endsWith(".volunserve.com") ||
    host === "volunserve.org" ||
    host.endsWith(".volunserve.org") ||
    host.includes("volunserve-3aa5b") ||
    host.endsWith(".firebaseapp.com") ||
    host.endsWith(".web.app") ||
    !/(staging|preview|sandbox|test)/.test(host)
  ) {
    throw new Error("STAGING BLOCKED: provide a separate staging backend hostname");
  }
  return url.origin;
}

/** Never use the production Cloudinary unsigned upload preset for a preview. */
export function blockProductionEvidenceUploadDuringStaging() {
  if (isStagingPreview) {
    throw new Error("STAGING BLOCKED: production Cloudinary evidence upload is unavailable in preview");
  }
}
