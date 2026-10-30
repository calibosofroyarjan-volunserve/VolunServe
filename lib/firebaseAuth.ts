import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  EmailAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { Platform } from "react-native";
import { disableAndroidPhoneAlerts } from "./androidNativePush";
import { isKnownDisposableEmail } from "./registrationEmailPolicy";

export const TEMP_EMAIL_BLOCK_MESSAGE = "Temporary email addresses are not allowed. Use a permanent email address.";

export function assertAcceptedEmail(email: string | null | undefined): void {
  if (!email || isKnownDisposableEmail(email)) {
    throw new Error(email ? TEMP_EMAIL_BLOCK_MESSAGE : "A valid email address is required.");
  }
}

export const connectGoogleAccountWeb = async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
    });
    const result = await signInWithPopup(auth, provider);
    try {
      assertAcceptedEmail(result.user.email);
    } catch (error) {
      await signOut(auth);
      throw error;
    }
    return result.user;
  } catch (err: any) {
    if (err?.code === "auth/popup-closed-by-user") {
      throw new Error("Google sign-in was cancelled.");
    }
    if (err?.code === "auth/popup-blocked") {
      throw new Error(
        "The Google sign-in popup was blocked. Allow popups for localhost and try again."
      );
    }
    throw new Error(friendlyAuthError(err));
  }
};

