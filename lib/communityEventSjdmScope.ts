/** Community Events must use the existing SJDM polygon, not a broad box. */
import { SJDM_REFERENCE_GEOMETRY } from "../constants/sjdmBoundaryReference";
import { insideSjdmBoundary, routeStaysInSjdm } from "./sjdmMapBoundary";
import type { SjdmBoundary, BoundaryGeometry } from "./sjdmMapBoundary";

export const SJDM_EVENT_BOUNDARY: SjdmBoundary = {
  type: "Feature",
  geometry: SJDM_REFERENCE_GEOMETRY as unknown as BoundaryGeometry,
  properties: {
    source: "geoBoundaries / William & Mary geoLab (CC BY 4.0)",
    city: "City of San Jose del Monte",
    province: "Bulacan",
  },
};

export const isSjdmEventPoint = (latitude: number, longitude: number) =>
  insideSjdmBoundary(SJDM_EVENT_BOUNDARY, latitude, longitude);

export const isSjdmEventRoute = (
  points: ReadonlyArray<{ latitude: number; longitude: number }>,
) => routeStaysInSjdm(SJDM_EVENT_BOUNDARY, points);
