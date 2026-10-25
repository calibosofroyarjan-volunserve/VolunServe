import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, Tabs, useSegments, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import SidebarBotanicalDecor from "../../components/ui/SidebarBotanicalDecor";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
    name: "community-events",
    label: "Community Events",
    icon: "calendar-outline",
    activeIcon: "calendar",
  },
];

// Notifications remain accessible from the dashboard bell and updates card.
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
    name: "community-events",
    label: "Community Events",
    icon: "calendar-outline",
    activeIcon: "calendar",
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

type ModuleIdentity = { subtitle: string; colors: readonly [string, string] };
const residentModuleIdentity: Record<string, ModuleIdentity> = {
  index: { subtitle: "Platform Overview", colors: ["#00846B", "#04B78F"] },
  "map-tracking": { subtitle: "Real-Time Tracking", colors: ["#00587C", "#168BC8"] },
  "disaster-response": { subtitle: "Report and Get Help", colors: ["#963C2F", "#D86747"] },
  resident: { subtitle: "Community Support", colors: ["#05727D", "#0BA99F"] },
  donation: { subtitle: "Give and Make an Impact", colors: ["#227943", "#50A95B"] },
  "my-cases": { subtitle: "Track Your Requests", colors: ["#135679", "#308DC6"] },
  "community-events": { subtitle: "Join Local Activities", colors: ["#516A28", "#86A83E"] },
};

