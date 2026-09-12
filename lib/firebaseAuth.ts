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

  status?: AccountStatus;
  reviewedAt?: any;
  reviewedBy?: string;
  rejectedReason?: string;

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

  // Compatibility para sa lumang approved accounts
  // na wala pang status field.
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

export const homeRouteForProfile = (
  profile: UserProfile
) => {
  return isAdminProfile(profile)
    ? ("/(admin)/command-center" as const)
    : ("/(tabs)" as const);
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

    if (auth.currentUser) {
      const authenticatedEmail =
        auth.currentUser.email
          ?.trim()
          .toLowerCase();

      const submittedEmail =
        data.email
          .trim()
          .toLowerCase();

      if (
        authenticatedEmail &&
        authenticatedEmail !== submittedEmail
      ) {
        throw new Error(
          "The connected account does not match the email in the registration form."
        );
      }

      user = auth.currentUser;
    } else {
      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          data.email.trim().toLowerCase(),
          data.password
        );

      user = userCredential.user;
    }

    const uid = user.uid;
    const profileRef = doc(db, "users", uid);
    const existing = await getDoc(profileRef);

    if (existing.exists()) {
      return user;
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

      skills: data.skills || [],
      skillOther:
        (data.skillOther || "").trim(),

      availability:
        data.availability || [],

      role: "applicant" as Role,
      requestedRole: data.role,

      status: "pending_review",

      profilePictureUrl:
        user.photoURL || "",

      createdAt:
        serverTimestamp(),
    });

    if (data.role === "volunteer") {
      batch.set(
        doc(
          db,
          "volunteerApplications",
          uid
        ),
        {
          uid,

          requestedRole:
            "volunteer",

          fullName,

          email:
            data.email
              .trim()
              .toLowerCase(),

          barangay:
            data.barangay,

          phone:
            data.phoneNumber.trim(),

          phoneNumber:
            data.phoneNumber.trim(),

          skills:
            data.skills || [],

          availability:
            data.availability || [],

          status:
            "pending",

          createdAt:
            serverTimestamp(),
        }
      );
    }

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
        "Your registration is still pending administrative review."
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
    status: _status,
    reviewedAt: _reviewedAt,
    reviewedBy: _reviewedBy,
    rejectedReason: _rejectedReason,
    ...safeUpdates
  } = updates as any;

  await updateDoc(
    doc(db, "users", uid),
    safeUpdates
  );
};

export const onAuthChange = (
  callback: (user: User | null) => void
) => {
  return firebaseOnAuthStateChanged(
    auth,
    callback
  );
};