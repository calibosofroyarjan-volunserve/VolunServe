/** Shared typed metadata for real emergency vehicle assignments and evacuation locations. */
export const DISPATCH_VEHICLES = [
  { id: "ambulance", label: "Ambulance", symbol: "🚑", color: "#B3443A" },
  { id: "fire_truck", label: "Fire truck", symbol: "🚒", color: "#C56833" },
  { id: "rescue_vehicle", label: "Rescue vehicle", symbol: "🚙", color: "#236F99" },
  { id: "service_vehicle", label: "Service / repair vehicle", symbol: "🛻", color: "#4D6F84" },
  { id: "other_vehicle", label: "Other LGU vehicle", symbol: "🚐", color: "#586A78" },
  { id: "on_foot", label: "Responder on foot / not assigned", symbol: "●", color: "#23765F" },
] as const;

export type DispatchVehicleType = (typeof DISPATCH_VEHICLES)[number]["id"];

export function vehicleInfo(value: unknown) {
  return DISPATCH_VEHICLES.find((item) => item.id === value) ??
    DISPATCH_VEHICLES[DISPATCH_VEHICLES.length - 1];
}
export const validCoordinates = (latitude: unknown, longitude: unknown) =>
  typeof latitude === "number" && Number.isFinite(latitude) &&
  typeof longitude === "number" && Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

export function mapsPlaceUrl(latitude: unknown, longitude: unknown): string | null {
  if (!validCoordinates(latitude, longitude)) return null;
  return "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(String(latitude) + "," + String(longitude));
}

export function mapsDirectionsUrl(latitude: unknown, longitude: unknown): string | null {
  if (!validCoordinates(latitude, longitude)) return null;
  return "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(String(latitude) + "," + String(longitude)) +
    "&travelmode=driving";
}

/** Only current, approved facility records can be displayed as official open centers. */
export function isVerifiedActiveCenter(center: {
  verificationStatus?: string;
  status?: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  return center.verificationStatus === "verified" &&
    center.status === "active" &&
    validCoordinates(center.latitude, center.longitude);
}
