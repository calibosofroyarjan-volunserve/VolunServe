import {SJDM_BARANGAYS} from "../constants/sjdmBarangays";
import {OCCUPATION_OPTIONS, SPECIALIZATIONS} from "../constants/occupationOptions";

/**
 * Enforce completion at the profile creation boundary, not only inside the
 * visible Signup wizard. Firebase Auth-only UIDs are NOT Resident profiles.
 * Keep identity-document checks separate from Basic Resident registration.
 */
type RequiredResidentDetails = {
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

export function requireCompleteResidentRegistration(data: RequiredResidentDetails): void {
  const validName = (value: string, optional = false) => {
    const clean = String(value || "").trim();
    if (!clean && optional) return true;
    return /^[\p{L}][\p{L}\s.'-]*$/u.test(clean) &&
      (clean.match(/\p{L}/gu) || []).length >= (optional ? 1 : 2);
  };
  if (!validName(data.firstName) || !validName(data.lastName) ||
      !validName(data.middleName || "", true) ||
      !Number.isInteger(data.age) || data.age < 18 || data.age > 100 ||
      !/^(?:\+639\d{9}|09\d{9})$/.test(String(data.phoneNumber || "").replace(/[\s-]/g, ""))) {
    throw new Error("Complete Personal Details (Step 3) with your full name, valid age, and Philippine mobile number.");
  }

  const city = String(data.city || "").trim().toLowerCase();
  if (!String(data.region || "").trim() ||
      String(data.province || "").trim().toLowerCase() !== "bulacan" ||
      !["city of san jose del monte", "city of san jose del monte, bulacan"].includes(city) ||
      !SJDM_BARANGAYS.includes(String(data.barangay || "").trim()) ||
      !OCCUPATION_OPTIONS.includes(String(data.occupationCategory || "").trim())) {
    throw new Error("Complete Address & Profile (Step 4): select your SJDM barangay and occupation.");
  }
  const specializationOptions = SPECIALIZATIONS[data.occupationCategory] || [];
  if (specializationOptions.length > 0 &&
      !specializationOptions.includes(String(data.occupationSpecialization || "").trim())) {
    throw new Error("Select the required occupation specialization in Step 4.");
  }
  if (data.occupationCategory === "Other (Specify)" &&
      String(data.occupationOther || "").trim().length < 2) {
    throw new Error("Specify your occupation in Step 4.");
  }
}
