"use strict";
/**
 * Backend community-event coordinate guard, identical to the Volunteer
 * map's geoBoundaries ADM3 SJDM polygon, NOT the former wide rectangle.
 *
 * Data is copied verbatim from constants/sjdmBoundaryReference.ts
 * (134-point geoBoundaries city reference). The CI parity check rejects
 * any divergence. This is a mapping reference, not a legal land survey.
 */
const geometry = require("./sjdmEventBoundaryGeometry.json");

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) &&
        lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isSjdmEventPoint(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number" ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < 14.6 || latitude > 15.05 ||
      longitude < 120.8 || longitude > 121.3) return false;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some(rings => Array.isArray(rings) && rings.length > 0 &&
    inRing(longitude, latitude, rings[0]) &&
    !rings.slice(1).some(hole => inRing(longitude, latitude, hole)));
}

module.exports = { isSjdmEventPoint };
