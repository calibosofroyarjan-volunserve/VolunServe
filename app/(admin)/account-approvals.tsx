import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams } from "expo-router";

import ListPagination from "../../components/ui/ListPagination";
import AdminReviewHero from "../../components/admin/AdminReviewHero";

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import React, {
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  createAdminLog,
} from "../../lib/adminLogger";

import {
  auth,
  db,
} from "../../lib/firebase";

import {
  UserProfile,
} from "../../lib/firebaseAuth";

type Account =
  UserProfile & {
    id: string;
  };

type Filter =
  | "pending"
  | "all";

type VolunteerApplication = {
  uid?: string;
  status?: "pending" | "approved" | "rejected";
  skills?: string[];
  availability?: string[];
  experienceTraining?: string;
  preferredActivity?: string;
  emergencyContact?: string;
  motivation?: string;
  rejectedReason?: string;
  reviewedAt?: any;
  reviewedBy?: string;
};

const timestampValue = (
  value: any
) => {
  return value?.toMillis?.() || 0;
};

export function ResidentAccountsPanel() {
  const params = useLocalSearchParams<{ view?: string; resident?: string }>();

  const [
    accounts,
    setAccounts,
  ] = useState<Account[]>([]);

  const [
    volunteerApplications,
    setVolunteerApplications,
  ] = useState<Record<string, VolunteerApplication>>({});

  const [
    usersLoading,
    setUsersLoading,
  ] = useState(true);

  const [
    applicationsLoading,
    setApplicationsLoading,
  ] = useState(true);

  const [
    filter,
    setFilter,
  ] = useState<Filter>("all");

  const [
    selected,
    setSelected,
  ] = useState<Account | null>(null);
  const [approvalCandidate, setApprovalCandidate] = useState<Account | null>(null);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  React.useEffect(() => {
    if (params.view !== "residents") return;
    setFilter("all");
    setSearch(typeof params.resident === "string" ? params.resident : "");
    setPage(1);
  }, [params.view, params.resident]);
  const PAGE_SIZE = 5;

  const [
    rejectionReason,
    setRejectionReason,
  ] = useState("");

  const [
    savingUid,
    setSavingUid,
  ] = useState<string | null>(null);

  React.useEffect(() => {
    const unsubscribeUsers =
      onSnapshot(
        collection(db, "users"),

        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(
                  item.data() as UserProfile
                ),
              }))
              .filter(
                (item) =>
                  item.role !== "admin" &&
                  item.role !== "superadmin" &&
                  item.role !== "applicant" &&
                  item.role !== "lgu_personnel"
              )
              .sort(
                (a, b) =>
                  timestampValue(b.createdAt) -
                  timestampValue(a.createdAt)
              );

          setAccounts(rows);
          setUsersLoading(false);
        },

        (error) => {
          console.log(
            "account approvals listener error",
            error
          );

          setUsersLoading(false);

          Alert.alert(
            "Error",
            "Unable to load account applications."
          );
        }
      );

    const unsubscribeApplications =
      onSnapshot(
        collection(
          db,
          "volunteerApplications"
        ),

        (snapshot) => {
          const next:
            Record<string, VolunteerApplication> = {};

          snapshot.docs.forEach(
            (item) => {
              const data =
                item.data() as VolunteerApplication;

              next[item.id] = data;

              const uid =
                data.uid;

              if (
                typeof uid === "string" &&
                uid
              ) {
                next[uid] = data;
              }
            }
          );

          setVolunteerApplications(next);
          setApplicationsLoading(false);
        },

        (error) => {
          console.log(
            "volunteer applications listener error",
            error
          );

          setApplicationsLoading(false);
        }
      );

    return () => {
      unsubscribeUsers();
      unsubscribeApplications();
    };
  }, []);

  const volunteerApplicationFor = (
    account: Account
  ) => {
    return volunteerApplications[account.id] || null;
  };

  const isVerifiedResidentAccount = (
    account: Account
  ) => {
    return (
      account.status === "approved" &&
      account.role !== "admin" &&
      account.role !== "superadmin" &&
      account.role !== "applicant" &&
      account.residentAccess === true &&
      (
        account.identityVerified === true ||
        account.identityStatus === "verified"
      )
    );
  };

  const isPendingVolunteerApplication = (
    account: Account
  ) => {
    const application =
      volunteerApplicationFor(account);

    return (
      application?.status === "pending" &&
      account.role !== "applicant" &&
      account.volunteerAccess !== true
    );
  };

  const visibleAccounts = useMemo(() => {
    const byView = filter === "pending"
      ? accounts.filter(item => isPendingVolunteerApplication(item))
      : accounts;
    const term = search.trim().toLowerCase();
    if (!term) return byView;
    return byView.filter(item => [
      item.fullName, item.email, item.barangay, item.id,
    ].some(value => String(value || "").toLowerCase().includes(term)));
  }, [accounts, filter, volunteerApplications, search]);

  const totalPages = Math.max(1, Math.ceil(visibleAccounts.length / PAGE_SIZE));
  const activePage = Math.max(1, Math.min(page, totalPages));
  const pagedAccounts = visibleAccounts.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const pendingVolunteerCount = accounts.filter(item => isPendingVolunteerApplication(item)).length;
  const verifiedResidentCount = accounts.filter(item => isVerifiedResidentAccount(item)).length;

  const writeAdminLogSafely = async (
    payload: Parameters<typeof createAdminLog>[0]
  ) => {
    try {
      await createAdminLog(payload);
    } catch (error) {
      /*
       * The review itself is already committed at this point.
       * A logging failure must not mislead the Admin into repeating
       * a successful approval/rejection.
       */
      console.log(
        "admin review log error",
        error
      );
    }
  };

  const reviewVolunteerApplication = async (
    account: Account,
    decision: "approved" | "rejected",
    reason = ""
  ) => {
    const reviewer = auth.currentUser;

    if (!reviewer) {
      Alert.alert(
        "Session Error",
        "Please sign in again."
      );
      return false;
    }

    const application =
      volunteerApplicationFor(account);

    if (application?.status !== "pending") {
      Alert.alert(
        "Review Updated",
        "This volunteer application is no longer pending. Refresh the queue and review its latest status."
      );
      return false;
    }

    if (decision === "approved" && !isVerifiedResidentAccount(account)) {
      Alert.alert(
        "Verified Resident Required",
        "Volunteer access can only be approved for an active Verified Resident."
      );
      return false;
    }

    if (
      decision === "rejected" &&
      reason.trim().length < 5
    ) {
      Alert.alert(
        "Reason required",
        "Please enter a clear rejection reason."
      );
      return false;
    }

    try {
      setSavingUid(account.id);

      const batch = writeBatch(db);

      /*
       * Same Resident account:
       * approval adds Volunteer access; rejection does not affect
       * Resident access or the Resident account status.
       */
      batch.update(
        doc(db, "users", account.id),
        {
          volunteerAccess:
            decision === "approved",
          volunteerStatus:
            decision,
          activeMode: "resident",
          volunteerReviewedAt:
            serverTimestamp(),
          volunteerReviewedBy:
            reviewer.uid,
        }
      );

      /*
       * Update only fields permitted by the volunteerApplications
       * Admin-review rule. Do not overwrite the applicant's submitted
       * skills, availability, experience, or contact snapshot.
       */
      batch.update(
        doc(
          db,
          "volunteerApplications",
          account.id
        ),
        {
          status: decision,
          volunteerAccess:
            decision === "approved",
          activeMode: "resident",
          reviewedAt:
            serverTimestamp(),
          reviewedBy:
            reviewer.uid,
          rejectedReason:
            decision === "rejected"
              ? reason.trim()
              : "",
        }
      );

      await batch.commit();

      await writeAdminLogSafely({
        actionType:
          `volunteer_application_${decision}`,
        targetType: "user",
        targetId: account.id,
        adminUid: reviewer.uid,
        adminName:
          reviewer.displayName ||
          reviewer.email ||
          "Administrator",
        description:
          `${
            account.fullName ||
            account.email
          } volunteer application was marked as ${decision}.`,
      });

      Alert.alert(
        "Saved",
        decision === "approved"
          ? "Volunteer access approved. The Resident account remains active and the user may switch to Volunteer Mode."
          : "Volunteer application rejected. The Resident account remains active."
      );
      return true;
    } catch (error) {
      console.log(
        "volunteer application review error",
        error
      );

      Alert.alert(
        "Error",
        "The volunteer application review could not be saved. Check the latest Firestore rules and try again."
      );
      return false;
    } finally {
      setSavingUid(null);
    }
  };

  const moderateCommunityAccount = async (
    account: Account,
    nextStatus: "approved" | "suspended"
  ) => {
    const reviewer = auth.currentUser;

    if (!reviewer) {
      Alert.alert(
        "Session Error",
        "Please sign in again."
      );
      return;
    }

    if (
      account.role === "applicant" ||
      account.role === "admin" ||
      account.role === "superadmin"
    ) {
      Alert.alert(
        "Action unavailable",
        "This moderation action applies only to community Resident/Volunteer accounts."
      );
      return;
    }

    try {
      setSavingUid(account.id);

      const batch = writeBatch(db);

      batch.update(
        doc(db, "users", account.id),
        {
          status: nextStatus,
          reviewedAt:
            serverTimestamp(),
          reviewedBy:
            reviewer.uid,
          rejectedReason: "",
        }
      );

      await batch.commit();

      await writeAdminLogSafely({
        actionType:
          nextStatus === "suspended"
            ? "account_suspended"
            : "account_reactivated",
        targetType: "user",
        targetId: account.id,
        adminUid: reviewer.uid,
        adminName:
          reviewer.displayName ||
          reviewer.email ||
          "Administrator",
        description:
          `${
            account.fullName ||
            account.email
          } community account was ${nextStatus === "suspended" ? "suspended" : "reactivated"}.`,
      });

      Alert.alert(
        "Saved",
        nextStatus === "suspended"
          ? "Community account suspended."
          : "Community account reactivated."
      );
    } catch (error) {
      console.log(
        "community account moderation error",
        error
      );

      Alert.alert(
        "Error",
        "The account status could not be updated."
      );
    } finally {
      setSavingUid(null);
    }
  };

  const confirmReject = async () => {
    if (!selected || savingUid) return;
    if (rejectionReason.trim().length < 5) {
      Alert.alert("Reason required", "Please enter a clear rejection reason.");
      return;
    }
    if (!isPendingVolunteerApplication(selected)) {
      Alert.alert("Review Updated", "This volunteer application is no longer pending.");
      return;
    }
    const saved = await reviewVolunteerApplication(selected, "rejected", rejectionReason);
    if (saved) {
      setSelected(null);
      setRejectionReason("");
    }
  };

  if (
    usersLoading ||
    applicationsLoading
  ) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#0F766E"
        />

        <Text style={styles.muted}>
          Loading volunteer applications and resident accounts...
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.residentWorkspace}>
        <View style={styles.residentHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.residentEyebrow}>PEOPLE & VERIFICATION / COMMUNITY RECORDS</Text>
            <Text style={styles.residentHeading}>Resident Accounts</Text>
            <Text style={styles.recordsDescription}>Browse registered Residents, verification level and account status. Authorized LGU moderation remains available.</Text>
          </View>
          <View style={styles.residentTotal}><Text style={styles.residentTotalText}>{accounts.length} accounts</Text></View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={value => { setSearch(value); setPage(1); }}
            placeholder="Search name, email, barangay or account ID"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Search resident and volunteer accounts"
          />
        </View>
        <ListPagination page={activePage} total={visibleAccounts.length} pageSize={PAGE_SIZE} onChange={setPage} />
        {visibleAccounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="checkmark-circle-outline"
              size={38}
              color="#16A34A"
            />

            <Text style={styles.emptyTitle}>
              No volunteer applications or resident accounts in this view
            </Text>
          </View>
        ) : (
          pagedAccounts.map(account => {
            const saving = savingUid === account.id;
            const verified = isVerifiedResidentAccount(account);
            return (
              <View key={account.id} style={styles.residentItem}>
                <View style={styles.residentProfile}>
                  <View style={styles.residentAvatar}><Ionicons name="person-outline" color="#14745B" size={18}/></View>
                  <View style={styles.residentDetails}>
                    <Text style={styles.residentName}>{account.fullName || "Unnamed Resident"}</Text>
                    <Text style={styles.residentEmail}>{account.email || "No email provided"}</Text>
                    <Text style={styles.residentInfo}>
                      {account.barangay || "Barangay not listed"} · {account.phoneNumber || "No phone"}
                    </Text>
                    <Text style={styles.residentInfo}>
                      Identity: {verified ? "Verified" : String(account.identityStatus || "Basic").replace(/_/g, " ")}
                      {"  ·  "}Volunteer: {account.volunteerAccess === true ? "Active" : "Not active"}
                    </Text>
                  </View>
                </View>
                <View style={styles.residentActions}>
                  <View style={[styles.residentBadge, verified && styles.residentVerifiedBadge]}>
                    <Text style={[styles.residentBadgeText, verified && styles.residentVerifiedBadgeText]}>
                      {account.volunteerAccess === true ? "VOLUNTEER" : verified ? "VERIFIED RESIDENT" : "BASIC RESIDENT"}
                    </Text>
                  </View>
                  <Text style={styles.residentState}>Status: {account.status === "approved" ? "Active" : String(account.status || "Unknown")}</Text>
                  {account.status === "approved" && (
                    <TouchableOpacity accessibilityRole="button" disabled={saving}
                      style={[styles.residentModerateButton, saving && styles.buttonDisabled]}
                      onPress={() => moderateCommunityAccount(account, "suspended")}>
                      <Text style={styles.residentModerateText}>{saving ? "Saving…" : "Suspend"}</Text>
                    </TouchableOpacity>
                  )}
                  {account.status === "suspended" && (
                    <TouchableOpacity accessibilityRole="button" disabled={saving}
                      style={[styles.residentModerateButton, styles.residentReactivate, saving && styles.buttonDisabled]}
                      onPress={() => moderateCommunityAccount(account, "approved")}>
                      <Text style={[styles.residentModerateText, styles.residentReactivateText]}>{saving ? "Saving…" : "Reactivate"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      <Modal
        visible={!!approvalCandidate}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!savingUid) { setApprovalCandidate(null); setApproveConfirmed(false); } }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Review Volunteer Approval</Text>
            <Text style={styles.subtitle}>Confirm the applicant details before granting Volunteer access.</Text>
            <ScrollView style={styles.approvalEvidenceScroll} contentContainerStyle={styles.approvalEvidence} keyboardShouldPersistTaps="handled">
              <Text style={styles.evidenceTitle}>Applicant credentials</Text>
              <Text style={styles.meta}>Name: {approvalCandidate?.fullName || "Not provided"}</Text>
              <Text style={styles.meta}>Email: {approvalCandidate?.email || "Not provided"}</Text>
              <Text style={styles.meta}>Barangay: {approvalCandidate?.barangay || "Not provided"}</Text>
              <Text style={styles.meta}>Account status: {approvalCandidate?.status || "Unknown"}</Text>
              <Text style={styles.meta}>Identity: {approvalCandidate?.identityVerified === true || approvalCandidate?.identityStatus === "verified" ? "Verified Resident" : "Not verified"}</Text>
              <Text style={styles.meta}>Skills: {(approvalCandidate ? volunteerApplicationFor(approvalCandidate)?.skills || [] : []).join(", ") || "Not provided"}</Text>
              <Text style={styles.meta}>Availability: {(approvalCandidate ? volunteerApplicationFor(approvalCandidate)?.availability || [] : []).join(", ") || "Not provided"}</Text>
              <Text style={styles.meta}>Application status: {approvalCandidate ? volunteerApplicationFor(approvalCandidate)?.status || "Missing" : "Missing"}</Text>
            </ScrollView>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: approveConfirmed }}
              style={styles.confirmCheckRow}
              disabled={!!savingUid}
              onPress={() => setApproveConfirmed(value => !value)}
            >
              <Ionicons name={approveConfirmed ? "checkbox" : "square-outline"} color="#087A62" size={24} />
              <Text style={styles.confirmCheckText}>I reviewed this applicant's details and confirmed eligibility for Volunteer access.</Text>
            </TouchableOpacity>
            <View style={styles.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!approveConfirmed || !!savingUid || !approvalCandidate || !isVerifiedResidentAccount(approvalCandidate) || !isPendingVolunteerApplication(approvalCandidate)}
                style={[styles.actionButton, styles.approveButton, (!approveConfirmed || !!savingUid || !approvalCandidate || !isVerifiedResidentAccount(approvalCandidate) || !isPendingVolunteerApplication(approvalCandidate)) && styles.buttonDisabled]}
                onPress={async () => {
                  if (!approvalCandidate || !approveConfirmed || savingUid) return;
                  const saved = await reviewVolunteerApplication(approvalCandidate, "approved");
                  if (saved) { setApprovalCandidate(null); setApproveConfirmed(false); }
                }}
              >
                {savingUid ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.actionText}>Confirm Approval</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                disabled={!!savingUid}
                onPress={() => { setApprovalCandidate(null); setApproveConfirmed(false); }}
              >
                <Text style={styles.actionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelected(null);
          setRejectionReason("");
        }}
      >
        <View
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text
              style={styles.modalTitle}
            >
              Reject Volunteer Application
            </Text>

            <Text style={styles.subtitle}>
              {selected?.fullName}
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder={
                "State the verification issue or missing requirement"
              }
              multiline
              value={rejectionReason}
              onChangeText={
                setRejectionReason
              }
            />

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.rejectButton,
                ]}
                onPress={confirmReject}
              >
                <Text
                  style={styles.actionText}
                >
                  Confirm Reject
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.cancelButton,
                ]}
                onPress={() => {
                  setSelected(null);
                  setRejectionReason("");
                }}
              >
                <Text
                  style={styles.actionText}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// Compatibility path: the approved Resident/Volunteer review workspaces now live
