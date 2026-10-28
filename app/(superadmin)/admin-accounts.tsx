import ListPagination from "../../components/ui/ListPagination";
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
  useWindowDimensions,
  View,
} from "react-native";

import LguApplicantEvidencePanel from "../../components/admin/LguApplicantEvidencePanel";
import LguStaffPrivacyRequestsPanel from "../../components/admin/LguStaffPrivacyRequestsPanel";

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
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const compact = viewportWidth < 780;
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
  const [applicantPage, setApplicantPage] = useState(1);
  const [applicationSearch, setApplicationSearch] = useState("");
  React.useEffect(() => { setApplicantPage(1); }, [applicationSearch]);
  const ADMIN_PAGE_SIZE = 5;
  React.useEffect(() => { setAdminPage(1); }, [search, filter]);

  const [
    showAddAdmin,
    setShowAddAdmin,
  ] = useState(false);


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
  const [evidenceReady, setEvidenceReady] = useState(false);
  const [credentialsConfirmed, setCredentialsConfirmed] = useState(false);
  const [identityMatched, setIdentityMatched] = useState(false);
  // Until validated active liveness exists, require a human observation of
  // the living applicant AND the original government-issued ID in person.
  const [inPersonIdentityConfirmed, setInPersonIdentityConfirmed] = useState(false);
  const [lguEmploymentConfirmed, setLguEmploymentConfirmed] = useState(false);
  const clearCredentialReview = () => {
    setLguOffice("");
    setLguPosition("");
    setLguReference("");
    setLguVerificationMethod("");
    setEvidenceReady(false);
    setCredentialsConfirmed(false);
    setIdentityMatched(false);
    setInPersonIdentityConfirmed(false);
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
    credentialsConfirmed && identityMatched && lguEmploymentConfirmed && evidenceReady &&
    inPersonIdentityConfirmed;

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

          AppAlert.alert(
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

  const pendingTotal = users.filter(account =>
    account.role === "applicant" && account.status === "pending_review"
  ).length;
  const applicationQuery = applicationSearch.trim().toLowerCase();
  const pendingLguApplications = users
    .filter(account => account.role === "applicant" && account.status === "pending_review")
    .filter(account => !applicationQuery || [
      nameFor(account), account.email,
      (account as any).lguOffice, (account as any).lguPosition,
      (account as any).appointmentReference,
    ].filter(Boolean).join(" ").toLowerCase().includes(applicationQuery))
    .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
  const applicantPageCount = Math.max(1, Math.ceil(pendingLguApplications.length / 5));
  const safeApplicantPage = Math.min(applicantPage, applicantPageCount);
  const pagedLguApplications = pendingLguApplications.slice(
    (safeApplicantPage - 1) * 5, safeApplicantPage * 5
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
        item.status === "approved" &&
        item.adminStatus !== "suspended"
    ).length;

  const suspendedAdmins =
    totalAdmins -
    activeAdmins;

  const verifySuperAdmin =
    () => {
      if (!sessionUser) {
        AppAlert.alert(
          "Session Error",
          "Please sign in again."
        );

        return null;
      }

      if (
        !isSuperAdmin ||
        !sessionProfile
      ) {
        AppAlert.alert(
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
            identityPresenceMethod: "in_person_original_government_id_review",
            identityPresenceConfirmed: true,
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
          style={[styles.header, compact && styles.headerCompact]}
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
              style={[styles.title, compact && styles.titleCompact]}
            >
              LGU Staff & Admin Accounts
            </Text>

            <Text
              style={styles.subtitle}
            >
              Review submitted LGU staff information first, verify identity and official appointment, then promote eligible staff to LGU Admin. Manage existing Admin access below.
            </Text>
          </View>

        </View>

        <View style={styles.accessFlow}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.headingIcon}><Ionicons name="git-network-outline" size={20} color="#087A62" /></View>
            <View style={styles.sectionHeadingText}>
              <Text style={styles.accessFlowTitle}>LGU STAFF VERIFICATION FLOW</Text>
              <Text style={styles.sectionHeading}>Three-step credential verification</Text>
            </View>
          </View>
          <View style={[styles.accessFlowSteps, compact && styles.accessFlowStepsCompact]}>
            {([
              { number: "01", title: "Receive staff application", description: "Receive the staff-owned account and its submitted evidence." },
              { number: "02", title: "Verify official LGU credentials", description: "Verify original ID, employment and appointment authority." },
              { number: "03", title: "Promote to Admin & record audit", description: "Grant LGU Admin permissions with a recorded audit event." },
            ] as const).map(step => (
              <View key={step.number} style={[styles.accessStep, compact && styles.accessStepCompact]}>
                <View style={styles.stepNumberBox}><Text style={styles.stepNumber}>{step.number}</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.flowNotice}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#23765F" />
            <Text style={styles.flowHint}>Only independently verified LGU personnel may receive Admin access. Applications remain restricted until approved. No automatic identity or government ID authenticity claims.</Text>
          </View>
        </View>

        <View style={styles.applicationPanel}>
          <View style={[styles.sectionTitleRow, compact && styles.sectionTitleRowCompact]}>
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionEyebrow}>LGU STAFF ONBOARDING</Text>
              <Text style={styles.sectionHeading}>LGU Staff Applications</Text>
              <Text style={styles.sectionDescription}>Review genuine staff submissions, confirm appointment details independently and record each approval.</Text>
            </View>
            <View style={styles.pendingBadge}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingBadgeText}>{pendingTotal} pending</Text>
            </View>
          </View>
          <View style={styles.applicationSearch}>
            <Ionicons name="search-outline" size={19} color="#719187" />
            <TextInput
              accessibilityLabel="Search pending LGU staff applications"
              placeholder="Search applicant, LGU office or reference"
              placeholderTextColor="#8CA79B"
              style={styles.applicationSearchInput}
              value={applicationSearch}
              onChangeText={setApplicationSearch}
              autoCapitalize="none"
            />
            {!!applicationSearch && <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear applicant search"
              onPress={() => setApplicationSearch("")}
              style={styles.clearSearch}>
              <Ionicons name="close-circle" size={19} color="#698579" />
            </TouchableOpacity>}
          </View>
          {pendingLguApplications.length === 0 ? (
            <View style={styles.applicationEmpty}>
              <Ionicons name={applicationSearch ? "search-outline" : "checkmark-done-outline"} size={27} color="#548D76" />
              <Text style={styles.applicationEmptyTitle}>{applicationSearch ? "No matching applications" : "No pending applications"}</Text>
              <Text style={styles.applicationEmptyText}>{applicationSearch ? "Try a different name, office or reference." : "New LGU staff applications will appear here after submission."}</Text>
            </View>
          ) : pagedLguApplications.map(account => (
            <View key={account.id} style={[styles.applicationRow, compact && styles.applicationRowCompact]}>
              <View style={styles.applicantAvatar}>
                <Text style={styles.applicantAvatarText}>{nameFor(account).charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.applicantBody}>
                <Text style={styles.applicantName} numberOfLines={2}>{nameFor(account)}</Text>
                <Text style={styles.applicantEmail} selectable numberOfLines={2}>{account.email || "Email not provided"}</Text>
                <View style={styles.applicantMetaRow}>
                  <Ionicons name="business-outline" size={13} color="#698779" />
                  <Text style={styles.applicantMetaText}>{String((account as any).lguOffice || "Office not provided")} · {String((account as any).lguPosition || "Position not provided")}</Text>
                </View>
                <Text style={styles.applicantReference}>Appointment reference: {String((account as any).appointmentReference || "Not provided")}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={"Review LGU credentials for " + nameFor(account)}
                style={[styles.reviewApplicationButton, compact && styles.reviewApplicationButtonCompact]}
                onPress={() => openAdminAction("promote",account)}>
                <Text style={styles.reviewApplicationText}>Review application</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}
          <ListPagination page={safeApplicantPage} total={pendingLguApplications.length} pageSize={ADMIN_PAGE_SIZE} onChange={setApplicantPage} />
        </View>

        {/* This is part of the existing Super Admin staff workspace, not a separate module. */}
        <LguStaffPrivacyRequestsPanel/>

        <View style={[styles.statsRow, compact && styles.statsRowCompact]}>
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
                    "#E4F5ED",
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={22}
                color="#087A62"
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
                    "#E1F7ED",
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color="#12866A"
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
                    "#FFF4DD",
                },
              ]}
            >
              <Ionicons
                name="pause-circle-outline"
                size={22}
                color="#A66C23"
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
        <ListPagination page={safeAdminPage} total={adminAccounts.length} pageSize={ADMIN_PAGE_SIZE} onChange={setAdminPage} />
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
            style={[styles.confirmCard, { maxWidth: actionType === "promote" ? 850 : 500, maxHeight: viewportHeight * 0.92, padding: compact ? 17 : 24 }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator persistentScrollbar contentContainerStyle={styles.confirmScrollContent}>
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
                <View style={styles.verificationHeading}>
                  <View style={styles.verificationHeadingIcon}><Ionicons name="shield-checkmark-outline" size={20} color="#087A62" /></View>
                  <View style={styles.verificationHeadingContent}>
                    <Text style={styles.verificationTitle}>Independent staff authorization</Text>
                    <Text style={styles.verificationSubtitle}>Human credential review · Mandatory before access is granted</Text>
                  </View>
                </View>
                <LguApplicantEvidencePanel uid={actionTarget?.id || ""} onReady={setEvidenceReady} />
                <Text style={styles.reviewKicker}>STEP 2 OF 3 · VERIFY LGU CREDENTIALS</Text>
                <Text style={styles.reviewHelp}>
                  Confirm employment, appointment and authority with the official LGU office or official records, using contact details obtained independently of the applicant.
                  Submitted documents or ID images alone are insufficient. If official confirmation is unavailable, keep the application pending.
                  This is a manual review, not an automated National ID authenticity, facial recognition or liveness check. Without validated active liveness, a supervised in-person examination of the original ID and applicant is mandatory for approval.
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
                <View style={[styles.reviewScroll, !compact && styles.reviewScrollWide]}>
                  {([
                    { label: "LGU Office / Department", value: lguOffice, onChange: setLguOffice, placeholder: "Official department", maxLength: 160 },
                    { label: "Official Position", value: lguPosition, onChange: setLguPosition, placeholder: "Authorized staff role", maxLength: 120 },
                    { label: "Verification Reference", value: lguReference, onChange: setLguReference, placeholder: "Non-sensitive official reference", maxLength: 160 },
                  ] as const).map((field) => (
                    <View key={field.label} style={[styles.reviewField, !compact && styles.reviewFieldWide, field.label === "Verification Reference" && styles.reviewFieldFull]}>
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
                  <View style={[styles.reviewField, styles.reviewFieldFull]}>
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
                  <Text style={[styles.reviewLabel, styles.reviewChecksHeading]}>Required reviewer confirmations</Text>
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
                    accessibilityState={{ checked: inPersonIdentityConfirmed }}
                    style={styles.confirmReview}
                    onPress={() => setInPersonIdentityConfirmed(v => !v)}
                    disabled={!!savingUid}
                  >
                    <Ionicons name={inPersonIdentityConfirmed ? "checkbox" : "square-outline"} size={23} color="#23765F" />
                    <Text style={styles.confirmReviewText}>
                      I personally observed this applicant in person, inspected the original government-issued ID, and compared the portrait with the applicant's face. A photo upload or video call alone does not satisfy this confirmation.
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
                      I independently confirmed current LGU employment, appointment and authority with the official LGU office or records, using independently obtained contact details.
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
                <View style={styles.reviewPrivacyNotice}>
                  <Ionicons name="lock-closed-outline" color="#23765F" size={16} />
                  <Text style={styles.reviewHint}>Review stores only the authorized reference and reviewer. No applicant passwords or ID photos are copied into approval logs.</Text>
                </View>
                <View style={[styles.reviewStatus, reviewComplete && styles.reviewStatusReady]}>
                  <Ionicons name={reviewComplete ? "checkmark-circle-outline" : "information-circle-outline"} size={20} color={reviewComplete ? "#087D60" : "#987334"} />
                  <Text style={styles.reviewStatusText}>{reviewComplete ? "All verification conditions recorded. Ready for Super Admin approval." : "Approval stays locked until all required evidence and confirmations are completed."}</Text>
                </View>
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
              style={[
                styles.confirmActions,
                viewportWidth < 480 && styles.confirmActionsCompact,
              ]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel staff account action"
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
                accessibilityRole="button"
                accessibilityLabel={actionButtonLabel(actionType)}
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
    headerCompact: { padding: 17 },
    titleCompact: { fontSize: 24, lineHeight: 29 },
    sectionTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
    sectionTitleRowCompact: { alignItems: "flex-start" },
    headingIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#E6F5ED", justifyContent: "center", alignItems: "center" },
    sectionHeadingText: { flex: 1, minWidth: 190 },
    sectionEyebrow: { color: "#29785E", fontSize: 10, letterSpacing: 1.05, fontWeight: "800" },
    sectionHeading: { color: "#173D32", fontSize: 18, fontWeight: "800", lineHeight: 24, marginTop: 2 },
    sectionDescription: { color: "#5F796E", fontSize: 12, lineHeight: 19, marginTop: 5, maxWidth: 710 },
    accessFlowStepsCompact: { flexDirection: "column", alignItems: "stretch" },
    accessStepCompact: { width: "100%" },
    stepNumberBox: { width: 33, height: 33, borderRadius: 10, backgroundColor: "#E3F4EB", alignItems: "center", justifyContent: "center" },
    stepContent: { flex: 1, minWidth: 0 },
    stepDescription: { marginTop: 3, fontSize: 11, lineHeight: 16, color: "#71857C" },
    flowNotice: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 14, padding: 12, backgroundColor: "#EFF9F3", borderRadius: 10 },
    applicationPanel: { padding: 19, borderRadius: 15, borderWidth: 1, borderColor: "#DFEBE4", backgroundColor: "#FFFFFF", marginBottom: 18, gap: 13 },
    pendingBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, backgroundColor: "#FFF5DE", alignSelf: "flex-start" },
    pendingBadgeText: { color: "#8A5E21", fontWeight: "800", fontSize: 11 },
    pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#C28A2D" },
    applicationSearch: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, minHeight: 46, borderWidth: 1, borderRadius: 11, borderColor: "#D9E7DF", backgroundColor: "#F9FCFA" },
    applicationSearchInput: { flex: 1, minWidth: 0, color: "#173D32", minHeight: 44, fontSize: 13, ...( {outlineStyle:"none"} as any) },
    clearSearch: { padding: 5 },
    applicationEmpty: { padding: 24, gap: 6, alignItems: "center", backgroundColor: "#F8FBF9", borderRadius: 11, borderWidth: 1, borderColor: "#E5EFE8" },
    applicationEmptyTitle: { fontSize: 14, fontWeight: "800", color: "#264F3D" },
    applicationEmptyText: { fontSize: 12, lineHeight: 18, color: "#72897B", textAlign: "center" },
    applicationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 15, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1EBE5", borderRadius: 12 },
    applicationRowCompact: { alignItems: "flex-start" },
    applicantAvatar: { height: 43, width: 43, borderRadius: 13, justifyContent: "center", alignItems: "center", backgroundColor: "#E6F5ED" },
    applicantAvatarText: { fontSize: 17, fontWeight: "800", color: "#12735C" },
    applicantBody: { flex: 1, minWidth: 180, gap: 4 },
    applicantName: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: "#1A4837" },
    applicantEmail: { fontSize: 12, color: "#56766A" },
    applicantMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
    applicantMetaText: { flex: 1, color: "#557465", fontSize: 11.5, lineHeight: 16 },
    applicantReference: { color: "#7C9388", fontSize: 11, lineHeight: 16 },
    reviewApplicationButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, minHeight: 42, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, backgroundColor: "#087D60" },
    reviewApplicationButtonCompact: { width: "100%", marginTop: 3 },
    reviewApplicationText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
    statsRowCompact: { gap: 9 },

    credentialReview: { marginTop: 18, marginBottom: 12, borderTopWidth: 1, borderColor: "#E0EAE4", paddingTop: 18 },
    verificationHeading: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 13 },
    verificationHeadingIcon: { height: 41, width: 41, borderRadius: 12, backgroundColor: "#E3F5EA", alignItems: "center", justifyContent: "center" },
    verificationHeadingContent: { flex: 1 },
    verificationTitle: { fontSize: 16, color: "#204735", fontWeight: "800" },
    verificationSubtitle: { fontSize: 11.5, lineHeight: 18, color: "#658074", marginTop: 3 },
    confirmScrollContent: { paddingBottom: 13 },
    reviewScrollWide: { flexDirection: "row", flexWrap: "wrap", columnGap: 13, alignItems: "flex-start" },
    reviewFieldWide: { flexGrow: 1, flexBasis: "45%", minWidth: 220 },
    reviewFieldFull: { flexBasis: "100%", width: "100%" },
    reviewChecksHeading: { width: "100%", marginTop: 6, marginBottom: 7 },
    reviewPrivacyNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, backgroundColor: "#F3F9F5", borderRadius: 11, marginTop: 9 },
    reviewStatus: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#EADCB9", borderRadius: 10, padding: 12, marginTop: 14, backgroundColor: "#FFFBF1" },
    reviewStatusReady: { borderColor: "#CDE8D6", backgroundColor: "#F0FBF3" },
    reviewStatusText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "700", color: "#536F60" },
    applicantDetails: { padding: 17, marginTop: 14, marginBottom: 16, backgroundColor: "#F3F9F6", borderWidth: 1, borderColor: "#DCEBE2", borderRadius: 13 },
    reviewKicker: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4, color: "#247459" },
    reviewHelp: { color: "#556E61", fontSize: 13, lineHeight: 21, marginTop: 8, marginBottom: 12 },
    reviewScroll: { width: "100%" },
    reviewField: { marginBottom: 17 },
    reviewLabel: { fontSize: 13, fontWeight: "700", color: "#294C3C", marginBottom: 7 },
    reviewInput: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D5E3DB", borderRadius: 11, paddingHorizontal: 14, minHeight: 50, fontSize: 14, color: "#173D32" },
    confirmReview: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginVertical: 5, borderWidth: 1, borderColor: "#E0EBE4", padding: 13, backgroundColor: "#FAFCFB", borderRadius: 12 },
    confirmReviewText: { flex: 1, color: "#355749", fontSize: 13, lineHeight: 20 },
    reviewHint: { flex: 1, color: "#607D6C", fontSize: 11.5, lineHeight: 17 },
    confirmDisabled: { opacity: 0.5 },
    accessFlow: { padding: 18, borderWidth: 1, borderRadius: 15, borderColor: "#DFEBE4", backgroundColor: "#FFFFFF", marginBottom: 18 },
    accessFlowTitle: { color: "#426658", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 11 },
    accessFlowSteps: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 9, marginTop: 14 },
    accessStep: { flexDirection: "row", alignItems: "flex-start", gap: 9, flex: 1, minWidth: 190, padding: 10, backgroundColor: "#FAFCFB", borderRadius: 11, borderWidth: 1, borderColor: "#E5EFE9" },
    stepNumber: { color: "#23765F", fontSize: 11, fontWeight: "800" },
    stepText: { color: "#234B3C", fontSize: 12.5, fontWeight: "800" },
    flowHint: { flex: 1, color: "#5A7969", fontSize: 11.5, lineHeight: 18 },
    container: {
      padding: 24,
      paddingBottom: 60,
      backgroundColor:
        "#F6F9F8",
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
      marginBottom: 17,
      padding: 23,
      backgroundColor:"#E5F5ED",
      borderRadius:14,
      borderWidth:1,
      borderColor:"#D8EBE0",
    },

    eyebrow: {
      fontSize: 11,
      fontWeight: "900",
      color: "#176C52",
      letterSpacing: 1.4,
      marginBottom: 5,
    },

    title: {
      fontSize: 27,
      fontWeight: "800",
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
      backgroundColor: "#FFFFFF",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#E0EBE5",
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#E1EBE5",
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
      backgroundColor: "#F6FBF8",
      borderRadius: 9,
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
      borderRadius: 17,
      padding: 24,
      borderWidth: 1,
      borderColor:
        "#DDEBE3",
    },

    confirmIcon: {
      width: 49,
      height: 49,
      borderRadius: 13,
      backgroundColor:
        "#F0FDFA",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },

    confirmTitle: {
      color: "#173D32",
      fontSize: 23,
      fontWeight: "800",
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
        "#F4FAF6",
      borderWidth: 1,
      borderColor:
        "#E1EBE5",
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
      marginTop: 10,
      paddingTop: 14,
      borderTopWidth: 1,
      borderColor: "#E3ECE5",
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
    },

    confirmActionsCompact: {
      flexDirection: "column-reverse",
      alignItems: "stretch",
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