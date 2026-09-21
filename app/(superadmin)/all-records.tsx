import { Ionicons } from "@expo/vector-icons";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import React, {
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

import {
  db,
} from "../../lib/firebase";

type RecordType =
  | "users"
  | "applications"
  | "cases"
  | "assignments"
  | "contributions"
  | "disputes"
  | "donations"
  | "events"
  | "certificates";

type GenericRecord = {
  id: string;
  [key: string]: any;
};

type RecordGroup = Record<
  RecordType,
  GenericRecord[]
>;

const emptyRecords: RecordGroup = {
  users: [],
  applications: [],
  cases: [],
  assignments: [],
  contributions: [],
  disputes: [],
  donations: [],
  events: [],
  certificates: [],
};

const recordSources: Array<{
  type: RecordType;
  collectionName: string;
}> = [
  {
    type: "users",
    collectionName: "users",
  },
  {
    type: "applications",
    collectionName: "volunteerApplications",
  },
  {
    type: "cases",
    collectionName: "disasterCases",
  },
  {
    type: "assignments",
    collectionName: "responseAssignments",
  },
  {
    type: "contributions",
    collectionName: "verifiedContributions",
  },
  {
    type: "disputes",
    collectionName: "responseDisputes",
  },
  {
    type: "donations",
    collectionName: "donations",
  },
  {
    type: "events",
    collectionName: "volunteerEvents",
  },
  {
    type: "certificates",
    collectionName: "certificates",
  },
];

const timestampValue = (
  value: any
) => {
  return (
    value?.toMillis?.() ||
    0
  );
};

const readableDate = (
  value: any
) => {
  try {
    const date =
      value?.toDate?.();

    if (!date) {
      return "-";
    }

    return date.toLocaleString();
  } catch {
    return "-";
  }
};

const firstText = (
  ...values: any[]
) => {
  for (const value of values) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }

    if (
      typeof value === "number"
    ) {
      return String(value);
    }

    if (
      typeof value === "boolean"
    ) {
      return value
        ? "Yes"
        : "No";
    }
  }

  return "-";
};

const statusColor = (
  status: string
) => {
  const normalized =
    status
      .toLowerCase()
      .replace(/_/g, " ");

  if (
    normalized.includes("approved") ||
    normalized.includes("completed") ||
    normalized.includes("verified") ||
    normalized.includes("active") ||
    normalized.includes("credited") ||
    normalized.includes("issued") ||
    normalized.includes("resolved")
  ) {
    return {
      background: "#DCFCE7",
      text: "#166534",
    };
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("offered") ||
    normalized.includes("assigned") ||
    normalized.includes("respond") ||
    normalized.includes("on site") ||
    normalized.includes("onsite") ||
    normalized.includes("in progress")
  ) {
    return {
      background: "#DBEAFE",
      text: "#1D4ED8",
    };
  }

  if (
    normalized.includes("reject") ||
    normalized.includes("suspend") ||
    normalized.includes("dispute") ||
    normalized.includes("not helped") ||
    normalized.includes("cancel")
  ) {
    return {
      background: "#FEE2E2",
      text: "#B91C1C",
    };
  }

  return {
    background: "#F1F5F9",
    text: "#475569",
  };
};

