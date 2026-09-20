import { useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
  isApprovedProfile,
} from "../../lib/firebaseAuth";
import {
  useUserSession,
} from "../../lib/useUserSession";

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | string;

type AssignmentStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "responding"
  | "on_site"
  | "completed"
  | "cancelled"
  | string;

type ConfirmationOutcome =
  | "fully_helped"
  | "partially_helped"
  | "not_helped";

type DisasterCase = {
  id: string;

  reporterUid?: string;

  title?: string;
  category?: string;
  severity?: string;

  status?: CaseStatus;

  verificationStatus?: string;
  evidenceReviewStatus?: string;

  location?: string;
  details?: string;
  needs?: string;

  assistanceTypes?: string[];
  requiredSkills?: string[];
  neededGoods?: string[];

  affectedPeople?: number;

  assignedVolunteerIds?: string[];

  createdAt?: any;
  updatedAt?: any;
};

type ResponseAssignment = {
  id: string;

  caseId?: string;

  volunteerId?: string;
  volunteerName?: string;

  caseTitle?: string;

  status?: AssignmentStatus;

  contributionType?: string;
  contributionSummary?: string;

  peopleHelped?: number;

  completionNotes?: string;

  residentConfirmationStatus?: string;
  residentConfirmationOutcome?: string;

  verifiedContributionId?: string;

  responseStartedAt?: any;
  arrivedAt?: any;
  completedAt?: any;

  updatedAt?: any;
};

type AssistanceConfirmation = {
  id: string;

  assignmentId?: string;
  caseId?: string;

  residentId?: string;
  volunteerId?: string;

  outcome?: ConfirmationOutcome;

  reviewState?:
    | "resident_confirmed"
    | "disputed"
    | string;

  residentNote?: string;

  creditStatus?:
    | "credited"
    | "disputed"
    | string;

  createdAt?: any;
};

const activeAssignmentStates = [
  "accepted",
  "responding",
  "on_site",
];

const toMillis = (
  value: any,
) => {
  if (!value) {
    return 0;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const formatDate = (
  value: any,
) => {
  const ms =
    toMillis(value);

  if (!ms) {
    return "—";
  }

  return new Date(
    ms,
  ).toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  );
};

const humanize = (
  value?: string,
) =>
  String(
    value || "unknown",
  )
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );

const caseStatusLabel = (
  status?: string,
) => {
  switch (status) {
    case "reported":
      return "Submitted";

    case "validated":
      return "Validated";

    case "assigned":
      return "Responder assigned";

    case "in_progress":
      return "Response in progress";

    case "resolved":
      return "Resolved";

    case "closed":
      return "Closed";

    default:
      return humanize(
        status,
      );
  }
};

const assignmentStatusLabel = (
  status?: string,
) => {
  switch (status) {
    case "offered":
      return "Waiting for responder";

    case "accepted":
      return "Accepted";

    case "responding":
      return "Responder on the way";

    case "on_site":
      return "Responder on site";

    case "completed":
      return "Mission completed";

    case "declined":
      return "Declined";

    case "cancelled":
      return "Cancelled";

    default:
      return humanize(
        status,
      );
  }
};

const outcomeLabel = (
  outcome?: ConfirmationOutcome,
) => {
  switch (outcome) {
    case "fully_helped":
      return "Fully helped";

    case "partially_helped":
      return "Partially helped";

    case "not_helped":
      return "Not helped / Admin review";

    default:
      return "Confirmation submitted";
  }
};

