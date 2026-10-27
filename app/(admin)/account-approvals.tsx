import { Ionicons } from "@expo/vector-icons";

import { useRouter } from "expo-router";

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

  const visibleAccounts =
    useMemo(() => {
      if (filter === "pending") {
        return accounts.filter(
          (item) =>
            isPendingVolunteerApplication(item)
        );
      }

      return accounts;
    }, [
      accounts,
      filter,
      volunteerApplications,
    ]);

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
        <View style={styles.titleRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={23}
              color="#0F172A"
            />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              User & Volunteer Approvals
            </Text>

            <Text style={styles.subtitle}>
              All signups are Basic Residents automatically. Review volunteer requests and manage existing Resident accounts here.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {
                accounts.filter(
                  (item) => isPendingVolunteerApplication(item)
                ).length
              }
            </Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(
            [
              "pending",
              "all",
            ] as Filter[]
          ).map((value) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.filterButton,

                filter === value &&
                  styles.filterButtonActive,
              ]}
              onPress={() =>
                setFilter(value)
              }
            >
              <Text
                style={[
                  styles.filterText,

                  filter === value &&
                    styles.filterTextActive,
                ]}
              >
                {value === "pending"
                  ? "Pending Volunteers"
                  : "All Residents"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
          visibleAccounts.map(
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
      padding: 20,
      paddingBottom: 50,
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