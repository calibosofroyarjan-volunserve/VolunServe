import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type VolunteerEligibilityRow = {
  id: string;
  name: string;
  barangay: string;
  eligible: boolean;
  reason: string;
  inCaseBarangay: boolean;
};

export function VolunteerEligibilityValidation({
  rows, loaded, failed, caseBarangay, isValidated,
}: {
  rows: VolunteerEligibilityRow[];
  loaded: boolean;
  failed?: boolean;
  caseBarangay: string;
  isValidated: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const summary = useMemo(() => ({
    total: rows.length,
    local: rows.filter((v) => v.inCaseBarangay).length,
    eligible: rows.filter((v) => v.eligible).length,
    other: rows.filter((v) => !v.inCaseBarangay).length,
    restricted: rows.filter((v) => v.inCaseBarangay && !v.eligible).length,
  }), [rows]);
  const ordered = useMemo(() => [...rows].sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) ||
    Number(b.inCaseBarangay) - Number(a.inCaseBarangay) ||
    a.name.localeCompare(b.name)), [rows]);
  const totalPages = Math.max(1, Math.ceil(ordered.length / 5));
  const currentPage = Math.min(page, totalPages);
  const visible = ordered.slice((currentPage - 1) * 5, currentPage * 5);

  return <View style={s.panel}>
    <View style={s.header}>
      <View style={s.grow}>
        <Text style={s.heading}>Volunteer Eligibility Validation</Text>
        <Text style={s.secondary}>Read-only directory of approved Volunteer applications and reasons for exclusion.</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Toggle Volunteer eligibility details"
        onPress={() => { setExpanded((value) => !value); setPage(1); }} style={s.toggle}>
        <Text style={s.toggleText}>{expanded ? "Hide validation  ↑" : "View validation  ↓"}</Text>
      </TouchableOpacity>
    </View>
    {!loaded ? <Text style={s.status}>Checking approved Volunteer applications…</Text> :
      failed ? <Text style={s.error}>Volunteer directory could not be loaded. Eligibility counts are unavailable; check Admin permissions and connection.</Text> :
      <View style={s.summary}>
        <Text style={s.summaryText}>Approved directory: <Text style={s.count}>{summary.total}</Text></Text>
        <Text style={s.summaryText}>Same barangay: <Text style={s.count}>{summary.local}</Text></Text>
        <Text style={s.summaryText}>Eligible for this case: <Text style={s.count}>{summary.eligible}</Text></Text>
        <Text style={s.summaryText}>Other barangays: <Text style={s.count}>{summary.other}</Text></Text>
      </View>}
    <Text style={s.hint}>{isValidated
      ? "Validated case. Offers can be sent only to qualified, approved Volunteers under the active dispatch rules."
      : "Report is not validated. Volunteer eligibility can be reviewed, but sending offers is locked."}</Text>
    {expanded && loaded && !failed && (
      <View style={s.list}>
        <Text style={s.section}>Eligibility results · incident barangay: {caseBarangay || "Not confirmed"}</Text>
        {ordered.length === 0
          ? <Text style={s.secondary}>There are no approved Volunteer applications available in the Admin directory. This does not prove that no users have registered.</Text>
          : visible.map((v) => (
            <View key={v.id} style={s.item}>
              <View style={s.grow}>
                <Text style={s.name}>{v.name}</Text>
                <Text style={s.secondary}>{v.barangay || "Barangay not provided"}</Text>
                <Text style={s.reason}>{v.reason}</Text>
              </View>
              <View style={[s.pill, v.eligible ? s.good : s.neutral]}>
                <Text style={[s.pillText, v.eligible ? s.goodText : s.neutralText]}>
                  {v.eligible ? "Eligible" : "Not eligible"}
                </Text>
              </View>
            </View>
          ))}
        {totalPages > 1 && <View style={s.pagination}>
          <TouchableOpacity accessibilityRole="button" disabled={currentPage === 1}
            onPress={() => setPage((value) => Math.max(1, value - 1))}>
            <Text style={[s.pageButton, currentPage === 1 && s.disabled]}>Previous</Text>
          </TouchableOpacity>
          <Text style={s.secondary}>Page {currentPage} of {totalPages}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={currentPage === totalPages}
            onPress={() => setPage((value) => Math.min(totalPages, value + 1))}>
            <Text style={[s.pageButton, currentPage === totalPages && s.disabled]}>Next</Text>
          </TouchableOpacity>
        </View>}
      </View>
    )}
  </View>;
}
const s = StyleSheet.create({
  panel: { marginTop: 12, borderWidth: 1, borderColor: "#D6E5EE", backgroundColor: "#FFFFFF", borderRadius: 13, padding: 15, gap: 10 },
  header: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 175 },
  heading: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: "#14233B" },
  secondary: { fontSize: 11, lineHeight: 16, color: "#64748B", marginTop: 3 },
  toggle: { borderRadius: 9, borderWidth: 1, borderColor: "#C4D6EE", backgroundColor: "#F2F7FF", paddingVertical: 9, paddingHorizontal: 12 },
  toggleText: { color: "#225C9C", fontSize: 11, fontWeight: "800" },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 13, backgroundColor: "#F6F9FC", padding: 12, borderRadius: 9 },
  summaryText: { fontSize: 11, color: "#52687A", fontWeight: "600" },
  count: { fontSize: 12, fontWeight: "800", color: "#123D32" },
  hint: { color: "#627489", fontSize: 11, lineHeight: 17 },
  status: { color: "#657990", fontSize: 11 },
  error: { color: "#B42318", fontSize: 11 },
  list: { borderTopWidth: 1, borderTopColor: "#E5EDF2", paddingTop: 10, gap: 8 },
  section: { fontSize: 11, fontWeight: "700", color: "#51667F" },
  item: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E6EEF3", borderRadius: 10, padding: 12 },
  name: { color: "#152B46", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  reason: { fontSize: 11, color: "#53697D", marginTop: 5, lineHeight: 16 },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16 },
  good: { backgroundColor: "#E4F5EB" }, neutral: { backgroundColor: "#F1F4F8" },
  pillText: { fontWeight: "800", fontSize: 10 },
  goodText: { color: "#087354" }, neutralText: { color: "#64748B" },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7 },
  pageButton: { color: "#205DA3", fontSize: 11, fontWeight: "800" },
  disabled: { color: "#AAB7C2" },
});
