import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
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
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import SideDrawer from "../../components/SideDrawer";
import { db } from "../../lib/firebase";
import {
  isAdminProfile,
  isApprovedProfile,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

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

type EventStatus =
  | "upcoming"
  | "active"
  | "completed";

type DisasterCase = {
  id: string;
  title?: string;
  disasterType?: string;
  type?: string;
  severity?: Severity;
  status?: CaseStatus;
  createdAt?: any;
  location?: string;
};

type VolunteerEvent = {
  id: string;
  title?: string;
  type?: "disaster" | "training";
  status?: EventStatus;
  capacity?: number;
  createdAt?: any;
  location?: string;
  date?: string;
};

type KpiTone =
  | "blue"
  | "red"
  | "green"
  | "orange";

export default function AdminDashboard() {
  const router = useRouter();

  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [
    drawerOpen,
    setDrawerOpen,
  ] = useState(false);

  const [
    cases,
    setCases,
  ] = useState<DisasterCase[]>([]);

  const [
    events,
    setEvents,
  ] = useState<VolunteerEvent[]>([]);

  const [
    pendingUserIds,
    setPendingUserIds,
  ] = useState<string[]>([]);

  const [
    pendingVolunteerIds,
    setPendingVolunteerIds,
  ] = useState<string[]>([]);

  const [
    dataError,
    setDataError,
  ] = useState("");

  const isAuthorized =
    isAdminProfile(profile);

  const isSuperAdmin =
    profile?.role === "superadmin";

  const navigate = (route: string) => {
    router.push(route as any);
  };

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const casesQuery = query(
      collection(db, "disasterCases"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    return onSnapshot(
      casesQuery,
      (snapshot) => {
        setCases(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              DisasterCase,
              "id"
            >),
          }))
        );

        setDataError("");
      },
      (error) => {
        console.log(
          "cases snapshot error:",
          error
        );

        setDataError(
          "Some dashboard data could not be loaded."
        );
      }
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const eventsQuery = query(
      collection(db, "volunteerEvents"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    return onSnapshot(
      eventsQuery,
      (snapshot) => {
        setEvents(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              VolunteerEvent,
              "id"
            >),
          }))
        );
      },
      (error) => {
        console.log(
          "events snapshot error:",
          error
        );

        setDataError(
          "Some dashboard data could not be loaded."
        );
      }
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const pendingUsersQuery = query(
      collection(db, "users"),
      where(
        "status",
        "==",
        "pending_review"
      )
    );

    return onSnapshot(
      pendingUsersQuery,
      (snapshot) => {
        setPendingUserIds(
          snapshot.docs.map(
            (item) => item.id
          )
        );
      },
      (error) => {
        console.log(
          "pending users snapshot error:",
          error
        );

        setDataError(
          "Some dashboard data could not be loaded."
        );
      }
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const pendingApplicationsQuery =
      query(
        collection(
          db,
          "volunteerApplications"
        ),
        where(
          "status",
          "==",
          "pending"
        )
      );

    return onSnapshot(
      pendingApplicationsQuery,
      (snapshot) => {
        setPendingVolunteerIds(
          snapshot.docs.map(
            (item) => item.id
          )
        );
      },
      (error) => {
        console.log(
          "volunteer applications snapshot error:",
          error
        );

        setDataError(
          "Some dashboard data could not be loaded."
        );
      }
    );
  }, [isAuthorized]);

  const metrics = useMemo(() => {
    const byStatus: Record<
      CaseStatus,
      number
    > = {
      reported: 0,
      validated: 0,
      assigned: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };

    const bySeverity: Record<
      Severity,
      number
    > = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    cases.forEach((item) => {
      const status =
        item.status || "reported";

      const severity =
        item.severity || "medium";

      byStatus[status] =
        (byStatus[status] || 0) + 1;

      bySeverity[severity] =
        (bySeverity[severity] || 0) + 1;
    });

    const eventStatus: Record<
      EventStatus,
      number
    > = {
      upcoming: 0,
      active: 0,
      completed: 0,
    };

    events.forEach((item) => {
      const status =
        item.status || "upcoming";

      eventStatus[status] =
        (eventStatus[status] || 0) + 1;
    });

    const activeCases =
      byStatus.reported +
      byStatus.validated +
      byStatus.assigned +
      byStatus.in_progress;

    const criticalOpen =
      cases.filter((item) => {
        const status =
          item.status || "reported";

        return (
          (item.severity || "medium") ===
            "critical" &&
          status !== "resolved" &&
          status !== "closed"
        );
      }).length;

    const pendingAccounts =
      new Set([
        ...pendingUserIds,
        ...pendingVolunteerIds,
      ]).size;

    return {
      byStatus,
      bySeverity,
      eventStatus,
      activeCases,
      criticalOpen,
      pendingAccounts,
      latestCases: cases.slice(0, 5),
      latestEvents: events.slice(0, 5),
    };
  }, [
    cases,
    events,
    pendingUserIds,
    pendingVolunteerIds,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#078F82"
        />

        <Text style={styles.muted}>
          Loading command center...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(profile)
  ) {
    return <Redirect href="/login" />;
  }

  if (!isAuthorized) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >
        <View style={styles.topHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open administrator menu"
            style={styles.menuButton}
            onPress={() =>
              setDrawerOpen(true)
            }
          >
            <Ionicons
              name="menu"
              size={25}
              color="#0F172A"
            />
          </TouchableOpacity>

          <View style={styles.headingText}>
            <Text style={styles.title}>
              Command Center
            </Text>

            <Text style={styles.sub}>
              {isSuperAdmin
                ? "Super Administrator"
                : "Administrator"}
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open admin logs"
            style={styles.darkButton}
            onPress={() =>
              navigate(
                "/(admin)/admin-logs"
              )
            }
          >
            <Ionicons
              name="list-outline"
              size={18}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        {!!dataError && (
          <View style={styles.warningBox}>
            <Ionicons
              name="warning-outline"
              size={18}
              color="#B45309"
            />

            <Text
              style={styles.warningText}
            >
              {dataError}
            </Text>
          </View>
        )}

        <Text style={styles.sectionHeading}>
          Quick Actions
        </Text>

        <View style={styles.quickGrid}>
          <QuickButton
            icon="people-outline"
            label="Approvals"
            onPress={() =>
              navigate(
                "/(admin)/account-approvals"
              )
            }
          />

          <QuickButton
            icon="warning-outline"
            label="Cases"
            onPress={() =>
              navigate(
                "/(admin)/admin-cases"
              )
            }
          />

          <QuickButton
            icon="calendar-outline"
            label="Events"
            onPress={() =>
              navigate(
                "/(admin)/admin-events"
              )
            }
          />

          <QuickButton
            icon="cash-outline"
            label="Donations"
            onPress={() =>
              navigate("/donation-list")
            }
          />

          <QuickButton
            icon="megaphone-outline"
            label="Announcement"
            onPress={() =>
              navigate(
                "/(admin)/create-announcement"
              )
            }
          />

          <QuickButton
            icon="analytics-outline"
            label="Analytics"
            onPress={() =>
              navigate(
                "/(admin)/admin-analytics"
              )
            }
          />
        </View>

        <Text style={styles.sectionHeading}>
          Live Overview
        </Text>

        <View style={styles.kpiGrid}>
          <KpiCard
            icon="warning-outline"
            label="Active Cases"
            value={metrics.activeCases}
            tone="blue"
            onPress={() =>
              navigate(
                "/(admin)/admin-cases"
              )
            }
          />

          <KpiCard
            icon="alert-circle-outline"
            label="Critical Open"
            value={metrics.criticalOpen}
            tone="red"
            onPress={() =>
              navigate(
                "/(admin)/admin-cases"
              )
            }
          />

          <KpiCard
            icon="person-add-outline"
            label="Pending Accounts"
            value={
              metrics.pendingAccounts
            }
            tone="orange"
            onPress={() =>
              navigate(
                "/(admin)/account-approvals"
              )
            }
          />

          <KpiCard
            icon="calendar-outline"
            label="Active Events"
            value={
              metrics.eventStatus.active
            }
            tone="green"
            onPress={() =>
              navigate(
                "/(admin)/admin-events"
              )
            }
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            Case Pipeline
          </Text>

          <View style={styles.rowWrap}>
            <SmallStat
              label="Reported"
              value={
                metrics.byStatus.reported
              }
            />

            <SmallStat
              label="Validated"
              value={
                metrics.byStatus.validated
              }
            />

            <SmallStat
              label="Assigned"
              value={
                metrics.byStatus.assigned
              }
            />

            <SmallStat
              label="In Progress"
              value={
                metrics.byStatus
                  .in_progress
              }
            />

            <SmallStat
              label="Resolved"
              value={
                metrics.byStatus.resolved
              }
            />

            <SmallStat
              label="Closed"
              value={
                metrics.byStatus.closed
              }
            />
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            Severity Overview
          </Text>

          <View style={styles.rowWrap}>
            <SmallStat
              label="Critical"
              value={
                metrics.bySeverity
                  .critical
              }
            />

            <SmallStat
              label="High"
              value={
                metrics.bySeverity.high
              }
            />

            <SmallStat
              label="Medium"
              value={
                metrics.bySeverity.medium
              }
            />

            <SmallStat
              label="Low"
              value={
                metrics.bySeverity.low
              }
            />
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            Events Overview
          </Text>

          <View style={styles.rowWrap}>
            <SmallStat
              label="Upcoming"
              value={
                metrics.eventStatus
                  .upcoming
              }
            />

            <SmallStat
              label="Active"
              value={
                metrics.eventStatus.active
              }
            />

            <SmallStat
              label="Completed"
              value={
                metrics.eventStatus
                  .completed
              }
            />
          </View>
        </View>

        <View style={styles.block}>
          <View
            style={styles.blockHeaderRow}
          >
            <Text style={styles.blockTitle}>
              Latest Cases
            </Text>

            <TouchableOpacity
              onPress={() =>
                navigate(
                  "/(admin)/admin-cases"
                )
              }
            >
              <Text style={styles.link}>
                View all
              </Text>
            </TouchableOpacity>
          </View>

          {metrics.latestCases.length ===
          0 ? (
            <Text style={styles.emptyText}>
              No cases yet.
            </Text>
          ) : (
            metrics.latestCases.map(
              (item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() =>
                    navigate(
                      "/(admin)/admin-cases"
                    )
                  }
                >
                  <View
                    style={
                      styles.itemContent
                    }
                  >
                    <Text
                      style={
                        styles.itemTitle
                      }
                    >
                      {item.title ||
                        item.disasterType ||
                        item.type ||
                        "Untitled Case"}
                    </Text>

                    <Text
                      style={
                        styles.itemMeta
                      }
                    >
                      {String(
                        item.status ||
                          "reported"
                      ).toUpperCase()}{" "}
                      •{" "}
                      {String(
                        item.severity ||
                          "medium"
                      ).toUpperCase()}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              )
            )
          )}
        </View>

        <View style={styles.block}>
          <View
            style={styles.blockHeaderRow}
          >
            <Text style={styles.blockTitle}>
              Latest Events
            </Text>

            <TouchableOpacity
              onPress={() =>
                navigate(
                  "/(admin)/admin-events"
                )
              }
            >
              <Text style={styles.link}>
                View all
              </Text>
            </TouchableOpacity>
          </View>

          {metrics.latestEvents.length ===
          0 ? (
            <Text style={styles.emptyText}>
              No events yet.
            </Text>
          ) : (
            metrics.latestEvents.map(
              (item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() =>
                    navigate(
                      "/(admin)/admin-events"
                    )
                  }
                >
                  <View
                    style={
                      styles.itemContent
                    }
                  >
                    <Text
                      style={
                        styles.itemTitle
                      }
                    >
                      {item.title ||
                        "Untitled Event"}
                    </Text>

                    <Text
                      style={
                        styles.itemMeta
                      }
                    >
                      {String(
                        item.status ||
                          "upcoming"
                      ).toUpperCase()}{" "}
                      •{" "}
                      {String(
                        item.type ||
                          "disaster"
                      ).toUpperCase()}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              )
            )
          )}
        </View>

        {isSuperAdmin && (
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() =>
              navigate(
                "/(admin)/system-settings"
              )
            }
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.settingsButtonText
              }
            >
              System Settings
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <SideDrawer
        visible={drawerOpen}
        onClose={() =>
          setDrawerOpen(false)
        }
        name={
          profile.fullName ||
          "Administrator"
        }
        email={profile.email || ""}
        role={profile.role}
      />
    </>
  );
}

function QuickButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.quickButton}
      onPress={onPress}
    >
      <View style={styles.quickIcon}>
        <Ionicons
          name={icon}
          size={19}
          color="#078F82"
        />
      </View>

      <Text
        style={styles.quickButtonText}
      >
        {label}
      </Text>

      <Ionicons
        name="chevron-forward"
        size={15}
        color="#94A3B8"
      />
    </TouchableOpacity>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
  onPress,
}: {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  label: string;
  value: number;
  tone: KpiTone;
  onPress: () => void;
}) {
  const backgroundColor =
    tone === "blue"
      ? "#2563EB"
      : tone === "red"
        ? "#DC2626"
        : tone === "green"
          ? "#16A34A"
          : "#F59E0B";

  return (
    <TouchableOpacity
      style={[
        styles.kpiCard,
        {
          backgroundColor,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.kpiTopRow}>
        <Text style={styles.kpiLabel}>
          {label}
        </Text>

        <Ionicons
          name={icon}
          size={21}
          color="#FFFFFF"
        />
      </View>

      <Text style={styles.kpiValue}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>
        {label}
      </Text>

      <Text style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 54,
    paddingBottom: 45,
    backgroundColor: "#F4F7FB",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
    backgroundColor: "#F4F7FB",
  },

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },

  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  headingText: {
    flex: 1,
  },

  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
  },

  sub: {
    color: "#64748B",
    fontWeight: "700",
    marginTop: 3,
  },

  muted: {
    color: "#64748B",
    textAlign: "center",
  },

  darkButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },

  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 15,
  },

  warningText: {
    flex: 1,
    color: "#92400E",
    fontWeight: "600",
    fontSize: 12,
  },

  sectionHeading: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 10,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },

  quickButton: {
    width: (CARD_WIDTH - 10) / 2,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  quickIcon: {
    width: 33,
    height: 33,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F8F3",
    marginRight: 8,
  },

  quickButtonText: {
    flex: 1,
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
  },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },

  kpiCard: {
    width: (CARD_WIDTH - 10) / 2,
    minHeight: 112,
    borderRadius: 16,
    padding: 14,
  },

  kpiTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  kpiLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontWeight: "800",
    opacity: 0.95,
    fontSize: 12,
  },

  kpiValue: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 30,
    marginTop: 13,
  },

  block: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },

  blockHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  blockTitle: {
    fontWeight: "900",
    color: "#0F172A",
    fontSize: 15,
  },

  link: {
    fontWeight: "900",
    color: "#078F82",
  },

  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },

  stat: {
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
  },

  statLabel: {
    color: "#64748B",
    fontWeight: "800",
    fontSize: 11,
  },

  statValue: {
    color: "#0F172A",
    fontWeight: "900",
    fontSize: 20,
    marginTop: 6,
  },

  emptyText: {
    color: "#64748B",
    textAlign: "center",
    paddingVertical: 18,
  },

  itemRow: {
    minHeight: 58,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  itemContent: {
    flex: 1,
    paddingRight: 8,
  },

  itemTitle: {
    fontWeight: "900",
    color: "#0F172A",
  },

  itemMeta: {
    color: "#64748B",
    fontWeight: "700",
    marginTop: 3,
    fontSize: 11,
  },

  settingsButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#7C3AED",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 5,
  },

  settingsButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});