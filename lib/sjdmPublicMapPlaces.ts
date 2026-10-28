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
  | "evacuation_site" | "barangay_hall";
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
};

/** Location pin needs both a mapped physical feature and a corroborating source. */
export const SJDM_PUBLIC_MAP_PLACE_PINS: SjdmPublicMapPlace[] = [
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
  police_station: "🚓", evacuation_site: "🏠", barangay_hall: "🏢",
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
