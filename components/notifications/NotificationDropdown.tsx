import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../../lib/firebase";
import { activeModeForProfile } from "../../lib/firebaseAuth";
import { useAnnouncementAlerts } from "../../lib/useAnnouncementAlerts";
import { useUserSession } from "../../lib/useUserSession";

type InboxItem = {
  id: string;
  userId?: string;
  title?: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: any;
  caseId?: string;
  assignmentId?: string;
  eventId?: string;
  certificateId?: string;
  requestId?: string;
  campaignId?: string;
  announcementId?: string;
};

const toTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const shortDate = (value: any) => {
  const time = toTime(value);
  if (!time) return "Recent";
  const elapsed = Math.max(0, Date.now() - time);
  if (elapsed < 60000) return "Just now";
  if (elapsed < 3600000) return Math.floor(elapsed / 60000) + "m";
  if (elapsed < 86400000) return Math.floor(elapsed / 3600000) + "h";
  if (elapsed < 604800000) return Math.floor(elapsed / 86400000) + "d";
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const categoryInfo = (item: InboxItem): { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] } => {
  const text = (String(item.type || "") + " " + String(item.title || "")).toLowerCase();
  if (/announcement|advisory|barangay_notice|system_update|public_notice/.test(text))
    return { label: "Announcement", icon: "megaphone-outline" };
  if (/certificate|event|attendance|community.activity/.test(text))
    return { label: "Event", icon: "calendar-outline" };
  if (/donat|assistance.request|fund|campaign|payment|receipt|release/.test(text))
    return { label: "Donation", icon: "heart-outline" };
  if (/emergency|disaster|rescue|incident|response|evacuat|dispatch|volunteer.invitation|volunteer_contribution|arrival/.test(text))
    return { label: "Emergency", icon: "alert-circle-outline" };
  return { label: "Account", icon: "person-circle-outline" };
};

// Only allow existing application routes. Never navigate to a URL supplied by a notification.
const destinationFor = (item: InboxItem, volunteerMode: boolean): Href => {
  const text = (String(item.type || "") + " " + String(item.title || "") + " " +
    String(item.message || "")).toLowerCase();
  if (item.certificateId || /certificate/.test(text))
    return volunteerMode ? "/(tabs)/certificate" : "/(tabs)/profile";
  if (item.announcementId || /announcement|system update|public advisory|barangay notice/.test(text))
    return "/(tabs)/announcements";
  if (item.eventId || /community event|event invitation|event attendance|event reminder/.test(text))
    return "/(tabs)/community-events";
  if (/volunteer.contribution|volunteer_verified|verified contribution|volunteer impact/.test(text))
    return volunteerMode ? "/(tabs)/volunteer-impact" : "/(tabs)/profile";
  if (/volunteer invitation|volunteer task|emergency task|assignment offered/.test(text))
    return volunteerMode ? "/(tabs)/volunteer" : "/(tabs)/disaster-response";
  if (/donation receipt|payment receipt|donation history/.test(text))
    return "/(tabs)/donation-history";
  if (item.campaignId || /donat|fundraising|campaign|fund request/.test(text))
    return "/(tabs)/donation";
  if (item.requestId || /assistance application|assistance request|request assistance/.test(text))
    return volunteerMode ? "/(tabs)" : "/(tabs)/resident";
  if (/confirm lgu arrival|resident confirm|response completed|your emergency report|report validated/.test(text))
    return volunteerMode ? "/(tabs)/volunteer" : "/(tabs)/my-cases";
  if (/responder is on the way|response tracking|live map|location update/.test(text))
    return "/(tabs)/disaster-response";
  if (item.assignmentId || /volunteer|emergency task/.test(text))
    return volunteerMode ? "/(tabs)/volunteer" : "/(tabs)/disaster-response";
  if (item.caseId || /emergency|disaster|incident|evacuation|rescue|response/.test(text))
    return volunteerMode ? "/(tabs)/volunteer" : "/(tabs)/my-cases";
  if (/identity|verified account|verification|profile|account|password|login/.test(text))
    return "/(tabs)/profile";
  if (categoryInfo(item).label === "Event") return "/(tabs)/community-events";
  return "/(tabs)";
};

