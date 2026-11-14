import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const COLOR = {
  green: "#08775C", deep: "#103D32", navy: "#14233B",
  blue: "#2463CF", light: "#F6F9FC", border: "#DCE7E4",
  mute: "#64748B", red: "#B42318", orange: "#B7791F",
};

export interface AdminCaseView {
  id: string;
  title: string;
  status: string;
  severity: string;
  verificationStatus?: string;
  reporterName: string;
  reporterEmail?: string;
  reporterBarangay?: string;
  reporterAddress?: string;
  contactNumber?: string;
  incidentBarangay?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  details: string;
  affectedPeople?: number;
  assistanceTypes?: string[];
  needs?: string;
  verification?: { identityVerified?: boolean };
  adminNote?: string;
  createdAt?: any;
  validatedAt?: any;
  assignedAt?: any;
  resolvedAt?: any;
  closedAt?: any;
  rejectedAt?: any;
  evidenceRequestedAt?: any;
  officialLguResponseStatus?: string;
}

export interface AdminAssignmentView {
  id: string;
  volunteerId?: string;
  volunteerName?: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
}

type Basics = {
  incident: AdminCaseView;
  verificationStatus: string;
  statusText: string;
  severityText: string;
  activeAssignments: AdminAssignmentView[];
  onEvidence: () => void;
  onMap: () => void;
};

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
function Heading({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return <View style={styles.headingRow}>
    <Text style={styles.headingIcon}>{icon}</Text>
    <View style={styles.headingBody}>
      <Text style={styles.headingText}>{title}</Text>
      {!!sub && <Text style={styles.muted}>{sub}</Text>}
    </View>
  </View>;
}
function RowField({ label, value }: { label: string; value: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue}>{value}</Text></View>;
}
function Action({ label, onPress, kind = "primary" }: { label: string; onPress: () => void; kind?: "primary" | "outline" }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress}
    style={[styles.action, kind === "primary" ? styles.actionPrimary : styles.actionOutline]}>
    <Text style={kind === "primary" ? styles.actionPrimaryText : styles.actionOutlineText}>{label}</Text>
  </TouchableOpacity>;
}
function cap(t: string): string { return t.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()); }
function responseLabel(assignments: AdminAssignmentView[]): string {
  if (assignments.some((a) => ["responding", "on_site"].includes(a.status))) return "Response in progress";
  if (assignments.some((a) => a.status === "accepted")) return "Volunteer accepted";
  if (assignments.some((a) => a.status === "offered")) return "Offer pending acceptance";
  return "No active Volunteer task";
}
function validCoord(n: unknown): n is number { return typeof n === "number" && Number.isFinite(n); }

export function ReferenceOverview({ incident, verificationStatus, statusText, severityText, activeAssignments, onMap }: Basics) {
  return <View style={styles.page}>
    <Heading icon="▦" title="Incident overview" sub="The essentials, organized exactly where an Admin expects them." />
    <View style={styles.twoColumn}>
      <Card style={styles.grow}>
        <Heading icon="▤" title="Incident Summary" />
        <RowField label="Description" value={incident.details || "No description recorded"} />
        <Text style={styles.fieldLabel}>Assistance needed</Text>
        <View style={styles.chipRow}>{(incident.assistanceTypes || []).length > 0
          ? (incident.assistanceTypes || []).slice(0, 5).map((x, i) =>
              <View key={x + i} style={styles.chip}><Text style={styles.chipText}>{x}</Text></View>)
          : <Text style={styles.fieldValue}>{incident.needs || "Not specified"}</Text>}
        </View>
        <RowField label="People affected" value={String(incident.affectedPeople || 0)} />
      </Card>
      <Card style={styles.grow}>
        <Heading icon="♙" title="Resident Information" />
        <Text style={styles.personName}>{incident.reporterName || "Resident"}</Text>
        <Text style={styles.verified}>{incident.verification?.identityVerified ? "✓ Verified Resident" : "Resident account"}</Text>
        <RowField label="Contact number" value={incident.contactNumber || "Not provided"} />
        <RowField label="Email address" value={incident.reporterEmail || "Not provided"} />
        <RowField label="Account barangay" value={incident.reporterBarangay || incident.reporterAddress || "Not provided"} />
      </Card>
    </View>
    <Card>
      <Heading icon="◈" title="Case Status & Response" />
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}><RowField label="Current status" value={statusText} /></View>
        <View style={styles.summaryCell}><RowField label="Final severity" value={severityText} /></View>
        <View style={styles.summaryCell}><RowField label="Volunteer coordination" value={responseLabel(activeAssignments)} /></View>
        <View style={styles.summaryAction}><Action label="⌖  Open Emergency Response Map  ›" onPress={onMap} /></View>
      </View>
      <Text style={styles.smallFinePrint}>Exact incident GPS and personal details remain visible only to authorized users.</Text>
    </Card>
  </View>;
}

