import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { isVerifiedActiveCenter } from "./emergencyMapTypes";

export type VerifiedEvacuationCenter = {
  id: string;
  name: string;
  address: string;
  barangay: string;
  latitude: number;
  longitude: number;
  status: "active";
  verificationStatus: "verified";
  capacity?: number;
  occupied?: number;
  updatedAt?: { toDate?: () => Date };
  lastVerifiedAt?: { toDate?: () => Date };
};

export function useVerifiedEvacuationCenters() {
  const [centers, setCenters] = useState<VerifiedEvacuationCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    return onSnapshot(collection(db, "evacuation_centers"), snapshot => {
      const next = snapshot.docs.map(item => ({
        ...item.data(),
        id: item.id,
      } as VerifiedEvacuationCenter)).filter(item => isVerifiedActiveCenter(item));
      next.sort((a, b) => (a.barangay || "").localeCompare(b.barangay || "") ||
        (a.name || "").localeCompare(b.name || ""));
      setCenters(next);
      setLoading(false);
      setError("");
    }, () => {
      setCenters([]);
      setError("LGU shelter records are unavailable. Do not assume a center is open.");
      setLoading(false);
    });
  }, []);
  return { centers, loading, error };
}

export function reportedSpaceText(center: VerifiedEvacuationCenter) {
  if (!Number.isInteger(center.capacity) || !Number.isInteger(center.occupied) ||
      (center.capacity ?? 0) <= 0 || (center.occupied ?? -1) < 0 ||
      (center.occupied ?? 0) > (center.capacity ?? 0)) {
    return "No recorded occupancy data";
  }
  return "Last reported: " + (center.capacity! - center.occupied!) +
    " of " + center.capacity + " spaces unoccupied";
}

export function centerUpdatedLabel(center: VerifiedEvacuationCenter) {
  try {
    const updated = center.updatedAt?.toDate?.();
    return updated && Number.isFinite(updated.getTime())
      ? "LGU record updated " + updated.toLocaleString() : "Update time unavailable";
  } catch {
    return "Update time unavailable";
  }
}