export const hasPasswordSignInProvider = (
  user: User | null | undefined
) => {
  return Boolean(
    user?.providerData.some(
      (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID
    )
  );
};

export const setVolunServePasswordForCurrentGoogleUser = async (
  password: string
) => {
  try {
    const user = auth.currentUser;

    if (!user) {
      throw new Error(
        "Sign in with Google again before setting your VolunServe password."
      );
    }

    const email = user.email?.trim().toLowerCase();
    assertAcceptedEmail(email);

    if (!email) {
      throw new Error(
        "Your Google account does not have an email address available for VolunServe sign-in."
      );
    }

    const hasGoogleProvider = user.providerData.some(
      (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID
    );

    if (!hasGoogleProvider) {
      throw new Error(
        "Sign in with Google first so VolunServe can securely verify account ownership."
      );
    }

    if (!password || password.length < 8) {
      throw new Error(
        "Create a VolunServe password with at least 8 characters."
      );
    }

    if (hasPasswordSignInProvider(user)) {
      await updatePassword(user, password);
      await user.reload();
      return auth.currentUser || user;
    }

    const credential = EmailAuthProvider.credential(email, password);
    const linkedCredential = await linkWithCredential(user, credential);
    await linkedCredential.user.reload();

    return auth.currentUser || linkedCredential.user;
  } catch (err: any) {
    const message = err?.code?.startsWith("auth/")
      ? friendlyAuthError(err)
      : err?.message || "Unable to set the VolunServe password.";

    throw new Error(message);
  }
};

export type Role =
  | "applicant"
  | "volunteer"
  | "resident"
  | "lgu_personnel"
  | "admin"
  | "superadmin";

/**
 * Kept for compatibility with existing profile/application code.
 * Public signup itself always creates a Resident account.
 */

export type PublicRole =
  | "resident"
  | "volunteer";

export type AccountStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export type VolunteerStatus =
  | "not_applied"
  | "pending"
  | "approved"
  | "rejected";

export type IdentityStatus =
  | "basic"
  | "pending"
  | "verified"
  | "failed";

export type UserMode =
  | "resident"
  | "volunteer";

export interface UserProfile {
  uid: string;
  fullName: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  age: number;
  email: string;
  phoneNumber: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  address?: string;
  occupationCategory?: string;
  occupationSpecialization?: string;
  occupationOther?: string;
  occupation?: string;
  skills?: string[];
  skillOther?: string;
  availability?: string[];
  role: Role;
  requestedRole?: PublicRole | "lgu_personnel";
  primaryRole?: PublicRole | "lgu_personnel";
  residentAccess?: boolean;
  volunteerAccess?: boolean;
  volunteerStatus?: VolunteerStatus;
  activeMode?: UserMode | "lgu_personnel";
  lguVerified?: boolean;
  employmentStatus?: string;
  department?: string;
  position?: string;
  employeeId?: string;
  isTestAccount?: boolean;
  status?: AccountStatus;
  /** Privileged staff accounts can be explicitly suspended by Super Admin. */
  adminStatus?: "active" | "suspended";
  reviewedAt?: any;
  reviewedBy?: string;
  rejectedReason?: string;
  identityStatus?: IdentityStatus;
  identityVerified?: boolean;
  identitySubmittedAt?: any;
  identityVerifiedAt?: any;
  identityVerifiedBy?: string;
  identityFailureReason?: string;
  profilePictureUrl?: string;
  createdAt: any;
  points?: number;
  joined?: number;
  completed?: number;
  achievements?: string[];
}

export interface SignupData {
  /**
   * Kept optional only so older/current signup screens can keep passing it.
   * signUpUser intentionally ignores Volunteer signup intent and always
   * creates a Basic Resident account.
   */
  role?: PublicRole;
  lastName: string;
  firstName: string;
  middleName?: string;
  age: number;
  email: string;
  password: string;
  authProvider?: "email" | "google";
  phoneNumber: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  occupationCategory: string;
  occupationSpecialization?: string;
  occupationOther?: string;
  /**
   * Legacy compatibility only.
   * Volunteer skills and availability are intentionally not saved at signup.
   * They belong to the Volunteer Application after Resident verification.
   */
  skills?: string[];
  skillOther?: string;
  availability?: string[];
}

export const isApprovedProfile = (
  profile: UserProfile | null | undefined
) => {
  if (!profile) {
    return false;
  }
  return (
    profile.status === "approved" ||
    (
      !profile.status &&
      profile.role !== "applicant"
    )
  );
};

export const isAdminProfile = (
  profile: UserProfile | null | undefined
) => {
  return (
    isApprovedProfile(profile) &&
    profile?.role === "admin" &&
    profile?.adminStatus !== "suspended"
  );
};

export const isSuperAdminProfile = (
  profile: UserProfile | null | undefined
) => {
  return (
    isApprovedProfile(profile) &&
    profile?.role === "superadmin"
  );
};

export const isAdminOrSuperAdminProfile = (
  profile: UserProfile | null | undefined
) => {
  return (
    isAdminProfile(profile) ||
    isSuperAdminProfile(profile)
  );
};

export const isLguPersonnelProfile = (
  profile: UserProfile | null | undefined
) => {
  return (
    isApprovedProfile(profile) &&
    profile?.role === "lgu_personnel" &&
    profile?.lguVerified === true &&
    String(profile?.employmentStatus || "").toLowerCase() === "active"
  );
};

export const getIdentityStatus = (
  profile: UserProfile | null | undefined
): IdentityStatus => {
  if (!profile) {
    return "basic";
  }
  if (
    profile.identityVerified === true ||
    profile.identityStatus === "verified"
  ) {
    return "verified";
  }
  return profile.identityStatus || "basic";
};

export const isIdentityVerified = (
  profile: UserProfile | null | undefined
) => {
  return (
    isApprovedProfile(profile) &&
    getIdentityStatus(profile) === "verified"
  );
};

export const hasResidentAccess = (
  profile: UserProfile | null | undefined
) => {
  if (!profile || !isApprovedProfile(profile)) {
    return false;
  }
  // Admin and Super Admin are system roles, not community Resident roles.
  if (
    profile.role === "admin" ||
    profile.role === "superadmin" ||
    profile.role === "lgu_personnel" ||
    profile.role === "applicant"
  ) {
    return false;
  }
  // New architecture requires explicit Resident access.
  return profile.residentAccess === true;
};

export const isVerifiedResidentProfile = (
  profile: UserProfile | null | undefined
) => {
  return (
    hasResidentAccess(profile) &&
    isIdentityVerified(profile)
  );
};

export const hasVolunteerAccess = (
  profile: UserProfile | null | undefined
) => {
  if (!profile || !isApprovedProfile(profile)) {
    return false;
  }
  // Admin and Super Admin must never inherit Volunteer privileges.
  if (
    profile.role === "admin" ||
    profile.role === "superadmin" ||
    profile.role === "lgu_personnel" ||
    profile.role === "applicant"
  ) {
    return false;
  }
  return (
    profile.volunteerAccess === true &&
    profile.volunteerStatus === "approved"
  );
};

export const getActiveMode = (
  profile: UserProfile | null | undefined
): UserMode => {
  if (!profile) {
    return "resident";
  }
  if (
    profile.activeMode === "volunteer" &&
    hasVolunteerAccess(profile)
  ) {
    return "volunteer";
  }
  return "resident";
};

export const administrativeRouteForProfile = (
  profile: UserProfile | null | undefined
) => {
  if (!profile || !isApprovedProfile(profile)) {
    return null;
  }
  if (profile.role === "superadmin") {
    return "/(superadmin)" as const;
  }
  if (isAdminProfile(profile)) {
    return "/(admin)/command-center" as const;
  }
  return null;
};

export const lguRouteForProfile = (
  profile: UserProfile | null | undefined
) => {
  if (!isLguPersonnelProfile(profile)) {
    return null;
  }
  return "/(lgu)" as const;
};

export const homeRouteForProfile = (
  profile: UserProfile
) => {
  return (
    administrativeRouteForProfile(profile) ||
    lguRouteForProfile(profile) ||
    ("/(tabs)" as const)
  );
};

function friendlyAuthError(err: any) {
  const code = err?.code;
  if (code === "auth/email-already-in-use") {
    return "Email already registered.";
  }
  if (code === "auth/weak-password") {
    return "Password too weak (minimum 6 characters).";
  }
  if (code === "auth/invalid-email") {
    return "Invalid email.";
  }
  if (code === "auth/user-not-found") {
    return "No account with this email.";
  }
  if (code === "auth/wrong-password") {
    return "Incorrect password.";
  }
  if (code === "auth/invalid-credential") {
    return "Invalid email or password.";
  }
  if (code === "auth/credential-already-in-use") {
    return "This sign-in credential is already linked to another account.";
  }
  if (code === "auth/provider-already-linked") {
    return "This sign-in method is already connected to your account.";
  }
  if (code === "auth/requires-recent-login") {
    return "For security, sign in with Google again before changing your VolunServe password.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many login attempts. Please try again later.";
  }
  return err?.message || "Something went wrong.";
}

function friendlyFirestoreError(err: any) {
  const code = err?.code;
  if (code === "permission-denied") {
    return "Firestore permission denied. Check Firestore Rules.";
  }
  return err?.message || "Firestore error.";
}

export const signUpUser = async (
  data: SignupData
) => {
  try {
    let user;
    const submittedEmail = data.email.trim().toLowerCase();
    // Check before creating a Firebase Auth account for both providers.
    assertAcceptedEmail(submittedEmail);
    const usesGoogle = data.authProvider === "google";
    if (usesGoogle) {
      if (!auth.currentUser) {
        throw new Error(
          "Your Google registration session expired. Connect your Google account again."
        );
      }
      const authenticatedEmail =
        auth.currentUser.email?.trim().toLowerCase();
      if (
        !authenticatedEmail ||
        authenticatedEmail !== submittedEmail
      ) {
        throw new Error(
          "The connected Google account does not match the email in the registration form."
        );
      }
      assertAcceptedEmail(auth.currentUser.email);
      user = auth.currentUser;
    } else {
      if (auth.currentUser) {
        await signOut(auth);
      }
      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          submittedEmail,
          data.password
        );
      user = userCredential.user;
    }
    const uid = user.uid;
    const profileRef = doc(db, "users", uid);
    const existing = await getDoc(profileRef);
    if (existing.exists()) {
      throw new Error(
        "This account already has a VolunServe profile. Please sign in instead or use a different account for this registration."
      );
    }
    // Google OAuth is an independent registration choice. Do not require or
    // silently attach an email/password credential to the Google identity.
    // Password accounts are created only by the email signup path.
    if (usesGoogle && !user.emailVerified) {
      throw new Error("This Google account's email is not verified.");
    }
    const fullName = [
      data.lastName,
      data.firstName,
      data.middleName,
    ]
      .filter(Boolean)
      .join(", ")
      .replace(", ,", ",")
      .trim();
    const occupation =
      (
        data.occupationOther &&
        data.occupationOther.trim()
      ) ||
      (
        data.occupationSpecialization &&
        data.occupationSpecialization.trim()
      ) ||
      data.occupationCategory;
    const batch = writeBatch(db);
    /**
     * FINAL PUBLIC SIGNUP RULE:
     * Every registration creates one Basic Resident account.
     * Volunteer access can only be requested later by a Verified Resident.
     */
    batch.set(profileRef, {
      uid,
      fullName,
      lastName: data.lastName.trim(),
      firstName: data.firstName.trim(),
      middleName:
        (data.middleName || "").trim(),
      age: data.age,
      email: submittedEmail,
      phoneNumber:
        data.phoneNumber.trim(),
      region: data.region,
      province: data.province,
      city: data.city,
      barangay: data.barangay,
      address:
        `${data.barangay}, ${data.city}, ${data.province}, ${data.region}`,
      occupationCategory:
        data.occupationCategory,
      occupationSpecialization:
        (
          data.occupationSpecialization ||
          ""
        ).trim(),
      occupationOther:
        (
          data.occupationOther ||
          ""
        ).trim(),
      occupation,
      // Volunteer qualifications are collected later in the
      // Verified Resident -> Volunteer Application flow.
      skills: [],
      skillOther: "",
      availability: [],
      role: "resident" as Role,
      requestedRole: "resident" as PublicRole,
      primaryRole: "resident" as PublicRole,
      residentAccess: true,
      volunteerAccess: false,
      volunteerStatus:
        "not_applied" as VolunteerStatus,
      activeMode: "resident" as UserMode,
      // Basic accounts are immediately active for safe/basic Resident use.
      // Identity verification controls protected Verified Resident features.
      status: "approved" as AccountStatus,
      identityStatus:
        "basic" as IdentityStatus,
      identityVerified: false,
      profilePictureUrl:
        user.photoURL || "",
      createdAt:
        serverTimestamp(),
    });
    await batch.commit();
    if (!usesGoogle && !user.emailVerified) {
      // Always end an email/password registration session until the inbox
      // verification link has been opened (including if delivery fails).
      try {
        await sendEmailVerification(user);
      } finally {
        await signOut(auth);
      }
    }
    return user;
  } catch (err: any) {
    const message =
      err?.code?.startsWith("auth/")
        ? friendlyAuthError(err)
        : friendlyFirestoreError(err);
    throw new Error(message);
  }
};

export const loginUser = async (
  email: string,
  password: string
) => {
  try {
    assertAcceptedEmail(email);
    const userCredential =
      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
    const user = userCredential.user;
    await user.reload();
    if (isKnownDisposableEmail(user.email || "")) {
      await signOut(auth);
      throw new Error(TEMP_EMAIL_BLOCK_MESSAGE);
    }
    if (!user.emailVerified) {
      await signOut(auth);
      throw new Error("Please verify your email using the link sent to your inbox before signing in.");
    }
    const profileRef =
      doc(db, "users", user.uid);
    const profileSnapshot =
      await getDoc(profileRef);
    if (!profileSnapshot.exists()) {
      await signOut(auth);
      throw new Error(
        "No VolunServe profile was found for this account. Please register first."
      );
    }
    const profile =
      profileSnapshot.data() as UserProfile;
    const status = profile.status;
    /**
     * Basic Accounts are valid active accounts because their status is
     * "approved". They do NOT need identity verification just to sign in.
     * Verification only unlocks protected Verified Resident functions.
     */
    if (!isApprovedProfile(profile)) {
      await signOut(auth);
      if (status === "rejected") {
        throw new Error(
          profile.rejectedReason
            ? `Registration rejected: ${profile.rejectedReason}`
            : "Your registration was rejected. Please contact an administrator."
        );
      }
      if (status === "suspended") {
        throw new Error(
          "Your account is suspended. Please contact an administrator."
        );
      }
      throw new Error(
        "This legacy account is still pending administrative review."
      );
    }
    return {
      user,
      profile,
    };
  } catch (err: any) {
    const message =
      err?.code?.startsWith("auth/")
        ? friendlyAuthError(err)
        : friendlyFirestoreError(err);
    throw new Error(message);
  }
};

export const logoutUser = async () => {
  // Best-effort unregister BEFORE Firebase sign-out so a shared Android
  // handset does not continue receiving the previous account's pushes.
  // Do not block logout indefinitely when offline or when notifications
  // were never enabled.
  if (Platform.OS === "android" && auth.currentUser) {
    await Promise.race([
      disableAndroidPhoneAlerts().catch(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, 1800)),
    ]);
  }
  await signOut(auth);
};

