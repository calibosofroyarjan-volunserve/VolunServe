import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";

/**
 * Shared web Google flow for Login and Signup.
 * Preserve the Firebase error object (especially credentialFromError) so
 * Login can safely link an existing password account to the SAME Auth UID.
 * Callers convert errors into user-facing messages; credentials and tokens
 * never appear in visible error text or storage.
 */
export function useSignupGoogle() {
  return async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return (await signInWithPopup(auth, provider)).user;
  };
}
