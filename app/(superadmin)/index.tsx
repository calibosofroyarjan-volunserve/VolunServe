import React from "react";

import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  router,
  type Href,
} from "expo-router";

import {
  useUserSession,
} from "../../lib/useUserSession";

type ControlCardProps = {
  title: string;
  description: string;
  icon: string;
  onPress: () => void;
};

export default function SuperAdminDashboard() {
  const {
    profile,
  } = useUserSession();

  const displayName =
    profile?.fullName ||
    profile?.email ||
    "Super Admin";

  const openRoute = (route: string) => {
    router.push(route as Href);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.headerTextArea}>
          <Text style={styles.eyebrow}>
            VOLUNSERVE SYSTEM CONTROL
          </Text>

          <Text style={styles.title}>
            Super Admin Dashboard
          </Text>

          <Text style={styles.subtitle}>
            System-level administration, security, records,
            configuration, and oversight.
          </Text>
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            SUPER ADMIN
          </Text>
        </View>
      </View>

      <View style={styles.welcomeCard}>
        <View style={styles.welcomeIcon}>
          <Text style={styles.welcomeIconText}>
            SA
          </Text>
        </View>

        <View style={styles.welcomeTextArea}>
          <Text style={styles.welcomeTitle}>
            Welcome, {displayName}
          </Text>

          <Text style={styles.welcomeText}>
            You have system-level authority over VolunServe.
            Operational Admin accounts handle day-to-day user
            management and community operations, while the Super
            Admin controls Admin access, system security,
            configuration, maintenance, and audit oversight.
          </Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Separate Admin and Super Admin Access
        </Text>

        <Text style={styles.infoText}>
          Admins use the operational Admin portal to manage users,
          emergency reports, volunteer assignments, disputes,
          events, certificates, donations, announcements, analytics,
          and other day-to-day operations.
        </Text>

        <Text style={styles.infoText}>
          Super Admin uses this separate system-control portal to
          protect and maintain the system, manage Admin access,
          review system records and audit logs, and control
          system-level settings. Operational Admin decisions and
          routes remain inside the separate Admin portal.
        </Text>
      </View>

      <Text style={styles.sectionEyebrow}>
        SYSTEM MANAGEMENT
      </Text>

      <Text style={styles.sectionTitle}>
        System Governance & Control
      </Text>

      <View style={styles.grid}>
        <ControlCard
          icon="👤"
          title="Admin Accounts"
          description="Grant, suspend, reactivate, and remove operational Admin access."
          onPress={() => {
            openRoute("/(superadmin)/admin-accounts");
          }}
        />

        <ControlCard
          icon="🗂"
          title="All Records"
          description="Review system-wide records across VolunServe from a dedicated Super Admin view."
          onPress={() => {
            openRoute("/(superadmin)/all-records");
          }}
        />

        <ControlCard
          icon="⚙"
          title="System Settings"
          description="Manage global system configuration and Super Admin-controlled settings."
          onPress={() => {
            openRoute("/(superadmin)/system-settings");
          }}
        />

        <ControlCard
          icon="📋"
          title="Audit Logs"
          description="Review immutable Admin and system activity logs for accountability and oversight."
          onPress={() => {
            openRoute("/(superadmin)/admin-logs");
          }}
        />
      </View>

      <View style={styles.authorityCard}>
        <View style={styles.authorityBadge}>
          <Text style={styles.authorityBadgeText}>
            SYSTEM-LEVEL AUTHORITY
          </Text>
        </View>

        <Text style={styles.authorityTitle}>
          Super Admin Control
        </Text>

        <Text style={styles.authorityText}>
          Super Admin protects and maintains the system by managing
          Admin access, reviewing system-wide records and audit logs,
          controlling system-level settings, and overseeing system
          security. Daily user management and community operations
          remain under the separate Admin portal.
        </Text>
      </View>
    </ScrollView>
  );
}

function ControlCard({
  title,
  description,
  icon,
  onPress,
}: ControlCardProps) {
  return (
    <TouchableOpacity
      style={styles.controlCard}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>
            {icon}
          </Text>
        </View>

        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>
            AVAILABLE
          </Text>
        </View>
      </View>

      <Text style={styles.cardTitle}>
        {title}
      </Text>

      <Text style={styles.cardDescription}>
        {description}
      </Text>

      <Text style={styles.openText}>
        Open module →
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FA",
  },

  content: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 30,
    paddingBottom: 70,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 20,
  },

  headerTextArea: {
    flex: 1,
  },

  eyebrow: {
    color: "#6D28D9",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
  },

  title: {
    color: "#12263A",
    fontSize: 34,
    fontWeight: "900",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 720,
  },

  roleBadge: {
    backgroundColor: "#EDE9FE",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },

  roleBadgeText: {
    color: "#6D28D9",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.8,
  },

  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },

  welcomeIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDE9FE",
    marginRight: 16,
  },

  welcomeIconText: {
    color: "#6D28D9",
    fontSize: 17,
    fontWeight: "900",
  },

  welcomeTextArea: {
    flex: 1,
  },

  welcomeTitle: {
    color: "#12263A",
    fontSize: 18,
    fontWeight: "900",
  },

  welcomeText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },

  infoCard: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 16,
    padding: 18,
    marginBottom: 28,
  },

  infoTitle: {
    color: "#5B21B6",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
  },

  infoText: {
    color: "#5B6474",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },

  sectionEyebrow: {
    color: "#6D28D9",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 10,
  },

  sectionTitle: {
    color: "#12263A",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
    marginBottom: 14,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 24,
  },

  controlCard: {
    flexGrow: 1,
    flexBasis: 330,
    minWidth: 280,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE5ED",
    borderRadius: 17,
    padding: 18,
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  cardIconText: {
    fontSize: 21,
  },

  activeBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  activeBadgeText: {
    color: "#166534",
    fontSize: 9,
    fontWeight: "900",
  },

  cardTitle: {
    color: "#12263A",
    fontSize: 17,
    fontWeight: "900",
  },

  cardDescription: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },

  openText: {
    color: "#6D28D9",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 16,
  },

  authorityCard: {
    backgroundColor: "#111827",
    borderRadius: 17,
    padding: 20,
    marginTop: 8,
  },

  authorityBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#312E81",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },

  authorityBadgeText: {
    color: "#DDD6FE",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  authorityTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  authorityText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
});
