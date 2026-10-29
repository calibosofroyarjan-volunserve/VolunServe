import { Ionicons } from "@expo/vector-icons";
import {
  Href,
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
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import {
  isApprovedProfile,
  logoutUser,
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
    label: "System Overview",
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
    label: "Admin Activity & Audit Logs",
    icon: "time-outline",
    route: "/(superadmin)/admin-logs",
    match: "/admin-logs",
  },
  {
    label: "System Records (Read Only)",
    icon: "albums-outline",
    route: "/(superadmin)/all-records",
    match: "/all-records",
  },
];

export default function SuperAdminLayout() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pathname = usePathname();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#078F82" />
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
  const activeSection = pathname.endsWith("/system-settings") ? "System Settings" : navItems.find(item => item.match === "/" ? (pathname === "/" || pathname === "/(superadmin)" || pathname === "/superadmin") : pathname.endsWith(item.match))?.label || "System Overview";

  const fullName =
    String(profile.fullName || profile.email || "Super Admin").trim();

  const nameParts = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const initials = nameParts.length
    ? nameParts.map((part) => part[0]?.toUpperCase()).join("")
    : "SA";

  const signOut = async () => {
    try {
      setDrawerOpen(false);
      setAccountOpen(false);
      await logoutUser();
      router.replace("/admin-login" as Href);
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
          onNavigate={(route) => { setAccountOpen(false); router.push(route as Href); }}
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
                setAccountOpen(false);
                router.push(route as Href);
              }}
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
            <View style={styles.breadcrumb} accessibilityLabel="Super Admin current section">
              <Ionicons name="shield-checkmark-outline" color="#0A7D60" size={18} />
              <Text style={styles.breadcrumbParent}>Super Admin</Text>
              <Ionicons name="chevron-forward-outline" color="#8EA9A0" size={13} />
              <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{activeSection}</Text>
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Super Admin profile dropdown"
            accessibilityState={{ expanded: accountOpen }}
            activeOpacity={0.84}
            onPress={() => setAccountOpen(value => !value)}
            style={styles.accountArea}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountName} numberOfLines={1}>{fullName}</Text>
              <Text style={styles.accountRole}>Programmer · Super Admin</Text>
            </View>
            <Ionicons name={accountOpen ? "chevron-up" : "chevron-down"} size={16} color="#416A5A" />
          </TouchableOpacity>
        </View>

        {accountOpen && (
          <View style={styles.profileMenu} accessibilityLabel="Super Admin profile dropdown">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="System Settings"
              style={styles.profileMenuAction}
              onPress={() => {
                setAccountOpen(false);
                router.push("/(superadmin)/system-settings" as Href);
              }}
            >
              <Ionicons name="settings-outline" size={20} color="#087A62" />
              <Text style={styles.profileMenuText}>System Settings</Text>
              <Ionicons name="chevron-forward" size={15} color="#79978A" />
            </TouchableOpacity>
            <View style={styles.profileMenuDivider} />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              style={styles.profileMenuAction}
              onPress={() => { setAccountOpen(false); void signOut(); }}
            >
              <Ionicons name="log-out-outline" size={20} color="#B42318" />
              <Text style={styles.profileMenuSignOut}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.contentArea}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: "#F6F8F7",
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
  compact = false,
}: {
  onNavigate: (route: string) => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.match === "/"
      ? pathname === "/" || pathname === "/(superadmin)" || pathname === "/superadmin"
      : pathname.endsWith(item.match);

  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View pointerEvents="none" style={styles.sidebarDecoration}>
        <Ionicons name="leaf-outline" size={180} color="#57B89C" />
      </View>
      <TouchableOpacity
        style={styles.brand}
        accessibilityRole="button"
        accessibilityLabel="Super Admin dashboard"
        activeOpacity={0.85}
        onPress={() => onNavigate("/(superadmin)")}
      >
        <Image
          source={require("../../assets/images/logo.png")}
          style={styles.brandLogo}
          resizeMode="cover"
          accessibilityLabel="VolunServe logo"
        />
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>VolunServe</Text>
          <Text style={styles.brandTagline}>CITY OF SAN JOSE DEL MONTE</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.sidebarTitle}>SUPER ADMIN PORTAL</Text>
      <Text style={styles.sidebarLabel}>SYSTEM GOVERNANCE</Text>

      <ScrollView
        style={styles.sidebarScroll}
        contentContainerStyle={styles.sidebarContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Super Admin navigation menu"
      >
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.navItem, active && styles.navItemActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              activeOpacity={0.82}
              onPress={() => onNavigate(item.route)}
            >
              <View style={[styles.navIcon, active && styles.navIconActive]}>
                <Ionicons
                  name={item.icon}
                  size={19}
                  color={active ? "#FFFFFF" : "#D9F5ED"}
                />
              </View>
              <Text style={[styles.navText, active && styles.navTextActive]} numberOfLines={2}>
                {item.label}
              </Text>
              {active && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F2F9FC",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F9FC",
  },
  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },
  sidebar: {
    width: 268,
    height: "100%",
    minHeight: 0,
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: "#083E34",
    borderRightWidth: 1,
    borderRightColor: "#DDE8E3",
  },
  sidebarCompact: {
    width: 268,
    maxWidth: "86%",
    height: "100%",
  },
  brand: {
    minHeight: 91,
    paddingTop: 20,
    paddingBottom: 13,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flexShrink: 0,
  },
  brandLogo: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: "#E8F8F5",
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  brandName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  brandTagline: {
    marginTop: 2,
    color: "#B6E9DF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.65,
  },
  sidebarDecoration: { position: "absolute", right: -65, bottom: 55, opacity: 0.16 },
  sidebarTitle: { color: "#D9FFF1", fontSize: 11, fontWeight: "900", letterSpacing: 1.15, marginLeft: 26, marginTop: 4, marginBottom: 0 },
  sidebarLabel: {
    flexShrink: 0,
    marginTop: 5,
    marginBottom: 8,
    marginLeft: 27,
    color: "#A7DCD4",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  sidebarScroll: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 10,
  },
  sidebarContent: {
    paddingHorizontal: 6,
    paddingRight: 9,
    paddingBottom: 18,
    gap: 3,
  },
  navItem: {
    minHeight: 49,
    marginBottom: 3,
    paddingHorizontal: 9,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    overflow: "hidden",
  },
  navSelectedGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 13 },
  navItemActive: {
    backgroundColor: "#126E59",
  },
  navIcon: {
    width: 35,
    height: 35,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  navIconGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
  navIconActive: {
    backgroundColor: "#126E59",
  },
  navText: {
    flex: 1,
    color: "#D8E6E1",
    fontSize: 13,
    fontWeight: "500",
  },
  navTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  activeIndicator: {
    width: 3,
    height: 22,
    borderRadius: 3,
    backgroundColor: "#E1FFF6",
  },
  sidebarUtility: {
    flexShrink: 0,
    marginHorizontal: 17,
    paddingTop: 11,
    paddingBottom: 15,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  logoutButton: {
    minHeight: 43,
    borderRadius: 11,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 11,
  },
  signOutText: {
    color: "#FFCFCF",
    fontSize: 12,
    fontWeight: "800",
  },
  workspace: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F2F9FC",
  },
  topbar: {
    minHeight: 65,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF1",
  },
  breadcrumb: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  breadcrumbParent: { color: "#537569", fontSize: 12, fontWeight: "700" },
  breadcrumbCurrent: { color: "#124A39", fontSize: 12, fontWeight: "900", flexShrink: 1 },
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
  profileMenu: {
    position: "absolute", top: 63, right: 20, zIndex: 100,
    width: 234, backgroundColor: "#FFFFFF", borderRadius: 13,
    padding: 8, borderWidth: 1, borderColor: "#D8E9DF",
    shadowColor: "#123D2F", shadowOpacity: 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 15,
  },
  profileMenuAction: { flexDirection: "row", alignItems: "center", gap: 10,
    minHeight: 46, paddingHorizontal: 11, borderRadius: 9 },
  profileMenuText: { flex: 1, color: "#174B3E", fontWeight: "800", fontSize: 13 },
  profileMenuSignOut: { flex: 1, color: "#B42318", fontWeight: "800", fontSize: 13 },
  profileMenuDivider: { height: 1, backgroundColor: "#E5EEE9", marginVertical: 5, marginHorizontal: 8 },
  accountArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    maxWidth: 280,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#078F82",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  accountCopy: {
    maxWidth: 220,
    minWidth: 0,
  },
  accountName: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },
  accountRole: {
    color: "#64748B",
    fontSize: 10.5,
    marginTop: 2,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
});
