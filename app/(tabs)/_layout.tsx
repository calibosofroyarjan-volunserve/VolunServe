import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, Tabs, useSegments, type Href } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  activeModeForProfile,
  administrativeRouteForProfile,
  hasResidentAccess,
  hasVolunteerAccess,
  isApprovedProfile,
  logoutUser,
  setActiveUserMode,
  UserProfile,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type TabDefinition = {
  name: string;
  label: string;
  icon: string;
  activeIcon: string;
};

const residentDesktopTabs: TabDefinition[] = [
  {
    name: "index",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    name: "map-tracking",
    label: "Live Map",
    icon: "map-outline",
    activeIcon: "map",
  },
  {
    name: "disaster-response",
    label: "Emergency Report",
    icon: "alert-circle-outline",
    activeIcon: "alert-circle",
  },
  {
    name: "resident",
    label: "Request Assistance",
    icon: "hand-left-outline",
    activeIcon: "hand-left",
  },
  {
    name: "donation",
    label: "Donations",
    icon: "heart-outline",
    activeIcon: "heart",
  },
  {
    name: "my-cases",
    label: "My Reports",
    icon: "document-text-outline",
    activeIcon: "document-text",
  },
  {
    name: "notifications",
    label: "Notifications",
    icon: "notifications-outline",
    activeIcon: "notifications",
  },
  {
    name: "announcements",
    label: "Announcements",
    icon: "megaphone-outline",
    activeIcon: "megaphone",
  },
];

const volunteerDesktopTabs: TabDefinition[] = [
  {
    name: "index",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    name: "map-tracking",
    label: "Live Response Map",
    icon: "map-outline",
    activeIcon: "map",
  },
  {
    name: "volunteer",
    label: "Volunteer Tasks",
    icon: "people-outline",
    activeIcon: "people",
  },
  {
    name: "donation",
    label: "Donation Operations",
    icon: "heart-outline",
    activeIcon: "heart",
  },
  {
    name: "volunteer-impact",
    label: "My Progress",
    icon: "ribbon-outline",
    activeIcon: "ribbon",
  },
  {
    name: "certificate",
    label: "Certificates",
    icon: "document-outline",
    activeIcon: "document",
  },
  {
    name: "notifications",
    label: "Notifications",
    icon: "notifications-outline",
    activeIcon: "notifications",
  },
  {
    name: "announcements",
    label: "Announcements",
    icon: "megaphone-outline",
    activeIcon: "megaphone",
  },
];

const residentMobileTabs: TabDefinition[] = [
  {
    name: "index",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    name: "map-tracking",
    label: "Map",
    icon: "location-outline",
    activeIcon: "location",
  },
  {
    name: "disaster-response",
    label: "Report",
    icon: "alert-circle-outline",
    activeIcon: "alert-circle",
  },
  {
    name: "profile",
    label: "Profile",
    icon: "person-outline",
    activeIcon: "person",
  },
];

const volunteerMobileTabs: TabDefinition[] = [
  {
    name: "index",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    name: "map-tracking",
    label: "Map",
    icon: "location-outline",
    activeIcon: "location",
  },
  {
    name: "volunteer",
    label: "Tasks",
    icon: "people-outline",
    activeIcon: "people",
  },
  {
    name: "profile",
    label: "Profile",
    icon: "person-outline",
    activeIcon: "person",
  },
];

const volunteerOnlyRoutes = new Set([
  "volunteer",
  "volunteer-impact",
  "certificate",
]);

const residentOnlyRoutes = new Set([
  "disaster-response",
  "resident",
  "my-cases",
  "donation-history",
]);

export default function TabLayout() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const isDesktopWeb = Platform.OS === "web" && width >= 1040;

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#078F82" />
        <Text style={styles.loadingText}>Checking your account...</Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return <Redirect href="/login" />;
  }

  const currentMode = activeModeForProfile(profile);
  const residentAccess = hasResidentAccess(profile);
  const volunteerAccess = hasVolunteerAccess(profile);
  const currentRoute = segments[segments.length - 1];

  if (typeof currentRoute === "string") {
    if (
      volunteerOnlyRoutes.has(currentRoute) &&
      (!volunteerAccess || currentMode !== "volunteer")
    ) {
      return <Redirect href="/(tabs)" />;
    }

    if (
      residentOnlyRoutes.has(currentRoute) &&
      (!residentAccess || currentMode !== "resident")
    ) {
      return <Redirect href="/(tabs)" />;
    }
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isDesktopWeb ? "left" : "bottom",
      }}
      tabBar={(props) =>
        isDesktopWeb ? (
          <DesktopTabBar {...props} profile={profile} />
        ) : (
          <CustomTabBar {...props} profile={profile} />
        )
      }
    />
  );
}

