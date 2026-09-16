import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import {
    collection,
    doc,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
    activeModeForProfile,
    hasVolunteerAccess,
    isApprovedProfile,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type AssignmentStatus =
  | "offered"
  | "accepted"
  | "responding"
  | "on_site"
  | "completed"
  | "declined"
  | "cancelled"
  | string;

type ResponseAssignment = {
  id: string;
  caseId?: string;
  caseTitle?: string;
  volunteerId?: string;
  volunteerName?: string;
  status?: AssignmentStatus;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
};

type IncidentAttachment = {
  url?: string;
  path?: string;
  type?: string;
  name?: string;
};

type DisasterCase = {
  id: string;
  title?: string;
  category?: string;
  severity?: "low" | "medium" | "high" | "critical" | string;
  status?: string;
  location?: string;
  details?: string;
  needs?: string;
  attachments?: IncidentAttachment[];
  requiredVolunteers?: number;
  assignedVolunteersCount?: number;
  createdAt?: any;
  updatedAt?: any;
};

type FilterKey = "new" | "active" | "completed" | "all";
type SortDirection = "latest" | "oldest";

const ACTIVE_STATUSES = ["accepted", "responding", "on_site"];

const timestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
};

const formatDateTime = (value: any) => {
  const ms = timestampMillis(value);
  if (!ms) return "—";

  return new Date(ms).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const statusLabel = (status?: string) => {
  switch (status) {
    case "offered":
      return "OFFERED";
    case "accepted":
      return "ACCEPTED";
    case "responding":
      return "RESPONDING";
    case "on_site":
      return "ON SITE";
    case "completed":
      return "COMPLETED";
    case "declined":
      return "DECLINED";
    case "cancelled":
      return "CANCELLED";
    default:
      return String(status || "UNKNOWN").replaceAll("_", " ").toUpperCase();
  }
};

const severityLabel = (severity?: string) => {
  const value = String(severity || "").toLowerCase();
  if (value === "critical") return "CRITICAL PRIORITY";
  if (value === "high") return "HIGH PRIORITY";
  if (value === "medium") return "MEDIUM PRIORITY";
  if (value === "low") return "LOW PRIORITY";
  return "INCIDENT";
};

const severityStyle = (severity?: string) => {
  switch (String(severity || "").toLowerCase()) {
    case "critical":
      return styles.priorityCritical;
    case "high":
      return styles.priorityHigh;
    case "medium":
      return styles.priorityMedium;
    case "low":
      return styles.priorityLow;
    default:
      return styles.priorityNeutral;
  }
};

const statusStyle = (status?: string) => {
  switch (status) {
    case "offered":
      return styles.statusOffered;
    case "accepted":
      return styles.statusAccepted;
    case "responding":
    case "on_site":
      return styles.statusActive;
    case "completed":
      return styles.statusCompleted;
    case "declined":
    case "cancelled":
      return styles.statusMuted;
    default:
      return styles.statusMuted;
  }
};

const categoryIcon = (category?: string): keyof typeof Ionicons.glyphMap => {
  const value = String(category || "").toLowerCase();
  if (value.includes("flood")) return "water-outline";
  if (value.includes("fire")) return "flame-outline";
  if (value.includes("medical")) return "medkit-outline";
  if (value.includes("road") || value.includes("tree")) return "warning-outline";
  if (value.includes("earthquake")) return "pulse-outline";
  return "alert-circle-outline";
};

function IncidentMedia({ incident }: { incident?: DisasterCase }) {
  const [failed, setFailed] = useState(false);

  const imageUrl = useMemo(() => {
    const attachments = Array.isArray(incident?.attachments)
      ? incident?.attachments
      : [];

    const image = attachments.find((item) => {
      const url = String(item?.url || "");
      const type = String(item?.type || "").toLowerCase();
      const name = String(item?.name || "").toLowerCase();

      return (
        !!url &&
        (type.includes("image") ||
          /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ||
          /\.(png|jpe?g|webp|gif)$/i.test(name))
      );
    });

    return image?.url || "";
  }, [incident?.attachments]);

  if (imageUrl && !failed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={styles.incidentImage}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={styles.incidentFallback}>
      <View style={styles.incidentFallbackIcon}>
        <Ionicons
          name={categoryIcon(incident?.category)}
          size={32}
          color="#087f74"
        />
      </View>
      <Text style={styles.incidentFallbackTitle}>No incident photo</Text>
      <Text style={styles.incidentFallbackText}>
        {incident?.category || "Emergency report"}
      </Text>
    </View>
  );
}

function StatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: "red" | "blue" | "green" | "neutral";
}) {
  const toneBox =
    tone === "red"
      ? styles.statIconRed
      : tone === "blue"
        ? styles.statIconBlue
        : tone === "green"
          ? styles.statIconGreen
          : styles.statIconNeutral;

  const toneText =
    tone === "red"
      ? styles.statValueRed
      : tone === "blue"
        ? styles.statValueBlue
        : tone === "green"
          ? styles.statValueGreen
          : styles.statValueNeutral;

  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, toneBox]}>
        <Ionicons name={icon} size={22} color="#0f172a" />
      </View>
      <View>
        <Text style={[styles.statValue, toneText]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function VolunteerTasksWeb() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { loading, user, profile } = useUserSession();

  const [assignments, setAssignments] = useState<ResponseAssignment[]>([]);
  const [casesById, setCasesById] = useState<Record<string, DisasterCase>>({});
  const [assignmentsReady, setAssignmentsReady] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("new");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("latest");

  const compact = width < 1120;

  useEffect(() => {
    if (!user || !profile || !hasVolunteerAccess(profile)) {
      setAssignments([]);
      setAssignmentsReady(true);
      return;
    }

    const assignmentsQuery = query(
      collection(db, "responseAssignments"),
      where("volunteerId", "==", user.uid),
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<ResponseAssignment, "id">),
        }));

        setAssignments(next);
        setAssignmentsReady(true);
        setError("");
      },
      (problem) => {
        console.error("responseAssignments listener failed", problem);
        setAssignmentsReady(true);
        setError(
          "Unable to load your emergency assignments. Check the deployed Firestore rules and your connection.",
        );
      },
    );

    return unsubscribe;
  }, [user?.uid, profile?.volunteerAccess, profile?.role]);

  const caseIds = useMemo(
    () =>
      Array.from(
        new Set(
          assignments
            .map((assignment) => assignment.caseId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [assignments],
  );

  const caseIdsKey = caseIds.join("|");

  useEffect(() => {
    if (!caseIds.length) {
      setCasesById({});
      return;
    }

    const unsubscribers = caseIds.map((caseId) =>
      onSnapshot(
        doc(db, "disasterCases", caseId),
        (snapshot) => {
          if (!snapshot.exists()) return;

          setCasesById((current) => ({
            ...current,
            [caseId]: {
              id: snapshot.id,
              ...(snapshot.data() as Omit<DisasterCase, "id">),
            },
          }));
        },
        (problem) => {
          // A closed incident can become unavailable to volunteers by rule.
          // Keep the assignment card usable with the data copied to the
          // response assignment instead of failing the whole page.
          console.warn(`Unable to load disaster case ${caseId}`, problem);
        },
      ),
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [caseIdsKey]);

  const counts = useMemo(() => {
    const newCount = assignments.filter((item) => item.status === "offered").length;
    const activeCount = assignments.filter((item) =>
      ACTIVE_STATUSES.includes(String(item.status || "")),
    ).length;
    const completedCount = assignments.filter(
      (item) => item.status === "completed",
    ).length;

    return {
      new: newCount,
      active: activeCount,
      completed: completedCount,
      all: assignments.length,
    };
  }, [assignments]);

  const visibleAssignments = useMemo(() => {
    const filtered = assignments.filter((item) => {
      if (filter === "new") return item.status === "offered";
      if (filter === "active") {
        return ACTIVE_STATUSES.includes(String(item.status || ""));
      }
      if (filter === "completed") return item.status === "completed";
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aTime = timestampMillis(a.updatedAt) || timestampMillis(a.createdAt);
      const bTime = timestampMillis(b.updatedAt) || timestampMillis(b.createdAt);
      return sortDirection === "latest" ? bTime - aTime : aTime - bTime;
    });
  }, [assignments, filter, sortDirection]);

  const showMessage = (title: string, message: string) => {
    window.alert(`${title}\n\n${message}`);
  };

  const decide = async (
    assignment: ResponseAssignment,
    next: "accepted" | "declined",
  ) => {
    if (!user || busyId) return;

    try {
      setBusyId(assignment.id);
      setError("");

      await runTransaction(db, async (transaction) => {
        const assignmentRef = doc(db, "responseAssignments", assignment.id);
        const snapshot = await transaction.get(assignmentRef);

        if (!snapshot.exists()) {
          throw new Error("This assignment no longer exists.");
        }

        const current = snapshot.data() as ResponseAssignment;

        if (current.volunteerId !== user.uid) {
          throw new Error("This assignment does not belong to your account.");
        }

        if (current.status !== "offered") {
          throw new Error(
            "This assignment already changed. Check its latest status.",
          );
        }

        transaction.update(assignmentRef, {
          status: next,
          updatedAt: serverTimestamp(),
        });
      });

      if (next === "accepted") {
        showMessage(
          "Assignment accepted",
          "The mission is now in progress. Open it when you are ready to continue on the Live Response Map.",
        );
        setFilter("active");
      } else {
        showMessage(
          "Assignment declined",
          "The administrator will see that you declined this assignment.",
        );
      }
    } catch (problem) {
      const message =
        problem instanceof Error
          ? problem.message
          : "Unable to update the assignment.";
      setError(message);
    } finally {
      setBusyId("");
    }
  };

  const openLiveMap = (assignment?: ResponseAssignment) => {
    if (assignment?.caseId) {
      router.push({
        pathname: "/map-tracking" as any,
        params: { caseId: assignment.caseId },
      });
      return;
    }

    router.push("/map-tracking" as any);
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#078F82" />
        <Text style={styles.loadingText}>Loading volunteer workspace…</Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return <Redirect href="/login" />;
  }

  if (!hasVolunteerAccess(profile) || activeModeForProfile(profile) !== "volunteer") {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>VOLUNSERVE · VOLUNTEER MODE</Text>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Ionicons name="people" size={24} color="#078F82" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Volunteer Tasks</Text>
              <Text style={styles.subtitle}>
                Emergency assignments validated and assigned by Admin.
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.liveMapButton}
          onPress={() => openLiveMap()}
          activeOpacity={0.85}
        >
          <Ionicons name="map-outline" size={18} color="#ffffff" />
          <Text style={styles.liveMapButtonText}>Open Live Response Map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.liveStrip}>
        <View style={styles.liveDot} />
        <Text style={styles.liveStripText}>LIVE FIRESTORE</Text>
        <Text style={styles.liveStripSubtext}>
          Assignments update automatically.
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          icon="clipboard-outline"
          value={counts.new}
          label="New Assignments"
          tone="red"
        />
        <StatCard
          icon="navigate-circle-outline"
          value={counts.active}
          label="In Progress"
          tone="blue"
        />
        <StatCard
          icon="checkmark-circle-outline"
          value={counts.completed}
          label="Completed"
          tone="green"
        />
        <StatCard
          icon="time-outline"
          value={counts.all}
          label="Total Assignments"
          tone="neutral"
        />
      </View>

      <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
        <View style={styles.filters}>
          {(
            [
              ["new", "New", counts.new],
              ["active", "In Progress", counts.active],
              ["completed", "Completed", counts.completed],
              ["all", "All", counts.all],
            ] as [FilterKey, string, number][]
          ).map(([key, label, count]) => (
            <TouchableOpacity
              key={key}
              style={[styles.filterButton, filter === key && styles.filterButtonActive]}
              onPress={() => setFilter(key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filter === key && styles.filterButtonTextActive,
                ]}
              >
                {label} ({count})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() =>
            setSortDirection((current) =>
              current === "latest" ? "oldest" : "latest",
            )
          }
          activeOpacity={0.8}
        >
          <Ionicons name="swap-vertical-outline" size={17} color="#475569" />
          <Text style={styles.sortButtonText}>
            {sortDirection === "latest" ? "Latest First" : "Oldest First"}
          </Text>
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={19} color="#b42318" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!assignmentsReady ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator color="#078F82" />
          <Text style={styles.emptyTitle}>Loading assignments…</Text>
        </View>
      ) : visibleAssignments.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="shield-checkmark-outline" size={30} color="#078F82" />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === "new"
              ? "No new emergency assignments"
              : filter === "active"
                ? "No active missions"
                : filter === "completed"
                  ? "No completed missions yet"
                  : "No assignments yet"}
          </Text>
          <Text style={styles.emptyText}>
            {filter === "new"
              ? "New validated cases will appear here after an administrator assigns them to you."
              : "Your assignments will appear here automatically when their status matches this filter."}
          </Text>
        </View>
      ) : (
        <View style={styles.cardsList}>
          {visibleAssignments.map((assignment) => {
            const incident = assignment.caseId
              ? casesById[assignment.caseId]
              : undefined;
            const status = String(assignment.status || "");
            const offered = status === "offered";
            const active = ACTIVE_STATUSES.includes(status);
            const busy = busyId === assignment.id;

            return (
              <View
                key={assignment.id}
                style={[styles.assignmentCard, compact && styles.assignmentCardCompact]}
              >
                <View style={[styles.mediaWrap, compact && styles.mediaWrapCompact]}>
                  <IncidentMedia incident={incident} />
                  <View style={[styles.priorityBadge, severityStyle(incident?.severity)]}>
                    <Ionicons name="warning" size={12} color="#ffffff" />
                    <Text style={styles.priorityBadgeText}>
                      {severityLabel(incident?.severity)}
                    </Text>
                  </View>
                </View>

                <View style={styles.assignmentBody}>
                  <View style={styles.assignmentHeadingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assignmentTitle} numberOfLines={1}>
                        {incident?.title || assignment.caseTitle || "Emergency Assignment"}
                      </Text>

                      <View style={styles.locationRow}>
                        <Ionicons name="location" size={15} color="#ef4444" />
                        <Text style={styles.locationText} numberOfLines={1}>
                          {incident?.location || "Location available in incident record"}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.statusBadge, statusStyle(status)]}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusBadgeText}>{statusLabel(status)}</Text>
                    </View>
                  </View>

                  <Text style={styles.detailsText} numberOfLines={compact ? 2 : 2}>
                    {incident?.details ||
                      "Open the assigned mission to view the validated incident details."}
                  </Text>

                  <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                      <View style={styles.metaIcon}>
                        <Ionicons name="document-text-outline" size={17} color="#4b647a" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.metaLabel}>Case ID</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {assignment.caseId || assignment.id}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaItem}>
                      <View style={styles.metaIcon}>
                        <Ionicons name="calendar-outline" size={17} color="#4b647a" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.metaLabel}>Assigned</Text>
                        <Text style={styles.metaValue} numberOfLines={2}>
                          {formatDateTime(assignment.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaItem}>
                      <View style={styles.metaIcon}>
                        <Ionicons name="help-buoy-outline" size={17} color="#4b647a" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.metaLabel}>Needs</Text>
                        <Text style={styles.metaValue} numberOfLines={2}>
                          {incident?.needs || incident?.category || "Emergency response"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={[styles.actionsColumn, compact && styles.actionsColumnCompact]}>
                  {offered && (
                    <>
                      <TouchableOpacity
                        style={[styles.acceptButton, busy && styles.buttonDisabled]}
                        disabled={busy}
                        onPress={() => decide(assignment, "accepted")}
                        activeOpacity={0.85}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Ionicons name="checkmark" size={20} color="#ffffff" />
                        )}
                        <Text style={styles.acceptButtonText}>
                          {busy ? "Updating…" : "Accept Assignment"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.declineButton, busy && styles.buttonDisabled]}
                        disabled={busy}
                        onPress={() => decide(assignment, "declined")}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="close" size={20} color="#123047" />
                        <Text style={styles.declineButtonText}>Decline</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {active && (
                    <TouchableOpacity
                      style={styles.openMissionButton}
                      onPress={() => openLiveMap(assignment)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="navigate" size={18} color="#ffffff" />
                      <Text style={styles.openMissionButtonText}>
                        {status === "accepted" ? "Start Mission" : "Open Mission"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {status === "completed" && (
                    <View style={styles.completedBox}>
                      <Ionicons name="checkmark-circle" size={20} color="#16845b" />
                      <Text style={styles.completedBoxText}>Mission completed</Text>
                    </View>
                  )}

                  {(status === "declined" || status === "cancelled") && (
                    <View style={styles.inactiveBox}>
                      <Ionicons name="remove-circle-outline" size={20} color="#64748b" />
                      <Text style={styles.inactiveBoxText}>{statusLabel(status)}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f8fb",
  },
  page: {
    width: "100%",
    maxWidth: 1450,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 48,
  },
  loadingScreen: {
    flex: 1,
    minHeight: 520,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f8fb",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: "#078F82",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 7,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e4f7f2",
  },
  title: {
    color: "#10283d",
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
  },
  subtitle: {
    color: "#6b7f93",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  liveMapButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 17,
    borderRadius: 11,
    backgroundColor: "#0aa16f",
  },
  liveMapButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  liveStrip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#eef8f5",
    borderWidth: 1,
    borderColor: "#d1eee5",
    marginBottom: 16,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#12a874",
  },
  liveStripText: {
    color: "#087f74",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  liveStripSubtext: {
    color: "#78909f",
    fontSize: 9,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 190,
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e1e8ee",
    backgroundColor: "#ffffff",
  },
  statIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  statIconRed: {
    backgroundColor: "#fff0ef",
  },
  statIconBlue: {
    backgroundColor: "#edf5ff",
  },
  statIconGreen: {
    backgroundColor: "#eaf8f2",
  },
  statIconNeutral: {
    backgroundColor: "#f0f3f6",
  },
  statValue: {
    fontSize: 23,
    lineHeight: 25,
    fontWeight: "900",
  },
  statValueRed: {
    color: "#d92d20",
  },
  statValueBlue: {
    color: "#1976d2",
  },
  statValueGreen: {
    color: "#16845b",
  },
  statValueNeutral: {
    color: "#31475a",
  },
  statLabel: {
    marginTop: 3,
    color: "#5f7284",
    fontSize: 11,
    fontWeight: "800",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  toolbarCompact: {
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  filterButton: {
    minHeight: 39,
    minWidth: 112,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e3e9ef",
    backgroundColor: "#ffffff",
  },
  filterButtonActive: {
    borderColor: "#a9ded1",
    backgroundColor: "#edf9f5",
  },
  filterButtonText: {
    color: "#5d7083",
    fontSize: 11,
    fontWeight: "800",
  },
  filterButtonTextActive: {
    color: "#087f74",
  },
  sortButton: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e3e9ef",
    backgroundColor: "#ffffff",
  },
  sortButtonText: {
    color: "#526779",
    fontSize: 11,
    fontWeight: "800",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#f2c6c1",
    backgroundColor: "#fff3f2",
  },
  errorText: {
    flex: 1,
    color: "#b42318",
    fontSize: 11.5,
    fontWeight: "700",
  },
  cardsList: {
    gap: 10,
  },
  assignmentCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    minHeight: 182,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    backgroundColor: "#ffffff",
  },
  assignmentCardCompact: {
    flexWrap: "wrap",
  },
  mediaWrap: {
    width: 220,
    minHeight: 156,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#edf3f5",
  },
  mediaWrapCompact: {
    width: 240,
  },
  incidentImage: {
    width: "100%",
    height: "100%",
    minHeight: 156,
  },
  incidentFallback: {
    width: "100%",
    height: "100%",
    minHeight: 156,
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    backgroundColor: "#edf7f4",
  },
  incidentFallbackIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d9f0ea",
  },
  incidentFallbackTitle: {
    marginTop: 9,
    color: "#23465a",
    fontSize: 12,
    fontWeight: "900",
  },
  incidentFallbackText: {
    marginTop: 2,
    color: "#718394",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  priorityBadge: {
    position: "absolute",
    left: 9,
    top: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  priorityCritical: {
    backgroundColor: "#b42318",
  },
  priorityHigh: {
    backgroundColor: "#e5484d",
  },
  priorityMedium: {
    backgroundColor: "#e99a12",
  },
  priorityLow: {
    backgroundColor: "#2f80ed",
  },
  priorityNeutral: {
    backgroundColor: "#64748b",
  },
  priorityBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  assignmentBody: {
    flex: 1,
    minWidth: 330,
    paddingVertical: 4,
  },
  assignmentHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  assignmentTitle: {
    color: "#10283d",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  locationText: {
    flex: 1,
    color: "#587084",
    fontSize: 11.5,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusOffered: {
    backgroundColor: "#fff1f1",
  },
  statusAccepted: {
    backgroundColor: "#eef5ff",
  },
  statusActive: {
    backgroundColor: "#e8f3ff",
  },
  statusCompleted: {
    backgroundColor: "#eaf8f2",
  },
  statusMuted: {
    backgroundColor: "#f0f3f6",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#078F82",
  },
  statusBadgeText: {
    color: "#31475a",
    fontSize: 9,
    fontWeight: "900",
  },
  detailsText: {
    color: "#64788b",
    fontSize: 11.5,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 12,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItem: {
    flex: 1,
    minWidth: 150,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f7f9fb",
  },
  metaIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6ebef",
  },
  metaLabel: {
    color: "#7d8f9f",
    fontSize: 8.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  metaValue: {
    color: "#294256",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  actionsColumn: {
    width: 210,
    justifyContent: "center",
    gap: 8,
    paddingLeft: 4,
  },
  actionsColumnCompact: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    paddingLeft: 0,
  },
  acceptButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0aa16f",
  },
  acceptButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  declineButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#9db5c4",
    backgroundColor: "#ffffff",
  },
  declineButtonText: {
    color: "#123047",
    fontSize: 11,
    fontWeight: "900",
  },
  openMissionButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#237ce5",
  },
  openMissionButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  completedBox: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#edf8f3",
  },
  completedBoxText: {
    color: "#16845b",
    fontSize: 11,
    fontWeight: "900",
  },
  inactiveBox: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f1f4f7",
  },
  inactiveBoxText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  emptyCard: {
    minHeight: 245,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    backgroundColor: "#ffffff",
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8f6f2",
  },
  emptyTitle: {
    color: "#183448",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    maxWidth: 520,
    color: "#74889a",
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
});