export const getUserProfile = async (
  uid: string
) => {
  const snapshot =
    await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) {
    throw new Error("Profile not found.");
  }
  return snapshot.data() as UserProfile;
};

export const updateUserProfile = async (
  uid: string,
  updates: Partial<UserProfile>
) => {
  /**
   * Community users may update profile details only.
   * Trust/access fields are controlled by the dedicated verification,
   * Volunteer approval, Admin, and Super Admin workflows.
   */
  const {
    uid: _uid,
    email: _email,
    createdAt: _createdAt,
    role: _role,
    requestedRole: _requestedRole,
    primaryRole: _primaryRole,
    residentAccess: _residentAccess,
    volunteerAccess: _volunteerAccess,
    volunteerStatus: _volunteerStatus,
    activeMode: _activeMode,
    lguVerified: _lguVerified,
    employmentStatus: _employmentStatus,
    department: _department,
    position: _position,
    employeeId: _employeeId,
    isTestAccount: _isTestAccount,
    status: _status,
    reviewedAt: _reviewedAt,
    reviewedBy: _reviewedBy,
    rejectedReason: _rejectedReason,
    identityStatus: _identityStatus,
    identityVerified: _identityVerified,
    identitySubmittedAt: _identitySubmittedAt,
    identityVerifiedAt: _identityVerifiedAt,
    identityVerifiedBy: _identityVerifiedBy,
    identityFailureReason: _identityFailureReason,
    ...safeUpdates
  } = updates as any;
  await updateDoc(
    doc(db, "users", uid),
    safeUpdates
  );
};

