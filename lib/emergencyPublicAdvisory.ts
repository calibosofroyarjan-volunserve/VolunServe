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

export const safePublicAdvisoryBarangay = (value: unknown): string | null => {
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

export const canPreparePublicEmergencyAdvisory = (
  source: SourceCase | null | undefined
): boolean => Boolean(source && source.verificationStatus === "validated" &&
  ["validated", "assigned", "in_progress"].includes(String(source.status || "")));

export const buildPublicEmergencyAdvisory = (
  source: SourceCase | null | undefined,
  adminConfirmedBarangay?: unknown,
): PublicEmergencyAdvisoryDraft | null => {
  if (!canPreparePublicEmergencyAdvisory(source)) return null;

  // Never fall back to reporterBarangay. If the case has no trustworthy
  // incidentBarangay, the Admin explicitly chooses one from the SJDM list.
  const barangay = safePublicAdvisoryBarangay(
    adminConfirmedBarangay === undefined ? source?.incidentBarangay : adminConfirmedBarangay
  );
  if (!barangay) return null;

  return {
    barangay,
    title: `Community Safety Advisory — Brgy. ${barangay}`,
    message: `Admin has validated a community safety report in Barangay ${barangay}, City of San Jose del Monte, Bulacan. Please remain alert, avoid unsafe areas, and follow instructions from official emergency services. For immediate danger, call 911. Further updates will be shared when verified.`,
    priority: ["high", "critical"].includes(String(source?.severity || ""))
      ? "urgent" : "normal",
  };
};
