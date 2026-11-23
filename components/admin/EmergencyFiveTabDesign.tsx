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
function Heading({ icon, title, sub, level = "card" }: {
  icon: string; title: string; sub?: string; level?: "page" | "card";
}) {
  return <View style={styles.headingRow}>
    <Text style={[styles.headingIcon, level === "page" && styles.headingIconPage]}>{icon}</Text>
    <View style={styles.headingBody}>
      <Text style={[styles.headingText, level === "page" && styles.headingTextPage]}>{title}</Text>
      {!!sub && <Text style={styles.muted}>{sub}</Text>}
    </View>
  </View>;
}
function RowField({ label, value }: { label: string; value: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue}>{value}</Text></View>;
}
function Action({ label, onPress, kind = "primary" }: {
  label: string; onPress: () => void; kind?: "primary" | "outline" | "danger";
}) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress}
    style={[styles.action, kind === "primary" ? styles.actionPrimary :
      kind === "danger" ? styles.actionDanger : styles.actionOutline]}>
    <Text style={kind === "outline" ? styles.actionOutlineText : styles.actionPrimaryText}>{label}</Text>
  </TouchableOpacity>;
}

export function EmergencyMapButton({ onPress }: { onPress: () => void }) {
  return <Action label="⌖  Open Emergency Response Map  ›" kind="danger" onPress={onPress} />;
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
    <Heading level="page" icon="▦" title="Incident overview" sub="The essentials, organized exactly where an Admin expects them." />
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
    <Heading level="page" icon="◈" title="Case Status" sub="Current verification, coordination and progress of this emergency report." />
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
    <Heading level="page" icon="◷" title="Emergency Activity Timeline" sub="Real recorded case and Volunteer activity, without invented events or timestamps." />
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


export function ReferenceVolunteerMatching({ incident, verificationStatus, caseBarangay,
  eligibleCount, activeAssignments, autoDispatch, onCancelAssignment }: {
  incident: AdminCaseView;
  verificationStatus: string;
  caseBarangay: string;
  eligibleCount: number;
  activeAssignments: AdminAssignmentView[];
  autoDispatch?: { state?: string; wave?: number; note?: string; attemptedCount?: number };
  onCancelAssignment?: (assignment: AdminAssignmentView) => void;
}) {
  const ready = verificationStatus === "validated" &&
    ["validated", "assigned", "in_progress"].includes(incident.status);
  const taskStatus = responseLabel(activeAssignments);
  const autoState = String(autoDispatch?.state || "");
  const activeWave = Number(autoDispatch?.wave || 0);
  const autoRunning = ["ready", "waiting", "accepted"].includes(autoState);
  const summary = autoState === "waiting"
    ? `Automatic Wave ${activeWave} — offer sent; awaiting Volunteer acceptance`
    : autoState === "accepted" ? "Volunteer accepted the automatic offer"
    : autoState === "needs_admin" ? "Automatic matching paused — Admin review required"
    : autoState === "ready" ? "Checking the next qualified Volunteer automatically"
    : "Automatic matching is not active for this case.";
  return <View style={styles.page}>
    <View style={styles.matchHeading}>
      <View style={styles.grow}>
        <Heading level="page" icon="♧" title="Volunteer Assignment" sub="Location-first response coordination with qualification and acceptance checks." />
      </View>
      <View style={styles.matchBanner}>
        <Text style={styles.matchBannerTitle}>◇ Three-wave automatic matching</Text>
        <Text style={styles.matchBannerSub}>
          {autoState ? summary : ready
            ? "Automatic matching has not been started for this case. Existing manual offers remain available."
            : "Admin validation is required before any Volunteer offer can be sent."}
        </Text>
      </View>
    </View>
    <View style={styles.kpiRow}>
      <View style={[styles.kpi, styles.greenTint]}>
        <Text style={styles.kpiIcon}>♧</Text>
        <Text style={styles.kpiTitle}>Eligible local volunteers</Text>
        <Text style={styles.kpiValue}>{ready ? String(eligibleCount) : "—"}</Text>
        <Text style={styles.kpiDesc}>{ready ? "Approved, currently eligible in the incident barangay" : "Visible after report verification"}</Text>
      </View>
      <View style={styles.kpi}>
        <Text style={styles.kpiIcon}>⌖</Text>
        <Text style={styles.kpiTitle}>Case Barangay</Text>
        <Text style={styles.kpiValue}>{caseBarangay || "Location needs review"}</Text>
        <Text style={styles.kpiDesc}>City of San Jose del Monte, Bulacan</Text>
      </View>
      <View style={styles.kpi}>
        <Text style={styles.kpiIcon}>▱</Text>
        <Text style={styles.kpiTitle}>Assignment plan</Text>
        <Text style={styles.kpiValue}>3 waves</Text>
        <Text style={styles.kpiDesc}>Same barangay → nearby → SJDM citywide</Text>
      </View>
      <View style={[styles.kpi, styles.goldTint]}>
        <Text style={styles.kpiIcon}>◉</Text>
        <Text style={styles.kpiTitle}>Actual assignment</Text>
        <Text style={styles.kpiValue}>{taskStatus}</Text>
        <Text style={styles.kpiDesc}>Based on saved task records, not an automatic-notification claim</Text>
      </View>
    </View>
    <Card>
      <Heading icon="▤" title="Matching Waves" sub={autoRunning
        ? "This information comes from the saved server-side matching state. Volunteers must accept offers."
        : "Server-side matching requires activation and verified nearby barangay mapping."} />
      <View style={styles.waveRow}>
        {[
          ["01", "Same Barangay", caseBarangay || "Incident barangay",
            autoRunning && activeWave === 1 ? summary : "First matching group"],
          ["02", "Nearby Barangays", "Verified adjacent SJDM areas",
            autoRunning && activeWave === 2 ? summary : "Requires verified adjacency"],
          ["03", "SJDM Citywide", "Other SJDM barangays",
            autoRunning && activeWave === 3 ? summary : "After earlier qualified waves"],
        ].map(([n, title, area, status]) =>
          <View key={n} style={styles.waveTile}>
            <Text style={styles.waveNumber}>{n}</Text>
            <Text style={styles.waveTitle}>{title}</Text>
            <Text style={styles.muted}>{area}</Text>
            <Text style={styles.waveState}>{ready ? status : "Awaiting validation"}</Text>
          </View>)}
      </View>
    </Card>
    <Card>
      <Heading icon="♧" title="Volunteer Task Status" />
      {activeAssignments.length === 0
        ? <View style={styles.assignedEmpty}>
            <Text style={styles.assignedEmptyIcon}>♧</Text>
            <Text style={styles.emptyTitle}>
              {!ready ? "Awaiting Admin validation" :
                autoState === "needs_admin" ? "Admin review required" :
                autoState === "ready" ? "Finding the next qualified Volunteer" :
                eligibleCount === 0 ? "No eligible local Volunteers found" :
                "No Volunteer assigned yet"}
            </Text>
            <Text style={styles.muted}>
              {!ready
                ? "Validate the case before sending a Volunteer task offer."
                : autoState === "needs_admin"
                  ? "Review the matching status and contact official emergency services immediately when needed."
                  : autoRunning
                    ? summary
                    : eligibleCount === 0
                      ? "No approved local Volunteers match this incident barangay. Check eligibility validation and official emergency escalation."
                      : "Qualified local Volunteers are available. An offer requires Volunteer acceptance before the response begins."}
            </Text>
          </View>
        : activeAssignments.map((x) =>
            <View key={x.id} style={styles.assignedRow}>
              <View style={styles.volAvatar}><Text style={styles.volAvatarText}>
                {(x.volunteerName || "V").slice(0, 1).toUpperCase()}
              </Text></View>
              <View style={styles.grow}>
                <Text style={styles.personName}>{x.volunteerName || "Volunteer"}</Text>
                <Text style={styles.muted}>Task status: {cap(x.status)}</Text>
              </View>
              {onCancelAssignment && x.status !== "completed" && (
                <Action kind="outline" label="Cancel offer" onPress={() => onCancelAssignment(x)} />
              )}
            </View>)}
    </Card>
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
  headingIcon: { color: COLOR.blue, fontSize: 17, fontWeight: "700", minWidth: 21 },
  headingIconPage: { fontSize: 20, minWidth: 24 },
  headingText: { color: COLOR.navy, fontWeight: "800", fontSize: 14, lineHeight: 20 },
  headingTextPage: { fontSize: 18, lineHeight: 26 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: COLOR.navy, textAlign: "center" },
  muted: { color: COLOR.mute, fontSize: 11, lineHeight: 17, marginTop: 3 },
  field: { marginTop: 3, gap: 3 },
  fieldLabel: { fontWeight: "700", color: "#536B6A", fontSize: 10, letterSpacing: 0.35 },
  fieldValue: { fontSize: 12, color: COLOR.navy, fontWeight: "500", lineHeight: 19 },
  personName: { fontSize: 14, fontWeight: "800", color: COLOR.deep },
  verified: { alignSelf: "flex-start", color: COLOR.green, fontSize: 10, fontWeight: "800", paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20, backgroundColor: "#E6F6EC" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 4 },
  chip: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: "#EDF3FC" },
  chipText: { color: "#294E7A", fontWeight: "700", fontSize: 11 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  summaryCell: { flexGrow: 1, flexBasis: 130, minWidth: 120, borderRightWidth: 1, borderRightColor: "#E9EFF0", paddingRight: 8 },
  summaryAction: { flexGrow: 1, flexBasis: 220 },
  action: { minHeight: 40, borderRadius: 9, justifyContent: "center", alignItems: "center", paddingHorizontal: 13, paddingVertical: 9 },
  actionPrimary: { backgroundColor: COLOR.blue },
  actionDanger: { backgroundColor: COLOR.red },
  actionOutline: { backgroundColor: "#F3F9FF", borderColor: "#C9DDF4", borderWidth: 1 },
  actionPrimaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12, lineHeight: 17 },
  actionOutlineText: { color: "#1857A8", fontWeight: "800", fontSize: 12, lineHeight: 17 },
  smallFinePrint: { color: "#7C8C98", fontSize: 10, marginTop: 3 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpi: { flexBasis: 160, flexGrow: 1, minWidth: 155, borderWidth: 1, borderColor: "#DBE5ED", borderRadius: 12, padding: 14, gap: 6 },
  blueTint: { backgroundColor: "#F0F6FF" },

  greenTint: { backgroundColor: "#EDF9F3" },
  matchHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 13 },
  matchBanner: { backgroundColor: "#F0F6FF", borderColor: "#D5E5FD", borderWidth: 1, borderRadius: 12,
    padding: 13, flexGrow: 1, flexBasis: 250 },
  matchBannerTitle: { color: "#174D9A", fontWeight: "900", fontSize: 12 },
  matchBannerSub: { color: "#546C8F", fontSize: 10, lineHeight: 16, marginTop: 4 },
  waveRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  waveTile: { flexBasis: 170, minWidth: 140, flexGrow: 1, borderRadius: 10,
    borderWidth: 1, borderColor: "#E4EBF4", backgroundColor: "#FAFCFF", padding: 13, gap: 4 },
  waveNumber: { color: "#1E64B6", fontSize: 10, fontWeight: "900" },
  waveTitle: { color: COLOR.navy, fontSize: 12, fontWeight: "800" },
  waveState: { color: COLOR.orange, fontSize: 10, fontWeight: "800", marginTop: 8 },
  assignedEmpty: { minHeight: 155, alignItems: "center", justifyContent: "center",
    gap: 6, paddingHorizontal: 18, backgroundColor: "#F8FBFF", borderRadius: 11 },
  assignedEmptyIcon: { color: "#3C7FD7", fontSize: 28 },
  assignedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#E9EFF5" },
  volAvatar: { width: 33, height: 33, borderRadius: 33, backgroundColor: "#E5EDFF",
    justifyContent: "center", alignItems: "center" },
  volAvatarText: { color: "#205BB4", fontWeight: "900" },

  goldTint: { backgroundColor: "#FFFAF0" },
  redTint: { backgroundColor: "#FFF4F3" },
  kpiIcon: { color: COLOR.blue, fontSize: 21, fontWeight: "900" },
  kpiTitle: { color: COLOR.navy, fontSize: 11, fontWeight: "700" },
  kpiValue: { color: COLOR.navy, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  kpiDesc: { color: COLOR.mute, fontSize: 11, lineHeight: 16 },
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
  cardSectionTitle: { fontSize: 14, color: COLOR.navy, fontWeight: "800" },
  timelineRow: { flexDirection: "row", gap: 12, minHeight: 72 },
  timelineRail: { width: 22, alignItems: "center" },
  timelineDot: { width: 19, height: 19, borderRadius: 99, backgroundColor: COLOR.blue, borderWidth: 4, borderColor: "#DDEAFD" },
  timelineNewest: { backgroundColor: COLOR.green, borderColor: "#DAF3E7" },
  timelineConnector: { width: 2, flexGrow: 1, backgroundColor: "#D7E5F3", marginTop: 4 },
  timelineBody: { flex: 1, paddingBottom: 10 },
  timelineTitle: { fontSize: 12, color: COLOR.navy, fontWeight: "800" },
  timeStamp: { fontSize: 10, marginTop: 6, fontWeight: "700", color: "#586E8B" },
  summarySide: { flexBasis: 235, flexGrow: 1, minWidth: 220, gap: 12 },
});