import { Ionicons } from "@expo/vector-icons";

import {
  collection,
  doc,
  getDoc,
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
  useWindowDimensions,
  View,
} from "react-native";

import CreateLguAdminModal from "../../components/admin/CreateLguAdminModal";
import { SJDM_BARANGAYS } from "../../constants/sjdmBarangays";
import SuperAdminFilterSort from "../../components/ui/SuperAdminFilterSort";
import ListPagination from "../../components/ui/ListPagination";

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

type BarangayRequest = {
  id: string; uid: string; desiredBarangay: string;
  office: string; position: string; appointmentReference: string;
  status: "pending" | "approved" | "rejected";
  submittedAt?: any;
};

type AdminFilter =
  | "all"
  | "active"
  | "suspended";

type AdminSort = "newest" | "oldest" | "name_asc" | "name_desc";

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
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
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
  const [sort, setSort] = useState<AdminSort>("newest");
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [expandedPendingId, setExpandedPendingId] = useState<string | null>(null);

  // Remock requirement: display only five Admin accounts per page.
  const [adminPage, setAdminPage] = useState(1);
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);
  const [barangayTarget, setBarangayTarget] = useState<UserAccount | null>(null);
  const [barangayRequests, setBarangayRequests] = useState<BarangayRequest[]>([]);
  const [barangayRejectReason, setBarangayRejectReason] = useState("");
  const [barangayVerified, setBarangayVerified] = useState(false);
  const [barangayError, setBarangayError] = useState("");
  const pendingAreaRequestFor = (account: UserAccount) =>
    barangayRequests.find(request => request.id === account.id && request.status === "pending");
  const compactDirectory = viewportWidth < 1180;
  const ADMIN_PAGE_SIZE = 5;
  React.useEffect(() => { setAdminPage(1); setExpandedAdminId(null); }, [search, filter, sort]);

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
  const [identityMatched, setIdentityMatched] = useState(false);
  const [lguEmploymentConfirmed, setLguEmploymentConfirmed] = useState(false);
  const clearCredentialReview = () => {
    setLguOffice("");
    setLguPosition("");
    setLguReference("");
    setLguVerificationMethod("");
    setCredentialsConfirmed(false);
    setIdentityMatched(false);
    setLguEmploymentConfirmed(false);
  };
  const reviewComplete =
    lguOffice.trim().length >= 3 && lguOffice.trim().length <= 160 &&
    lguPosition.trim().length >= 3 && lguPosition.trim().length <= 120 &&
    lguReference.trim().length >= 5 && lguReference.trim().length <= 160 &&
    lguVerificationMethod.trim().length >= 8 && lguVerificationMethod.trim().length <= 200 &&
    (!lguVerificationMethod.startsWith("Other official source:") || lguVerificationMethod.replace("Other official source:", "").trim().length >= 8) &&
    !!actionTarget?.email && actionTarget.email.length >= 5 &&
    actionTarget?.role === "applicant" && actionTarget?.status === "pending_review" &&
    SJDM_BARANGAYS.includes(actionTarget?.barangay || "") &&
    credentialsConfirmed && identityMatched && lguEmploymentConfirmed;

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

  // LGU staff choose the requested area; programmers verify official appointment only.
  React.useEffect(() => {
    if (!isSuperAdmin) {
      setBarangayRequests([]);
      return;
    }
    return onSnapshot(collection(db, "lguBarangayRequests"), snapshot => {
      setBarangayRequests(snapshot.docs.map(item => ({
        id: item.id,
        ...(item.data() as Omit<BarangayRequest, "id">),
      })));
    }, () => setBarangayRequests([]));
  }, [isSuperAdmin]);

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
      ).sort((a, b) => {
        if (sort === "name_asc") return nameFor(a).localeCompare(nameFor(b));
        if (sort === "name_desc") return nameFor(b).localeCompare(nameFor(a));
        const aTime = timestampValue(a.createdAt || a.adminCreatedAt);
        const bTime = timestampValue(b.createdAt || b.adminCreatedAt);
        return sort === "oldest" ? aTime - bTime : bTime - aTime;
      });
    }, [
      users,
      search,
      filter,
      sort,
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

  const pendingLguApplications = useMemo(() =>
    users.filter(account => account.role === "applicant" && account.status === "pending_review")
      .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)),
  [users]);
  const matchingPendingApplications = useMemo(() => {
    const needle = pendingSearch.trim().toLowerCase();
    if (!needle) return pendingLguApplications;
    return pendingLguApplications.filter(account => [
      nameFor(account),
      account.email,
      account.barangay,
      (account as any).lguOffice,
      (account as any).lguPosition,
      (account as any).appointmentReference,
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [pendingLguApplications, pendingSearch]);
  const pendingTotalPages = Math.max(1, Math.ceil(matchingPendingApplications.length / ADMIN_PAGE_SIZE));
  const safePendingPage = Math.min(pendingPage, pendingTotalPages);
  const pagedPendingApplications = matchingPendingApplications.slice(
    (safePendingPage - 1) * ADMIN_PAGE_SIZE, safePendingPage * ADMIN_PAGE_SIZE
  );

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
      return "Verify Staff and Promote to Admin";
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
      return `Promote ${name} to LGU Admin only after confirming their identity, legitimate LGU employment and official authorization?`;
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
      return "Promote Verified Staff";
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

  const openBarangayReview = (account: UserAccount) => {
    if (!verifySuperAdmin() || account.role !== "admin" || !pendingAreaRequestFor(account)) return;
    setBarangayTarget(account);
    setBarangayVerified(false);
    setBarangayRejectReason("");
    setBarangayError("");
  };
  const closeBarangayReview = () => {
    if (savingUid) return;
    setBarangayTarget(null);
    setBarangayVerified(false);
    setBarangayRejectReason("");
    setBarangayError("");
  };
  const commitBarangayReview = async (approve: boolean) => {
    const verified = verifySuperAdmin();
    const account = barangayTarget;
    const request = account ? pendingAreaRequestFor(account) : undefined;
    if (!verified || !account || !request || account.role !== "admin") return;
    const next = request.desiredBarangay;
    if (approve && (!barangayVerified || !SJDM_BARANGAYS.includes(next) ||
        !!String(account.barangay || "").trim())) {
      setBarangayError("Verify the LGU appointment first. An already assigned area cannot be replaced here.");
      return;
    }
    if (!approve && barangayRejectReason.trim().length < 10) {
      setBarangayError("Enter a rejection reason of at least 10 characters.");
      return;
    }
    setSavingUid(account.id);
    setBarangayError("");
    try {
      const userRef = doc(db, "users", account.id);
      const requestRef = doc(db, "lguBarangayRequests", account.id);
      const [latestUser, latestRequest] = await Promise.all([getDoc(userRef), getDoc(requestRef)]);
      if (!latestUser.exists() || latestUser.data().role !== "admin" ||
          !!String(latestUser.data().barangay || "").trim() ||
          !latestRequest.exists() || latestRequest.data().status !== "pending" ||
          latestRequest.data().uid !== account.id ||
          latestRequest.data().desiredBarangay !== next) {
        throw new Error("Admin profile or area request changed. Review the latest records.");
      }
      const batch = writeBatch(db);
      batch.update(requestRef, {
        status: approve ? "approved" : "rejected",
        reviewedBy: verified.current.uid,
        reviewedAt: serverTimestamp(),
        rejectionReason: approve ? "" : barangayRejectReason.trim(),
      });
      if (approve) batch.update(userRef, {
        barangay: next,
        adminUpdatedBy: verified.current.uid,
        adminUpdatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "adminLogs")), {
        actionType: approve ? "admin_barangay_verified" : "admin_barangay_request_rejected",
        targetType: "user", targetId: account.id,
        adminUid: verified.current.uid,
        adminName: verified.current.displayName || verified.current.email || "Super Admin",
        description: approve
          ? "Verified official LGU request for " + nameFor(account) + ": " + next
          : "Rejected unverified LGU area request for " + nameFor(account),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setBarangayTarget(null);
      setBarangayVerified(false);
    } catch (e: any) {
      setBarangayError(readableAdminError(e));
    } finally {
      setSavingUid(null);
    }
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
          "Verify staff identity and official LGU employment, complete all review fields, and confirm the verification before promoting this applicant to Admin."
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
              Admin Accounts
            </Text>

            <Text
              style={styles.subtitle}
            >
              Review approved LGU administrators, manage access and track changes through the audit log.
            </Text>
          </View>

        </View>

        {!!creationNotice && (
          <Text accessibilityRole="alert" style={{color:"#16654B",fontWeight:"700",marginVertical:8}}>
            {creationNotice}
          </Text>
        )}

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

        <View style={styles.pendingPanel} accessibilityLabel="Pending LGU Admin applications">
          <View style={styles.pendingHeading}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>Pending LGU Admin Applications</Text>
              <Text style={styles.pendingSubtitle}>Review submitted staff information and verify official authorization before granting access.</Text>
            </View>
            <View style={styles.pendingCount}>
              <Text style={styles.pendingCountText}>{pendingLguApplications.length} pending</Text>
            </View>
          </View>
          <View style={styles.pendingSearchBar}>
            <Ionicons name="search-outline" size={17} color="#648476" />
            <TextInput
              value={pendingSearch}
              onChangeText={value => { setPendingSearch(value); setPendingPage(1); setExpandedPendingId(null); }}
              placeholder="Search applicant, email, LGU office or barangay"
              placeholderTextColor="#91A49A"
              style={styles.pendingSearchInput}
              accessibilityLabel="Search pending LGU applications"
            />
          </View>
          <View style={styles.pendingSummary}>
            <Text style={styles.pendingSummaryText}>
              {matchingPendingApplications.length === 0 ? "0 applications" :
                `${(safePendingPage - 1) * ADMIN_PAGE_SIZE + 1}–${Math.min(safePendingPage * ADMIN_PAGE_SIZE, matchingPendingApplications.length)} of ${matchingPendingApplications.length}`}
              {" · 5 per page"}
            </Text>
            <Text style={styles.pendingSummaryText}>Submitted details are not yet verified</Text>
          </View>
          {matchingPendingApplications.length === 0 ? (
            <View style={styles.pendingEmpty}>
              <Ionicons name="checkmark-circle-outline" size={26} color="#1D8C6A" />
              <Text style={styles.pendingEmptyTitle}>{pendingSearch ? "No matching applications" : "No pending LGU applications"}</Text>
              <Text style={styles.pendingSubtitle}>{pendingSearch ? "Try another applicant name or official email." : "New LGU staff requests will appear here for review."}</Text>
            </View>
          ) : pagedPendingApplications.map((account, index) => {
            const expanded = expandedPendingId === account.id;
            const office = String((account as any).lguOffice || "Not submitted");
            const position = String((account as any).lguPosition || "Not submitted");
            const reference = String((account as any).appointmentReference || "Not submitted");
            return (
              <View key={account.id} style={[styles.pendingItem, index % 2 === 1 && styles.pendingAlt]}>
                <View style={styles.pendingRow}>
                  <View style={styles.pendingPerson}>
                    <Text style={styles.pendingName}>{nameFor(account)}</Text>
                    <Text style={styles.pendingMeta} numberOfLines={1}>{account.email || "No official email provided"}</Text>
                  </View>
                  <View style={styles.pendingOffice}>
                    <Text style={styles.pendingColumnTitle}>LGU OFFICE / POSITION</Text>
                    <Text style={styles.pendingValue} numberOfLines={2}>{office} · {position}</Text>
                  </View>
                  <View style={styles.pendingStatus}>
                    <Text style={styles.pendingStatusText}>Pending review</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={(expanded ? "Hide " : "View ") + nameFor(account) + " application credentials"}
                    accessibilityState={{ expanded }}
                    style={styles.pendingViewButton}
                    onPress={() => setExpandedPendingId(expanded ? null : account.id)}
                  >
                    <Text style={styles.pendingViewText}>{expanded ? "Hide" : "View Credentials"}</Text>
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#087354" />
                  </TouchableOpacity>
                </View>
                {expanded ? (
                  <View style={styles.pendingDetails}>
                    <Text style={styles.pendingDetailsHeading}>SUBMITTED LGU STAFF INFORMATION · NOT YET VERIFIED</Text>
                    <View style={styles.pendingDetailsGrid}>
                      {[
                        { label: "Applicant", value: nameFor(account) },
                        { label: "Official Email", value: account.email || "Not submitted" },
                        { label: "Office / Department", value: office },
                        { label: "Position / Designation", value: position },
                        { label: "Assigned Barangay", value: account.barangay || "Not submitted" },
                        { label: "Appointment Reference", value: reference },
                      ].map(field => (
                        <View key={field.label} style={styles.pendingDetailCell}>
                          <Text style={styles.pendingDetailLabel}>{field.label}</Text>
                          <Text style={styles.pendingDetailValue} selectable>{field.value}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.pendingReviewFooter}>
                      <Text style={styles.pendingReviewNote}>
                        Submitted information is self-declared. Confirm employment, identity and appointment with an independent LGU source. Never request passwords.
                      </Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={"Begin LGU credential verification for " + nameFor(account)}
                        disabled={!!savingUid}
                        style={[styles.pendingReviewButton, !!savingUid && { opacity: 0.5 }]}
                        onPress={() => openAdminAction("promote", account)}
                      >
                        <Ionicons name="shield-checkmark-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.pendingReviewButtonText}>Verify & Review Access</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={styles.pendingPager}>
            <ListPagination
              page={safePendingPage}
              total={matchingPendingApplications.length}
              pageSize={ADMIN_PAGE_SIZE}
              onChange={next => { setPendingPage(next); setExpandedPendingId(null); }}
            />
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
              "Search Admin name, email, barangay or phone"
            }
            placeholderTextColor="#94A3B8"
          />
        </View>

        <SuperAdminFilterSort
          accessibilityContext="Admin accounts"
          filterValue={filter}
          filterOptions={[
            { value: "all", label: "All Admins" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
          ]}
          onFilterChange={setFilter}
          sortValue={sort}
          sortOptions={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "name_asc", label: "Name A–Z" },
            { value: "name_desc", label: "Name Z–A" },
          ]}
          onSortChange={setSort}
        />

        <View style={styles.directoryPanel}>
          <View style={styles.dirHeading}>
            <View style={{flex:1}}>
              <Text style={styles.dirTitle}>Administrator Directory</Text>
              <Text style={styles.dirNote}>Authorized accounts · Status and access management</Text>
            </View>
            <Text style={styles.dirTag}>{adminAccounts.length} records</Text>
          </View>
          <View style={styles.dirResults}>
            <Text style={styles.dirNote}>{adminAccounts.length
              ? `Showing ${(safeAdminPage-1)*ADMIN_PAGE_SIZE+1}–${Math.min(safeAdminPage*ADMIN_PAGE_SIZE,adminAccounts.length)} of ${adminAccounts.length}`
              : "Showing 0 of 0"} records · 5 per page</Text>
            <Text style={styles.dirNote}>Page {safeAdminPage} of {adminPageCount}</Text>
          </View>
          {!compactDirectory && adminAccounts.length > 0 && <View style={styles.dirColumns}>
            {(["ADMINISTRATOR","BARANGAY","PHONE","STATUS"] as const).map((label,i)=>
              <Text key={label} style={[styles.dirColumn,{flex:i===0?2.3:1}]}>{label}</Text>)}
            <Text style={[styles.dirColumn,{width:100,textAlign:"right"}]}>ACTION</Text>
          </View>}
          {adminAccounts.length === 0 ? <View style={styles.dirEmpty}>
            <Ionicons name="people-outline" size={28} color="#78998B"/>
            <Text style={styles.dirTitle}>No matching Admin accounts</Text>
            <Text style={styles.dirNote}>Change your search or filter to see accounts.</Text>
          </View> : pagedAdminAccounts.map((account,index)=>{
            const suspended = account.status === "suspended" || account.adminStatus === "suspended";
            const isSaving = savingUid === account.id;
            const expanded = expandedAdminId === account.id;
            return <View key={account.id} style={[styles.dirRecord,index%2===1 && {backgroundColor:"#FCFDFC"}]}>
              <View style={[styles.dirRow,compactDirectory && {flexWrap:"wrap"}]}>
                <View style={[styles.dirPerson,!compactDirectory && {flex:2.3}]}>
                  <View style={styles.dirAvatar}><Text style={styles.dirAvatarText}>{nameFor(account).charAt(0).toUpperCase()}</Text></View>
                  <View style={{flex:1,minWidth:0}}>
                    <Text style={styles.dirName} numberOfLines={1}>{nameFor(account)}</Text>
                    <Text style={styles.dirNote} numberOfLines={1}>{account.email || "No email"}</Text>
                    {compactDirectory && <Text style={styles.dirNote}>{account.barangay || "Barangay not assigned"}</Text>}
                  </View>
                </View>
                {!compactDirectory && <>
                  <Text style={[styles.dirValue,{flex:1}]} numberOfLines={2}>{account.barangay || "Not assigned"}</Text>
                  <Text style={[styles.dirValue,{flex:1}]} numberOfLines={1}>{account.phoneNumber || "—"}</Text>
                </>}
                <View style={!compactDirectory && {flex:1}}>
                  <View style={[styles.dirStatus,{backgroundColor:suspended?"#FFF3DF":"#E0F7EA"}]}>
                    <Ionicons name="ellipse" size={7} color={suspended?"#B8750D":"#13865F"}/>
                    <Text style={[styles.dirStatusText,{color:suspended?"#986008":"#08704F"}]}>{suspended?"SUSPENDED":"ACTIVE"}</Text>
                  </View>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={(expanded?"Close ":"Manage ")+nameFor(account)}
                  accessibilityState={{expanded}} style={styles.dirManage}
                  onPress={()=>setExpandedAdminId(expanded?null:account.id)}>
                  <Text style={styles.dirManageText}>{expanded?"Close":"Manage"}</Text>
                  <Ionicons name={expanded?"chevron-up":"chevron-down"} size={14} color="#08795B"/>
                </TouchableOpacity>
              </View>
              {expanded && <View style={styles.dirExpanded}>
                <View style={{flex:1,minWidth:210}}>
                  <Text style={styles.dirName}>Admin Access Controls</Text>
                  <Text style={styles.dirNote}>Administrator · {account.barangay || "No barangay"} · {account.phoneNumber || "No phone"}</Text>
                  <Text style={styles.dirNote}>Actions require confirmation and are recorded in the audit log.</Text>
                </View>
                <View style={{flexDirection:"row",flexWrap:"wrap",gap:9}}>
                  {pendingAreaRequestFor(account) ? (
                    <TouchableOpacity disabled={isSaving} accessibilityRole="button"
                      accessibilityLabel={"Review submitted barangay request for " + nameFor(account)}
                      style={styles.dirAction} onPress={() => openBarangayReview(account)}>
                      <Ionicons name="shield-checkmark-outline" size={15} color="#087C5E"/>
                      <Text style={styles.dirActionText}>Verify Area Request</Text>
                    </TouchableOpacity>
                  ) : !SJDM_BARANGAYS.includes(account.barangay || "") ? (
                    <Text style={styles.dirNote}>Awaiting official area request from LGU Admin</Text>
                  ) : null}
                  <TouchableOpacity disabled={isSaving} style={styles.dirAction}
                    onPress={()=>openAdminAction(suspended?"activate":"suspend",account)}>
                    <Ionicons name={suspended?"checkmark-circle-outline":"pause-circle-outline"} size={15} color="#087C5E"/>
                    <Text style={styles.dirActionText}>{isSaving?"Saving...":suspended?"Activate":"Suspend"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={isSaving} style={[styles.dirAction,{borderColor:"#F2D5D0"}]}
                    onPress={()=>openAdminAction("revoke",account)}>
                    <Ionicons name="shield-outline" size={15} color="#A84C46"/>
                    <Text style={[styles.dirActionText,{color:"#A84C46"}]}>Remove Admin</Text>
                  </TouchableOpacity>
                </View>
              </View>}
            </View>;
          })}
          {adminPageCount>=1 && <View style={styles.dirPaging}>
            <TouchableOpacity disabled={safeAdminPage<=1} accessibilityLabel="Previous Admin accounts page"
              style={[styles.dirPage,safeAdminPage<=1 && {opacity:0.35}]}
              onPress={()=>{setAdminPage(Math.max(1,safeAdminPage-1));setExpandedAdminId(null);}}>
              <Text style={styles.dirPageText}>Previous</Text>
            </TouchableOpacity>
            {Array.from({length:adminPageCount},(_,i)=>i+1).filter(n=>adminPageCount<=7||n===1||n===adminPageCount||Math.abs(n-safeAdminPage)<=1).map(n=>
              <TouchableOpacity key={n} accessibilityRole="button" accessibilityLabel={`Admin page ${n}`}
                style={[styles.dirPage,{minWidth:36},n===safeAdminPage&&{backgroundColor:"#087F63",borderColor:"#087F63"}]}
                onPress={()=>{setAdminPage(n);setExpandedAdminId(null);}}>
                <Text style={[styles.dirPageText,n===safeAdminPage&&{color:"#FFFFFF"}]}>{n}</Text>
              </TouchableOpacity>)}
            <TouchableOpacity disabled={safeAdminPage>=adminPageCount} accessibilityLabel="Next Admin accounts page"
              style={[styles.dirPage,safeAdminPage>=adminPageCount && {opacity:0.35}]}
              onPress={()=>{setAdminPage(Math.min(adminPageCount,safeAdminPage+1));setExpandedAdminId(null);}}>
              <Text style={styles.dirPageText}>Next</Text>
            </TouchableOpacity>
          </View>}
        </View>
      </ScrollView>

      <Modal visible={!!barangayTarget} transparent animationType="fade"
        onRequestClose={closeBarangayReview}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard,{width:"94%",maxWidth:620,maxHeight:viewportHeight*0.87,padding:20}]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12,paddingBottom:12}}>
              <Text style={styles.modalTitle}>Review LGU-Submitted Barangay</Text>
              <Text style={styles.dirNote}>LGU Admin: {barangayTarget ? nameFor(barangayTarget) : ""}</Text>
              <Text style={styles.dirNote}>Current account area: {barangayTarget?.barangay || "Not verified"}</Text>
              <Text style={{fontWeight:"700",color:"#173D32",fontSize:16}}>
                Requested area: {barangayTarget ? pendingAreaRequestFor(barangayTarget)?.desiredBarangay || "None" : "None"}
              </Text>
              <Text style={styles.reviewHelp}>Office: {barangayTarget ? pendingAreaRequestFor(barangayTarget)?.office || "Not submitted" : ""}</Text>
              <Text style={styles.reviewHelp}>Position: {barangayTarget ? pendingAreaRequestFor(barangayTarget)?.position || "Not submitted" : ""}</Text>
              <Text style={styles.reviewHelp}>Appointment reference: {barangayTarget ? pendingAreaRequestFor(barangayTarget)?.appointmentReference || "Not submitted" : ""}</Text>
              <Text style={{color:"#475569",lineHeight:20}}>
                Confirm the applicant's LGU appointment and the exact area independently with an official source.
                Programmers can only approve or reject the requested area; no barangay picker exists here.
              </Text>
              <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:barangayVerified}}
                onPress={()=>setBarangayVerified(v=>!v)}
                style={{flexDirection:"row",alignItems:"flex-start",gap:9,paddingVertical:6}}>
                <Ionicons name={barangayVerified?"checkbox":"square-outline"} size={22} color="#08795B"/>
                <Text style={{flex:1,lineHeight:20,color:"#334155"}}>
                  I independently verified the official LGU appointment, position and requested barangay.
                </Text>
              </TouchableOpacity>
              <Text style={styles.inputLabel}>REJECTION REASON (if rejecting)</Text>
              <TextInput style={styles.searchInput} value={barangayRejectReason}
                onChangeText={setBarangayRejectReason} maxLength={300}
                placeholder="Which official details could not be verified?" />
              {!!barangayError && <Text accessibilityRole="alert" style={{color:"#B91C1C"}}>{barangayError}</Text>}
              <View style={{flexDirection:"row",justifyContent:"flex-end",gap:10,flexWrap:"wrap"}}>
                <TouchableOpacity style={[styles.dirAction,{padding:11}]} disabled={!!savingUid} onPress={closeBarangayReview}>
                  <Text style={styles.dirActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button"
                  disabled={!!savingUid||barangayRejectReason.trim().length<10}
                  style={[styles.dirAction,{padding:11}]}
                  onPress={()=>void commitBarangayReview(false)}>
                  <Text style={styles.dirActionText}>Reject Request</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={!!savingUid||!barangayVerified}
                  onPress={()=>void commitBarangayReview(true)}
                  style={[styles.dirAction,{padding:11,backgroundColor:"#08795B",opacity:(!barangayVerified||!!savingUid)?0.5:1}]}>
                  <Text style={{fontWeight:"700",color:"#FFFFFF"}}>{savingUid?"Saving...":"Approve Verified Area"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
            style={[styles.confirmCard, { maxWidth: actionType === "promote" ? 880 : 500, maxHeight: viewportHeight * 0.9, padding: viewportWidth < 720 ? 16 : 26 }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
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
                <Text style={styles.reviewKicker}>STEP 2 OF 3 · VERIFY LGU CREDENTIALS</Text>
                <Text style={styles.reviewHelp}>
                  Compare the applicant's information with an independently obtained official LGU source.
                  Completing this review is required before activating any Admin account.
                </Text>
                {actionTarget?.role === "applicant" && (
                  <View style={styles.applicantDetails}>
                    <Text style={styles.reviewLabel}>Applicant details · Not yet verified</Text>
                    <Text style={styles.reviewHelp}>Name: {nameFor(actionTarget)}</Text>
                    <Text style={styles.reviewHelp}>Email: {actionTarget.email || "Not provided"}</Text>
                    <Text style={styles.reviewHelp}>Office: {String((actionTarget as any).lguOffice || "Not provided")}</Text>
                    <Text style={styles.reviewHelp}>Position: {String((actionTarget as any).lguPosition || "Not provided")}</Text>
                    <Text style={styles.reviewHelp}>Barangay: {String((actionTarget as any).barangay || "Not provided")}</Text>
                    <Text style={styles.reviewHelp}>Appointment reference: {String((actionTarget as any).appointmentReference || "Not provided")}</Text>
                  </View>
                )}
                <View style={styles.reviewScroll}>
                  {([
                    { label: "LGU Office / Department", value: lguOffice, onChange: setLguOffice, placeholder: "Official department", maxLength: 160 },
                    { label: "Official Position", value: lguPosition, onChange: setLguPosition, placeholder: "Authorized staff role", maxLength: 120 },
                    { label: "Verification Reference", value: lguReference, onChange: setLguReference, placeholder: "Non-sensitive official reference", maxLength: 160 },
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
                  <View style={styles.reviewField}>
                    <Text style={styles.reviewLabel}>Independent LGU verification method</Text>
                    <Text style={styles.reviewHelp}>Select the actual official confirmation method. A face scan or ID image alone does not establish LGU employment.</Text>
                    {[
                      "In-person verification at LGU office",
                      "Official LGU phone callback",
                      "Official LGU email confirmation",
                      "Official appointment records verification",
                      "Others — specify independently verified source",
                    ].map((option) => {
                      const isOther = option.startsWith("Others");
                      const otherSelected = !!lguVerificationMethod && ![
                        "In-person verification at LGU office",
                        "Official LGU phone callback",
                        "Official LGU email confirmation",
                        "Official appointment records verification",
                      ].includes(lguVerificationMethod);
                      return (
                        <TouchableOpacity key={option} accessibilityRole="radio"
                          accessibilityState={{ checked: isOther ? otherSelected : lguVerificationMethod === option }}
                          disabled={!!savingUid}
                          style={[styles.confirmReview, (isOther ? otherSelected : lguVerificationMethod === option) && { borderColor: "#158060", backgroundColor: "#EFFAF4" }]}
                          onPress={() => setLguVerificationMethod(isOther ? "Other official source: " : option)}>
                          <Ionicons name={(isOther ? otherSelected : lguVerificationMethod === option) ? "radio-button-on" : "radio-button-off"} size={20} color="#23765F" />
                          <Text style={styles.confirmReviewText}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {!!lguVerificationMethod && ![
                      "In-person verification at LGU office",
                      "Official LGU phone callback",
                      "Official LGU email confirmation",
                      "Official appointment records verification",
                    ].includes(lguVerificationMethod) && (
                      <TextInput accessibilityLabel="Specify independent official verification"
                        placeholder="Describe the official source and what was confirmed"
                        placeholderTextColor="#8A9C94" maxLength={200}
                        value={lguVerificationMethod.replace(/^Other official source: /, "")}
                        onChangeText={value => setLguVerificationMethod("Other official source: " + value)}
                        editable={!savingUid} style={styles.reviewInput} />
                    )}
                  </View>
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: identityMatched }}
                    style={styles.confirmReview}
                    onPress={() => setIdentityMatched(v => !v)}
                    disabled={!!savingUid}
                  >
                    <Ionicons name={identityMatched ? "checkbox" : "square-outline"} size={23} color="#23765F" />
                    <Text style={styles.confirmReviewText}>
                      I matched the applicant's identity and submitted details with the independently verified LGU staff information.
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: lguEmploymentConfirmed }}
                    style={styles.confirmReview}
                    onPress={() => setLguEmploymentConfirmed(v => !v)}
                    disabled={!!savingUid}
                  >
                    <Ionicons name={lguEmploymentConfirmed ? "checkbox" : "square-outline"} size={23} color="#23765F" />
                    <Text style={styles.confirmReviewText}>
                      I confirmed current LGU employment, appointment and authority directly from an official source.
                    </Text>
                  </TouchableOpacity>
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
                </View>
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

            </ScrollView>
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

    directoryPanel:{backgroundColor:"#FFFFFF",borderRadius:12,borderWidth:1,borderColor:"#DCE9E1",overflow:"hidden"},
    dirHeading:{flexDirection:"row",alignItems:"center",gap:12,padding:18},
    dirTitle:{fontSize:16,fontWeight:"800",color:"#173D32"},
    dirNote:{color:"#6A8579",fontSize:11,marginTop:3,lineHeight:17},
    dirTag:{fontSize:11,fontWeight:"800",color:"#087859",backgroundColor:"#E9F7EF",paddingHorizontal:11,paddingVertical:8,borderRadius:9},
    dirResults:{flexDirection:"row",justifyContent:"space-between",flexWrap:"wrap",gap:8,padding:14,borderTopWidth:1,borderColor:"#E5EEE9"},
    dirColumns:{flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#F0F5F2",paddingHorizontal:16,paddingVertical:12,borderTopWidth:1,borderBottomWidth:1,borderColor:"#DFECE3"},
    dirColumn:{fontSize:10,fontWeight:"800",color:"#607B6F",letterSpacing:0.5},
    dirEmpty:{padding:36,alignItems:"center",gap:8},
    dirRecord:{borderBottomWidth:1,borderColor:"#E6EEE8"},
    dirRow:{paddingHorizontal:16,paddingVertical:13,flexDirection:"row",alignItems:"center",gap:12},
    dirPerson:{flexDirection:"row",alignItems:"center",gap:10,flex:1,minWidth:0},
    dirAvatar:{width:36,height:36,borderRadius:11,backgroundColor:"#E2F5EB",justifyContent:"center",alignItems:"center"},
    dirAvatarText:{fontWeight:"900",fontSize:14,color:"#128362"},
    dirName:{fontSize:12,fontWeight:"800",color:"#194534"},
    dirValue:{fontSize:11,color:"#557163",lineHeight:18},
    dirStatus:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",gap:6,borderRadius:99,paddingVertical:7,paddingHorizontal:9},
    dirStatusText:{fontSize:10,fontWeight:"900"},
    dirManage:{width:100,minHeight:36,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,borderWidth:1,borderColor:"#D1E8DC",backgroundColor:"#F4FAF6",borderRadius:9},
    dirManageText:{fontSize:11,fontWeight:"800",color:"#08795B"},
    dirExpanded:{padding:16,backgroundColor:"#F5FAF7",borderTopWidth:1,borderColor:"#E0ECE4",flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:14},
    dirAction:{minHeight:39,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:13,borderWidth:1,borderColor:"#D0E7DA",borderRadius:9,backgroundColor:"#FFFFFF"},
    dirActionText:{color:"#087C5E",fontSize:11,fontWeight:"800"},
    dirPaging:{flexDirection:"row",justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap",padding:15,gap:7},
    dirPage:{minHeight:36,paddingHorizontal:12,borderWidth:1,borderColor:"#D5E7DC",borderRadius:8,backgroundColor:"#FFFFFF",justifyContent:"center",alignItems:"center"},
    dirPageText:{fontSize:11,fontWeight:"800",color:"#08785C"},

    credentialReview: { marginTop: 20, marginBottom: 12, borderTopWidth: 1, borderColor: "#E0EAE4", paddingTop: 19 },
    applicantDetails: { padding: 17, marginTop: 14, marginBottom: 16, backgroundColor: "#F3F9F6", borderWidth: 1, borderColor: "#DCEBE2", borderRadius: 13 },
    reviewKicker: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4, color: "#247459" },
    reviewHelp: { color: "#556E61", fontSize: 13, lineHeight: 21, marginTop: 8, marginBottom: 12 },
    reviewScroll: { width: "100%" },
    reviewField: { marginBottom: 17 },
    reviewLabel: { fontSize: 13, fontWeight: "700", color: "#294C3C", marginBottom: 7 },
    reviewInput: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D5E3DB", borderRadius: 11, paddingHorizontal: 14, minHeight: 50, fontSize: 14, color: "#173D32" },
    confirmReview: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginVertical: 5, borderWidth: 1, borderColor: "#E0EBE4", padding: 13, backgroundColor: "#FAFCFB", borderRadius: 12 },
    confirmReviewText: { flex: 1, color: "#355749", fontSize: 13, lineHeight: 20 },
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
      maxWidth: 880,
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
      fontSize: 26,
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
    pendingPanel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E9DF",
      borderRadius: 12, overflow: "hidden", marginBottom: 18 },
    pendingHeading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap",
      paddingHorizontal: 17, paddingVertical: 16, gap: 12, backgroundColor: "#F5FBF7" },
    pendingTitle: { fontSize: 16, fontWeight: "900", color: "#163C31" },
    pendingSubtitle: { marginTop: 4, fontSize: 11, lineHeight: 17, color: "#648071" },
    pendingCount: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7,
      backgroundColor: "#FFF0D4" },
    pendingCountText: { fontSize: 11, fontWeight: "900", color: "#865C15" },
    pendingSearchBar: { minHeight: 42, marginHorizontal: 16, marginTop: 13,
      paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE1", borderRadius: 8 },
    pendingSearchInput: { flex: 1, color: "#254B3B", fontSize: 12, minHeight: 38 },
    pendingSummary: { flexDirection: "row", justifyContent: "space-between",
      flexWrap: "wrap", gap: 7, paddingHorizontal: 16, paddingVertical: 12 },
    pendingSummaryText: { fontSize: 10.5, color: "#6E8779" },
    pendingEmpty: { minHeight: 112, padding: 18, alignItems: "center",
      justifyContent: "center", borderTopWidth: 1, borderColor: "#E8F0EA" },
    pendingEmptyTitle: { fontSize: 13, fontWeight: "800", marginTop: 5, color: "#315F4D" },
    pendingItem: { borderTopWidth: 1, borderColor: "#E6EEE8" },
    pendingAlt: { backgroundColor: "#FCFEFC" },
    pendingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 12, gap: 11 },
    pendingPerson: { flex: 2.3, minWidth: 170 },
    pendingName: { fontSize: 12, fontWeight: "900", color: "#163D30" },
    pendingMeta: { fontSize: 10.5, color: "#698275", marginTop: 4 },
    pendingOffice: { flex: 1.7, minWidth: 160 },
    pendingColumnTitle: { fontSize: 9.5, color: "#7A9385", fontWeight: "900", marginBottom: 4 },
    pendingValue: { color: "#345849", fontSize: 11, lineHeight: 16 },
    pendingStatus: { backgroundColor: "#FFF0D9", borderRadius: 7,
      paddingHorizontal: 9, paddingVertical: 6, alignSelf: "center" },
    pendingStatusText: { color: "#956414", fontSize: 10, fontWeight: "900" },
    pendingViewButton: { minHeight: 35, minWidth: 128, borderWidth: 1,
      borderColor: "#BCDCCB", backgroundColor: "#F4FBF7", borderRadius: 8,
      paddingHorizontal: 10, alignItems: "center", justifyContent: "center",
      flexDirection: "row", gap: 5 },
    pendingViewText: { fontSize: 10.5, fontWeight: "900", color: "#087354" },
    pendingDetails: { borderTopWidth: 1, borderColor: "#DFEBE3",
      backgroundColor: "#F5FAF7", padding: 17 },
    pendingDetailsHeading: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5,
      color: "#2D6A50", marginBottom: 12 },
    pendingDetailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    pendingDetailCell: { flexGrow: 1, flexBasis: "31%", minWidth: 170,
      padding: 12, borderRadius: 8, borderWidth: 1,
      borderColor: "#E1ECE5", backgroundColor: "#FFFFFF" },
    pendingDetailLabel: { fontSize: 10, fontWeight: "800", color: "#72877C" },
    pendingDetailValue: { fontSize: 12, marginTop: 4, color: "#294D3D", lineHeight: 17 },
    pendingReviewFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12, marginTop: 15 },
    pendingReviewNote: { flex: 1, minWidth: 210, fontSize: 11, lineHeight: 17,
      color: "#607A6B" },
    pendingReviewButton: { minHeight: 42, paddingHorizontal: 14,
      backgroundColor: "#0A7F61", borderRadius: 8,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    pendingReviewButtonText: { fontSize: 11.5, color: "#FFFFFF", fontWeight: "900" },
    pendingPager: { paddingHorizontal: 13, paddingVertical: 9, borderTopWidth: 1,
      borderColor: "#E7F0EA" },
  });