import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type VerifiedContribution = {
  id: string;
  volunteerId?: string;
  status?: string;
  outcome?: string;
  contributionType?: string;
  contributionSummary?: string;
  completionNotes?: string;
  peopleHelped?: number;
  responseStartedAt?: unknown;
  completedAt?: unknown;
  verifiedAt?: unknown;
};

type CommunityParticipation = {
  id: string;
  uid?: string;
  eventId?: string;
  status?: string;
  attendanceVerified?: boolean;
  checkedInAt?: unknown;
  checkedOutAt?: unknown;
  attendanceVerifiedAt?: unknown;
};

type CommunityEvent = {
  id: string;
  title?: string;
  category?: string;
  date?: string;
  location?: string;
  barangay?: string;
  status?: string;
  publicationStatus?: string;
};

type CertificateRecord = {
  id: string;
  certificateId?: string;
  userId?: string;
  certificateType?: string;
  eventId?: string;
  eventTitle?: string;
  verifiedServiceMinutes?: number;
  verificationStatus?: string;
  issuedAt?: unknown;
  createdAt?: unknown;
};

type Source = "contributions" | "participations" | "events" | "certificates";
type LoadFlags = Record<Source, boolean>;
type SourceErrors = Partial<Record<Source, string>>;

type EventProgress = {
  participation: CommunityParticipation;
  event: CommunityEvent;
  verifiedMinutes: number;
  completedAndVerified: boolean;
  hasIssuedCertificate: boolean;
};

const GREEN = "#078F82";
const NAVY = "#102D48";
const MUTED = "#668094";
const BORDER = "#DDE9E7";
const EMPTY_LOADING: LoadFlags = {
  contributions: true,
  participations: true,
  events: true,
  certificates: true,
};
const FINISHED_LOADING: LoadFlags = {
  contributions: false,
  participations: false,
  events: false,
  certificates: false,
};

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// This is the same whole-minute rule as the Community Event certificate
// backend. Never round a 29m 30s attendance up to 30 minutes.
function verifiedEventMinutes(participation: CommunityParticipation): number {
  if (participation.status !== "joined" || participation.attendanceVerified !== true) return 0;
  const timeIn = toMillis(participation.checkedInAt);
  const timeOut = toMillis(participation.checkedOutAt);
  const span = timeOut - timeIn;
  if (!timeIn || !timeOut || span < 0 || span > 24 * 60 * 60 * 1000) return 0;
  return Math.floor(span / 60000);
}

// Preserve the original emergency contribution calculation and its 24h cap.
function verifiedEmergencyMinutes(contribution: VerifiedContribution): number {
  const start = toMillis(contribution.responseStartedAt);
  const end = toMillis(contribution.completedAt);
  if (!start || !end || end < start) return 0;
  return Math.min(24 * 60, Math.max(0, Math.round((end - start) / 60000)));
}

