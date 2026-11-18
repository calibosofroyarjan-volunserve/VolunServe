/**
 * Production-safe bridge for the existing Admin and Volunteer workspaces.
 *
 * This adapter ONLY accepts the isolated, fixed STAGING_E2E_002 fixture.
 * It does not activate production dispatch or write to Firebase directly.
 * All state changes are made by the staging server after Firebase ID token
 * verification, admin/volunteer approval, reservation and lock checks.
 */
export const STAGING_BULK_CASE_ID = "STAGING_E2E_002";
export const STAGING_BULK_OFFER_MODE = "staging_bulk_all_eligible";
const STAGING_FIREBASE_PROJECT = "volunserve-volunteer-staging";
const STAGING_SERVER_URL =
  "https://volunserve-emergency-match-staging-free.onrender.com";

type TokenUser = { getIdToken: () => Promise<string> };
type StageAssignment = {
  caseId?: string;
  volunteerId?: string;
  offerMode?: string;
};
type ServerReply = {
  ok?: boolean;
  status?: string;
  error?: string;
  reason?: string;
  wave?: number;
  offered?: number;
  eligibleInSelectedWave?: number;
  automaticWave?: { status?: string; wave?: number };
};

export function isStagingBulkAssignment(assignment: StageAssignment): boolean {
  return assignment.offerMode === STAGING_BULK_OFFER_MODE;
}

function assertIsolatedStaging(projectId: string): void {
  // These flags are build-time constants. Never use EXPO_PUBLIC values as
  // authorization: the server MUST verify Firebase token and account role.
  if (process.env.EXPO_PUBLIC_AUTO_VOLUNTEER_DISPATCH_ENABLED !== "true" ||
      process.env.EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_ONLY !== "true" ||
      process.env.EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER !== "render" ||
      process.env.EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_PROJECT_ID !== STAGING_FIREBASE_PROJECT ||
      projectId !== STAGING_FIREBASE_PROJECT) {
    throw new Error(
      "This fictional bulk test is disabled outside the isolated staging Firebase build.",
    );
  }
}

async function requestStagingServer(
  route: string,
  user: TokenUser,
  method: "GET" | "POST" = "GET",
  payload?: object,
): Promise<ServerReply> {
  const token = await user.getIdToken();
  if (!token) throw new Error("Staging sign-in is required.");
  const response = await fetch(STAGING_SERVER_URL + route, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body: ServerReply = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    const code = String(body.reason || body.error || "staging_service_unavailable");
    throw new Error(`Fictional staging test unavailable: ${code.slice(0, 100)}`);
  }
  return body;
}

/**
 * Existing Volunteer web/mobile cards call this BEFORE any Firestore
 * transaction. A detected batch assignment MUST NEVER fall back to the
 * normal client-side Firestore status transition, even when staging is off.
 */
export async function respondToStagingBulkOffer(
  assignment: StageAssignment,
  decision: "accepted" | "declined",
  volunteerUid: string,
  projectId: string,
  user: TokenUser,
): Promise<ServerReply> {
  if (!isStagingBulkAssignment(assignment)) {
    throw new Error("Not a staging bulk offer.");
  }
  if (assignment.caseId !== STAGING_BULK_CASE_ID ||
      assignment.volunteerId !== volunteerUid || !volunteerUid) {
    throw new Error("Fictional test offer ownership mismatch.");
  }
  assertIsolatedStaging(projectId);
  const result = await requestStagingServer(
    "/api/staging/volunteer/e2e-002/bulk-respond",
    user, "POST", { caseId: STAGING_BULK_CASE_ID, decision },
  );
  if (result.status !== decision && result.status !== `already_${decision}`) {
    throw new Error("Staging server did not confirm your response.");
  }
  return result;
}

/**
 * Admin's post-validation automatic-start handler uses this instead of the
 * legacy one-volunteer endpoint ONLY for the fixed fictional 002 case.
 * It checks if an automatic batch already exists to avoid duplicate offers.
 */
export async function ensureStagingBulkOffersAfterAdminValidation(
  caseId: string,
  projectId: string,
  user: TokenUser,
): Promise<ServerReply> {
  if (caseId !== STAGING_BULK_CASE_ID) {
    throw new Error("Automatic staging batch is limited to the fictional case 002.");
  }
  assertIsolatedStaging(projectId);
  const existing = await requestStagingServer(
    "/api/admin/emergency-auto/e2e-002/bulk-status", user,
  );
  if (existing.status !== "not_started") {
    return { ...existing, status: "already_started" };
  }
  const preview = await requestStagingServer(
    "/api/admin/emergency-auto/e2e-002/bulk-preview", user,
  );
  if (preview.status !== "offer_all" ||
      !Number.isInteger(preview.eligibleInSelectedWave) ||
      Number(preview.eligibleInSelectedWave) < 1) {
    throw new Error(
      "No eligible Volunteers in the verified first wave of the fictional staging case.",
    );
  }
  const sent = await requestStagingServer(
    "/api/admin/emergency-auto/e2e-002/bulk-send",
    user, "POST",
    { caseId: STAGING_BULK_CASE_ID, confirmAllEligibleTestOffers: true },
  );
  if (!["offered", "already_started"].includes(String(sent.status))) {
    throw new Error("Staging server did not confirm a batch offer.");
  }
  return sent;
}