const volunteerModuleIdentity: Record<string, ModuleIdentity> = {
  index: { subtitle: "Volunteer Overview", colors: ["#00846B", "#04B78F"] },
  "map-tracking": { subtitle: "Response Tracking", colors: ["#0756AC", "#436FD6"] },
  volunteer: { subtitle: "Assigned Response Tasks", colors: ["#037B83", "#0AB6A6"] },
  "community-events": { subtitle: "Join Community Activities", colors: ["#567326", "#99B645"] },
  donation: { subtitle: "Community Support", colors: ["#1A8244", "#55BA5E"] },
  "volunteer-impact": { subtitle: "Your Contributions", colors: ["#7B56BC", "#A683D8"] },
  certificate: { subtitle: "Verified Service Records", colors: ["#1D6DA6", "#429CD4"] },
  notifications: { subtitle: "Volunteer Alerts", colors: ["#9363B9", "#BC93D4"] },
  announcements: { subtitle: "Official Community News", colors: ["#BE762F", "#E6A956"] },
};

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
    name: "community-events",
    label: "Events",
    icon: "calendar-outline",
    activeIcon: "calendar",
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
    name: "community-events",
    label: "Events",
    icon: "calendar-outline",
    activeIcon: "calendar",
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
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isDesktopWeb = Platform.OS === "web" && width >= 1040;
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const mode = profile ? activeModeForProfile(profile) : "resident";
  const menuItems = mode === "volunteer" ? volunteerDesktopTabs : residentDesktopTabs;
  const canSwitchMode = Boolean(profile && hasResidentAccess(profile) && hasVolunteerAccess(profile));
  const adminRoute = profile ? administrativeRouteForProfile(profile) : null;

  const visit = (name: string) => {
    setMobileMenuOpen(false);
    router.push((name === "index" ? "/(tabs)" : `/(tabs)/${name}`) as Href);
  };

  const switchMobileMode = async () => {
    if (!canSwitchMode) return;
    setMobileMenuOpen(false);
    try {
      await setActiveUserMode(mode === "volunteer" ? "resident" : "volunteer");
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Unable to switch mode", error?.message || "Please try again.");
    }
  };

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

  // On phones, keep the COMPLETE navigation in a slide-out sidebar.
  // The desktop sidebar remains unchanged; there is no bottom mobile tab bar.
  if (!isDesktopWeb) {
    return (
      <View style={styles.mobileShell}>
        <View style={[styles.mobileHeader, { paddingTop: insets.top, height: 60 + insets.top }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mobileMenuOpen ? "Close sidebar" : "Open sidebar"}
            onPress={() => setMobileMenuOpen((current) => !current)}
            style={styles.mobileHeaderButton}
          >
            <Ionicons name={mobileMenuOpen ? "close" : "menu"} size={22} color="#12365B" />
          </Pressable>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.mobileHeaderLogo}
            resizeMode="contain"
          />
          <View style={styles.mobileBrandText}>
            <Text style={styles.mobileBrandName} numberOfLines={1}>VolunServe</Text>
            <Text style={styles.mobileBrandMode} numberOfLines={1}>
              {mode === "volunteer" ? "VOLUNTEER MODE" : "RESIDENT MODE"}
            </Text>
          </View>
          <View style={styles.mobileHeaderStatus}>
            <View style={styles.mobileStatusDot} />
            <Text style={styles.mobileStatusText} numberOfLines={1}>Online</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => visit("notifications")}
            style={styles.mobileHeaderButton}
          >
            <Ionicons name="notifications-outline" size={21} color="#12365B" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={() => visit("profile")}
            style={styles.mobileHeaderButton}
          >
            <Ionicons name="person-circle-outline" size={23} color="#12365B" />
          </Pressable>
        </View>
        <View style={styles.mobileMain}>
          <Tabs screenOptions={{ headerShown: false, tabBarPosition: "bottom" }} tabBar={() => null} />
        </View>
        {mobileMenuOpen ? (
          <View style={[styles.mobileDrawerLayer, { top: 60 + insets.top }]}>
            <Pressable
              style={styles.mobileDrawerBackdrop}
              onPress={() => setMobileMenuOpen(false)}
              accessibilityLabel="Close navigation drawer"
            />
            <LinearGradient colors={["#073A37", "#064D47", "#036151"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mobileDrawer}>
              <SidebarBotanicalDecor />
              <View style={styles.mobileDrawerBrand}>
                <Image
                  source={require("../../assets/images/logo.png")}
                  style={styles.mobileDrawerLogo}
                  resizeMode="contain"
                />
                <View style={styles.mobileDrawerBrandCopy}>
                  <Text style={styles.mobileDrawerTitle}>VolunServe</Text>
                  <Text style={styles.mobileDrawerSub}>
                    {mode === "volunteer" ? "VOLUNTEER MODE" : "RESIDENT MODE"}
                  </Text>
                </View>
              </View>
                            <ScrollView style={styles.mobileDrawerScroll} showsVerticalScrollIndicator>
                {menuItems.map((item) => {
                  const theme = (mode === "volunteer" ? volunteerModuleIdentity : residentModuleIdentity)[item.name];
                  const active = item.name === (segments[segments.length - 1] || "index");
                  return (
                    <Pressable key={item.name} accessibilityRole="button"
                      onPress={() => visit(item.name)}
                      style={({ pressed }) => [styles.mobileDrawerItem, active && styles.mobileDrawerActive, pressed && styles.mobilePressed]}>
                      {active ? <LinearGradient pointerEvents="none" colors={["#04987A", "#32B883"]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }}
                        style={styles.mobileDrawerItemOverlay} /> : null}
                      <LinearGradient colors={theme ? [...theme.colors] : ["#08766B", "#0BA69A"]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mobileDrawerIconBadge}>
                        <Ionicons name={item.icon as any} size={19} color="#FFFFFF" />
                      </LinearGradient>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.mobileDrawerItemText}>{item.label}</Text>
                        {theme ? <Text numberOfLines={1} style={styles.mobileDrawerSubtitle}>{theme.subtitle}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
                {canSwitchMode ? (
                  <Pressable onPress={() => void switchMobileMode()} style={styles.mobileDrawerItem}>
                    <Ionicons name="swap-horizontal-outline" size={20} color="#BDEDE2" />
                    <Text style={styles.mobileDrawerItemText}>
                      Switch to {mode === "volunteer" ? "Resident" : "Volunteer"} Mode
                    </Text>
                  </Pressable>
                ) : null}
                {adminRoute ? (
                  <Pressable onPress={() => {setMobileMenuOpen(false); router.push(adminRoute as Href);}} style={styles.mobileDrawerItem}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#0C7068" />
                    <Text style={styles.mobileDrawerItemText}>Admin Portal</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => visit("profile")} style={styles.mobileDrawerItem}>
                  <Ionicons name="settings-outline" size={20} color="#0C7068" />
                  <Text style={styles.mobileDrawerItemText}>Account Settings</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMobileMenuOpen(false);
                    void logoutUser().then(() => router.replace("/login")).catch(() => Alert.alert("Log out failed", "Please try again."));
                  }}
                  style={styles.mobileDrawerItem}
                >
                  <Ionicons name="log-out-outline" size={20} color="#E43D48" />
                  <Text style={[styles.mobileDrawerItemText, { color: "#C3303D" }]}>Log Out</Text>
                </Pressable>
              </ScrollView>
            </LinearGradient>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarPosition: "left" }}
      tabBar={(props) => <DesktopTabBar {...props} profile={profile} />}
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

  const tabs =
    mode === "volunteer" ? volunteerDesktopTabs : residentDesktopTabs;

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
    const route = state.routes.find(
      (item: any) => item.name === routeName
    );

    if (!route) return;

    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  return (
    <LinearGradient colors={["#07332F", "#044E47", "#036354"]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.desktopSidebar}>
      <SidebarBotanicalDecor />
      <View style={styles.desktopBrand}>
        <Image
          source={require("../../assets/images/logo.png")}
          resizeMode="cover"
          style={styles.desktopLogo}
        />
        <View style={styles.desktopBrandCopy}>
          <Text style={styles.desktopBrandTitle}>VolunServe</Text>
          <Text style={styles.desktopBrandSubtitle}>
            CITY OF SAN JOSE DEL MONTE
          </Text>
        </View>
      </View>

      <Text style={styles.residentModeLabel}>{mode === "volunteer" ? "VOLUNTEER MODE" : "RESIDENT MODE"}</Text>

      <ScrollView
        style={styles.desktopNavigationScroll}
        contentContainerStyle={[styles.desktopNavigation, mode === "resident" && styles.desktopResidentNavigation]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Main menu navigation"
      >
        {tabs.map((item) => {
          const routeIndex = state.routes.findIndex(
            (route: any) => route.name === item.name
          );

          if (routeIndex === -1) return null;

          const focused = state.index === routeIndex;
          const identity = mode === "resident"
            ? residentModuleIdentity[item.name]
            : volunteerModuleIdentity[item.name];

          return (
            <Pressable
              key={item.name}
              style={({ pressed }) => [
                styles.desktopNavItem,
                identity && styles.residentNavItem,
                focused && styles.desktopNavItemActive,
                focused && identity && styles.residentNavItemActive,
                pressed && styles.desktopPressed,
              ]}
              onPress={() => navigate(item.name)}
            >
              {focused && identity ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={["#00947A", "#068F74", "#43BC71"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }}
                  style={styles.residentNavSelectedGradient}
                />
              ) : null}
              <View
                style={[
                  styles.desktopNavIcon,
                  focused && styles.desktopNavIconActive,
                  identity && styles.residentNavIcon,
                ]}
              >
                {identity ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={[...identity.colors]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.residentIconGradient}
                  />
                ) : null}
                <Ionicons
                  name={(focused ? item.activeIcon : item.icon) as any}
                  size={20}
                  color={focused ? "#FFFFFF" : "#D9F5ED"}
                />
              </View>
              <View style={styles.residentNavCopy}>
                <Text
                  style={[
                    styles.desktopNavText,
                    focused && styles.desktopNavTextActive,
                    identity && styles.residentNavTitle,
                  ]}
                >{item.label}</Text>
                {identity ? (
                  <Text style={styles.residentNavSubtitle} numberOfLines={1}>
                    {identity.subtitle}
                  </Text>
                ) : null}
              </View>
              {focused ? (
                <View style={styles.desktopActiveMark} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.desktopUtilityArea}>
        {canSwitchMode ? (
          <Pressable
            style={({ pressed }) => [
              styles.desktopUtilityButton,
              pressed && styles.desktopPressed,
            ]}
            onPress={() => void switchMode()}
          >
            <Ionicons
              name="swap-horizontal-outline"
              size={18}
              color="#E6F5F2"
            />
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
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color="#6D28D9"
            />
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
          <Ionicons
            name="settings-outline"
            size={18}
            color="#E6F5F2"
          />
          <Text style={styles.desktopUtilityText}>Account Settings</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.desktopUtilityButton,
            pressed && styles.desktopPressed,
          ]}
          onPress={() => void logoutUser()}
        >
          <Ionicons
            name="log-out-outline"
            size={18}
            color="#DC3244"
          />
          <Text
            style={[styles.desktopUtilityText, styles.desktopLogoutText]}
          >
            Log Out
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
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

  const tabs =
    mode === "volunteer" ? volunteerMobileTabs : residentMobileTabs;

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
  // Isolated mobile shell and real slide-out navigation. Desktop styles untouched.
  mobileShell: { flex: 1, backgroundColor: "#F2F9FC" },
  mobileHeader: {
    height: 60, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#FFFFFF", paddingHorizontal: 7,
    borderBottomWidth: 1, borderBottomColor: "#E4EDF3", zIndex: 2,
  },
  mobileMain: { flex: 1 },
  mobileHeaderButton: {
    width: 35, height: 38, alignItems: "center", justifyContent: "center",
    borderRadius: 10, backgroundColor: "#F4F8FA",
  },
  mobileHeaderLogo: { width: 31, height: 31 },
  mobileBrandText: { flex: 1, minWidth: 0 },
  mobileBrandName: { color: "#006859", fontWeight: "900", fontSize: 15 },
  mobileBrandMode: { color: "#607890", fontSize: 9, fontWeight: "800" },
  mobileHeaderStatus: {
    minWidth: 37, flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 7, height: 30, backgroundColor: "#E9F8F1",
  },
  mobileStatusDot: { backgroundColor: "#00A17C", width: 6, height: 6, borderRadius: 3 },
  mobileStatusText: { fontSize: 9, fontWeight: "800", color: "#0B735D" },
  mobileDrawerLayer: { ...StyleSheet.absoluteFillObject, top: 60, zIndex: 100, flexDirection: "row" },
  mobileDrawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 25, 41, 0.45)" },
  mobileDrawer: { height: "100%", width: "82%", maxWidth: 310, backgroundColor: "#073A37", paddingTop: 18, paddingHorizontal: 15, paddingBottom: 12 },
  mobileDrawerBrand: { flexDirection: "row", alignItems: "center", gap: 11, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.16)" },
  mobileDrawerLogo: { width: 44, height: 44 },
  mobileDrawerBrandCopy: { flex: 1 },
  mobileDrawerTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  mobileDrawerSub: { color: "#B5E9D9", fontSize: 9, fontWeight: "800" },
  mobileDrawerLabel: { paddingTop: 17, paddingBottom: 9, color: "#90DBC8", fontWeight: "800", letterSpacing: 1.8, fontSize: 9.5 },
  mobileDrawerScroll: { flex: 1 },
  mobileDrawerItem: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 9, borderRadius: 12, marginBottom: 4, overflow: "hidden" },
  mobileDrawerItemOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
  mobileDrawerIconBadge: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mobileDrawerSubtitle: { color: "#B8DED3", fontSize: 9, marginTop: 2 },
  mobileDrawerActive: { backgroundColor: "#079776" },
  mobileDrawerItemText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12.5 },
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
    backgroundColor: "#07332F",
    borderRightWidth: 1,
    borderRightColor: "#13695E",
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
  desktopBrandCopy: {
    flex: 1,
    minWidth: 0,
  },
  desktopBrandTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  desktopBrandSubtitle: {
    marginTop: 1,
    color: "#B6E9DF",
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
    color: "#A7DCD4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  desktopNavigationScroll: {
    flex: 1,
    minHeight: 0,
    marginTop: 0,
  },
  desktopNavigation: {
    gap: 7,
    paddingRight: 3,
    paddingBottom: 10,
  },
  // Fill remaining height on large desktop displays while allowing scrolling
  // whenever the viewport is too short for all modules.
  desktopResidentNavigation: {
    flexGrow: 1,
    justifyContent: "space-evenly",
    paddingVertical: 10,
  },
  desktopNavItem: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 9,
    borderRadius: 13,
  },
  desktopNavItemActive: {
    backgroundColor: "#049C7B",
  },
  desktopNavIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  desktopNavIconActive: {
    backgroundColor: "#00775F",
  },
  desktopNavText: {
    flex: 1,
    color: "#E6F5F2",
    fontSize: 12,
    fontWeight: "700",
  },
  desktopNavTextActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  desktopActiveMark: {
    width: 4,
    height: 22,
    borderRadius: 3,
    backgroundColor: "#C5FFF1",
  },
  desktopUtilityArea: {
    flexShrink: 0,
    marginTop: 4,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
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
  desktopUtilityText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
  desktopLogoutText: {
    color: "#C92537",
  },
  residentSidebarAmbient: { position: "absolute", bottom: 20, left: -50, opacity: 0.055 },
  residentModeLabel: {
    marginTop: 25,
    marginBottom: 12,
    paddingHorizontal: 10,
    color: "#8EE6D1",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
  },
  residentSectionLabel: { marginTop: 10, color: "#83D8C8", letterSpacing: 2 },
  residentNavItem: { minHeight: 57, overflow: "hidden", gap: 11, paddingHorizontal: 8, borderRadius: 14 },
  residentNavItemActive: { backgroundColor: "#079776" },
  residentNavSelectedGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 14 },
  residentNavIcon: {
    width: 40, height: 40, borderRadius: 13, overflow: "hidden", backgroundColor: "#064F53",
  },
  residentIconGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 13, opacity: 1 },
  residentNavCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  residentNavTitle: { fontSize: 12.5, color: "#FFFFFF", fontWeight: "800" },
  residentNavSubtitle: { fontSize: 9.5, lineHeight: 13, color: "#BBDFD8", marginTop: 3 },
  desktopPressed: {
    opacity: 0.72,
  },
});
