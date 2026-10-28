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
