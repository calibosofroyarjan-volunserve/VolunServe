import { AppAlert } from "../../lib/appDialog";
import { Ionicons } from "@expo/vector-icons";


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
  auth,
  db,
} from "../../lib/firebase";

import {
  UserProfile,
} from "../../lib/firebaseAuth";
import { AdminPageHeading, AdminMetricCard, AdminEmptyState, AdminSectionHeading, ADMIN_UI } from "../../components/admin/AdminWorkspaceUI";

type Account =
  UserProfile & {
    id: string;
  };

type Filter = "pending" | "all" | "basic" | "verified" | "suspended";
type WorkspaceMode = "combined" | "residents" | "volunteers";

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

export default function AccountApprovals({mode = "combined"}: {mode?: WorkspaceMode}) {

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
  ] = useState<Filter>(mode === "residents" ? "all" : "pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const [
    selected,
    setSelected,
  ] = useState<Account | null>(null);

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

          AppAlert.alert(
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
    const scope = mode === "volunteers"
      ? accounts.filter(item => !!volunteerApplications[item.id] || item.volunteerAccess === true)
      : accounts;
    if (filter === "pending") return scope.filter(isPendingVolunteerApplication);
    if (filter === "verified") return scope.filter(isVerifiedResidentAccount);
    if (filter === "basic") return scope.filter(item => !isVerifiedResidentAccount(item)
      && item.volunteerAccess !== true && item.status !== "suspended");
    if (filter === "suspended") return scope.filter(item => item.status === "suspended");
    return scope;
  }, [accounts, filter, mode, volunteerApplications]);

  const matchingAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? visibleAccounts.filter(a =>
      [a.fullName, a.email, a.barangay, a.phoneNumber]
        .some(v => String(v || "").toLowerCase().includes(q))) : visibleAccounts;
  }, [visibleAccounts, search]);
  const totalPages = Math.max(1, Math.ceil(matchingAccounts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedAccounts = matchingAccounts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const reviewVolunteerApplication = async (
    account: Account,
    decision: "approved" | "rejected",
    reason = ""
  ) => {
    const reviewer = auth.currentUser;

    if (!reviewer) {
      AppAlert.alert(
        "Session Error",
        "Please sign in again."
      );
      return false;
    }

    const application =
      volunteerApplicationFor(account);

    if (application?.status !== "pending") {
      AppAlert.alert(
        "Review Updated",
        "This volunteer application is no longer pending. Refresh the queue and review its latest status."
      );
      return false;
    }

    if (decision === "approved" && !isVerifiedResidentAccount(account)) {
      AppAlert.alert(
        "Verified Resident Required",
        "Volunteer access can only be approved for an active Verified Resident."
      );
      return false;
    }

    if (
      decision === "rejected" &&
      reason.trim().length < 5
    ) {
      AppAlert.alert(
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

      // Both the decision and its immutable audit event must commit together.
      batch.set(doc(collection(db, "adminLogs")), {
        actionType: `volunteer_application_${decision}`,
        targetType: "user",
        targetId: account.id,
        adminUid: reviewer.uid,
        adminName: reviewer.displayName || reviewer.email || "Administrator",
        description: `${account.fullName || account.email} volunteer application was marked as ${decision}.`,
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      AppAlert.alert(
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

      AppAlert.alert(
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
      AppAlert.alert(
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
      AppAlert.alert(
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

      batch.set(doc(collection(db, "adminLogs")), {
        actionType: nextStatus === "suspended" ? "account_suspended" : "account_reactivated",
        targetType: "user",
        targetId: account.id,
        adminUid: reviewer.uid,
        adminName: reviewer.displayName || reviewer.email || "Administrator",
        description: `${account.fullName || account.email} community account was ${nextStatus === "suspended" ? "suspended" : "reactivated"}.`,
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      AppAlert.alert(
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

      AppAlert.alert(
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
      AppAlert.alert("Reason required", "Please enter a clear rejection reason.");
      return;
    }
    if (!isPendingVolunteerApplication(selected)) {
      AppAlert.alert("Review Updated", "This volunteer application is no longer pending.");
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
        <AdminPageHeading
          eyebrow={mode === "volunteers" ? "LGU ADMIN  /  VOLUNTEERS"
            : mode === "residents" ? "LGU ADMIN  /  RESIDENTS"
            : "LGU ADMIN  /  PEOPLE & VERIFICATION"}
          title={mode === "volunteers" ? "Volunteer Management"
            : mode === "residents" ? "Residents Management"
            : "User & Volunteer Approvals"}
          subtitle={mode === "volunteers"
            ? "Review volunteer applications, skills and availability, then manage active volunteer access. Resident identity checks remain in Residents."
            : mode === "residents"
            ? "View registered community accounts, verified and basic residents, and manage account access. Identity evidence has a separate review queue."
            : "Manage community accounts and review volunteer applications. Identity verification has its own review module; LGU staff promotion belongs to Super Admin."} />
        <AdminSectionHeading
          title={mode === "volunteers" ? "Volunteer Review & Participation" : "Community Account Records"}
          caption={mode === "volunteers"
            ? "Only volunteer applicants and active volunteers appear here."
            : "Every registered resident stays in the directory, even after becoming a volunteer."} />
        <View style={styles.metricGrid}>
          {mode !== "volunteers" ? <>
            <AdminMetricCard label="Resident Accounts" value={accounts.length}
              hint="Community profiles" icon="people-outline" />
            <AdminMetricCard label="Verified Residents" value={accounts.filter(isVerifiedResidentAccount).length}
              hint="Confirmed identity" icon="shield-checkmark-outline" />
            <AdminMetricCard label="Basic Residents" value={accounts.filter(a =>
              !isVerifiedResidentAccount(a) && a.volunteerAccess !== true && a.status !== "suspended").length}
              hint="Limited community access" icon="person-outline" />
            <AdminMetricCard label="Suspended Accounts" value={accounts.filter(a => a.status === "suspended").length}
              hint="Access temporarily restricted" icon="ban-outline" />
          </> : <>
            <AdminMetricCard label="Pending Applications" value={accounts.filter(isPendingVolunteerApplication).length}
              hint="LGU review queue" icon="hourglass-outline" />
            <AdminMetricCard label="Active Volunteers" value={accounts.filter(a => a.volunteerAccess === true).length}
              hint="Granted volunteer permissions" icon="heart-outline" />
            <AdminMetricCard label="Rejected Applications" value={accounts.filter(a =>
              volunteerApplicationFor(a)?.status === "rejected").length}
              hint="Recorded decisions" icon="close-circle-outline" />
          </>}
        </View>
        <View style={styles.filterRow}>
          {(mode === "residents"
            ? (["all", "verified", "basic", "suspended"] as Filter[])
            : (["pending", "all"] as Filter[])
          ).map(value => (
            <TouchableOpacity key={value} accessibilityRole="button"
              accessibilityLabel={value === "pending" ? "Pending volunteer applications"
                : value === "all" ? (mode === "volunteers" ? "All volunteers" : "All residents")
                : value + " residents"}
              accessibilityState={{selected: filter === value}}
              style={[styles.filterButton, filter === value && styles.filterButtonActive]}
              onPress={() => {setFilter(value); setPage(1);}}>
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
                {value === "pending" ? "Pending Applications"
                  : value === "all" ? (mode === "volunteers" ? "All Volunteers" : "All Residents")
                  : value === "verified" ? "Verified"
                  : value === "basic" ? "Basic"
                  : "Suspended"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput accessibilityLabel="Search community accounts"
          value={search} onChangeText={v => {setSearch(v); setPage(1);}}
          placeholder="Search name, email, barangay or contact"
          placeholderTextColor="#789082" style={styles.searchInput} />
        <Text style={styles.resultText}>{matchingAccounts.length} {mode === "volunteers" ? "volunteer records" : "resident accounts"} · 5 per page</Text>
        {matchingAccounts.length === 0 ? (
          <AdminEmptyState icon="people-outline"
            title={filter === "pending" ? "No pending volunteer reviews" : mode === "volunteers" ? "No volunteer records found" : "No matching residents"}
            description={search ? "Try a different search or clear the search." : "There are no records in this view."}
            actionLabel={search ? "Clear search" : undefined}
            onAction={search ? () => {setSearch(""); setPage(1);} : undefined} />
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
                        onPress={() =>
                          reviewVolunteerApplication(account, "approved")
                        }
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
        {matchingAccounts.length > PAGE_SIZE && (
          <View style={styles.pagination}>
            <TouchableOpacity accessibilityRole="button" disabled={currentPage <= 1}
              accessibilityLabel="Previous page" style={[styles.pageButton, currentPage <= 1 && styles.pageDisabled]}
              onPress={() => setPage(v => Math.max(1, v - 1))}>
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            <Text style={styles.pageStatus}>Page {currentPage} of {totalPages}</Text>
            <TouchableOpacity accessibilityRole="button" disabled={currentPage >= totalPages}
              accessibilityLabel="Next page" style={[styles.pageButton, currentPage >= totalPages && styles.pageDisabled]}
              onPress={() => setPage(v => Math.min(totalPages, v + 1))}>
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

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
    container: {
      padding: 24,
      paddingBottom: 50,
      backgroundColor: "#F6F8F7",
    },

    metricGrid: {flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 17},
    searchInput: {minHeight: 48, backgroundColor: "#FFFFFF", borderWidth: 1,
      borderColor: ADMIN_UI.stroke, borderRadius: 12, paddingHorizontal: 14,
      fontSize: 13, color: ADMIN_UI.ink, marginBottom: 9},
    resultText: {fontSize: 12, color: ADMIN_UI.muted, marginBottom: 16},
    pagination: {flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 16, marginTop: 24, marginBottom: 10},
    pageButton: {minHeight: 40, borderRadius: 10, borderWidth: 1,
      borderColor: ADMIN_UI.stroke, backgroundColor: "#FFFFFF",
      paddingHorizontal: 15, justifyContent: "center"},
    pageDisabled: {opacity: 0.4},
    pageButtonText: {color: ADMIN_UI.emerald, fontWeight: "800", fontSize: 12},
    pageStatus: {fontSize: 12, color: ADMIN_UI.muted, fontWeight: "700"},
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

    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 16,
    },

    filterButton: {
      flexGrow: 1,
      flexBasis: 130,
      padding: 11,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#CBD5E1",
    },

    filterButtonActive: {
      backgroundColor: "#0F766E",
      borderColor: "#0F766E",
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
      borderRadius: 9,
      padding: 16,
      marginBottom: 14,
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