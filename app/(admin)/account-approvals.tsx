import { Ionicons } from "@expo/vector-icons";

import { useRouter } from "expo-router";
import ListPagination from "../../components/ui/ListPagination";
import PeopleWorkspaceHero from "../../components/admin/PeopleWorkspaceHero";

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

type Filter = "residents" | "pending" | "volunteers";

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

export default function AccountApprovals() {
  const router = useRouter();

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
  ] = useState<Filter>("pending");

  const [
    selected,
    setSelected,
  ] = useState<Account | null>(null);
  const [approvalCandidate, setApprovalCandidate] = useState<Account | null>(null);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
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
                  item.role !== "applicant"
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

  // Residents and Volunteers share one community account; LGU and programmer
  // accounts must NEVER appear in this operational community directory.
  const communityAccounts = useMemo(() => accounts.filter(account =>
    !["admin", "superadmin", "applicant", "lgu_personnel"].includes(
      String(account.role || "").toLowerCase()
    )
  ), [accounts]);
  const visibleAccounts = useMemo(() => {
    const byView = filter === "pending"
      ? communityAccounts.filter(item => isPendingVolunteerApplication(item))
      : filter === "volunteers"
        ? communityAccounts.filter(item => item.volunteerAccess === true)
        : communityAccounts;
    const term = search.trim().toLowerCase();
    if (!term) return byView;
    return byView.filter(item => [
      item.fullName, item.email, item.barangay, item.id,
    ].some(value => String(value || "").toLowerCase().includes(term)));
  }, [communityAccounts, filter, volunteerApplications, search]);

  const totalPages = Math.max(1, Math.ceil(visibleAccounts.length / PAGE_SIZE));
  const activePage = Math.max(1, Math.min(page, totalPages));
  const pagedAccounts = visibleAccounts.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const pendingVolunteerCount = communityAccounts.filter(item => isPendingVolunteerApplication(item)).length;
  const verifiedResidentCount = communityAccounts.filter(item => isVerifiedResidentAccount(item)).length;
  const activeVolunteerCount = communityAccounts.filter(item => item.volunteerAccess === true).length;

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
      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >
        <PeopleWorkspaceHero
          section="LGU · People & Verification"
          title="Residents & Volunteers"
          description="A single organized LGU workspace for community accounts, identity status, and volunteer access decisions."
          icon="people-outline"
          metrics={[
            { label: "Resident Accounts", value: communityAccounts.length, icon: "people-outline", help: "Community profiles" },
            { label: "Verified Residents", value: verifiedResidentCount, icon: "shield-checkmark-outline", help: "Identity verified" },
            { label: "Pending Volunteers", value: pendingVolunteerCount, icon: "time-outline", help: "Awaiting LGU review" },
            { label: "Active Volunteers", value: activeVolunteerCount, icon: "ribbon-outline", help: "Approved volunteer access" },
          ]}
        />
        <View style={styles.flowCard}>
          <Text style={styles.flowEyebrow}>ACCOUNT JOURNEY</Text>
          <View style={styles.flowSteps}>
            {[
              { number: "01", label: "Resident account" },
              { number: "02", label: "Identity verification" },
              { number: "03", label: "Volunteer application" },
              { number: "04", label: "LGU decision" },
            ].map((step, index) => (
              <React.Fragment key={step.number}>
                {index > 0 && <Ionicons name="chevron-forward" size={14} color="#85A998" />}
                <View style={styles.flowStep}>
                  <Text style={styles.flowNumber}>{step.number}</Text>
                  <Text style={styles.flowText}>{step.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.flowNote}>Residents keep their original account when Volunteer access is approved.</Text>
        </View>
        <View style={styles.workspacePanel}>
          <View style={styles.workspaceHeading}>
            <Text style={styles.workspaceEyebrow}>ACCOUNT MANAGEMENT</Text>
            <Text style={styles.workspaceTitle}>Community directory & approvals</Text>
            <Text style={styles.workspaceSubtitle}>Use the views below to find a Resident, verify volunteer eligibility, or manage an active community account.</Text>
          </View>

        <View style={styles.filterRow}>
          {(
            [
              "residents",
              "pending",
              "volunteers",
            ] as Filter[]
          ).map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.filterButton,

                filter === value &&
                  styles.filterButtonActive,
              ]}
              onPress={() => { setFilter(value); setSearch(""); setPage(1); setExpandedAccountId(null); }}
            >
              <Text
                style={[
                  styles.filterText,

                  filter === value &&
                    styles.filterTextActive,
                ]}
              >
                {value === "pending"
                  ? "Volunteer Applications"
                  : value === "volunteers"
                    ? "Active Volunteers"
                    : "Resident Accounts"}
              </Text>
            </TouchableOpacity>
          ))}
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
              No matching community accounts in this view
            </Text>
          </View>
        ) : (
          pagedAccounts.map(
            (account) => {
              const application =
                volunteerApplicationFor(account);

              const isExistingResidentApplication =
                isPendingVolunteerApplication(
                  account
                );

              const isSaving =
                savingUid === account.id;

              return (
                <View
                  key={account.id}
                  style={styles.card}
                >
                  <View
                    style={styles.cardHeader}
                  >
                    <View style={styles.accountAvatar}><Ionicons name={account.volunteerAccess ? "ribbon-outline" : "person-outline"} size={21} color="#08765D" /></View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={styles.name}
                      >
                        {account.fullName ||
                          "Unnamed resident"}
                      </Text>

                      <Text
                        style={styles.meta}
                      >
                        {account.email}
                      </Text>
                    </View>

                    <View
                      style={styles.roleBadge}
                    >
                      <Text
                        style={styles.roleText}
                      >
                        {account.volunteerAccess === true
                          ? "VOLUNTEER"
                          : isVerifiedResidentAccount(account)
                            ? "VERIFIED RESIDENT"
                            : "BASIC RESIDENT"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.accountQuickLine}>
                    <Ionicons name="location-outline" size={14} color="#6A8A7A" />
                    <Text style={styles.quickText}>{account.barangay || "Barangay not provided"}</Text>
                    <Text style={styles.quickDot}>·</Text>
                    <Text style={styles.quickText}>{isVerifiedResidentAccount(account) ? "Identity verified" : "Identity review not complete"}</Text>
                  </View>
                  <TouchableOpacity style={styles.detailsToggle} accessibilityRole="button"
                    accessibilityState={{ expanded: expandedAccountId === account.id }}
                    accessibilityLabel={`View account details for ${account.fullName || "resident"}`}
                    onPress={() => setExpandedAccountId(expandedAccountId === account.id ? null : account.id)}
                  >
                    <Ionicons name={expandedAccountId === account.id ? "chevron-up" : "chevron-down"} size={16} color="#0A775D" />
                    <Text style={styles.detailsToggleText}>{expandedAccountId === account.id ? "Hide details" : "View profile & application details"}</Text>
                  </TouchableOpacity>
                  {expandedAccountId === account.id && <View style={styles.detailsArea}>
                  {isExistingResidentApplication ? (
                    <>
                      <Text style={styles.meta}>
                        Application: Verified Resident → Volunteer
                      </Text>
                      {!isVerifiedResidentAccount(account) ? (
                        <Text style={styles.reason}>
                          Approval unavailable: this account must be an active Verified Resident. You may reject the pending request.
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  <Text style={styles.meta}>
                    Barangay:{" "}
                    {account.barangay || "-"}
                  </Text>

                  <Text style={styles.meta}>
                    Phone:{" "}
                    {account.phoneNumber ||
                      "-"}
                  </Text>

                  <Text style={styles.meta}>
                    Identity:{" "}
                    {account.identityVerified === true ||
                    account.identityStatus === "verified"
                      ? "VERIFIED RESIDENT"
                      : String(
                          account.identityStatus ||
                          "basic"
                        )
                          .replace("_", " ")
                          .toUpperCase()}
                  </Text>

                  <Text style={styles.meta}>
                    Volunteer Access:{" "}
                    {account.volunteerAccess === true
                      ? "ACTIVE"
                      : String(
                          account.volunteerStatus ||
                          "not_applied"
                        )
                          .replace("_", " ")
                          .toUpperCase()}
                  </Text>

                  {application ? (
                    <>
                      <Text
                        style={styles.meta}
                      >
                        Skills:{" "}
                        {(application?.skills ||
                          account.skills ||
                          []).join(", ") || "-"}
                      </Text>

                      <Text
                        style={styles.meta}
                      >
                        Availability:{" "}
                        {(application?.availability ||
                          account.availability ||
                          []).join(", ") || "-"}
                      </Text>

                      {application?.preferredActivity ? (
                        <Text style={styles.meta}>
                          Preferred Activity:{" "}
                          {application.preferredActivity}
                        </Text>
                      ) : null}

                      {application?.experienceTraining ? (
                        <Text style={styles.meta}>
                          Experience / Training:{" "}
                          {application.experienceTraining}
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  <Text style={styles.statusText}>
                    Account Status: {account.status === "approved"
                      ? "ACTIVE"
                      : String(account.status || "unknown")
                          .replace(/_/g, " ")
                          .toUpperCase()}
                  </Text>

                  {application?.rejectedReason ? (
                    <Text
                      style={styles.reason}
                    >
                      Reason:{" "}
                      {application.rejectedReason}
                    </Text>
                  ) : null}

                  </View>}
                  {isExistingResidentApplication ? (
                    <View
                      style={styles.actionRow}
                    >
                      <TouchableOpacity
                        disabled={isSaving || !isVerifiedResidentAccount(account)}
                        style={[
                          styles.actionButton,
                          styles.approveButton,
                          (isSaving || !isVerifiedResidentAccount(account)) && { opacity: 0.55 },
                        ]}
                        onPress={() => {
                          setApprovalCandidate(account);
                          setApproveConfirmed(false);
                        }}
                      >
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          {isSaving ? "Saving..." : "Approve Volunteer"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        disabled={isSaving}
                        style={[
                          styles.actionButton,
                          styles.rejectButton,
                        ]}
                        onPress={() =>
                          setSelected(account)
                        }
                      >
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          Reject Volunteer
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {account.status ===
                    "approved" &&
                  !isExistingResidentApplication ? (
                    <TouchableOpacity
                      disabled={isSaving}
                      style={[
                        styles.actionButton,
                        styles.suspendButton,
                      ]}
                      onPress={() =>
                        moderateCommunityAccount(
                          account,
                          "suspended"
                        )
                      }
                    >
                      <Text
                        style={
                          styles.actionText
                        }
                      >
                        {isSaving
                          ? "Saving..."
                          : "Suspend Account"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {account.status === "suspended" ? (
                    <TouchableOpacity
                      disabled={isSaving}
                      style={[
                        styles.actionButton,
                        styles.approveButton,
                      ]}
                      onPress={() =>
                        moderateCommunityAccount(account, "approved")
                      }
                    >
                      <Text
                        style={
                          styles.actionText
                        }
                      >
                        {isSaving
                          ? "Saving..."
                          : "Activate Account"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }
          )
        )}
        </View>
      </ScrollView>

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

const styles =
  StyleSheet.create({
    workspacePanel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DEEAE2", borderRadius: 17, padding: 18 },
    workspaceHeading: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#E7EFE9", paddingBottom: 15 },
    workspaceEyebrow: { fontSize: 10, color: "#178266", letterSpacing: 1.2, fontWeight: "900" },
    workspaceTitle: { fontSize: 20, color: "#153F31", fontWeight: "900", marginTop: 4 },
    workspaceSubtitle: { fontSize: 12, color: "#72887B", marginTop: 5, lineHeight: 18 },
    flowCard: { padding: 17, borderRadius: 15, borderWidth: 1, borderColor: "#DDECE2", backgroundColor: "#F6FBF8", marginBottom: 18 },
    flowEyebrow: { color: "#177A5E", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 10 },
    flowSteps: { flexDirection: "row", flexWrap: "wrap", gap: 9, alignItems: "center" },
    flowStep: { flexDirection: "row", gap: 7, paddingVertical: 8, paddingHorizontal: 10,
      backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDEBE2", borderRadius: 9, alignItems: "center" },
    flowNumber: { color: "#0B7C5F", fontSize: 10, fontWeight: "900" },
    flowText: { color: "#345749", fontSize: 11, fontWeight: "800" },
    flowNote: { color: "#788F82", fontSize: 10.5, marginTop: 10 },
    accountAvatar: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12,
      backgroundColor: "#E1F6EB", borderWidth: 1, borderColor: "#CEEDDD", marginRight: 11 },
    accountQuickLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 },
    quickText: { color: "#698275", fontSize: 11 },
    quickDot: { color: "#A6B9AE", fontWeight: "800" },
    detailsToggle: { flexDirection: "row", gap: 7, alignItems: "center", paddingVertical: 9, marginTop: 6,
      alignSelf: "flex-start" },
    detailsToggleText: { fontSize: 11.5, fontWeight: "800", color: "#0A775D" },
    detailsArea: { backgroundColor: "#F7FBF8", borderColor: "#E1ECE4", borderWidth: 1,
      borderRadius: 10, padding: 13, marginTop: 2 },
    container: {
      padding: 23,
      paddingBottom: 50,
      maxWidth: 1460,
      width: "100%",
      alignSelf: "center",
      backgroundColor: "#F6F8F7",
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
      flexWrap: "wrap",
      marginBottom: 16,
    },

    filterButton: {
      flex: 1,
      minWidth: 150,
      padding: 13,
      borderRadius: 11,
      backgroundColor: "#F9FCFA",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#DAE8DD",
    },

    filterButtonActive: {
      backgroundColor: "#086D55",
      borderColor: "#086D55",
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
      borderRadius: 13,
      padding: 17,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: "#E3EDE6",
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
      backgroundColor: "#E0F4E9",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    roleText: {
      color: "#08755A",
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
      flexWrap: "wrap",
      marginTop: 8,
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