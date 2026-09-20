import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
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
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
  isApprovedProfile,
} from "../../lib/firebaseAuth";
import {
  useUserSession,
} from "../../lib/useUserSession";

type Contribution = {
  id: string;

  assignmentId?: string;
  caseId?: string;

  volunteerId?: string;
  volunteerName?: string;

  residentId?: string;

  outcome?:
    | "fully_helped"
    | "partially_helped"
    | string;

  contributionType?: string;
  contributionSummary?: string;

  peopleHelped?: number;
  completionNotes?: string;

  responseStartedAt?: any;
  arrivedAt?: any;
  completedAt?: any;

  residentConfirmedAt?: any;

  verificationSource?: string;
  status?: string;

  createdAt?: any;
  verifiedAt?: any;
};

type EventStats = {
  totalHours?: number;
  totalEventsCompleted?: number;
  totalCheckIns?: number;
};

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

const calculateServiceMinutes = (
  item: Contribution,
) => {
  const started =
    toMillis(
      item.responseStartedAt,
    );

  const completed =
    toMillis(
      item.completedAt,
    );

  if (
    !started ||
    !completed ||
    completed < started
  ) {
    return 0;
  }

  const minutes =
    Math.round(
      (
        completed -
        started
      ) /
        60000,
    );

  // Same safety cap used in
  // the original server design:
  // maximum 24 hours per response.
  return Math.min(
    24 * 60,
    Math.max(
      0,
      minutes,
    ),
  );
};

const formatDuration = (
  totalMinutes: number,
) => {
  const safeMinutes =
    Math.max(
      0,
      Math.round(
        Number(
          totalMinutes || 0,
        ),
      ),
    );

  const hours =
    Math.floor(
      safeMinutes / 60,
    );

  const minutes =
    safeMinutes % 60;

  if (
    hours === 0
  ) {
    return `${minutes} min`;
  }

  if (
    minutes === 0
  ) {
    return `${hours} hr${
      hours === 1
        ? ""
        : "s"
    }`;
  }

  return `${hours} hr${
    hours === 1
      ? ""
      : "s"
  } ${minutes} min`;
};

