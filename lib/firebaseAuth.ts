// lib/firebaseAuth.ts
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type Role = "applicant" | "volunteer" | "resident" | "admin" | "superadmin";

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

  role: Role;
  status?: "pending_review" | "approved" | "rejected";

  profilePictureUrl?: string;
  createdAt: any;
}

export interface SignupData {
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
}

function friendlyAuthError(err: any) {
  const code = err?.code;
  if (code === "auth/email-already-in-use") return "Email already registered.";
  if (code === "auth/weak-password") return "Password too weak (minimum 6 characters).";
  if (code === "auth/invalid-email") return "Invalid email.";
  if (code === "auth/user-not-found") return "No account with this email.";
  if (code === "auth/wrong-password") return "Incorrect password.";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  return err?.message || "Something went wrong.";
}

function friendlyFirestoreError(err: any) {
  const code = err?.code;
  if (code === "permission-denied") {
    return "Firestore permission denied. Check Firestore Rules for users/{uid} and address_regions read access.";
  }
  return err?.message || "Firestore error.";
}

// ✅ Signup: Auth + Firestore profile
export const signUpUser = async (data: SignupData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      data.email.trim().toLowerCase(),
      data.password
    );

    const user = userCredential.user;

    const fullName = [data.lastName, data.firstName, data.middleName]
      .filter(Boolean)
      .join(", ")
      .replace(", ,", ",")
      .trim();

    const occupation =
      (data.occupationOther && data.occupationOther.trim()) ||
      (data.occupationSpecialization && data.occupationSpecialization.trim()) ||
      data.occupationCategory;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,

      fullName,
      lastName: data.lastName.trim(),
      firstName: data.firstName.trim(),
      middleName: (data.middleName || "").trim(),
      age: data.age,
      email: data.email.trim().toLowerCase(),
      phoneNumber: data.phoneNumber.trim(),

      region: data.region,
      province: data.province,
      city: data.city,
      barangay: data.barangay,
      address: `${data.barangay}, ${data.city}, ${data.province}, ${data.region}`,

      occupationCategory: data.occupationCategory,
      occupationSpecialization: (data.occupationSpecialization || "").trim(),
      occupationOther: (data.occupationOther || "").trim(),
      occupation,

      role: "applicant" as Role,
      status: "pending_review",

      profilePictureUrl: "",
      createdAt: serverTimestamp(),
    });

    return user;
  } catch (err: any) {
    const msg = err?.code?.startsWith("auth/") ? friendlyAuthError(err) : friendlyFirestoreError(err);
    throw new Error(msg);
  }
};

export const loginUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );
    const user = userCredential.user;

    // ensure profile exists
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        fullName: user.displayName || "User",
        email: user.email?.toLowerCase() || email.trim().toLowerCase(),
        phoneNumber: "",
        role: "resident" as Role,
        status: "approved",
        profilePictureUrl: "",
        createdAt: serverTimestamp(),
      });
    }

    return user;
  } catch (err: any) {
    const msg = err?.code?.startsWith("auth/") ? friendlyAuthError(err) : friendlyFirestoreError(err);
    throw new Error(msg);
  }
};

export const logoutUser = async () => {
  await signOut(auth);
};

export const getUserProfile = async (uid: string) => {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) throw new Error("Profile not found");
  return snap.data() as UserProfile;
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>) => {
  const { uid: _uid, email: _email, createdAt: _createdAt, ...safe } = updates as any;
  await updateDoc(doc(db, "users", uid), safe);
};

export const onAuthChange = (cb: (user: User | null) => void) => {
  return firebaseOnAuthStateChanged(auth, cb);
};