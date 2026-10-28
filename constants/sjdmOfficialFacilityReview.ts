/**
 * Official city website references, deliberately NOT operational map pins.
 * They have names and approximate addresses; no independently surveyed GPS,
 * official current opening/capacity/occupancy claim, or staff attestation.
 *
 * The LGU Admin must independently check location and coordinates before
 * changing draft status to verified + active. Never auto-create Firestore docs.
 */
export type ReviewCandidate = {
  id: string;
  kind: "lgu" | "evacuation";
  name: string;
  address: string;
  barangay: string;
  facilityType?: "city_government" | "cdrrmo";
  sourceUrl: string;
  sourceLabel: string;
  sourceContext: string;
  historic?: boolean;
};
export const SJDM_OFFICIAL_REVIEW_CANDIDATES: ReviewCandidate[] = [
  {
    id: "government-center-dulong-bayan",
    kind: "lgu",
    name: "City Government of San Jose del Monte — New Government Center",
    address: "New Government Center, Barangay Dulong Bayan, City of San Jose del Monte, Bulacan",
    barangay: "Dulong Bayan",
    facilityType: "city_government",
    sourceUrl: "https://csjdm.gov.ph/contact-us/",
    sourceLabel: "Official CSJDM contact directory",
    sourceContext: "Official government center address only. Coordinates and operational status require independent LGU review.",
  },
  {
    id: "cdrrmo-productivity-complex",
    kind: "lgu",
    name: "City Disaster Risk Reduction and Management Office",
    address: "CDRRMO Building, Productivity Complex, Motorpool, Barangay Sapang Palay Proper, City of San Jose del Monte, Bulacan",
    // City signup list contains the umbrella label 'Sapang Palay'; the office
    // directory uses the longer area name 'Sapang Palay Proper'.
    barangay: "Sapang Palay",
    facilityType: "cdrrmo",
    sourceUrl: "https://csjdm.gov.ph/city-disaster-risk-reduction-and-management-office/",
    sourceLabel: "Official CSJDM CDRRMO office page",
    sourceContext: "Office address listed by city. Confirm the precise GPS and correct current administrative barangay before publishing.",
  },
  {
    id: "historical-central-evacuation-site",
    kind: "evacuation",
    name: "Historical central evacuation center — Productivity Center",
    address: "Productivity Center, Barangay Sapang Palay Proper, City of San Jose del Monte, Bulacan",
    barangay: "Sapang Palay",
    sourceUrl: "https://csjdm.gov.ph/wp-content/uploads/2021/03/Ecological-ProfileP-2018.pdf",
    sourceLabel: "City Ecological Profile 2018 — evacuation center section",
    sourceContext: "Historical 2018 inventory only. Does NOT establish 2026 shelter opening, site capacity, occupancy or current designated use.",
    historic: true,
  },
];
