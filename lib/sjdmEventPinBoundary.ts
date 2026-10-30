/**
 * Event pin scope uses the same existing attributed city boundary as the
 * Emergency Maps. BBox constrains the camera; polygon constrains pin selection.
 * This simplified reference is not an official legal or cadastral survey.
 */
import { SJDM_REFERENCE_GEOMETRY } from "../constants/sjdmBoundaryReference";
import {
  boundaryBounds,
  insideSjdmBoundary,
  sjdmOutsideMask,
  SJDM_BOUNDARY_SOURCE,
  type BoundaryGeometry,
  type SjdmBoundary,
} from "./sjdmMapBoundary";

export const SJDM_EVENT_BOUNDARY: SjdmBoundary = {
  type: "Feature",
  properties: {
    source: SJDM_BOUNDARY_SOURCE,
    city: "City of San Jose del Monte",
    province: "Bulacan",
  },
  geometry: SJDM_REFERENCE_GEOMETRY as unknown as BoundaryGeometry,
};
export const SJDM_EVENT_BOUNDS = boundaryBounds(SJDM_EVENT_BOUNDARY);
export const SJDM_EVENT_OUTSIDE_MASK = sjdmOutsideMask(SJDM_EVENT_BOUNDARY);
export const validSjdmEventPin = (latitude: number, longitude: number): boolean =>
  insideSjdmBoundary(SJDM_EVENT_BOUNDARY, latitude, longitude);
