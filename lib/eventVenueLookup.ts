/**
 * Best-effort public OSM geocoding for a venue named by a Resident.
 * A geocoder result is only a suggestion; LGU approval and explicit pin
 * confirmation are still required. Never guess coordinates from barangay alone.
 */
export type EventVenuePoint = { latitude: number; longitude: number };
export type EventVenueResult =
  | { status: "found"; point: EventVenuePoint; label: string }
  | { status: "ambiguous" | "not-found" | "unavailable"; point?: never; label?: never };

const insideSJDM = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= 14.65 && lat <= 15.0 && lng >= 120.88 && lng <= 121.30;

const genericVenue = /^(barangay hall|covered court|multi-purpose hall|community center|public plaza|school grounds)$/i;

export async function lookUpEventVenue(
  barangay: string, venue: string, signal?: AbortSignal,
): Promise<EventVenueResult> {
  const area = barangay.trim().slice(0, 90);
  const place = venue.trim().slice(0, 150);
  if (!area || !place) return { status: "not-found" };
  // Avoid accepting barangay centroids as the actual sports court or hall.
  const query = [place, area, "San Jose del Monte", "Bulacan", "Philippines"].join(", ");
  const url = "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({ q: query, format: "jsonv2", limit: "5", addressdetails: "1",
      viewbox: "120.88,15.00,121.30,14.65", bounded: "1" }).toString();
  try {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) return { status: "unavailable" };
    const json: unknown = await response.json();
    if (!Array.isArray(json)) return { status: "unavailable" };
    const candidates = json.filter((entry: any) => {
      const lat = Number(entry?.lat), lng = Number(entry?.lon);
      const display = String(entry?.display_name || "").toLowerCase();
      const actualName = String(entry?.name || "").toLowerCase();
      const venueName = place.toLowerCase();
      const barangayName = area.toLowerCase();
      return insideSJDM(lat, lng) &&
        display.includes("bulacan") &&
        (display.includes("san jose del monte") || display.includes(barangayName)) &&
        (actualName.includes(venueName) || display.split(",")[0]?.trim().includes(venueName)) &&
        (!genericVenue.test(place) || display.includes(barangayName));
    });
    if (candidates.length !== 1) return { status: candidates.length ? "ambiguous" : "not-found" };
    const selected = candidates[0];
    return {
      status: "found",
      point: { latitude: Number(Number(selected.lat).toFixed(6)),
        longitude: Number(Number(selected.lon).toFixed(6)) },
      label: String(selected.display_name).slice(0, 200),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "unavailable" };
  }
}
