import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type Severity =
  | "low"
  | "medium"
  | "high"
  | "critical";

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type DisasterCase = {
  id: string;
  severity?: Severity;
  status?: CaseStatus;
};

type ModuleCardProps = {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  iconColor: string;
  iconBackground: string;
  title: string;
  description: string;
  onPress: () => void;
  count?: number;
};

type OverviewCardProps = {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  iconColor: string;
  iconBackground: string;
  label: string;
  value: number;
  description: string;
  onPress: () => void;
};

export default function AdminDashboard() {
  const router =
    useRouter();

  const {
    width,
  } = useWindowDimensions();

  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [
    cases,
    setCases,
  ] = useState<
    DisasterCase[]
  >([]);

  const [
    pendingUserIds,
    setPendingUserIds,
  ] = useState<
    string[]
  >([]);

  const [
    pendingVolunteerIds,
    setPendingVolunteerIds,
  ] = useState<
    string[]
  >([]);

  const [
    dataError,
    setDataError,
  ] = useState(false);

  const isAdmin =
    !!profile &&
    profile.role === "admin" &&
    isApprovedProfile(profile);

  const contentWidth =
    Math.min(
      Math.max(
        width - 340,
        280,
      ),
      1180,
    );

  const moduleColumns =
    contentWidth >= 980
      ? 4
      : contentWidth >= 650
        ? 2
        : 1;

  const overviewColumns =
    contentWidth >= 850
      ? 3
      : contentWidth >= 560
        ? 2
        : 1;

  const moduleGap = 14;
  const overviewGap = 14;

  const moduleCardWidth =
    moduleColumns === 1
      ? "100%"
      : (contentWidth -
          moduleGap *
            (moduleColumns -
              1)) /
        moduleColumns;

  const overviewCardWidth =
    overviewColumns === 1
      ? "100%"
      : (contentWidth -
          overviewGap *
            (overviewColumns -
              1)) /
        overviewColumns;

  const navigate = (
    route: string,
  ) => {
    router.push(
      route as any,
    );
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "disasterCases",
        ),
        (snapshot) => {
          const rows: DisasterCase[] =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  DisasterCase,
                  "id"
                >),
              }),
            );

          setCases(
            rows,
          );
        },
        (error) => {
          console.log(
            "Admin dashboard cases error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const pendingUsersQuery =
      query(
        collection(
          db,
          "users",
        ),
        where(
          "status",
          "==",
          "pending_review",
        ),
      );

    const unsubscribe =
      onSnapshot(
        pendingUsersQuery,
        (snapshot) => {
          setPendingUserIds(
            snapshot.docs.map(
              (item) =>
                item.id,
            ),
          );
        },
        (error) => {
          console.log(
            "Admin dashboard pending users error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const pendingApplicationsQuery =
      query(
        collection(
          db,
          "volunteerApplications",
        ),
        where(
          "status",
          "==",
          "pending",
        ),
      );

    const unsubscribe =
      onSnapshot(
        pendingApplicationsQuery,
        (snapshot) => {
          setPendingVolunteerIds(
            snapshot.docs.map(
              (item) =>
                item.id,
            ),
          );
        },
        (error) => {
          console.log(
            "Admin dashboard pending volunteer applications error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  const metrics =
    useMemo(() => {
      const activeCases =
        cases.filter(
          (item) => {
            const status =
              item.status ||
              "reported";

            return (
              status !==
                "resolved" &&
              status !==
                "closed"
            );
          },
        ).length;

      const criticalOpen =
        cases.filter(
          (item) => {
            const status =
              item.status ||
              "reported";

            return (
              item.severity ===
                "critical" &&
              status !==
                "resolved" &&
              status !==
                "closed"
            );
          },
        ).length;

      const pendingAccounts =
        new Set([
          ...pendingUserIds,
          ...pendingVolunteerIds,
        ]).size;

      return {
        activeCases,
        criticalOpen,
        pendingAccounts,
      };
    }, [
      cases,
      pendingUserIds,
      pendingVolunteerIds,
    ]);

  const modules:
    ModuleCardProps[] =
    [
      {
        icon:
          "people-outline",
        iconColor:
          "#2563EB",
        iconBackground:
          "#EFF6FF",
        title:
          "Account Approvals",
        description:
          "Review resident and volunteer applications.",
        count:
          metrics.pendingAccounts,
        onPress: () =>
          navigate(
            "/(admin)/account-approvals",
          ),
      },
      {
        icon:
          "warning-outline",
        iconColor:
          "#DC2626",
        iconBackground:
          "#FEF2F2",
        title:
          "Emergency Cases",
        description:
          "Validate reports and assign responders.",
        count:
          metrics.activeCases,
        onPress: () =>
          navigate(
            "/(admin)/admin-cases",
          ),
      },
      {
        icon:
          "calendar-outline",
        iconColor:
          "#7C3AED",
        iconBackground:
          "#F5F3FF",
        title:
          "Events",
        description:
          "Manage volunteer events and activities.",
        onPress: () =>
          navigate(
            "/(admin)/admin-events",
          ),
      },
      {
        icon:
          "heart-outline",
        iconColor:
          "#059669",
        iconBackground:
          "#ECFDF5",
        title:
          "Donations",
        description:
          "Manage verified donation campaigns.",
        onPress: () =>
          navigate(
            "/donation-list",
          ),
      },
      {
        icon:
          "megaphone-outline",
        iconColor:
          "#D97706",
        iconBackground:
          "#FFFBEB",
        title:
          "Announcements",
        description:
          "Publish important community updates.",
        onPress: () =>
          navigate(
            "/(admin)/create-announcement",
          ),
      },
      {
        icon:
          "analytics-outline",
        iconColor:
          "#0284C7",
        iconBackground:
          "#F0F9FF",
        title:
          "Analytics",
        description:
          "Review operational trends and reports.",
        onPress: () =>
          navigate(
            "/(admin)/admin-analytics",
          ),
      },
      {
        icon:
          "ribbon-outline",
        iconColor:
          "#4F46E5",
        iconBackground:
          "#EEF2FF",
        title:
          "Certificates",
        description:
          "Issue and manage volunteer certificates.",
        onPress: () =>
          navigate(
            "/(admin)/admin-certificates",
          ),
      },
      {
        icon:
          "shield-checkmark-outline",
        iconColor:
          "#B45309",
        iconBackground:
          "#FFF7ED",
        title:
          "Disputes",
        description:
          "Review contested assistance outcomes.",
        onPress: () =>
          navigate(
            "/(admin)/admin-disputes",
          ),
      },
    ];

  const overview:
    OverviewCardProps[] =
    [
      {
        icon:
          "folder-open-outline",
        iconColor:
          "#2563EB",
        iconBackground:
          "#EFF6FF",
        label:
          "Active Cases",
        value:
          metrics.activeCases,
        description:
          "Cases that still need action.",
        onPress: () =>
          navigate(
            "/(admin)/admin-cases",
          ),
      },
      {
        icon:
          "alert-circle-outline",
        iconColor:
          "#DC2626",
        iconBackground:
          "#FEF2F2",
        label:
          "Critical Open",
        value:
          metrics.criticalOpen,
        description:
          "Critical cases not yet resolved.",
        onPress: () =>
          navigate(
            "/(admin)/admin-cases",
          ),
      },
      {
        icon:
          "person-add-outline",
        iconColor:
          "#D97706",
        iconBackground:
          "#FFFBEB",
        label:
          "Pending Accounts",
        value:
          metrics.pendingAccounts,
        description:
          "Applications waiting for review.",
        onPress: () =>
          navigate(
            "/(admin)/account-approvals",
          ),
      },
    ];

  if (loading) {
    return (
      <View
        style={
          styles.center
        }
      >
        <ActivityIndicator
          size="large"
          color="#4F46E5"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading Admin Dashboard...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <Redirect href="/login" />
    );
  }

  if (
    profile.role ===
    "superadmin"
  ) {
    return (
      <Redirect href="/(superadmin)" />
    );
  }

  if (!isAdmin) {
    return (
      <Redirect href="/(tabs)" />
    );
  }

  return (
    <ScrollView
      style={
        styles.screen
      }
      contentContainerStyle={
        styles.page
      }
      showsVerticalScrollIndicator={
        false
      }
    >
      <View
        style={[
          styles.content,
          {
            maxWidth:
              contentWidth,
          },
        ]}
      >
        <View
          style={
            styles.header
          }
        >
          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              style={
                styles.title
              }
            >
              Admin Dashboard
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Manage community operations and response activities.
            </Text>
          </View>

          <View
            style={
              styles.adminBadge
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color="#0F766E"
            />

            <Text
              style={
                styles.adminBadgeText
              }
            >
              ADMIN
            </Text>
          </View>
        </View>

        {dataError && (
          <View
            style={
              styles.warningBox
            }
          >
            <Ionicons
              name="warning-outline"
              size={18}
              color="#B45309"
            />

            <Text
              style={
                styles.warningText
              }
            >
              Some live dashboard counts could not be loaded. The modules are still available.
            </Text>
          </View>
        )}

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Operations
          </Text>

          <Text
            style={
              styles.sectionSubtitle
            }
          >
            Open the module you need.
          </Text>
        </View>

        <View
          style={[
            styles.moduleGrid,
            {
              gap:
                moduleGap,
            },
          ]}
        >
          {modules.map(
            (item) => (
              <View
                key={
                  item.title
                }
                style={{
                  width:
                    moduleCardWidth,
                }}
              >
                <ModuleCard
                  {...item}
                />
              </View>
            ),
          )}
        </View>

        <View
          style={[
            styles.sectionHeader,
            styles.overviewHeader,
          ]}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Live Overview
          </Text>

          <Text
            style={
              styles.sectionSubtitle
            }
          >
            Key items that may need attention.
          </Text>
        </View>

        <View
          style={[
            styles.overviewGrid,
            {
              gap:
                overviewGap,
            },
          ]}
        >
          {overview.map(
            (item) => (
              <View
                key={
                  item.label
                }
                style={{
                  width:
                    overviewCardWidth,
                }}
              >
                <OverviewCard
                  {...item}
                />
              </View>
            ),
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function ModuleCard({
  icon,
  iconColor,
  iconBackground,
  title,
  description,
  onPress,
  count,
}: ModuleCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={
        0.78
      }
      style={
        styles.moduleCard
      }
      onPress={
        onPress
      }
    >
      <View
        style={
          styles.moduleTop
        }
      >
        <View
          style={[
            styles.moduleIcon,
            {
              backgroundColor:
                iconBackground,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={22}
            color={
              iconColor
            }
          />
        </View>

        {typeof count ===
          "number" &&
          count > 0 && (
            <View
              style={
                styles.countBadge
              }
            >
              <Text
                style={
                  styles.countBadgeText
                }
              >
                {count}
              </Text>
            </View>
          )}
      </View>

      <Text
        style={
          styles.moduleTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.moduleDescription
        }
      >
        {description}
      </Text>

      <View
        style={
          styles.moduleFooter
        }
      >
        <Text
          style={
            styles.openText
          }
        >
          Open
        </Text>

        <Ionicons
          name="arrow-forward"
          size={16}
          color="#4F46E5"
        />
      </View>
    </TouchableOpacity>
  );
}

function OverviewCard({
  icon,
  iconColor,
  iconBackground,
  label,
  value,
  description,
  onPress,
}: OverviewCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={
        0.8
      }
      style={
        styles.overviewCard
      }
      onPress={
        onPress
      }
    >
      <View
        style={[
          styles.overviewIcon,
          {
            backgroundColor:
              iconBackground,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={23}
          color={
            iconColor
          }
        />
      </View>

      <View
        style={
          styles.overviewBody
        }
      >
        <Text
          style={
            styles.overviewLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.overviewValue
          }
        >
          {value}
        </Text>

        <Text
          style={
            styles.overviewDescription
          }
        >
          {description}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color="#94A3B8"
      />
    </TouchableOpacity>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#F5F7FB",
    },

    page: {
      width: "100%",
      paddingHorizontal: 28,
      paddingTop: 42,
      paddingBottom: 64,
    },

    content: {
      width: "100%",
      alignSelf: "center",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F5F7FB",
      padding: 24,
    },

    loadingText: {
      marginTop: 12,
      color: "#64748B",
      fontSize: 13,
      fontWeight: "600",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 16,
      marginBottom: 30,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
    },

    title: {
      color: "#0F172A",
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -0.5,
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 19,
    },

    adminBadge: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor:
        "#ECFDF5",
      borderWidth: 1,
      borderColor:
        "#A7F3D0",
    },

    adminBadgeText: {
      color: "#0F766E",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    warningBox: {
      marginBottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      padding: 12,
      borderRadius: 11,
      backgroundColor:
        "#FFFBEB",
      borderWidth: 1,
      borderColor:
        "#FDE68A",
    },

    warningText: {
      flex: 1,
      color: "#92400E",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },

    sectionHeader: {
      marginBottom: 13,
    },

    overviewHeader: {
      marginTop: 30,
    },

    sectionTitle: {
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 12.5,
    },

    moduleGrid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
    },

    moduleCard: {
      minHeight: 196,
      padding: 18,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    moduleTop: {
      minHeight: 44,
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 10,
    },

    moduleIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
    },

    countBadge: {
      minWidth: 27,
      height: 27,
      paddingHorizontal: 7,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    countBadgeText: {
      color: "#334155",
      fontSize: 11,
      fontWeight: "900",
    },

    moduleTitle: {
      marginTop: 17,
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "900",
    },

    moduleDescription: {
      marginTop: 6,
      minHeight: 38,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
    },

    moduleFooter: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    openText: {
      color: "#4F46E5",
      fontSize: 12,
      fontWeight: "800",
    },

    overviewGrid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
    },

    overviewCard: {
      minHeight: 132,
      padding: 17,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    overviewIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
    },

    overviewBody: {
      flex: 1,
      minWidth: 0,
    },

    overviewLabel: {
      color: "#334155",
      fontSize: 12,
      fontWeight: "800",
    },

    overviewValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 27,
      fontWeight: "900",
    },

    overviewDescription: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 16,
    },
  });
