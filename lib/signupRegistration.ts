import {
  createUserWithEmailAndPassword, getIdToken, reload,
  signInWithEmailAndPassword, type User,
} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import {auth, db} from "./firebase";
import {getRegistrationEmailError} from "./registrationEmailPolicy";

/** No profile writes, credential linking, password changes, or local PII storage. */
export async function authenticateEmailSignup(email: string, password: string, resumeOnly = false, rejectExisting = false): Promise<User> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error("Enter your registration email and password.");
  const emailError = getRegistrationEmailError(normalized);
  if (emailError) throw new Error(emailError);
  let user: User;
  if (resumeOnly) {
    user = (await signInWithEmailAndPassword(auth, normalized, password)).user;
  } else {
    try {
      user = (await createUserWithEmailAndPassword(auth, normalized, password)).user;
    } catch (error) {
      if ((error as {code?: string}).code !== "auth/email-already-in-use" || rejectExisting) throw error;
      // Possession of the SAME password is required to resume an existing Auth UID.
      // Never create a second UID, reset credentials, or overwrite an existing profile.
      user = (await signInWithEmailAndPassword(auth, normalized, password)).user;
    }
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
