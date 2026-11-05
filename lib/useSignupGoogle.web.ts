import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";
import { googleSignInErrorMessage } from "./googleSignInFeedback";

/**
 * Shared web Google flow for Login and Signup.
 * Keep OAuth errors internal; show actionable, safe text to the user.
 */
export function useSignupGoogle() {
  return async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return (await signInWithPopup(auth, provider)).user;
    } catch (error) {
      throw new Error(googleSignInErrorMessage(error));
    }
  };
}
