/**
 * Public landing is NOT the destination for an already signed-in,
 * approved VolunServe account.
 *
 * Fail closed when the profile is absent, unapproved, or the authenticated
 * mailbox does not match its registered Resident/Volunteer profile. The
 * guest workspace preview (/public/preview) remains deliberately browsable.
 * The profile's trusted role/home route is resolved separately, never here.
 */
export type GuestLandingRedirectContext = {
  rootSegment: string;
  childSegment: string;
  authUid?: string | null;
  authEmail?: string | null;
  authEmailVerified: boolean;
  profileRole?: string | null;
  profileEmail?: string | null;
  approvedProfile: boolean;
  disposableEmail: boolean;
};

export function shouldLeaveGuestLanding(
  input: GuestLandingRedirectContext,
): boolean {
  if (input.rootSegment !== "public" ||
      (input.childSegment !== "" && input.childSegment !== "index")) {
    return false;
  }
  if (!input.authUid || !input.authEmailVerified ||
      !input.approvedProfile || !input.profileRole) {
    return false;
  }
  const communityAccount =
    input.profileRole === "resident" ||
    input.profileRole === "volunteer" ||
    input.profileRole === "applicant";
  if (communityAccount) {
    const signedInEmail = String(input.authEmail || "").trim().toLowerCase();
    const profileEmail = String(input.profileEmail || "").trim().toLowerCase();
    if (!signedInEmail || !profileEmail ||
        signedInEmail !== profileEmail || input.disposableEmail) {
      return false;
    }
  }
  return true;
}
