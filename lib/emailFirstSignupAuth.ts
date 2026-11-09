import { EmailAuthProvider, getIdToken, linkWithCredential, reload, signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { EMAIL_FIRST_SIGNUP_ENABLED } from "./signupFeature";
import { getRegistrationEmailError } from "./registrationEmailPolicy";

/** Explicit signup consent only. Never reset a password or alter an existing profile. */
export async function linkEmailFirstGooglePassword(password: string) {
  if (!EMAIL_FIRST_SIGNUP_ENABLED) throw new Error("Email-first signup is not enabled.");
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in with Google again to resume registration.");
  await reload(user);
  if (!user.emailVerified || !user.email || auth.currentUser?.uid !== user.uid ||
      !user.providerData.some(p => p.providerId === "google.com")) {
    throw new Error("Verify your Google email before linking a password.");
  }
  // Never link a password to an already authenticated disposable/alias mailbox.
  // Linking requires the same verified Google UID, not just matching text emails.
  const emailError = getRegistrationEmailError(user.email);
  if (emailError) throw new Error(emailError);
  const existing = await getDoc(doc(db, "users", user.uid));
  if (existing.exists()) throw new Error("This account already has a VolunServe profile. Please sign in.");
  if (user.providerData.some(p => p.providerId === "password")) {
    throw new Error("A password is already linked. Resume registration with your existing password.");
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
      !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Use 8+ characters with uppercase, lowercase, a number and a symbol.");
  }
  if (auth.currentUser?.uid !== user.uid) throw new Error("Your registration session changed. Please sign in again.");
  let result;
  try {
    result = await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/email-already-in-use") throw error;
    // Firebase 12.19 links passwords through accounts:signUp, which can report
    // EMAIL_EXISTS for this same Google email. Set the first password through
    // the SDK's authenticated accounts:update path, then validate a real login.
    await reload(user);
    if (auth.currentUser?.uid !== user.uid || !user.emailVerified ||
        user.providerData.some(p => p.providerId === "password") ||
        (await getDoc(doc(db, "users", user.uid))).exists()) {
      throw new Error("This account changed. Sign in again to resume registration.");
    }
    await updatePassword(user, password);
    result = await signInWithEmailAndPassword(auth, user.email, password);
    if (result.user.uid !== user.uid) {
      await signOut(auth);
      throw new Error("Account mismatch after password linking. Please contact support.");
    }
  }
  if (result.user.uid !== user.uid || auth.currentUser?.uid !== user.uid) {
    throw new Error("Your registration session changed. Please sign in again.");
  }
  await reload(result.user);
  await getIdToken(result.user, true);
  return result.user;
}
