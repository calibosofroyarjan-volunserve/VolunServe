import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

/**
 * Publicly published notices for the signed-in member's community feed.
 * The current rules still authorize reads of published announcements; the
 * client narrows display to city-wide plus the member's assigned barangay.
 * No administration or publishing permissions are changed here.
 */
export type CommunityAnnouncement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  priority?: "normal" | "urgent";
  publishAt?: any;
  createdAt?: any;
};

export function useCommunityAnnouncements(barangay?: string, enabled = false) {
  const [announcements, setAnnouncements] = useState<CommunityAnnouncement[]>([]);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const normalizedBarangay = (barangay || "").trim().toLowerCase();

  // Timestamp-bound queries must be refreshed to include newly published posts.
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setRefreshKey(value => value + 1), 60_000);
    return () => clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setAnnouncements([]);
      setError("");
      return;
    }

    const published = query(
      collection(db, "announcements"),
      where("publishAt", "<=", Timestamp.now()),
      orderBy("publishAt", "desc")
    );
    return onSnapshot(published, snapshot => {
      const items = snapshot.docs.map(document => ({
        id: document.id,
        ...(document.data() as Omit<CommunityAnnouncement, "id">),
      }));
      setAnnouncements(items.filter(item => {
        const audience = String(item.audience || "").trim().toLowerCase();
        return audience === "all" || (Boolean(normalizedBarangay) && audience === normalizedBarangay);
      }));
      setError("");
    }, snapshotError => {
      console.error("Community announcement listener:", snapshotError);
      setAnnouncements([]);
      setError("Community updates are temporarily unavailable.");
    });
  }, [enabled, normalizedBarangay, refreshKey]);

  return { announcements, error };
}
