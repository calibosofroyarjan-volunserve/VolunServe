/**
 * Isolate the staging Expo Resident/Admin review frontend from production APIs.
 *
 * Explicit Expo environment must match the FULL staging Firebase project.
 * Production returns the original production endpoint unchanged.
 * Never load a production Cloudinary upload preset or real payment checkout
 * in the staging Expo preview. Government ID and selfie uploads remain
 * separately blocked in Node (HTTP 423).
 */
const PROD_BACKEND = "https://volunserve.onrender.com";
const STAGING_BACKEND = "https://volunserve-backend-staging.onrender.com";

export function isStagingExpoWeb(): boolean {
  return process.env.EXPO_PUBLIC_VOLUNSERVE_ENV === "staging" ||
    process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET === "staging";
}

export function getSafeVolunServeBackendBaseUrl(): string {
  if (!isStagingExpoWeb()) return PROD_BACKEND;
  if (process.env.EXPO_PUBLIC_VOLUNSERVE_ENV !== "staging" ||
      process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET !== "staging" ||
      process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID !==
        "volunserve-full-staging") {
    throw new Error(
      "STAGING BLOCKED: Expo environment mismatch. No API request sent."
    );
  }
  // Never accept an arbitrary overridden API host from a preview bundle.
  return STAGING_BACKEND;
}

export function blockProductionEvidenceUploadDuringStaging(): void {
  if (isStagingExpoWeb()) {
    throw new Error(
      "STAGING BLOCKED: Public Cloudinary photo uploads are disabled in the isolated Expo preview."
    );
  }
}

export function blockExternalCheckoutDuringStaging(): void {
  if (isStagingExpoWeb()) {
    throw new Error(
      "STAGING BLOCKED: External donation checkout is disabled in this isolated preview."
    );
  }
}
