import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

/**
 * Published, audience-scoped announcement feed shared by the web dashboard,
 * mobile dashboard and Notifications screen.
 *
 * Firestore rules independently enforce the same audience and publishAt
 * restriction, including against direct document reads.
 */
export type CommunityAnnouncement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  priority?: "normal" | "urgent";
  imageUrl?: string;
  linkUrl?: string;
  updatedAt?: any;
  createdBy?: string;
  publishAt?: any;
  createdAt?: any;
};

const timestampValue = (value: any): number =>
  typeof value?.toMillis === "function" ? value.toMillis() :
  typeof value?.toDate === "function" ? value.toDate().getTime() : 0;

export function useCommunityAnnouncements(barangay?: string, enabled = false) {
  const [announcements, setAnnouncements] = useState<CommunityAnnouncement[]>([]);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  // Use the exact profile barangay for Firestore's case-sensitive audience match.
  const area = (barangay || "").trim();

  // Queries use a fixed "published by now" timestamp; renew periodically so
  // scheduled posts become visible without a reload.
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setRefreshKey(value => value + 1), 60_000);
    return () => clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    setAnnouncements([]);
    setError("");
    if (!enabled) return;

    const audiences = [...new Set(["all", area].filter(Boolean))];
    const byAudience = new Map<string, CommunityAnnouncement[]>();
    const failed = new Set<string>();
    let subscribed = true;
    const refreshFeed = () => {
      if (!subscribed) return;
      const combined = [...byAudience.values()].flat();
      const unique = [...new Map(combined.map(item => [item.id, item])).values()];
      unique.sort((left, right) => timestampValue(right.publishAt) - timestampValue(left.publishAt));
      setAnnouncements(unique);
      setError(failed.size ? "Some community updates could not be loaded." : "");
    };

    const listeners = audiences.map(audience => {
      // Both restrictions are essential. Firestore security rules are not
      // filters, and an unscoped collection read would be rejected.
      const publishedInArea = query(
        collection(db, "announcements"),
        where("audience", "==", audience),
        where("publishAt", "<=", Timestamp.now()),
        orderBy("publishAt", "desc")
      );
      return onSnapshot(publishedInArea, snapshot => {
        byAudience.set(audience, snapshot.docs.map(document => ({
          id: document.id,
          ...(document.data() as Omit<CommunityAnnouncement, "id">),
        })));
        failed.delete(audience);
        refreshFeed();
      }, listenerError => {
        console.error("Community announcement scope listener:", audience, listenerError);
        byAudience.delete(audience);
        failed.add(audience);
        refreshFeed();
      });
    });
    return () => {
      subscribed = false;
      listeners.forEach(unsubscribe => unsubscribe());
    };
  }, [enabled, area, refreshKey]);

  return { announcements, error };
}
