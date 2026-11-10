/**
 * Community Certificate sync has its own staging-only, tightly scoped backend.
 * Other preview modules retain their existing disabled / audited routing.
 */
import {
  getSafeVolunServeBackendBaseUrl,
  isStagingPreview,
} from "./stagingBackendSafety";

export const STAGING_CERTIFICATE_BACKEND_URL =
  "https://volunserve-backend-staging.onrender.com";

export function getCommunityCertificateBackendBaseUrl(): string {
  return isStagingPreview
    ? STAGING_CERTIFICATE_BACKEND_URL
    : getSafeVolunServeBackendBaseUrl();
}

// Display only. The backend remains the authoritative eligibility check.
export const COMMUNITY_CERTIFICATE_MINIMUM_MINUTES =
  isStagingPreview ? 1 : 30;
