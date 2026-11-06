import type { UserProfile } from "./firebaseAuth";
import {
  homeRouteForProfile,
  isAdminProfile,
  isApprovedProfile,
  isLguPersonnelProfile,
  isSuperAdminProfile,
} from "./firebaseAuth";

/**
 * No user-selected role or extra privilege is accepted at Login.
 * Only the already authenticated and server-backed profile determines the route.
 * Protected route guards and Firestore Rules remain authoritative.
 */
export function unifiedPasswordDestination(profile: UserProfile) {
  if (!isApprovedProfile(profile)) {
    throw new Error("Your account is not approved for access yet.");
  }
  if (profile.role === "applicant") {
    throw new Error("Your LGU Admin request is pending independent Super Admin approval.");
  }
  if (profile.role === "admin" && !isAdminProfile(profile)) {
    throw new Error("Your LGU Admin access is inactive. Contact an authorized Super Admin.");
  }
  if (profile.role === "superadmin" && !isSuperAdminProfile(profile)) {
    throw new Error("Your Super Admin access is inactive.");
  }
  if (profile.role === "lgu_personnel" && !isLguPersonnelProfile(profile)) {
    throw new Error("Your LGU staff account has not been cleared for access.");
  }
  return homeRouteForProfile(profile);
}