/** Shared resident/volunteer header bell. It does not change Firestore rules or create records. */
export default function NotificationDropdown({ variant = "default" }: { variant?: "default" | "home" }) {
  const { user, profile } = useUserSession();
  const uid = user?.uid ?? null;
  const volunteerMode = profile ? activeModeForProfile(profile) === "volunteer" : false;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const { alerts: announcementAlerts, markAnnouncementRead } = useAnnouncementAlerts();
  const [loading, setLoading] = useState(!!uid);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const bellRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ right: number; bottom: number } | null>(null);

  useEffect(() => {
    setItems([]);
    setError("");
    setLoading(!!uid);
    if (!uid) return;
    const q = query(collection(db, "notifications"), where("userId", "==", uid));
    return onSnapshot(q, snapshot => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InboxItem))
        .filter(item => item.userId === uid)
        .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
      setItems(records);
      setLoading(false);
      setError("");
    }, (failure: any) => {
      setLoading(false);
      setError(String(failure?.code || "") === "permission-denied"
        ? "Notifications aren't available for this account."
        : "Can't load updates. Check your connection.");
    });
  }, [uid]);

  useEffect(() => { setOpen(false); }, [uid]);
  // A published announcement is also a bell item even when no Cloud Function
  // has created a private notification document. Avoid showing duplicates.
  const allItems = useMemo(() => {
    const notified = new Set(items.map(item => item.announcementId).filter(Boolean));
    return [...items, ...announcementAlerts.filter(item => !notified.has(item.announcementId))]
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
  }, [items, announcementAlerts]);
  const unread = useMemo(() => allItems.filter(item => !item.read).length, [allItems]);
  const shown = useMemo(() => (showUnreadOnly ? allItems.filter(item => !item.read) : allItems).slice(0, 5),
    [allItems, showUnreadOnly]);

  const openItem = (item: InboxItem) => {
    if (!uid || item.userId !== uid) return;
    const destination = destinationFor(item, volunteerMode);
    setOpen(false);
    if (!item.read) {
      if (item.id.startsWith("feed_announcement_")) {
        void markAnnouncementRead(item.id);
      } else {
        void updateDoc(doc(db, "notifications", item.id), { read: true })
          .catch(() => { /* Navigation works even if read status cannot be saved. */ });
      }
    }
    router.push(destination);
  };

  const markAllRead = async () => {
    if (!uid || saving) return;
    const targets = allItems.filter(item => item.userId === uid && !item.read);
    if (!targets.length) return;
    setSaving(true);
    setError("");
    let failed = 0;
    try {
      for (let start = 0; start < targets.length; start += 15) {
        const results = await Promise.allSettled(targets.slice(start, start + 15)
          .map(item => item.id.startsWith("feed_announcement_")
            ? markAnnouncementRead(item.id)
            : updateDoc(doc(db, "notifications", item.id), { read: true })));
        failed += results.filter(result => result.status === "rejected").length;
      }
      if (failed) setError("Some updates couldn't be marked as read. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const showAll = () => {
    setOpen(false);
    router.push("/(tabs)/notifications" as Href);
  };

  const mobile = width < 700;
  const panelWidth = Math.min(width - 18, 405);
  const panelLeft = anchor
    ? Math.max(9, Math.min(width - panelWidth - 9, anchor.right - panelWidth))
    : Math.max(9, width - panelWidth - 9);
  const panelTop = anchor ? anchor.bottom + 7 : (mobile ? 66 + insets.top : 72);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setShowUnreadOnly(false);
    const node = bellRef.current as any;
    // Anchor to the ACTUAL bell in the home header, not the profile control.
    // Native measurement remains the fallback for mobile React Native.
    if (Platform.OS === "web" && typeof node?.getBoundingClientRect === "function") {
      const rect = node.getBoundingClientRect();
      setAnchor({ right: rect.right, bottom: rect.bottom });
      setOpen(true);
    } else if (typeof node?.measureInWindow === "function") {
      node.measureInWindow((x: number, y: number, triggerWidth: number, triggerHeight: number) => {
        setAnchor({ right: x + triggerWidth, bottom: y + triggerHeight });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  return (
    <View style={styles.root}>
      <Pressable ref={bellRef} accessibilityRole="button"
        accessibilityLabel={"Notifications" + (unread ? ", " + unread + " unread" : "")}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.bellButton, variant === "home" && styles.homeBellButton, pressed && styles.pressed]}>
        <Ionicons name={open ? "notifications" : "notifications-outline"} size={variant === "home" ? 23 : 22} color={variant === "home" ? "#122B55" : "#17453A"} />
        {unread > 0 ? <View style={styles.countBadge}>
          <Text style={styles.countText}>{unread > 99 ? "99+" : String(unread)}</Text>
        </View> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent
        onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close notifications"
            style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.panel, {
            top: panelTop,
            left: panelLeft,
            width: panelWidth,
          }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderCopy}>
                <Text style={styles.panelTitle}>Notifications</Text>
                <Text style={styles.panelCaption}>{unread ? unread + " unread updates" : "You're all caught up"}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close notifications panel"
                onPress={() => setOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#648176"/>
              </Pressable>
            </View>
            <View style={styles.actions}>
              <View style={styles.tabs}>
                <Pressable onPress={() => setShowUnreadOnly(false)}
                  style={[styles.tab, !showUnreadOnly && styles.tabActive]}>
                  <Text style={[styles.tabText, !showUnreadOnly && styles.tabTextActive]}>All</Text>
                </Pressable>
                <Pressable onPress={() => setShowUnreadOnly(true)}
                  style={[styles.tab, showUnreadOnly && styles.tabActive]}>
                  <Text style={[styles.tabText, showUnreadOnly && styles.tabTextActive]}>Unread</Text>
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" disabled={!unread || saving}
                onPress={() => void markAllRead()} style={[styles.markButton, (!unread || saving) && styles.dim]}>
                {saving ? <ActivityIndicator size="small" color="#0A805F"/> :
                  <Ionicons name="checkmark-done-outline" size={15} color="#0A805F"/>}
                <Text style={styles.markText}>Mark all read</Text>
              </Pressable>
            </View>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={shown.length > 4}>
              {loading ? <View style={styles.empty}>
                <ActivityIndicator color="#09815E"/>
                <Text style={styles.emptyMessage}>Loading your updates...</Text>
              </View> : shown.length === 0 ? <View style={styles.empty}>
                <View style={styles.emptyCircle}><Ionicons name="checkmark-circle-outline" size={26} color="#128360"/></View>
                <Text style={styles.emptyTitle}>{showUnreadOnly ? "Nothing unread" : "No notifications yet"}</Text>
                <Text style={styles.emptyMessage}>New VolunServe updates will appear here.</Text>
              </View> : shown.map(item => {
                const category = categoryInfo(item);
                return <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={"Open " + (item.title || "notification")}
                  onPress={() => openItem(item)}
                  style={({pressed}) => [styles.item, !item.read && styles.itemUnread, pressed && styles.pressed]}>
                  <View style={styles.itemIcon}><Ionicons name={category.icon} size={18} color="#0B7B5D"/></View>
                  <View style={styles.itemCopy}>
                    <View style={styles.itemTop}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{item.title || "VolunServe update"}</Text>
                      <Text style={styles.itemTime}>{shortDate(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.itemMessage} numberOfLines={2}>{item.message || "You have a new update."}</Text>
                    <Text style={styles.itemCategory}>{category.label}</Text>
                  </View>
                  {!item.read ? <View style={styles.unreadDot}/> : null}
                </Pressable>;
              })}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="See all notifications"
              onPress={showAll} style={({pressed}) => [styles.seeAll, pressed && styles.pressed]}>
              <Text style={styles.seeAllText}>See all notifications</Text>
              <Ionicons name="arrow-forward" size={16} color="#087C5C"/>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative" },
  bellButton: {
    width: 39, height: 39, borderRadius: 13, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#DCE8E1", alignItems: "center", justifyContent: "center",
  },
  homeBellButton: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.96)", borderColor: "rgba(224,232,240,0.95)",
  },
  pressed: { opacity: 0.76 },
  countBadge: {
    position: "absolute", top: -5, right: -6, height: 19, minWidth: 19,
    paddingHorizontal: 4, borderRadius: 10, backgroundColor: "#E3445B",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFFFFF",
  },
  countText: { fontSize: 10, color: "#FFFFFF", fontWeight: "900" },
  modalRoot: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,28,21,0.14)" },
  panel: {
    position: "absolute", maxHeight: "79%", borderRadius: 18,
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DFEAE3",
    shadowColor: "#112F24", shadowOffset: {width: 0, height: 13},
    shadowOpacity: 0.20, shadowRadius: 28, elevation: 18, overflow: "hidden",
  },
  panelHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 19,
    paddingTop: 17, paddingBottom: 13, borderBottomColor: "#EFF3F0", borderBottomWidth: 1 },
  panelHeaderCopy: { flex: 1 },
  panelTitle: { fontSize: 19, fontWeight: "900", color: "#193F31" },
  panelCaption: { marginTop: 3, fontSize: 11, color: "#698579" },
  closeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  actions: { paddingHorizontal: 15, paddingVertical: 9, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between" },
  tabs: { flexDirection: "row", gap: 6 },
  tab: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, backgroundColor: "#F2F5F3" },
  tabActive: { backgroundColor: "#E0F3E9" },
  tabText: { fontSize: 11, fontWeight: "800", color: "#738D7B" },
  tabTextActive: { color: "#087C5C" },
  markButton: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 3 },
  markText: { fontSize: 11, fontWeight: "800", color: "#0A805F" },
  dim: { opacity: 0.38 },
  error: { marginHorizontal: 16, marginVertical: 7, color: "#BD473F", fontSize: 11 },
  list: { flexGrow: 0 },
  item: { flexDirection: "row", gap: 11, paddingHorizontal: 17, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: "#F0F3F1" },
  itemUnread: { backgroundColor: "#F0FAF4" },
  itemIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center",
    justifyContent: "center", backgroundColor: "#E6F5EB" },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemTitle: { flex: 1, color: "#183D31", fontSize: 12.5, fontWeight: "800" },
  itemTime: { color: "#779083", fontSize: 10 },
  itemMessage: { color: "#516E60", fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  itemCategory: { color: "#0B7E5D", fontSize: 10, fontWeight: "800", marginTop: 5 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#11876B", marginTop: 6 },
  empty: { minHeight: 166, padding: 25, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#EAF8EF",
    alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#224B3B", fontSize: 13, fontWeight: "800" },
  emptyMessage: { color: "#718C7C", fontSize: 11, textAlign: "center" },
  seeAll: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
    padding: 15, backgroundColor: "#F6FAF7", borderTopWidth: 1, borderColor: "#E6EFE8" },
  seeAllText: { color: "#087C5C", fontSize: 12, fontWeight: "900" },
});