export default function AllRecords() {
  const [
    records,
    setRecords,
  ] = useState<RecordGroup>(
    emptyRecords
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<RecordType>(
      "users"
    );

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    errors,
    setErrors,
  ] = useState<
    Partial<
      Record<
        RecordType,
        string
      >
    >
  >({});

  React.useEffect(() => {
    const loadedCollections =
      new Set<RecordType>();

    const markLoaded = (
      type: RecordType
    ) => {
      loadedCollections.add(
        type
      );

      if (
        loadedCollections.size >=
        recordSources.length
      ) {
        setLoading(false);
      }
    };

    const listen = (
      type: RecordType,
      collectionName: string
    ) => {
      return onSnapshot(
        collection(
          db,
          collectionName
        ),

        (snapshot) => {
          const rows: GenericRecord[] =
            snapshot.docs
              .map(
                (
                  item
                ): GenericRecord => ({
                  ...(
                    item.data() as Record<
                      string,
                      any
                    >
                  ),

                  id: item.id,
                })
              )
              .sort(
                (
                  a: GenericRecord,
                  b: GenericRecord
                ) =>
                  Math.max(
                    timestampValue(
                      b.updatedAt
                    ),

                    timestampValue(
                      b.createdAt
                    ),

                    timestampValue(
                      b.completedAt
                    ),

                    timestampValue(
                      b.issuedAt
                    ),

                    timestampValue(
                      b.reviewedAt
                    ),

                    timestampValue(
                      b.resolvedAt
                    ),

                    timestampValue(
                      b.verifiedAt
                    )
                  ) -
                  Math.max(
                    timestampValue(
                      a.updatedAt
                    ),

                    timestampValue(
                      a.createdAt
                    ),

                    timestampValue(
                      a.completedAt
                    ),

                    timestampValue(
                      a.issuedAt
                    ),

                    timestampValue(
                      a.reviewedAt
                    ),

                    timestampValue(
                      a.resolvedAt
                    ),

                    timestampValue(
                      a.verifiedAt
                    )
                  )
              );

          setRecords(
            (current) => ({
              ...current,

              [type]: rows,
            })
          );

          setErrors(
            (current) => {
              const next = {
                ...current,
              };

              delete next[type];

              return next;
            }
          );

          markLoaded(type);
        },

        (error) => {
          console.log(
            `${collectionName} oversight listener error`,
            error
          );

          setErrors(
            (current) => ({
              ...current,

              [type]:
                "Unable to read this collection.",
            })
          );

          markLoaded(type);
        }
      );
    };

    const unsubscribers =
      recordSources.map(
        ({
          type,
          collectionName,
        }) =>
          listen(
            type,
            collectionName
          )
      );

    return () => {
      unsubscribers.forEach(
        (unsubscribe) =>
          unsubscribe()
      );
    };
  }, []);

  const visibleRecords =
    useMemo(() => {
      const source =
        records[activeTab];

      const term =
        search
          .trim()
          .toLowerCase();

      if (!term) {
        return source;
      }

      return source.filter(
        (item) => {
          const searchable =
            Object.values(
              item
            )
              .filter(
                (value) =>
                  typeof value ===
                    "string" ||
                  typeof value ===
                    "number" ||
                  typeof value ===
                    "boolean"
              )
              .join(" ")
              .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      records,
      activeTab,
      search,
    ]);

  const tabs: {
    key: RecordType;
    label: string;
    icon: any;
  }[] = [
    {
      key: "users",
      label: "Users",
      icon: "people-outline",
    },

    {
      key: "applications",
      label: "Volunteer Applications",
      icon: "person-add-outline",
    },

    {
      key: "cases",
      label: "Cases",
      icon: "warning-outline",
    },

    {
      key: "assignments",
      label: "Assignments",
      icon: "navigate-outline",
    },

    {
      key: "contributions",
      label: "Verified Help",
      icon:
        "checkmark-done-outline",
    },

    {
      key: "disputes",
      label: "Disputes",
      icon: "alert-circle-outline",
    },

    {
      key: "donations",
      label: "Donations",
      icon: "gift-outline",
    },

    {
      key: "events",
      label: "Events",
      icon: "calendar-outline",
    },

    {
      key: "certificates",
      label: "Certificates",
      icon: "ribbon-outline",
    },
  ];

  const renderRecord = (
    item: GenericRecord
  ) => {
    if (
      activeTab === "users"
    ) {
      const status =
        firstText(
          item.status,
          "unknown"
        );

      return (
        <RecordCard
          key={item.id}
          icon="person-outline"
          title={firstText(
            item.fullName,
            item.displayName,
            item.email,
            "Unnamed User"
          )}
          subtitle={firstText(
            item.email
          )}
          status={status}
          rows={[
            {
              label: "Role",
              value: firstText(
                item.role
              ),
            },

            {
              label:
                "Barangay",
              value: firstText(
                item.barangay
              ),
            },

            {
              label: "Phone",
              value: firstText(
                item.phoneNumber,
                item.phone
              ),
            },

            {
              label:
                "User ID",
              value: item.id,
            },
          ]}
        />
      );
    }

    if (
      activeTab === "applications"
    ) {
      const status =
        firstText(
          item.status,
          "pending"
        );

      return (
        <RecordCard
          key={item.id}
          icon="person-add-outline"
          title={firstText(
            item.fullName,
            item.name,
            item.email,
            "Volunteer Application"
          )}
          subtitle={firstText(
            item.email,
            item.barangay
          )}
          status={status}
          rows={[
            {
              label:
                "Requested Role",
              value: firstText(
                item.requestedRole,
                "volunteer"
              ),
            },

            {
              label:
                "Barangay",
              value: firstText(
                item.barangay
              ),
            },

            {
              label:
                "Applicant UID",
              value: firstText(
                item.uid,
                item.userId,
                item.id
              ),
            },

            {
              label:
                "Application ID",
              value: item.id,
            },
          ]}
        />
      );
    }

    if (
      activeTab === "cases"
    ) {
      const status =
        firstText(
          item.status,
          "unknown"
        );

      return (
        <RecordCard
          key={item.id}
          icon="warning-outline"
          title={firstText(
            item.title,
            item.category,
            "Emergency Case"
          )}
          subtitle={firstText(
            item.location,
            item.reporterBarangay,
            item.reporterAddress
          )}
          status={status}
          rows={[
            {
              label:
                "Severity",
              value: firstText(
                item.severity
              ),
            },

            {
              label:
                "Affected People",
              value: firstText(
                item.affectedPeople
              ),
            },

            {
              label:
                "Reporter",
              value: firstText(
                item.reporterName,
                item.reporterUid
              ),
            },

            {
              label:
                "Case ID",
              value: item.id,
            },
          ]}
        />
      );
    }

    if (
      activeTab ===
      "assignments"
    ) {
      const status =
        firstText(
          item.status,
          "unknown"
        );

      return (
        <RecordCard
          key={item.id}
          icon="navigate-outline"
          title={firstText(
            item.caseTitle,
            "Response Assignment"
          )}
          subtitle={`Volunteer: ${firstText(
            item.volunteerName,
            item.volunteerId
          )}`}
          status={status}
          rows={[
            {
              label:
                "Volunteer ID",
              value: firstText(
                item.volunteerId
              ),
            },

            {
              label:
                "Case ID",
              value: firstText(
                item.caseId
              ),
            },

            {
              label:
                "Resident Confirmation",
              value: firstText(
                item.residentConfirmationStatus,
                "pending"
              ),
            },

            {
              label:
                "Assignment ID",
              value: item.id,
            },
          ]}
        />
      );
    }

    if (
      activeTab ===
      "contributions"
    ) {
      const status =
        firstText(
          item.status,
          "verified"
        );

      return (
        <RecordCard
          key={item.id}
          icon={
            "checkmark-circle-outline"
          }
          title={firstText(
            item.volunteerName,
            "Verified Contribution"
          )}
          subtitle={firstText(
            item.contributionSummary,
            `Volunteer ID: ${firstText(
              item.volunteerId
            )}`
          )}
          status={status}
          rows={[
            {
              label:
                "Resident Outcome",
              value: firstText(
                item.outcome
              ),
            },

            {
              label:
                "Contribution Type",
              value: firstText(
                item.contributionType
              ),
            },

            {
              label:
                "People Helped",
              value: firstText(
                item.peopleHelped
              ),
            },

            {
              label:
                "Case ID",
              value: firstText(
                item.caseId
              ),
            },
          ]}
        />
      );
    }

    if (
      activeTab === "disputes"
    ) {
      const status =
        firstText(
          item.status,
          "open"
        );

      return (
        <RecordCard
          key={item.id}
          icon="alert-circle-outline"
          title={firstText(
            item.contributionType,
            "Response Dispute"
          )}
          subtitle={firstText(
            item.residentNote,
            "Resident marked this response as Not Helped."
          )}
          status={status}
          rows={[
            {
              label:
                "Resident ID",
              value: firstText(
                item.residentId
              ),
            },

            {
              label:
                "Volunteer ID",
              value: firstText(
                item.volunteerId
              ),
            },

            {
              label:
                "Case ID",
              value: firstText(
                item.caseId
              ),
            },

            {
              label:
                "Assignment ID",
              value: firstText(
                item.assignmentId,
                item.id
              ),
            },
          ]}
        />
      );
    }

    if (
      activeTab === "donations"
    ) {
      const status =
        firstText(
          item.status,
          "unknown"
        );

      return (
        <RecordCard
          key={item.id}
          icon="gift-outline"
          title={firstText(
            item.donorName,
            item.donorEmail,
            "Donation Record"
          )}
          subtitle={firstText(
            item.itemsDescription,
            item.donationType
          )}
          status={status}
          rows={[
            {
              label:
                "Donation Type",
              value: firstText(
                item.donationType
              ),
            },

            {
              label:
                "Amount",
              value: firstText(
                item.amount
              ),
            },

            {
              label:
                "Families Helped",
              value: firstText(
                item.familiesHelped
              ),
            },

            {
              label:
                "Donation ID",
              value: item.id,
            },
          ]}
        />
      );
    }

    if (
      activeTab === "events"
    ) {
      const status =
        firstText(
          item.status,
          "active"
        );

      return (
        <RecordCard
          key={item.id}
          icon="calendar-outline"
          title={firstText(
            item.title,
            item.name,
            "Volunteer Event"
          )}
          subtitle={firstText(
            item.location,
            item.barangay
          )}
          status={status}
          rows={[
            {
              label:
                "Barangay",
              value: firstText(
                item.barangay
              ),
            },

            {
              label:
                "Required Volunteers",
              value: firstText(
                item.requiredVolunteers
              ),
            },

            {
              label:
                "Assigned Volunteers",
              value: firstText(
                item.assignedVolunteersCount,
                item.participantCount
              ),
            },

            {
              label:
                "Event ID",
              value: item.id,
            },
          ]}
        />
      );
    }

    const status =
      firstText(
        item.verificationStatus,
        item.status,
        "issued"
      );

    return (
      <RecordCard
        key={item.id}
        icon="ribbon-outline"
        title={firstText(
          item.volunteerName,
          item.recipientName,
          "Volunteer Certificate"
        )}
        subtitle={firstText(
          item.certificateId,
          item.id
        )}
        status={status}
        rows={[
          {
            label:
              "Verified Helps",
            value: firstText(
              item.verifiedHelps
            ),
          },

          {
            label:
              "Service Minutes",
            value: firstText(
              item.verifiedServiceMinutes
            ),
          },

          {
            label:
              "People Helped",
            value: firstText(
              item.peopleHelped
            ),
          },

          {
            label:
              "Issued At",
            value: readableDate(
              item.issuedAt
            ),
          },
        ]}
      />
    );
  };


  if (loading) {
    return (
      <View
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
          color="#0F766E"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading system records...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
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
          SUPER ADMIN
        </Text>

        <Text
          style={styles.title}
        >
          All Records
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Read-only oversight of
          VolunServe&apos;s core
          operational records.
        </Text>
      </View>

      <View
        style={
          styles.summaryRow
        }
      >
        <SummaryCard
          label="Users"
          value={
            records.users.length
          }
          icon="people-outline"
        />

        <SummaryCard
          label="Cases"
          value={
            records.cases.length
          }
          icon="warning-outline"
        />

        <SummaryCard
          label="Verified Help"
          value={
            records
              .contributions.length
          }
          icon={
            "checkmark-done-outline"
          }
        />

        <SummaryCard
          label="Disputes"
          value={
            records.disputes.length
          }
          icon="alert-circle-outline"
        />

        <SummaryCard
          label="Donations"
          value={
            records.donations.length
          }
          icon="gift-outline"
        />

        <SummaryCard
          label="Certificates"
          value={
            records
              .certificates.length
          }
          icon="ribbon-outline"
        />
      </View>

      <View
        style={styles.tabs}
      >
        {tabs.map(
          (tab) => {
            const selected =
              activeTab ===
              tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,

                  selected &&
                    styles.tabButtonActive,
                ]}
                onPress={() => {
                  setActiveTab(
                    tab.key
                  );

                  setSearch("");
                }}
              >
                <Ionicons
                  name={
                    tab.icon
                  }
                  size={17}
                  color={
                    selected
                      ? "#FFFFFF"
                      : "#475569"
                  }
                />

                <Text
                  style={[
                    styles.tabText,

                    selected &&
                      styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </View>

      <View
        style={
          styles.searchBar
        }
      >
        <Ionicons
          name="search-outline"
          size={20}
          color="#64748B"
        />

        <TextInput
          value={search}
          onChangeText={
            setSearch
          }
          placeholder={
            "Search current records..."
          }
          placeholderTextColor="#94A3B8"
          style={
            styles.searchInput
          }
        />
      </View>

      {errors[activeTab] ? (
        <View
          style={styles.errorCard}
        >
          <Ionicons
            name="alert-circle-outline"
            size={22}
            color="#B91C1C"
          />

          <View
            style={{ flex: 1 }}
          >
            <Text
              style={
                styles.errorTitle
              }
            >
              Collection unavailable
            </Text>

            <Text
              style={
                styles.errorText
              }
            >
              {
                errors[
                  activeTab
                ]
              }
            </Text>
          </View>
        </View>
      ) : (
        <>
          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              {
                tabs.find(
                  (tab) =>
                    tab.key ===
                    activeTab
                )?.label
              }
            </Text>

            <Text
              style={
                styles.recordCount
              }
            >
              {
                visibleRecords.length
              }{" "}
              record
              {visibleRecords.length ===
              1
                ? ""
                : "s"}
            </Text>
          </View>

          {visibleRecords.length ===
          0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Ionicons
                name="folder-open-outline"
                size={38}
                color="#0F766E"
              />

              <Text
                style={
                  styles.emptyTitle
                }
              >
                No records found
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                There are no matching
                records in this view.
              </Text>
            </View>
          ) : (
            visibleRecords.map(
              renderRecord
            )
          )}
        </>
      )}

      <View
        style={
          styles.infoBox
        }
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color="#0369A1"
        />

        <Text
          style={
            styles.infoText
          }
        >
          All Records is for
          Super Admin oversight only.
          Operational actions remain
          inside their proper Admin
          modules to keep the system
          clear and avoid duplicate
          controls.
        </Text>
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: any;
}) {
  return (
    <View
      style={
        styles.summaryCard
      }
    >
      <View
        style={
          styles.summaryIcon
        }
      >
        <Ionicons
          name={icon}
          size={20}
          color="#0F766E"
        />
      </View>

      <Text
        style={
          styles.summaryValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.summaryLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function RecordCard({
  icon,
  title,
  subtitle,
  status,
  rows,
}: {
  icon: any;
  title: string;
  subtitle: string;
  status: string;
  rows: {
    label: string;
    value: string;
  }[];
}) {
  const colors =
    statusColor(status);

  return (
    <View
      style={
        styles.recordCard
      }
    >
      <View
        style={
          styles.recordTop
        }
      >
        <View
          style={
            styles.recordIcon
          }
        >
          <Ionicons
            name={icon}
            size={21}
            color="#0F766E"
          />
        </View>

        <View
          style={{ flex: 1 }}
        >
          <Text
            style={
              styles.recordTitle
            }
          >
            {title}
          </Text>

          <Text
            style={
              styles.recordSubtitle
            }
          >
            {subtitle}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                colors.background,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color:
                  colors.text,
              },
            ]}
          >
            {status
              .replace(
                /_/g,
                " "
              )
              .toUpperCase()}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.recordDetails
        }
      >
        {rows.map(
          (row) => (
            <View
              key={
                row.label
              }
              style={
                styles.detailBox
              }
            >
              <Text
                style={
                  styles.detailLabel
                }
              >
                {row.label.toUpperCase()}
              </Text>

              <Text
                numberOfLines={2}
                style={
                  styles.detailValue
                }
              >
                {row.value ||
                  "-"}
              </Text>
            </View>
          )
        )}
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      padding: 24,
      paddingBottom: 60,
      backgroundColor:
        "#F1F5F9",
      minHeight: "100%",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F8FAFC",
    },

    loadingText: {
      marginTop: 12,
      color: "#64748B",
      fontWeight: "600",
    },

    header: {
      marginBottom: 20,
    },

    eyebrow: {
      fontSize: 11,
      fontWeight: "900",
      color: "#0F766E",
      letterSpacing: 1.3,
    },

    title: {
      marginTop: 4,
      fontSize: 30,
      fontWeight: "900",
      color: "#0F172A",
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      lineHeight: 20,
    },

    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 18,
    },

    summaryCard: {
      flexGrow: 1,
      minWidth: 150,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    summaryIcon: {
      width: 39,
      height: 39,
      borderRadius: 11,
      backgroundColor:
        "#CCFBF1",
      alignItems: "center",
      justifyContent:
        "center",
      marginBottom: 10,
    },

    summaryValue: {
      fontSize: 23,
      fontWeight: "900",
      color: "#0F172A",
    },

    summaryLabel: {
      marginTop: 2,
      color: "#64748B",
      fontWeight: "700",
    },

    tabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
    },

    tabButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 13,
      paddingVertical: 9,
    },

    tabButtonActive: {
      backgroundColor:
        "#0F766E",
      borderColor: "#0F766E",
    },

    tabText: {
      color: "#475569",
      fontWeight: "800",
      fontSize: 12,
    },

    tabTextActive: {
      color: "#FFFFFF",
    },

    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor: "#CBD5E1",
      borderRadius: 12,
      paddingHorizontal: 13,
      marginBottom: 18,
    },

    searchInput: {
      flex: 1,
      minHeight: 45,
      color: "#0F172A",
      outlineStyle: "none",
    } as any,

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginBottom: 10,
    },

    sectionTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: "#0F172A",
    },

    recordCount: {
      color: "#64748B",
      fontSize: 12,
      fontWeight: "700",
    },

    recordCard: {
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
      borderRadius: 15,
      padding: 16,
      marginBottom: 12,
    },

    recordTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },

    recordIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#CCFBF1",
    },

    recordTitle: {
      fontSize: 16,
      fontWeight: "900",
      color: "#0F172A",
    },

    recordSubtitle: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 12,
    },

    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },

    statusText: {
      fontSize: 9,
      fontWeight: "900",
    },

    recordDetails: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      marginTop: 14,
    },

    detailBox: {
      minWidth: 170,
      flexGrow: 1,
      backgroundColor:
        "#F8FAFC",
      borderRadius: 10,
      padding: 11,
    },

    detailLabel: {
      fontSize: 9,
      fontWeight: "900",
      color: "#94A3B8",
      letterSpacing: 0.5,
    },

    detailValue: {
      marginTop: 4,
      color: "#334155",
      fontWeight: "700",
      fontSize: 12,
    },

    emptyCard: {
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
      borderRadius: 15,
      padding: 30,
      alignItems: "center",
    },

    emptyTitle: {
      marginTop: 10,
      color: "#0F172A",
      fontWeight: "900",
      fontSize: 16,
    },

    emptyText: {
      marginTop: 4,
      color: "#64748B",
      textAlign: "center",
    },

    errorCard: {
      flexDirection: "row",
      gap: 10,
      backgroundColor:
        "#FEF2F2",
      borderRadius: 13,
      padding: 14,
      borderWidth: 1,
      borderColor: "#FECACA",
    },

    errorTitle: {
      color: "#991B1B",
      fontWeight: "900",
    },

    errorText: {
      marginTop: 3,
      color: "#B91C1C",
    },

    infoBox: {
      marginTop: 18,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 9,
      backgroundColor:
        "#E0F2FE",
      borderRadius: 12,
      padding: 13,
    },

    infoText: {
      flex: 1,
      color: "#075985",
      lineHeight: 19,
      fontSize: 12,
    },
  });