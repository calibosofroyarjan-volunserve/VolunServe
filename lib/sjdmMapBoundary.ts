/**
 * Reference SJDM map boundary from GeoRisk/PSA Municipal Boundary (2015).
 * This is an administrative reference layer, NOT a certified survey of disputed
 * property boundaries. Do not guess a city polygon from a bounding rectangle.
 *
 * A failed/blocked provider query returns null: the UI must say the border is
 * unavailable instead of showing a fabricated legal boundary.
 */
export type LngLat = [number, number];
export type BoundaryBounds = { north: number; south: number; east: number; west: number };
export type BoundaryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: LngLat[][] | LngLat[][][];
};
export type SjdmBoundary = {
  type: "Feature";
  properties: { source: string; city: string; province: string };
  geometry: BoundaryGeometry;
};

const ENDPOINT = "https://ulap-nga.georisk.gov.ph/arcgis/rest/services/PSA/Municipal_2015/MapServer/0/query";
export const SJDM_BOUNDARY_SOURCE = "GeoRisk / PSA Municipal Boundary 2015 (reference)";
export const SJDM_FOCUS = { latitude: 14.813, longitude: 121.045 };

export function boundaryRings(feature: SjdmBoundary): LngLat[][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as LngLat[][]]
    : feature.geometry.coordinates as LngLat[][][];
}

function allCoordinates(feature: SjdmBoundary): LngLat[] {
  return boundaryRings(feature).flatMap(polygon => polygon.flatMap(ring => ring));
}

export function boundaryBounds(feature: SjdmBoundary): BoundaryBounds {
  const points = allCoordinates(feature);
  return {
    north: Math.max(...points.map(p => p[1])),
    south: Math.min(...points.map(p => p[1])),
    east: Math.max(...points.map(p => p[0])),
    west: Math.min(...points.map(p => p[0])),
  };
}

function insideRing(point: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const crosses = (yi > point[1]) !== (yj > point[1]) &&
      point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Handles outer rings, polygon holes and MultiPolygons. */
export function insideSjdmBoundary(
  feature: SjdmBoundary,
  latitude: number,
  longitude: number,
): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return boundaryRings(feature).some(rings =>
    rings.length > 0 &&
    insideRing([longitude, latitude], rings[0]) &&
    !rings.slice(1).some(hole => insideRing([longitude, latitude], hole))
  );
}

/** Fetch only the city administrative reference; never mark official evacuation status. */
export async function loadSjdmBoundary(): Promise<SjdmBoundary | null> {
  const params = new URLSearchParams({
    where: "city_name LIKE '%San Jose del Monte%' AND prov_name = 'Bulacan'",
    outFields: "city_name,prov_name",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const abort = new AbortController();
  try {
    timeout = setTimeout(() => abort.abort(), 12000);
    const response = await fetch(ENDPOINT + "?" + params.toString(), {
      signal: abort.signal,
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) return null;
    const match = payload.features.find((entry: any) => {
      const name = String(entry?.properties?.city_name || "");
      const province = String(entry?.properties?.prov_name || "");
      return /san jose del monte/i.test(name) && /bulacan/i.test(province);
    });
    if (!match || !["Polygon", "MultiPolygon"].includes(match.geometry?.type)) return null;
    const feature: SjdmBoundary = {
      type: "Feature",
      geometry: { type: match.geometry.type, coordinates: match.geometry.coordinates },
      properties: { source: SJDM_BOUNDARY_SOURCE, city: "San Jose del Monte", province: "Bulacan" },
    };
    const points = allCoordinates(feature);
    if (points.length < 4 || points.length > 100000 ||
      !points.every(p => Array.isArray(p) && p.length >= 2 &&
        Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
        p[0] > 120.8 && p[0] < 121.3 && p[1] > 14.6 && p[1] < 15.05)) {
      return null;
    }
    const bounds = boundaryBounds(feature);
    if (bounds.east - bounds.west < 0.015 || bounds.north - bounds.south < 0.015) return null;
    return feature;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
