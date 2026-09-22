import { Ionicons } from "@expo/vector-icons";
import {
  Redirect,
  router,
  Stack,
  usePathname,
} from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import {
  isApprovedProfile,
  logoutUser,
  setActiveUserMode,
  type UserMode,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type NavItem = {
  label: string;
  icon: IconName;
  route: string;
  match: string;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    icon: "home-outline",
    route: "/(superadmin)",
    match: "/",
  },
  {
    label: "Admin Accounts",
    icon: "people-outline",
    route: "/(superadmin)/admin-accounts",
    match: "/admin-accounts",
  },
  {
    label: "All Records",
    icon: "albums-outline",
    route: "/(superadmin)/all-records",
    match: "/all-records",
  },
  {
    label: "Audit Logs",
    icon: "time-outline",
    route: "/(superadmin)/admin-logs",
    match: "/admin-logs",
  },
  {
    label: "System Settings",
    icon: "settings-outline",
    route: "/(superadmin)/system-settings",
    match: "/system-settings",
  },
];

export default function SuperAdminLayout() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5B4BDB" />
        <Text style={styles.loadingText}>Checking Super Admin access...</Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return <Redirect href="/login" />;
  }

  const role =
    typeof profile.role === "string"
      ? profile.role.toLowerCase()
      : "";

  if (role !== "superadmin") {
    if (role === "admin") {
      return <Redirect href="/(admin)" />;
    }

    return <Redirect href="/(tabs)" />;
  }

  const desktop = Platform.OS === "web" && width >= 980;

  const fullName =
    String(profile.fullName || profile.email || "Super Admin").trim();

  const nameParts = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const initials = nameParts.length
    ? nameParts.map((part) => part[0]?.toUpperCase()).join("")
    : "SA";

  const switchToMode = async (mode: UserMode) => {
    try {
      await setActiveUserMode(mode);
      setDrawerOpen(false);
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert(
        "Unable to switch mode",
        error?.message || "Please try again."
      );
    }
  };

  const signOut = async () => {
    try {
      setDrawerOpen(false);
      await logoutUser();
      router.replace("/login");
    } catch (error: any) {
      Alert.alert(
        "Sign Out Failed",
        error?.message || "Unable to sign out. Please try again."
      );
    }
  };

  return (
    <View style={styles.shell}>
      {desktop ? (
        <SuperAdminSidebar
          onNavigate={(route) => router.push(route as any)}
          onResident={() => switchToMode("resident")}
          onVolunteer={() => switchToMode("volunteer")}
          onSignOut={signOut}
        />
      ) : (
        <Modal
          visible={drawerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.drawerOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDrawerOpen(false)}
            />

            <SuperAdminSidebar
              compact
              onNavigate={(route) => {
                setDrawerOpen(false);
                router.push(route as any);
              }}
              onResident={() => switchToMode("resident")}
              onVolunteer={() => switchToMode("volunteer")}
              onSignOut={signOut}
            />
          </View>
        </Modal>
      )}

      <View style={styles.workspace}>
        <View style={styles.topbar}>
          {!desktop ? (
            <TouchableOpacity
              style={styles.menuButton}
              activeOpacity={0.8}
              onPress={() => setDrawerOpen(true)}
            >
              <Ionicons name="menu" size={24} color="#17213A" />
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <View style={styles.accountArea}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.accountCopy}>
              <Text style={styles.accountName} numberOfLines={1}>
                {fullName}
              </Text>
              <Text style={styles.accountRole}>Super Admin</Text>
            </View>
          </View>
        </View>

        <View style={styles.contentArea}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: "#F7F9FC",
              },
            }}
          />
        </View>
      </View>
    </View>
  );
}

