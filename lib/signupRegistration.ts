import {
  createUserWithEmailAndPassword, getIdToken, reload,
  signInWithEmailAndPassword, type User,
} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import {auth, db} from "./firebase";

/** No profile writes, credential linking, password changes, or local PII storage. */
export async function authenticateEmailSignup(email: string, password: string, resumeOnly = false): Promise<User> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error("Enter your registration email and password.");
  let user: User;
  if (resumeOnly) {
    user = (await signInWithEmailAndPassword(auth, normalized, password)).user;
  } else {
    // A new registration must never silently sign in an existing account.
    // Let auth/email-already-in-use reach the signup screen so it can show
    // the existing-account message without navigating away.
    // Only the explicit Resume Registration action can sign in a pending UID.
    user = (await createUserWithEmailAndPassword(auth, normalized, password)).user;
  }
  if (auth.currentUser?.uid !== user.uid || user.email?.toLowerCase() !== normalized) {
    throw new Error("Your registration session changed. Sign in again to resume.");
  }
  return user;
}

export async function inspectSignupUser(user: User): Promise<{user: User; profileExists: boolean}> {
  await reload(user);
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error("Your registration session changed. Sign in again to resume.");
  }
  if (user.emailVerified) await getIdToken(user, true);
  const profile = await getDoc(doc(db, "users", user.uid));
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error("Your registration session changed. Sign in again to resume.");
  }
  return {user, profileExists: profile.exists()};
}
