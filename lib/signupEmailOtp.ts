import {getIdToken, reload} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {auth, functions} from "./firebase";

/** Disabled in production. Requires BOTH callable functions and mail delivery.
 * Do not set EXPO_PUBLIC_VOLUNSERVE_EMAIL_OTP=true on the public site until
 * the server functions, sender domain and live inbox tests are verified.
 */
export const SIGNUP_EMAIL_OTP_ENABLED =
  process.env.EXPO_PUBLIC_VOLUNSERVE_EMAIL_OTP === "true";

type RequestCodeResult = {
  expiresInSeconds: number;
  resendAfterSeconds: number;
};
type ConfirmCodeResult = { verified: true };

export function sanitizeSignupOtpInput(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function requirePendingSession() {
  if (!SIGNUP_EMAIL_OTP_ENABLED) {
    throw new Error("Six-digit email verification is not enabled for this environment.");
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in with your pending registration first.");
  if (user.emailVerified) throw new Error("This email is already verified.");
  return user;
}

export async function requestSignupVerificationCode(): Promise<RequestCodeResult> {
  const user = requirePendingSession();
  await getIdToken(user, true);
  const invoke = httpsCallable<void, RequestCodeResult>(functions,"requestResidentEmailOtp");
  const result = await invoke();
  return result.data;
}

export async function verifySignupEmailCode(value: string): Promise<boolean> {
  const code = sanitizeSignupOtpInput(value);
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the complete six-digit code.");
  const user = requirePendingSession();
  await getIdToken(user, true);
  const invoke = httpsCallable<{code: string},ConfirmCodeResult>(functions,"confirmResidentEmailOtp");
  const result = await invoke({code});
  if (!result.data.verified) throw new Error("Code not verified.");
  await reload(user);
  await getIdToken(user,true);
  if (!user.emailVerified) throw new Error("Verification was not reflected in Firebase Auth. Retry.");
  return true;
}
