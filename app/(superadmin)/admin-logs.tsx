import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, onSnapshot, type Timestamp } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type AuditEntry = {
  id: string;
  source: string;
  actionType: string;
  adminUid: string;
  adminName: string;
  targetType: string;
  targetId: string;
  description: string;
  createdAt?: Timestamp | null;
};

const asText = (value: unknown) => typeof value === "string" ? value : "";
const eventTime = (value?: Timestamp | null) => value?.toMillis?.() || 0;
const prettyDate = (value?: Timestamp | null) => {
  const date = value?.toDate?.();
  return date ? date.toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "Pending timestamp";
};
const prettyAction = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * Actual administrative audit feed. Donation transactions have their own
 * donation history and must not be mislabeled as all administrative actions.
 * Firestore rules restrict the feed to approved Super Admin accounts.
 */
export default function AdminLogs() {
  const router = useRouter();
  const { user, profile, loading: sessionLoading } = useUserSession();
  const authorized = !!user && profile?.role === "superadmin" && profile?.status === "approved";
  const [bySource, setBySource] = useState<Record<string, AuditEntry[]>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const sources = ["adminLogs", "adminActivityLogs"];

  useEffect(() => {
    if (!authorized) {
      setBySource({});
      setLoaded({});
      setErrors({});
      return;
    }
    const unsub = sources.map((source) => onSnapshot(
      collection(db, source),
      (snapshot) => {
        setBySource((old) => ({
          ...old,
          [source]: snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id, source,
              actionType: asText(data.actionType || data.action) || "administrative_action",
              adminUid: asText(data.adminUid || data.actorUid || data.updatedBy),
              adminName: asText(data.adminName || data.actorName),
              targetType: asText(data.targetType || data.entityType),
              targetId: asText(data.targetId || data.entityId),
              description: asText(data.description || data.details || data.message),
              createdAt: data.createdAt || data.timestamp || null,
            };
          }),
        }));
        setErrors((old) => { const next = { ...old }; delete next[source]; return next; });
        setLoaded((old) => ({ ...old, [source]: true }));
      },
      (error) => {
        setErrors((old) => ({ ...old, [source]: error.message || "Unable to load records" }));
        setLoaded((old) => ({ ...old, [source]: true }));
      },
    ));
    return () => unsub.forEach((stop) => stop());
  }, [authorized]);

  const logs = useMemo(
    () => sources.flatMap((source) => bySource[source] || [])
      .sort((a, b) => eventTime(b.createdAt) - eventTime(a.createdAt)),
    [bySource],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((item) =>
      [item.actionType, item.adminName, item.adminUid, item.targetType,
        item.targetId, item.description].join(" ").toLowerCase().includes(needle),
    );
  }, [logs, search]);

  if (sessionLoading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (!authorized) {
    return <View style={styles.center}><Ionicons name="lock-closed-outline" size={30} color="#64748B" />
      <Text style={styles.denied}>Super Admin access required.</Text></View>;
  }
  const loading = sources.some((source) => !loaded[source]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>SUPER ADMIN · SYSTEM OVERSIGHT</Text>
        <Text style={styles.title}>Audit Logs</Text>
        <Text style={styles.subtitle}>Recorded administrative actions, including account access changes.</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={18} color="#086F55" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.summary}>
      <Ionicons name="shield-checkmark-outline" size={23} color="#087657" />
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryTitle}>{logs.length} recorded administrative actions</Text>
        <Text style={styles.subtitle}>Actor, timestamp, target, and reason are shown when recorded.</Text>
      </View>
    </View>
    <View style={styles.searchRow}>
      <Ionicons name="search-outline" color="#64748B" size={20} />
      <TextInput
        style={styles.searchInput} value={search} onChangeText={setSearch}
        placeholder="Search action, account, actor or reference"
        placeholderTextColor="#94A3B8" autoCapitalize="none"
      />
    </View>
    {Object.entries(errors).map(([source, message]) =>
      <View key={source} style={styles.error}>
        <Text style={styles.errorText}>Unable to load {source}: {message}</Text>
      </View>,
    )}
    {loading ? <ActivityIndicator style={{ marginTop: 25 }} /> : null}
    {!loading && visible.length === 0 ?
      <View style={styles.empty}><Ionicons name="document-text-outline" size={30} color="#73918A" />
        <Text style={styles.emptyText}>{search ? "No matching audit events." : "No administrative audit events recorded yet."}</Text>
      </View> : null}
    {visible.map((item) =>
      <View key={item.source + ":" + item.id} style={styles.event}>
        <View style={styles.eventHeader}>
          <Text style={styles.action}>{prettyAction(item.actionType)}</Text>
          <Text style={styles.date}>{prettyDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.description}>{item.description || "No description provided."}</Text>
        <Text style={styles.meta}>Actor: {item.adminName || item.adminUid || "Not recorded"}</Text>
        <Text style={styles.meta}>Target: {item.targetType || "record"} · {item.targetId || "Not recorded"}</Text>
        <Text style={styles.source}>Source: {item.source}</Text>
      </View>,
    )}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8F7" },
  container: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: 22, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  denied: { fontWeight: "700", color: "#475569", textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  eyebrow: { fontSize: 11, fontWeight: "800", color: "#087657", letterSpacing: 1 },
  title: { fontSize: 27, fontWeight: "700", color: "#14392F", marginTop: 4 },
  subtitle: { fontSize: 12, color: "#657A80", marginTop: 4, lineHeight: 18 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, backgroundColor: "#E2F2ED", padding: 12 },
  backText: { color: "#086F55", fontWeight: "800" },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDEAE7", marginBottom: 14 },
  summaryTitle: { color: "#183C33", fontWeight: "800", fontSize: 15 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDEAE7", paddingHorizontal: 14, borderRadius: 12, marginBottom: 14 },
  searchInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 9, minWidth: 0, color: "#173B32" },
  error: { backgroundColor: "#FEF2F2", padding: 12, marginBottom: 10, borderRadius: 9 },
  errorText: { color: "#B91C1C", fontSize: 12 },
  empty: { padding: 35, alignItems: "center", gap: 10 },
  emptyText: { color: "#64748B", textAlign: "center" },
  event: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDEAE7", borderRadius: 14, marginBottom: 10, padding: 18 },
  eventHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  action: { color: "#087657", fontSize: 14, fontWeight: "900", flexShrink: 1 },
  date: { color: "#64748B", fontSize: 11 },
  description: { color: "#243C36", fontSize: 13, lineHeight: 19, marginBottom: 8 },
  meta: { color: "#64748B", fontSize: 12, marginTop: 3 },
  source: { color: "#819995", fontSize: 10, marginTop: 9 },
});
