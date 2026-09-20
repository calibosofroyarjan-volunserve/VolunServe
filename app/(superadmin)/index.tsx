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
  onPress?: () => void;
  pending?: boolean;
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
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTextArea}>
          <Text style={styles.eyebrow}>
            VOLUNSERVE SYSTEM CONTROL
          </Text>

          <Text style={styles.title}>
            Super Admin Dashboard
          </Text>

          <Text style={styles.subtitle}>
            Full-system oversight, administration, security,
            records, and configuration.
          </Text>
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            SUPER ADMIN
          </Text>
        </View>
      </View>

      {/* WELCOME */}
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
            You have system-level access to VolunServe.
            Admins handle daily operational work, while the
            Super Admin manages global oversight, system
            configuration, records, security, and Admin access.
          </Text>
        </View>
      </View>

      {/* ROLE SEPARATION */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Admin and Super Admin Roles
        </Text>

        <Text style={styles.infoText}>
          Admins handle operational activities such as
          validating emergency reports, confirming assistance
          requests, approving or rejecting applications,
          assigning volunteers, coordinating responses,
          handling disputes, and managing daily operations.
        </Text>

        <Text style={styles.infoText}>
          Super Admin has control over the entire system,
          including Admin accounts, all records, global
          announcements, system settings, permissions,
          audit logs, and overall system monitoring.
        </Text>
      </View>

      {/* SYSTEM MANAGEMENT */}
      <Text style={styles.sectionEyebrow}>
        SYSTEM MANAGEMENT
      </Text>

      <Text style={styles.sectionTitle}>
        Administrative Control
      </Text>

      <View style={styles.grid}>
        <ControlCard
          icon="👤"
          title="Admin Accounts"
          description="Create, activate, deactivate, and manage Admin accounts and their system access."
          pending
        />

        <ControlCard
          icon="🗂"
          title="All Records"
          description="Review records across residents, volunteers, emergency cases, donations, certificates, and other system modules."
          pending
        />

        <ControlCard
          icon="⚙"
          title="System Settings"
          description="Manage global system configuration, security settings, permissions, and system behavior."
          onPress={() => {
            openRoute("/(superadmin)/system-settings");
          }}
        />

        <ControlCard
          icon="📋"
          title="Audit Logs"
          description="Review administrative actions and important activity recorded throughout VolunServe."
          onPress={() => {
            openRoute("/(superadmin)/admin-logs");
          }}
        />
      </View>

      {/* GLOBAL COMMUNICATION */}
      <Text style={styles.sectionEyebrow}>
        GLOBAL COMMUNICATION
      </Text>

      <Text style={styles.sectionTitle}>
        System-wide Information
      </Text>

      <View style={styles.grid}>
        <ControlCard
          icon="📢"
          title="Global Announcements"
          description="Publish announcements, emergency alerts, system updates, volunteer calls, and other notices visible across VolunServe."
          pending
        />

        <ControlCard
          icon="🔔"
          title="System Notifications"
          description="Monitor important system notifications and major activities across the platform."
          pending
        />
      </View>

      {/* OVERSIGHT */}
      <Text style={styles.sectionEyebrow}>
        OPERATIONAL OVERSIGHT
      </Text>

      <Text style={styles.sectionTitle}>
        Monitor Admin Operations
      </Text>

      <View style={styles.grid}>
        <ControlCard
          icon="🚨"
          title="Emergency Operations"
          description="Monitor emergency cases, volunteer deployment, assignments, and response activities handled by Admins."
          onPress={() => {
            openRoute("/(admin)/command-center");
          }}
        />

        <ControlCard
          icon="📊"
          title="System Analytics"
          description="Review operational statistics, volunteer activity, emergency response data, and system trends."
          onPress={() => {
            openRoute("/(admin)/admin-analytics");
          }}
        />

        <ControlCard
          icon="⚠"
          title="Response Disputes"
          description="Monitor disputes handled by Admins and review response issues that require higher-level oversight."
          onPress={() => {
            openRoute("/(admin)/admin-disputes");
          }}
        />

        <ControlCard
          icon="🎓"
          title="Volunteer Certificates"
          description="Oversee verified volunteer service records and digital certificates issued through VolunServe."
          onPress={() => {
            openRoute("/(admin)/admin-certificates");
          }}
        />
      </View>

      {/* ADMIN OPERATIONS */}
      <Text style={styles.sectionEyebrow}>
        ADMIN ACTIVITY
      </Text>

      <Text style={styles.sectionTitle}>
        Operational Records
      </Text>

      <View style={styles.grid}>
        <ControlCard
          icon="✅"
          title="Account Approvals"
          description="Monitor resident and volunteer account approvals handled by operational Admins."
          onPress={() => {
            openRoute("/(admin)/account-approvals");
          }}
        />

        <ControlCard
          icon="📍"
          title="Emergency Cases"
          description="Review emergency cases being validated, assigned, and coordinated by Admin personnel."
          onPress={() => {
            openRoute("/(admin)/admin-cases");
          }}
        />

        <ControlCard
          icon="📅"
          title="Volunteer Events"
          description="Monitor volunteer events, participation activities, and event operations."
          onPress={() => {
            openRoute("/(admin)/admin-events");
          }}
        />

        <ControlCard
          icon="🧭"
          title="Command Center"
          description="Access the operational response command center for full-system monitoring."
          onPress={() => {
            openRoute("/(admin)/command-center");
          }}
        />
      </View>

      {/* AUTHORITY NOTE */}
      <View style={styles.authorityCard}>
        <View style={styles.authorityBadge}>
          <Text style={styles.authorityBadgeText}>
            FULL SYSTEM AUTHORITY
          </Text>
        </View>

        <Text style={styles.authorityTitle}>
          Super Admin Control
        </Text>

        <Text style={styles.authorityText}>
          Super Admin may oversee all operational modules,
          records, and Admin activity. Ordinary Admin accounts
          must not have access to Super Admin-only functions
          such as Admin account management, global role and
          permission control, system configuration, and
          system-wide security settings.
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
  pending = false,
}: ControlCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.controlCard,
        pending && styles.pendingCard,
      ]}
      activeOpacity={pending ? 1 : 0.82}
      disabled={pending}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>
            {icon}
          </Text>
        </View>

        {pending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>
              NEXT BUILD
            </Text>
          </View>
        ) : (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>
              AVAILABLE
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle}>
        {title}
      </Text>

      <Text style={styles.cardDescription}>
        {description}
      </Text>

      {!pending ? (
        <Text style={styles.openText}>
          Open module →
        </Text>
      ) : (
        <Text style={styles.pendingText}>
          Super Admin module will be added next.
        </Text>
      )}
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

  pendingCard: {
    backgroundColor: "#FAFAFC",
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

  pendingBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  pendingBadgeText: {
    color: "#64748B",
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

  pendingText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
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