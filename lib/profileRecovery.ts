/**
 * Never sign the user out solely because a Firestore profile read timed out.
 * Only a successful authenticated profile read may grant protected access.
 */
export type ProfileReadIssue = "missing" | "unavailable";
export function profileReadIssue(error: unknown): ProfileReadIssue {
  if (error instanceof Error && error.message === "Profile not found.") return "missing";
  const code = (error && typeof error === "object" && "code" in error)
    ? String((error as { code?: unknown }).code || "").toLowerCase() : "";
  return code === "not-found" || code === "firestore/not-found" ? "missing" : "unavailable";
}

export function profileRecoveryMessage(issue: ProfileReadIssue): string {
  return issue === "missing"
    ? "Your account profile could not be found. Access remains blocked until your account is verified."
    : "We couldn't verify your account right now. Check your internet connection and try again. Your session has not been signed out.";
}
