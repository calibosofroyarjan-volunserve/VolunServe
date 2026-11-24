/**
 * Resolve a single, isolated Firebase/Node environment for identity actions.
 *
 * Both Expo runtime and Firebase target are inspected before obtaining a token:
 * an incomplete staging build must NEVER send staging credentials to production.
 * This does not relax the server's Firebase-token or Admin authorization.
 */
export type IdentityEnvironmentInput = {
  runtimeEnv?: string;
  firebaseTarget?: string;
  projectId?: string;
};

export function identityEnvironmentTarget(input: IdentityEnvironmentInput): "staging" | "production" {
  const runtime = String(input.runtimeEnv || "").trim().toLowerCase();
  const target = String(input.firebaseTarget || "production").trim().toLowerCase();
  const projectId = String(input.projectId || "").trim();

  if (runtime && runtime !== "production" && runtime !== "staging") {
    throw new Error("Identity environment is unknown. Requests are blocked.");
  }
  if (target !== "production" && target !== "staging") {
    throw new Error("Firebase identity target is unknown. Requests are blocked.");
  }

  const stagingRequested = runtime === "staging" ||
    target === "staging" || projectId === "volunserve-full-staging";
  if (stagingRequested) {
    if (runtime === "production" || target !== "staging" ||
        projectId !== "volunserve-full-staging") {
      throw new Error("Staging identity setup is inconsistent. No identity request was sent.");
    }
    return "staging";
  }

  if (target !== "production" || projectId !== "volunserve-3aa5b") {
    throw new Error("Production identity setup is inconsistent. No identity request was sent.");
  }
  return "production";
}

export function identityAdminApiBaseUrl(input: IdentityEnvironmentInput): string {
  return identityEnvironmentTarget(input) === "staging"
    ? "https://volunserve-backend-staging.onrender.com"
    : "https://volunserve.onrender.com";
}
