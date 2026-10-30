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

    const people =
      Number(peopleHelped);

    if (next === "completed") {
      if (
        situationSummary.trim().length < 10
      ) {
        Alert.alert(
          "Situation Summary Required",
          "Describe the actual situation you observed on site in at least 10 characters."
        );
        return;
      }

      if (!contributionType.trim()) {
        Alert.alert(
          "Contribution Type Required",
          "Select the type of assistance you provided."
        );
        return;
      }

      if (
        contributionSummary.trim().length < 10
      ) {
        Alert.alert(
          "Assistance Provided Required",
          "Describe the assistance you actually provided in at least 10 characters."
        );
        return;
      }

      if (
        !Number.isInteger(people) ||
        people < 0 ||
        people > 999
      ) {
        Alert.alert(
          "People Helped",
          "Enter a whole number from 0 to 999."
        );
        return;
      }

      if (
        remainingNeeds.includes("Other") &&
        remainingNeedsNote.trim().length < 3
      ) {
        Alert.alert(
          "Describe Other Need",
          "Add a short note describing the other remaining need."
        );
        return;
      }

      if (
        remainingNeedsNote.trim().length > 1500
      ) {
        Alert.alert(
          "Remaining Needs Note",
          "Remaining-needs notes must be 1500 characters or fewer."
        );
        return;
      }

      if (lguFollowUpRequired === null) {
        Alert.alert(
          "LGU Follow-up Required?",
          "Select Yes or No so LGU/Admin knows whether further action is needed."
        );
        return;
      }

      if (
        completionNotes.trim().length > 600
      ) {
        Alert.alert(
          "Completion Notes",
          "Completion notes must be 600 characters or fewer."
        );
        return;
      }
    }

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

          const lockRef = doc(db, "responderLocks", user.uid);
          const lockSnapshot =
            ["accepted", "responding", "on_site", "completed"].includes(next)
              ? await transaction.get(lockRef)
              : null;
          if (next === "accepted") {
            if (assignments.some(item =>
              item.id !== assignment.id &&
              ["accepted", "responding", "on_site"].includes(String(item.status))
            )) {
              throw new Error("Complete your current emergency response before accepting a new invitation.");
            }
            if (lockSnapshot?.exists()) {
              throw new Error("You already have an active emergency response. Finish it before accepting another invitation.");
            }
          }

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

          if (next === "accepted" && (
            !caseData ||
            !["validated", "assigned", "in_progress"].includes(String(caseData.status)) ||
            String(caseData.verificationStatus || "validated") !== "validated" ||
            String(caseData.reporterUid || "") === user.uid
          )) {
            throw new Error("This emergency must be validated and cannot be your own report.");
          }

          if (next === "completed") {
            if (!caseId || !caseData) {
              throw new Error(
                "The linked emergency case could not be loaded. The field report cannot be submitted."
              );
            }

            const barangay =
              String(
                caseData.reporterBarangay ||
                  ""
              ).trim();

            if (barangay.length < 2) {
              throw new Error(
                "The emergency case has no valid barangay. Ask LGU/Admin to correct the case before completing this mission."
              );
            }
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
            patch.contributionType =
              contributionType
                .trim()
                .slice(0, 100);

            patch.contributionSummary =
              contributionSummary
                .trim()
                .slice(0, 1200);

            patch.peopleHelped =
              people;

            patch.completionNotes =
              completionNotes
                .trim()
                .slice(0, 600);

            patch.completedAt =
              serverTimestamp();

            patch.residentConfirmationStatus =
              "pending";
          }

          transaction.update(
            assignmentRef,
            patch
          );
          if (next === "accepted") {
            transaction.set(lockRef, {
              responderUid: user.uid,
              assignmentId: assignment.id,
              caseId,
              status: "accepted",
              updatedAt: serverTimestamp(),
            });
          } else if (
            (next === "responding" || next === "on_site") &&
            lockSnapshot?.exists() &&
            lockSnapshot.data()?.assignmentId === assignment.id
          ) {
            transaction.update(lockRef, {
              status: next,
              updatedAt: serverTimestamp(),
            });
          } else if (
            next === "completed" &&
            lockSnapshot?.exists() &&
            lockSnapshot.data()?.assignmentId === assignment.id
          ) {
            transaction.delete(lockRef);
          }

          if (
            next === "completed" &&
            caseId &&
            caseData
          ) {
            const volunteerName =
              String(
                current.volunteerName ||
                  profile.fullName ||
                  "Volunteer"
              )
                .trim()
                .slice(0, 120) ||
              "Volunteer";

            const barangay =
              String(
                caseData.reporterBarangay ||
                  ""
              )
                .trim()
                .slice(0, 120);

            transaction.set(
              doc(
                db,
                "volunteerFieldReports",
                assignment.id
              ),
              {
                assignmentId:
                  assignment.id,
                caseId,

                volunteerId:
                  user.uid,
                volunteerName,
                barangay,

                situationSummary:
                  situationSummary
                    .trim()
                    .slice(0, 2000),

                assistanceProvided:
                  contributionSummary
                    .trim()
                    .slice(0, 2000),

                peopleHelped:
                  people,

                remainingNeeds:
                  remainingNeeds.slice(
                    0,
                    12
                  ),

                remainingNeedsNote:
                  remainingNeedsNote
                    .trim()
                    .slice(0, 1500),

                lguFollowUpRequired:
                  lguFollowUpRequired ===
                  true,

                evidenceUrls: [],

                reportStatus:
                  "submitted",

                adminReviewNote: "",

                createdAt:
                  serverTimestamp(),
                updatedAt:
                  serverTimestamp(),

                reviewedAt: null,
                reviewedBy: "",
              }
            );
          }

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
                    "Volunteer field report submitted",
                  message:
                    `${responderName} completed the assigned support response and submitted a field report to LGU/Admin. ` +
                    "LGU will review any remaining needs and decide the next action.",
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
          "Invitation Accepted",
          "Select Start Response when you begin travelling or responding."
        );

        setFilter("active");
      } else if (next === "declined") {
        Alert.alert(
          "Invitation Declined",
          "LGU Admin will see the decline and may invite another Volunteer."
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
          "Field Report Submitted",
          "Your mission completion and field report were sent to LGU/Admin. This does not automatically close the emergency case. LGU will review any remaining needs and decide the next action."
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
                              Accept Invite
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
                          Reject Invite
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

                  {status ===
                    "on_site" && (
                    <TouchableOpacity
                      style={
                        styles.completeButton
                      }
                      onPress={() => {
                        if (
                          completionId ===
                          assignment.id
                        ) {
                          resetCompletion();
                        } else {
                          resetCompletion();
                          setCompletionId(
                            assignment.id
                          );
                        }
                      }}
                    >
                      <Ionicons
                        name="checkmark-done"
                        size={18}
                        color="#ffffff"
                      />

                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        {completionId ===
                        assignment.id
                          ? "Hide Field Report"
                          : "Complete & Report to LGU"}
                      </Text>
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
                        Field report submitted to LGU/Admin
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

                  {completionId ===
                    assignment.id &&
                    status ===
                      "on_site" && (
                      <View
                        style={
                          styles.completionPanel
                        }
                      >
                        <Text
                          style={
                            styles.completionTitle
                          }
                        >
                          Mission Completion & Field Report
                        </Text>

                        <Text
                          style={
                            styles.completionHint
                          }
                        >
                          Report what you actually observed and did on site. LGU/Admin will use this report to review remaining needs and decide the next action.
                        </Text>

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Situation observed on site
                        </Text>

                        <TextInput
                          style={[
                            styles.input,
                            styles.multilineInput,
                          ]}
                          multiline
                          value={
                            situationSummary
                          }
                          onChangeText={
                            setSituationSummary
                          }
                          maxLength={2000}
                          placeholder="Describe the actual condition of the resident, household, or affected area when you arrived."
                          placeholderTextColor="#94a3b8"
                        />

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Contribution type
                        </Text>

                        <View
                          style={
                            styles.typeGrid
                          }
                        >
                          {COMPLETION_TYPES.map(
                            (item) => {
                              const selected =
                                contributionType ===
                                item;

                              return (
                                <TouchableOpacity
                                  key={item}
                                  style={[
                                    styles.typeButton,
                                    selected &&
                                      styles.typeButtonActive,
                                  ]}
                                  onPress={() =>
                                    setContributionType(
                                      item
                                    )
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.typeButtonText,
                                      selected &&
                                        styles.typeButtonTextActive,
                                    ]}
                                  >
                                    {item}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                          )}
                        </View>

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Assistance actually provided
                        </Text>

                        <TextInput
                          style={[
                            styles.input,
                            styles.multilineInput,
                          ]}
                          multiline
                          value={
                            contributionSummary
                          }
                          onChangeText={
                            setContributionSummary
                          }
                          maxLength={1200}
                          placeholder="Describe what you actually did during this assigned support response."
                          placeholderTextColor="#94a3b8"
                        />

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          People helped
                        </Text>

                        <TextInput
                          style={
                            styles.input
                          }
                          keyboardType="number-pad"
                          value={
                            peopleHelped
                          }
                          onChangeText={(
                            value
                          ) =>
                            setPeopleHelped(
                              value
                                .replace(
                                  /[^0-9]/g,
                                  ""
                                )
                                .slice(
                                  0,
                                  3
                                )
                            )
                          }
                          placeholder="0"
                          placeholderTextColor="#94a3b8"
                        />

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Remaining needs observed
                          {" "}
                          (optional)
                        </Text>

                        <View
                          style={
                            styles.typeGrid
                          }
                        >
                          {FIELD_NEED_OPTIONS.map(
                            (item) => {
                              const selected =
                                remainingNeeds.includes(
                                  item
                                );

                              return (
                                <TouchableOpacity
                                  key={item}
                                  style={[
                                    styles.typeButton,
                                    selected &&
                                      styles.needButtonActive,
                                  ]}
                                  onPress={() =>
                                    toggleRemainingNeed(
                                      item
                                    )
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.typeButtonText,
                                      selected &&
                                        styles.needButtonTextActive,
                                    ]}
                                  >
                                    {item}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                          )}
                        </View>

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Remaining-needs details
                          {" "}
                          (optional)
                        </Text>

                        <TextInput
                          style={[
                            styles.input,
                            styles.multilineInputSmall,
                          ]}
                          multiline
                          value={
                            remainingNeedsNote
                          }
                          onChangeText={
                            setRemainingNeedsNote
                          }
                          maxLength={1500}
                          placeholder="Add details that LGU/Admin should verify, such as temporary shelter, food, clothing, medicine, or other recovery needs."
                          placeholderTextColor="#94a3b8"
                        />

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Does LGU/Admin still need to follow up?
                        </Text>

                        <View
                          style={
                            styles.followUpRow
                          }
                        >
                          <TouchableOpacity
                            style={[
                              styles.followUpButton,
                              lguFollowUpRequired ===
                                true &&
                                styles.followUpButtonActive,
                            ]}
                            onPress={() =>
                              setLguFollowUpRequired(
                                true
                              )
                            }
                          >
                            <Ionicons
                              name="alert-circle-outline"
                              size={16}
                              color={
                                lguFollowUpRequired ===
                                true
                                  ? "#ffffff"
                                  : "#b45309"
                              }
                            />

                            <Text
                              style={[
                                styles.followUpButtonText,
                                lguFollowUpRequired ===
                                  true &&
                                  styles.followUpButtonTextActive,
                              ]}
                            >
                              Yes, follow-up needed
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.followUpButton,
                              lguFollowUpRequired ===
                                false &&
                                styles.followUpButtonSafe,
                            ]}
                            onPress={() =>
                              setLguFollowUpRequired(
                                false
                              )
                            }
                          >
                            <Ionicons
                              name="checkmark-circle-outline"
                              size={16}
                              color={
                                lguFollowUpRequired ===
                                false
                                  ? "#ffffff"
                                  : "#16845b"
                              }
                            />

                            <Text
                              style={[
                                styles.followUpButtonText,
                                lguFollowUpRequired ===
                                  false &&
                                  styles.followUpButtonTextActive,
                              ]}
                            >
                              No further field follow-up
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <Text
                          style={
                            styles.inputLabel
                          }
                        >
                          Completion notes
                          {" "}
                          (optional)
                        </Text>

                        <TextInput
                          style={[
                            styles.input,
                            styles.multilineInputSmall,
                          ]}
                          multiline
                          value={
                            completionNotes
                          }
                          onChangeText={
                            setCompletionNotes
                          }
                          maxLength={600}
                          placeholder="Any other operational note for LGU/Admin."
                          placeholderTextColor="#94a3b8"
                        />

                        <View
                          style={
                            styles.trustNotice
                          }
                        >
                          <Ionicons
                            name="shield-checkmark-outline"
                            size={18}
                            color="#078F82"
                          />

                          <Text
                            style={
                              styles.trustNoticeText
                            }
                          >
                            Submitting this form reports your field findings to LGU/Admin and completes only your Volunteer assignment. It does not close the emergency case, approve relief goods, or grant service credit automatically.
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.submitCompletionButton,
                            busy &&
                              styles.disabled,
                          ]}
                          disabled={busy}
                          onPress={() =>
                            transitionAssignment(
                              assignment,
                              "completed"
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
                                name="document-text-outline"
                                size={18}
                                color="#ffffff"
                              />

                              <Text
                                style={
                                  styles.actionButtonText
                                }
                              >
                                Submit Field Report & Complete
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
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
    fontSize: 13,
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
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  title: {
    marginTop: 2,
    color: "#173D32",
    fontSize: 25,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 3,
    color: "#567D6B",
    fontSize: 12,
    lineHeight: 17,
  },

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
    fontSize: 12,
    fontWeight: "900",
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
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },

  statValue: {
    color: "#123047",
    fontSize: 22,
    fontWeight: "900",
  },

  statLabel: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },

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
    fontSize: 11,
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
    fontSize: 11.5,
    fontWeight: "700",
  },

  card: {
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 15,
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
    fontSize: 11,
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
    fontSize: 9,
    fontWeight: "900",
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
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },

  locationText: {
    marginTop: 4,
    color: "#587084",
    fontSize: 11,
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
    fontSize: 8.5,
    fontWeight: "900",
  },

  details: {
    marginTop: 11,
    color: "#64788b",
    fontSize: 12,
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
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  metaValue: {
    marginTop: 4,
    color: "#294256",
    fontSize: 10.5,
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
    fontSize: 11,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "900",
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
    fontSize: 15,
    fontWeight: "900",
  },

  completionHint: {
    marginTop: 3,
    marginBottom: 7,
    color: "#64748b",
    fontSize: 10.5,
    lineHeight: 15,
  },

  inputLabel: {
    marginTop: 10,
    marginBottom: 6,
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "900",
  },

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
    fontSize: 9.5,
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
    fontSize: 9.5,
    fontWeight: "900",
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
    fontSize: 12,
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
    fontSize: 10,
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
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 5,
    color: "#74889a",
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: "center",
  },
});
