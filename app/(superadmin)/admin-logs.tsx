import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, onSnapshot, type Timestamp } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import ListPagination from "../../components/ui/ListPagination";
import SuperAdminFilterSort from "../../components/ui/SuperAdminFilterSort";
import { db } from "../../lib/firebase";
import { isSystemAccessChangeAction } from "../../lib/superAdminAuditCategories";
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

type AuditView = "all" | "lgu" | "system" | "access";
const auditViewFromParam = (value: unknown): AuditView =>
  value === "lgu" || value === "system" ? value : "all";

const PAGE_SIZE = 5;
const asText = (value: unknown) => typeof value === "string" ? value : "";
const eventTime = (value?: Timestamp | null) => value?.toMillis?.() || 0;
const prettyDate = (value?: Timestamp | null) => {
  const date = value?.toDate?.();
  return date ? date.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "Pending timestamp";
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
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { user, profile, loading: sessionLoading } = useUserSession();
  const authorized = !!user && profile?.role === "superadmin" && profile?.status === "approved";
  const [bySource, setBySource] = useState<Record<string, AuditEntry[]>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<AuditView>(() => auditViewFromParam(view));
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [adminsLoaded, setAdminsLoaded] = useState(false);
  const [adminsError, setAdminsError] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "actor" | "action">("newest");
  const sources = ["adminLogs", "adminActivityLogs"];

  // The View All links open the exact category visible on System Overview.
  // Reset the category when a dashboard link changes while this route is mounted.
  useEffect(() => {
    setKind(auditViewFromParam(view));
    setPage(1);
  }, [view]);

  // Dashboard's LGU Admin activity preview uses actor UID membership in users.
  // Use the same rule here so View All cannot show an unrelated log category.
  useEffect(() => {
    if (!authorized || kind !== "lgu") {
      setAdminUids([]);
      setAdminsLoaded(false);
      setAdminsError("");
      return;
    }
    setAdminsLoaded(false);
    const stop = onSnapshot(collection(db, "users"),
      snapshot => {
        setAdminUids(snapshot.docs.filter(doc => doc.data().role === "admin").map(doc => doc.id));
        setAdminsError("");
        setAdminsLoaded(true);
      },
      error => {
        setAdminUids([]);
        setAdminsError(error.message || "Unable to load LGU Admin accounts");
        setAdminsLoaded(true);
      },
    );
    return stop;
  }, [authorized, kind]);

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
    return logs.filter(item => {
      if (kind === "lgu" && !adminUids.includes(item.adminUid)) return false;
      if (kind === "system" && !isSystemAccessChangeAction(item.actionType)) return false;
      if (kind === "access" && !/account|access|suspend|activat|revok|promot/i.test(item.actionType)) return false;
      return !needle || [item.actionType, item.adminName, item.adminUid, item.targetType,
        item.targetId, item.description, item.source].join(" ").toLowerCase().includes(needle);
    }).sort((a, b) => {
      if (sort === "oldest") return eventTime(a.createdAt) - eventTime(b.createdAt);
      if (sort === "actor") return (a.adminName || a.adminUid).localeCompare(b.adminName || b.adminUid);
      if (sort === "action") return prettyAction(a.actionType).localeCompare(prettyAction(b.actionType));
      return eventTime(b.createdAt) - eventTime(a.createdAt);
    });
  }, [logs, search, kind, sort, adminUids]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (sessionLoading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (!authorized) {
    return <View style={styles.center}><Ionicons name="lock-closed-outline" size={30} color="#64748B" />
      <Text style={styles.denied}>Super Admin access required.</Text></View>;
  }
  const loading = sources.some((source) => !loaded[source]) ||
    (kind === "lgu" && !adminsLoaded);
  const viewTitle = kind === "lgu" ? "LGU Admin Activity" :
    kind === "system" ? "System & Access Changes" :
    kind === "access" ? "Account Access Events" : "Admin Activity & Audit Logs";
  const viewDescription = kind === "lgu"
    ? "Recorded actions by LGU Admin accounts. This matches the System Overview activity list."
    : kind === "system"
      ? "Configuration, security, and account-access changes shown in System Overview."
      : "Recorded administrative actions, including account access changes.";

  return <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>SUPER ADMIN · SYSTEM OVERSIGHT</Text>
        <Text style={styles.title}>{viewTitle}</Text>
        <Text style={styles.subtitle}>{viewDescription}</Text>
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
        style={styles.searchInput} value={search} onChangeText={(value) => { setSearch(value); setPage(1); }}
        placeholder="Search action, account, actor or reference"
        placeholderTextColor="#94A3B8" autoCapitalize="none"
      />
    </View>
    <SuperAdminFilterSort
      accessibilityContext="audit logs"
      filterValue={kind}
      filterOptions={[
        { value: "all", label: "All activity" },
        { value: "lgu", label: "LGU Admin activity" },
        { value: "system", label: "System changes" },
        { value: "access", label: "Account access" },
      ]}
      onFilterChange={value => { setKind(value); setPage(1); }}
      sortValue={sort}
      sortOptions={[
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" },
        { value: "actor", label: "User A–Z" },
        { value: "action", label: "Action A–Z" },
      ]}
      onSortChange={value => { setSort(value); setPage(1); }}
    />
    {kind === "lgu" && adminsError ? (
      <View style={styles.error}><Text style={styles.errorText}>
        Unable to identify LGU Admin actors: {adminsError}
      </Text></View>
    ) : null}
    {Object.entries(errors).map(([source, message]) =>
      <View key={source} style={styles.error}>
        <Text style={styles.errorText}>Unable to load {source}: {message}</Text>
      </View>,
    )}
    <View style={styles.tableCard}>
      <View style={styles.tableTitleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tableTitle}>{kind === "all" ? "Administrative Activity History" : viewTitle + " History"}</Text>
          <Text style={styles.tableSubtitle}>{kind === "all" ? "Recorded actions from LGU Admins and system-access changes." : viewDescription}</Text>
        </View>
      </View>
      {!loading && (
        <ListPagination page={safePage} total={visible.length} onChange={setPage} pageSize={PAGE_SIZE} />
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tableHorizontal}
        accessibilityLabel="Administrative activity records table"
      >
        <View style={styles.tableInner}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeading, styles.dateCell]}>Date &amp; Time</Text>
            <Text style={[styles.tableHeading, styles.actorCell]}>User</Text>
            <Text style={[styles.tableHeading, styles.actionCell]}>Action</Text>
            <Text style={[styles.tableHeading, styles.detailsCell]}>Details</Text>
          </View>
          {loading ? (
            <View style={styles.emptyTable}>
              <ActivityIndicator color="#087D66" />
              <Text style={styles.emptyText}>Loading recorded activity…</Text>
            </View>
          ) : pageRows.length === 0 ? (
            <View style={styles.emptyTable}>
              <Ionicons name="document-text-outline" size={28} color="#73918A" />
              <Text style={styles.emptyText}>
                {adminsError && kind === "lgu" ? "LGU Admin actor lookup unavailable." : search ? "No matching audit events." : "No recorded events in this category yet."}
              </Text>
            </View>
          ) : pageRows.map((item, index) => {
            const isDanger = /suspend|revoke|reject|fail|deny/i.test(item.actionType);
            const isWarning = /pending|update|config|edit/i.test(item.actionType);
            return (
              <View key={item.source + ":" + item.id} style={[styles.tableRow, index % 2 === 1 && styles.alternateRow]}>
                <Text style={[styles.tableText, styles.dateCell]} numberOfLines={2}>
                  {prettyDate(item.createdAt)}
                </Text>
                <Text style={[styles.tableText, styles.actorCell]} numberOfLines={2}>
                  {item.adminName || item.adminUid || "Not recorded"}
                </Text>
                <View style={styles.actionCell}>
                  <View style={[styles.actionBadge, isDanger ? styles.actionDanger : isWarning ? styles.actionWarning : styles.actionSuccess]}>
                    <Text style={[styles.actionBadgeText, isDanger && styles.actionDangerText]} numberOfLines={2}>
                      {prettyAction(item.actionType)}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailsCell}>
                  <Text style={styles.detailText}>{item.description || "No description provided."}</Text>
                  {(item.targetType || item.targetId) ? (
                    <Text style={styles.recordMeta} selectable>
                      Target: {item.targetType || "record"}{item.targetId ? " · " + item.targetId : ""}
                    </Text>
                  ) : null}
                  <Text style={styles.recordMeta}>
                    Source: {item.source === "adminLogs" ? "System & access changes" : "LGU admin activity"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
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
  emptyText: { color: "#64748B", textAlign: "center", fontSize: 12 },
  tableCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDEAE7", borderRadius: 14, padding: 16, overflow: "hidden" },
  tableTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  tableTitle: { fontSize: 17, fontWeight: "900", color: "#17382E" },
  tableSubtitle: { fontSize: 12, color: "#81938D", lineHeight: 18, marginTop: 3 },
  tableHorizontal: { flexGrow: 1 },
  tableInner: { width: "100%", minWidth: 720 },
  tableHeader: { minHeight: 38, flexDirection: "row", alignItems: "center", backgroundColor: "#F2F6F4", paddingHorizontal: 12, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  tableHeading: { fontSize: 12, fontWeight: "900", color: "#34564B" },
  tableRow: { minHeight: 74, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#ECF1EE" },
  alternateRow: { backgroundColor: "#FBFDFC" },
  tableText: { fontSize: 12, color: "#304940", lineHeight: 18 },
  dateCell: { flex: 1.15, paddingRight: 12 },
  actorCell: { flex: 1.1, paddingRight: 12 },
  actionCell: { flex: 1.3, paddingRight: 12, alignItems: "flex-start" },
  detailsCell: { flex: 2.6, minWidth: 0 },
  actionBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, maxWidth: "100%" },
  actionSuccess: { backgroundColor: "#D6F5E7" },
  actionWarning: { backgroundColor: "#FFF0CF" },
  actionDanger: { backgroundColor: "#FCE5E3" },
  actionBadgeText: { fontSize: 11, fontWeight: "800", color: "#135F4C", lineHeight: 15 },
  actionDangerText: { color: "#9F3838" },
  detailText: { color: "#304940", fontSize: 12, lineHeight: 18 },
  recordMeta: { color: "#789086", fontSize: 10, marginTop: 4, lineHeight: 15 },
  emptyTable: { minHeight: 155, justifyContent: "center", alignItems: "center", gap: 10, padding: 20 },
});
