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

import CreateLguAdminModal from "../../components/admin/CreateLguAdminModal";

import {
  db,
} from "../../lib/firebase";

import {
  useUserSession,
} from "../../lib/useUserSession";

import {
  UserProfile,
} from "../../lib/firebaseAuth";

type UserAccount =
  UserProfile & {
    id: string;

    adminStatus?:
      | "active"
      | "suspended";

    previousRole?: string;
    previousPrimaryRole?: string;

    adminCreatedAt?: any;
    adminCreatedBy?: string;

    adminUpdatedAt?: any;
    adminUpdatedBy?: string;
  };

type AdminFilter =
  | "all"
  | "active"
  | "suspended";

type AdminAction =
  | "promote"
  | "suspend"
  | "activate"
  | "revoke";

type AdminAuditPayload = {
  actionType: string;
  targetType: string;
  targetId: string;
  adminUid: string;
  adminName: string;
  description: string;
};

const timestampValue = (
  value: any
) => {
  return value?.toMillis?.() || 0;
};

const nameFor = (
  account: UserAccount
) => {
  return (
    account.fullName ||
    account.email ||
    "Unnamed account"
  );
};

export default function AdminAccounts() {
  const {
    user: sessionUser,
    profile: sessionProfile,
    loading: sessionLoading,
  } = useUserSession();

  const isSuperAdmin =
    !!sessionUser &&
    !!sessionProfile &&
    sessionProfile.role === "superadmin" &&
    sessionProfile.status === "approved";

  const [
    users,
    setUsers,
  ] = useState<UserAccount[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingUid,
    setSavingUid,
  ] = useState<string | null>(null);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    filter,
    setFilter,
  ] = useState<AdminFilter>("all");

  // Remock requirement: display only five Admin accounts per page.
  const [adminPage, setAdminPage] = useState(1);
  const ADMIN_PAGE_SIZE = 5;
  React.useEffect(() => { setAdminPage(1); }, [search, filter]);

  const [
    showAddAdmin,
    setShowAddAdmin,
  ] = useState(false);

  const [showCreateIndependentAdmin, setShowCreateIndependentAdmin] = useState(false);
  const [creationNotice, setCreationNotice] = useState("");

  const [
    promoteSearch,
    setPromoteSearch,
  ] = useState("");

  const [
    actionType,
    setActionType,
  ] = useState<AdminAction | null>(null);

  const [
    actionTarget,
    setActionTarget,
  ] = useState<UserAccount | null>(null);

  const [
    actionError,
    setActionError,
  ] = useState("");

  // LGU staff authorization requires an independent human credential check.
  // Never collect photographs or secret document values in this review.
  const [lguOffice, setLguOffice] = useState("");
  const [lguPosition, setLguPosition] = useState("");
  const [lguReference, setLguReference] = useState("");
  const [lguVerificationMethod, setLguVerificationMethod] = useState("");
  const [credentialsConfirmed, setCredentialsConfirmed] = useState(false);
  const clearCredentialReview = () => {
    setLguOffice("");
    setLguPosition("");
    setLguReference("");
    setLguVerificationMethod("");
    setCredentialsConfirmed(false);
  };
  const reviewComplete =
    lguOffice.trim().length >= 3 && lguOffice.trim().length <= 160 &&
    lguPosition.trim().length >= 3 && lguPosition.trim().length <= 120 &&
    lguReference.trim().length >= 5 && lguReference.trim().length <= 160 &&
    lguVerificationMethod.trim().length >= 8 && lguVerificationMethod.trim().length <= 200 &&
    !!actionTarget?.email && actionTarget.email.length >= 5 &&
    credentialsConfirmed;

  React.useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!isSuperAdmin) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "users"
        ),

        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(
                  item.data() as UserProfile
                ),
              }))
              .sort(
                (a, b) =>
                  timestampValue(
                    b.createdAt
                  ) -
                  timestampValue(
                    a.createdAt
                  )
              );

          setUsers(rows);
          setLoading(false);
        },

        (error) => {
          console.log(
            "admin accounts listener error",
            error
          );

          setLoading(false);

          Alert.alert(
            "Error",
            "Unable to load user accounts."
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    sessionLoading,
    isSuperAdmin,
  ]);

  const adminAccounts =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return users.filter(
        (item) => {
          if (
            item.role !== "admin"
          ) {
            return false;
          }

          const adminStatus =
            item.adminStatus ||
            (
              item.status ===
              "suspended"
                ? "suspended"
                : "active"
            );

          if (
            filter !== "all" &&
            adminStatus !== filter
          ) {
            return false;
          }

          if (!term) {
            return true;
          }

          const searchable = [
            item.fullName,
            item.email,
            item.barangay,
            item.phoneNumber,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      users,
      search,
      filter,
    ]);

  const adminPageCount = Math.max(1, Math.ceil(adminAccounts.length / ADMIN_PAGE_SIZE));
  const safeAdminPage = Math.min(adminPage, adminPageCount);
  const pagedAdminAccounts = adminAccounts.slice(
    (safeAdminPage - 1) * ADMIN_PAGE_SIZE,
    safeAdminPage * ADMIN_PAGE_SIZE
  );

  const eligibleUsers =
    useMemo(() => {
      const term =
        promoteSearch
          .trim()
          .toLowerCase();

      // Avoid showing arbitrary Resident accounts in a privileged access picker.
      // Require an intentional exact-name/email search before selecting staff.
      if (term.length < 3) {
        return [];
      }

      return users
        .filter((item) => {
          if (
            item.role ===
              "admin" ||
            item.role ===
              "superadmin"
          ) {
            return false;
          }

          if (
            item.status !==
            "approved"
          ) {
            return false;
          }

          if (!term) {
            return true;
          }

          const searchable = [
            item.fullName,
            item.email,
            item.role,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            term
          );
        })
        .slice(0, 30);
    }, [
      users,
      promoteSearch,
    ]);

  const totalAdmins =
    users.filter(
      (item) =>
        item.role === "admin"
    ).length;

  const activeAdmins =
    users.filter(
      (item) =>
        item.role === "admin" &&
        item.status !==
          "suspended" &&
        item.adminStatus !==
          "suspended"
    ).length;

  const suspendedAdmins =
    totalAdmins -
    activeAdmins;

  const verifySuperAdmin =
    () => {
      if (!sessionUser) {
        Alert.alert(
          "Session Error",
          "Please sign in again."
        );

        return null;
      }

      if (
        !isSuperAdmin ||
        !sessionProfile
      ) {
        Alert.alert(
          "Access Denied",
          "Only the active Super Admin can manage Admin accounts."
        );

        return null;
      }

      return {
        current: sessionUser,
        profile: sessionProfile,
      };
    };

  const openAdminAction = (
    action: AdminAction,
    account: UserAccount
  ) => {
    const verified =
      verifySuperAdmin();

    if (!verified) {
      return;
    }

    setActionError("");
    clearCredentialReview();
    setActionType(action);
    setActionTarget(account);
  };

  const closeAdminAction =
    () => {
      if (savingUid) {
        return;
      }

      setActionError("");
      setActionType(null);
      setActionTarget(null);
    };

  const actionTitle = (
    action: AdminAction | null
  ) => {
    if (action === "promote") {
      return "Grant LGU Admin Access";
    }

    if (action === "suspend") {
      return "Suspend Admin";
    }

    if (action === "activate") {
      return "Activate Admin";
    }

    return "Remove Admin Access";
  };

  const actionMessage = (
    action: AdminAction | null,
    account: UserAccount | null
  ) => {
    if (!account) {
      return "";
    }

    const name =
      nameFor(account);

    if (action === "promote") {
      return `Grant LGU Admin access to ${name} after confirming official staff credentials?`;
    }

    if (action === "suspend") {
      return `Temporarily suspend Admin access for ${name}?`;
    }

    if (action === "activate") {
      return `Restore active Admin access for ${name}?`;
    }

    const restoredRole =
      account.previousRole &&
      account.previousRole !== "admin" &&
      account.previousRole !== "superadmin"
        ? account.previousRole
        : "resident";

    return `Remove Admin access from ${name}? The account will return to ${restoredRole}.`;
  };

  const actionButtonLabel = (
    action: AdminAction | null
  ) => {
    if (action === "promote") {
      return "Grant Access";
    }

    if (action === "suspend") {
      return "Suspend";
    }

    if (action === "activate") {
      return "Activate";
    }

    return "Remove Access";
  };

  const readableAdminError = (
    error: any
  ) => {
    const code =
      String(
        error?.code || ""
      );

    if (
      code.includes(
        "permission-denied"
      )
    ) {
      return "Firestore blocked this change. Check the deployed Firestore rules and confirm this account is still Super Admin.";
    }

    if (
      code.includes(
        "unauthenticated"
      )
    ) {
      return "Your session expired. Sign in again and retry.";
    }

    return (
      error?.message ||
      "Unable to update this Admin account."
    );
  };

  const confirmAdminAction =
    async () => {
      const account =
        actionTarget;

      const action =
        actionType;

      if (
        !account ||
        !action
      ) {
        return;
      }

      const verified =
        verifySuperAdmin();

      if (!verified) {
        return;
      }

      if (action === "promote" && !reviewComplete) {
        setActionError(
          "Complete the LGU office, official position, reference, verification method, and reviewer confirmation before granting access."
        );
        return;
      }

      setSavingUid(
        account.id
      );

      setActionError("");

      try {
        const batch =
          writeBatch(db);

        let logPayload: AdminAuditPayload;

        if (
          action === "promote"
        ) {
          // Atomic grant: Firestore rules require this fresh review record
          // in the same batch as the role change.
          batch.set(doc(db, "lguAdminCredentialReviews", account.id), {
            targetUid: account.id,
            accountEmail: account.email,
            reviewStatus: "verified",
            office: lguOffice.trim(),
            position: lguPosition.trim(),
            credentialReference: lguReference.trim(),
            verificationMethod: lguVerificationMethod.trim(),
            verifiedBy: verified.current.uid,
            verifiedAt: serverTimestamp(),
          });
          batch.update(
            doc(
              db,
              "users",
              account.id
            ),
            {
              previousRole:
                account.role ||
                "resident",

              previousPrimaryRole:
                account.primaryRole ||
                account.role ||
                "resident",

              role: "admin",

              adminStatus:
                "active",

              status:
                "approved",

              adminCreatedAt:
                serverTimestamp(),

              adminCreatedBy:
                verified.current.uid,

              adminUpdatedAt:
                serverTimestamp(),

              adminUpdatedBy:
                verified.current.uid,
            }
          );

          logPayload = {
            actionType:
              "admin_account_created",

            targetType:
              "user",

            targetId:
              account.id,

            adminUid:
              verified.current.uid,

            adminName:
              verified.current
                .displayName ||
              verified.current
                .email ||
              "Super Admin",

            description:
              `${nameFor(
                account
              )} was granted Admin access.`,
          };
        } else if (
          action === "suspend"
        ) {
          batch.update(
            doc(
              db,
              "users",
              account.id
            ),
            {
              status:
                "suspended",

              adminStatus:
                "suspended",

              adminUpdatedAt:
                serverTimestamp(),

              adminUpdatedBy:
                verified.current.uid,
            }
          );

          logPayload = {
            actionType:
              "admin_account_suspended",

            targetType:
              "user",

            targetId:
              account.id,

            adminUid:
              verified.current.uid,

            adminName:
              verified.current
                .displayName ||
              verified.current
                .email ||
              "Super Admin",

            description:
              `${nameFor(
                account
              )} Admin access was suspended.`,
          };
        } else if (
          action === "activate"
        ) {
          batch.update(
            doc(
              db,
              "users",
              account.id
            ),
            {
              status:
                "approved",

              adminStatus:
                "active",

              adminUpdatedAt:
                serverTimestamp(),

              adminUpdatedBy:
                verified.current.uid,
            }
          );

          logPayload = {
            actionType:
              "admin_account_activated",

            targetType:
              "user",

            targetId:
              account.id,

            adminUid:
              verified.current.uid,

            adminName:
              verified.current
                .displayName ||
              verified.current
                .email ||
              "Super Admin",

            description:
              `${nameFor(
                account
              )} Admin access was reactivated.`,
          };
        } else {
          const restoredRole =
            account.previousRole &&
            account.previousRole !==
              "admin" &&
            account.previousRole !==
              "superadmin"
              ? account.previousRole
              : "resident";

          batch.update(
            doc(
              db,
              "users",
              account.id
            ),
            {
              role:
                restoredRole,

              primaryRole:
                account.previousPrimaryRole ||
                account.primaryRole ||
                restoredRole,

              status:
                "approved",

              adminStatus:
                "suspended",

              adminUpdatedAt:
                serverTimestamp(),

              adminUpdatedBy:
                verified.current.uid,

              adminRevokedAt:
                serverTimestamp(),

              adminRevokedBy:
                verified.current.uid,
            }
          );

          logPayload = {
            actionType:
              "admin_access_revoked",

            targetType:
              "user",

            targetId:
              account.id,

            adminUid:
              verified.current.uid,

            adminName:
              verified.current
                .displayName ||
              verified.current
                .email ||
              "Super Admin",

            description:
              `${nameFor(
                account
              )} Admin access was removed and the account was restored to ${restoredRole}.`,
          };
        }

        // Log the outcome in the same atomic batch as the role change:
        // privileged access must never be granted without its audit record.
        batch.set(doc(collection(db, "adminLogs")), {
          ...logPayload,
          createdAt: serverTimestamp(),
        });
        await batch.commit();

        if (
          action === "promote"
        ) {
          setShowAddAdmin(
            false
          );

          setPromoteSearch(
            ""
          );
        }

        setActionType(null);
        setActionTarget(null);
        setActionError("");
        clearCredentialReview();
      } catch (error: any) {
        console.log(
          "admin access update error",
          error
        );

        setActionError(
          readableAdminError(
            error
          )
        );
      } finally {
        setSavingUid(null);
      }
    };

  if (
    sessionLoading ||
    (isSuperAdmin && loading)
  ) {
    return (
      <View
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
          color="#0F766E"
        />

        <Text
          style={styles.loadingText}
        >
          Loading Admin accounts...
        </Text>
      </View>
    );
  }

  if (!isSuperAdmin) {
    return (
      <View
        style={styles.center}
      >
        <Ionicons
          name="shield-outline"
          size={42}
          color="#0F766E"
        />

        <Text
          style={styles.accessDeniedTitle}
        >
          Super Admin access required
        </Text>

        <Text
          style={styles.accessDeniedText}
        >
          This page is reserved for the dedicated Super Admin account.
          Operational Admin accounts cannot view or manage Admin access.
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
        <View
          style={styles.header}
        >
          <View
            style={{ flex: 1 }}
          >
            <Text
              style={styles.eyebrow}
            >
              SUPER ADMIN
            </Text>

            <Text
              style={styles.title}
            >
              LGU Admin Accounts
            </Text>

            <Text
              style={styles.subtitle}
            >
              Review authorized LGU staff accounts, manage access, and keep approvals separate from Resident and Volunteer accounts.
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Create independent LGU Admin account"
            style={styles.addButton}
            onPress={() => setShowCreateIndependentAdmin(true)}
          >
            <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Create LGU Admin</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.addButton, {backgroundColor:"#2B6C54"}]}
            onPress={() => setShowAddAdmin(true)}
          >
            <Ionicons
              name="person-add-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.addButtonText
              }
            >
              Review Existing Staff
            </Text>
          </TouchableOpacity>
        </View>

        {!!creationNotice && (
          <Text accessibilityRole="alert" style={{color:"#16654B",fontWeight:"700",marginVertical:8}}>
            {creationNotice}
          </Text>
        )}

        <View style={styles.accessFlow}>
          <Text style={styles.accessFlowTitle}>LGU ADMIN ACCOUNT FLOW</Text>
          <View style={styles.accessFlowSteps}>
            <View style={styles.accessStep}><Text style={styles.stepNumber}>01</Text><Text style={styles.stepText}>Register a separate staff account</Text></View>
            <Ionicons name="chevron-forward" size={14} color="#789188" />
            <View style={styles.accessStep}><Text style={styles.stepNumber}>02</Text><Text style={styles.stepText}>Independently verify LGU credentials</Text></View>
            <Ionicons name="chevron-forward" size={14} color="#789188" />
            <View style={styles.accessStep}><Text style={styles.stepNumber}>03</Text><Text style={styles.stepText}>Grant access and audit changes</Text></View>
          </View>
          <Text style={styles.flowHint}>Create a separate staff Firebase login after independent LGU credential verification, or review an existing registered staff account. Resident identity verification alone is not proof of LGU employment.</Text>
        </View>
        <View
          style={
            styles.statsRow
          }
        >
          <View
            style={
              styles.statCard
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#E0F2FE",
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={22}
                color="#0284C7"
              />
            </View>

            <Text
              style={styles.statValue}
            >
              {totalAdmins}
            </Text>

            <Text
              style={styles.statLabel}
            >
              Total Admins
            </Text>
          </View>

          <View
            style={
              styles.statCard
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#DCFCE7",
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color="#16A34A"
              />
            </View>

            <Text
              style={styles.statValue}
            >
              {activeAdmins}
            </Text>

            <Text
              style={styles.statLabel}
            >
              Active
            </Text>
          </View>

          <View
            style={
              styles.statCard
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#FEF3C7",
                },
              ]}
            >
              <Ionicons
                name="pause-circle-outline"
                size={22}
                color="#D97706"
              />
            </View>

            <Text
              style={styles.statValue}
            >
              {suspendedAdmins}
            </Text>

            <Text
              style={styles.statLabel}
            >
              Suspended
            </Text>
          </View>
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
            style={
              styles.searchInput
            }
            value={search}
            onChangeText={
              setSearch
            }
            placeholder={
              "Search LGU Admin name, email, or barangay"
            }
            placeholderTextColor="#94A3B8"
          />
        </View>

        <View
          style={
            styles.filterRow
          }
        >
          {(
            [
              "all",
              "active",
              "suspended",
            ] as AdminFilter[]
          ).map((value) => {
            const active =
              filter === value;

            return (
              <TouchableOpacity
                key={value}
                style={[
                  styles.filterButton,

                  active &&
                    styles.filterButtonActive,
                ]}
                onPress={() =>
                  setFilter(value)
                }
              >
                <Text
                  style={[
                    styles.filterText,

                    active &&
                      styles.filterTextActive,
                  ]}
                >
                  {value === "all"
                    ? "All Admins"
                    : value ===
                        "active"
                      ? "Active"
                      : "Suspended"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {adminAccounts.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <View
              style={
                styles.emptyIcon
              }
            >
              <Ionicons
                name="people-outline"
                size={34}
                color="#0F766E"
              />
            </View>

            <Text
              style={
                styles.emptyTitle
              }
            >
              No Admin accounts
              found
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              No matching LGU Admin accounts. Adjust your search or start a staff access review.
            </Text>
          </View>
        ) : (
          pagedAdminAccounts.map(
            (account) => {
              const isSaving =
                savingUid ===
                account.id;

              const suspended =
                account.status ===
                  "suspended" ||
                account.adminStatus ===
                  "suspended";

              return (
                <View
                  key={
                    account.id
                  }
                  style={
                    styles.adminCard
                  }
                >
                  <View
                    style={
                      styles.adminTop
                    }
                  >
                    <View
                      style={
                        styles.avatar
                      }
                    >
                      <Text
                        style={
                          styles.avatarText
                        }
                      >
                        {nameFor(
                          account
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={
                          styles.adminName
                        }
                      >
                        {nameFor(
                          account
                        )}
                      </Text>

                      <Text
                        style={
                          styles.adminEmail
                        }
                      >
                        {account.email ||
                          "-"}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,

                        suspended
                          ? styles.statusSuspended
                          : styles.statusActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,

                          {
                            backgroundColor:
                              suspended
                                ? "#D97706"
                                : "#16A34A",
                          },
                        ]}
                      />

                      <Text
                        style={[
                          styles.statusBadgeText,

                          {
                            color:
                              suspended
                                ? "#92400E"
                                : "#166534",
                          },
                        ]}
                      >
                        {suspended
                          ? "SUSPENDED"
                          : "ACTIVE"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.detailsGrid
                    }
                  >
                    <View
                      style={
                        styles.detailItem
                      }
                    >
                      <Text
                        style={
                          styles.detailLabel
                        }
                      >
                        ROLE
                      </Text>

                      <Text
                        style={
                          styles.detailValue
                        }
                      >
                        Administrator
                      </Text>
                    </View>

                    <View
                      style={
                        styles.detailItem
                      }
                    >
                      <Text
                        style={
                          styles.detailLabel
                        }
                      >
                        BARANGAY
                      </Text>

                      <Text
                        style={
                          styles.detailValue
                        }
                      >
                        {account.barangay ||
                          "Not assigned"}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.detailItem
                      }
                    >
                      <Text
                        style={
                          styles.detailLabel
                        }
                      >
                        PHONE
                      </Text>

                      <Text
                        style={
                          styles.detailValue
                        }
                      >
                        {account.phoneNumber ||
                          "-"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.actions
                    }
                  >
                    {suspended ? (
                      <TouchableOpacity
                        disabled={
                          isSaving
                        }
                        style={[
                          styles.actionButton,
                          styles.activateButton,
                        ]}
                        onPress={() =>
                          openAdminAction(
                            "activate",
                            account
                          )
                        }
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={17}
                          color="#FFFFFF"
                        />

                        <Text
                          style={
                            styles.actionButtonText
                          }
                        >
                          {isSaving
                            ? "Saving..."
                            : "Activate"}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        disabled={
                          isSaving
                        }
                        style={[
                          styles.actionButton,
                          styles.suspendButton,
                        ]}
                        onPress={() =>
                          openAdminAction(
                            "suspend",
                            account
                          )
                        }
                      >
                        <Ionicons
                          name="pause-circle-outline"
                          size={17}
                          color="#FFFFFF"
                        />

                        <Text
                          style={
                            styles.actionButtonText
                          }
                        >
                          {isSaving
                            ? "Saving..."
                            : "Suspend"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      disabled={
                        isSaving
                      }
                      style={[
                        styles.actionButton,
                        styles.revokeButton,
                      ]}
                      onPress={() =>
                        openAdminAction(
                          "revoke",
                          account
                        )
                      }
                    >
                      <Ionicons
                        name="shield-outline"
                        size={17}
                        color="#FFFFFF"
                      />

                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        Remove Admin
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }
          )
        )}
        {adminAccounts.length > 0 && (
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:12,paddingVertical:14}}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous Admin accounts page"
              disabled={safeAdminPage <= 1} onPress={()=>setAdminPage(Math.max(1,safeAdminPage-1))}
              style={{paddingHorizontal:16,paddingVertical:10,borderRadius:10,backgroundColor:"#E2F5ED",opacity:safeAdminPage<=1?0.45:1}}>
              <Text style={{fontWeight:"700",color:"#076B50"}}>Previous</Text>
            </TouchableOpacity>
            <Text style={{fontWeight:"700",color:"#355D50"}}>
              Page {safeAdminPage} of {adminPageCount} · {adminAccounts.length} accounts
            </Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next Admin accounts page"
              disabled={safeAdminPage >= adminPageCount} onPress={()=>setAdminPage(Math.min(adminPageCount,safeAdminPage+1))}
              style={{paddingHorizontal:16,paddingVertical:10,borderRadius:10,backgroundColor:"#E2F5ED",opacity:safeAdminPage>=adminPageCount?0.45:1}}>
              <Text style={{fontWeight:"700",color:"#076B50"}}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <CreateLguAdminModal
        visible={showCreateIndependentAdmin}
        onClose={() => setShowCreateIndependentAdmin(false)}
        onCreated={(email) => {
          setShowCreateIndependentAdmin(false);
          setCreationNotice("Authorized LGU Admin created: " + email + ". Sign in using /admin-login.");
        }}
      />

      <Modal
        visible={showAddAdmin}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowAddAdmin(false);
          setPromoteSearch("");
        }}
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <View
            style={
              styles.modalCard
            }
          >
            <View
              style={
                styles.modalHeader
              }
            >
              <View
                style={{ flex: 1 }}
              >
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  Select Registered Staff Account
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  Choose a registered staff-owned account. Verify legitimate LGU employment and authorization before granting the Admin role.
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.closeButton
                }
                onPress={() => {
                  setShowAddAdmin(
                    false
                  );

                  setPromoteSearch(
                    ""
                  );
                }}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#334155"
                />
              </TouchableOpacity>
            </View>

            <View
              style={
                styles.modalSearch
              }
            >
              <Ionicons
                name="search-outline"
                size={19}
                color="#64748B"
              />

              <TextInput
                style={
                  styles.searchInput
                }
                value={
                  promoteSearch
                }
                onChangeText={
                  setPromoteSearch
                }
                placeholder={
                  "Search registered staff by name or email"
                }
                placeholderTextColor="#94A3B8"
              />
            </View>

            <ScrollView
              style={{
                maxHeight: 420,
              }}
            >
              {eligibleUsers.length ===
              0 ? (
                <View
                  style={
                    styles.modalEmpty
                  }
                >
                  <Ionicons
                    name="person-outline"
                    size={30}
                    color="#94A3B8"
                  />

                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    {promoteSearch.trim().length < 3
                      ? "Enter at least 3 characters of the staff member's name or email."
                      : "No matching approved account. Check the registered staff name or email."}
                  </Text>
                </View>
              ) : (
                eligibleUsers.map(
                  (account) => {
                    const isSaving =
                      savingUid ===
                      account.id;

                    return (
                      <View
                        key={
                          account.id
                        }
                        style={
                          styles.userRow
                        }
                      >
                        <View
                          style={
                            styles.smallAvatar
                          }
                        >
                          <Text
                            style={
                              styles.smallAvatarText
                            }
                          >
                            {nameFor(
                              account
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </Text>
                        </View>

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={
                              styles.userName
                            }
                          >
                            {nameFor(
                              account
                            )}
                          </Text>

                          <Text
                            style={
                              styles.userMeta
                            }
                          >
                            {account.email ||
                              "-"}
                          </Text>

                          <Text
                            style={
                              styles.userMeta
                            }
                          >
                            Current role:{" "}
                            {account.role ||
                              "resident"}
                          </Text>
                        </View>

                        <TouchableOpacity
                          disabled={
                            isSaving
                          }
                          style={
                            styles.promoteButton
                          }
                          onPress={() =>
                            openAdminAction(
                              "promote",
                              account
                            )
                          }
                        >
                          <Text
                            style={
                              styles.promoteButtonText
                            }
                          >
                            {isSaving
                              ? "Saving..."
                              : "Review Access"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                )
              )}
            </ScrollView>

            <View
              style={
                styles.infoBox
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#0369A1"
              />

              <Text
                style={
                  styles.infoText
                }
              >
                Staff accounts use Firebase Authentication, while LGU eligibility must be independently verified. Do not grant Admin access to an ordinary Resident or Volunteer without legitimate staff credentials.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={
          !!actionType &&
          !!actionTarget
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeAdminAction
        }
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <View
            style={
              styles.confirmCard
            }
          >
            <View
              style={
                styles.confirmIcon
              }
            >
              <Ionicons
                name={
                  actionType ===
                  "promote"
                    ? "shield-checkmark-outline"
                    : actionType ===
                        "activate"
                      ? "checkmark-circle-outline"
                      : actionType ===
                          "suspend"
                        ? "pause-circle-outline"
                        : "shield-outline"
                }
                size={28}
                color={
                  actionType ===
                    "revoke" ||
                  actionType ===
                    "suspend"
                    ? "#B45309"
                    : "#0F766E"
                }
              />
            </View>

            <Text
              style={
                styles.confirmTitle
              }
            >
              {actionTitle(
                actionType
              )}
            </Text>

            <Text
              style={
                styles.confirmMessage
              }
            >
              {actionMessage(
                actionType,
                actionTarget
              )}
            </Text>

            {actionTarget && (
              <View
                style={
                  styles.confirmAccount
                }
              >
                <Text
                  style={
                    styles.confirmAccountName
                  }
                >
                  {nameFor(
                    actionTarget
                  )}
                </Text>

                <Text
                  style={
                    styles.confirmAccountMeta
                  }
                >
                  {actionTarget.email ||
                    "No email"}
                </Text>
              </View>
            )}

            {actionType === "promote" ? (
              <View style={styles.credentialReview}>
                <Text style={styles.reviewKicker}>STEP 2 OF 3 · LGU CREDENTIAL REVIEW</Text>
                <Text style={styles.reviewHelp}>
                  Verify this person's LGU employment and authorization using an official source.
                  Resident identity verification alone is not sufficient.
                </Text>
                <ScrollView style={styles.reviewScroll} keyboardShouldPersistTaps="handled">
                  {([
                    { label: "LGU Office / Department", value: lguOffice, onChange: setLguOffice, placeholder: "Official department", maxLength: 160 },
                    { label: "Official Position", value: lguPosition, onChange: setLguPosition, placeholder: "Authorized staff role", maxLength: 120 },
                    { label: "Verification Reference", value: lguReference, onChange: setLguReference, placeholder: "Non-sensitive official reference", maxLength: 160 },
                    { label: "How was this independently verified?", value: lguVerificationMethod, onChange: setLguVerificationMethod, placeholder: "e.g., confirmed through the official LGU office", maxLength: 200 },
                  ] as const).map((field) => (
                    <View key={field.label} style={styles.reviewField}>
                      <Text style={styles.reviewLabel}>{field.label}</Text>
                      <TextInput
                        accessibilityLabel={field.label}
                        style={styles.reviewInput}
                        placeholder={field.placeholder}
                        placeholderTextColor="#8A9C94"
                        maxLength={field.maxLength}
                        value={field.value}
                        onChangeText={field.onChange}
                        editable={!savingUid}
                      />
                    </View>
                  ))}
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: credentialsConfirmed }}
                    style={styles.confirmReview}
                    onPress={() => setCredentialsConfirmed((current) => !current)}
                    disabled={!!savingUid}
                  >
                    <Ionicons
                      name={credentialsConfirmed ? "checkbox" : "square-outline"}
                      size={23}
                      color="#23765F"
                    />
                    <Text style={styles.confirmReviewText}>
                      I independently reviewed LGU credentials and confirmed that the selected account belongs to the authorized staff member.
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
                <Text style={styles.reviewHint}>No ID scans or passwords are stored here. Only the review reference and reviewer are recorded.</Text>
              </View>
            ) : null}

            {!!actionError && (
              <View
                style={
                  styles.actionErrorBox
                }
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#B91C1C"
                />

                <Text
                  style={
                    styles.actionErrorText
                  }
                >
                  {actionError}
                </Text>
              </View>
            )}

            <View
              style={
                styles.confirmActions
              }
            >
              <TouchableOpacity
                disabled={
                  !!savingUid
                }
                style={[
                  styles.confirmButton,
                  styles.confirmCancelButton,
                ]}
                onPress={
                  closeAdminAction
                }
              >
                <Text
                  style={
                    styles.confirmCancelText
                  }
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!!savingUid || (actionType === "promote" && !reviewComplete)}
                style={[
                  styles.confirmButton,
                  actionType ===
                    "revoke" ||
                  actionType ===
                    "suspend"
                    ? styles.confirmDangerButton
                    : styles.confirmPrimaryButton,
                  (actionType === "promote" && !reviewComplete) && styles.confirmDisabled,
                ]}
                onPress={() =>
                  void confirmAdminAction()
                }
              >
                {savingUid ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.confirmPrimaryText
                    }
                  >
                    {actionButtonLabel(
                      actionType
                    )}
                  </Text>
                )}
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
    credentialReview: { marginTop: 12, marginBottom: 10, borderTopWidth: 1, borderColor: "#E0EAE4", paddingTop: 14 },
    reviewKicker: { fontSize: 10, fontWeight: "700", letterSpacing: 0.9, color: "#247459" },
    reviewHelp: { color: "#64776D", fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 12 },
    reviewScroll: { maxHeight: 275 },
    reviewField: { marginBottom: 10 },
    reviewLabel: { fontSize: 12, fontWeight: "600", color: "#355247", marginBottom: 5 },
    reviewInput: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D5E3DB", borderRadius: 8, paddingHorizontal: 11, minHeight: 43, fontSize: 13, color: "#173D32" },
    confirmReview: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginVertical: 8 },
    confirmReviewText: { flex: 1, color: "#3B594B", fontSize: 12, lineHeight: 18 },
    reviewHint: { color: "#75867D", fontSize: 11, lineHeight: 16 },
    confirmDisabled: { opacity: 0.5 },
    accessFlow: { paddingVertical: 16, paddingHorizontal: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DDE6E1", marginBottom: 18 },
    accessFlowTitle: { color: "#426658", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 11 },
    accessFlowSteps: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 },
    accessStep: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
    stepNumber: { color: "#23765F", fontSize: 11, fontWeight: "800" },
    stepText: { color: "#2B453B", fontSize: 12, fontWeight: "600", flexShrink: 1 },
    flowHint: { color: "#667F74", fontSize: 11.5, lineHeight: 18, marginTop: 12, maxWidth: 850 },
    container: {
      padding: 24,
      paddingBottom: 60,
      backgroundColor:
        "#F1F5F9",
      minHeight: "100%",
    },

    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor:
        "#F8FAFC",
    },

    loadingText: {
      marginTop: 12,
      color: "#64748B",
      fontWeight: "600",
    },

    accessDeniedTitle: {
      marginTop: 14,
      color: "#173D32",
      fontSize: 20,
      fontWeight: "900",
      textAlign: "center",
    },

    accessDeniedText: {
      marginTop: 8,
      maxWidth: 520,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      paddingHorizontal: 24,
    },

    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-start",
      gap: 16,
      marginBottom: 22,
    },

    eyebrow: {
      fontSize: 11,
      fontWeight: "900",
      color: "#0F766E",
      letterSpacing: 1.4,
      marginBottom: 5,
    },

    title: {
      fontSize: 30,
      fontWeight: "700",
      color: "#173D32",
    },

    subtitle: {
      color: "#64748B",
      marginTop: 5,
      lineHeight: 20,
      maxWidth: 600,
    },

    addButton: {
      minHeight: 44,
      paddingHorizontal: 17,
      borderRadius: 12,
      backgroundColor:
        "#0F766E",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
    },

    addButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
    },

    statsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 18,
    },

    statCard: {
      flexGrow: 1,
      minWidth: 140,
      backgroundColor: "transparent",
      borderRadius: 0,
      borderBottomWidth: 1,
      borderColor: "#E2E8F0",
      padding: 16,
    },

    statIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },

    statValue: {
      fontSize: 25,
      fontWeight: "700",
      color: "#173D32",
    },

    statLabel: {
      marginTop: 2,
      color: "#64748B",
      fontWeight: "700",
    },

    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor: "#CBD5E1",
      borderRadius: 13,
      paddingHorizontal: 14,
      marginBottom: 12,
    },

    searchInput: {
      flex: 1,
      minHeight: 46,
      color: "#173D32",
      outlineStyle: "none",
    } as any,

    filterRow: {
      flexDirection: "row",
      gap: 9,
      marginBottom: 18,
    },

    filterButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor: "#CBD5E1",
    },

    filterButtonActive: {
      backgroundColor:
        "#0F766E",
      borderColor: "#0F766E",
    },

    filterText: {
      color: "#475569",
      fontWeight: "800",
      fontSize: 12,
    },

    filterTextActive: {
      color: "#FFFFFF",
    },

    adminCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 3,
      borderBottomWidth: 1,
      borderColor: "#E2E8F0",
      padding: 17,
      marginBottom: 8,
    },

    adminTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },

    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor:
        "#CCFBF1",
      alignItems: "center",
      justifyContent: "center",
    },

    avatarText: {
      color: "#0F766E",
      fontSize: 18,
      fontWeight: "900",
    },

    adminName: {
      fontSize: 17,
      fontWeight: "900",
      color: "#173D32",
    },

    adminEmail: {
      marginTop: 3,
      color: "#64748B",
    },

    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    statusActive: {
      backgroundColor:
        "#DCFCE7",
    },

    statusSuspended: {
      backgroundColor:
        "#FEF3C7",
    },

    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },

    statusBadgeText: {
      fontWeight: "900",
      fontSize: 10,
    },

    detailsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 16,
    },

    detailItem: {
      minWidth: 180,
      flexGrow: 1,
      padding: 8,
      backgroundColor: "transparent",
      borderRadius: 0,
    },

    detailLabel: {
      fontSize: 9,
      letterSpacing: 0.8,
      fontWeight: "900",
      color: "#94A3B8",
    },

    detailValue: {
      marginTop: 5,
      fontWeight: "800",
      color: "#334155",
    },

    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      marginTop: 14,
    },

    actionButton: {
      minHeight: 42,
      borderRadius: 10,
      paddingHorizontal: 15,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
    },

    activateButton: {
      backgroundColor:
        "#16A34A",
    },

    suspendButton: {
      backgroundColor:
        "#D97706",
    },

    revokeButton: {
      backgroundColor:
        "#DC2626",
    },

    actionButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 12,
    },

    emptyCard: {
      padding: 32,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 9,
      borderWidth: 1,
      borderColor: "#E2E8F0",
      alignItems: "center",
    },

    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor:
        "#CCFBF1",
      alignItems: "center",
      justifyContent: "center",
    },

    emptyTitle: {
      marginTop: 13,
      color: "#173D32",
      fontSize: 17,
      fontWeight: "900",
    },

    emptyText: {
      marginTop: 5,
      color: "#64748B",
      textAlign: "center",
      lineHeight: 19,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor:
        "rgba(15,23,42,0.55)",
      justifyContent: "center",
      padding: 20,
    },

    modalCard: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 10,
      padding: 18,
    },

    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 15,
    },

    modalTitle: {
      fontSize: 22,
      fontWeight: "900",
      color: "#173D32",
    },

    modalSubtitle: {
      marginTop: 4,
      color: "#64748B",
      lineHeight: 19,
    },

    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor:
        "#F1F5F9",
      alignItems: "center",
      justifyContent: "center",
    },

    modalSearch: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: "#CBD5E1",
      borderRadius: 12,
      marginBottom: 12,
    },

    userRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        "#E2E8F0",
    },

    smallAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor:
        "#E0F2FE",
      alignItems: "center",
      justifyContent: "center",
    },

    smallAvatarText: {
      color: "#0369A1",
      fontWeight: "900",
    },

    userName: {
      color: "#173D32",
      fontWeight: "900",
    },

    userMeta: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 12,
    },

    promoteButton: {
      backgroundColor:
        "#0F766E",
      borderRadius: 10,
      minHeight: 39,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },

    promoteButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 12,
    },

    modalEmpty: {
      padding: 26,
      alignItems: "center",
    },

    infoBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      backgroundColor:
        "#E0F2FE",
      borderRadius: 12,
      padding: 12,
      marginTop: 14,
    },

    infoText: {
      flex: 1,
      color: "#075985",
      lineHeight: 18,
      fontSize: 12,
    },

    confirmCard: {
      width: "100%",
      maxWidth: 460,
      alignSelf: "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 10,
      padding: 24,
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    confirmIcon: {
      width: 54,
      height: 54,
      borderRadius: 9,
      backgroundColor:
        "#F0FDFA",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },

    confirmTitle: {
      color: "#173D32",
      fontSize: 21,
      fontWeight: "900",
    },

    confirmMessage: {
      marginTop: 7,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 20,
    },

    confirmAccount: {
      marginTop: 18,
      padding: 13,
      borderRadius: 12,
      backgroundColor:
        "#F8FAFC",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    confirmAccountName: {
      color: "#173D32",
      fontSize: 14,
      fontWeight: "900",
    },

    confirmAccountMeta: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 12,
    },

    actionErrorBox: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 12,
      borderRadius: 11,
      backgroundColor:
        "#FEF2F2",
      borderWidth: 1,
      borderColor:
        "#FECACA",
    },

    actionErrorText: {
      flex: 1,
      color: "#B91C1C",
      fontSize: 12,
      lineHeight: 18,
    },

    confirmActions: {
      marginTop: 20,
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
    },

    confirmButton: {
      minHeight: 43,
      minWidth: 112,
      paddingHorizontal: 16,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },

    confirmCancelButton: {
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#CBD5E1",
    },

    confirmPrimaryButton: {
      backgroundColor:
        "#0F766E",
    },

    confirmDangerButton: {
      backgroundColor:
        "#B45309",
    },

    confirmCancelText: {
      color: "#475569",
      fontSize: 12,
      fontWeight: "900",
    },

    confirmPrimaryText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },
  });