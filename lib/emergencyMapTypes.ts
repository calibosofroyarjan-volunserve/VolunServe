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


/**
 * Firebase real-time listeners deliver *database* changes, but do not mean
 * a physical shelter is open or has available beds at this moment.
 * Route recommendations require a *recent* LGU-confirmed shelter check.
 * A stale center may still be displayed with an explicit caution.
 */
export const SHELTER_STATUS_RECHECK_MS = 24 * 60 * 60 * 1000;
export type ShelterReportTimestamp =
  | number
  | { toMillis?: () => number }
  | null
  | undefined;

export function shelterReportMillis(value: ShelterReportTimestamp): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  try {
    const millis = value?.toMillis?.();
    return typeof millis === "number" && Number.isFinite(millis) ? millis : 0;
  } catch {
    return 0;
  }
}

/** A recently verified report is NOT a live sensor reading. */
export function isRecentShelterReport(
  center: { status?: string; verificationStatus?: string;
    lastVerifiedAt?: ShelterReportTimestamp },
  nowMs = Date.now(),
): boolean {
  const last = shelterReportMillis(center.lastVerifiedAt);
  const age = nowMs - last;
  return center.status === "active" &&
    center.verificationStatus === "verified" &&
    last > 0 && age >= -5 * 60 * 1000 && age <= SHELTER_STATUS_RECHECK_MS;
}