export default function MyCases() {
  const router =
    useRouter();

  const {
    user,
    profile,
    loading,
  } =
    useUserSession();

  const [
    cases,
    setCases,
  ] =
    useState<
      DisasterCase[]
    >([]);

  const [
    assignmentsByCase,
    setAssignmentsByCase,
  ] =
    useState<
      Record<
        string,
        ResponseAssignment[]
      >
    >({});

  const [
    confirmations,
    setConfirmations,
  ] =
    useState<
      Record<
        string,
        AssistanceConfirmation
      >
    >({});

  const [
    casesLoading,
    setCasesLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    busyAssignmentId,
    setBusyAssignmentId,
  ] =
    useState("");

  const [
    reviewingAssignmentId,
    setReviewingAssignmentId,
  ] =
    useState("");

  const [
    selectedOutcome,
    setSelectedOutcome,
  ] =
    useState<
      ConfirmationOutcome | null
    >(null);

  const [
    residentNote,
    setResidentNote,
  ] =
    useState("");

  const [
    reviewError,
    setReviewError,
  ] =
    useState("");

  useEffect(() => {
    if (!user) {
      setCases([]);
      setCasesLoading(
        false,
      );

      return;
    }

    setCasesLoading(
      true,
    );

    setError("");

    const residentCasesQuery =
      query(
        collection(
          db,
          "disasterCases",
        ),

        where(
          "reporterUid",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      residentCasesQuery,

      (
        snapshot,
      ) => {
        const rows =
          snapshot.docs
            .map(
              (
                caseDoc,
              ) => ({
                id:
                  caseDoc.id,

                ...(caseDoc.data() as Omit<
                  DisasterCase,
                  "id"
                >),
              }),
            )
            .sort(
              (
                left,
                right,
              ) =>
                toMillis(
                  right.createdAt,
                ) -
                toMillis(
                  left.createdAt,
                ),
            );

        setCases(
          rows,
        );

        setCasesLoading(
          false,
        );
      },

      (
        problem,
      ) => {
        console.error(
          "Resident disasterCases listener failed",
          problem,
        );

        setError(
          "Unable to load your emergency reports. Check the deployed Firestore rules.",
        );

        setCasesLoading(
          false,
        );
      },
    );
  }, [
    user?.uid,
  ]);

  const assignmentWatchKey =
    useMemo(
      () =>
        cases
          .map(
            (
              incident,
            ) => {
              const volunteerIds =
                Array.isArray(
                  incident.assignedVolunteerIds,
                )
                  ? incident.assignedVolunteerIds
                      .map(
                        (
                          value,
                        ) =>
                          String(
                            value ||
                              "",
                          ).trim(),
                      )
                      .filter(
                        Boolean,
                      )
                  : [];

              const uniqueVolunteerIds =
                Array.from(
                  new Set(
                    volunteerIds,
                  ),
                ).sort();

              return `${incident.id}:${uniqueVolunteerIds.join(
                ",",
              )}`;
            },
          )
          .sort()
          .join("|"),

      [
        cases,
      ],
    );

  useEffect(() => {
    if (
      !user ||
      !cases.length
    ) {
      setAssignmentsByCase(
        {},
      );

      return;
    }

    /**
     * Resident assignment reads use exact Firestore documents.
     *
     * Admin assignment documents use:
     *   caseId_volunteerId
     *
     * disasterCases stores assignedVolunteerIds.
     *
     * This avoids a resident-side collection query across
     * responseAssignments, which can be rejected by the
     * linked-case Firestore ownership rules.
     */

    let disposed =
      false;

    const unsubscribers:
      Array<
        () => void
      > = [];

    const buckets:
      Record<
        string,
        Record<
          string,
          ResponseAssignment
        >
      > = {};

    const initialState:
      Record<
        string,
        ResponseAssignment[]
      > = {};

    cases.forEach(
      (
        incident,
      ) => {
        buckets[
          incident.id
        ] = {};

        initialState[
          incident.id
        ] = [];
      },
    );

    setAssignmentsByCase(
      initialState,
    );

    const publishCase =
      (
        caseId: string,
      ) => {
        if (disposed) {
          return;
        }

        const rows =
          Object.values(
            buckets[
              caseId
            ] || {},
          ).sort(
            (
              left,
              right,
            ) =>
              toMillis(
                right.updatedAt,
              ) -
              toMillis(
                left.updatedAt,
              ),
          );

        setAssignmentsByCase(
          (
            current,
          ) => ({
            ...current,

            [
              caseId
            ]:
              rows,
          }),
        );

        setError(
          (
            current,
          ) =>
            current.startsWith(
              "Your reports loaded, but responder assignments",
            )
              ? ""
              : current,
        );
      };

    cases.forEach(
      (
        incident,
      ) => {
        const volunteerIds =
          Array.isArray(
            incident.assignedVolunteerIds,
          )
            ? Array.from(
                new Set(
                  incident.assignedVolunteerIds
                    .map(
                      (
                        value,
                      ) =>
                        String(
                          value ||
                            "",
                        ).trim(),
                    )
                    .filter(
                      Boolean,
                    ),
                ),
              )
            : [];

        if (
          volunteerIds.length ===
          0
        ) {
          publishCase(
            incident.id,
          );

          return;
        }

        volunteerIds.forEach(
          (
            volunteerId,
          ) => {
            const assignmentId =
              `${incident.id}_${volunteerId}`;

            const assignmentRef =
              doc(
                db,
                "responseAssignments",
                assignmentId,
              );

            const unsubscribe =
              onSnapshot(
                assignmentRef,

                (
                  snapshot,
                ) => {
                  if (
                    snapshot.exists()
                  ) {
                    buckets[
                      incident.id
                    ][
                      assignmentId
                    ] = {
                      id:
                        snapshot.id,

                      ...(snapshot.data() as Omit<
                        ResponseAssignment,
                        "id"
                      >),
                    };
                  } else {
                    delete buckets[
                      incident.id
                    ][
                      assignmentId
                    ];
                  }

                  publishCase(
                    incident.id,
                  );
                },

                (
                  problem,
                ) => {
                  console.error(
                    `responseAssignments document listener failed for ${assignmentId}`,
                    problem,
                  );

                  setError(
                    "Your reports loaded, but responder assignments could not be read.",
                  );
                },
              );

            unsubscribers.push(
              unsubscribe,
            );
          },
        );
      },
    );

    return () => {
      disposed =
        true;

      unsubscribers.forEach(
        (
          unsubscribe,
        ) =>
          unsubscribe(),
      );
    };
  }, [
    user?.uid,
    assignmentWatchKey,
  ]);

  useEffect(() => {
    if (!user) {
      setConfirmations(
        {},
      );

      return;
    }

    const confirmationQuery =
      query(
        collection(
          db,
          "assistanceConfirmations",
        ),

        where(
          "residentId",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      confirmationQuery,

      (
        snapshot,
      ) => {
        const next:
          Record<
            string,
            AssistanceConfirmation
          > = {};

        snapshot.docs.forEach(
          (
            confirmationDoc,
          ) => {
            const row = {
              id:
                confirmationDoc.id,

              ...(confirmationDoc.data() as Omit<
                AssistanceConfirmation,
                "id"
              >),
            };

            if (
              row.assignmentId
            ) {
              next[
                row.assignmentId
              ] = row;
            }
          },
        );

        setConfirmations(
          next,
        );
      },

      (
        problem,
      ) => {
        console.error(
          "assistanceConfirmations listener failed",
          problem,
        );

        setError(
          "Assistance confirmations could not be loaded.",
        );
      },
    );
  }, [
    user?.uid,
  ]);

  const resetReview =
    () => {
      setReviewingAssignmentId(
        "",
      );

      setSelectedOutcome(
        null,
      );

      setResidentNote(
        "",
      );

      setReviewError(
        "",
      );
    };

  const startReview =
    (
      assignmentId: string,
    ) => {
      setReviewingAssignmentId(
        assignmentId,
      );

      setSelectedOutcome(
        null,
      );

      setResidentNote(
        "",
      );

      setReviewError(
        "",
      );
    };

  const openCaseMap =
    (
      caseId: string,
    ) => {
      router.push({
        pathname:
          "/map-tracking" as any,

        params: {
          caseId,
        },
      });
    };

  const submitConfirmation =
    async (
      incident:
        DisasterCase,

      assignment:
        ResponseAssignment,
    ) => {
      if (!user) {
        return;
      }

      if (
        assignment.status !==
        "completed"
      ) {
        setReviewError(
          "You can confirm assistance only after the responder marks the mission completed.",
        );

        return;
      }

      if (
        !selectedOutcome
      ) {
        setReviewError(
          "Choose Fully Helped, Partially Helped, or Not Helped.",
        );

        return;
      }

      if (
        !assignment.volunteerId
      ) {
        setReviewError(
          "This response assignment is missing its volunteer ID.",
        );

        return;
      }

      if (
        !assignment.contributionType ||
        !assignment.contributionSummary
      ) {
        setReviewError(
          "The responder's completion record is incomplete.",
        );

        return;
      }

      const cleanNote =
        residentNote
          .trim();

      if (
        selectedOutcome ===
          "not_helped" &&
        cleanNote.length <
          10
      ) {
        setReviewError(
          "Please briefly explain what happened so Admin can review the response.",
        );

        return;
      }

      setBusyAssignmentId(
        assignment.id,
      );

      setReviewError(
        "",
      );

      setError(
        "",
      );

      try {
        const batch =
          writeBatch(
            db,
          );

        const confirmationRef =
          doc(
            db,
            "assistanceConfirmations",
            assignment.id,
          );

        const assignmentRef =
          doc(
            db,
            "responseAssignments",
            assignment.id,
          );

        const isDisputed =
          selectedOutcome ===
          "not_helped";

        batch.set(
          confirmationRef,

          {
            assignmentId:
              assignment.id,

            caseId:
              incident.id,

            residentId:
              user.uid,

            volunteerId:
              assignment.volunteerId,

            outcome:
              selectedOutcome,

            reviewState:
              isDisputed
                ? "disputed"
                : "resident_confirmed",

            residentNote:
              cleanNote,

            creditStatus:
              isDisputed
                ? "disputed"
                : "credited",

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
        );

        if (
          isDisputed
        ) {
          const disputeRef =
            doc(
              db,
              "responseDisputes",
              assignment.id,
            );

          batch.set(
            disputeRef,

            {
              assignmentId:
                assignment.id,

              caseId:
                incident.id,

              volunteerId:
                assignment.volunteerId,

              residentId:
                user.uid,

              residentNote:
                cleanNote,

              contributionType:
                assignment.contributionType,

              contributionSummary:
                assignment.contributionSummary,

              status:
                "open",

              createdAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            },
          );

          batch.update(
            assignmentRef,

            {
              residentConfirmationStatus:
                "disputed",

              residentConfirmationOutcome:
                "not_helped",

              residentConfirmedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            },
          );
        } else {
          const contributionRef =
            doc(
              db,
              "verifiedContributions",
              assignment.id,
            );

          batch.set(
            contributionRef,

            {
              assignmentId:
                assignment.id,

              caseId:
                incident.id,

              volunteerId:
                assignment.volunteerId,

              volunteerName:
                assignment.volunteerName ||
                "",

              residentId:
                user.uid,

              outcome:
                selectedOutcome,

              contributionType:
                assignment.contributionType,

              contributionSummary:
                assignment.contributionSummary,

              peopleHelped:
                Number.isInteger(
                  assignment.peopleHelped,
                )
                  ? assignment.peopleHelped
                  : 0,

              completionNotes:
                assignment.completionNotes ||
                "",

              responseStartedAt:
                assignment.responseStartedAt,

              arrivedAt:
                assignment.arrivedAt,

              completedAt:
                assignment.completedAt,

              residentConfirmedAt:
                serverTimestamp(),

              verificationSource:
                "resident_confirmation",

              status:
                "verified",

              createdAt:
                serverTimestamp(),

              verifiedAt:
                serverTimestamp(),
            },
          );

          batch.update(
            assignmentRef,

            {
              residentConfirmationStatus:
                "resident_confirmed",

              residentConfirmationOutcome:
                selectedOutcome,

              verifiedContributionId:
                assignment.id,

              residentConfirmedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            },
          );
        }

        await batch.commit();

        resetReview();
      } catch (
        problem: any
      ) {
        console.error(
          "Spark assistance confirmation failed",
          problem,
        );

        const code =
          String(
            problem?.code ||
              "",
          );

        if (
          code.includes(
            "permission",
          )
        ) {
          setReviewError(
            "Confirmation was blocked by Firestore rules. Deploy the Spark/free rules before testing.",
          );
        } else if (
          code.includes(
            "already",
          )
        ) {
          setReviewError(
            "This response has already been confirmed.",
          );
        } else {
          setReviewError(
            "Could not save your confirmation. Please try again.",
          );
        }
      } finally {
        setBusyAssignmentId(
          "",
        );
      }
    };

  if (
    loading ||
    casesLoading
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <ActivityIndicator
          size="large"
          color="#087F78"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading your emergency reports…
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <View
        style={
          styles.centerCard
        }
      >
        <Text
          style={
            styles.centerTitle
          }
        >
          Approved resident account required
        </Text>

        <Text
          style={
            styles.centerText
          }
        >
          Sign in with an approved VolunServe
          account to view your reports.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={
        styles.screen
      }
      contentContainerStyle={
        styles.container
      }
    >
      <View
        style={
          styles.header
        }
      >
        <View
          style={
            styles.headerCopy
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            RESIDENT CASE TRACKING
          </Text>

          <Text
            style={
              styles.title
            }
          >
            My Emergency Reports
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Track Admin verification, responder
            progress, and confirm the actual
            assistance you received.
          </Text>
        </View>
      </View>

      {!!error && (
        <View
          style={
            styles.errorBox
          }
        >
          <Text
            style={
              styles.errorText
            }
          >
            {error}
          </Text>
        </View>
      )}

      {cases.length ===
      0 ? (
        <View
          style={
            styles.emptyCard
          }
        >
          <Text
            style={
              styles.emptyTitle
            }
          >
            No emergency reports yet
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            Requests submitted through Emergency
            Assistance will appear here.
          </Text>
        </View>
      ) : (
        cases.map(
          (
            incident,
          ) => {
            const assignments =
              assignmentsByCase[
                incident.id
              ] || [];

            return (
              <View
                key={
                  incident.id
                }
                style={
                  styles.caseCard
                }
              >
                <View
                  style={
                    styles.caseTopRow
                  }
                >
                  <View
                    style={
                      styles.caseTitleBlock
                    }
                  >
                    <Text
                      style={
                        styles.caseTitle
                      }
                    >
                      {incident.title ||
                        "Emergency assistance request"}
                    </Text>

                    <Text
                      style={
                        styles.reference
                      }
                    >
                      Case ID:{" "}
                      {
                        incident.id
                      }
                    </Text>
                  </View>

                  <View
                    style={
                      styles.statusBadge
                    }
                  >
                    <Text
                      style={
                        styles.statusBadgeText
                      }
                    >
                      {caseStatusLabel(
                        incident.status,
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.metaGrid
                  }
                >
                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      INCIDENT
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {incident.category ||
                        "—"}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      URGENCY
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {humanize(
                        incident.severity,
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      VERIFICATION
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {humanize(
                        incident.verificationStatus,
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      SUBMITTED
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {formatDate(
                        incident.createdAt,
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.infoBlock
                  }
                >
                  <Text
                    style={
                      styles.infoLabel
                    }
                  >
                    Response location
                  </Text>

                  <Text
                    style={
                      styles.infoText
                    }
                  >
                    {incident.location ||
                      "No address provided"}
                  </Text>
                </View>

                {!!incident.details && (
                  <View
                    style={
                      styles.infoBlock
                    }
                  >
                    <Text
                      style={
                        styles.infoLabel
                      }
                    >
                      Situation details
                    </Text>

                    <Text
                      style={
                        styles.infoText
                      }
                    >
                      {
                        incident.details
                      }
                    </Text>
                  </View>
                )}

                {!!incident.needs && (
                  <View
                    style={
                      styles.needsBox
                    }
                  >
                    <Text
                      style={
                        styles.infoLabel
                      }
                    >
                      Requested assistance
                    </Text>

                    <Text
                      style={
                        styles.needsText
                      }
                    >
                      {
                        incident.needs
                      }
                    </Text>
                  </View>
                )}

                <View
                  style={
                    styles.responderSection
                  }
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Responder activity
                  </Text>

                  {assignments.length ===
                  0 ? (
                    <View
                      style={
                        styles.waitingBox
                      }
                    >
                      <Text
                        style={
                          styles.waitingTitle
                        }
                      >
                        No responder assigned yet
                      </Text>

                      <Text
                        style={
                          styles.waitingText
                        }
                      >
                        Admin verification and
                        assignment will appear here
                        once available.
                      </Text>
                    </View>
                  ) : (
                    assignments.map(
                      (
                        assignment,
                      ) => {
                        const confirmation =
                          confirmations[
                            assignment.id
                          ];

                        const isReviewing =
                          reviewingAssignmentId ===
                          assignment.id;

                        const canOpenMap =
                          [
                            ...activeAssignmentStates,
                            "completed",
                          ].includes(
                            String(
                              assignment.status,
                            ),
                          );

                        return (
                          <View
                            key={
                              assignment.id
                            }
                            style={
                              styles.assignmentCard
                            }
                          >
                            <View
                              style={
                                styles.assignmentHeader
                              }
                            >
                              <View
                                style={
                                  styles.assignmentIdentity
                                }
                              >
                                <Text
                                  style={
                                    styles.volunteerName
                                  }
                                >
                                  {assignment.volunteerName ||
                                    "Assigned responder"}
                                </Text>

                                <Text
                                  style={
                                    styles.assignmentReference
                                  }
                                >
                                  Assignment:{" "}
                                  {
                                    assignment.id
                                  }
                                </Text>
                              </View>

                              <View
                                style={
                                  styles.assignmentStatusBadge
                                }
                              >
                                <Text
                                  style={
                                    styles.assignmentStatusText
                                  }
                                >
                                  {assignmentStatusLabel(
                                    assignment.status,
                                  )}
                                </Text>
                              </View>
                            </View>

                            {!!assignment.contributionSummary && (
                              <View
                                style={
                                  styles.contributionBox
                                }
                              >
                                <Text
                                  style={
                                    styles.infoLabel
                                  }
                                >
                                  Responder contribution
                                </Text>

                                {!!assignment.contributionType && (
                                  <Text
                                    style={
                                      styles.contributionType
                                    }
                                  >
                                    {
                                      assignment.contributionType
                                    }
                                  </Text>
                                )}

                                <Text
                                  style={
                                    styles.infoText
                                  }
                                >
                                  {
                                    assignment.contributionSummary
                                  }
                                </Text>

                                {typeof assignment.peopleHelped ===
                                  "number" && (
                                  <Text
                                    style={
                                      styles.contributionMeta
                                    }
                                  >
                                    People assisted:{" "}
                                    {
                                      assignment.peopleHelped
                                    }
                                  </Text>
                                )}

                                {!!assignment.completionNotes && (
                                  <Text
                                    style={
                                      styles.contributionMeta
                                    }
                                  >
                                    Completion note:{" "}
                                    {
                                      assignment.completionNotes
                                    }
                                  </Text>
                                )}
                              </View>
                            )}

                            {canOpenMap && (
                              <TouchableOpacity
                                style={
                                  styles.secondaryButton
                                }
                                onPress={() =>
                                  openCaseMap(
                                    incident.id,
                                  )
                                }
                              >
                                <Text
                                  style={
                                    styles.secondaryButtonText
                                  }
                                >
                                  {activeAssignmentStates.includes(
                                    String(
                                      assignment.status,
                                    ),
                                  )
                                    ? "Open live map / case chat"
                                    : "Open case map / chat"}
                                </Text>
                              </TouchableOpacity>
                            )}

                            {confirmation ? (
                              <View
                                style={[
                                  styles.confirmedBox,

                                  confirmation.outcome ===
                                    "not_helped" &&
                                    styles.disputedBox,
                                ]}
                              >
                                <Text
                                  style={
                                    styles.confirmedTitle
                                  }
                                >
                                  {outcomeLabel(
                                    confirmation.outcome,
                                  )}
                                </Text>

                                <Text
                                  style={
                                    styles.confirmedText
                                  }
                                >
                                  {confirmation.creditStatus ===
                                  "credited"
                                    ? "Verified Contribution recorded. This assistance is now part of the responder's verified volunteer record."
                                    : confirmation.creditStatus ===
                                        "disputed"
                                      ? "This response was sent to Admin for review. No verified volunteer credit was automatically issued."
                                      : "Your confirmation has been recorded."}
                                </Text>

                                {!!confirmation.residentNote && (
                                  <Text
                                    style={
                                      styles.confirmedNote
                                    }
                                  >
                                    “
                                    {
                                      confirmation.residentNote
                                    }
                                    ”
                                  </Text>
                                )}
                              </View>
                            ) : assignment.status ===
                              "completed" ? (
                              isReviewing ? (
                                <View
                                  style={
                                    styles.reviewPanel
                                  }
                                >
                                  <Text
                                    style={
                                      styles.reviewTitle
                                    }
                                  >
                                    Confirm assistance received
                                  </Text>

                                  <Text
                                    style={
                                      styles.reviewCopy
                                    }
                                  >
                                    Confirm what actually happened.
                                    Full or Partial assistance
                                    creates a verified contribution.
                                    Not Helped is sent to Admin
                                    review.
                                  </Text>

                                  <View
                                    style={
                                      styles.outcomeRow
                                    }
                                  >
                                    {(
                                      [
                                        [
                                          "fully_helped",
                                          "Fully Helped",
                                        ],

                                        [
                                          "partially_helped",
                                          "Partially Helped",
                                        ],

                                        [
                                          "not_helped",
                                          "Not Helped",
                                        ],
                                      ] as const
                                    ).map(
                                      ([
                                        value,
                                        label,
                                      ]) => (
                                        <TouchableOpacity
                                          key={
                                            value
                                          }
                                          style={[
                                            styles.outcomeButton,

                                            selectedOutcome ===
                                              value &&
                                              styles.outcomeButtonActive,

                                            value ===
                                              "not_helped" &&
                                              selectedOutcome ===
                                                value &&
                                              styles.outcomeButtonDanger,
                                          ]}
                                          onPress={() => {
                                            setSelectedOutcome(
                                              value,
                                            );

                                            setReviewError(
                                              "",
                                            );
                                          }}
                                        >
                                          <Text
                                            style={[
                                              styles.outcomeButtonText,

                                              selectedOutcome ===
                                                value &&
                                                styles.outcomeButtonTextActive,
                                            ]}
                                          >
                                            {
                                              label
                                            }
                                          </Text>
                                        </TouchableOpacity>
                                      ),
                                    )}
                                  </View>

                                  <Text
                                    style={
                                      styles.noteLabel
                                    }
                                  >
                                    {selectedOutcome ===
                                    "not_helped"
                                      ? "What happened? (required)"
                                      : "Additional note (optional)"}
                                  </Text>

                                  <TextInput
                                    value={
                                      residentNote
                                    }
                                    onChangeText={
                                      setResidentNote
                                    }
                                    multiline
                                    maxLength={
                                      1000
                                    }
                                    placeholder={
                                      selectedOutcome ===
                                      "not_helped"
                                        ? "Example: The responder marked the mission completed, but no assistance was actually provided."
                                        : "Add context about the assistance received if needed."
                                    }
                                    style={
                                      styles.noteInput
                                    }
                                    textAlignVertical="top"
                                  />

                                  {!!reviewError && (
                                    <Text
                                      style={
                                        styles.reviewError
                                      }
                                    >
                                      {
                                        reviewError
                                      }
                                    </Text>
                                  )}

                                  <View
                                    style={
                                      styles.reviewActions
                                    }
                                  >
                                    <TouchableOpacity
                                      style={
                                        styles.cancelButton
                                      }
                                      disabled={
                                        busyAssignmentId ===
                                        assignment.id
                                      }
                                      onPress={
                                        resetReview
                                      }
                                    >
                                      <Text
                                        style={
                                          styles.cancelButtonText
                                        }
                                      >
                                        Cancel
                                      </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      style={
                                        styles.primaryButton
                                      }
                                      disabled={
                                        busyAssignmentId ===
                                        assignment.id
                                      }
                                      onPress={() =>
                                        submitConfirmation(
                                          incident,
                                          assignment,
                                        )
                                      }
                                    >
                                      {busyAssignmentId ===
                                      assignment.id ? (
                                        <ActivityIndicator
                                          size="small"
                                          color="#FFFFFF"
                                        />
                                      ) : (
                                        <Text
                                          style={
                                            styles.primaryButtonText
                                          }
                                        >
                                          Submit confirmation
                                        </Text>
                                      )}
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : (
                                <View
                                  style={
                                    styles.pendingConfirmationBox
                                  }
                                >
                                  <View
                                    style={
                                      styles.pendingConfirmationCopy
                                    }
                                  >
                                    <Text
                                      style={
                                        styles.pendingConfirmationTitle
                                      }
                                    >
                                      Your confirmation is needed
                                    </Text>

                                    <Text
                                      style={
                                        styles.pendingConfirmationText
                                      }
                                    >
                                      The responder marked this
                                      mission completed. Confirm
                                      whether you were fully helped,
                                      partially helped, or not
                                      helped.
                                    </Text>
                                  </View>

                                  <TouchableOpacity
                                    style={
                                      styles.primaryButton
                                    }
                                    onPress={() =>
                                      startReview(
                                        assignment.id,
                                      )
                                    }
                                  >
                                    <Text
                                      style={
                                        styles.primaryButtonText
                                      }
                                    >
                                      Confirm assistance
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              )
                            ) : null}
                          </View>
                        );
                      },
                    )
                  )}
                </View>
              </View>
            );
          },
        )
      )}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#F4F7FA",
    },

    container: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 60,
    },

    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F4F7FA",
      gap: 10,
    },

    loadingText: {
      color: "#64748B",
      fontSize: 13,
    },

    centerCard: {
      margin: 24,
      padding: 24,
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    centerTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: "#102A3A",
    },

    centerText: {
      marginTop: 8,
      color: "#64748B",
      lineHeight: 20,
    },

    header: {
      marginBottom: 18,
    },

    headerCopy: {
      maxWidth: 760,
    },

    eyebrow: {
      color: "#07857C",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    title: {
      marginTop: 6,
      color: "#102A3A",
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "900",
    },

    subtitle: {
      marginTop: 6,
      color: "#627785",
      fontSize: 14,
      lineHeight: 21,
    },

    errorBox: {
      marginBottom: 14,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#F1B7B7",
      backgroundColor:
        "#FFF3F3",
    },

    errorText: {
      color: "#A83232",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },

    emptyCard: {
      padding: 28,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
      alignItems: "center",
    },

    emptyTitle: {
      color: "#173748",
      fontSize: 17,
      fontWeight: "800",
    },

    emptyText: {
      marginTop: 6,
      color: "#64748B",
      textAlign: "center",
      lineHeight: 20,
    },

    caseCard: {
      marginBottom: 18,
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    caseTopRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 12,
    },

    caseTitleBlock: {
      flex: 1,
    },

    caseTitle: {
      color: "#102A3A",
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "900",
    },

    reference: {
      marginTop: 4,
      color: "#8A9AA5",
      fontSize: 10,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#EAF8F5",
      borderWidth: 1,
      borderColor:
        "#C8E7E1",
    },

    statusBadgeText: {
      color: "#08786F",
      fontSize: 10,
      fontWeight: "900",
    },

    metaGrid: {
      marginTop: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    metaItem: {
      minWidth: 145,
      flexGrow: 1,
      flexBasis: 145,
      padding: 11,
      borderRadius: 10,
      backgroundColor:
        "#F8FAFB",
      borderWidth: 1,
      borderColor:
        "#E7EDF1",
    },

    metaLabel: {
      color: "#91A1AD",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    metaValue: {
      marginTop: 3,
      color: "#173748",
      fontSize: 11,
      fontWeight: "800",
    },

    infoBlock: {
      marginTop: 14,
    },

    infoLabel: {
      color: "#526B79",
      fontSize: 10,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 0.5,
    },

    infoText: {
      marginTop: 4,
      color: "#36515F",
      fontSize: 12,
      lineHeight: 18,
    },

    needsBox: {
      marginTop: 14,
      padding: 12,
      borderRadius: 10,
      backgroundColor:
        "#F7FAFB",
      borderWidth: 1,
      borderColor:
        "#E2E9ED",
    },

    needsText: {
      marginTop: 5,
      color: "#36515F",
      fontSize: 11,
      lineHeight: 17,
    },

    responderSection: {
      marginTop: 18,
      paddingTop: 17,
      borderTopWidth: 1,
      borderTopColor:
        "#EDF1F4",
    },

    sectionTitle: {
      marginBottom: 10,
      color: "#173748",
      fontSize: 14,
      fontWeight: "900",
    },

    waitingBox: {
      padding: 13,
      borderRadius: 10,
      backgroundColor:
        "#FBFCFD",
      borderWidth: 1,
      borderColor:
        "#E5EBEF",
    },

    waitingTitle: {
      color: "#526B79",
      fontSize: 12,
      fontWeight: "800",
    },

    waitingText: {
      marginTop: 4,
      color: "#7A8C97",
      fontSize: 11,
      lineHeight: 17,
    },

    assignmentCard: {
      marginTop: 10,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#DDE7EB",
      backgroundColor:
        "#FCFDFD",
    },

    assignmentHeader: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 10,
    },

    assignmentIdentity: {
      flex: 1,
    },

    volunteerName: {
      color: "#153646",
      fontSize: 13,
      fontWeight: "900",
    },

    assignmentReference: {
      marginTop: 3,
      color: "#8A9AA5",
      fontSize: 9,
    },

    assignmentStatusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#EEF5F7",
    },

    assignmentStatusText: {
      color: "#456171",
      fontSize: 9,
      fontWeight: "900",
    },

    contributionBox: {
      marginTop: 12,
      padding: 11,
      borderRadius: 9,
      backgroundColor:
        "#F4F9F8",
      borderWidth: 1,
      borderColor:
        "#D8EAE6",
    },

    contributionType: {
      marginTop: 4,
      color: "#087F78",
      fontSize: 13,
      fontWeight: "800",
    },

    contributionMeta: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
    },

    secondaryButton: {
      marginTop: 12,
      alignSelf:
        "flex-start",
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 9,
      backgroundColor:
        "#EEF8F6",
      borderWidth: 1,
      borderColor:
        "#C8E4DF",
    },

    secondaryButtonText: {
      color: "#096C66",
      fontSize: 11,
      fontWeight: "800",
    },

    pendingConfirmationBox: {
      marginTop: 13,
      padding: 13,
      borderRadius: 11,
      backgroundColor:
        "#FFF9E9",
      borderWidth: 1,
      borderColor:
        "#F2D98E",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 12,
      flexWrap: "wrap",
    },

    pendingConfirmationCopy: {
      flex: 1,
      minWidth: 220,
    },

    pendingConfirmationTitle: {
      color: "#765B0A",
      fontSize: 12,
      fontWeight: "900",
    },

    pendingConfirmationText: {
      marginTop: 4,
      color: "#806D32",
      fontSize: 10.5,
      lineHeight: 16,
    },

    reviewPanel: {
      marginTop: 13,
      padding: 14,
      borderRadius: 11,
      backgroundColor:
        "#F8FBFB",
      borderWidth: 1,
      borderColor:
        "#D7E6E3",
    },

    reviewTitle: {
      color: "#153646",
      fontSize: 14,
      fontWeight: "900",
    },

    reviewCopy: {
      marginTop: 5,
      color: "#647984",
      fontSize: 11,
      lineHeight: 17,
    },

    outcomeRow: {
      marginTop: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    outcomeButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#D4DFE4",
      backgroundColor:
        "#FFFFFF",
    },

    outcomeButtonActive: {
      borderColor:
        "#0B8F80",
      backgroundColor:
        "#E9F8F4",
    },

    outcomeButtonDanger: {
      borderColor:
        "#D99090",
      backgroundColor:
        "#FFF1F1",
    },

    outcomeButtonText: {
      color: "#526B79",
      fontSize: 10.5,
      fontWeight: "800",
    },

    outcomeButtonTextActive: {
      color: "#08786F",
    },

    noteLabel: {
      marginTop: 13,
      marginBottom: 5,
      color: "#526B79",
      fontSize: 10.5,
      fontWeight: "800",
    },

    noteInput: {
      minHeight: 88,
      padding: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#CDD9E0",
      backgroundColor:
        "#FFFFFF",
      color: "#173748",
      fontSize: 12,
    },

    reviewError: {
      marginTop: 8,
      color: "#B42318",
      fontSize: 10.5,
      fontWeight: "700",
    },

    reviewActions: {
      marginTop: 12,
      flexDirection: "row",
      justifyContent:
        "flex-end",
      gap: 8,
      flexWrap: "wrap",
    },

    primaryButton: {
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
      alignItems: "center",
      justifyContent:
        "center",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    cancelButton: {
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 9,
      backgroundColor:
        "#EEF2F4",
      alignItems: "center",
      justifyContent:
        "center",
    },

    cancelButtonText: {
      color: "#526B79",
      fontSize: 10.5,
      fontWeight: "800",
    },

    confirmedBox: {
      marginTop: 13,
      padding: 12,
      borderRadius: 10,
      backgroundColor:
        "#ECF9F5",
      borderWidth: 1,
      borderColor:
        "#C8E7DF",
    },

    disputedBox: {
      backgroundColor:
        "#FFF3F3",
      borderColor:
        "#EDC4C4",
    },

    confirmedTitle: {
      color: "#08786F",
      fontSize: 11.5,
      fontWeight: "900",
    },

    confirmedText: {
      marginTop: 4,
      color: "#526B79",
      fontSize: 10.5,
      lineHeight: 16,
    },

    confirmedNote: {
      marginTop: 7,
      color: "#6A7E89",
      fontSize: 10.5,
      fontStyle: "italic",
      lineHeight: 16,
    },
  });