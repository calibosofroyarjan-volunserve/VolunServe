import React, { useMemo, useState } from "react";
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
    collection,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";

import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type DisputeStatus = "open" | "resolved" | "dismissed";

type ResponseDispute = {
  id: string;

  assignmentId: string;
  caseId: string;
  volunteerId: string;
  residentId: string;

  residentNote?: string;

  contributionType?: string;
  contributionSummary?: string;

  status: DisputeStatus;

  adminNote?: string;
  resolvedBy?: string;

  createdAt?: any;
  updatedAt?: any;
  resolvedAt?: any;
};

type FilterType = "open" | "resolved" | "dismissed" | "all";

function formatDate(value: any) {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    return date.toLocaleString();
  } catch {
    return "—";
  }
}

function formatContributionType(value?: string) {
  if (!value) return "Not specified";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminDisputesScreen() {
  const { loading: sessionLoading, user } = useUserSession();

  const [disputes, setDisputes] = React.useState<ResponseDispute[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [filter, setFilter] = useState<FilterType>("open");

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  React.useEffect(() => {
    const disputeRef = collection(db, "responseDisputes");

    const unsubscribe = onSnapshot(
      disputeRef,
      (snapshot) => {
        const rows: ResponseDispute[] = snapshot.docs.map((snap) => {
          const data = snap.data();

          return {
            id: snap.id,

            assignmentId: data.assignmentId || snap.id,
            caseId: data.caseId || "",
            volunteerId: data.volunteerId || "",
            residentId: data.residentId || "",

            residentNote: data.residentNote || "",

            contributionType: data.contributionType || "",
            contributionSummary: data.contributionSummary || "",

            status: data.status || "open",

            adminNote: data.adminNote || "",
            resolvedBy: data.resolvedBy || "",

            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            resolvedAt: data.resolvedAt,
          };
        });

        rows.sort((a, b) => {
          const aTime =
            typeof a.createdAt?.toMillis === "function"
              ? a.createdAt.toMillis()
              : 0;

          const bTime =
            typeof b.createdAt?.toMillis === "function"
              ? b.createdAt.toMillis()
              : 0;

          return bTime - aTime;
        });

        setDisputes(rows);

        setNotes((current) => {
          const next = { ...current };

          rows.forEach((item) => {
            if (
              next[item.id] === undefined &&
              typeof item.adminNote === "string"
            ) {
              next[item.id] = item.adminNote;
            }
          });

          return next;
        });

        setLoading(false);
      },
      (error) => {
        console.error("responseDisputes listener error:", error);

        setErrorMessage(
          "Unable to load response disputes. Please check Firestore access."
        );

        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const counts = useMemo(() => {
    return {
      all: disputes.length,
      open: disputes.filter((item) => item.status === "open").length,
      resolved: disputes.filter((item) => item.status === "resolved").length,
      dismissed: disputes.filter((item) => item.status === "dismissed").length,
    };
  }, [disputes]);

  const filteredDisputes = useMemo(() => {
    if (filter === "all") {
      return disputes;
    }

    return disputes.filter((item) => item.status === filter);
  }, [disputes, filter]);

  const handleDecision = async (
    dispute: ResponseDispute,
    newStatus: "resolved" | "dismissed"
  ) => {
    if (!user) {
      setErrorMessage("Admin session is unavailable.");
      return;
    }

    const adminNote = (notes[dispute.id] || "").trim();

    if (adminNote.length < 10) {
      setErrorMessage(
        "Please enter an Admin Review Note with at least 10 characters."
      );

      setSuccessMessage("");
      return;
    }

    try {
      setProcessingId(dispute.id);
      setErrorMessage("");
      setSuccessMessage("");

      const disputeRef = doc(db, "responseDisputes", dispute.id);

      await updateDoc(disputeRef, {
        status: newStatus,
        adminNote,
        resolvedAt: serverTimestamp(),
        resolvedBy: user.uid,
        updatedAt: serverTimestamp(),
      });

      if (newStatus === "resolved") {
        setSuccessMessage(
          "Dispute resolved successfully. No volunteer contribution credit was automatically granted."
        );
      } else {
        setSuccessMessage(
          "Dispute dismissed successfully. No volunteer contribution credit was automatically granted."
        );
      }
    } catch (error: any) {
      console.error("Dispute resolution error:", error);

      setErrorMessage(
        error?.message ||
          "Unable to update the dispute. Please check Firestore permissions."
      );
    } finally {
      setProcessingId(null);
    }
  };

  if (sessionLoading || loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#087F78" />
        <Text style={styles.loadingText}>
          Loading response disputes...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          VOLUNSERVE ADMIN REVIEW
        </Text>

        <Text style={styles.title}>
          Response Disputes
        </Text>

        <Text style={styles.subtitle}>
          Review resident reports where a completed volunteer response was
          marked as Not Helped.
        </Text>
      </View>

      <View style={styles.noticeCard}>
        <View style={styles.noticeIcon}>
          <Text style={styles.noticeIconText}>!</Text>
        </View>

        <View style={styles.noticeTextArea}>
          <Text style={styles.noticeTitle}>
            Review before making a decision
          </Text>

          <Text style={styles.noticeText}>
            A Not Helped confirmation does not automatically give the
            volunteer contribution credit and does not automatically penalize
            the volunteer. The Admin reviews the dispute first.
          </Text>
        </View>
      </View>

      {successMessage ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            {successMessage}
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <View style={styles.metricsGrid}>
        <MetricCard
          value={counts.open}
          label="Open Review"
        />

        <MetricCard
          value={counts.resolved}
          label="Resolved"
        />

        <MetricCard
          value={counts.dismissed}
          label="Dismissed"
        />

        <MetricCard
          value={counts.all}
          label="Total Disputes"
        />
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.sectionTitle}>
          Dispute Records
        </Text>

        <View style={styles.filterRow}>
          <FilterButton
            label={`Open (${counts.open})`}
            active={filter === "open"}
            onPress={() => setFilter("open")}
          />

          <FilterButton
            label={`Resolved (${counts.resolved})`}
            active={filter === "resolved"}
            onPress={() => setFilter("resolved")}
          />

          <FilterButton
            label={`Dismissed (${counts.dismissed})`}
            active={filter === "dismissed"}
            onPress={() => setFilter("dismissed")}
          />

          <FilterButton
            label={`All (${counts.all})`}
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
        </View>
      </View>

      {filteredDisputes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No disputes found
          </Text>

          <Text style={styles.emptyText}>
            There are currently no records under this filter.
          </Text>
        </View>
      ) : (
        filteredDisputes.map((dispute) => {
          const isOpen = dispute.status === "open";
          const isProcessing = processingId === dispute.id;

          return (
            <View
              key={dispute.id}
              style={styles.disputeCard}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.cardTopText}>
                  <Text style={styles.cardEyebrow}>
                    RESPONSE DISPUTE
                  </Text>

                  <Text style={styles.cardTitle}>
                    {formatContributionType(
                      dispute.contributionType
                    )}
                  </Text>
                </View>

                <StatusBadge status={dispute.status} />
              </View>

              <View style={styles.divider} />

              <View style={styles.infoGrid}>
                <InfoItem
                  label="Assignment ID"
                  value={dispute.assignmentId}
                />

                <InfoItem
                  label="Case ID"
                  value={dispute.caseId}
                />

                <InfoItem
                  label="Resident ID"
                  value={dispute.residentId}
                />

                <InfoItem
                  label="Volunteer ID"
                  value={dispute.volunteerId}
                />

                <InfoItem
                  label="Submitted"
                  value={formatDate(dispute.createdAt)}
                />

                {dispute.resolvedAt ? (
                  <InfoItem
                    label="Reviewed"
                    value={formatDate(dispute.resolvedAt)}
                  />
                ) : null}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>
                  VOLUNTEER CONTRIBUTION SUMMARY
                </Text>

                <Text style={styles.detailText}>
                  {dispute.contributionSummary ||
                    "No contribution summary was recorded."}
                </Text>
              </View>

              <View style={styles.residentSection}>
                <Text style={styles.residentLabel}>
                  RESIDENT'S NOT HELPED EXPLANATION
                </Text>

                <Text style={styles.residentText}>
                  {dispute.residentNote ||
                    "No resident explanation was recorded."}
                </Text>
              </View>

              {isOpen ? (
                <View style={styles.reviewSection}>
                  <Text style={styles.reviewTitle}>
                    Admin Review
                  </Text>

                  <Text style={styles.reviewDescription}>
                    Record why this dispute is being resolved or dismissed.
                    This decision will close the review record but will not
                    automatically create volunteer contribution credit.
                  </Text>

                  <Text style={styles.inputLabel}>
                    ADMIN REVIEW NOTE
                  </Text>

                  <TextInput
                    style={styles.textArea}
                    multiline
                    textAlignVertical="top"
                    value={notes[dispute.id] || ""}
                    onChangeText={(value) => {
                      setNotes((current) => ({
                        ...current,
                        [dispute.id]: value,
                      }));

                      if (errorMessage) {
                        setErrorMessage("");
                      }
                    }}
                    placeholder="Explain the Admin review and decision..."
                    placeholderTextColor="#94A3B8"
                    maxLength={1000}
                  />

                  <Text style={styles.characterCount}>
                    {(notes[dispute.id] || "").length}/1000
                  </Text>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[
                        styles.resolveButton,
                        isProcessing &&
                          styles.disabledButton,
                      ]}
                      disabled={isProcessing}
                      onPress={() =>
                        handleDecision(
                          dispute,
                          "resolved"
                        )
                      }
                    >
                      {isProcessing ? (
                        <ActivityIndicator
                          size="small"
                          color="#FFFFFF"
                        />
                      ) : (
                        <Text style={styles.resolveButtonText}>
                          Resolve Dispute
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dismissButton,
                        isProcessing &&
                          styles.disabledButton,
                      ]}
                      disabled={isProcessing}
                      onPress={() =>
                        handleDecision(
                          dispute,
                          "dismissed"
                        )
                      }
                    >
                      <Text style={styles.dismissButtonText}>
                        Dismiss Dispute
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.actionHelp}>
                    Resolve = Admin handled the complaint. Dismiss =
                    complaint does not require further action.
                  </Text>
                </View>
              ) : (
                <View style={styles.completedReview}>
                  <Text style={styles.completedReviewLabel}>
                    ADMIN REVIEW NOTE
                  </Text>

                  <Text style={styles.completedReviewText}>
                    {dispute.adminNote ||
                      "No Admin review note recorded."}
                  </Text>

                  {dispute.resolvedBy ? (
                    <Text style={styles.resolvedByText}>
                      Reviewed by Admin UID:{" "}
                      {dispute.resolvedBy}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function MetricCard({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>
        {value}
      </Text>

      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.filterButton,
        active && styles.filterButtonActive,
      ]}
    >
      <Text
        style={[
          styles.filterButtonText,
          active &&
            styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text
        style={styles.infoValue}
        selectable
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function StatusBadge({
  status,
}: {
  status: DisputeStatus;
}) {
  const config =
    status === "resolved"
      ? {
          background: "#DCFCE7",
          text: "#166534",
          label: "RESOLVED",
        }
      : status === "dismissed"
      ? {
          background: "#F1F5F9",
          text: "#475569",
          label: "DISMISSED",
        }
      : {
          background: "#FEF3C7",
          text: "#92400E",
          label: "OPEN REVIEW",
        };

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: config.background,
        },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          {
            color: config.text,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FA",
  },

  content: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 60,
  },

  loadingScreen: {
    flex: 1,
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FA",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },

  header: {
    marginBottom: 20,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#087F78",
    marginBottom: 6,
  },

  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#123047",
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    maxWidth: 760,
  },

  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#EAF8F6",
    borderWidth: 1,
    borderColor: "#C7EAE5",
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },

  noticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CFF3EE",
    marginRight: 12,
  },

  noticeIconText: {
    color: "#087F78",
    fontSize: 19,
    fontWeight: "900",
  },

  noticeTextArea: {
    flex: 1,
  },

  noticeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#086A65",
  },

  noticeText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#46666A",
  },

  successBox: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },

  successText: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 13,
  },

  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },

  errorText: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 13,
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  },

  metricCard: {
    flexGrow: 1,
    flexBasis: 190,
    minWidth: 160,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  metricValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#123047",
  },

  metricLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },

  filterCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#123047",
    marginBottom: 12,
  },

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  filterButtonActive: {
    backgroundColor: "#087F78",
    borderColor: "#087F78",
  },

  filterButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },

  filterButtonTextActive: {
    color: "#FFFFFF",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 32,
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#123047",
  },

  emptyText: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 13,
  },

  disputeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DCE5EC",
    padding: 20,
    marginBottom: 16,
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  cardTopText: {
    flex: 1,
  },

  cardEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#087F78",
  },

  cardTitle: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "900",
    color: "#123047",
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  statusBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  divider: {
    height: 1,
    backgroundColor: "#E8EDF2",
    marginVertical: 16,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  infoItem: {
    flexGrow: 1,
    flexBasis: 250,
    minWidth: 220,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 12,
  },

  infoLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#94A3B8",
  },

  infoValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },

  detailSection: {
    marginTop: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
  },

  detailLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748B",
  },

  detailText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: "#334155",
  },

  residentSection: {
    marginTop: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 12,
    padding: 14,
  },

  residentLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#9A3412",
  },

  residentText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: "#7C2D12",
    fontWeight: "600",
  },

  reviewSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 18,
  },

  reviewTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#123047",
  },

  reviewDescription: {
    marginTop: 5,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },

  inputLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748B",
    marginBottom: 7,
  },

  textArea: {
    width: "100%",
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: "#1E293B",
  },

  characterCount: {
    alignSelf: "flex-end",
    marginTop: 5,
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },

  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },

  resolveButton: {
    flexGrow: 1,
    minWidth: 190,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: "#087F78",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  resolveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  dismissButton: {
    flexGrow: 1,
    minWidth: 190,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  dismissButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900",
  },

  disabledButton: {
    opacity: 0.55,
  },

  actionHelp: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 17,
    color: "#94A3B8",
  },

  completedReview: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 14,
  },

  completedReviewLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#64748B",
  },

  completedReviewText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: "#334155",
  },

  resolvedByText: {
    marginTop: 10,
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
  },
});