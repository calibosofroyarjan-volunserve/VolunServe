import {
  createUserWithEmailAndPassword,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
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

export const connectGoogleAccountWeb = async () => {
  try {
    const provider = new GoogleAuthProvider();

    provider.setCustomParameters({
      prompt: "select_account",
    });

    const result = await signInWithPopup(auth, provider);
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

export type Role =
  | "applicant"
  | "volunteer"
  | "resident"
  | "admin"
  | "superadmin";

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

  requestedRole?: PublicRole;

  primaryRole?: PublicRole;
  residentAccess?: boolean;
  volunteerAccess?: boolean;
  volunteerStatus?: VolunteerStatus;
  activeMode?: UserMode;

  status?: AccountStatus;
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
  role: PublicRole;

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
    (
      profile?.role === "admin" ||
      profile?.role === "superadmin"
    )
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
  if (!profile || !isApprovedProfile(profile)) return false;

  if (
    profile.role === "admin" ||
    profile.role === "superadmin"
  ) {
    return true;
  }

  if (typeof profile.residentAccess === "boolean") {
    return profile.residentAccess;
  }

  return (
    profile.role === "resident" ||
    profile.role === "volunteer"
  );
};

export const hasVolunteerAccess = (
  profile: UserProfile | null | undefined
) => {
  if (!profile || !isApprovedProfile(profile)) return false;

  if (
    profile.role === "admin" ||
    profile.role === "superadmin"
  ) {
    return true;
  }

  if (typeof profile.volunteerAccess === "boolean") {
    return (
      profile.volunteerAccess &&
      (
        !profile.volunteerStatus ||
        profile.volunteerStatus === "approved"
      )
    );
  }

  return profile.role === "volunteer";
};

export const getActiveMode = (
  profile: UserProfile | null | undefined
): UserMode => {
  if (!profile) return "resident";

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

export const homeRouteForProfile = (
  profile: UserProfile
) => {
  return (
    administrativeRouteForProfile(profile) ||
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
    const usesGoogle = data.authProvider === "google";

    if (usesGoogle) {

      if (!auth.currentUser) {
        throw new Error(
          "Your Google registration session expired. Connect your Google account again."
        );
      }

      const authenticatedEmail =
        auth.currentUser.email?.trim().toLowerCase();

      if (!authenticatedEmail || authenticatedEmail !== submittedEmail) {
        throw new Error(
          "The connected Google account does not match the email in the registration form."
        );
      }

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

    const hadVolunteerSignupIntent =
      data.role === "volunteer";

    const batch = writeBatch(db);

    batch.set(profileRef, {
      uid,

      fullName,

      lastName: data.lastName.trim(),
      firstName: data.firstName.trim(),
      middleName:
        (data.middleName || "").trim(),

      age: data.age,

      email:
        data.email.trim().toLowerCase(),

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

      skills:
        hadVolunteerSignupIntent
          ? (data.skills || [])
          : [],

      skillOther:
        hadVolunteerSignupIntent
          ? (data.skillOther || "").trim()
          : "",

      availability:
        hadVolunteerSignupIntent
          ? (data.availability || [])
          : [],

      role: "resident" as Role,
      requestedRole: data.role,

      primaryRole: "resident",
      residentAccess: true,
      volunteerAccess: false,
      volunteerStatus:
        "not_applied" as VolunteerStatus,
      activeMode: "resident" as UserMode,

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
    const userCredential =
      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

    const user = userCredential.user;
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
