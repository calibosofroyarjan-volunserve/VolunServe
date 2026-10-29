/** Approved, fixed LGU facilities. This is NOT a live responder GPS feed. */
export const LGU_FACILITY_TYPES = [
  "city_government", "cdrrmo", "fire_station", "police_station", "health_center", "barangay_hall",
] as const;
export type LguFacilityType = typeof LGU_FACILITY_TYPES[number];
export type LguMapFacility = {
  id: string;
  name: string;
  address: string;
  barangay: string;
  facilityType: LguFacilityType;
  latitude: number;
  longitude: number;
  verificationStatus: "verified";
  status: "active";
  verificationSource: string;
  updatedAt?: { toDate?: () => Date; toMillis?: () => number };
};
export function verifiedLguMapFacility(id: string, data: Record<string, any>): LguMapFacility | null {
  if (!id || data.verificationStatus !== "verified" || data.status !== "active" ||
    !LGU_FACILITY_TYPES.includes(data.facilityType) ||
    typeof data.name !== "string" || data.name.trim().length < 3 ||
    typeof data.address !== "string" || data.address.trim().length < 3 ||
    typeof data.barangay !== "string" || !data.barangay.trim() ||
    typeof data.verificationSource !== "string" || !data.verificationSource.trim() ||
    typeof data.latitude !== "number" || typeof data.longitude !== "number" ||
    !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) ||
    data.latitude < 14.6 || data.latitude > 15.05 ||
    data.longitude < 120.8 || data.longitude > 121.3) return null;
  return {
    id, name: data.name, address: data.address, barangay: data.barangay,
    facilityType: data.facilityType, latitude: data.latitude,
    longitude: data.longitude, verificationStatus: "verified",
    status: "active", verificationSource: data.verificationSource,
    updatedAt: data.updatedAt,
  };
}
export const LGU_FACILITY_ICONS: Record<LguFacilityType, string> = {
  city_government: "🏛️", cdrrmo: "🛟", fire_station: "🚒",
  police_station: "🚓", health_center: "🏥", barangay_hall: "🏢",
};
