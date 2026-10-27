import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../../lib/firebase";

type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type?: string;
  read?: boolean;
  createdAt?: any;
};
type Filter = "All" | "Unread" | "Emergency" | "Events" | "Donations" | "Account";
const FILTERS: Filter[] = ["All", "Unread", "Emergency", "Events", "Donations", "Account"];
const PAGE_SIZE = 5;

const timestamp = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const categoryOf = (item: NotificationItem): Exclude<Filter, "All" | "Unread"> => {
  const raw = String(item.type || "").toLowerCase();
  if (/emergency|disaster|rescue|incident|response|evacuat/.test(raw)) return "Emergency";
  if (/event|volunteer|attendance|certificate|schedule|task/.test(raw)) return "Events";
  if (/donat|assistance|fund|campaign|payment|release|receipt/.test(raw)) return "Donations";
  return "Account";
};

export default function NotificationsScreen() {
  const [uid, setUid] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState(false);

  useEffect(() => onAuthStateChanged(auth, user => {
    setUid(user?.uid ?? null);
    setNotifications([]);
    setError("");
    setLoading(!!user);
  }), []);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "notifications"), where("userId", "==", uid));
    return onSnapshot(q, snapshot => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as NotificationItem));
      items.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
      setNotifications(items);
      setLoading(false);
      setError("");
    }, () => {
      setLoading(false);
      setError("Could not load notifications. Check your connection and try again.");
    });
  }, [uid]);

  const unread = useMemo(() => notifications.filter(item => !item.read).length, [notifications]);
  const filtered = useMemo(() => notifications.filter(item =>
    filter === "All" || (filter === "Unread" ? !item.read : categoryOf(item) === filter)
  ), [notifications, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [filter]);

  const markAsRead = async (ids: string[]) => {
    if (!uid || !ids.length || updating) return;
    const ownedUnread = new Set(notifications.filter(item => item.userId === uid && !item.read).map(item => item.id));
    const validIds = ids.filter(id => ownedUnread.has(id));
    if (!validIds.length) return;
    setUpdating(true);
    setError("");
    try {
      const results = await Promise.allSettled(validIds.map(id => updateDoc(doc(db, "notifications", id), { read: true })));
      if (results.some(result => result.status === "rejected")) {
        setError("Some notifications could not be updated. Please try again.");
      }
    } finally {
      setUpdating(false);
    }
  };

  if (!uid && !loading) return <View style={styles.center}>
    <Ionicons name="lock-closed-outline" size={32} color="#188262" />
    <Text style={styles.emptyTitle}>Sign in to view notifications</Text>
    <Text style={styles.emptyText}>Private account alerts are available after login.</Text>
  </View>;

  return <ScrollView style={styles.root} contentContainerStyle={styles.container}>
    <View style={styles.heading}>
      <View style={styles.headingIcon}><Ionicons name="notifications-outline" size={24} color="#fff" /></View>
      <View style={styles.headingText}>
        <Text style={styles.kicker}>VOLUNSERVE • UPDATES</Text>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Important account and community updates in one place.</Text>
      </View>
    </View>

    <View style={styles.summary}>
      <View><Text style={styles.metric}>{unread}</Text><Text style={styles.metricLabel}>Unread notifications</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mark all notifications as read"
        style={[styles.markAll, (!unread || updating) && styles.disabled]} disabled={!unread || updating}
        onPress={() => void markAsRead(notifications.filter(item => !item.read).map(item => item.id))}>
        <Ionicons name="checkmark-done-outline" size={18} color="#087D60" />
        <Text style={styles.markAllText}>{updating ? "Updating..." : "Mark all read"}</Text>
      </TouchableOpacity>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
      {FILTERS.map(option => <TouchableOpacity key={option} accessibilityRole="tab"
        accessibilityState={{ selected: filter === option }} onPress={() => setFilter(option)}
        style={[styles.filterPill, filter === option && styles.filterActive]}>
        <Text style={[styles.filterLabel, filter === option && styles.filterLabelActive]}>
          {option}{option === "Unread" && unread > 0 ? ` (${unread})` : ""}
        </Text>
      </TouchableOpacity>)}
    </ScrollView>

    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading ? <View style={styles.state}><ActivityIndicator color="#087D60" /><Text style={styles.emptyText}>Loading notifications...</Text></View>
      : filtered.length === 0 ? <View style={styles.state}>
        <Ionicons name="mail-open-outline" size={32} color="#82A898" />
        <Text style={styles.emptyTitle}>Nothing here yet</Text>
        <Text style={styles.emptyText}>Relevant updates will appear here automatically.</Text>
      </View> : <>
        <Text style={styles.resultCount}>{filtered.length} {filtered.length === 1 ? "notification" : "notifications"} • Showing {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</Text>
        {visible.map(item => <View key={item.id} style={[styles.card, !item.read && styles.unreadCard]}>
          <View style={styles.cardTop}>
            <View style={[styles.typeIcon, !item.read && styles.typeIconUnread]}>
              <Ionicons name={categoryOf(item) === "Emergency" ? "alert-circle-outline" : categoryOf(item) === "Events" ? "calendar-outline" : categoryOf(item) === "Donations" ? "heart-outline" : "shield-checkmark-outline"} size={19} color="#087D60"/>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle}>{item.title || "VolunServe update"}</Text>
                {!item.read && <View style={styles.newDot} accessibilityLabel="Unread" />}
              </View>
              <Text style={styles.category}>{categoryOf(item)} • {timestamp(item.createdAt) ? new Date(timestamp(item.createdAt)).toLocaleString() : "Just now"}</Text>
              <Text style={styles.message}>{item.message || "You have a new update."}</Text>
              {!item.read && <TouchableOpacity disabled={updating} accessibilityRole="button"
                style={styles.readButton} onPress={() => void markAsRead([item.id])}>
                <Text style={styles.readText}>Mark as read</Text><Ionicons name="checkmark" size={15} color="#087D60"/>
              </TouchableOpacity>}
            </View>
          </View>
        </View>)}
        <View style={styles.pagination}>
          <TouchableOpacity accessibilityRole="button" disabled={safePage <= 1} style={[styles.pageButton, safePage <= 1 && styles.disabled]}
            onPress={() => setPage(p => Math.max(1, p - 1))}><Text style={styles.pageText}>Previous</Text></TouchableOpacity>
          <Text style={styles.pageCount}>Page {safePage} of {totalPages}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={safePage >= totalPages} style={[styles.pageButton, safePage >= totalPages && styles.disabled]}
            onPress={() => setPage(p => Math.min(totalPages, p + 1))}><Text style={styles.pageText}>Next</Text></TouchableOpacity>
        </View>
      </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F8F5" },
  container: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 18, paddingVertical: 24, paddingBottom: 48 },
  heading: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, paddingHorizontal: 17, backgroundColor: "#0D7557", borderRadius: 19 },
  headingIcon: { backgroundColor: "#ffffff25", borderRadius: 15, padding: 13 },
  headingText: { flex: 1 },
  kicker: { color: "#C4F4DE", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginTop: 3 },
  subtitle: { color: "#E4FAEB", fontSize: 12, marginTop: 4, lineHeight: 18 },
  summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", padding: 17, marginTop: 16, borderRadius: 15, borderWidth: 1, borderColor: "#DCEAE1" },
  metric: { fontSize: 27, fontWeight: "900", color: "#0D7557" },
  metricLabel: { fontSize: 11, color: "#5C7B6B", fontWeight: "700" },
  markAll: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, backgroundColor: "#E8F7EE", gap: 5 },
  markAllText: { color: "#087D60", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.35 },
  filterScroll: { marginTop: 17, maxHeight: 48 },
  filters: { gap: 8, paddingBottom: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#FFFFFF", borderRadius: 999, borderColor: "#D9E8DF", borderWidth: 1 },
  filterActive: { backgroundColor: "#0D7557", borderColor: "#0D7557" },
  filterLabel: { color: "#416959", fontSize: 12, fontWeight: "800" },
  filterLabelActive: { color: "#FFFFFF" },
  resultCount: { color: "#6B8676", fontSize: 12, marginTop: 12, marginBottom: 10, fontWeight: "600" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#DFEAE3", marginBottom: 11, padding: 16 },
  unreadCard: { borderColor: "#92D1B1", backgroundColor: "#FBFFFC" },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  typeIcon: { borderRadius: 12, backgroundColor: "#ECF7F0", padding: 10 },
  typeIconUnread: { backgroundColor: "#D9F3E3" },
  cardContent: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  cardTitle: { color: "#173F31", fontSize: 14, fontWeight: "900", flex: 1 },
  newDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: "#0E9B6D", marginTop: 5 },
  category: { color: "#6D887A", fontSize: 11, marginTop: 5, fontWeight: "700" },
  message: { color: "#435F51", fontSize: 13, marginTop: 10, lineHeight: 20 },
  readButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 11, gap: 4, padding: 5 },
  readText: { color: "#087D60", fontWeight: "800", fontSize: 12 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 6 },
  pageButton: { backgroundColor: "#E9F4ED", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9 },
  pageText: { color: "#0D7557", fontWeight: "800", fontSize: 12 },
  pageCount: { color: "#4F7061", fontWeight: "700", fontSize: 12 },
  error: { marginTop: 12, padding: 12, color: "#9D3535", backgroundColor: "#FFF0EE", borderRadius: 10, fontSize: 12 },
  state: { backgroundColor: "#FFFFFF", marginTop: 12, borderRadius: 16, alignItems: "center", gap: 9, padding: 35, borderWidth: 1, borderColor: "#E0EBE4" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25, gap: 10, backgroundColor: "#F3F8F5" },
  emptyTitle: { color: "#214C3A", fontSize: 15, fontWeight: "900", textAlign: "center" },
  emptyText: { color: "#6B8577", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
