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
  TextInput,
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
  responseStartedAt?: any;
  arrivedAt?: any;
  completedAt?: any;
  contributionType?: string;
  contributionSummary?: string;
  peopleHelped?: number;
  completionNotes?: string;
  residentConfirmationStatus?: string;
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
  reporterBarangay?: string;
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

const COMPLETION_TYPES = [
  "Emergency Response",
  "Evacuation Assistance",
  "Medical / First Aid",
  "Transport / Logistics",
  "Relief / Goods Delivery",
  "Clearing / Heavy Lifting",
  "Safety / Welfare Check",
  "Other",
];

const FIELD_NEED_OPTIONS = [
  "Food",
  "Water",
  "Clothing",
  "Temporary Shelter",
  "Medical",
  "Hygiene",
  "Transport",
  "Other",
];

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
  if (value === "medium") return "URGENT PRIORITY";
  if (value === "low") return "STANDARD PRIORITY";
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
  mobile,
  narrowMobile,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: "red" | "blue" | "green" | "neutral";
  mobile?: boolean;
  narrowMobile?: boolean;
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
    <View style={[styles.statCard, mobile && styles.statCardMobile, narrowMobile && styles.statCardNarrow]}>
      <View style={[styles.statIcon, toneBox, mobile && styles.statIconMobile]}>
        <Ionicons name={icon} size={22} color="#0f172a" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.statValue, toneText]}>{value}</Text>
        <Text style={[styles.statLabel, mobile && styles.statLabelMobile]}>{label}</Text>
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

  const [completionId, setCompletionId] = useState("");
  const [contributionType, setContributionType] = useState("");
  const [contributionSummary, setContributionSummary] = useState("");
  const [peopleHelped, setPeopleHelped] = useState("0");
  const [completionNotes, setCompletionNotes] = useState("");
  const [situationSummary, setSituationSummary] = useState("");
  const [remainingNeeds, setRemainingNeeds] = useState<string[]>([]);
  const [remainingNeedsNote, setRemainingNeedsNote] = useState("");
  const [lguFollowUpRequired, setLguFollowUpRequired] =
    useState<boolean | null>(null);

  const compact = width < 1120;
  // Mobile browser layout only. Desktop interactions/data remain unchanged.
  const mobile = width <= 700;
  const narrowMobile = width <= 350;

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

  const resetCompletion = () => {
    setCompletionId("");
    setContributionType("");
    setContributionSummary("");
    setPeopleHelped("0");
    setCompletionNotes("");
    setSituationSummary("");
    setRemainingNeeds([]);
    setRemainingNeedsNote("");
    setLguFollowUpRequired(null);
  };

  const toggleRemainingNeed = (item: string) => {
    setRemainingNeeds((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item].slice(0, 12),
    );
  };

  const transitionAssignment = async (
    assignment: ResponseAssignment,
    next: "accepted" | "declined" | "responding" | "on_site" | "completed",
  ) => {
    if (!user || !profile || busyId) return;

    const allowedPrevious: Record<string, string> = {
      accepted: "offered",
      declined: "offered",
      responding: "accepted",
      on_site: "responding",
      completed: "on_site",
    };

    const people = Number(peopleHelped);

    if (next === "completed") {
      if (situationSummary.trim().length < 10) {
        setError(
          "Describe the actual situation you observed on site in at least 10 characters.",
        );
        return;
      }

      if (!contributionType.trim()) {
        setError("Select the type of service you provided.");
        return;
      }

      if (contributionSummary.trim().length < 10) {
        setError("Describe the assistance you actually provided in at least 10 characters.");
        return;
      }

      if (!Number.isInteger(people) || people < 0 || people > 999) {
        setError("People helped must be a whole number from 0 to 999.");
        return;
      }

      if (remainingNeeds.includes("Other") && remainingNeedsNote.trim().length < 3) {
        setError("Describe the remaining need selected as Other.");
        return;
      }

      if (remainingNeedsNote.trim().length > 1500) {
        setError("Remaining-needs notes must be 1500 characters or fewer.");
        return;
      }

      if (lguFollowUpRequired === null) {
        setError("Select whether LGU/Admin follow-up is still required.");
        return;
      }

      if (completionNotes.trim().length > 600) {
        setError("Completion notes must be 600 characters or fewer.");
        return;
      }
    }

    try {
      setBusyId(assignment.id);
      setError("");

      await runTransaction(db, async (transaction) => {
        const assignmentRef = doc(db, "responseAssignments", assignment.id);
        const assignmentSnapshot = await transaction.get(assignmentRef);

        if (!assignmentSnapshot.exists()) {
          throw new Error("This assignment no longer exists.");
        }

        const current = assignmentSnapshot.data() as ResponseAssignment;

        if (current.volunteerId !== user.uid) {
          throw new Error("This assignment does not belong to your account.");
        }

        if (current.status !== allowedPrevious[next]) {
          throw new Error(
            "This assignment already changed. Refresh and check its latest status.",
          );
        }

        const caseId = String(current.caseId || assignment.caseId || "").trim();
        let reporterUid = "";
        let caseData: Record<string, any> | null = null;

        if (next !== "declined" && caseId) {
          const caseSnapshot = await transaction.get(
            doc(db, "disasterCases", caseId),
          );

          if (caseSnapshot.exists()) {
            caseData = caseSnapshot.data();
            reporterUid = String(caseData?.reporterUid || "").trim();
          }
        }

        if (next === "completed") {
          if (!caseId || !caseData) {
            throw new Error(
              "The linked emergency case could not be loaded. The field report cannot be submitted.",
            );
          }

          const barangay = String(caseData.reporterBarangay || "").trim();

          if (barangay.length < 2) {
            throw new Error(
              "The emergency case has no valid barangay. Ask LGU/Admin to correct the case before completing this mission.",
            );
          }
        }

        const patch: Record<string, any> = {
          status: next,
          updatedAt: serverTimestamp(),
        };

        if (next === "responding") {
          patch.responseStartedAt = serverTimestamp();
        }

        if (next === "on_site") {
          patch.arrivedAt = serverTimestamp();
        }

        if (next === "completed") {
          patch.contributionType = contributionType.trim().slice(0, 100);
          patch.contributionSummary = contributionSummary.trim().slice(0, 1200);
          patch.peopleHelped = people;
          patch.completionNotes = completionNotes.trim().slice(0, 600);
          patch.completedAt = serverTimestamp();
          patch.residentConfirmationStatus = "pending";
        }

        transaction.update(assignmentRef, patch);

        if (next === "completed" && caseId && caseData) {
          const volunteerName =
            String(current.volunteerName || profile.fullName || "Volunteer")
              .trim()
              .slice(0, 120) || "Volunteer";

          const barangay = String(caseData.reporterBarangay || "")
            .trim()
            .slice(0, 120);

          transaction.set(
            doc(db, "volunteerFieldReports", assignment.id),
            {
              assignmentId: assignment.id,
              caseId,

              volunteerId: user.uid,
              volunteerName,
              barangay,

              situationSummary: situationSummary.trim().slice(0, 2000),
              assistanceProvided: contributionSummary.trim().slice(0, 2000),
              peopleHelped: people,

              remainingNeeds: remainingNeeds.slice(0, 12),
              remainingNeedsNote: remainingNeedsNote.trim().slice(0, 1500),
              lguFollowUpRequired: lguFollowUpRequired === true,

              evidenceUrls: [],

              reportStatus: "submitted",
              adminReviewNote: "",

              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              reviewedAt: null,
              reviewedBy: "",
            },
          );
        }

        if (
          next !== "declined" &&
          caseId &&
          reporterUid &&
          reporterUid !== user.uid
        ) {
          const notificationRef = doc(collection(db, "notifications"));
          const responderName =
            String(current.volunteerName || profile.fullName || "Volunteer")
              .trim()
              .slice(0, 120) || "Volunteer";

          const copy: Record<
            "accepted" | "responding" | "on_site" | "completed",
            { title: string; message: string }
          > = {
            accepted: {
              title: "Responder accepted your case",
              message: `${responderName} accepted the emergency assignment.`,
            },
            responding: {
              title: "Responder is on the way",
              message: `${responderName} has started responding to your emergency case.`,
            },
            on_site: {
              title: "Responder arrived",
              message: `${responderName} marked the response as on site.`,
            },
            completed: {
              title: "Volunteer field report submitted",
              message:
                `${responderName} completed the assigned support response and submitted a field report to LGU/Admin. ` +
                "LGU will review any remaining needs and decide the next action.",
            },
          };

          const notification = copy[next as keyof typeof copy];

          transaction.set(notificationRef, {
            userId: reporterUid,
            caseId,
            assignmentId: assignment.id,
            responderId: user.uid,
            responderName,
            title: notification.title,
            message: notification.message,
            type: "resident_response_update",
            status: next,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      });

      if (next === "accepted") {
        showMessage(
          "Assignment accepted",
          "The assignment is accepted. Select Start Response when you begin travelling or responding.",
        );
        setFilter("active");
      } else if (next === "declined") {
        showMessage(
          "Assignment declined",
          "Admin will see the decline and can offer the case to another qualified volunteer.",
        );
      } else if (next === "responding") {
        showMessage(
          "Response started",
          "Your status is now Responding. Use the Live Response Map while travelling to the incident.",
        );
      } else if (next === "on_site") {
        showMessage(
          "Arrival recorded",
          "Your status is now On Site. Complete the mission only after the assigned assistance is finished.",
        );
      } else {
        showMessage(
          "Field report submitted",
          "Your mission completion and field report were sent to LGU/Admin. This does not automatically close the emergency case. LGU will review any remaining needs and decide the next action.",
        );
        resetCompletion();
        setFilter("completed");
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
      contentContainerStyle={[styles.page, mobile && styles.pageMobile]}
      showsVerticalScrollIndicator
    >
      {/* On phones, render the header as independently sized blocks.
          Keeping the button outside title row prevents RN Web flex overlap. */}
      {mobile ? (
        <View style={styles.mobileTaskHeader}>
          <Text style={styles.mobileTaskEyebrow}>
            VOLUNSERVE · VOLUNTEER MODE
          </Text>
          <View style={styles.mobileTaskTitleRow}>
            <View style={styles.mobileTaskIcon}>
              <Ionicons name="people" size={22} color="#087F74" />
            </View>
            <View style={styles.mobileTaskTitleContainer}>
              <Text style={styles.mobileTaskTitle}>Emergency Tasks</Text>
            </View>
          </View>
          <Text style={styles.mobileTaskDescription}>
            Optional volunteer support assignments coordinated by LGU/Admin.
          </Text>
          <TouchableOpacity
            style={styles.mobileTaskMapButton}
            onPress={() => openLiveMap()}
            activeOpacity={0.85}
          >
            <Ionicons name="map-outline" size={19} color="#FFFFFF" />
            <Text style={styles.mobileTaskMapText}>Open Live Response Map</Text>
            <Ionicons name="arrow-forward-outline" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>VOLUNSERVE · VOLUNTEER MODE</Text>
            <View style={styles.titleRow}>
              <View style={styles.titleIcon}>
                <Ionicons name="people" size={24} color="#078F82" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>Emergency Tasks</Text>
                <Text style={styles.subtitle}>
                  Optional Volunteer support assignments coordinated by LGU/Admin.
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
      )}

      <View style={[styles.liveStrip, mobile && styles.liveStripMobile]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveStripText}>LIVE FIRESTORE</Text>
        <Text style={styles.liveStripSubtext}>
          Assignments update automatically.
        </Text>
      </View>

      <View style={[styles.statsGrid, mobile && styles.statsGridMobile]}>
        <StatCard
          icon="clipboard-outline"
          value={counts.new}
          label="New Assignments"
          mobile={mobile}
          narrowMobile={narrowMobile}
          tone="red"
        />
        <StatCard
          icon="navigate-circle-outline"
          value={counts.active}
          label="In Progress"
          mobile={mobile}
          narrowMobile={narrowMobile}
          tone="blue"
        />
        <StatCard
          icon="checkmark-circle-outline"
          value={counts.completed}
          label="Completed"
          mobile={mobile}
          narrowMobile={narrowMobile}
          tone="green"
        />
        <StatCard
          icon="time-outline"
          value={counts.all}
          label="Total Assignments"
          mobile={mobile}
          narrowMobile={narrowMobile}
          tone="neutral"
        />
      </View>

      <View style={[styles.toolbar, compact && styles.toolbarCompact, mobile && styles.toolbarMobile]}>
        <View style={[styles.filters, mobile && styles.filtersMobile]}>
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
              style={[styles.filterButton, mobile && styles.filterButtonMobile, filter === key && styles.filterButtonActive]}
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
          style={[styles.sortButton, mobile && styles.sortButtonMobile]}
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
        <View style={[styles.emptyCard, mobile && styles.emptyCardMobile]}>
          <ActivityIndicator color="#078F82" />
          <Text style={styles.emptyTitle}>Loading assignments…</Text>
        </View>
      ) : visibleAssignments.length === 0 ? (
        <View style={[styles.emptyCard, mobile && styles.emptyCardMobile]}>
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
        <View style={[styles.cardsList, mobile && styles.cardsListMobile]}>
          {visibleAssignments.map((assignment) => {
            const incident = assignment.caseId
              ? casesById[assignment.caseId]
              : undefined;
            const status = String(assignment.status || "");
            const offered = status === "offered";
            const active = ACTIVE_STATUSES.includes(status);
            const busy = busyId === assignment.id;

            return (
              <React.Fragment key={assignment.id}>
                <View
                  style={[styles.assignmentCard, compact && styles.assignmentCardCompact, mobile && styles.assignmentCardMobile]}
                >
                <View style={[styles.mediaWrap, compact && styles.mediaWrapCompact, mobile && styles.mediaWrapMobile]}>
                  <IncidentMedia incident={incident} />
                  <View style={[styles.priorityBadge, severityStyle(incident?.severity)]}>
                    <Ionicons name="warning" size={12} color="#ffffff" />
                    <Text style={styles.priorityBadgeText}>
                      {severityLabel(incident?.severity)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.assignmentBody, mobile && styles.assignmentBodyMobile]}>
                  <View style={[styles.assignmentHeadingRow, mobile && styles.assignmentHeadingRowMobile]}>
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

                  <View style={[styles.metaGrid, mobile && styles.metaGridMobile]}>
                    <View style={[styles.metaItem, mobile && styles.metaItemMobile]}>
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

                    <View style={[styles.metaItem, mobile && styles.metaItemMobile]}>
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

                    <View style={[styles.metaItem, mobile && styles.metaItemMobile]}>
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

                <View style={[styles.actionsColumn, compact && styles.actionsColumnCompact, mobile && styles.actionsColumnMobile]}>
                  {offered && (
                    <>
                      <TouchableOpacity
                        style={[styles.acceptButton, busy && styles.buttonDisabled]}
                        disabled={busy}
                        onPress={() => transitionAssignment(assignment, "accepted")}
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
                        onPress={() => transitionAssignment(assignment, "declined")}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="close" size={20} color="#123047" />
                        <Text style={styles.declineButtonText}>Decline</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {status === "accepted" && (
                    <TouchableOpacity
                      style={[styles.responseButton, busy && styles.buttonDisabled]}
                      disabled={busy}
                      onPress={() => transitionAssignment(assignment, "responding")}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="navigate-circle" size={19} color="#ffffff" />
                      <Text style={styles.responseButtonText}>Start Response</Text>
                    </TouchableOpacity>
                  )}

                  {status === "responding" && (
                    <TouchableOpacity
                      style={[styles.arrivalButton, busy && styles.buttonDisabled]}
                      disabled={busy}
                      onPress={() => transitionAssignment(assignment, "on_site")}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="location" size={18} color="#ffffff" />
                      <Text style={styles.arrivalButtonText}>Mark On Site</Text>
                    </TouchableOpacity>
                  )}

                  {status === "on_site" && (
                    <TouchableOpacity
                      style={styles.completeButton}
                      onPress={() => {
                        if (completionId === assignment.id) {
                          resetCompletion();
                        } else {
                          resetCompletion();
                          setCompletionId(assignment.id);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-done" size={18} color="#ffffff" />
                      <Text style={styles.completeButtonText}>
                        {completionId === assignment.id
                          ? "Hide Field Report"
                          : "Complete & Report to LGU"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {active && (
                    <TouchableOpacity
                      style={styles.openMissionButton}
                      onPress={() => openLiveMap(assignment)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="map-outline" size={18} color="#ffffff" />
                      <Text style={styles.openMissionButtonText}>
                        Open Live Map
                      </Text>
                    </TouchableOpacity>
                  )}

                  {status === "completed" && (
                    <View style={styles.completedBox}>
                      <Ionicons name="checkmark-circle" size={20} color="#16845b" />
                      <Text style={styles.completedBoxText}>
                        Field report submitted to LGU/Admin
                      </Text>
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

              {completionId === assignment.id && status === "on_site" && (
                <View style={[styles.completionPanel, mobile && styles.completionPanelMobile]}>
                  <View style={styles.completionHeader}>
                    <View>
                      <Text style={styles.completionEyebrow}>
                        LGU FIELD REPORT
                      </Text>
                      <Text style={styles.completionTitle}>
                        Complete your support assignment and report the situation
                      </Text>
                    </View>

                    <TouchableOpacity onPress={resetCompletion}>
                      <Ionicons name="close" size={21} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.completionNoticeBox}>
                    LGU/Admin remains the primary responder and final authority.
                    This report records what you observed, what you actually did,
                    and what needs may still require LGU action.
                  </Text>

                  <Text style={styles.completionLabel}>
                    Situation observed on site
                  </Text>
                  <TextInput
                    style={[styles.completionInput, styles.completionMultiline]}
                    value={situationSummary}
                    onChangeText={setSituationSummary}
                    placeholder="Describe the actual condition of the resident, household, or affected area when you arrived."
                    placeholderTextColor="#94a3b8"
                    multiline
                    maxLength={2000}
                  />

                  <Text style={styles.completionLabel}>Contribution type</Text>
                  <View style={styles.completionTypeGrid}>
                    {COMPLETION_TYPES.map((item) => {
                      const selected = contributionType === item;

                      return (
                        <TouchableOpacity
                          key={item}
                          style={[
                            styles.completionTypeButton,
                            selected && styles.completionTypeButtonActive,
                          ]}
                          onPress={() => setContributionType(item)}
                        >
                          <Text
                            style={[
                              styles.completionTypeText,
                              selected && styles.completionTypeTextActive,
                            ]}
                          >
                            {item}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.completionLabel}>
                    Assistance actually provided
                  </Text>
                  <TextInput
                    style={[styles.completionInput, styles.completionMultiline]}
                    value={contributionSummary}
                    onChangeText={setContributionSummary}
                    placeholder="Describe what you actually did during this assigned support response."
                    placeholderTextColor="#94a3b8"
                    multiline
                    maxLength={1200}
                  />

                  <View
                    style={[
                      styles.completionPair,
                      compact && styles.completionPairCompact,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.completionLabel}>People helped</Text>
                      <TextInput
                        style={styles.completionInput}
                        value={peopleHelped}
                        onChangeText={(value) =>
                          setPeopleHelped(
                            value.replace(/[^0-9]/g, "").slice(0, 3),
                          )
                        }
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>

                    <View style={{ flex: 2 }}>
                      <Text style={styles.completionLabel}>
                        Completion notes (optional)
                      </Text>
                      <TextInput
                        style={styles.completionInput}
                        value={completionNotes}
                        onChangeText={setCompletionNotes}
                        placeholder="Any other operational note for LGU/Admin."
                        placeholderTextColor="#94a3b8"
                        maxLength={600}
                      />
                    </View>
                  </View>

                  <Text style={styles.completionLabel}>
                    Remaining needs observed (optional)
                  </Text>
                  <View style={styles.completionTypeGrid}>
                    {FIELD_NEED_OPTIONS.map((item) => {
                      const selected = remainingNeeds.includes(item);

                      return (
                        <TouchableOpacity
                          key={item}
                          style={[
                            styles.completionTypeButton,
                            selected && styles.remainingNeedButtonActive,
                          ]}
                          onPress={() => toggleRemainingNeed(item)}
                        >
                          <Text
                            style={[
                              styles.completionTypeText,
                              selected && styles.remainingNeedTextActive,
                            ]}
                          >
                            {item}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.completionLabel}>
                    Remaining-needs details (optional)
                  </Text>
                  <TextInput
                    style={[styles.completionInput, styles.completionMultilineSmall]}
                    value={remainingNeedsNote}
                    onChangeText={setRemainingNeedsNote}
                    placeholder="Add details that LGU/Admin should verify, such as temporary shelter, food, clothing, medicine, or other recovery needs."
                    placeholderTextColor="#94a3b8"
                    multiline
                    maxLength={1500}
                  />

                  <Text style={styles.completionLabel}>
                    Does LGU/Admin still need to follow up?
                  </Text>
                  <View style={styles.followUpRow}>
                    <TouchableOpacity
                      style={[
                        styles.followUpButton,
                        lguFollowUpRequired === true &&
                          styles.followUpButtonWarning,
                      ]}
                      onPress={() => setLguFollowUpRequired(true)}
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={16}
                        color={
                          lguFollowUpRequired === true
                            ? "#ffffff"
                            : "#b45309"
                        }
                      />
                      <Text
                        style={[
                          styles.followUpButtonText,
                          lguFollowUpRequired === true &&
                            styles.followUpButtonTextActive,
                        ]}
                      >
                        Yes, follow-up needed
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.followUpButton,
                        lguFollowUpRequired === false &&
                          styles.followUpButtonSafe,
                      ]}
                      onPress={() => setLguFollowUpRequired(false)}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={16}
                        color={
                          lguFollowUpRequired === false
                            ? "#ffffff"
                            : "#16845b"
                        }
                      />
                      <Text
                        style={[
                          styles.followUpButtonText,
                          lguFollowUpRequired === false &&
                            styles.followUpButtonTextActive,
                        ]}
                      >
                        No further field follow-up
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.completionFooter, mobile && styles.completionFooterMobile]}>
                    <Text style={styles.completionNotice}>
                      Submitting completes only your Volunteer assignment and
                      sends the field report to LGU/Admin. It does not close the
                      emergency case, approve relief goods, or grant service
                      credit automatically.
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.submitCompletionButton,
                        mobile && styles.submitCompletionButtonMobile,
                        busy && styles.buttonDisabled,
                      ]}
                      disabled={busy}
                      onPress={() =>
                        transitionAssignment(assignment, "completed")
                      }
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color="#ffffff"
                        />
                      )}
                      <Text style={styles.submitCompletionText}>
                        Submit Field Report & Complete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              </React.Fragment>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Mobile-only Emergency Tasks header. Desktop remains unchanged.
  mobileTaskHeader: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2EBEE",
  },
  mobileTaskEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#087F74",
    marginBottom: 12,
  },
  mobileTaskTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  mobileTaskIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#E5F6F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  mobileTaskTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  mobileTaskTitle: {
    color: "#173D32",
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 29,
    letterSpacing: -0.35,
  },
  mobileTaskDescription: {
    width: "100%",
    fontSize: 13,
    lineHeight: 19,
    color: "#607588",
    marginBottom: 14,
  },
  mobileTaskMapButton: {
    width: "100%",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#0A9C73",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileTaskMapText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    marginHorizontal: 9,
  },
  // Responsive mobile-browser overrides. No navigation, authorization, or Firebase changes.
  pageMobile: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 32,
    maxWidth: "100%",
  },
  headerRowMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  headerCopyMobile: {
    flex: 0,
    width: "100%",
    minWidth: 0,
  },
  titleRowMobile: {
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  titleIconMobile: {
    height: 42,
    width: 42,
    borderRadius: 13,
    marginTop: 2,
  },
  titleMobile: {
    fontSize: 25,
    lineHeight: 31,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  subtitleMobile: {
    fontSize: 12.5,
    lineHeight: 18,
    flexShrink: 1,
  },
  liveMapButtonMobile: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 46,
    paddingHorizontal: 10,
  },
  liveStripMobile: {
    alignSelf: "stretch",
    width: "100%",
    justifyContent: "center",
    flexWrap: "wrap",
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  statsGridMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
  },
  statCardMobile: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 0,
    minHeight: 88,
    paddingHorizontal: 11,
    paddingVertical: 11,
    gap: 9,
  },
  statCardNarrow: {
    flexBasis: "100%",
  },
  statIconMobile: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  statLabelMobile: {
    fontSize: 11,
    lineHeight: 15,
    flexShrink: 1,
  },
  toolbarMobile: {
    width: "100%",
    flexDirection: "column",
    gap: 10,
    alignItems: "stretch",
  },
  filtersMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  filterButtonMobile: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 0,
    minHeight: 42,
    paddingHorizontal: 8,
  },
  sortButtonMobile: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 42,
  },
  emptyCardMobile: {
    minHeight: 210,
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  cardsListMobile: {
    width: "100%",
  },
  assignmentCardMobile: {
    flexDirection: "column",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 12,
    padding: 11,
    minHeight: 0,
  },
  mediaWrapMobile: {
    width: "100%",
    height: 170,
    minHeight: 170,
  },
  assignmentBodyMobile: {
    flex: 0,
    width: "100%",
    minWidth: 0,
    paddingVertical: 0,
  },
  assignmentHeadingRowMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  metaGridMobile: {
    width: "100%",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItemMobile: {
    minWidth: 0,
    flexBasis: "100%",
    flexGrow: 1,
    width: "100%",
  },
  actionsColumnMobile: {
    width: "100%",
    flexDirection: "column",
    flexWrap: "nowrap",
    gap: 8,
    paddingLeft: 0,
  },
  completionPanelMobile: {
    padding: 13,
  },
  completionFooterMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  submitCompletionButtonMobile: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 46,
  },

  screen: {
    flex: 1,
    backgroundColor: "#F6F8F7",
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
    backgroundColor: "#F6F8F7",
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
    fontWeight: "700",
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
    color: "#173D32",
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "700",
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
  responseButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  responseButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  arrivalButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#7c3aed",
  },
  arrivalButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  completeButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#16845b",
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  completionPanel: {
    marginTop: -1,
    marginBottom: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: "#cfe4df",
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    backgroundColor: "#fbfefd",
  },
  completionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  completionEyebrow: {
    color: "#078F82",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  completionTitle: {
    marginTop: 3,
    color: "#183448",
    fontSize: 15,
    fontWeight: "900",
  },
  completionLabel: {
    marginTop: 9,
    marginBottom: 6,
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "900",
  },
  completionTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  completionTypeButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  completionTypeButtonActive: {
    borderColor: "#078F82",
    backgroundColor: "#e8f6f2",
  },
  completionTypeText: {
    color: "#64748b",
    fontSize: 9.5,
    fontWeight: "800",
  },
  completionTypeTextActive: {
    color: "#087f74",
  },
  remainingNeedButtonActive: {
    borderColor: "#d97706",
    backgroundColor: "#fff7ed",
  },
  remainingNeedTextActive: {
    color: "#b45309",
  },
  completionNoticeBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1eee5",
    backgroundColor: "#eef8f5",
    color: "#527267",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  completionInput: {
    minHeight: 43,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d7e0e7",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#183448",
    fontSize: 11,
  },
  completionMultiline: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  completionMultilineSmall: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  followUpRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  followUpButton: {
    minHeight: 42,
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d7e0e7",
    backgroundColor: "#ffffff",
  },
  followUpButtonWarning: {
    borderColor: "#d97706",
    backgroundColor: "#d97706",
  },
  followUpButtonSafe: {
    borderColor: "#16845b",
    backgroundColor: "#16845b",
  },
  followUpButtonText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },
  followUpButtonTextActive: {
    color: "#ffffff",
  },
  completionPair: {
    flexDirection: "row",
    gap: 10,
  },
  completionPairCompact: {
    flexDirection: "column",
  },
  completionFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  completionNotice: {
    flex: 1,
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
  },
  submitCompletionButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: "#0aa16f",
  },
  submitCompletionText: {
    color: "#ffffff",
    fontSize: 10.5,
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
