import { firebaseConfig, usingStagingFirebase } from "./firebase";

/**
 * Review build preview only. NEVER active on volunserve-3aa5b.
 * A public build flag is NOT permission to create tasks. This module only
 * calls the side-effect-free planner and never writes to Firestore.
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