function DesktopTabBar({
  state,
  navigation,
  profile,
}: any & { profile: UserProfile }) {
  const mode = activeModeForProfile(profile);
  const volunteerAccess = hasVolunteerAccess(profile);
  const residentAccess = hasResidentAccess(profile);
  const canSwitchMode = volunteerAccess && residentAccess;
  const adminRoute = administrativeRouteForProfile(profile);
  const portalLabel =
    profile.role === "superadmin" ? "Super Admin Portal" : "Admin Portal";
  const tabs = mode === "volunteer" ? volunteerDesktopTabs : residentDesktopTabs;

  const switchMode = async () => {
    if (!canSwitchMode) return;

    const nextMode = mode === "volunteer" ? "resident" : "volunteer";

    try {
      await setActiveUserMode(nextMode);
      navigation.navigate("index");
    } catch (error: any) {
      Alert.alert(
        "Mode Switch Failed",
        error?.message || "Unable to switch account mode."
      );
    }
  };

  const openAdminPortal = () => {
    if (!adminRoute) return;
    router.replace(adminRoute as Href);
  };

  const navigate = (routeName: string) => {
    const route = state.routes.find((item: any) => item.name === routeName);
    if (!route) return;

    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) navigation.navigate(route.name);
  };



  return (
    <View style={styles.desktopSidebar}>
      <View style={styles.desktopBrand}>
        <Image
          source={require("../../assets/images/logo.png")}
          resizeMode="cover"
          style={styles.desktopLogo}
        />
        <View style={styles.desktopBrandCopy}>
          <Text style={styles.desktopBrandTitle}>VolunServe</Text>
          <Text style={styles.desktopBrandSubtitle}>
            {mode === "volunteer" ? "VOLUNTEER MODE" : "RESIDENT MODE"}
          </Text>
        </View>
      </View>

      <Text style={styles.desktopSectionLabel}>MAIN MENU</Text>
      <View style={styles.desktopNavigation}>
        {tabs.map((item) => {
          const routeIndex = state.routes.findIndex(
            (route: any) => route.name === item.name
          );
          if (routeIndex === -1) return null;

          const focused = state.index === routeIndex;
          return (
            <Pressable
              key={item.name}
              style={({ pressed }) => [
                styles.desktopNavItem,
                focused && styles.desktopNavItemActive,
                pressed && styles.desktopPressed,
              ]}
              onPress={() => navigate(item.name)}
            >
              <View
                style={[
                  styles.desktopNavIcon,
                  focused && styles.desktopNavIconActive,
                ]}
              >
                <Ionicons
                  name={(focused ? item.activeIcon : item.icon) as any}
                  size={20}
                  color={focused ? "#FFFFFF" : "#60728A"}
                />
              </View>
              <Text
                style={[
                  styles.desktopNavText,
                  focused && styles.desktopNavTextActive,
                ]}
              >
                {item.label}
              </Text>
              {focused ? <View style={styles.desktopActiveMark} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.desktopUtilityArea}>
        {canSwitchMode ? (
          <Pressable
            style={({ pressed }) => [
              styles.desktopUtilityButton,
              pressed && styles.desktopPressed,
            ]}
            onPress={() => void switchMode()}
          >
            <Ionicons name="swap-horizontal-outline" size={18} color="#60728A" />
            <Text style={styles.desktopUtilityText}>
              {mode === "volunteer"
                ? "Switch to Resident Mode"
                : "Switch to Volunteer Mode"}
            </Text>
          </Pressable>
        ) : null}

        {adminRoute ? (
          <Pressable
            style={({ pressed }) => [
              styles.desktopUtilityButton,
              styles.desktopPortalButton,
              pressed && styles.desktopPressed,
            ]}
            onPress={openAdminPortal}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color="#6D28D9" />
            <Text style={styles.desktopPortalText}>{portalLabel}</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.desktopUtilityButton,
            pressed && styles.desktopPressed,
          ]}
          onPress={() => navigate("profile")}
        >
          <Ionicons name="settings-outline" size={18} color="#60728A" />
          <Text style={styles.desktopUtilityText}>Account Settings</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.desktopUtilityButton,
            pressed && styles.desktopPressed,
          ]}
          onPress={() => void logoutUser()}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC3244" />
          <Text style={[styles.desktopUtilityText, styles.desktopLogoutText]}>
            Log Out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function CustomTabBar({
  state,
  navigation,
  profile,
}: any & { profile: UserProfile }) {
  const insets = useSafeAreaInsets();
  const mode = activeModeForProfile(profile);
  const volunteerAccess = hasVolunteerAccess(profile);
  const residentAccess = hasResidentAccess(profile);
  const canSwitchMode = volunteerAccess && residentAccess;
  const adminRoute = administrativeRouteForProfile(profile);
  const portalLabel =
    profile.role === "superadmin" ? "Super Admin" : "Admin";
  const tabs = mode === "volunteer" ? volunteerMobileTabs : residentMobileTabs;

  const switchMode = async () => {
    if (!canSwitchMode) return;

    const nextMode = mode === "volunteer" ? "resident" : "volunteer";

    try {
      await setActiveUserMode(nextMode);
      navigation.navigate("index");
    } catch (error: any) {
      Alert.alert(
        "Mode Switch Failed",
        error?.message || "Unable to switch account mode."
      );
    }
  };

  const openAdminPortal = () => {
    if (!adminRoute) return;
    router.replace(adminRoute as Href);
  };

  return (
    <View
      style={[
        styles.tabBarWrapper,
        {
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
      ]}
    >
      {canSwitchMode || adminRoute ? (
        <View style={styles.mobileModeRow}>
          {canSwitchMode ? (
            <Pressable
              style={({ pressed }) => [
                styles.mobileModeButton,
                pressed && styles.mobilePressed,
              ]}
              onPress={() => void switchMode()}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={16}
                color="#0F766E"
              />
              <Text style={styles.mobileModeButtonText}>
                {mode === "volunteer" ? "Resident Mode" : "Volunteer Mode"}
              </Text>
            </Pressable>
          ) : null}

          {adminRoute ? (
            <Pressable
              style={({ pressed }) => [
                styles.mobilePortalButton,
                pressed && styles.mobilePressed,
              ]}
              onPress={openAdminPortal}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color="#6D28D9"
              />
              <Text style={styles.mobilePortalButtonText}>
                {portalLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const routeIndex = state.routes.findIndex(
            (route: any) => route.name === item.name
          );

          if (routeIndex === -1) return null;

          const route = state.routes[routeIndex];
          const focused = state.index === routeIndex;

          return (
            <Pressable
              key={item.name}
              style={({ pressed }) => [
                styles.tabItem,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            >
              <View
                style={[
                  styles.tabInner,
                  focused && styles.tabInnerActive,
                ]}
              >
                <Ionicons
                  name={(focused ? item.activeIcon : item.icon) as any}
                  size={24}
                  color={focused ? "#078F82" : "#7A8799"}
                />

                <Text
                  style={[
                    styles.tabText,
                    focused && styles.tabTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },
  tabBarWrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E6EDF2",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 10,
  },

  mobileModeRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 7,
  },

  mobileModeButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#E7F8F4",
  },

  mobileModeButtonText: {
    color: "#0F766E",
    fontSize: 11,
    fontWeight: "800",
  },

  mobilePortalButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F3E8FF",
  },

  mobilePortalButtonText: {
    color: "#6D28D9",
    fontSize: 11,
    fontWeight: "800",
  },

  mobilePressed: {
    opacity: 0.72,
  },

  tabBar: {
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingTop: 8,
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabInner: {
    minWidth: 64,
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  tabInnerActive: {
    backgroundColor: "#E7F8F4",
  },

  tabText: {
    fontSize: 11.5,
    color: "#7A8799",
    marginTop: 3,
    fontWeight: "500",
  },

  tabTextActive: {
    color: "#078F82",
    fontWeight: "800",
  },

  desktopSidebar: {
    width: 268,
    height: "100%",
    paddingHorizontal: 17,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E1E8EF",
    shadowColor: "#183153",
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  desktopBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 7,
  },
  desktopLogo: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: "#E8F8F5",
  },
  desktopBrandCopy: { flex: 1, minWidth: 0 },
  desktopBrandTitle: {
    color: "#0F675F",
    fontSize: 20,
    fontWeight: "900",
  },
  desktopBrandSubtitle: {
    marginTop: 1,
    color: "#718095",
    fontSize: 8.5,
    fontWeight: "700",
  },
  desktopStatusCard: {
    marginTop: 21,
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: "#EAF8F3",
    borderWidth: 1,
    borderColor: "#D3EEE5",
  },
  desktopStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#08A473",
  },
  desktopStatusCopy: { flex: 1 },
  desktopStatusTitle: {
    color: "#08725A",
    fontSize: 11.5,
    fontWeight: "900",
  },
  desktopStatusText: {
    marginTop: 2,
    color: "#689083",
    fontSize: 9.5,
  },
  desktopSectionLabel: {
    marginTop: 24,
    marginBottom: 9,
    paddingHorizontal: 10,
    color: "#95A1B0",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  desktopNavigation: { gap: 4 },
  desktopNavItem: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 9,
    borderRadius: 13,
  },
  desktopNavItemActive: { backgroundColor: "#EAF8F4" },
  desktopNavIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F5F8",
  },
  desktopNavIconActive: { backgroundColor: "#078F82" },
  desktopNavText: {
    flex: 1,
    color: "#52647B",
    fontSize: 12,
    fontWeight: "700",
  },
  desktopNavTextActive: { color: "#076E66", fontWeight: "900" },
  desktopActiveMark: {
    width: 4,
    height: 22,
    borderRadius: 3,
    backgroundColor: "#078F82",
  },
  desktopUtilityArea: {
    marginTop: "auto",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E7EDF2",
    gap: 4,
  },
  desktopUtilityButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  desktopPortalButton: {
    backgroundColor: "#F5F3FF",
  },
  desktopPortalText: {
    flex: 1,
    color: "#6D28D9",
    fontSize: 11.5,
    fontWeight: "900",
  },
  desktopUtilityText: { flex: 1, color: "#52647B", fontSize: 11.5, fontWeight: "700" },
  desktopLogoutText: { color: "#C92537" },
  desktopPressed: { opacity: 0.72 },
});