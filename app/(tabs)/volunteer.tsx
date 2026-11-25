import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { liveUi as designUi } from "../../constants/volunserveLiveUi";
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
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

type FilterKey =
  | "new"
  | "active"
  | "completed"
  | "all";

const ACTIVE_STATUSES = [
  "accepted",
  "responding",
  "on_site",
];

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
  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  return 0;
};

const formatDateTime = (value: any) => {
  const ms = timestampMillis(value);

  if (!ms) {
    return "—";
  }

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
      return String(status || "UNKNOWN")
        .replaceAll("_", " ")
        .toUpperCase();
  }
};

const severityLabel = (severity?: string) => {
  const value = String(severity || "").toLowerCase();

  if (value === "critical") return "CRITICAL";
  if (value === "high") return "HIGH";
  if (value === "medium") return "URGENT";
  if (value === "low") return "STANDARD";

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
    default:
      return styles.statusMuted;
  }
};

const firstIncidentImage = (
  attachments?: IncidentAttachment[]
) => {
  const list =
    Array.isArray(attachments)
      ? attachments
      : [];

  const image = list.find((item) => {
    const url = String(item?.url || "");
    const type = String(item?.type || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();

    return (
      !!url &&
      (
        type.includes("image") ||
        /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ||
        /\.(png|jpe?g|webp|gif)$/i.test(name)
      )
    );
  });

  return String(image?.url || "");
};

export default function VolunteerTasks() {
  const router = useRouter();

  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [assignments, setAssignments] =
    useState<ResponseAssignment[]>([]);

  const [casesById, setCasesById] =
    useState<Record<string, DisasterCase>>({});

  const [assignmentsReady, setAssignmentsReady] =
    useState(false);

  const [error, setError] =
    useState("");

  const [busyId, setBusyId] =
    useState("");

  const [filter, setFilter] =
    useState<FilterKey>("new");

  const [completionId, setCompletionId] =
    useState("");

  const [contributionType, setContributionType] =
    useState("");

  const [contributionSummary, setContributionSummary] =
    useState("");

  const [peopleHelped, setPeopleHelped] =
    useState("0");

  const [completionNotes, setCompletionNotes] =
    useState("");

  const [situationSummary, setSituationSummary] =
    useState("");

  const [remainingNeeds, setRemainingNeeds] =
    useState<string[]>([]);

  const [remainingNeedsNote, setRemainingNeedsNote] =
    useState("");

  const [
    lguFollowUpRequired,
    setLguFollowUpRequired,
  ] = useState<boolean | null>(null);

  useEffect(() => {
    if (
      !user ||
      !profile ||
      !hasVolunteerAccess(profile)
    ) {
      setAssignments([]);
      setAssignmentsReady(true);
      return;
    }

    const assignmentsQuery = query(
      collection(db, "responseAssignments"),
      where("volunteerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const next =
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              ResponseAssignment,
              "id"
            >),
          }));

        setAssignments(next);
        setAssignmentsReady(true);
        setError("");
      },
      (problem) => {
        console.log(
          "responseAssignments listener failed",
          problem
        );

        // Never show stale counts beside a failed Firestore listener.
        setAssignments([]);
        setCasesById({});
        setAssignmentsReady(true);

        setError(
          problem.code === "permission-denied"
            ? "Your emergency assignments could not be read. Confirm that your Volunteer account is approved and the latest Firestore rules are deployed."
            : "Unable to load your emergency assignments. Check your internet connection and try again."
        );
      }
    );

    return unsubscribe;
  }, [
    user?.uid,
    profile?.volunteerAccess,
    profile?.volunteerStatus,
    profile?.identityStatus,
  ]);

  const caseIds = useMemo(
    () =>
      Array.from(
        new Set(
          assignments
            .map((assignment) => assignment.caseId)
            .filter(
              (value): value is string =>
                Boolean(value)
            )
        )
      ),
    [assignments]
  );

  const caseIdsKey =
    caseIds.join("|");

  useEffect(() => {
    if (!caseIds.length) {
      setCasesById({});
      return;
    }

    const unsubscribers =
      caseIds.map((caseId) =>
        onSnapshot(
          doc(
            db,
            "disasterCases",
            caseId
          ),
          (snapshot) => {
            if (!snapshot.exists()) {
              return;
            }

            setCasesById((current) => ({
              ...current,
              [caseId]: {
                id: snapshot.id,
                ...(snapshot.data() as Omit<
                  DisasterCase,
                  "id"
                >),
              },
            }));
          },
          (problem) => {
            /*
             * A closed or no-longer-accessible case may disappear by rule.
             * Keep the assignment itself visible instead of failing the page.
             */
            console.log(
              `Unable to load disaster case ${caseId}`,
              problem
            );
          }
        )
      );

    return () =>
      unsubscribers.forEach(
        (unsubscribe) => unsubscribe()
      );
  }, [caseIdsKey]);

  const counts = useMemo(() => {
    const newCount =
      assignments.filter(
        (item) => item.status === "offered"
      ).length;

    const activeCount =
      assignments.filter((item) =>
        ACTIVE_STATUSES.includes(
          String(item.status || "")
        )
      ).length;

    const completedCount =
      assignments.filter(
        (item) => item.status === "completed"
      ).length;

    return {
      new: newCount,
      active: activeCount,
      completed: completedCount,
      all: assignments.length,
    };
  }, [assignments]);

  const visibleAssignments =
    useMemo(() => {
      const filtered =
        assignments.filter((item) => {
          if (filter === "new") {
            return item.status === "offered";
          }

          if (filter === "active") {
            return ACTIVE_STATUSES.includes(
              String(item.status || "")
            );
          }

          if (filter === "completed") {
            return item.status === "completed";
          }

          return true;
        });

      return [...filtered].sort(
        (a, b) =>
          (
            timestampMillis(b.updatedAt) ||
            timestampMillis(b.createdAt)
          ) -
          (
            timestampMillis(a.updatedAt) ||
            timestampMillis(a.createdAt)
          )
      );
    }, [assignments, filter]);

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

  const toggleRemainingNeed = (
    item: string
  ) => {
    setRemainingNeeds((current) =>
      current.includes(item)
        ? current.filter(
            (value) => value !== item
          )
        : [...current, item].slice(0, 12)
    );
  };

  const transitionAssignment = async (
    assignment: ResponseAssignment,
    next:
      | "accepted"
      | "declined"
      | "responding"
      | "on_site"
      | "completed"
  ) => {
    if (
      !user ||
      !profile ||
      busyId
    ) {
      return;
    }

    const allowedPrevious:
      Record<string, string> = {
        accepted: "offered",
        declined: "offered",
        responding: "accepted",
        on_site: "responding",
        completed: "on_site",
      };

    try {
      setBusyId(assignment.id);
      setError("");

      await runTransaction(
        db,
        async (transaction) => {
          const assignmentRef = doc(
            db,
            "responseAssignments",
            assignment.id
          );

          const assignmentSnapshot =
            await transaction.get(
              assignmentRef
            );

          if (!assignmentSnapshot.exists()) {
            throw new Error(
              "This assignment no longer exists."
            );
          }

          const current =
            assignmentSnapshot.data() as ResponseAssignment;

          if (
            current.volunteerId !== user.uid
          ) {
            throw new Error(
              "This assignment does not belong to your account."
            );
          }

          if (
            current.status !==
            allowedPrevious[next]
          ) {
            throw new Error(
              "This assignment already changed. Check its latest status."
            );
          }

          const caseId =
            String(
              current.caseId ||
                assignment.caseId ||
                ""
            ).trim();

          let reporterUid = "";
          let caseData:
            Record<string, any> | null =
            null;

          if (
            next !== "declined" &&
            caseId
          ) {
            const caseSnapshot =
              await transaction.get(
                doc(
                  db,
                  "disasterCases",
                  caseId
                )
              );

            if (caseSnapshot.exists()) {
              caseData =
                caseSnapshot.data();

              reporterUid =
                String(
                  caseData?.reporterUid ||
                    ""
                ).trim();
            }
          }

          if (next === "completed" && (!caseId || !caseData)) {
            throw new Error("The linked emergency case is unavailable. Refresh the task before marking it complete.");
          }

          const patch:
            Record<string, any> = {
              status: next,
              updatedAt:
                serverTimestamp(),
            };

          if (next === "responding") {
            patch.responseStartedAt =
              serverTimestamp();
          }

          if (next === "on_site") {
            patch.arrivedAt =
              serverTimestamp();
          }

          if (next === "completed") {
            // Preserve the existing responseAssignment completion contract.
            // No volunteerFieldReports document is created and no assistance
            // is asserted without a Resident's separate confirmation.
            patch.contributionType = "Task completion";
            patch.contributionSummary = "Volunteer marked task complete; no field report was submitted.";
            patch.peopleHelped = 0;
            patch.completionNotes = "";
            patch.completedAt = serverTimestamp();
            patch.residentConfirmationStatus = "pending";
          }

          transaction.update(
            assignmentRef,
            patch
          );

          

          if (
            next !== "declined" &&
            caseId &&
            reporterUid &&
            reporterUid !== user.uid
          ) {
            const notificationRef =
              doc(
                collection(
                  db,
                  "notifications"
                )
              );

            const responderName =
              String(
                current.volunteerName ||
                  profile.fullName ||
                  "Volunteer"
              )
                .trim()
                .slice(0, 120) ||
              "Volunteer";

            const copy:
              Record<
                "accepted" |
                  "responding" |
                  "on_site" |
                  "completed",
                {
                  title: string;
                  message: string;
                }
              > = {
                accepted: {
                  title:
                    "Responder accepted your case",
                  message:
                    `${responderName} accepted the emergency assignment.`,
                },
                responding: {
                  title:
                    "Responder is on the way",
                  message:
                    `${responderName} has started responding to your emergency case.`,
                },
                on_site: {
                  title:
                    "Responder arrived",
                  message:
                    `${responderName} marked the response as on site.`,
                },
                completed: {
                  title:
                    "Volunteer task marked complete",
                  message:
                    `${responderName} marked their emergency support task complete. ` +
                    "Resident confirmation and Admin review are still required.",
                },
              };

            const notification =
              copy[
                next as keyof typeof copy
              ];

            transaction.set(
              notificationRef,
              {
                userId:
                  reporterUid,
                caseId,
                assignmentId:
                  assignment.id,
                responderId:
                  user.uid,
                responderName,
                title:
                  notification.title,
                message:
                  notification.message,
                type:
                  "resident_response_update",
                status: next,
                read: false,
                createdAt:
                  serverTimestamp(),
              }
            );
          }
        }
      );

      if (next === "accepted") {
        Alert.alert(
          "Assignment Accepted",
          "Select Start Response when you begin travelling or responding."
        );

        setFilter("active");
      } else if (next === "declined") {
        Alert.alert(
          "Assignment Declined",
          "Admin will see the decline and can offer the case to another qualified volunteer."
        );
      } else if (next === "responding") {
        Alert.alert(
          "Response Started",
          "Your status is now Responding. Keep the Live Response Map available while travelling to the incident."
        );
      } else if (next === "on_site") {
        Alert.alert(
          "Arrival Recorded",
          "Your status is now On Site. Complete the mission only after the assigned assistance is finished."
        );
      } else {
        Alert.alert(
          "Task Completed",
          "Your emergency support task is marked complete. Resident confirmation and Admin review are still required before the case can be closed."
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

      Alert.alert(
        "Update Failed",
        message
      );
    } finally {
      setBusyId("");
    }
  };

  const openLiveMap = (
    assignment?: ResponseAssignment
  ) => {
    if (assignment?.caseId) {
      router.push({
        pathname:
          "/map-tracking" as any,
        params: {
          caseId:
            assignment.caseId,
        },
      });

      return;
    }

    router.push(
      "/map-tracking" as any
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color="#078F82"
        />

        <Text style={styles.loadingText}>
          Loading volunteer workspace...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(profile)
  ) {
    return (
      <Redirect href="/login" />
    );
  }

  if (
    !hasVolunteerAccess(profile) ||
    activeModeForProfile(profile) !==
      "volunteer"
  ) {
    return (
      <Redirect href="/(tabs)" />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator
    >
      <View style={styles.header}>
        <View pointerEvents="none" style={styles.headerLeaf}>
          <Ionicons name="leaf-outline" size={115} color="rgba(13,133,94,0.13)" />
        </View>
        <View style={styles.titleIcon}>
          <Ionicons
            name="people"
            size={24}
            color="#078F82"
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            VOLUNSERVE · VOLUNTEER MODE
          </Text>

          <Text style={styles.title}>
            Emergency Tasks
          </Text>

          <Text style={styles.subtitle}>
            Optional Volunteer support assignments coordinated by LGU/Admin.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.liveMapButton}
        onPress={() =>
          openLiveMap()
        }
      >
        <Ionicons
          name="map-outline"
          size={19}
          color="#ffffff"
        />

        <Text style={styles.liveMapButtonText}>
          Open Live Response Map
        </Text>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {counts.new}
          </Text>
          <Text style={styles.statLabel}>
            New
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {counts.active}
          </Text>
          <Text style={styles.statLabel}>
            Active
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {counts.completed}
          </Text>
          <Text style={styles.statLabel}>
            Completed
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(
          [
            ["new", "New"],
            ["active", "Active"],
            ["completed", "Completed"],
            ["all", "All"],
          ] as [
            FilterKey,
            string
          ][]
        ).map(([key, label]) => {
          const active =
            filter === key;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterButton,
                active &&
                  styles.filterButtonActive,
              ]}
              onPress={() =>
                setFilter(key)
              }
            >
              <Text
                style={[
                  styles.filterText,
                  active &&
                    styles.filterTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons
            name="warning-outline"
            size={19}
            color="#b42318"
          />

          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      {!assignmentsReady ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator
            color="#078F82"
          />

          <Text style={styles.emptyTitle}>
            Loading assignments...
          </Text>
        </View>
      ) : visibleAssignments.length ===
        0 ? (
        <View style={styles.emptyCard}>
          <Ionicons
            name="shield-checkmark-outline"
            size={36}
            color="#078F82"
          />

          <Text style={styles.emptyTitle}>
            {filter === "new"
              ? "No new emergency assignments"
              : filter === "active"
                ? "No active missions"
                : filter ===
                    "completed"
                  ? "No completed missions yet"
                  : "No assignments yet"}
          </Text>

          <Text style={styles.emptyText}>
            New validated cases appear here after Admin assigns them to you.
          </Text>
        </View>
      ) : (
        visibleAssignments.map(
          (assignment) => {
            const incident =
              assignment.caseId
                ? casesById[
                    assignment.caseId
                  ]
                : undefined;

            const status =
              String(
                assignment.status ||
                  ""
              );

            const busy =
              busyId ===
              assignment.id;

            const imageUrl =
              firstIncidentImage(
                incident?.attachments
              );

            return (
              <View
                key={assignment.id}
                style={styles.card}
              >
                <View style={styles.mediaBox}>
                  {imageUrl ? (
                    <Image
                      source={{
                        uri: imageUrl,
                      }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={
                        styles.imageFallback
                      }
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={32}
                        color="#087f74"
                      />

                      <Text
                        style={
                          styles.imageFallbackText
                        }
                      >
                        {incident?.category ||
                          "Emergency"}
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.priorityBadge,
                      severityStyle(
                        incident?.severity
                      ),
                    ]}
                  >
                    <Text
                      style={
                        styles.priorityText
                      }
                    >
                      {severityLabel(
                        incident?.severity
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View
                    style={
                      styles.cardTitleRow
                    }
                  >
                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={
                          styles.cardTitle
                        }
                      >
                        {incident?.title ||
                          assignment.caseTitle ||
                          "Emergency Assignment"}
                      </Text>

                      <Text
                        style={
                          styles.locationText
                        }
                      >
                        📍{" "}
                        {incident?.location ||
                          "Location available in the incident record"}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        statusStyle(
                          status
                        ),
                      ]}
                    >
                      <Text
                        style={
                          styles.statusText
                        }
                      >
                        {statusLabel(
                          status
                        )}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={
                      styles.details
                    }
                  >
                    {incident?.details ||
                      "Open the assigned mission to view the validated incident details."}
                  </Text>

                  <View
                    style={
                      styles.metaGrid
                    }
                  >
                    <View
                      style={
                        styles.metaCard
                      }
                    >
                      <Text
                        style={
                          styles.metaLabel
                        }
                      >
                        ASSIGNED
                      </Text>

                      <Text
                        style={
                          styles.metaValue
                        }
                      >
                        {formatDateTime(
                          assignment.createdAt
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.metaCard
                      }
                    >
                      <Text
                        style={
                          styles.metaLabel
                        }
                      >
                        NEEDS
                      </Text>

                      <Text
                        style={
                          styles.metaValue
                        }
                      >
                        {incident?.needs ||
                          incident?.category ||
                          "Emergency response"}
                      </Text>
                    </View>
                  </View>

                  {status ===
                    "offered" && (
                    <View
                      style={
                        styles.actionRow
                      }
                    >
                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          busy &&
                            styles.disabled,
                        ]}
                        disabled={busy}
                        onPress={() =>
                          transitionAssignment(
                            assignment,
                            "accepted"
                          )
                        }
                      >
                        {busy ? (
                          <ActivityIndicator
                            color="#ffffff"
                          />
                        ) : (
                          <>
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color="#ffffff"
                            />
                            <Text
                              style={
                                styles.primaryButtonText
                              }
                            >
                              Accept
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.secondaryButton,
                          busy &&
                            styles.disabled,
                        ]}
                        disabled={busy}
                        onPress={() =>
                          transitionAssignment(
                            assignment,
                            "declined"
                          )
                        }
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color="#334155"
                        />

                        <Text
                          style={
                            styles.secondaryButtonText
                          }
                        >
                          Decline
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {status ===
                    "accepted" && (
                    <TouchableOpacity
                      style={[
                        styles.responseButton,
                        busy &&
                          styles.disabled,
                      ]}
                      disabled={busy}
                      onPress={() =>
                        transitionAssignment(
                          assignment,
                          "responding"
                        )
                      }
                    >
                      <Ionicons
                        name="navigate-circle"
                        size={19}
                        color="#ffffff"
                      />

                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        Start Response
                      </Text>
                    </TouchableOpacity>
                  )}

                  {status ===
                    "responding" && (
                    <TouchableOpacity
                      style={[
                        styles.arrivalButton,
                        busy &&
                          styles.disabled,
                      ]}
                      disabled={busy}
                      onPress={() =>
                        transitionAssignment(
                          assignment,
                          "on_site"
                        )
                      }
                    >
                      <Ionicons
                        name="location"
                        size={18}
                        color="#ffffff"
                      />

                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        Mark On Site
                      </Text>
                    </TouchableOpacity>
                  )}

                  {status === "on_site" && (
                    <TouchableOpacity
                      style={[styles.completeButton, busy && styles.disabled]}
                      disabled={busy}
                      onPress={() => transitionAssignment(assignment, "completed")}
                    >
                      {busy ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="checkmark-done" size={18} color="#ffffff" />}
                      <Text style={styles.actionButtonText}>{busy ? "Saving…" : "Mark Task Complete"}</Text>
                    </TouchableOpacity>
                  )}

                  {ACTIVE_STATUSES.includes(
                    status
                  ) && (
                    <TouchableOpacity
                      style={
                        styles.mapButton
                      }
                      onPress={() =>
                        openLiveMap(
                          assignment
                        )
                      }
                    >
                      <Ionicons
                        name="map-outline"
                        size={18}
                        color="#2563eb"
                      />

                      <Text
                        style={
                          styles.mapButtonText
                        }
                      >
                        Open Live Response Map
                      </Text>
                    </TouchableOpacity>
                  )}

                  {status ===
                    "completed" && (
                    <View
                      style={
                        styles.completedBox
                      }
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#16845b"
                      />

                      <Text
                        style={
                          styles.completedText
                        }
                      >
                        Task completed — awaiting confirmation
                      </Text>
                    </View>
                  )}

                  {(status ===
                    "declined" ||
                    status ===
                      "cancelled") && (
                    <View
                      style={
                        styles.inactiveBox
                      }
                    >
                      <Text
                        style={
                          styles.inactiveText
                        }
                      >
                        {statusLabel(
                          status
                        )}
                      </Text>
                    </View>
                  )}

                  
                </View>
              </View>
            );
          }
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F8F7",
  },

  page: {
    padding: 18,
    paddingBottom: 42,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8F7",
  },

  loadingText: {
    marginTop: 10,
    color: "#64748b",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "700",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    minHeight: 147,
    paddingHorizontal: 17,
    paddingVertical: 19,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#D3E8DC",
    backgroundColor: "#E9F8F0",
    overflow: "hidden",
  },
  headerLeaf: {
    position: "absolute", right: -19, top: -20,
    transform: [{ rotate: "20deg" }],
  },

  titleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D5EFE0",
  },

  eyebrow: {
    color: "#08765B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 0.9,
  },

  title: {
    marginTop: 2,
    color: "#173D32",
    fontSize: designUi.type.page.fontSize,
    fontWeight: designUi.type.page.fontWeight, lineHeight: designUi.type.page.lineHeight,},

  subtitle: {
    marginTop: 3,
    color: "#567D6B",
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight, fontWeight: designUi.type.body.fontWeight,},

  liveMapButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#087D60",
    marginBottom: 14,
  },

  liveMapButtonText: {
    color: "#ffffff",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  statCard: {
    flex: 1,
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e1e8ee",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },

  statValue: {
    color: "#123047",
    fontSize: vsType.size.titleSmall, fontFamily: vsType.family,
    fontWeight: "800",
  },

  statLabel: {
    marginTop: 2,
    color: "#64748b",
    fontSize: designUi.type.label.fontSize,
    fontWeight: designUi.type.label.fontWeight, lineHeight: designUi.type.label.lineHeight,},

  filterRow: {
    gap: 7,
    paddingBottom: 12,
  },

  filterButton: {
    minHeight: 37,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },

  filterButtonActive: {
    borderColor: "#a9ded1",
    backgroundColor: "#edf9f5",
  },

  filterText: {
    color: "#64748b",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  filterTextActive: {
    color: "#087f74",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f2c6c1",
    borderRadius: 11,
    backgroundColor: "#fff3f2",
  },

  errorText: {
    flex: 1,
    color: "#b42318",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "700",
  },

  card: {
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },

  mediaBox: {
    height: 170,
    position: "relative",
    backgroundColor: "#edf3f5",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  imageFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf7f4",
  },

  imageFallbackText: {
    marginTop: 6,
    color: "#587084",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  priorityBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
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

  priorityText: {
    color: "#ffffff",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  cardBody: {
    padding: 14,
  },

  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  cardTitle: {
    color: "#10283d",
    fontSize: designUi.type.card.fontSize,
    lineHeight: designUi.type.card.lineHeight,
    fontWeight: designUi.type.card.fontWeight,
  },

  locationText: {
    marginTop: 4,
    color: "#587084",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
    fontWeight: "700",
  },

  statusBadge: {
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

  statusText: {
    color: "#31475a",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  details: {
    marginTop: 11,
    color: "#64788b",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 18,
  },

  metaGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  metaCard: {
    flex: 1,
    minHeight: 62,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f7f9fb",
  },

  metaLabel: {
    color: "#7d8f9f",
    fontSize: designUi.type.meta.fontSize,
    fontWeight: designUi.type.meta.fontWeight,
    letterSpacing: 0.4, lineHeight: designUi.type.meta.lineHeight,},

  metaValue: {
    marginTop: 4,
    color: "#294256",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 15,
    fontWeight: "800",
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },

  primaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: "#0aa16f",
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  secondaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#b7c4cf",
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },

  secondaryButtonText: {
    color: "#334155",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  responseButton: {
    minHeight: 44,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },

  arrivalButton: {
    minHeight: 44,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: "#7c3aed",
  },

  completeButton: {
    minHeight: 44,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: "#16845b",
  },

  actionButtonText: {
    color: "#ffffff",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mapButton: {
    minHeight: 43,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 10,
    backgroundColor: "#eff6ff",
  },

  mapButtonText: {
    color: "#2563eb",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  completedBox: {
    minHeight: 44,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#edf8f3",
  },

  completedText: {
    flex: 1,
    color: "#16845b",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
    textAlign: "center",
  },

  inactiveBox: {
    minHeight: 42,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#f1f4f7",
  },

  inactiveText: {
    color: "#64748b",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  completionPanel: {
    marginTop: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: "#cfe4df",
    borderRadius: 12,
    backgroundColor: "#fbfefd",
  },

  completionTitle: {
    color: "#183448",
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight, lineHeight: designUi.type.section.lineHeight,},

  completionHint: {
    marginTop: 3,
    marginBottom: 7,
    color: "#64748b",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 15,
  },

  inputLabel: {
    marginTop: 10,
    marginBottom: 6,
    color: "#334155",
    fontSize: designUi.type.label.fontSize,
    fontWeight: designUi.type.label.fontWeight, lineHeight: designUi.type.label.lineHeight,},

  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  typeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },

  typeButtonActive: {
    borderColor: "#078F82",
    backgroundColor: "#e8f6f2",
  },

  typeButtonText: {
    color: "#64748b",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  typeButtonTextActive: {
    color: "#087f74",
  },

  needButtonActive: {
    borderColor: "#d97706",
    backgroundColor: "#fff7ed",
  },

  needButtonTextActive: {
    color: "#b45309",
  },

  followUpRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  followUpButton: {
    minHeight: 42,
    flex: 1,
    minWidth: 145,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#d7e0e7",
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },

  followUpButtonActive: {
    borderColor: "#d97706",
    backgroundColor: "#d97706",
  },

  followUpButtonSafe: {
    borderColor: "#16845b",
    backgroundColor: "#16845b",
  },

  followUpButtonText: {
    color: "#475569",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    textAlign: "center",
  },

  followUpButtonTextActive: {
    color: "#ffffff",
  },

  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d7e0e7",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#183448",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
  },

  multilineInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },

  multilineInputSmall: {
    minHeight: 74,
    textAlignVertical: "top",
  },

  trustNotice: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#edf9f5",
  },

  trustNoticeText: {
    flex: 1,
    color: "#527267",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 15,
    fontWeight: "600",
  },

  submitCompletionButton: {
    minHeight: 44,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: "#0aa16f",
  },

  disabled: {
    opacity: 0.55,
  },

  emptyCard: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 15,
    backgroundColor: "#ffffff",
  },

  emptyTitle: {
    marginTop: 10,
    color: "#183448",
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight,
    textAlign: "center", lineHeight: designUi.type.section.lineHeight,},

  emptyText: {
    marginTop: 5,
    color: "#74889a",
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight,
    textAlign: "center", fontWeight: designUi.type.body.fontWeight,},
});
