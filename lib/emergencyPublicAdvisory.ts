import { SJDM_BARANGAYS } from "../constants/sjdmBarangays";

// This deliberately never copies private incident text, reporter details,
// photos, GPS, house numbers, contact information or incident identifiers.
// Public posts use only a city-verified barangay from an Admin-validated case.
type SourceCase = {
  verificationStatus?: unknown;
  status?: unknown;
  incidentBarangay?: unknown;
  severity?: unknown;
};

export type PublicEmergencyAdvisoryDraft = {
  title: string;
  message: string;
  priority: "urgent" | "normal";
  barangay: string;
};

const safeBarangay = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim()
    .replace(/^(?:barangay|brgy\.?)\s+/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return SJDM_BARANGAYS.find(name =>
    name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "") === normalized
  ) || null;
};

export const buildPublicEmergencyAdvisory = (
  source: SourceCase | null | undefined
): PublicEmergencyAdvisoryDraft | null => {
  if (!source || source.verificationStatus !== "validated" ||
      !["validated", "assigned", "in_progress"].includes(String(source.status || ""))) {
    return null;
  }
  // Incident barangay ONLY. A reporter's home barangay can be different.
  const barangay = safeBarangay(source.incidentBarangay);
  if (!barangay) return null;

  return {
    barangay,
    title: `Community Safety Advisory — Brgy. ${barangay}`,
    message: `Admin has validated a community safety report in Barangay ${barangay}, City of San Jose del Monte, Bulacan. Please remain alert, avoid unsafe areas, and follow instructions from official emergency services. For immediate danger, call 911. Further updates will be shared when verified.`,
    priority: ["high", "critical"].includes(String(source.severity || ""))
      ? "urgent" : "normal",
  };
};
