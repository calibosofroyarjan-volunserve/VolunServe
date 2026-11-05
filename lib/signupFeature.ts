import { Platform } from "react-native";

/**
 * Premium email-first Signup is the published web experience.
 * Never depend on a Hosting workflow remembering a build-time opt-in:
 * independent Admin/Super Admin releases must not silently restore the old UI.
 *
 * Existing installed Android/iOS clients are NOT upgraded by Hosting;
 * future native builds remain opt-in until separately approved.
 */
export const EMAIL_FIRST_SIGNUP_ENABLED =
  Platform.OS === "web" || process.env.EXPO_PUBLIC_EMAIL_FIRST_SIGNUP === "true";

/** Only missing community profiles can resume; existing profiles retain production routing. */
export function canResumeEmailFirstSignup(user: {providerData: {providerId: string}[]}): boolean {
  return EMAIL_FIRST_SIGNUP_ENABLED && user.providerData.some(
    provider => provider.providerId === "password" || provider.providerId === "google.com"
  );
}
