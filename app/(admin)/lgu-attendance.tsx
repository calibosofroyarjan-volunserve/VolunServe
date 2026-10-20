import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useUserSession } from "../../lib/useUserSession";
const BACKEND_URL = "https://volunserve.onrender.com";
type Personnel = {
  uid: string;
  fullName: string;
  department: string;
  position: string;
  employeeId: string;
  isTestAccount: boolean;
  dutyStatus: string;
  availabilityStatus: string;
  activeCaseId: string;
  shiftDate: string;
  timeInAt?: string | null;
  timeOutAt?: string | null;
};
type AttendanceRecord = {
  id: string;
  uid: string;
  fullName: string;
  department: string;
  position: string;
  employeeId: string;
  email: string;
  isTestAccount: boolean;
  shiftDate: string;
  status: string;
  timeInAt: string;
  timeOutAt: string;
};
type Filter = "all" | "on_duty" | "off_duty";
const statusLabel = (value: string) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatManilaTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
};
const formatShiftDate = (value?: string) => {
  if (!value) return "—";
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return value;
  }
  const [year, month, day] = parts;
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
  } catch {
    return value;
  }
};
const durationLabel = (
  timeInAt?: string | null,
  timeOutAt?: string | null,
  status?: string
) => {
  if (!timeInAt) return "—";
  const start = new Date(timeInAt).getTime();
  if (!Number.isFinite(start)) return "—";
  if (!timeOutAt) {
    return status === "on_duty" ? "Currently On Duty" : "—";
  }
  const end = new Date(timeOutAt).getTime();
  if (!Number.isFinite(end) || end < start) return "—";
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
export default function LguAttendanceScreen() {
  const { user } = useUserSession();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [attendanceRecords, setAttendanceRecords] =
    useState<AttendanceRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (quiet = false) => {
    if (!user) return;
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken(true);
      const [personnelResponse, attendanceResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/api/admin/lgu/personnel`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BACKEND_URL}/api/admin/lgu/attendance?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const [personnelResult, attendanceResult] = await Promise.all([
        personnelResponse.json().catch(() => null),
        attendanceResponse.json().catch(() => null),
      ]);
      if (!personnelResponse.ok || !personnelResult?.ok) {
        throw new Error(
          personnelResult?.message ||
            personnelResult?.error ||
            `Personnel request failed with HTTP ${personnelResponse.status}.`
        );
      }
      if (!attendanceResponse.ok || !attendanceResult?.ok) {
        throw new Error(
          attendanceResult?.message ||
            attendanceResult?.error ||
            `Attendance request failed with HTTP ${attendanceResponse.status}.`
        );
      }
      setPersonnel(
        Array.isArray(personnelResult.personnel)
          ? personnelResult.personnel
          : []
      );
      setAttendanceRecords(
        Array.isArray(attendanceResult.records)
          ? attendanceResult.records
          : []
      );
    } catch (nextError: any) {
      setError(nextError?.message || "Unable to load LGU attendance status.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return personnel.filter((item) => {
      if (filter !== "all" && item.dutyStatus !== filter) return false;
      if (!term) return true;
      return [item.fullName, item.employeeId, item.department, item.position].join(" ").toLowerCase().includes(term);
    });
  }, [filter, personnel, search]);
  const historyRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return attendanceRecords.filter((item) => {
      if (!term) return true;
      return [
        item.fullName,
        item.employeeId,
        item.department,
        item.position,
        item.shiftDate,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [attendanceRecords, search]);
  const onDuty = personnel.filter((item) => item.dutyStatus === "on_duty").length;
  const available = personnel.filter((item) => item.availabilityStatus === "available").length;
  const busy = personnel.filter((item) => ["assigned", "responding", "on_site"].includes(item.availabilityStatus)).length;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LGU PERSONNEL</Text>
          <Text style={styles.title}>Attendance</Text>
          <Text style={styles.subtitle}>Current duty and operational availability of verified LGU Personnel. Personnel control their own Time In and Time Out from the LGU responder portal.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void load(true)} activeOpacity={0.84}>
          <Ionicons name="refresh-outline" size={17} color="#334155" />
          <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={styles.statValue}>{personnel.length}</Text><Text style={styles.statLabel}>Verified Personnel</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{onDuty}</Text><Text style={styles.statLabel}>On Duty</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{available}</Text><Text style={styles.statLabel}>Available</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{busy}</Text><Text style={styles.statLabel}>Active Response</Text></View>
      </View>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color="#94A3B8" />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search personnel or department..." placeholderTextColor="#94A3B8" style={styles.searchInput} />
        </View>
        <View style={styles.filters}>
          {(["all", "on_duty", "off_duty"] as Filter[]).map((value) => {
            const active = filter === value;
            return <TouchableOpacity key={value} style={[styles.filterButton, active && styles.filterButtonActive]} onPress={() => setFilter(value)}><Text style={[styles.filterText, active && styles.filterTextActive]}>{value === "all" ? "All" : statusLabel(value)}</Text></TouchableOpacity>;
          })}
        </View>
      </View>
      {!!error && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text></View>}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colName]}>PERSONNEL</Text>
          <Text style={[styles.th, styles.colDepartment]}>DEPARTMENT / ROLE</Text>
          <Text style={[styles.th, styles.colDuty]}>DUTY STATUS</Text>
          <Text style={[styles.th, styles.colAvailability]}>AVAILABILITY</Text>
          <Text style={[styles.th, styles.colTime]}>TIME IN</Text>
          <Text style={[styles.th, styles.colTime]}>TIME OUT</Text>
          <Text style={[styles.th, styles.colDuration]}>DURATION</Text>
          <Text style={[styles.th, styles.colCase]}>ACTIVE CASE</Text>
        </View>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator color="#0F766E" /><Text style={styles.emptyText}>Loading attendance status...</Text></View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="time-outline" size={28} color="#94A3B8" /><Text style={styles.emptyTitle}>No matching personnel</Text><Text style={styles.emptyText}>Duty status will appear here after LGU Personnel accounts are created and used.</Text></View>
        ) : rows.map((item) => (
          <View key={item.uid} style={styles.tableRow}>
            <View style={[styles.cell, styles.colName]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.fullName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "LG"}</Text></View>
              <View style={styles.nameCopy}><View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{item.fullName}</Text>{item.isTestAccount && <View style={styles.testBadge}><Text style={styles.testBadgeText}>TEST</Text></View>}</View><Text style={styles.employeeId}>{item.employeeId}</Text></View>
            </View>
            <View style={[styles.cell, styles.colDepartment]}><Text style={styles.bodyStrong}>{item.department}</Text><Text style={styles.bodyMuted}>{item.position}</Text></View>
            <View style={[styles.cell, styles.colDuty]}><View style={item.dutyStatus === "on_duty" ? styles.infoChip : styles.neutralChip}><Text style={item.dutyStatus === "on_duty" ? styles.infoChipText : styles.neutralChipText}>{statusLabel(item.dutyStatus)}</Text></View></View>
            <View style={[styles.cell, styles.colAvailability]}><View style={item.availabilityStatus === "available" ? styles.successChip : item.availabilityStatus === "unavailable" ? styles.neutralChip : styles.warningChip}><Text style={item.availabilityStatus === "available" ? styles.successChipText : item.availabilityStatus === "unavailable" ? styles.neutralChipText : styles.warningChipText}>{statusLabel(item.availabilityStatus)}</Text></View></View>
            <View style={[styles.cell, styles.colTime]}>
              <Text style={styles.bodyStrong}>
                {formatManilaTime(item.timeInAt)}
              </Text>
              <Text style={styles.bodyMuted}>
                {formatShiftDate(item.shiftDate)}
              </Text>
            </View>
            <View style={[styles.cell, styles.colTime]}>
              <Text style={styles.bodyStrong}>
                {formatManilaTime(item.timeOutAt)}
              </Text>
            </View>
            <View style={[styles.cell, styles.colDuration]}>
              <Text style={styles.bodyStrong}>
                {durationLabel(
                  item.timeInAt,
                  item.timeOutAt,
                  item.dutyStatus
                )}
              </Text>
            </View>
            <View style={[styles.cell, styles.colCase]}><Text style={item.activeCaseId ? styles.caseActive : styles.bodyMuted} numberOfLines={1}>{item.activeCaseId || "None"}</Text></View>
          </View>
        ))}
      </View>
      <View style={styles.historySection}>
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyEyebrow}>ATTENDANCE LOGS</Text>
            <Text style={styles.historyTitle}>Time In / Time Out History</Text>
            <Text style={styles.historySubtitle}>
              Server-recorded operational duty logs shown in Philippine time.
            </Text>
          </View>
          <View style={styles.historyCountChip}>
            <Text style={styles.historyCountText}>
              {historyRows.length} record{historyRows.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
        <View style={styles.historyTableCard}>
          <View style={styles.historyTableHeader}>
            <Text style={[styles.th, styles.historyColName]}>PERSONNEL</Text>
            <Text style={[styles.th, styles.historyColDate]}>DATE</Text>
            <Text style={[styles.th, styles.historyColTime]}>TIME IN</Text>
            <Text style={[styles.th, styles.historyColTime]}>TIME OUT</Text>
            <Text style={[styles.th, styles.historyColDuration]}>DURATION</Text>
            <Text style={[styles.th, styles.historyColStatus]}>STATUS</Text>
          </View>
          {historyRows.length === 0 ? (
            <View style={styles.historyEmpty}>
              <Ionicons name="calendar-outline" size={26} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No attendance logs yet</Text>
              <Text style={styles.emptyText}>
                Time In and Time Out records will appear here after LGU Personnel use the duty portal.
              </Text>
            </View>
          ) : (
            historyRows.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={[styles.cell, styles.historyColName]}>
                  <View style={styles.historyAvatar}>
                    <Text style={styles.historyAvatarText}>
                      {item.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part.charAt(0))
                        .join("")
                        .toUpperCase() || "LG"}
                    </Text>
                  </View>
                  <View style={styles.nameCopy}>
                    <View style={styles.nameLine}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.fullName}
                      </Text>
                      {item.isTestAccount && (
                        <View style={styles.testBadge}>
                          <Text style={styles.testBadgeText}>TEST</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.employeeId}>
                      {item.employeeId || item.department}
                    </Text>
                  </View>
                </View>
                <View style={[styles.cell, styles.historyColDate]}>
                  <Text style={styles.bodyStrong}>
                    {formatShiftDate(item.shiftDate)}
                  </Text>
                </View>
                <View style={[styles.cell, styles.historyColTime]}>
                  <Text style={styles.bodyStrong}>
                    {formatManilaTime(item.timeInAt)}
                  </Text>
                </View>
                <View style={[styles.cell, styles.historyColTime]}>
                  <Text style={styles.bodyStrong}>
                    {formatManilaTime(item.timeOutAt)}
                  </Text>
                </View>
                <View style={[styles.cell, styles.historyColDuration]}>
                  <Text style={styles.bodyStrong}>
                    {durationLabel(
                      item.timeInAt,
                      item.timeOutAt,
                      item.status
                    )}
                  </Text>
                </View>
                <View style={[styles.cell, styles.historyColStatus]}>
                  <View
                    style={
                      item.status === "on_duty"
                        ? styles.infoChip
                        : styles.successChip
                    }
                  >
                    <Text
                      style={
                        item.status === "on_duty"
                          ? styles.infoChipText
                          : styles.successChipText
                      }
                    >
                      {item.status === "completed"
                        ? "Completed"
                        : statusLabel(item.status)}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
      <View style={styles.noteCard}>
        <Ionicons name="information-circle-outline" size={19} color="#2563EB" />
        <Text style={styles.noteText}>LGU attendance is for official duty status. Volunteer availability remains a separate opt-in workflow and is not treated as employee attendance.</Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: 24, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 18 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#0F766E", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 4, color: "#0F172A", fontSize: 29, fontWeight: "900" },
  subtitle: { marginTop: 6, color: "#64748B", fontSize: 13.5, lineHeight: 20, maxWidth: 790 },
  refreshButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 6 },
  refreshText: { color: "#334155", fontSize: 12, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: { flex: 1, minHeight: 78, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" },
  statValue: { color: "#0F172A", fontSize: 22, fontWeight: "900" },
  statLabel: { marginTop: 4, color: "#64748B", fontSize: 11.5, fontWeight: "700" },
  toolbar: { minHeight: 58, padding: 10, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 10 },
  searchBox: { flex: 1, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC", flexDirection: "row", alignItems: "center", paddingHorizontal: 11, gap: 8 },
  searchInput: { flex: 1, color: "#0F172A", fontSize: 12.5, outlineStyle: "none" } as any,
  filters: { flexDirection: "row", gap: 6 },
  filterButton: { minHeight: 34, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  filterButtonActive: { borderColor: "#0F766E", backgroundColor: "#0F766E" },
  filterText: { color: "#475569", fontSize: 10.5, fontWeight: "900" },
  filterTextActive: { color: "#FFFFFF" },
  errorBanner: { marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { flex: 1, color: "#991B1B", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  tableCard: { borderRadius: 13, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", overflow: "hidden" },
  tableHeader: { minHeight: 42, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  tableRow: { minHeight: 66, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
  th: { color: "#7C8AA0", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6 },
  cell: { paddingRight: 10, justifyContent: "center" },
  colName: { width: "20%", flexDirection: "row", alignItems: "center" },
  colDepartment: { width: "19%" },
  colDuty: { width: "10%" },
  colAvailability: { width: "11%" },
  colTime: { width: "11%" },
  colDuration: { width: "14%" },
  colCase: { width: "15%" },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center", marginRight: 9 },
  avatarText: { color: "#1D4ED8", fontSize: 10.5, fontWeight: "900" },
  nameCopy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, color: "#0F172A", fontSize: 12.5, fontWeight: "900" },
  employeeId: { marginTop: 3, color: "#94A3B8", fontSize: 10.5 },
  testBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "#EEF2FF" },
  testBadgeText: { color: "#4F46E5", fontSize: 8.5, fontWeight: "900" },
  bodyStrong: { color: "#334155", fontSize: 11.5, fontWeight: "800" },
  bodyMuted: { marginTop: 3, color: "#94A3B8", fontSize: 10.5 },
  caseActive: { color: "#C2410C", fontSize: 10.5, fontWeight: "900" },
  successChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#ECFDF5" },
  successChipText: { color: "#047857", fontSize: 9.5, fontWeight: "900" },
  infoChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#EFF6FF" },
  infoChipText: { color: "#1D4ED8", fontSize: 9.5, fontWeight: "900" },
  neutralChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F1F5F9" },
  neutralChipText: { color: "#64748B", fontSize: 9.5, fontWeight: "900" },
  warningChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFF7ED" },
  warningChipText: { color: "#C2410C", fontSize: 9.5, fontWeight: "900" },
  emptyState: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 8, color: "#334155", fontSize: 14, fontWeight: "900" },
  emptyText: { marginTop: 6, color: "#94A3B8", fontSize: 12, textAlign: "center" },
  historySection: {
    marginTop: 18,
  },
  historyHeader: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  historyEyebrow: {
    color: "#0F766E",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  historyTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  historySubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11.5,
    lineHeight: 17,
  },
  historyCountChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  historyCountText: {
    color: "#047857",
    fontSize: 10,
    fontWeight: "900",
  },
  historyTableCard: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  historyTableHeader: {
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  historyRow: {
    minHeight: 64,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  historyColName: {
    width: "28%",
    flexDirection: "row",
    alignItems: "center",
  },
  historyColDate: {
    width: "18%",
  },
  historyColTime: {
    width: "14%",
  },
  historyColDuration: {
    width: "14%",
  },
  historyColStatus: {
    width: "12%",
  },
  historyAvatar: {
    width: 30,
    height: 30,
    marginRight: 8,
    borderRadius: 15,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  historyAvatarText: {
    color: "#0369A1",
    fontSize: 9.5,
    fontWeight: "900",
  },
  historyEmpty: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  noteCard: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noteText: { flex: 1, color: "#1E40AF", fontSize: 11.5, lineHeight: 17, fontWeight: "600" },
});
