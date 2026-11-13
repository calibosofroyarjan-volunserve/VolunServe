import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

export type AnnouncementAlert = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "announcement";
  read: boolean;
  createdAt: any;
};
const keyFor = (uid: string) => `volunserve:seen-announcements:${uid}`;


/**
 * Read-only derived alerts: no bulk user writes and no new Firestore permissions.
 * Dismissal is stored on this device; original announcements remain unchanged.
 */
export function useAnnouncementAlerts(uid: string | null | undefined) {
  const [alerts, setAlerts] = useState<AnnouncementAlert[]>([]);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    setAlerts([]);
    setSeen([]);
    if (!uid) return;
    let active = true;
    AsyncStorage.getItem(keyFor(uid))
      .then(value => {
        if (active) setSeen(value ? JSON.parse(value) : []);
      })
      .catch(() => { if (active) setSeen([]); });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "announcements"),
      where("audience", "==", "all")
    );
    return onSnapshot(q, snapshot => {
      const records = snapshot.docs.flatMap(document => {
        const data = document.data();
        return [{
          id: `announcement:${document.id}`,
          userId: uid,
          title: typeof data.title === "string" ? data.title : "Community announcement",
          message: typeof data.message === "string" ? data.message : "",
          type: "announcement" as const,
          read: false,
          createdAt: data.publishAt || data.createdAt,
        }];
      });
      records.sort((a, b) => {
        const millis = (value: any) => typeof value?.toMillis === "function" ? value.toMillis() : 0;
        return millis(b.createdAt) - millis(a.createdAt);
      });
      setAlerts(records);
    }, error => {
      console.warn("Could not load announcement alerts", error);
      setAlerts([]);
    });
  }, [uid]);

  const items = alerts.map(item => ({ ...item, read: seen.includes(item.id) }));
  const markSeen = async (ids: string[]) => {
    if (!uid) return;
    const next = Array.from(new Set([...seen, ...ids.filter(id => id.startsWith("announcement:"))]));
    await AsyncStorage.setItem(keyFor(uid), JSON.stringify(next));
    setSeen(next);
  };
  return { items, markSeen };
}
