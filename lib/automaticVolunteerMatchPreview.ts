import { firebaseConfig, usingStagingFirebase } from "./firebase";

/**
 * Review build preview only. NEVER active on volunserve-3aa5b.
 * A public build flag is NOT permission to create tasks. The preview calls the side-effect-free planner; an independent opt-in
 * synthetic-case validation hook may call the isolated staging backend.
 * Production and all non-synthetic cases remain disabled.
 */
export const AUTO_VOLUNTEER_MATCH_UI_PREVIEW =
  usingStagingFirebase &&
  firebaseConfig.projectId === "volunserve-volunteer-staging" &&
  process.env.EXPO_PUBLIC_VOLUNSERVE_AUTO_MATCH_UI_PREVIEW === "true";

export type AutomaticMatchPreview = {
  kind: "preview";
  status: string;
  reason?: string | null;
  wave?: number;
  eligible?: number;
  reviewed?: number;
  volunteerId?: string | null;
  offerSent: false;
  productionDispatchEnabled: false;
  requiresOfficialEscalation?: boolean;
};

type MatchingPreviewInput = {
  incident: Record<string, any>;
  approvedVolunteers: Record<string, any>[];
  assignments: Record<string, any>[];
  responderLocksByUid?: Record<string, unknown>;
  knownBarangays: string[];
  neighborsByBarangay?: Record<string, string[]>;
};

// This is the same strict, read-only adapter tested in draft PR #574.
// CJS is intentionally imported without initializing Firebase or network code.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("../backend/additiveEmergencyMatching/liveCompatibility.cjs") as {
  previewFromLiveAdminDirectory(input: MatchingPreviewInput): AutomaticMatchPreview;
};

export function previewFromExistingAdminData(
  input: MatchingPreviewInput,
): AutomaticMatchPreview {
  if (!AUTO_VOLUNTEER_MATCH_UI_PREVIEW) {
    return {
      kind: "preview",
      status: "disabled",
      reason: "staging_only_feature_gate",
      offerSent: false,
      productionDispatchEnabled: false,
    };
  }
  return core.previewFromLiveAdminDirectory(input);
}

export function isStagingAutoMatchedTask(assignment: {
  createdBy?: string;
}): boolean {
  return AUTO_VOLUNTEER_MATCH_UI_PREVIEW &&
    assignment.createdBy === "automatic_matching_engine";
}

/**
 * After a successful Admin validation, permit ONLY one fictional fixture to
 * request a server-validated offer. This is a review/staging mechanism:
 * - no production project, no real case IDs, no client Firestore writes;
 * - requires an authenticated Admin Firebase ID token;
 * - the staging server independently checks Admin approval, fixture identity,
 *   case state, Volunteer eligibility and atomic responder locks;
 * - any failure leaves the already-validated case and manual assignment
 *   workflow untouched (never pretend that an offer was sent).
 */
export async function requestStagingAutoOfferAfterAdminValidation({
  caseId,
  originalCaseStatus,
  originalVerificationStatus,
  getIdToken,
}: {
  caseId: string;
  originalCaseStatus: string;
  originalVerificationStatus: string;
  getIdToken: () => Promise<string>;
}): Promise<{offered: boolean; reason: string}> {
  // This guard must execute BEFORE getIdToken/fetch or any other side effect.
  if (!AUTO_VOLUNTEER_MATCH_UI_PREVIEW ||
      caseId !== "STAGING_TEST_001" ||
      originalCaseStatus !== "reported" ||
      originalVerificationStatus === "validated") {
    return {offered: false, reason: "not_an_initial_synthetic_staging_validation"};
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const idToken = await getIdToken();
    if (typeof idToken !== "string" || !idToken) {
      return {offered: false, reason: "staging_admin_auth_required"};
    }
    const response = await fetch(
      "https://volunserve-emergency-match-staging-free.onrender.com/api/admin/emergency-auto/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({caseId: "STAGING_TEST_001"}),
        signal: controller.signal,
      },
    );
    // A successful HTTP response alone is not evidence of an actual offer.
    if (!response.ok) {
      return {offered: false, reason: "staging_backend_rejected_or_unavailable"};
    }
    const payload = await response.json().catch(() => null);
    return payload?.action === "offered" || payload?.action === "already_offered"
      ? {offered: true, reason: "server_confirmed_synthetic_staging_offer"}
      : {offered: false, reason: "no_server_confirmed_offer"};
  } catch {
    // Cross-origin restrictions and sleeping Free Render must never affect
    // successful case validation or trigger a false "offered" claim.
    return {offered: false, reason: "staging_dispatch_request_unavailable"};
  } finally {
    clearTimeout(timeout);
  }
}