export function ReferenceStatus({ incident, verificationStatus, statusText, activeAssignments, onEvidence, onAssignment }: Basics & { onAssignment: () => void }) {
  const validated = verificationStatus === "validated";
  const cards = [
    { title: "Current Status", value: statusText, sub: "Current saved case stage", tint: styles.blueTint, icon: "▤" },
    { title: "Verification Status", value: cap(verificationStatus), sub: validated ? "Verified by Admin" : "Awaiting evidence review or decision", tint: styles.goldTint, icon: "◇" },
    { title: "Volunteer Dispatch Status", value: responseLabel(activeAssignments), sub: validated ? "See actual task offers and responses" : "Available after report validation", tint: styles.blueTint, icon: "♧" },
    { title: "Escalation Status", value: incident.officialLguResponseStatus ? cap(incident.officialLguResponseStatus) : "Not recorded", sub: "Critical incidents: contact official services immediately", tint: styles.redTint, icon: "⚑" },
  ];
  return <View style={styles.page}>
    <Heading icon="◈" title="Case Status" sub="Current verification, coordination and progress of this emergency report." />
    <View style={styles.kpiRow}>{cards.map((x) =>
      <View key={x.title} style={[styles.kpi, x.tint]}>
        <Text style={styles.kpiIcon}>{x.icon}</Text>
        <Text style={styles.kpiTitle}>{x.title}</Text>
        <Text style={styles.kpiValue}>{x.value}</Text>
        <Text style={styles.kpiDesc}>{x.sub}</Text>
      </View>)}
    </View>
    <View style={[styles.lockStrip, validated ? styles.readyStrip : styles.redStrip]}>
      <Text style={styles.lockIcon}>{validated ? "✓" : "♙"}</Text>
      <View style={styles.grow}>
        <Text style={styles.lockTitle}>{validated ? "Report validated — coordination available" : "Response controls locked"}</Text>
        <Text style={styles.lockDescription}>{validated
          ? "Review actual Volunteer offers and response status. Critical cases still require official emergency escalation."
          : "Validate this report first before offering Volunteer tasks."}</Text>
      </View>
      <Action label={validated ? "View Volunteer Assignment  ›" : "Go to Evidence Review  ›"} onPress={validated ? onAssignment : onEvidence} />
    </View>
    <Card>
      <Heading icon="◉" title="Case Progress" sub="Stages are based on actual saved case status; future stages are not completed yet." />
      <View style={styles.stageLine}>
        {[
          ["reported", "Reported"], ["validated", "Validated"], ["assigned", "Volunteer Offer"],
          ["in_progress", "In Progress"], ["resolved", "Resolved"], ["closed", "Closed"],
        ].map(([key, label], i, arr) => {
          const order = ["reported","validated","assigned","in_progress","resolved","closed"];
          const at = Math.max(0, order.indexOf(incident.status));
          return <View key={key} style={styles.stage}>
            <Text style={[styles.stageDot, i <= at && styles.stageDotActive]}>{i < at ? "✓" : String(i + 1)}</Text>
            <Text style={[styles.stageLabel, i <= at && styles.stageLabelActive]}>{label}</Text>
            <Text style={styles.stageFine}>{i < at ? "Completed" : i === at ? "Current stage" : "Pending"}</Text>
          </View>;
        })}
      </View>
    </Card>
    <Card>
      <Heading icon="▣" title="Latest Admin Note" />
      <Text style={styles.fieldValue}>{incident.adminNote?.trim() || "No Admin note has been recorded for this case."}</Text>
    </Card>
  </View>;
}