function SuperAdminSidebar({
  onNavigate,
  onResident,
  onVolunteer,
  onSignOut,
  compact = false,
}: {
  onNavigate: (route: string) => void;
  onResident: () => void;
  onVolunteer: () => void;
  onSignOut: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.match === "/") {
      return (
        pathname === "/" ||
        pathname === "/(superadmin)" ||
        pathname === "/superadmin"
      );
    }

    return pathname.endsWith(item.match);
  };

  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <ScrollView
        style={styles.sidebarScroll}
        contentContainerStyle={styles.sidebarContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.brand}
          activeOpacity={0.82}
          onPress={() => onNavigate("/(superadmin)")}
        >
          <View style={styles.brandMark}>
            <Ionicons name="heart" size={20} color="#FFFFFF" />
          </View>

          <View>
            <Text style={styles.brandName}>VolunServe</Text>
            <Text style={styles.brandTagline}>People. Response. Community.</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sidebarLabel}>SUPER ADMIN</Text>

        <View style={styles.navGroup}>
          {navItems.map((item) => {
            const active = isActive(item);

            return (
              <TouchableOpacity
                key={item.route}
                style={[styles.navItem, active && styles.navItemActive]}
                activeOpacity={0.82}
                onPress={() => onNavigate(item.route)}
              >
                <Ionicons
                  name={item.icon}
                  size={21}
                  color={active ? "#FFFFFF" : "#BDD0EA"}
                />
                <Text
                  style={[
                    styles.navText,
                    active && styles.navTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sidebarDivider} />

        <Text style={styles.sidebarLabel}>SWITCH MODE</Text>

        <TouchableOpacity
          style={styles.modeItem}
          activeOpacity={0.82}
          onPress={onResident}
        >
          <Ionicons name="person-outline" size={21} color="#BDD0EA" />
          <Text style={styles.navText}>Use as Resident</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.modeItem}
          activeOpacity={0.82}
          onPress={onVolunteer}
        >
          <Ionicons name="people-outline" size={21} color="#BDD0EA" />
          <Text style={styles.navText}>Use as Volunteer</Text>
        </TouchableOpacity>

        <View style={styles.sidebarDivider} />

        <TouchableOpacity
          style={styles.modeItem}
          activeOpacity={0.82}
          onPress={onSignOut}
        >
          <Ionicons name="log-out-outline" size={22} color="#E7EEF9" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {!compact ? (
        <View style={styles.sidebarFooter}>
          <Text style={styles.footerText}>
            A SAFER{`\n`}STRONGER{`\n`}COMMUNITY{`\n`}TOGETHER.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F7F9FC",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F9FC",
  },

  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },

  sidebar: {
    width: 280,
    backgroundColor: "#14243D",
    borderRightWidth: 1,
    borderRightColor: "#203653",
  },

  sidebarCompact: {
    width: 280,
    maxWidth: "86%",
    height: "100%",
  },

  sidebarScroll: {
    flex: 1,
  },

  sidebarContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 26,
  },

  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 30,
  },

  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5B4BDB",
  },

  brandName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },

  brandTagline: {
    color: "#8FA6C5",
    fontSize: 10,
    marginTop: 1,
  },

  sidebarLabel: {
    color: "#7890B1",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.05,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  navGroup: {
    gap: 5,
  },

  navItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 12,
    paddingHorizontal: 14,
  },

  navItemActive: {
    backgroundColor: "#49439B",
  },

  navText: {
    color: "#D8E4F3",
    fontSize: 15,
    fontWeight: "600",
  },

  navTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  modeItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 12,
    paddingHorizontal: 14,
  },

  sidebarDivider: {
    height: 1,
    backgroundColor: "#304563",
    marginHorizontal: 10,
    marginVertical: 20,
  },

  signOutText: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "700",
  },

  sidebarFooter: {
    paddingHorizontal: 32,
    paddingBottom: 26,
  },

  footerText: {
    color: "#7890B1",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    letterSpacing: 1.4,
  },

  workspace: {
    flex: 1,
    minWidth: 0,
  },

  topbar: {
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF1",
  },

  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E8F0",
    backgroundColor: "#FFFFFF",
  },

  accountArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    maxWidth: 280,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#697696",
  },

  avatarText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  accountCopy: {
    maxWidth: 220,
  },

  accountName: {
    color: "#17213A",
    fontSize: 14,
    fontWeight: "800",
  },

  accountRole: {
    color: "#718096",
    fontSize: 12,
    marginTop: 2,
  },

  contentArea: {
    flex: 1,
  },

  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
});