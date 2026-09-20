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
    createAdminLog,
} from "../../lib/adminLogger";

import {
    auth,
    db,
} from "../../lib/firebase";

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

  const [
    showAddAdmin,
    setShowAddAdmin,
  ] = useState(false);

  const [
    promoteSearch,
    setPromoteSearch,
  ] = useState("");

  React.useEffect(() => {
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
  }, []);

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

  const eligibleUsers =
    useMemo(() => {
      const term =
        promoteSearch
          .trim()
          .toLowerCase();

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
            item.barangay,
            item.phoneNumber,
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
      const current =
        auth.currentUser;

      if (!current) {
        Alert.alert(
          "Session Error",
          "Please sign in again."
        );

        return null;
      }

      const profile =
        users.find(
          (item) =>
            item.id ===
            current.uid
        );

      if (
        !profile ||
        profile.role !==
          "superadmin"
      ) {
        Alert.alert(
          "Access Denied",
          "Only the Super Admin can manage Admin accounts."
        );

        return null;
      }

      return {
        current,
        profile,
      };
    };

  const promoteToAdmin =
    async (
      account: UserAccount
    ) => {
      const verified =
        verifySuperAdmin();

      if (!verified) {
        return;
      }

      Alert.alert(
        "Promote to Admin",
        `Give ${nameFor(
          account
        )} Admin access?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },

          {
            text: "Promote",
            onPress: async () => {
              try {
                setSavingUid(
                  account.id
                );

                const batch =
                  writeBatch(db);

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

                await batch.commit();

                await createAdminLog({
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
                    )} was promoted to Admin.`,
                });

                setShowAddAdmin(false);
                setPromoteSearch("");

                Alert.alert(
                  "Admin Created",
                  `${nameFor(
                    account
                  )} now has Admin access.`
                );
              } catch (error) {
                console.log(
                  "promote admin error",
                  error
                );

                Alert.alert(
                  "Error",
                  "Unable to promote this account to Admin."
                );
              } finally {
                setSavingUid(null);
              }
            },
          },
        ]
      );
    };

  const suspendAdmin =
    (
      account: UserAccount
    ) => {
      const verified =
        verifySuperAdmin();

      if (!verified) {
        return;
      }

      Alert.alert(
        "Suspend Admin",
        `Temporarily suspend Admin access for ${nameFor(
          account
        )}?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },

          {
            text: "Suspend",
            style: "destructive",

            onPress: async () => {
              try {
                setSavingUid(
                  account.id
                );

                const batch =
                  writeBatch(db);

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

                await batch.commit();

                await createAdminLog({
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
                    )} Admin account was suspended.`,
                });

                Alert.alert(
                  "Admin Suspended",
                  `${nameFor(
                    account
                  )} can no longer use active Admin access until reactivated.`
                );
              } catch (error) {
                console.log(
                  "suspend admin error",
                  error
                );

                Alert.alert(
                  "Error",
                  "Unable to suspend this Admin."
                );
              } finally {
                setSavingUid(null);
              }
            },
          },
        ]
      );
    };

  const activateAdmin =
    (
      account: UserAccount
    ) => {
      const verified =
        verifySuperAdmin();

      if (!verified) {
        return;
      }

      Alert.alert(
        "Activate Admin",
        `Restore Admin access for ${nameFor(
          account
        )}?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },

          {
            text: "Activate",

            onPress: async () => {
              try {
                setSavingUid(
                  account.id
                );

                const batch =
                  writeBatch(db);

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

                await batch.commit();

                await createAdminLog({
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
                    )} Admin account was reactivated.`,
                });

                Alert.alert(
                  "Admin Activated",
                  `${nameFor(
                    account
                  )} now has active Admin access.`
                );
              } catch (error) {
                console.log(
                  "activate admin error",
                  error
                );

                Alert.alert(
                  "Error",
                  "Unable to reactivate this Admin."
                );
              } finally {
                setSavingUid(null);
              }
            },
          },
        ]
      );
    };

  const revokeAdmin =
    (
      account: UserAccount
    ) => {
      const verified =
        verifySuperAdmin();

      if (!verified) {
        return;
      }

      const restoredRole =
        account.previousRole &&
        account.previousRole !==
          "admin" &&
        account.previousRole !==
          "superadmin"
          ? account.previousRole
          : "resident";

      Alert.alert(
        "Remove Admin Access",
        `Remove Admin privileges from ${nameFor(
          account
        )}? Their account will return to ${restoredRole}.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },

          {
            text: "Remove Access",
            style: "destructive",

            onPress: async () => {
              try {
                setSavingUid(
                  account.id
                );

                const batch =
                  writeBatch(db);

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

                await batch.commit();

                await createAdminLog({
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
                });

                Alert.alert(
                  "Admin Access Removed",
                  `${nameFor(
                    account
                  )} is no longer an Admin.`
                );
              } catch (error) {
                console.log(
                  "revoke admin error",
                  error
                );

                Alert.alert(
                  "Error",
                  "Unable to remove Admin access."
                );
              } finally {
                setSavingUid(null);
              }
            },
          },
        ]
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
          style={styles.loadingText}
        >
          Loading Admin accounts...
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
              Admin Accounts
            </Text>

            <Text
              style={styles.subtitle}
            >
              Control operational
              administrator access
              across VolunServe.
            </Text>
          </View>

          <TouchableOpacity
            style={
              styles.addButton
            }
            onPress={() =>
              setShowAddAdmin(true)
            }
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
              Add Admin
            </Text>
          </TouchableOpacity>
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
              "Search Admin name, email, barangay..."
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
              Try another filter
              or promote an approved
              user to Admin.
            </Text>
          </View>
        ) : (
          adminAccounts.map(
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
                          activateAdmin(
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
                          suspendAdmin(
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
                        revokeAdmin(
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
      </ScrollView>

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
                  Add Admin
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  Select an existing
                  approved VolunServe
                  account to promote.
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
                  "Search approved users..."
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
                    No eligible approved
                    users found.
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
                            promoteToAdmin(
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
                              : "Promote"}
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
                For the Spark/free
                architecture, Admin
                access is given to an
                existing verified
                Firebase account instead
                of creating a second
                Auth account from the
                browser.
              </Text>
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

    header: {
      flexDirection: "row",
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
      fontWeight: "900",
      color: "#0F172A",
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
      minWidth: 180,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 15,
      borderWidth: 1,
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
      fontWeight: "900",
      color: "#0F172A",
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
      color: "#0F172A",
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
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "#E2E8F0",
      padding: 17,
      marginBottom: 13,
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
      color: "#0F172A",
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
      padding: 12,
      backgroundColor:
        "#F8FAFC",
      borderRadius: 11,
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
      borderRadius: 16,
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
      color: "#0F172A",
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
      borderRadius: 18,
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
      color: "#0F172A",
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
      color: "#0F172A",
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
  });