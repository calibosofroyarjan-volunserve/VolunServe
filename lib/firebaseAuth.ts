import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  reload,
  getIdToken,
  sendEmailVerification,
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
import { httpsCallable } from "firebase/functions";
import { auth, db, firebaseConfig, functions, usingFirebaseEmulators } from "./firebase";
import { Platform } from "react-native";
import { disableAndroidPhoneAlerts } from "./androidNativePush";
import { getRegistrationEmailError } from "./registrationEmailPolicy";

export const connectGoogleAccountWeb = async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
    });
    const result = await signInWithPopup(auth, provider);
    const emailError = getRegistrationEmailError(result.user.email || "");
    if (emailError || !result.user.emailVerified) {
      await signOut(auth);
      throw new Error(emailError || "Please verify your Google email before continuing.");
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

/**
 * Firebase Email Enumeration Protection disallows SDK linkWithCredential
 * with EmailAuthCredential. Identity Toolkit accounts:signUp with the
 * CURRENT USER'S verified ID token is the documented replacement.
 * Never request or store a user's actual Gmail/Google password.
 *
 * The emulator retains the normal SDK path for offline auth tests.
 */
async function attachVolunServePassword(user: User, password: string): Promise<User> {
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.emailVerified) {
    throw new Error("Your Google email must be verified before setting a VolunServe password.");
  }
  const emailError = getRegistrationEmailError(email);
  if (emailError) throw new Error(emailError);
  if (hasPasswordSignInProvider(user)) {
    throw new Error("This account already has an Email + Password sign-in. Use Change Password instead.");
  }

  if (usingFirebaseEmulators) {
    const credential = EmailAuthProvider.credential(email, password);
    const linked = await linkWithCredential(user, credential);
    await reload(linked.user);
    return auth.currentUser || linked.user;
  }

  const idToken = await getIdToken(user, true);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        idToken,
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );
  const payload: any = await response.json();
  if (!response.ok) {
    const apiCode = String(payload?.error?.message || "");
    if (apiCode.includes("EMAIL_EXISTS")) {
      throw new Error("That email already has a separate login. Do not create another account; contact VolunServe support.");
    }
    if (apiCode.includes("INVALID_ID_TOKEN") || apiCode.includes("CREDENTIAL_TOO_OLD_LOGIN_AGAIN")) {
      throw new Error("Your Google session expired. Sign in with Google again and retry.");
    }
    if (apiCode.includes("WEAK_PASSWORD")) {
      throw new Error("Choose a stronger VolunServe password.");
    }
    throw new Error("Unable to link your VolunServe password securely. Please retry after signing in with Google.");
  }
  // Never accept a result that would split the profile into a second Firebase UID.
  if (payload.localId !== user.uid) {
    throw new Error("Password linking returned a different account. Do not proceed; contact support.");
  }
  // Complete a real Email+Password sign-in as a post-link validation.
  // This also refreshes Firebase SDK credentials after the REST operation.
  const confirmed = await signInWithEmailAndPassword(auth, email, password);
  if (confirmed.user.uid !== user.uid) {
    await signOut(auth);
    throw new Error("Account mismatch after password linking. Contact support.");
  }
  await reload(confirmed.user);
  await getIdToken(confirmed.user, true);
  return confirmed.user;
}

