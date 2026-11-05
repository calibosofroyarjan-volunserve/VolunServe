import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { isApprovedProfile } from "./firebaseAuth";
import { useUserSession } from "./useUserSession";

export type AnnouncementAlert = {
  id: string;
  userId: string;
  announcementId: string;
  title: string;
  message: string;
  type: "community_announcement";
  createdAt: any;
  read: boolean;
};

type PublishedAnnouncement = Omit<AnnouncementAlert, "read">;
const readByUser = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
const announceChange = () => listeners.forEach(callback => callback());
const storageKey = (uid: string) => "volunserve:read-announcements:" + uid;

function allowedAudience(audience: unknown, barangay: unknown): boolean {
  const scope = String(audience || "").trim().toLowerCase();
  const ownArea = String(barangay || "").trim().toLowerCase();
  return scope === "all" || Boolean(ownArea && scope === ownArea);
}

/**
 * Reads approved published notices directly from Firestore, so the bell and
 * Notifications page work without paid Functions or per-user fanout.
 * Local read status is saved per account/device, not to other people's inboxes.
 */
export function useAnnouncementAlerts() {
  const { user, profile, loading: sessionLoading } = useUserSession();
  const uid = user?.uid || "";
  const [notices, setNotices] = useState<PublishedAnnouncement[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) {
      setReadIds(new Set());
      return;
    }
    let active = true;
    const update = () => {
      if (active) setReadIds(new Set(readByUser.get(uid) || []));
    };
    listeners.add(update);
    update();
    void AsyncStorage.getItem(storageKey(uid)).then(value => {
      if (!active) return;
      const parsed: unknown = value ? JSON.parse(value) : [];
      const saved = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string").slice(-1000)
        : [];
      const combined = new Set([...saved, ...(readByUser.get(uid) || [])]);
      readByUser.set(uid, combined);
      announceChange();
    }).catch(() => {
      // Keep in-memory read state when browser storage is unavailable.
    });
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, [uid]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const barangay = profile?.barangay || "";
  const approved = Boolean(uid && profile && isApprovedProfile(profile));
  useEffect(() => {
    if (sessionLoading || !approved || !uid) {
      setNotices([]);
      setLoading(false);
      return;
    }
    // Retain the last good announcements while a newer time window subscribes.
    setLoading(true);
    const q = query(
      collection(db, "announcements"),
      where("publishAt", "<=", Timestamp.fromMillis(nowMs)),
    );
    return onSnapshot(q, snapshot => {
      const results: PublishedAnnouncement[] = snapshot.docs
        .map(item => {
          const data = item.data();
          if (!allowedAudience(data.audience, barangay)) return null;
          return {
            id: "feed_announcement_" + item.id,
            userId: uid,
            announcementId: item.id,
            title: String(data.title || "Community Announcement"),
            message: String(data.message || ""),
            type: "community_announcement" as const,
            createdAt: data.publishAt || data.createdAt,
          };
        })
        .filter((item): item is PublishedAnnouncement => item !== null)
        .sort((a, b) =>
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setNotices(results.slice(0, 100));
      setLoading(false);
      setError("");
    }, failure => {
      console.warn("Announcement bell listener failed", {
        code: String(failure?.code || "unknown"),
      });
      setNotices([]);
      setLoading(false);
      setError("Unable to load community announcements.");
    });
  }, [sessionLoading, approved, uid, barangay, nowMs]);

  const alerts = useMemo<AnnouncementAlert[]>(
    () => notices.map(notice => ({
      ...notice,
      read: readIds.has(notice.announcementId),
    })),
    [notices, readIds],
  );

  const markAnnouncementRead = useCallback(async (id: string) => {
    if (!uid) return;
    const notice = notices.find(item => item.id === id);
    if (!notice) return;
    const next = new Set(readByUser.get(uid) || []);
    next.add(notice.announcementId);
    readByUser.set(uid, next);
    announceChange();
    try {
      await AsyncStorage.setItem(storageKey(uid), JSON.stringify([...next].slice(-1000)));
    } catch {
      // Read receipts remain functional in this session without storage access.
    }
  }, [uid, notices]);

  return { alerts, markAnnouncementRead, loading, error };
}
