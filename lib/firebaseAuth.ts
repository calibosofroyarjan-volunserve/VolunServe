import {
  createUserWithEmailAndPassword,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

export type Role = "volunteer" | "resident";

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  address?: string;
  occupation?: string;
  barangay?: string;
  phone?: string;
  role: Role;
  profilePictureUrl?: string;
  createdAt: any;
}

export interface SignupData {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  address?: string;
  occupation?: string;
  role: Role;
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
    return "Firestore permission denied. Fix Firestore Rules (users/{uid}) and click Publish.";
  }
  return err?.message || "Firestore error.";
}

// ✅ Signup: create Auth + create Firestore profile
export const signUpUser = async (data: SignupData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      data.email.trim(),
      data.password
    );

    const user = userCredential.user;

    // Create Firestore profile
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      phoneNumber: data.phoneNumber.trim(),
      address: data.address?.trim() || "",
      occupation: data.occupation?.trim() || "",
      role: data.role,
      profilePictureUrl: "",
      createdAt: serverTimestamp(),
    });

    return user;
  } catch (err: any) {
    // Throw with friendly message so UI can show it
    // If Firestore is denied, this will show the REAL reason.
    const msg = err?.code?.startsWith("auth/")
      ? friendlyAuthError(err)
      : friendlyFirestoreError(err);
    throw new Error(msg);
  }
};

// ✅ Login: sign in, then ensure profile exists (auto-create if missing)
export const loginUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    const user = userCredential.user;

    // Auto-create profile if missing (for accounts made before rules were fixed)
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        fullName: user.displayName || "New User",
        email: user.email?.toLowerCase() || email.trim().toLowerCase(),
        phoneNumber: "",
        address: "",
        occupation: "",
        role: "resident" as Role,
        profilePictureUrl: "",
        createdAt: serverTimestamp(),
      });
    }

    return user;
  } catch (err: any) {
    const msg = err?.code?.startsWith("auth/")
      ? friendlyAuthError(err)
      : friendlyFirestoreError(err);
    throw new Error(msg);
  }
};

export const logoutUser = async () => {
  await signOut(auth);
};

// ✅ Profile screen expects direct profile (throws if missing)
export const getUserProfile = async (uid: string) => {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) throw new Error("Profile not found");
  return snap.data() as UserProfile;
};

// ✅ Update profile fields
export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>) => {
  // protect critical fields
  const { uid: _uid, email: _email, createdAt: _createdAt, ...safe } = updates as any;
  await updateDoc(doc(db, "users", uid), safe);
};

// ✅ Auth listener
export const onAuthChange = (cb: (user: User | null) => void) => {
  return firebaseOnAuthStateChanged(auth, cb);
};

