export const REGISTRATION_EMAIL_CONFLICT_MESSAGE =
  "This email address is already registered with VolunServe. Please sign in or use Forgot Password to regain access.";

/**
 * Email syntax and mailbox ownership are different checks.
 * Never claim a Gmail/Yahoo/Outlook inbox exists (or does not exist)
 * based solely on the address; delivery and ownership are established
 * by clicking the verification link and refreshing Firebase Auth.
 */
export const EMAIL_VERIFICATION_REQUESTED_MESSAGE =
  "Verification email requested. Check your Inbox and Spam folder. If no email arrives, confirm the address or choose a different email.";

export const EMAIL_VERIFICATION_INSTRUCTIONS =
  "You must open the verification link in your actual mailbox before continuing. A valid-looking email address alone does not confirm that the inbox exists or belongs to you.";

export const EMAIL_VERIFICATION_PENDING_MESSAGE =
  "Your email is not verified yet. Open the verification link, then choose Check Verification. If you cannot access this inbox, use a different email.";