export const setActiveMode = async (
  uid: string,
  requestedMode: UserMode
) => {
  const profileRef =
    doc(db, "users", uid);
  const snapshot =
    await getDoc(profileRef);
  if (!snapshot.exists()) {
    throw new Error("Profile not found.");
  }
  const profile =
    snapshot.data() as UserProfile;
  if (!isApprovedProfile(profile)) {
    throw new Error(
      "Your account must be active before changing modes."
    );
  }
  if (
    profile.role === "admin" ||
    profile.role === "superadmin" ||
    profile.role === "lgu_personnel"
  ) {
    throw new Error(
      "Administrative and LGU Personnel accounts do not use Resident or Volunteer mode."
    );
  }
  if (
    requestedMode === "resident" &&
    !hasResidentAccess(profile)
  ) {
    throw new Error(
      "Resident mode is not available for this account."
    );
  }
  if (
    requestedMode === "volunteer" &&
    !hasVolunteerAccess(profile)
  ) {
    throw new Error(
      "Volunteer mode is available only after administrator approval."
    );
  }
  await updateDoc(
    profileRef,
    {
      activeMode: requestedMode,
    }
  );
  return requestedMode;
};

export const activeModeForProfile = (
  profile: UserProfile | null | undefined
): UserMode => {
  return getActiveMode(profile);
};

export const setActiveUserMode = async (
  mode: UserMode
) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in again.");
  }
  return setActiveMode(user.uid, mode);
};

export const onAuthChange = (
  callback: (user: User | null) => void
) => {
  return firebaseOnAuthStateChanged(
    auth,
    callback
  );
};
