import { isKnownDisposableEmail } from "./registrationEmailPolicy";
/** Central policy for LGU staff evidence intake. No applicant self-verification. */
export const LGU_ID_TYPES = [
  { value: "ph_national_id", label: "Philippine National ID", reverse: true },
  { value: "ph_drivers_license", label: "Philippine Driver's License", reverse: true },
  { value: "ph_passport", label: "Philippine Passport", reverse: false },
] as const;
export type LguIdType = typeof LGU_ID_TYPES[number]["value"];
export type EvidenceSlot = "front" | "back" | "selfie" | "lgu_proof";
export const LGU_STAFF_STEPS = [
  "Staff details",
  "Government ID",
  "Live selfie",
  "LGU documents",
  "Review & submit",
] as const;
export const LGU_APPLICATION_NOTICE =
  "Identity scanning is pending human verification. A selected ID type, photo upload or selfie is NOT proof of authenticity, OCR clearance, face match or liveness. The programmer Super Admin must confirm identity, LGU appointment and authority through independent official sources.";
export function lguIdRequiresBack(value: LguIdType) {
  return LGU_ID_TYPES.find(item => item.value === value)?.reverse === true;
}
export function isSupportedLguIdType(value: unknown): value is LguIdType {
  return LGU_ID_TYPES.some(item => item.value === value);
}
export function validLguApplication(form: {
  fullName: string; email: string; password: string; lguOffice: string;
  lguPosition: string; appointmentReference: string; barangay: string;
}, barangays: readonly string[]) {
  return form.fullName.trim().length >= 5 &&
    form.fullName.trim().length <= 160 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    !isKnownDisposableEmail(form.email) &&
    form.lguOffice.trim().length >= 3 && form.lguOffice.trim().length <= 160 &&
    form.lguPosition.trim().length >= 3 && form.lguPosition.trim().length <= 120 &&
    form.appointmentReference.trim().length >= 5 &&
    form.appointmentReference.trim().length <= 160 &&
    barangays.includes(form.barangay) &&
    form.password.length >= 12 && /[A-Z]/.test(form.password) &&
    /[a-z]/.test(form.password) && /[0-9]/.test(form.password) &&
    /[^A-Za-z0-9]/.test(form.password);
}