export function ReferenceHistory({ incident, assignments, formatDate }: {
  incident: AdminCaseView; assignments: AdminAssignmentView[]; formatDate: (time: any) => string;
}) {
  const events: { key: string; title: string; when: any; detail: string }[] = [
    { key: "submitted", title: "Report submitted", when: incident.createdAt, detail: "Resident submitted an Emergency Report." },
    { key: "evidence", title: "Additional evidence requested", when: incident.evidenceRequestedAt, detail: "Admin requested more evidence from the Resident." },
    { key: "validated", title: "Report validated", when: incident.validatedAt, detail: "Admin validated the reported incident." },
    { key: "rejected", title: "Report rejected", when: incident.rejectedAt, detail: "Admin rejected the report; dispatch is blocked." },
    { key: "assigned", title: "Volunteer response offered", when: incident.assignedAt, detail: "The case has a recorded response assignment." },
    { key: "resolved", title: "Case resolved", when: incident.resolvedAt, detail: "Response marked resolved." },
    { key: "closed", title: "Case closed", when: incident.closedAt, detail: "Case marked closed." },
  ].filter((item) => item.when);
  const assignmentHistory = assignments.map((item) => ({
    title: (item.volunteerName || "Volunteer") + " — " + cap(item.status),
    when: item.updatedAt || item.createdAt,
    detail: "Recorded Volunteer task status.",
    key: item.id,
  })).filter((item) => item.when);
  const all = [...events, ...assignmentHistory].sort((a, b) => {
    const millis = (x: any) => x?.toMillis?.() || (x?.seconds ? x.seconds * 1000 : (new Date(x || 0).getTime() || 0));
    return millis(a.when) - millis(b.when);
  });
  return <View style={styles.page}>
    <Heading icon="◷" title="Emergency Activity Timeline" sub="Real recorded case and Volunteer activity, without invented events or timestamps." />
    <View style={styles.twoColumn}>
      <Card style={[styles.grow, { flexGrow: 2 }]}>
        <Text style={styles.cardSectionTitle}>Case history</Text>
        {all.length === 0 ? <Text style={styles.muted}>No recorded timeline entries yet.</Text>
          : all.map((event, index) => <View key={event.key + index} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, index === all.length - 1 && styles.timelineNewest]} />
                {index !== all.length - 1 && <View style={styles.timelineConnector} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                <Text style={styles.muted}>{event.detail}</Text>
                <Text style={styles.timeStamp}>{formatDate(event.when)}</Text>
              </View>
            </View>)}
      </Card>
      <View style={styles.summarySide}>
        <Card>
          <Heading icon="▤" title="Case Summary" />
          <RowField label="Current status" value={cap(incident.status)} />
          <RowField label="Final severity" value={cap(incident.severity)} />
          <RowField label="Assigned/Offered Volunteer tasks" value={String(assignments.length)} />
          <RowField label="Resolution time" value={incident.resolvedAt ? formatDate(incident.resolvedAt) : "Not resolved"} />
        </Card>
        <Card style={styles.blueTint}>
          <Heading icon="ⓘ" title="Timeline Information" />
          <Text style={styles.muted}>Only recorded events are displayed. More steps appear after the Admin or Volunteer completes them.</Text>
        </Card>
      </View>
    </View>
  </View>;
}

