/** Build-time opt-in. Missing, false, and all other values retain production signup. */
export const EMAIL_FIRST_SIGNUP_ENABLED =
  process.env.EXPO_PUBLIC_EMAIL_FIRST_SIGNUP === "true";

/** Only missing community profiles can resume; existing profiles retain production routing. */
export function canResumeEmailFirstSignup(user: {providerData: {providerId: string}[]}): boolean {
  return EMAIL_FIRST_SIGNUP_ENABLED && user.providerData.some(
    provider => provider.providerId === "password" || provider.providerId === "google.com"
  );
}
