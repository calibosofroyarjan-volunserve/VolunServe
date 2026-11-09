import {SJDM_BARANGAYS} from "../constants/sjdmBarangays";
import {OCCUPATION_OPTIONS, SPECIALIZATIONS} from "../constants/occupationOptions";

/**
 * Single registration-data policy used by UI field feedback and the final
 * profile creation boundary. Do not treat a Firebase Auth UID as a Resident
 * until every required field passes this policy AND the email is verified.
 */
export type RequiredResidentDetails = {
  firstName: string;
  lastName: string;
  middleName?: string;
  age: number;
  phoneNumber: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  occupationCategory: string;
  occupationSpecialization?: string;
  occupationOther?: string;
};

export type ResidentRegistrationField = keyof RequiredResidentDetails;
export type ResidentRegistrationFieldErrors = Partial<Record<ResidentRegistrationField, string>>;

const nameError = (value: unknown, label: string, optional = false): string | null => {
  const name = String(value || "").trim();
  if (!name && optional) return null;
  if (!name) return `${label} is required.`;
  if (name.length > 80) return `${label} must be 80 characters or fewer.`;
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(name) ||
      (name.match(/\p{L}/gu) || []).length < (optional ? 1 : 2)) {
    return `Enter a valid ${label.toLowerCase()} using letters, spaces, hyphens or apostrophes.`;
  }
  return null;
};

export function getResidentRegistrationFieldErrors(data: RequiredResidentDetails): ResidentRegistrationFieldErrors {
  const errors: ResidentRegistrationFieldErrors = {};
  const first = nameError(data.firstName, "First name");
  const last = nameError(data.lastName, "Last name");
  const middle = nameError(data.middleName, "Middle name", true);
  if (first) errors.firstName = first;
  if (last) errors.lastName = last;
  if (middle) errors.middleName = middle;

  if (!Number.isInteger(data.age) || data.age < 18 || data.age > 100) {
    errors.age = "Enter a valid birth date. Resident signup requires ages 18–100.";
  }
  const mobile = String(data.phoneNumber || "").replace(/[\s-]/g, "");
  // Contact number is optional; if supplied, it must still be a valid PH mobile.
  if (mobile && !/^(?:\+639\d{9}|09\d{9})$/.test(mobile)) {
    errors.phoneNumber = "If you provide a mobile number, use 09 or +639 format.";
  }

  if (typeof data.region !== "string" || !data.region.trim() || data.region.length > 100) {
    errors.region = "Select a valid Region III address.";
  }
  if (String(data.province || "").trim().toLowerCase() !== "bulacan" ||
      !["city of san jose del monte", "city of san jose del monte, bulacan"]
        .includes(String(data.city || "").trim().toLowerCase())) {
    errors.city = "VolunServe resident registration is for San Jose del Monte, Bulacan.";
  }
  if (!SJDM_BARANGAYS.includes(String(data.barangay || "").trim())) {
    errors.barangay = "Choose one of the official San Jose del Monte barangays.";
  }
  const category = String(data.occupationCategory || "").trim();
  if (!OCCUPATION_OPTIONS.includes(category)) {
    errors.occupationCategory = "Choose a valid occupation from the list.";
  } else {
    const specializations = SPECIALIZATIONS[category] || [];
    const specialization = String(data.occupationSpecialization || "").trim();
    if ((specializations.length > 0 && !specializations.includes(specialization)) ||
        (specializations.length === 0 && !!specialization)) {
      errors.occupationSpecialization = specializations.length > 0
        ? "Choose the specialization for your occupation."
        : "This occupation does not require a specialization.";
    }
    if (category !== "Other (Specify)" && String(data.occupationOther || "").trim()) {
      errors.occupationOther = "Remove the custom occupation when selecting a listed occupation.";
    }
    if (category === "Other (Specify)") {
      const other = String(data.occupationOther || "").trim();
      if (other.length < 2 || other.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N}\s.,()&/'-]*$/u.test(other)) {
        errors.occupationOther = "Specify your occupation (2–80 characters).";
      }
    }
  }
  return errors;
}

export function requireCompleteResidentRegistration(data: RequiredResidentDetails): void {
  const errors = getResidentRegistrationFieldErrors(data);
  const firstError = Object.entries(errors)[0];
  if (!firstError) return;
  const [field, message] = firstError;
  const isPersonal = ["firstName","lastName","middleName","age","phoneNumber"].includes(field);
  throw new Error(`Complete ${isPersonal ? "Step 3 — Personal Details" : "Step 4 — Address & Profile"}: ${message}`);
}
