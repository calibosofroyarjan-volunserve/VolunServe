/**
 * SJDM map boundary from a real, attributed geoBoundaries ADM3 polygon.
 * Simplified geometry is bundled so web/Android never depend on live GIS CORS.
 * NOT a legal cadastral survey; do not invent city shapes from rectangles.
 */
import { SJDM_REFERENCE_GEOMETRY } from "../constants/sjdmBoundaryReference";
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

export const SJDM_BOUNDARY_SOURCE = "geoBoundaries / William & Mary geoLab (simplified ADM3, CC BY 4.0)";
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

/**
 * Stable local administrative reference. Only the rendered green polygon is
 * the city outline; camera maxBounds is a broader view constraint.
 * geoBoundaries attribution must remain visible in web and native UI.
 */
export async function loadSjdmBoundary(): Promise<SjdmBoundary | null> {
  const feature: SjdmBoundary = {
    type: "Feature",
    geometry: SJDM_REFERENCE_GEOMETRY as unknown as BoundaryGeometry,
    properties: {
      source: SJDM_BOUNDARY_SOURCE,
      city: "City of San Jose del Monte",
      province: "Bulacan",
    },
  };
  const points = allCoordinates(feature);
  if (points.length < 4 || points.length > 100000 ||
      !points.every(p => Array.isArray(p) && p.length === 2 &&
        Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
        p[0] > 120.8 && p[0] < 121.3 && p[1] > 14.6 && p[1] < 15.05)) return null;
  const box = boundaryBounds(feature);
  if (box.east - box.west < 0.015 || box.north - box.south < 0.015) return null;
  return feature;
}


/** Local canvas overlay: mask everything OUTSIDE the actual boundary.
 * This rectangle is only an exterior paint canvas, NOT the city's border.
 * The hole(s) are the separately attributed geoBoundaries geometry.
 */
export const SJDM_MASK_EXTERIOR: LngLat[] = [
  [120.2, 13.5], [122.0, 13.5], [122.0, 16.0], [120.2, 16.0], [120.2, 13.5],
];

const signedRingArea = (ring: LngLat[]): number => {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] -
      ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
};
const orientedRing = (input: LngLat[], positive: boolean): LngLat[] => {
  const closed: LngLat[] = input.map(point => [point[0], point[1]]);
  if (closed.length > 0 &&
      (closed[0][0] !== closed[closed.length - 1][0] ||
       closed[0][1] !== closed[closed.length - 1][1])) {
    closed.push([closed[0][0], closed[0][1]]);
  }
  return (signedRingArea(closed) > 0) === positive ? closed : closed.reverse();
};

/** An outside-only fill, with the city's real outline cut out as hole(s). */
export function sjdmOutsideMask(feature: SjdmBoundary): {
  type: "Feature";
  properties: { scope: string };
  geometry: { type: "Polygon"; coordinates: LngLat[][] };
} {
  const cityOuters = boundaryRings(feature)
    .filter(rings => rings.length > 0)
    .map(rings => orientedRing(rings[0], false));
  return {
    type: "Feature",
    properties: { scope: "outside-sjdm-only" },
    geometry: {
      type: "Polygon",
      coordinates: [orientedRing(SJDM_MASK_EXTERIOR, true), ...cityOuters],
    },
  };
}

/** Never draw a route that escapes the city, including a path that leaves and
 * re-enters the city between two in-boundary vertices. Sample at <=15m along
 * segments (in geographic degrees for this local SJDM-only scope).
 */
export function routeStaysInSjdm(
  feature: SjdmBoundary,
  route: ReadonlyArray<{ latitude: number; longitude: number }>,
): boolean {
  if (route.length < 2) return false;
  for (let i = 0; i < route.length; i++) {
    const start = route[i];
    if (!insideSjdmBoundary(feature, start.latitude, start.longitude)) return false;
    if (i === 0) continue;
    const prior = route[i - 1];
    const extent = Math.max(
      Math.abs(start.latitude - prior.latitude),
      Math.abs(start.longitude - prior.longitude),
    );
    const samples = Math.ceil(extent / 0.00012);
    if (samples > 10000) return false;
    for (let step = 1; step < samples; step++) {
      const ratio = step / samples;
      const latitude = prior.latitude + (start.latitude - prior.latitude) * ratio;
      const longitude = prior.longitude + (start.longitude - prior.longitude) * ratio;
      if (!insideSjdmBoundary(feature, latitude, longitude)) return false;
    }
  }
  return true;
}

/** Safe point shown when a user/route GPS is elsewhere in the Philippines. */
export function sjdmSafeCenter(feature: SjdmBoundary): {
  latitude: number; longitude: number;
} {
  if (insideSjdmBoundary(feature, SJDM_FOCUS.latitude, SJDM_FOCUS.longitude))
    return { ...SJDM_FOCUS };
  // A midpoint toward a polygon interior is preferable to a random city bbox.
  const outer = boundaryRings(feature)[0]?.[0];
  if (outer?.length) {
    const middle = outer[Math.floor(outer.length / 2)];
    return { longitude: middle[0], latitude: middle[1] };
  }
  return { ...SJDM_FOCUS };
}
