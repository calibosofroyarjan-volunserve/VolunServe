import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type ModuleCardProps = {
  title: string;
  description: string;
  icon: IconName;
  iconBackground: string;
  iconColor: string;
  onPress: () => void;
};

export default function SuperAdminDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 760;

  const openRoute = (route: string) => {
    router.push(route as Href);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            Super Admin Dashboard
          </Text>

          <Text style={styles.subtitle}>
            Manage system access, records, security, and settings.
          </Text>
        </View>

        {!compact ? (
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#5B3FD4" />
            <Text style={styles.roleBadgeText}>SUPER ADMIN</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>System Management</Text>

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <ModuleCard
          title="Admin Accounts"
          description="Manage operational admin access."
          icon="people"
          iconBackground="#F0EDFF"
          iconColor="#5B3FD4"
          onPress={() => openRoute("/(superadmin)/admin-accounts")}
        />

        <ModuleCard
          title="All Records"
          description="View system-wide records."
          icon="document-text-outline"
          iconBackground="#EAF4FF"
          iconColor="#1685E5"
          onPress={() => openRoute("/(superadmin)/all-records")}
        />

        <ModuleCard
          title="Audit Logs"
          description="Review system activity logs."
          icon="time-outline"
          iconBackground="#EAF8F2"
          iconColor="#139667"
          onPress={() => openRoute("/(superadmin)/admin-logs")}
        />

        <ModuleCard
          title="System Settings"
          description="Manage platform settings."
          icon="settings"
          iconBackground="#FFF3E8"
          iconColor="#E68119"
          onPress={() => openRoute("/(superadmin)/system-settings")}
        />
      </View>
    </ScrollView>
  );
}

function ModuleCard({
  title,
  description,
  icon,
  iconBackground,
  iconColor,
  onPress,
}: ModuleCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={styles.cardMain}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: iconBackground,
            },
          ]}
        >
          <Ionicons name={icon} size={27} color={iconColor} />
        </View>

        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>

      <View style={styles.arrowButton}>
        <Ionicons name="arrow-forward" size={20} color="#5B4BDB" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F9FC",
  },

  content: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingHorizontal: 34,
    paddingTop: 48,
    paddingBottom: 56,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 38,
  },

  headerCopy: {
    flex: 1,
  },

  title: {
    color: "#10213A",
    fontSize: 40,
    lineHeight: 48,
    fontWeight: "900",
    letterSpacing: -1,
  },

  titleCompact: {
    fontSize: 30,
    lineHeight: 37,
  },

  subtitle: {
    color: "#66758D",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 7,
  },

  roleBadge: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DED7FF",
    backgroundColor: "#F3F0FF",
  },

  roleBadgeText: {
    color: "#5B3FD4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  sectionTitle: {
    color: "#17213A",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 16,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  gridCompact: {
    flexDirection: "column",
  },

  card: {
    flexGrow: 1,
    flexBasis: 230,
    minHeight: 250,
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DEE5EE",
    padding: 24,
  },

  cardMain: {
    alignItems: "flex-start",
  },

  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },

  cardTitle: {
    color: "#132039",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
  },

  cardDescription: {
    color: "#617089",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 210,
  },

  arrowButton: {
    width: 42,
    height: 42,
    alignSelf: "flex-end",
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F1FF",
    borderWidth: 1,
    borderColor: "#E5DEFF",
  },
});
