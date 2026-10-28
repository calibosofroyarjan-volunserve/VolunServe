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
  facilityType?: "city_government" | "cdrrmo" | "fire_station";
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
    id: "bfp-fire-station-sapang-palay-current-office",
    kind: "lgu",
    name: "City of San Jose del Monte Fire Station — BFP Office",
    address: "2nd Floor, Former CDRRM Office, Productivity Center, Barangay Sapang Palay Proper, City of San Jose del Monte, Bulacan",
    barangay: "Sapang Palay",
    facilityType: "fire_station",
    sourceUrl: "https://csjdmfsinfohub.my.canva.site/",
    sourceLabel: "City Fire Station BFP Region III official information hub",
    sourceContext: "BFP publishes this as its NEW office address. Confirm the building's exact GPS with BFP before an operational LGU marker is approved; an older OSM fire-station pin may not refer to this new office.",
  },
  {
    id: "minuyan-proper-pagcor-multipurpose-shelter",
    kind: "evacuation",
    name: "PAGCOR-funded Multi-Purpose Evacuation Facility (2022)",
    address: "Barangay Minuyan Proper, City of San Jose del Monte, Bulacan",
    barangay: "Minuyan Proper",
    sourceUrl: "https://www.pagcor.ph/press-releases/first-pagcor-funded-evacuation-facility-in-bulacan-inaugurated.php",
    sourceLabel: "PAGCOR official press release — inaugurated June 20, 2022",
    sourceContext: "Historical government-confirmed facility inauguration; NOT evidence of a currently open shelter, available capacity, or an independently surveyed GPS position.",
    historic: true,
  },
  {
    id: "city-2022-assumption-srscp-auditorium",
    kind: "evacuation",
    name: "Assumption SRSCP Auditorium",
    address: "E.V.R. Avenue, Barangay Assumption, City of San Jose del Monte, Bulacan",
    barangay: "Assumption",
    sourceUrl: "https://csjdm.gov.ph/wp-content/uploads/2024/03/CSJDM-SEP-2022.pdf",
    sourceLabel: "Official City Socio-Economic Profile 2022 — evacuation center list",
    sourceContext: "City's published 2022 evacuation-center inventory; current assignment, availability, operating status, exact building GPS and capacity require new LGU verification.",
    historic: true,
  },
  {
    id: "city-2022-bagong-buhay-elementary-school",
    kind: "evacuation",
    name: "Bagong Buhay Elementary School (listed evacuation site)",
    address: "Masipag corner Masikap Street, Barangay Bagong Buhay I, City of San Jose del Monte, Bulacan",
    barangay: "Bagong Buhay I",
    sourceUrl: "https://csjdm.gov.ph/wp-content/uploads/2024/03/CSJDM-SEP-2022.pdf",
    sourceLabel: "Official City Socio-Economic Profile 2022 — evacuation center list",
    sourceContext: "School included in City's historical 2022 evacuation-center inventory; NOT evidence of an open evacuation site in 2026.",
    historic: true,
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