const verifyRegistrationEmailDomain = httpsCallable(
  functions, "verifyRegistrationEmailDomain"
);

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

    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      throw new Error("Use at least 8 characters including uppercase, lowercase, a number and a special character.");
    }

    if (hasPasswordSignInProvider(user)) {
      await updatePassword(user, password);
      await user.reload();
      return auth.currentUser || user;
    }

    return attachVolunServePassword(user, password);
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
  /** Only new email/password signups require ownership confirmation; legacy accounts are unchanged. */
  emailVerificationRequired?: boolean;
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
  // Keep Firebase login, session guards, and Firestore operational-role rules
  // consistent: a suspended LGU Admin is never an approved active account.
  if (profile.role === "admin" && profile.adminStatus === "suspended") {
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
    profile?.role === "admin"
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
  if (profile.role === "admin") {
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
    let user: User;
    let newlyCreatedPasswordUser: User | null = null;
    const submittedEmail = data.email.trim().toLowerCase();
    // Check before creating an Auth UID; client-side blocklist is not a
    // substitute for verified email ownership or a backend abuse service.
    const emailError = getRegistrationEmailError(submittedEmail);
    if (emailError) throw new Error(emailError);
    if (
      data.password.length < 8 ||
      !/[A-Z]/.test(data.password) ||
      !/[a-z]/.test(data.password) ||
      !/\d/.test(data.password) ||
      !/[^A-Za-z0-9]/.test(data.password)
    ) {
      throw new Error("Password must contain 8+ characters, uppercase, lowercase, a number and a special character.");
    }
    if (!Number.isInteger(data.age) || data.age < 18 || data.age > 120) {
      throw new Error("VolunServe registration requires age 18 or older.");
    }
    if (data.province !== "Bulacan" ||
        !["City of San Jose del Monte", "San Jose del Monte"].includes(data.city) ||
        !data.barangay?.trim()) {
      throw new Error("VolunServe registration is restricted to San Jose del Monte, Bulacan.");
    }
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
      user = auth.currentUser;
      // Google OAuth validates ownership of its verified email, but it must
      // satisfy the same verification requirement as manual registration.
      if (!user.emailVerified) {
        throw new Error("Please verify your Google email before completing registration.");
      }
      await getIdToken(user, true);
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
      newlyCreatedPasswordUser = user;
    }
    const uid = user.uid;
    const profileRef = doc(db, "users", uid);
    const existing = await getDoc(profileRef);
    if (existing.exists()) {
      throw new Error(
        "This account already has a VolunServe profile. Please sign in instead or use a different account for this registration."
      );
    }
    // A client-side temp-mail check is never sufficient: the Cloud Function
    // checks the canonical Firebase Auth email against a maintained server
    // denylist, then creates an immutable emailTrust/{uid} record. Without
    // that record Firestore Rules reject creation of a new Resident profile.
    try {
      await verifyRegistrationEmailDomain({});
    } catch (error: any) {
      // Only delete the UID created in THIS invocation. Never delete an
      // existing Google account while linking its VolunServe credentials.
      if (newlyCreatedPasswordUser) {
        await deleteUser(newlyCreatedPasswordUser).catch(() => undefined);
      }
      if (error?.code === "functions/permission-denied") {
        throw new Error(error?.message || "Temporary email addresses are not accepted.");
      }
      throw new Error(
        "Secure email registration checks are unavailable. Your account has not been activated. Please try again later."
      );
    }
    // Google registration must also have an Email/Password credential linked
    // to the SAME Firebase UID. This keeps one VolunServe profile while
    // allowing the resident to sign in either with Google or manually.
    if (usesGoogle) {
      const hasPasswordProvider = user.providerData.some(
        (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID
      );
      if (!hasPasswordProvider) {
        if (!data.password) {
          throw new Error(
            "Create a VolunServe password so this account can use both Google and email/password sign-in."
          );
        }
        user = await attachVolunServePassword(user, data.password);
      }
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
      emailVerificationRequired: true,
      emailPolicyVersion: 1,
      profilePictureUrl:
        user.photoURL || "",
      createdAt:
        serverTimestamp(),
    });
    await batch.commit();
    if (!usesGoogle && !user.emailVerified) {
      // Firebase sends a confirmation link; the app must not call unverified
      // email ownership proof. Delivery failures should NOT turn a successfully
      // saved Basic account into a fake registration failure.
      try {
        await sendEmailVerification(user);
      } catch (emailError) {
        console.warn("Basic account saved but email verification could not be sent:", emailError);
      }
    }
    if (!usesGoogle) {
      // Email/password registration is NOT verified until the email link is opened.
      // Prevent auto-entry to protected tabs through an already-authenticated signup.
      await signOut(auth);
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

/** Resend verified-email proof only after the account's own password is supplied. */
export const resendResidentVerificationEmail = async (
  submittedEmail: string, password: string
): Promise<"sent" | "verified"> => {
  const email = submittedEmail.trim().toLowerCase();
  const emailError = getRegistrationEmailError(email);
  if (emailError) throw new Error(emailError);
  if (!password) throw new Error("Enter your VolunServe password to resend verification.");
  const credential = await signInWithEmailAndPassword(auth, email, password)
    .catch((error: any) => { throw new Error(friendlyAuthError(error)); });
  try {
    await reload(credential.user);
    if (credential.user.emailVerified) return "verified";
    const docSnap = await getDoc(doc(db, "users", credential.user.uid));
    if (!docSnap.exists()) {
      throw new Error("No completed VolunServe profile was found. Finish registration first.");
    }
    const profile = docSnap.data() as UserProfile;
    if (profile.role !== "resident" && profile.role !== "volunteer") {
      throw new Error("Staff accounts must contact their administrative account manager.");
    }
    await sendEmailVerification(credential.user);
    return "sent";
  } catch (error: any) {
    if (error?.code === "auth/too-many-requests") {
      throw new Error("Too many verification requests. Check inbox/spam and retry later.");
    }
    throw error;
  } finally {
    await signOut(auth).catch(() => undefined);
  }
};

export const loginUser = async (
  email: string,
  password: string
) => {
  try {
    const userCredential =
      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
    const user = userCredential.user;
    const emailError = getRegistrationEmailError(user.email || email);
    if (emailError) {
      await signOut(auth);
      throw new Error(emailError);
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
    if (
      profile.emailVerificationRequired === true ||
      profile.role === "resident" ||
      profile.role === "volunteer"
    ) {
      await reload(user);
      if (!user.emailVerified) {
        try { await sendEmailVerification(user); } catch {
          // The user may have recently received a link; do not hide the requirement.
        }
        await signOut(auth);
        throw new Error("Please verify your email address before signing in. Check your inbox and Spam folder for the verification link, then sign in again.");
      }
      // Refresh the email_verified token claim used by Firestore role gates.
      await getIdToken(user, true);
    }
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
      if (profile.role === "admin" && profile.adminStatus === "suspended") {
        throw new Error(
          "Your administrative access is suspended. Contact your authorized Super Admin."
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
