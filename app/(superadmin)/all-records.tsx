import { Ionicons } from "@expo/vector-icons";
import ListPagination from "../../components/ui/ListPagination";

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
  | "assistance"
  | "assignments"
  | "contributions"
  | "disputes"
  | "donations"
  | "events"
  | "communityEvents"
  | "eventProposals"
  | "eventParticipants"
  | "credentialReviews"
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
  assistance: [],
  assignments: [],
  contributions: [],
  disputes: [],
  donations: [],
  events: [],
  communityEvents: [],
  eventProposals: [],
  eventParticipants: [],
  credentialReviews: [],
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
    type: "assistance",
    collectionName: "assistanceRequests",
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
  // Donation receipts are private LGU Admin financial records, not Super Admin oversight.
  {
    type: "events",
    collectionName: "volunteerEvents",
  },
  {
    type: "communityEvents",
    collectionName: "communityEvents",
  },
  {
    type: "eventProposals",
    collectionName: "communityEventProposals",
  },
  {
    type: "eventParticipants",
    collectionName: "communityEventParticipants",
  },
  {
    type: "credentialReviews",
    collectionName: "lguAdminCredentialReviews",
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

type AccountAudience = "resident" | "volunteer" | "staff" | "other";

type SystemRecordView = {
  id: string;
  label: string;
  icon: any;
  source: RecordType;
  audience?: AccountAudience;
};

type SystemRecordSection = {
  id: string;
  label: string;
  icon: any;
  views: SystemRecordView[];
};

// Each operational collection has one home. Account records are split by their
// recorded roles rather than mixing residents, volunteers, and privileged staff.
const recordSections: SystemRecordSection[] = [
  {
    id: "residents", label: "Residents", icon: "home-outline",
    views: [
      { id: "residentAccounts", label: "Resident Accounts", icon: "people-outline", source: "users", audience: "resident" },
      { id: "cases", label: "Emergency Reports", icon: "warning-outline", source: "cases" },
      { id: "assistance", label: "Assistance Requests", icon: "medkit-outline", source: "assistance" },
      { id: "disputes", label: "Disputes", icon: "alert-circle-outline", source: "disputes" },
    ],
  },
  {
    id: "volunteers", label: "Volunteers", icon: "hand-left-outline",
    views: [
      { id: "volunteerAccounts", label: "Volunteer Accounts", icon: "person-outline", source: "users", audience: "volunteer" },
      { id: "applications", label: "Volunteer Applications", icon: "person-add-outline", source: "applications" },
      { id: "eventParticipants", label: "Volunteer Attendance", icon: "checkmark-circle-outline", source: "eventParticipants" },
      { id: "certificates", label: "Certificates", icon: "ribbon-outline", source: "certificates" },
    ],
  },
  {
    id: "events", label: "Community Events", icon: "calendar-outline",
    views: [
      { id: "eventProposals", label: "Event Proposals", icon: "document-text-outline", source: "eventProposals" },
      { id: "communityEvents", label: "Community Events", icon: "calendar-outline", source: "communityEvents" },
      { id: "events", label: "Legacy Volunteer Events", icon: "time-outline", source: "events" },
    ],
  },
  {
    id: "operations", label: "Response & Outcomes", icon: "navigate-outline",
    views: [
      { id: "assignments", label: "Response Assignments", icon: "navigate-outline", source: "assignments" },
      { id: "contributions", label: "Verified Help", icon: "checkmark-done-outline", source: "contributions" },
    ],
  },
  {
    id: "administration", label: "LGU & Other Accounts", icon: "shield-checkmark-outline",
    views: [
      { id: "staffAccounts", label: "LGU & Staff Accounts", icon: "people-circle-outline", source: "users", audience: "staff" },
      { id: "credentialReviews", label: "LGU Credential Reviews", icon: "shield-checkmark-outline", source: "credentialReviews" },
      { id: "otherAccounts", label: "Other Accounts", icon: "help-circle-outline", source: "users", audience: "other" },
    ],
  },
];

function accountAudienceForRole(role: unknown): AccountAudience {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (["superadmin", "super_admin", "admin", "lgu_personnel", "applicant", "lgu_staff", "staff"].includes(normalized)) return "staff";
  if (["volunteer", "verified_volunteer"].includes(normalized)) return "volunteer";
  if (["resident", "basic_resident", "verified_resident", "basic", "verified"].includes(normalized)) return "resident";
  return "other";
}

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

  const [activeSectionId, setActiveSectionId] = useState("residents");
  const [activeViewId, setActiveViewId] = useState("residentAccounts");
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RecordType>("users");

  const [
    search,
    setSearch,
  ] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

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
      const activeView = recordSections
        .flatMap(section => section.views)
        .find(view => view.id === activeViewId);
      const source = records[activeTab];
      const scopedRecords = activeTab === "users" && activeView?.audience
        ? source.filter(item => accountAudienceForRole(item.role) === activeView.audience)
        : source;

      const term =
        search
          .trim()
          .toLowerCase();

      if (!term) {
        return scopedRecords;
      }

      return scopedRecords.filter(
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
      activeViewId,
      search,
    ]);
  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const pagedRecords = visibleRecords.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const activeSection = recordSections.find(section => section.id === activeSectionId) ?? recordSections[0];
  const activeView = activeSection.views.find(view => view.id === activeViewId) ?? activeSection.views[0];
  const showRecordView = (view: SystemRecordView) => {
    setActiveViewId(view.id);
    setActiveTab(view.source);
    setSearch("");
    setPage(1);
  };
  const showRecordSection = (section: SystemRecordSection) => {
    setActiveSectionId(section.id);
    setSectionMenuOpen(false);
    showRecordView(section.views[0]);
  };

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

    if (activeTab === "eventProposals") {
      return (
        <RecordCard
          key={item.id}
          icon="document-text-outline"
          title={firstText(item.title, "Community Event Proposal")}
          subtitle={firstText(item.barangay, item.location)}
          status={firstText(item.status, "pending")}
          rows={[
            { label: "Resident proposer", value: firstText(item.proposerName, item.proposedBy) },
            { label: "Category", value: firstText(item.category) },
            { label: "Scheduled date", value: firstText(item.date) },
            { label: "Admin review note", value: firstText(item.adminNote) },
            { label: "Proposal reference", value: item.id },
          ]}
        />
      );
    }

    if (activeTab === "eventParticipants") {
      return (
        <RecordCard
          key={item.id}
          icon="checkmark-circle-outline"
          title={firstText(item.fullName, "Volunteer Participation")}
          subtitle={firstText(item.eventId, "Community event")}
          status={firstText(item.status, "unknown")}
          rows={[
            { label: "Volunteer UID", value: firstText(item.uid) },
            { label: "Time in", value: readableDate(item.checkedInAt) },
            { label: "Time out", value: readableDate(item.checkedOutAt) },
            { label: "Attendance verified", value: item.attendanceVerified === true ? "Yes" : "No" },
            { label: "Record reference", value: item.id },
          ]}
        />
      );
    }

    if (activeTab === "credentialReviews") {
      return (
        <RecordCard
          key={item.id}
          icon="shield-checkmark-outline"
          title={firstText(item.office, "LGU Credential Review")}
          subtitle={firstText(item.position, item.accountEmail)}
          status={firstText(item.reviewStatus, "not reviewed")}
          rows={[
            { label: "LGU account", value: firstText(item.accountEmail) },
            { label: "Verification method", value: firstText(item.verificationMethod) },
            { label: "Identity confirmation", value: item.identityPresenceConfirmed === true ? "Confirmed in person" : "Not confirmed" },
            { label: "Reviewed by UID", value: firstText(item.verifiedBy) },
            { label: "Reviewed at", value: readableDate(item.verifiedAt) },
          ]}
        />
      );
    }

    if (
      (activeTab === "events" || activeTab === "communityEvents")
    ) {
      const status =
        firstText(
          item.publicationStatus,
          item.status,
          "active"
        );

      return (
        <RecordCard
          key={item.id}
          icon="calendar-outline"
          title={firstText(
            item.title,
            item.eventTitle,
            item.name,
            "Community Event"
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
          System Records (Read Only)
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

      {/* Prioritize operational visibility, then onboarding and service outcomes. */}
      <View style={styles.summaryRow}>
        <SummaryCard label="Emergency Reports" value={records.cases.length} icon="warning-outline" />
        <SummaryCard label="Assistance Requests" value={records.assistance.length} icon="medkit-outline" />
        <SummaryCard label="Users" value={records.users.length} icon="people-outline" />
        <SummaryCard label="Volunteer Applications" value={records.applications.length} icon="person-add-outline" />
        <SummaryCard label="Verified Help" value={records.contributions.length} icon="checkmark-done-outline" />
        <SummaryCard label="Certificates" value={records.certificates.length} icon="ribbon-outline" />
      </View>

      {/* One compact selector replaces the two stacked button bars. */}
      <View style={styles.browseHeader}>
        <View style={styles.browseHeaderCopy}>
          <Text style={styles.browseEyebrow}>BROWSE RECORDS</Text>
          <Text style={styles.browseDescription}>Select a service area to view its records</Text>
        </View>
        <View style={styles.sectionPickerWrap}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Choose record section"
            accessibilityState={{ expanded: sectionMenuOpen }}
            style={[styles.sectionPickerButton, sectionMenuOpen && styles.sectionPickerButtonOpen]}
            onPress={() => setSectionMenuOpen(!sectionMenuOpen)}
          >
            <Ionicons name={activeSection.icon} size={17} color="#087A62" />
            <Text numberOfLines={1} style={styles.sectionPickerLabel}>{activeSection.label}</Text>
            <Ionicons name={sectionMenuOpen ? "chevron-up" : "chevron-down"} size={17} color="#376757" />
          </TouchableOpacity>
          {sectionMenuOpen ? (
            <View style={styles.sectionPickerMenu} accessibilityLabel="Record service areas">
              {recordSections.map(section => {
                const selected = activeSectionId === section.id;
                return (
                  <TouchableOpacity
                    key={section.id}
                    accessibilityRole="button"
                    accessibilityLabel={section.label + " section"}
                    accessibilityState={{ selected }}
                    style={[styles.sectionPickerOption, selected && styles.sectionPickerOptionActive]}
                    onPress={() => showRecordSection(section)}
                  >
                    <Ionicons name={section.icon} size={17} color={selected ? "#087A62" : "#5F796D"} />
                    <Text style={[styles.sectionPickerOptionLabel, selected && styles.sectionPickerOptionLabelActive]}>
                      {section.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={17} color="#087A62" /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.recordTypeTabs} accessibilityLabel={activeSection.label + " record types"}>
        {activeSection.views.map(view => {
          const selected = activeViewId === view.id;
          return (
            <TouchableOpacity
              key={view.id}
              accessibilityRole="tab"
              accessibilityLabel={view.label + " records"}
              accessibilityState={{ selected }}
              style={[styles.recordTypeTab, selected && styles.recordTypeTabActive]}
              onPress={() => showRecordView(view)}
            >
              <Text numberOfLines={1} style={[styles.recordTypeTabLabel, selected && styles.recordTypeTabLabelActive]}>
                {view.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
          onChangeText={(value) => { setSearch(value); setPage(1); }}
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
                activeView.label
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

          <ListPagination page={activePage} total={visibleRecords.length} onChange={setPage} />
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
            pagedRecords.map(
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
          System Records is for
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
        "#F6F9F8",
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
      marginBottom: 17,
      backgroundColor:"#E5F5ED",
      padding:23,
      borderWidth:1,
      borderColor:"#D8EBE0",
      borderRadius:14,
    },

    eyebrow: {
      fontSize: 11,
      fontWeight: "900",
      color: "#176C52",
      letterSpacing: 1.3,
    },

    title: {
      marginTop: 4,
      fontSize: 30,
      fontWeight: "700",
      color: "#173D32",
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      lineHeight: 20,
    },

    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
      gap: 12,
      marginBottom: 22,
    },

    summaryCard: {
      flexGrow: 1,
      flexBasis: 160,
      minWidth: 150,
      minHeight: 122,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DDEAE3",
      borderRadius: 12,
      padding: 15,
      justifyContent: "center",
    },

    summaryIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: "#D9F7ED",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },

    summaryValue: {
      fontSize: 25,
      fontWeight: "900",
      color: "#173D32",
      fontVariant: ["tabular-nums"],
    },

    summaryLabel: {
      marginTop: 3,
      color: "#516E63",
      fontWeight: "700",
      fontSize: 12,
    },

    browseHeader: {
      position: "relative",
      zIndex: 20,
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 12,
    },
    browseHeaderCopy: { flexGrow: 1, gap: 3 },
    browseEyebrow: {
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      color: "#1A5B47",
    },
    browseDescription: { fontSize: 12, color: "#71877C" },
    sectionPickerWrap: {
      position: "relative",
      zIndex: 30,
      flexBasis: 260,
      flexGrow: 0,
      maxWidth: "100%",
    },
    sectionPickerButton: {
      minHeight: 44,
      width: "100%",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#C7DCD1",
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    sectionPickerButtonOpen: { borderColor: "#087A62" },
    sectionPickerLabel: {
      flex: 1,
      fontSize: 12,
      color: "#194F3E",
      fontWeight: "800",
    },
    sectionPickerMenu: {
      position: "absolute",
      top: 48,
      left: 0,
      right: 0,
      zIndex: 50,
      elevation: 8,
      borderRadius: 10,
      padding: 5,
      borderWidth: 1,
      borderColor: "#D2E4D8",
      backgroundColor: "#FFFFFF",
      shadowColor: "#143F31",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    sectionPickerOption: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 7,
      paddingHorizontal: 10,
      gap: 9,
    },
    sectionPickerOptionActive: { backgroundColor: "#E8F6EE" },
    sectionPickerOptionLabel: {
      flex: 1,
      color: "#365A4C",
      fontSize: 12,
      fontWeight: "700",
    },
    sectionPickerOptionLabelActive: { color: "#087A62", fontWeight: "900" },
    recordTypeTabs: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 20,
      borderBottomWidth: 1,
      borderBottomColor: "#D5E4DC",
      marginBottom: 18,
    },
    recordTypeTab: {
      minHeight: 41,
      justifyContent: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
      paddingHorizontal: 2,
    },
    recordTypeTabActive: { borderBottomColor: "#087A62" },
    recordTypeTabLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: "#72847B",
    },
    recordTypeTabLabelActive: { fontWeight: "900", color: "#087A62" },

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
      color: "#173D32",
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
      color: "#173D32",
    },

    recordCount: {
      color: "#64748B",
      fontSize: 12,
      fontWeight: "700",
    },

    recordCard: {
      backgroundColor:
        "#FFFFFF",
      borderBottomWidth: 1,
      borderColor: "#E2E8F0",
      borderRadius: 3,
      padding: 16,
      marginBottom: 8,
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
      color: "#173D32",
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
      borderRadius: 9,
      padding: 30,
      alignItems: "center",
    },

    emptyTitle: {
      marginTop: 10,
      color: "#173D32",
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