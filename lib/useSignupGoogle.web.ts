import { connectGoogleAccountWeb } from "./firebaseAuth";

/** Use the same verified Firebase popup and safe error mapping as web Login. */
export function useSignupGoogle() {
  return connectGoogleAccountWeb;
}
