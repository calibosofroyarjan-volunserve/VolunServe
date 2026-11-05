import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";

export function useSignupGoogle() {
  return async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({prompt: "select_account"});
    return (await signInWithPopup(auth, provider)).user;
  };
}