const formatDate = (
  value: any,
) => {
  const milliseconds =
    toMillis(value);

  if (!milliseconds) {
    return "—";
  }

  return new Date(
    milliseconds,
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

const outcomeLabel = (
  outcome?: string,
) => {
  if (
    outcome ===
    "fully_helped"
  ) {
    return "FULLY HELPED";
  }

  if (
    outcome ===
    "partially_helped"
  ) {
    return "PARTIALLY HELPED";
  }

  return "VERIFIED";
};

export default function VolunteerImpact() {
  const {
    user,
    profile,
    loading,
  } =
    useUserSession();

  const [
    contributions,
    setContributions,
  ] =
    useState<
      Contribution[]
    >([]);

  const [
    eventStats,
    setEventStats,
  ] =
    useState<
      EventStats
    >({});

  const [
    contributionsLoading,
    setContributionsLoading,
  ] =
    useState(true);

  const [
    eventStatsLoading,
    setEventStatsLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    if (!user) {
      setContributions(
        [],
      );

      setContributionsLoading(
        false,
      );

      return;
    }

    setContributionsLoading(
      true,
    );

    const contributionQuery =
      query(
        collection(
          db,
          "verifiedContributions",
        ),

        where(
          "volunteerId",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      contributionQuery,

      (
        snapshot,
      ) => {
        const rows =
          snapshot.docs
            .map(
              (
                contributionDoc,
              ) => ({
                id:
                  contributionDoc.id,

                ...(contributionDoc.data() as Omit<
                  Contribution,
                  "id"
                >),
              }),
            )

            .filter(
              (
                item,
              ) =>
                item.status ===
                "verified",
            )

            .sort(
              (
                left,
                right,
              ) =>
                toMillis(
                  right.verifiedAt,
                ) -
                toMillis(
                  left.verifiedAt,
                ),
            );

        setContributions(
          rows,
        );

        setContributionsLoading(
          false,
        );
      },

      (
        problem,
      ) => {
        console.error(
          "verifiedContributions listener failed",
          problem,
        );

        setError(
          "Verified contribution records could not be loaded. Check the deployed Firestore rules.",
        );

        setContributionsLoading(
          false,
        );
      },
    );
  }, [
    user?.uid,
  ]);

  // Existing volunteerStats is kept only for
  // community-event attendance/service hours.
  // Emergency impact below is computed directly
  // from verifiedContributions.
  useEffect(() => {
    if (!user) {
      setEventStats(
        {},
      );

      setEventStatsLoading(
        false,
      );

      return;
    }

    const statsRef =
      doc(
        db,
        "volunteerStats",
        user.uid,
      );

    return onSnapshot(
      statsRef,

      (
        snapshot,
      ) => {
        if (
          snapshot.exists()
        ) {
          setEventStats(
            snapshot.data() as EventStats,
          );
        } else {
          setEventStats(
            {},
          );
        }

        setEventStatsLoading(
          false,
        );
      },

      (
        problem,
      ) => {
        console.error(
          "volunteerStats listener failed",
          problem,
        );

        // Event statistics are secondary.
        // Emergency impact can still render.
        setEventStats(
          {},
        );

        setEventStatsLoading(
          false,
        );
      },
    );
  }, [
    user?.uid,
  ]);

  const impact =
    useMemo(
      () => {
        let fullVerifiedHelps =
          0;

        let partialVerifiedHelps =
          0;

        let peopleHelped =
          0;

        let verifiedServiceMinutes =
          0;

        const typeCounts =
          new Map<
            string,
            number
          >();

        contributions.forEach(
          (
            contribution,
          ) => {
            if (
              contribution.outcome ===
              "fully_helped"
            ) {
              fullVerifiedHelps +=
                1;
            }

            if (
              contribution.outcome ===
              "partially_helped"
            ) {
              partialVerifiedHelps +=
                1;
            }

            peopleHelped +=
              Math.max(
                0,

                Math.round(
                  Number(
                    contribution.peopleHelped ||
                      0,
                  ),
                ),
              );

            verifiedServiceMinutes +=
              calculateServiceMinutes(
                contribution,
              );

            const type =
              String(
                contribution.contributionType ||
                  "General Volunteer Assistance",
              ).trim();

            typeCounts.set(
              type,

              (
                typeCounts.get(
                  type,
                ) || 0
              ) + 1,
            );
          },
        );

        const contributionTypes =
          [
            ...typeCounts.entries(),
          ]

            .map(
              (
                [
                  type,
                  count,
                ],
              ) => ({
                type,
                count,
              }),
            )

            .sort(
              (
                left,
                right,
              ) => {
                if (
                  right.count !==
                  left.count
                ) {
                  return (
                    right.count -
                    left.count
                  );
                }

                return left.type.localeCompare(
                  right.type,
                );
              },
            );

        return {
          verifiedHelps:
            fullVerifiedHelps +
            partialVerifiedHelps,

          fullVerifiedHelps,

          partialVerifiedHelps,

          peopleHelped,

          verifiedServiceMinutes,

          contributionTypes,
        };
      },

      [
        contributions,
      ],
    );

  if (
    loading ||
    contributionsLoading ||
    eventStatsLoading
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
          Loading your verified
          volunteer impact…
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
          Approved account required
        </Text>

        <Text
          style={
            styles.centerText
          }
        >
          Sign in with an approved
          VolunServe account to view
          your volunteer impact.
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
        <Text
          style={
            styles.eyebrow
          }
        >
          VERIFIED SERVICE RECORD
        </Text>

        <Text
          style={
            styles.title
          }
        >
          My Volunteer Impact
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Emergency contributions
          appear here only after the
          resident confirms that
          assistance was actually
          provided.
        </Text>
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

      <View
        style={
          styles.statsGrid
        }
      >
        <View
          style={
            styles.statCard
          }
        >
          <Text
            style={
              styles.statLabel
            }
          >
            VERIFIED HELPS
          </Text>

          <Text
            style={
              styles.statValue
            }
          >
            {
              impact.verifiedHelps
            }
          </Text>

          <Text
            style={
              styles.statHint
            }
          >
            {
              impact.fullVerifiedHelps
            }{" "}
            full ·{" "}
            {
              impact.partialVerifiedHelps
            }{" "}
            partial
          </Text>
        </View>

        <View
          style={
            styles.statCard
          }
        >
          <Text
            style={
              styles.statLabel
            }
          >
            EMERGENCY SERVICE
          </Text>

          <Text
            style={
              styles.statValue
            }
          >
            {formatDuration(
              impact.verifiedServiceMinutes,
            )}
          </Text>

          <Text
            style={
              styles.statHint
            }
          >
            Based on verified response
            activity
          </Text>
        </View>

        <View
          style={
            styles.statCard
          }
        >
          <Text
            style={
              styles.statLabel
            }
          >
            PEOPLE ASSISTED
          </Text>

          <Text
            style={
              styles.statValue
            }
          >
            {
              impact.peopleHelped
            }
          </Text>

          <Text
            style={
              styles.statHint
            }
          >
            From resident-confirmed
            missions
          </Text>
        </View>

        <View
          style={
            styles.statCard
          }
        >
          <Text
            style={
              styles.statLabel
            }
          >
            EVENT SERVICE
          </Text>

          <Text
            style={
              styles.statValue
            }
          >
            {Number(
              eventStats.totalHours ||
                0,
            ).toFixed(
              1,
            )}{" "}
            hrs
          </Text>

          <Text
            style={
              styles.statHint
            }
          >
            {Number(
              eventStats.totalEventsCompleted ||
                0,
            )}{" "}
            completed community
            event(s)
          </Text>
        </View>
      </View>

      <View
        style={
          styles.infoNotice
        }
      >
        <Text
          style={
            styles.infoNoticeTitle
          }
        >
          Verified Contribution
        </Text>

        <Text
          style={
            styles.infoNoticeText
          }
        >
          Completing an emergency
          response does not
          automatically count as
          verified service. Full or
          Partial resident
          confirmation is required.
          A Not Helped response goes
          to Admin review instead.
        </Text>
      </View>

      <View
        style={
          styles.card
        }
      >
        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Contribution breakdown
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              Verified emergency
              assistance grouped by
              service type.
            </Text>
          </View>
        </View>

        {impact.contributionTypes
          .length === 0 ? (
          <View
            style={
              styles.emptyState
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No verified emergency
              contributions yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              A completed emergency
              response will appear
              here after resident
              confirmation.
            </Text>
          </View>
        ) : (
          impact.contributionTypes.map(
            (
              item,
            ) => (
              <View
                key={
                  item.type
                }
                style={
                  styles.typeRow
                }
              >
                <View
                  style={
                    styles.typeCopy
                  }
                >
                  <Text
                    style={
                      styles.typeName
                    }
                  >
                    {
                      item.type
                    }
                  </Text>

                  <Text
                    style={
                      styles.typeHint
                    }
                  >
                    Verified response
                    contribution
                  </Text>
                </View>

                <View
                  style={
                    styles.countBadge
                  }
                >
                  <Text
                    style={
                      styles.countBadgeText
                    }
                  >
                    {
                      item.count
                    }
                  </Text>
                </View>
              </View>
            ),
          )
        )}
      </View>

      <View
        style={
          styles.card
        }
      >
        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Verified contribution
              history
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              Resident-confirmed
              emergency assistance
              records.
            </Text>
          </View>

          <Text
            style={
              styles.recordCount
            }
          >
            {
              contributions.length
            }{" "}
            record
            {contributions.length ===
            1
              ? ""
              : "s"}
          </Text>
        </View>

        {contributions.length ===
        0 ? (
          <View
            style={
              styles.emptyState
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No history yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Verified responses will
              automatically appear in
              this history after the
              resident confirms
              assistance.
            </Text>
          </View>
        ) : (
          contributions.map(
            (
              contribution,
            ) => {
              const serviceMinutes =
                calculateServiceMinutes(
                  contribution,
                );

              return (
                <View
                  key={
                    contribution.id
                  }
                  style={
                    styles.contributionCard
                  }
                >
                  <View
                    style={
                      styles.contributionTop
                    }
                  >
                    <View
                      style={
                        styles.contributionTitleBlock
                      }
                    >
                      <Text
                        style={
                          styles.contributionType
                        }
                      >
                        {contribution.contributionType ||
                          "General Volunteer Assistance"}
                      </Text>

                      <Text
                        style={
                          styles.verifiedDate
                        }
                      >
                        Verified{" "}
                        {formatDate(
                          contribution.verifiedAt,
                        )}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.outcomeBadge,

                        contribution.outcome ===
                          "partially_helped" &&
                          styles.partialBadge,
                      ]}
                    >
                      <Text
                        style={
                          styles.outcomeText
                        }
                      >
                        {outcomeLabel(
                          contribution.outcome,
                        )}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={
                      styles.summary
                    }
                  >
                    {contribution.contributionSummary ||
                      "Verified assistance provided."}
                  </Text>

                  <View
                    style={
                      styles.metricsRow
                    }
                  >
                    <View
                      style={
                        styles.metric
                      }
                    >
                      <Text
                        style={
                          styles.metricLabel
                        }
                      >
                        PEOPLE ASSISTED
                      </Text>

                      <Text
                        style={
                          styles.metricValue
                        }
                      >
                        {Math.max(
                          0,

                          Number(
                            contribution.peopleHelped ||
                              0,
                          ),
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.metric
                      }
                    >
                      <Text
                        style={
                          styles.metricLabel
                        }
                      >
                        SERVICE TIME
                      </Text>

                      <Text
                        style={
                          styles.metricValue
                        }
                      >
                        {formatDuration(
                          serviceMinutes,
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.metric
                      }
                    >
                      <Text
                        style={
                          styles.metricLabel
                        }
                      >
                        CONFIRMATION
                      </Text>

                      <Text
                        style={
                          styles.metricValue
                        }
                      >
                        Resident
                        verified
                      </Text>
                    </View>
                  </View>

                  {!!contribution.completionNotes && (
                    <View
                      style={
                        styles.notesBox
                      }
                    >
                      <Text
                        style={
                          styles.notesLabel
                        }
                      >
                        COMPLETION NOTE
                      </Text>

                      <Text
                        style={
                          styles.notesText
                        }
                      >
                        {
                          contribution.completionNotes
                        }
                      </Text>
                    </View>
                  )}

                  <Text
                    style={
                      styles.reference
                    }
                  >
                    Contribution ID:{" "}
                    {
                      contribution.id
                    }
                  </Text>
                </View>
              );
            },
          )
        )}
      </View>

      <View
        style={
          styles.footerNotice
        }
      >
        <Text
          style={
            styles.footerNoticeTitle
          }
        >
          Certificate record
        </Text>

        <Text
          style={
            styles.footerNoticeText
          }
        >
          These verified contributions
          will be used by the Admin
          when reviewing and issuing
          your Volunteer Service
          Certificate.
        </Text>
      </View>
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
      maxWidth: 1120,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 60,
    },

    loadingScreen: {
      flex: 1,
      justifyContent:
        "center",
      alignItems: "center",
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
      color: "#102A3A",
      fontSize: 20,
      fontWeight: "900",
    },

    centerText: {
      marginTop: 7,
      color: "#64748B",
      lineHeight: 20,
    },

    header: {
      marginBottom: 18,
    },

    eyebrow: {
      color: "#087F78",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    title: {
      marginTop: 5,
      color: "#102A3A",
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "900",
    },

    subtitle: {
      marginTop: 6,
      maxWidth: 760,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 20,
    },

    errorBox: {
      marginBottom: 14,
      padding: 12,
      borderRadius: 11,
      backgroundColor:
        "#FFF1F1",
      borderWidth: 1,
      borderColor:
        "#F1BEBE",
    },

    errorText: {
      color: "#A83232",
      fontSize: 11.5,
      fontWeight: "700",
      lineHeight: 18,
    },

    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 16,
    },

    statCard: {
      flexGrow: 1,
      flexBasis: 220,
      minWidth: 205,
      padding: 16,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    statLabel: {
      color: "#7D919D",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    statValue: {
      marginTop: 7,
      color: "#102A3A",
      fontSize: 25,
      fontWeight: "900",
    },

    statHint: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 10.5,
      lineHeight: 16,
    },

    infoNotice: {
      marginBottom: 16,
      padding: 14,
      borderRadius: 13,
      backgroundColor:
        "#EDF8F5",
      borderWidth: 1,
      borderColor:
        "#CAE5DE",
    },

    infoNoticeTitle: {
      color: "#08786F",
      fontSize: 13,
      fontWeight: "900",
    },

    infoNoticeText: {
      marginTop: 5,
      color: "#4F6D70",
      fontSize: 11.5,
      lineHeight: 18,
    },

    card: {
      marginBottom: 16,
      padding: 18,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    sectionHeader: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 10,
      marginBottom: 12,
    },

    sectionTitle: {
      color: "#173748",
      fontSize: 16,
      fontWeight: "900",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: "#7A8E99",
      fontSize: 10.5,
      lineHeight: 16,
    },

    recordCount: {
      color: "#08786F",
      fontSize: 10.5,
      fontWeight: "900",
    },

    emptyState: {
      paddingVertical: 18,
      alignItems: "center",
    },

    emptyTitle: {
      color: "#405965",
      fontSize: 13,
      fontWeight: "800",
    },

    emptyText: {
      marginTop: 5,
      maxWidth: 500,
      textAlign: "center",
      color: "#7A8E99",
      fontSize: 11,
      lineHeight: 17,
    },

    typeRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      paddingVertical: 11,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E5ECEF",
    },

    typeCopy: {
      flex: 1,
    },

    typeName: {
      color: "#334E5C",
      fontSize: 12,
      fontWeight: "800",
    },

    typeHint: {
      marginTop: 2,
      color: "#899AA4",
      fontSize: 9.5,
    },

    countBadge: {
      minWidth: 34,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#E7F5F2",
      alignItems: "center",
    },

    countBadgeText: {
      color: "#08786F",
      fontSize: 11,
      fontWeight: "900",
    },

    contributionCard: {
      marginTop: 10,
      padding: 14,
      borderRadius: 13,
      backgroundColor:
        "#F9FBFC",
      borderWidth: 1,
      borderColor:
        "#DFE8EC",
    },

    contributionTop: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 12,
    },

    contributionTitleBlock: {
      flex: 1,
    },

    contributionType: {
      color: "#173748",
      fontSize: 14,
      fontWeight: "900",
    },

    verifiedDate: {
      marginTop: 3,
      color: "#84959F",
      fontSize: 9.5,
    },

    outcomeBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#E7F6F2",
    },

    partialBadge: {
      backgroundColor:
        "#FFF3CF",
    },

    outcomeText: {
      color: "#08786F",
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.4,
    },

    summary: {
      marginTop: 10,
      color: "#405D6A",
      fontSize: 12,
      lineHeight: 18,
    },

    metricsRow: {
      marginTop: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    metric: {
      flexGrow: 1,
      flexBasis: 130,
      minWidth: 125,
      padding: 10,
      borderRadius: 9,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E4EAED",
    },

    metricLabel: {
      color: "#91A0A9",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    metricValue: {
      marginTop: 3,
      color: "#334E5C",
      fontSize: 11,
      fontWeight: "800",
    },

    notesBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: 9,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E5ECEF",
    },

    notesLabel: {
      color: "#8799A3",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    notesText: {
      marginTop: 4,
      color: "#526B79",
      fontSize: 10.5,
      lineHeight: 16,
    },

    reference: {
      marginTop: 10,
      color: "#95A4AD",
      fontSize: 8.5,
    },

    footerNotice: {
      padding: 15,
      borderRadius: 14,
      backgroundColor:
        "#F4F8FA",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    footerNoticeTitle: {
      color: "#173748",
      fontSize: 12.5,
      fontWeight: "900",
    },

    footerNoticeText: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 11,
      lineHeight: 17,
    },
  });