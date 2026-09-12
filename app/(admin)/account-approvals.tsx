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
    volunteerApplicantIds,
    setVolunteerApplicantIds,
  ] = useState<Set<string>>(
    new Set()
  );

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
                  item.role !== "superadmin"
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
          const ids =
            new Set<string>();

          snapshot.docs.forEach(
            (item) => {
              ids.add(item.id);

              const uid =
                item.data().uid;

              if (
                typeof uid === "string" &&
                uid
              ) {
                ids.add(uid);
              }
            }
          );

          setVolunteerApplicantIds(ids);
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

  const requestedRoleFor = (
    account: Account
  ) => {
    if (account.requestedRole) {
      return account.requestedRole;
    }

    if (
      account.role === "volunteer" ||
      volunteerApplicantIds.has(account.id)
    ) {
      return "volunteer";
    }

    return "resident";
  };

  const visibleAccounts =
    useMemo(() => {
      if (filter === "pending") {
        return accounts.filter(
          (item) =>
            item.status ===
            "pending_review"
        );
      }

      return accounts;
    }, [
      accounts,
      filter,
    ]);

  const saveReview = async (
    account: Account,
    status:
      | "approved"
      | "rejected"
      | "suspended",
    reason = ""
  ) => {
    const reviewer =
      auth.currentUser;

    if (!reviewer) {
      Alert.alert(
        "Session Error",
        "Please sign in again."
      );

      return;
    }

    const requestedRole =
      requestedRoleFor(account);

    const nextRole =
      status === "approved"
        ? requestedRole
        : account.role;

    const reviewPatch:
      Record<string, any> = {
        status,
        role: nextRole,

        reviewedAt:
          serverTimestamp(),

        reviewedBy:
          reviewer.uid,

        rejectedReason:
          status === "rejected"
            ? reason.trim()
            : "",
      };

    try {
      setSavingUid(account.id);

      const batch =
        writeBatch(db);

      batch.update(
        doc(
          db,
          "users",
          account.id
        ),
        reviewPatch
      );

      if (
        requestedRole ===
        "volunteer"
      ) {
        batch.set(
          doc(
            db,
            "volunteerApplications",
            account.id
          ),
          {
            uid: account.id,

            fullName:
              account.fullName,

            email:
              account.email,

            barangay:
              account.barangay || "",

            phone:
              account.phoneNumber || "",

            phoneNumber:
              account.phoneNumber || "",

            skills:
              account.skills || [],

            availability:
              account.availability || [],

            status:
              status === "approved"
                ? "approved"
                : status === "rejected"
                  ? "rejected"
                  : "suspended",

            reviewedAt:
              serverTimestamp(),

            reviewedBy:
              reviewer.uid,

            rejectedReason:
              status === "rejected"
                ? reason.trim()
                : "",
          },
          {
            merge: true,
          }
        );
      }

      await batch.commit();

      await createAdminLog({
        actionType:
          `account_${status}`,

        targetType:
          "user",

        targetId:
          account.id,

        adminUid:
          reviewer.uid,

        adminName:
          reviewer.displayName ||
          reviewer.email ||
          "Administrator",

        description:
          `${
            account.fullName ||
            account.email
          } was marked as ${status}.`,
      });

      Alert.alert(
        "Saved",
        `Account marked as ${status.replace(
          "_",
          " "
        )}.`
      );
    } catch (error) {
      console.log(
        "account review error",
        error
      );

      Alert.alert(
        "Error",
        "The account review could not be saved."
      );
    } finally {
      setSavingUid(null);
    }
  };

  const approve = (
    account: Account
  ) => {
    return saveReview(
      account,
      "approved"
    );
  };

  const confirmReject =
    async () => {
      if (!selected) {
        return;
      }

      if (
        rejectionReason
          .trim()
          .length < 5
      ) {
        Alert.alert(
          "Reason required",
          "Please enter a clear rejection reason."
        );

        return;
      }

      await saveReview(
        selected,
        "rejected",
        rejectionReason
      );

      setSelected(null);
      setRejectionReason("");
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
          Loading account applications...
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
              Registration Approvals
            </Text>

            <Text style={styles.subtitle}>
              Single review queue for
              resident and volunteer
              registrations.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {
                accounts.filter(
                  (item) =>
                    item.status ===
                    "pending_review"
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
                  ? "Pending Review"
                  : "All Accounts"}
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
              No accounts in this view
            </Text>
          </View>
        ) : (
          visibleAccounts.map(
            (account) => {
              const requestedRole =
                requestedRoleFor(account);

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
                          "Unnamed applicant"}
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
                        {requestedRole.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.meta}>
                    Barangay:{" "}
                    {account.barangay || "-"}
                  </Text>

                  <Text style={styles.meta}>
                    Phone:{" "}
                    {account.phoneNumber ||
                      "-"}
                  </Text>

                  {requestedRole ===
                  "volunteer" ? (
                    <>
                      <Text
                        style={styles.meta}
                      >
                        Skills:{" "}
                        {account.skills?.join(
                          ", "
                        ) || "-"}
                      </Text>

                      <Text
                        style={styles.meta}
                      >
                        Availability:{" "}
                        {account.availability?.join(
                          ", "
                        ) || "-"}
                      </Text>
                    </>
                  ) : null}

                  <Text
                    style={styles.statusText}
                  >
                    Status:{" "}
                    {(
                      account.status ||
                      "legacy"
                    )
                      .replace("_", " ")
                      .toUpperCase()}
                  </Text>

                  {account.rejectedReason ? (
                    <Text
                      style={styles.reason}
                    >
                      Reason:{" "}
                      {
                        account.rejectedReason
                      }
                    </Text>
                  ) : null}

                  {account.status ===
                  "pending_review" ? (
                    <View
                      style={styles.actionRow}
                    >
                      <TouchableOpacity
                        disabled={isSaving}
                        style={[
                          styles.actionButton,
                          styles.approveButton,
                        ]}
                        onPress={() =>
                          approve(account)
                        }
                      >
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          {isSaving
                            ? "Saving..."
                            : "Approve"}
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
                          Reject
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {account.status ===
                  "approved" ? (
                    <TouchableOpacity
                      disabled={isSaving}
                      style={[
                        styles.actionButton,
                        styles.suspendButton,
                      ]}
                      onPress={() =>
                        saveReview(
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

                  {account.status ===
                    "suspended" ||
                  account.status ===
                    "rejected" ? (
                    <TouchableOpacity
                      disabled={isSaving}
                      style={[
                        styles.actionButton,
                        styles.approveButton,
                      ]}
                      onPress={() =>
                        approve(account)
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
              Reject Registration
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
      backgroundColor: "#F1F5F9",
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
      fontWeight: "900",
      color: "#0F172A",
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
      borderRadius: 16,
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
      borderRadius: 16,
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
      color: "#0F172A",
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
      borderRadius: 18,
      padding: 18,
    },

    modalTitle: {
      fontSize: 20,
      fontWeight: "900",
      color: "#0F172A",
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