function nonnegativeInteger(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function formatDuration(totalMinutes: number): string {
  const minutes = nonnegativeInteger(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDate(value: unknown): string {
  const milliseconds = toMillis(value);
  if (!milliseconds) return "Not recorded";
  return new Date(milliseconds).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatEventDate(value?: string): string {
  if (!value) return "Date not recorded";
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return value;
  const date = new Date(+parts[1], +parts[2] - 1, +parts[3]);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-PH", {month: "short", day: "numeric", year: "numeric"})
    : value;
}

function sourceErrorText(source: Source, problem: unknown): string {
  console.error(`My Progress ${source} listener failed:`, problem);
  const code = (problem as {code?: string})?.code;
  return code === "permission-denied"
    ? `${source}: Firestore permission denied. Check your existing rules and account access.`
    : `${source}: could not load live records. Please check your connection.`;
}

function HeaderIcon({name, tint = GREEN}: {name: React.ComponentProps<typeof Ionicons>["name"]; tint?: string}) {
  return (
    <View style={styles.sectionIcon}>
      <Ionicons name={name} size={20} color={tint} />
    </View>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  icon,
  tint,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, {backgroundColor: tint === GREEN ? "#E5F7F2" : tint === "#2479C6" ? "#E9F3FE" : tint === "#C28A1A" ? "#FFF6DD" : "#F0EDFB"}]}>
        <Ionicons name={icon} size={23} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statHint}>{subtitle}</Text>
    </View>
  );
}

function SectionHeading({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <HeaderIcon name={icon} />
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {action}
    </View>
  );
}

function StatusPill({
  label,
  kind,
}: {
  label: string;
  kind: "good" | "waiting" | "neutral";
}) {
  return (
    <View style={[
      styles.pill,
      kind === "good" ? styles.pillGood : kind === "waiting" ? styles.pillWaiting : styles.pillNeutral,
    ]}>
      <Text style={[
        styles.pillText,
        kind === "good" ? styles.pillTextGood : kind === "waiting" ? styles.pillTextWaiting : styles.pillTextNeutral,
      ]}>{label}</Text>
    </View>
  );
}

export default function VolunteerImpact() {
  const router = useRouter();
  const {width} = useWindowDimensions();
  const mobile = width < 700;
  const {user, profile, loading} = useUserSession();
  const userId = user && profile && isApprovedProfile(profile) ? user.uid : "";

  const [contributions, setContributions] = useState<VerifiedContribution[]>([]);
  const [participations, setParticipations] = useState<CommunityParticipation[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [sourceLoading, setSourceLoading] = useState<LoadFlags>(EMPTY_LOADING);
  const [sourceErrors, setSourceErrors] = useState<SourceErrors>({});

  useEffect(() => {
    if (!userId) {
      setContributions([]);
      setParticipations([]);
      setEvents([]);
      setCertificates([]);
      setSourceLoading(FINISHED_LOADING);
      setSourceErrors({});
      return;
    }

    setContributions([]);
    setParticipations([]);
    setEvents([]);
    setCertificates([]);
    setSourceLoading({...EMPTY_LOADING});
    setSourceErrors({});

    const finish = (source: Source, message?: string) => {
      setSourceLoading((previous) => ({...previous, [source]: false}));
      setSourceErrors((previous) => {
        const next = {...previous};
        if (message) next[source] = message;
        else delete next[source];
        return next;
      });
    };

    // Resident-confirmed verified emergency contributions (unchanged source).
    const stopContributions = onSnapshot(
      query(collection(db, "verifiedContributions"), where("volunteerId", "==", userId)),
      (snapshot) => {
        setContributions(snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<VerifiedContribution, "id">),
        })).filter((entry) => entry.status === "verified"));
        finish("contributions");
      },
      (problem) => finish("contributions", sourceErrorText("contributions", problem)),
    );

    // The same participant query used by Community Events itself.
    const stopParticipations = onSnapshot(
      query(collection(db, "communityEventParticipants"), where("uid", "==", userId)),
      (snapshot) => {
        setParticipations(snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<CommunityParticipation, "id">),
        })));
        finish("participations");
      },
      (problem) => finish("participations", sourceErrorText("participations", problem)),
    );

    // The same published-event query used by the Volunteer Community Events page.
    const stopEvents = onSnapshot(
      query(collection(db, "communityEvents"), where("publicationStatus", "==", "published")),
      (snapshot) => {
        setEvents(snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<CommunityEvent, "id">),
        })));
        finish("events");
      },
      (problem) => finish("events", sourceErrorText("events", problem)),
    );

    // Exact same certificate query and types as app/(tabs)/certificate.tsx.
    const stopCertificates = onSnapshot(
      query(collection(db, "certificates"), where("userId", "==", userId)),
      (snapshot) => {
        setCertificates(snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<CertificateRecord, "id">),
        })));
        finish("certificates");
      },
      (problem) => finish("certificates", sourceErrorText("certificates", problem)),
    );

    return () => {
      stopContributions();
      stopParticipations();
      stopEvents();
      stopCertificates();
    };
  }, [userId]);

  const emergency = useMemo(() => {
    let fullyHelped = 0;
    let partiallyHelped = 0;
    let peopleAssisted = 0;
    let minutes = 0;
    const byType = new Map<string, number>();

    const ordered = [...contributions].sort(
      (left, right) => toMillis(right.verifiedAt) - toMillis(left.verifiedAt),
    );

    for (const contribution of ordered) {
      if (contribution.outcome === "fully_helped") fullyHelped++;
      if (contribution.outcome === "partially_helped") partiallyHelped++;
      peopleAssisted += nonnegativeInteger(contribution.peopleHelped);
      minutes += verifiedEmergencyMinutes(contribution);
      const kind = (contribution.contributionType || "General Volunteer Assistance").trim();
      byType.set(kind, (byType.get(kind) || 0) + 1);
    }

    return {
      verifiedHelps: fullyHelped + partiallyHelped,
      fullyHelped,
      partiallyHelped,
      peopleAssisted,
      minutes,
      ordered,
      breakdown: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [contributions]);

  const issuedCertificates = useMemo(() => certificates
    .filter((item) => item.verificationStatus === "issued" && (
      item.certificateType === "community_event_participation" ||
      item.certificateType === "verified_volunteer_service"
    ))
    .sort((a, b) => toMillis(b.issuedAt || b.createdAt) - toMillis(a.issuedAt || a.createdAt)),
  [certificates]);

  const eventProgress = useMemo(() => {
    const byId = new Map(events.map((item) => [item.id, item]));
    const earned = new Set(issuedCertificates
      .filter((item) => item.certificateType === "community_event_participation" && item.eventId)
      .map((item) => item.eventId));

    // One event is counted only once, even if an old dataset contains duplicates.
    const seen = new Set<string>();
    const result: EventProgress[] = [];
    for (const participation of participations) {
      if (participation.status !== "joined" || !participation.eventId || seen.has(participation.eventId)) continue;
      const event = byId.get(participation.eventId);
      if (!event || event.publicationStatus !== "published") continue;
      seen.add(participation.eventId);
      const minutes = verifiedEventMinutes(participation);
      const completedAndVerified = event.status === "completed" && participation.attendanceVerified === true;
      result.push({
        participation,
        event,
        verifiedMinutes: minutes,
        completedAndVerified,
        hasIssuedCertificate: earned.has(event.id),
      });
    }
    return result.sort((a, b) => (b.event.date || "").localeCompare(a.event.date || ""));
  }, [events, participations, issuedCertificates]);

  const community = useMemo(() => ({
    joinedEvents: eventProgress.length,
    completedEvents: eventProgress.filter((item) => item.completedAndVerified).length,
    verifiedMinutes: eventProgress.reduce((sum, item) => sum + item.verifiedMinutes, 0),
    communityCertificates: issuedCertificates.filter((item) => item.certificateType === "community_event_participation").length,
    emergencyCertificates: issuedCertificates.filter((item) => item.certificateType === "verified_volunteer_service").length,
  }), [eventProgress, issuedCertificates]);

  if (loading || (userId && Object.values(sourceLoading).some(Boolean))) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingText}>Loading your volunteer progress…</Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return (
      <View style={styles.accessCard}>
        <Text style={styles.accessTitle}>Approved account required</Text>
        <Text style={styles.accessText}>Sign in with an approved VolunServe account to view your verified volunteer progress.</Text>
      </View>
    );
  }

  const eventDataAvailable = !sourceErrors.events && !sourceErrors.participations;
  const certificatesAvailable = !sourceErrors.certificates;
  const emergencyAvailable = !sourceErrors.contributions;
  const errors = Object.values(sourceErrors).filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, mobile && styles.containerMobile]}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="ribbon-outline" size={16} color={GREEN} />
            <Text style={styles.eyebrow}>VOLUNSERVE · VERIFIED SERVICE RECORD</Text>
          </View>
          <Text style={[styles.heroTitle, mobile && styles.heroTitleMobile]}>My Progress</Text>
          <Text style={styles.heroDescription}>
            See the difference you make. Attendance, service hours, completed activities and earned certificates update from your verified VolunServe records.
          </Text>
        </View>
        <View style={styles.heroSymbol}>
          <Ionicons name="medal-outline" size={49} color={GREEN} />
        </View>
      </View>

      {errors.length > 0 && (
        <View style={styles.errorPanel}>
          <Text style={styles.errorHeading}>Some records could not be loaded</Text>
          {errors.map((error, index) => <Text key={`${index}-${error}`} style={styles.errorText}>{error}</Text>)}
          <Text style={styles.errorNote}>Unavailable figures are shown as —, not as zero. Your Firestore data has not been changed.</Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <StatCard
          icon="time-outline" tint={GREEN} label="Community Service"
          value={eventDataAvailable ? formatDuration(community.verifiedMinutes) : "—"}
          subtitle="Admin-verified event attendance"
        />
        <StatCard
          icon="checkmark-circle-outline" tint="#2479C6" label="Completed Events"
          value={eventDataAvailable ? String(community.completedEvents) : "—"}
          subtitle="Joined events with verified attendance"
        />
        <StatCard
          icon="ribbon-outline" tint="#C28A1A" label="Certificates Earned"
          value={certificatesAvailable ? String(issuedCertificates.length) : "—"}
          subtitle="Issued, non-revoked certificates"
        />
        <StatCard
          icon="heart-outline" tint="#8062BB" label="Verified Emergency Helps"
          value={emergencyAvailable ? String(emergency.verifiedHelps) : "—"}
          subtitle="Confirmed full or partial assistance"
        />
      </View>

      <View style={styles.card}>
        <SectionHeading
          title="Community Event Progress"
          subtitle="Verified hours and the events you took part in."
          icon="calendar-outline"
          action={<TouchableOpacity style={styles.tertiaryButton} onPress={() => router.push("/(tabs)/community-events" as any)} accessibilityRole="button">
            <Text style={styles.tertiaryText}>Browse Events</Text>
            <Ionicons name="arrow-forward" size={15} color={GREEN} />
          </TouchableOpacity>}
        />
        {eventDataAvailable ? (
          <>
            <View style={styles.communitySummary}>
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryNumber}>{community.joinedEvents}</Text>
                <Text style={styles.summaryLabel}>Joined Events</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryNumber}>{community.completedEvents}</Text>
                <Text style={styles.summaryLabel}>Verified Completions</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetric}>
                <Text style={styles.summaryNumber}>{formatDuration(community.verifiedMinutes)}</Text>
                <Text style={styles.summaryLabel}>Verified Attendance</Text>
              </View>
            </View>
            {eventProgress.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-clear-outline" size={28} color="#9AB1B8" />
                <Text style={styles.emptyTitle}>No joined community events yet</Text>
                <Text style={styles.emptyDescription}>Join a published event to start building your participation history.</Text>
              </View>
            ) : eventProgress.map((item) => {
              const verified = item.participation.attendanceVerified === true;
              const status = item.hasIssuedCertificate
                ? {label: "CERTIFICATE ISSUED", kind: "good" as const}
                : item.completedAndVerified && item.verifiedMinutes < 30
                  ? {label: "UNDER 30 MINUTES", kind: "waiting" as const}
                  : item.completedAndVerified
                    ? {label: "CERTIFICATE PENDING", kind: "waiting" as const}
                    : verified
                      ? {label: "ATTENDANCE VERIFIED", kind: "good" as const}
                      : item.participation.checkedOutAt
                        ? {label: "FOR VERIFICATION", kind: "waiting" as const}
                        : item.participation.checkedInAt
                          ? {label: "CHECKED IN", kind: "neutral" as const}
                          : {label: "JOINED", kind: "neutral" as const};
              return (
                <View key={item.event.id} style={styles.historyRow}>
                  <View style={styles.historyIcon}>
                    <Ionicons name="leaf-outline" size={20} color={GREEN} />
                  </View>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyTitle}>{item.event.title || "Community Event"}</Text>
                    <Text style={styles.historySub}>{formatEventDate(item.event.date)} · {item.event.barangay || item.event.location || "San Jose del Monte"}</Text>
                    <Text style={styles.historyDetail}>{verified
                      ? `${formatDuration(item.verifiedMinutes)} verified attendance${item.event.status === "completed" ? " · Event completed" : ""}`
                      : "Attendance not verified yet"}</Text>
                  </View>
                  <StatusPill label={status.label} kind={status.kind} />
                </View>
              );
            })}
          </>
        ) : <Text style={styles.dataUnavailable}>Community event progress is temporarily unavailable.</Text>}
        <Text style={styles.sectionFootnote}>
          Hours come from Admin-verified Time In/Out records only. Event completion and at least 30 verified minutes are required for automatic Community Event certificates. Verified service and certificate counts are kept separate to avoid double-counting.
        </Text>
      </View>

      <View style={styles.card}>
        <SectionHeading
          title="Certificates Earned"
          subtitle="Automatically reflects the same records shown in My Certificates."
          icon="ribbon-outline"
          action={<TouchableOpacity style={styles.tertiaryButton} onPress={() => router.push("/(tabs)/certificate" as any)} accessibilityRole="button">
            <Text style={styles.tertiaryText}>My Certificates</Text>
            <Ionicons name="arrow-forward" size={15} color={GREEN} />
          </TouchableOpacity>}
        />
        {certificatesAvailable ? (
          <>
            <View style={styles.certificateSummary}>
              <View style={styles.certificateSummaryItem}>
                <Ionicons name="calendar-outline" size={18} color={GREEN} />
                <Text style={styles.certificateSummaryValue}>{community.communityCertificates}</Text>
                <Text style={styles.certificateSummaryLabel}>Community Event</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.certificateSummaryItem}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#2479C6" />
                <Text style={styles.certificateSummaryValue}>{community.emergencyCertificates}</Text>
                <Text style={styles.certificateSummaryLabel}>Emergency Response</Text>
              </View>
            </View>
            {issuedCertificates.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="ribbon-outline" size={28} color="#9AB1B8" />
                <Text style={styles.emptyTitle}>No certificates issued yet</Text>
                <Text style={styles.emptyDescription}>Eligible Community Event certificates will appear automatically after event completion and verified attendance.</Text>
              </View>
            ) : issuedCertificates.slice(0, 5).map((certificate) => (
              <View key={certificate.id} style={styles.certificateRow}>
                <View style={styles.historyIcon}><Ionicons name="document-text-outline" size={20} color={GREEN} /></View>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyTitle}>{certificate.certificateType === "community_event_participation"
                    ? certificate.eventTitle || "Community Event Certificate"
                    : "Volunteer Service Certificate"}</Text>
                  <Text style={styles.historySub}>Issued {formatDate(certificate.issuedAt || certificate.createdAt)}</Text>
                  <Text style={styles.recordId} numberOfLines={1}>ID: {certificate.certificateId || certificate.id}</Text>
                </View>
                <StatusPill label="ISSUED" kind="good" />
              </View>
            ))}
            {issuedCertificates.length > 5 && <Text style={styles.moreText}>Plus {issuedCertificates.length - 5} more certificate(s) in My Certificates.</Text>}
          </>
        ) : <Text style={styles.dataUnavailable}>Certificate records are temporarily unavailable.</Text>}
      </View>

      <View style={styles.card}>
        <SectionHeading
          title="Verified Emergency Contributions"
          subtitle="Resident-confirmed help is tracked separately from Community Events."
          icon="heart-outline"
        />
        {emergencyAvailable ? (
          <>
            <View style={styles.emergencyStats}>
              <View style={styles.emergencyStat}>
                <Text style={styles.emergencyValue}>{emergency.verifiedHelps}</Text>
                <Text style={styles.emergencyLabel}>Verified Helps</Text>
                <Text style={styles.emergencyHint}>{emergency.fullyHelped} full · {emergency.partiallyHelped} partial</Text>
              </View>
              <View style={styles.emergencyStat}>
                <Text style={styles.emergencyValue}>{formatDuration(emergency.minutes)}</Text>
                <Text style={styles.emergencyLabel}>Response Service</Text>
                <Text style={styles.emergencyHint}>Verified contributions only</Text>
              </View>
              <View style={styles.emergencyStat}>
                <Text style={styles.emergencyValue}>{emergency.peopleAssisted}</Text>
                <Text style={styles.emergencyLabel}>People Assisted</Text>
                <Text style={styles.emergencyHint}>Resident-confirmed</Text>
              </View>
            </View>
            <Text style={styles.smallSectionTitle}>Contribution Breakdown</Text>
            {emergency.breakdown.length === 0 ? (
              <Text style={styles.emptyInline}>No verified emergency contributions yet.</Text>
            ) : emergency.breakdown.map(([name, count]) => (
              <View key={name} style={styles.breakdownRow}>
                <Text style={styles.breakdownName}>{name}</Text>
                <Text style={styles.breakdownCount}>{count}</Text>
              </View>
            ))}
            <Text style={[styles.smallSectionTitle, {marginTop: 22}]}>Verified Contribution History</Text>
            {emergency.ordered.length === 0 ? (
              <Text style={styles.emptyInline}>Your history will appear after a resident confirms that help was provided.</Text>
            ) : emergency.ordered.map((contribution) => (
              <View key={contribution.id} style={styles.contributionCard}>
                <View style={styles.contributionHeading}>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyTitle}>{contribution.contributionType || "General Volunteer Assistance"}</Text>
                    <Text style={styles.historySub}>Verified {formatDate(contribution.verifiedAt)}</Text>
                  </View>
                  <StatusPill label={contribution.outcome === "fully_helped" ? "FULLY HELPED" : contribution.outcome === "partially_helped" ? "PARTIALLY HELPED" : "VERIFIED"} kind="good" />
                </View>
                <Text style={styles.contributionDescription}>{contribution.contributionSummary || "Verified assistance provided."}</Text>
                <View style={styles.contributionMetrics}>
                  <Text style={styles.metricText}><Text style={styles.metricEmphasis}>{nonnegativeInteger(contribution.peopleHelped)}</Text> people assisted</Text>
                  <Text style={styles.metricText}><Text style={styles.metricEmphasis}>{formatDuration(verifiedEmergencyMinutes(contribution))}</Text> response time</Text>
                </View>
                {!!contribution.completionNotes && <Text style={styles.noteText}>Completion note: {contribution.completionNotes}</Text>}
                <Text style={styles.recordId} numberOfLines={1}>Contribution ID: {contribution.id}</Text>
              </View>
            ))}
          </>
        ) : <Text style={styles.dataUnavailable}>Emergency contribution records are temporarily unavailable.</Text>}
        <Text style={styles.sectionFootnote}>
          Emergency response work counts only when verified through the resident-confirmation process. Certificates for emergency service follow their separate issuance workflow.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: "#F4F9F8"},
  container: {width: "100%", maxWidth: 1250, alignSelf: "center", padding: 24, paddingBottom: 72},
  containerMobile: {padding: 12, paddingBottom: 44},
  loadingScreen: {flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#F4F9F8"},
  loadingText: {fontSize: 13, color: MUTED},
  accessCard: {margin: 24, backgroundColor: "#FFFFFF", borderRadius: 15, padding: 24, borderColor: BORDER, borderWidth: 1},
  accessTitle: {fontSize: 20, color: NAVY, fontWeight: "900"},
  accessText: {fontSize: 13, color: MUTED, lineHeight: 21, marginTop: 8},
  hero: {backgroundColor: "#E9F8F4", borderWidth: 1, borderColor: "#D0EBE3", borderRadius: 20, padding: 25, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, overflow: "hidden"},
  heroCopy: {flex: 1},
  eyebrowRow: {flexDirection: "row", gap: 7, alignItems: "center"},
  eyebrow: {fontWeight: "900", fontSize: 10, letterSpacing: 1, color: "#07776D"},
  heroTitle: {fontSize: 32, fontWeight: "900", color: NAVY, marginTop: 13},
  heroTitleMobile: {fontSize: 26},
  heroDescription: {color: "#53747D", lineHeight: 21, fontSize: 12.5, marginTop: 7, maxWidth: 735},
  heroSymbol: {width: 90, height: 90, borderRadius: 45, backgroundColor: "#D2EFE6", alignItems: "center", justifyContent: "center", marginLeft: 10},
  errorPanel: {borderRadius: 14, backgroundColor: "#FFF4F0", padding: 16, borderWidth: 1, borderColor: "#F4CCC1", marginBottom: 16},
  errorHeading: {fontWeight: "900", fontSize: 13, color: "#A53C28", marginBottom: 6},
  errorText: {fontSize: 11, color: "#A53C28", lineHeight: 17},
  errorNote: {fontSize: 10, color: "#9A5A4B", marginTop: 6},
  statsGrid: {flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16},
  statCard: {backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: BORDER, flexGrow: 1, flexBasis: 215, minWidth: 167, padding: 17},
  statIconWrap: {width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, marginBottom: 12},
  statValue: {fontSize: 25, fontWeight: "900", color: NAVY},
  statLabel: {fontSize: 12.5, fontWeight: "900", color: NAVY, marginTop: 3},
  statHint: {color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 5},
  card: {padding: 20, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, marginBottom: 17},
  sectionHeading: {flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 17},
  sectionIcon: {height: 42, width: 42, borderRadius: 12, backgroundColor: "#E7F6F2", alignItems: "center", justifyContent: "center"},
  sectionHeadingCopy: {flex: 1, minWidth: 145},
  sectionTitle: {fontWeight: "900", color: NAVY, fontSize: 18},
  sectionSubtitle: {color: MUTED, fontSize: 10.5, marginTop: 4, lineHeight: 15},
  tertiaryButton: {flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingVertical: 9, gap: 6, borderRadius: 9, backgroundColor: "#EDF8F5"},
  tertiaryText: {color: GREEN, fontWeight: "900", fontSize: 10.5},
  communitySummary: {flexDirection: "row", flexWrap: "wrap", alignItems: "center", backgroundColor: "#F1FAF7", padding: 15, borderRadius: 13, marginBottom: 14, gap: 6},
  summaryMetric: {flex: 1, minWidth: 95, alignItems: "center"},
  summaryNumber: {fontSize: 20, fontWeight: "900", color: GREEN},
  summaryLabel: {fontSize: 10, color: "#5B7480", textAlign: "center", marginTop: 4},
  summaryDivider: {width: 1, height: 37, backgroundColor: "#D4E9E3", marginHorizontal: 5},
  historyRow: {flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, flexWrap: "wrap"},
  historyIcon: {width: 46, height: 46, borderRadius: 12, backgroundColor: "#E7F6F2", justifyContent: "center", alignItems: "center"},
  historyCopy: {flex: 1, minWidth: 150},
  historyTitle: {fontWeight: "900", color: NAVY, fontSize: 13},
  historySub: {fontSize: 10.5, color: MUTED, lineHeight: 16, marginTop: 4},
  historyDetail: {fontSize: 10.5, fontWeight: "700", color: GREEN, marginTop: 4},
  pill: {borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start"},
  pillGood: {backgroundColor: "#DDF6E9"},
  pillWaiting: {backgroundColor: "#FFF2D6"},
  pillNeutral: {backgroundColor: "#EEF3F7"},
  pillText: {fontSize: 9, fontWeight: "900", letterSpacing: 0.2},
  pillTextGood: {color: "#078566"},
  pillTextWaiting: {color: "#987018"},
  pillTextNeutral: {color: "#5B7891"},
  sectionFootnote: {color: "#718996", fontSize: 10.5, lineHeight: 17, marginTop: 15},
  emptyState: {alignItems: "center", paddingVertical: 22, paddingHorizontal: 13},
  emptyTitle: {fontSize: 13, fontWeight: "900", color: NAVY, marginTop: 11},
  emptyDescription: {fontSize: 11, lineHeight: 17, textAlign: "center", color: MUTED, marginTop: 6},
  dataUnavailable: {color: MUTED, paddingVertical: 14, textAlign: "center", fontSize: 12},
  certificateSummary: {flexDirection: "row", alignItems: "center", flexWrap: "wrap", backgroundColor: "#F1FAF7", borderRadius: 13, padding: 13, marginBottom: 12},
  certificateSummaryItem: {flexGrow: 1, flexBasis: 125, alignItems: "center", gap: 3},
  certificateSummaryValue: {fontSize: 19, fontWeight: "900", color: NAVY},
  certificateSummaryLabel: {fontSize: 10, textAlign: "center", color: MUTED},
  certificateRow: {flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, flexWrap: "wrap"},
  recordId: {fontSize: 9.5, color: "#8799A4", marginTop: 5},
  moreText: {fontSize: 10.5, color: GREEN, fontWeight: "700", marginTop: 12},
  emergencyStats: {flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20},
  emergencyStat: {flexGrow: 1, flexBasis: 170, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: "#F8FBFA"},
  emergencyValue: {fontSize: 20, fontWeight: "900", color: NAVY},
  emergencyLabel: {fontSize: 12, fontWeight: "900", color: NAVY, marginTop: 5},
  emergencyHint: {fontSize: 10, color: MUTED, marginTop: 4},
  smallSectionTitle: {fontSize: 14, fontWeight: "900", color: NAVY, marginBottom: 10},
  emptyInline: {fontSize: 11, color: MUTED, lineHeight: 18, marginBottom: 6},
  breakdownRow: {flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER},
  breakdownName: {fontSize: 11.5, color: "#385363", flex: 1},
  breakdownCount: {fontSize: 11.5, fontWeight: "900", color: GREEN},
  contributionCard: {padding: 15, borderRadius: 12, backgroundColor: "#F8FBFA", borderWidth: 1, borderColor: BORDER, marginBottom: 11},
  contributionHeading: {flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "center"},
  contributionDescription: {fontSize: 11.5, color: "#526C79", marginTop: 11, lineHeight: 19},
  contributionMetrics: {flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10},
  metricText: {fontSize: 10.5, color: MUTED},
  metricEmphasis: {fontWeight: "900", color: NAVY},
  noteText: {fontSize: 10, color: "#526C79", marginTop: 10, lineHeight: 16},
});
