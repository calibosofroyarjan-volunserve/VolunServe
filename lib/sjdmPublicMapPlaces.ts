/**
 * Curated SJDM public buildings — verified map positions and independently
 * corroborated city/locality identity. NEVER equate these fixed locations with
 * live staff, LGU dispatch, or currently operating evacuation centers.
 *
 * OSM POIs without corroborated coordinates were removed. No unvetted Overpass
 * POIs are imported automatically as operational public-safety destinations.
 */
export type SjdmPublicMapPlaceKind =
  | "government" | "cdrrmo" | "fire_station" | "police_station"
  | "evacuation_site" | "barangay_hall" | "hospital";
export type SjdmPublicMapPlace = {
  id: string;
  name: string;
  kind: SjdmPublicMapPlaceKind;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  sourceLabel: string;
  note: string;
  positionQuality: "osm_feature" | "third_party_approximate";
  officialInfoUrl?: string;
  officialContact?: string;
  /** Named map POI, not a claim of survey-exact GPS. */
  googlePlaceId?: string;
  /** Publisher's photograph page; images are NOT rehosted without permission. */
  actualPhotoSourceUrl?: string;
  photoCredit?: string;
  address?: string; // published official hospital address
  photoUrl?: string; // remote publisher image, no local rehosting
};

/** Location pin needs both a mapped physical feature and a corroborating source. */
export const SJDM_PUBLIC_MAP_PLACE_PINS: SjdmPublicMapPlace[] = [
  {
    id: "sjdm-cdrrmo-office-approximate",
    name: "City of San Jose del Monte CDRRMO (approximate location)",
    kind: "cdrrmo",
    latitude: 14.82746, longitude: 121.08109,
    sourceUrl: "https://csjdm.gov.ph/city-disaster-risk-reduction-and-management-office/",
    sourceLabel: "Official city office address. Map pin is only approximate and NOT verified by the LGU.",
    note: "CDRRMO office reference in Sapang Palay Proper. Pin location is approximate; NOT a live responder, emergency dispatch point, or currently verified exact office GPS. Confirm location with CDRRMO before travel.",
    positionQuality: "third_party_approximate",
  },
  {
    id: "osm-hospital-qualimed-way-487627382",
    name: "Healthway QualiMed Hospital — San Jose del Monte",
    kind: "hospital",
    latitude: 14.78823, longitude: 121.07693,
    sourceUrl: "https://mapcarta.com/W487627382",
    sourceLabel: "OSM mapped hospital footprint; address corroborated by hospital",
    officialInfoUrl: "https://healthwaymedicalnetwork.com.ph/our-network/healthway-qualimed-hospital-san-jose-del-monte/",
    officialContact: "(044) 307-0000",
    googlePlaceId: "ChIJT85ihomvlzMRdf8B1LeV8Pg",
    actualPhotoSourceUrl: "https://tanglawan.ph/qualimed-hospital/",
    photoCredit: "HelloDoctor / Hello Health Group",
    address: "Altaraza Spine Road, Barangay Tungkong Mangga, City of San Jose del Monte, Bulacan, Philippines",
    photoUrl: "https://cdn-healthcare.hellohealthgroup.com/2026/04/1776655271_69e59ba733f460.84571040.jpg?q=75&w=3840",
    note: "Altaraza Spine Road, Tungkong Mangga. OSM hospital building footprint, not a surveyed emergency entrance. Real exterior photo linked from its publisher; no live capacity claim.",
    positionQuality: "osm_feature",
  },
  {
    id: "osm-hospital-skyline-way-488704414",
    name: "Skyline Hospital and Medical Center",
    kind: "hospital",
    latitude: 14.79826, longitude: 121.07055,
    sourceUrl: "https://mapcarta.com/W488704414",
    sourceLabel: "OSM mapped hospital footprint; address corroborated by hospital",
    officialInfoUrl: "https://www.skylinehospital.ph/",
    officialContact: "0977 830 3348",
    googlePlaceId: "ChIJi6af9ISvlzMRsHr-MhmAHAA",
    actualPhotoSourceUrl: "https://tanglawan.ph/skyline-medical-center/",
    photoCredit: "CSJDM Tourism Office / Tanglawan",
    address: "Skyline Drive corner Quirino Highway, Barangay Tungkong Mangga, City of San Jose del Monte, Bulacan 3023",
    photoUrl: "https://tanglawan.ph/wp-content/uploads/2024/01/A-5-scaled.jpg",
    note: "Skyline Drive corner Quirino Highway. OSM hospital footprint, not a surveyed ER door. Real exterior photo linked from its publisher; no live capacity claim.",
    positionQuality: "osm_feature",
  },
  {
    id: "hospital-grace-reference",
    name: "Grace Medical Center (formerly Grace General Hospital)",
    kind: "hospital",
    latitude: 14.80573, longitude: 121.06816,
    sourceUrl: "https://philippines.worldplaces.me/review/88319860-grace-general-hospital.html",
    sourceLabel: "Third-party coordinate approximation; address corroborated by hospital",
    officialInfoUrl: "https://gracemedicalcenter.com.ph/contact-us/",
    officialContact: "0917 592 7789",
    googlePlaceId: "ChIJY1XOHnivlzMR8QhIpTRYVdU",
    actualPhotoSourceUrl: "https://tanglawan.ph/grace-general-hospital/",
    photoCredit: "CSJDM Tourism Office / Tanglawan",
    address: "Lot 02 Block 01, Quirino Highway, Barangay Mulawin, Francisco Homes, City of San Jose del Monte, Bulacan, Philippines",
    photoUrl: "https://tanglawan.ph/wp-content/uploads/2024/01/A-31-scaled.jpg",
    note: "Lot 2 Block 1 Quirino Highway Extension, Mulawin. In-map point is approximate; use named Google Maps place for real navigation. Real exterior photo linked from its publisher; no live capacity claim.",
    positionQuality: "third_party_approximate",
  },
  {
    id: "osm-way-1126178501",
    name: "San Jose del Monte New Government Center",
    kind: "government",
    latitude: 14.82785, longitude: 121.04486,
    sourceUrl: "https://mapcarta.com/W1126178501",
    sourceLabel: "Mapped government-center footprint; CSJDM confirms Dulong Bayan address",
    note: "New Government Center, Barangay Dulong Bayan. Building location only, not live LGU staff or vehicles.",
    positionQuality: "osm_feature",
  },
  {
    id: "osm-way-1427519892",
    name: "Dulong Bayan Barangay Hall",
    kind: "barangay_hall",
    latitude: 14.82682, longitude: 121.04482,
    sourceUrl: "https://mapcarta.com/29271770",
    sourceLabel: "Mapped barangay-hall building in San Jose del Monte",
    note: "Barangay Hall, Dulong Bayan. Building location, not an emergency-response dispatch or confirmed opening hours.",
    positionQuality: "osm_feature",
  },
];

/** These icons identify a site TYPE, not an active responder or a live shelter. */
export const SJDM_PUBLIC_PLACE_ICON: Record<SjdmPublicMapPlaceKind, string> = {
  government: "🏛️", cdrrmo: "🛟", fire_station: "🚒",
  police_station: "🚓", evacuation_site: "🏠", barangay_hall: "🏢", hospital: "🏥",
};

/** Navigates to an exact verified coordinate in external Google Maps.
 * Routing is delegated to Google Maps; we do not invent a travel time.
 */
export function googleMapsFacilityDirections(latitude:number,longitude:number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    throw new Error("Invalid facility coordinates for directions.");
  return "https://www.google.com/maps/dir/?api=1&destination=" +
    latitude.toFixed(6) + "%2C" + longitude.toFixed(6) + "&travelmode=driving&dir_action=navigate";
}
