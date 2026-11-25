/**
 * Advisory-only proximity check for an assigned emergency destination.
 * It does NOT prove the Volunteer reached the Resident or delivered assistance.
 * Never use this function to auto-complete a task or override the Resident.
 */
export type ArrivalPoint = {
  latitude: number;
  longitude: number;
};

export type ArrivalGpsFix = ArrivalPoint & {
  accuracy?: number | null;
  timestamp?: number | null;
};

export type ArrivalAssessment = {
  distanceMeters: number | null;
  status: "unavailable" | "stale" | "low_accuracy" | "near" | "en_route";
  within100Meters: boolean;
};

export function emergencyDistanceMeters(a: ArrivalPoint, b: ArrivalPoint): number {
  const valid = (point: ArrivalPoint) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
  if (!valid(a) || !valid(b)) return Number.NaN;
  const toRadians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRadians;
  const dLon = (b.longitude - a.longitude) * toRadians;
  const latitude1 = a.latitude * toRadians;
  const latitude2 = b.latitude * toRadians;
  const haversine = Math.sin(dLat / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function emergencyArrivalAssessment(
  gps: ArrivalGpsFix | null | undefined,
  destination: ArrivalPoint | null | undefined,
  now = Date.now(),
): ArrivalAssessment {
  const unavailable: ArrivalAssessment = {
    distanceMeters: null, status: "unavailable", within100Meters: false,
  };
  if (!gps || !destination) return unavailable;
  const distance = emergencyDistanceMeters(gps, destination);
  if (!Number.isFinite(distance)) return unavailable;
  const timestamp = gps.timestamp;
  if (timestamp != null && (!Number.isFinite(timestamp) ||
      timestamp > now + 5000 || now - timestamp > 30000)) {
    return {distanceMeters: distance, status: "stale", within100Meters: false};
  }
  if (gps.accuracy == null || !Number.isFinite(gps.accuracy) ||
      gps.accuracy < 0 || gps.accuracy > 50) {
    return {distanceMeters: distance, status: "low_accuracy", within100Meters: false};
  }
  const within100Meters = distance <= 100;
  return {
    distanceMeters: distance,
    status: within100Meters ? "near" : "en_route",
    within100Meters,
  };
}