// in the LGU Command Center; no duplicate standalone management page.
export default function AccountApprovalsRoute() {
  return <Redirect href="/(admin)/command-center?section=residents" />;
}

const styles =
  StyleSheet.create({
    residentWorkspace: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#D9E6DE", width: "100%" },
    residentHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
    residentEyebrow: { fontSize: 10, color: "#14715B", letterSpacing: 0.7, fontWeight: "700" },
    residentHeading: { fontSize: 19, fontWeight: "800", color: "#173F33", marginTop: 4 },
    residentTotal: { backgroundColor: "#EDF6F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    residentTotalText: { fontSize: 12, fontWeight: "800", color: "#166A51" },
    residentItem: { borderTopWidth: 1, borderTopColor: "#E6EEE8", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingVertical: 12 },
    residentProfile: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 240, gap: 10 },
    residentAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EAF5EE", alignItems: "center", justifyContent: "center" },
    residentDetails: { flex: 1, minWidth: 0 },
    residentName: { fontSize: 13, fontWeight: "800", color: "#1C4938" },
    residentEmail: { fontSize: 12, color: "#5F756A", marginTop: 2 },
    residentInfo: { fontSize: 11, color: "#6E8277", marginTop: 3, lineHeight: 16 },
    residentActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 8 },
    residentBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: "#EFF2FA" },
    residentBadgeText: { color: "#4A6495", fontSize: 10, fontWeight: "700" },
    residentVerifiedBadge: { backgroundColor: "#E5F5EB" },
    residentVerifiedBadgeText: { color: "#166C50" },
    residentState: { fontSize: 11, color: "#637C6D", fontWeight: "600" },
    residentModerateButton: { minHeight: 36, minWidth: 86, borderWidth: 1, borderColor: "#E5AD55", backgroundColor: "#FFF8EC", borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
    residentModerateText: { fontSize: 11, fontWeight: "800", color: "#996012" },
    residentReactivate: { borderColor: "#86C3A4", backgroundColor: "#EAF7F0" },
    residentReactivateText: { color: "#166B4A" },
    metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 18 },
    metricCard: { flexGrow: 1, flexBasis: 210, minWidth: 180, backgroundColor: "#FFFFFF", borderRadius: 15,
      borderWidth: 1, borderColor: "#DBE9E0", padding: 18 },
    metricIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#E2F5EB",
      alignItems: "center", justifyContent: "center", marginBottom: 12 },
    metricLabel: { color: "#32594B", fontSize: 12, fontWeight: "800" },
    metricValue: { color: "#124234", fontSize: 28, fontWeight: "900", marginTop: 5 },
    metricCaption: { color: "#698576", fontSize: 11, marginTop: 3 },
    recordsPanel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E7DE",
      borderRadius: 15, padding: 16, marginBottom: 14 },
    recordsHeading: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
    recordsHeadingCopy: { flex: 1 },
    recordsTitle: { color: "#153E32", fontSize: 18, fontWeight: "900" },
    recordsDescription: { color: "#6D8778", fontSize: 12, lineHeight: 19, marginTop: 5 },
    container: {
      padding: 20,
      paddingBottom: 50,
      backgroundColor: "#F4F8F5",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F8FAFC",
    },

    muted: {
      marginTop: 10,
      color: "#64748B",
    },

    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },

    backButton: {
      width: 42,
      height: 42,
      marginRight: 10,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    title: {
      fontSize: 24,
      fontWeight: "700",
      color: "#173D32",
    },

    subtitle: {
      color: "#64748B",
      marginTop: 4,
      lineHeight: 19,
    },

    countBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "#FEF3C7",
      alignItems: "center",
      justifyContent: "center",
    },

    countText: {
      color: "#92400E",
      fontWeight: "900",
      fontSize: 17,
    },

    reviewSummary: { backgroundColor: "#E9F7EF", borderWidth: 1, borderColor: "#CDE8D9", borderRadius: 11, padding: 12, marginBottom: 12 },
    reviewSummaryText: { color: "#245846", fontSize: 12, fontWeight: "700", lineHeight: 18 },
    searchWrap: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E5DE", borderRadius: 12, paddingHorizontal: 13, marginBottom: 10 },
    searchInput: { flex: 1, minHeight: 46, fontSize: 13, color: "#173D32" },
    approvalEvidenceScroll: { maxHeight: 260, marginTop: 12 },
    approvalEvidence: { backgroundColor: "#F6FBF8", borderColor: "#D9EAE0", borderWidth: 1, borderRadius: 11, padding: 13, marginVertical: 13, gap: 3 },
    evidenceTitle: { color: "#173D32", fontSize: 14, fontWeight: "900", marginBottom: 5 },
    confirmCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
    confirmCheckText: { flex: 1, color: "#365B4E", fontSize: 12, fontWeight: "700", lineHeight: 18 },
    buttonDisabled: { opacity: 0.48 },
    filterRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },

    filterButton: {
      flex: 1,
      padding: 11,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#CBD5E1",
    },

    filterButtonActive: {
      backgroundColor: "#08765A",
      borderColor: "#08765A",
    },

    filterText: {
      color: "#334155",
      fontWeight: "800",
    },

    filterTextActive: {
      color: "#FFFFFF",
    },

    emptyCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: 9,
      padding: 28,
      alignItems: "center",
    },

    emptyTitle: {
      marginTop: 8,
      fontWeight: "800",
      color: "#334155",
    },

    card: {
      backgroundColor: "#FFFFFF",
      borderRadius: 14,
      padding: 18,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 8,
    },

    name: {
      fontSize: 17,
      fontWeight: "900",
      color: "#173D32",
    },

    meta: {
      color: "#64748B",
      marginTop: 3,
    },

    roleBadge: {
      backgroundColor: "#DBEAFE",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    roleText: {
      color: "#1D4ED8",
      fontSize: 10,
      fontWeight: "900",
    },

    statusText: {
      marginTop: 10,
      color: "#0F766E",
      fontWeight: "900",
      fontSize: 12,
    },

    reason: {
      marginTop: 6,
      color: "#B91C1C",
      fontWeight: "700",
    },

    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },

    actionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      marginTop: 12,
    },

    approveButton: {
      backgroundColor: "#16A34A",
    },

    rejectButton: {
      backgroundColor: "#DC2626",
    },

    suspendButton: {
      backgroundColor: "#D97706",
    },

    cancelButton: {
      backgroundColor: "#64748B",
    },

    actionText: {
      color: "#FFFFFF",
      fontWeight: "900",
    },

    modalBackdrop: {
      flex: 1,
      justifyContent: "center",
      padding: 20,
      backgroundColor:
        "rgba(15,23,42,0.55)",
    },

    modalCard: {
      maxWidth: 520,
      width: "100%",
      maxHeight: "94%",
      alignSelf: "center",
      backgroundColor: "#FFFFFF",
      borderRadius: 10,
      padding: 18,
    },

    modalTitle: {
      fontSize: 20,
      fontWeight: "900",
      color: "#173D32",
    },

    reasonInput: {
      minHeight: 110,
      marginTop: 14,
      borderWidth: 1,
      borderColor: "#CBD5E1",
      borderRadius: 12,
      padding: 12,
      textAlignVertical: "top",
    },
  });