export const referencePalette = COLOR;
const styles = StyleSheet.create({
  page: { padding: 18, gap: 13, backgroundColor: "#FBFDFC" },
  card: { borderWidth: 1, borderColor: COLOR.border, borderRadius: 13, backgroundColor: "#FFFFFF", padding: 16, gap: 9 },
  grow: { flexGrow: 1, flexBasis: 250, minWidth: 210 },
  twoColumn: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 12 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  headingBody: { flex: 1 },
  headingIcon: { color: COLOR.blue, fontSize: 21, fontWeight: "800", minWidth: 23 },
  headingText: { color: COLOR.navy, fontWeight: "900", fontSize: 18 },
  muted: { color: COLOR.mute, fontSize: 11, lineHeight: 17, marginTop: 3 },
  field: { marginTop: 3, gap: 3 },
  fieldLabel: { fontWeight: "800", color: "#536B6A", fontSize: 10, letterSpacing: 0.35 },
  fieldValue: { fontSize: 12.5, color: COLOR.navy, fontWeight: "600", lineHeight: 19 },
  personName: { fontSize: 14, fontWeight: "900", color: COLOR.deep },
  verified: { alignSelf: "flex-start", color: COLOR.green, fontSize: 10, fontWeight: "800", paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20, backgroundColor: "#E6F6EC" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 4 },
  chip: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: "#EDF3FC" },
  chipText: { color: "#294E7A", fontWeight: "700", fontSize: 11 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  summaryCell: { flexGrow: 1, flexBasis: 130, minWidth: 120, borderRightWidth: 1, borderRightColor: "#E9EFF0", paddingRight: 8 },
  summaryAction: { flexGrow: 1, flexBasis: 220 },
  action: { minHeight: 40, borderRadius: 9, justifyContent: "center", alignItems: "center", paddingHorizontal: 13, paddingVertical: 9 },
  actionPrimary: { backgroundColor: COLOR.blue },
  actionOutline: { backgroundColor: "#F3F9FF", borderColor: "#C9DDF4", borderWidth: 1 },
  actionPrimaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 11 },
  actionOutlineText: { color: "#1857A8", fontWeight: "900", fontSize: 11 },
  smallFinePrint: { color: "#7C8C98", fontSize: 10, marginTop: 3 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpi: { flexBasis: 160, flexGrow: 1, minWidth: 155, borderWidth: 1, borderColor: "#DBE5ED", borderRadius: 12, padding: 14, gap: 6 },
  blueTint: { backgroundColor: "#F0F6FF" },
  goldTint: { backgroundColor: "#FFFAF0" },
  redTint: { backgroundColor: "#FFF4F3" },
  kpiIcon: { color: COLOR.blue, fontSize: 21, fontWeight: "900" },
  kpiTitle: { color: COLOR.navy, fontSize: 11, fontWeight: "900" },
  kpiValue: { color: COLOR.navy, fontSize: 15, fontWeight: "900" },
  kpiDesc: { color: COLOR.mute, fontSize: 10, lineHeight: 15 },
  lockStrip: { flexDirection: "row", flexWrap: "wrap", gap: 13, alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 13 },
  redStrip: { borderColor: "#EEB6B3", backgroundColor: "#FFF5F4" },
  readyStrip: { borderColor: "#ACDFC3", backgroundColor: "#F1FCF5" },
  lockIcon: { color: COLOR.red, fontSize: 19, fontWeight: "900" },
  lockTitle: { fontSize: 14, fontWeight: "900", color: COLOR.navy },
  lockDescription: { color: COLOR.mute, fontSize: 11, marginTop: 3 },
  stageLine: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  stage: { flexGrow: 1, flexBasis: 85, minWidth: 84, gap: 4, alignItems: "center" },
  stageDot: { width: 29, height: 29, overflow: "hidden", borderRadius: 99, backgroundColor: "#EFF3F7", textAlign: "center", textAlignVertical: "center", lineHeight: 29, color: "#667D8F", fontWeight: "900" },
  stageDotActive: { backgroundColor: "#0C8B68", color: "#FFFFFF" },
  stageLabel: { fontSize: 10, fontWeight: "700", color: "#718096", textAlign: "center" },
  stageLabelActive: { color: COLOR.deep },
  stageFine: { fontSize: 9, color: "#94A3B8", textAlign: "center" },
  cardSectionTitle: { fontSize: 13, color: COLOR.navy, fontWeight: "900" },
  timelineRow: { flexDirection: "row", gap: 12, minHeight: 72 },
  timelineRail: { width: 22, alignItems: "center" },
  timelineDot: { width: 19, height: 19, borderRadius: 99, backgroundColor: COLOR.blue, borderWidth: 4, borderColor: "#DDEAFD" },
  timelineNewest: { backgroundColor: COLOR.green, borderColor: "#DAF3E7" },
  timelineConnector: { width: 2, flexGrow: 1, backgroundColor: "#D7E5F3", marginTop: 4 },
  timelineBody: { flex: 1, paddingBottom: 10 },
  timelineTitle: { fontSize: 12, color: COLOR.navy, fontWeight: "900" },
  timeStamp: { fontSize: 10, marginTop: 6, fontWeight: "700", color: "#586E8B" },
  summarySide: { flexBasis: 235, flexGrow: 1, minWidth: 220, gap: 12 },
});