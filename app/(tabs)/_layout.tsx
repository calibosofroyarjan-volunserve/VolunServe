import { AppAlert } from "../../lib/appDialog";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, Tabs, useSegments, type Href } from "expo-router";
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
    name: "disaster-response",
    label: "Emergency Reports",
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
    name: "community-events",
    label: "Community Events",
    icon: "calendar-outline",
    activeIcon: "calendar",
  },
  {
    name: "my-cases",
    label: "My Reports",
    icon: "document-text-outline",
    activeIcon: "document-text",
  },
  {
    name: "profile",
    label: "My Profile",
    icon: "person-circle-outline",
    activeIcon: "person-circle",
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
    label: "Donations",
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
  {
    name: "profile",
    label: "My Profile",
    icon: "person-circle-outline",
    activeIcon: "person-circle",
  },
];

type ModuleIdentity = { subtitle: string; colors: readonly [string, string] };
const residentModuleIdentity: Record<string, ModuleIdentity> = {
  index: { subtitle: "Resident Overview", colors: ["#00846B", "#04B78F"] },
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

// Hidden legacy map links still highlight their owning module in the sidebar.
const owningModule = (route: string, mode: string) =>
  route === "map-tracking"
    ? mode === "volunteer" ? "volunteer" : "disaster-response"
    : route;

export default function TabLayout() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isDesktopWeb = Platform.OS === "web" && width >= 1040;
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = React.useState(false);

  const mode = profile ? activeModeForProfile(profile) : "resident";
  const menuItems = mode === "volunteer" ? volunteerDesktopTabs : residentDesktopTabs;
  const canSwitchMode = Boolean(profile && hasResidentAccess(profile) && hasVolunteerAccess(profile));
  const adminRoute = profile ? administrativeRouteForProfile(profile) : null;
  const currentModule = (menuItems.find((item) => item.name === owningModule(String(segments[segments.length - 1] || "index"), mode)) || menuItems[0]).label;
  const identityNeedsAction = !!profile && mode === "resident" &&
    profile.identityVerified !== true &&
    (profile.identityStatus === "basic" || profile.identityStatus === "failed");
  const volunteerApplicationReady = !!profile && mode === "resident" &&
    !hasVolunteerAccess(profile) &&
    (profile.identityVerified === true || profile.identityStatus === "verified");

  const visit = (name: string) => {
    setMobileMenuOpen(false);
    setMobileProfileOpen(false);
    router.push((name === "index" ? "/(tabs)" : `/(tabs)/${name}`) as Href);
  };

  const switchMobileMode = async () => {
    if (!canSwitchMode) return;
    setMobileMenuOpen(false);
    setMobileProfileOpen(false);
    try {
      await setActiveUserMode(mode === "volunteer" ? "resident" : "volunteer");
      router.replace("/(tabs)");
    } catch (error: any) {
      AppAlert.alert("Unable to switch mode", error?.message || "Please try again.");
    }
  };

  const confirmMobileLogout = () => {
    const logOut = async () => {
      try {
        await logoutUser();
        router.replace("/login");
      } catch (error: any) {
        AppAlert.alert("Log out failed", error?.message || "Please try again.");
      }
    };
    // The same safe confirmation is used on mobile and web.
    AppAlert.alert("Log Out", "Are you sure you want to log out of VolunServe?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => void logOut() },
    ]);
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
            onPress={() => { setMobileProfileOpen(false); setMobileMenuOpen((current) => !current); }}
            style={styles.mobileHeaderButton}
          >
            <Ionicons name={mobileMenuOpen ? "close" : "menu"} size={22} color="#173D32" />
          </Pressable>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.mobileHeaderLogo}
            resizeMode="contain"
          />
          <View style={styles.mobileBrandText}>
            <Text style={styles.mobileBrandName} numberOfLines={1}>VolunServe</Text>
            <Text style={styles.mobileBrandMode} numberOfLines={1}>
              {mode === "volunteer" ? "VOLUNTEER" : "RESIDENT"} · {currentModule}
            </Text>
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
            accessibilityLabel={mobileProfileOpen ? "Close account menu" : "Open account menu"}
            accessibilityState={{ expanded: mobileProfileOpen }}
            onPress={() => { setMobileMenuOpen(false); setMobileProfileOpen(value => !value); }}
            style={styles.mobileHeaderButton}
          >
            <Ionicons name="person-circle-outline" size={23} color="#12365B" />
          </Pressable>
        </View>
        <View style={styles.mobileMain}>
          <Tabs screenOptions={{ headerShown: false, tabBarPosition: "bottom" }} tabBar={() => null} />
        </View>
        {mobileProfileOpen ? (
          <View style={styles.mobileAccountOverlay}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close account menu"
              onPress={() => setMobileProfileOpen(false)} style={styles.mobileAccountBackdrop} />
            <View style={[styles.mobileAccountMenu, { top: 66 + insets.top }]}>
              <View style={styles.mobileAccountHeader}>
                <Ionicons name="person-circle" size={35} color="#127CCC" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.mobileAccountName} numberOfLines={1}>{profile.fullName || user.displayName || user.email || "VolunServe Member"}</Text>
                  <Text style={styles.mobileAccountRole}>{mode === "volunteer" ? "Volunteer Account" : "Resident Account"}</Text>
                </View>
                {(profile.identityVerified === true || profile.identityStatus === "verified") ? (
                  <Ionicons name="checkmark-circle" size={18} color="#0A9A6A" />
                ) : null}
              </View>
              <Pressable onPress={() => visit("profile")} style={styles.mobileAccountAction}>
                <Ionicons name="person-outline" size={18} color="#12325D" />
                <Text style={styles.mobileAccountActionText}>My Profile</Text>
              </Pressable>
              <Pressable onPress={() => {setMobileProfileOpen(false); router.push({ pathname: "/(tabs)/profile", params: { edit: "1" } });}} style={styles.mobileAccountAction}>
                <Ionicons name="settings-outline" size={18} color="#12325D" />
                <Text style={styles.mobileAccountActionText}>Account Settings</Text>
              </Pressable>
              {canSwitchMode ? (
                <Pressable onPress={() => void switchMobileMode()} style={styles.mobileAccountAction}>
                  <Ionicons name="swap-horizontal" size={18} color="#12325D" />
                  <Text style={styles.mobileAccountActionText}>Switch to {mode === "volunteer" ? "Resident" : "Volunteer"} Mode</Text>
                </Pressable>
              ) : null}
              {adminRoute ? (
                <Pressable onPress={() => { setMobileProfileOpen(false); router.push(adminRoute as Href); }} style={styles.mobileAccountAction}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#12325D" />
                  <Text style={styles.mobileAccountActionText}>Admin Portal</Text>
                </Pressable>
              ) : null}
              <View style={styles.mobileAccountDivider} />
              <Pressable onPress={() => {setMobileProfileOpen(false); confirmMobileLogout();}}
                style={styles.mobileAccountAction}>
                <Ionicons name="log-out-outline" size={18} color="#D93545" />
                <Text style={[styles.mobileAccountActionText, { color: "#C52B3C" }]}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {mobileMenuOpen ? (
          <View style={[styles.mobileDrawerLayer, { top: 60 + insets.top }]}>
            <Pressable
              style={styles.mobileDrawerBackdrop}
              onPress={() => setMobileMenuOpen(false)}
              accessibilityLabel="Close navigation drawer"
            />
            <View style={styles.mobileDrawer}>
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
                {identityNeedsAction ? (
                  <Pressable style={styles.journeyAction} onPress={() => { setMobileMenuOpen(false); router.push("/identity-verification" as Href); }}>
                    <Ionicons name="shield-checkmark-outline" color="#FFFFFF" size={19} />
                    <Text style={styles.journeyActionText}>Verify your identity</Text>
                  </Pressable>
                ) : null}
                {volunteerApplicationReady ? (
                  <Pressable style={styles.journeyAction} onPress={() => { setMobileMenuOpen(false); router.push("/(tabs)/volunteer-application" as Href); }}>
                    <Ionicons name="people-outline" color="#FFFFFF" size={19} />
                    <Text style={styles.journeyActionText}>Apply as Volunteer</Text>
                  </Pressable>
                ) : null}
                {menuItems.filter((item) => item.name !== "profile" && item.name !== "notifications").map((item) => {
                  const active = item.name === owningModule(String(segments[segments.length - 1] || "index"), mode);
                  return (
                    <Pressable key={item.name} accessibilityRole="button"
                      onPress={() => visit(item.name)}
                      style={({ pressed }) => [styles.mobileDrawerItem, active && styles.mobileDrawerActive, pressed && styles.mobilePressed]}>
                      <View style={styles.mobileDrawerIconBadge}>
                        <Ionicons name={item.icon as any} size={20} color={active ? "#FFFFFF" : "#CDE6DE"} />
                      </View>
                      <Text style={styles.mobileDrawerItemText} numberOfLines={2}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
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
      AppAlert.alert(
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
            CITY OF SAN JOSE DEL MONTE
          </Text>
        </View>
      </View>

      <Text style={styles.residentModeLabel}>{mode === "volunteer" ? "VOLUNTEER WORKSPACE" : "RESIDENT SERVICES"}</Text>

      <ScrollView
        style={[styles.desktopNavigationScroll, mode === "resident" && styles.desktopResidentNavigationRaised]}
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

          const focused = state.index === routeIndex ||
            (owningModule(String(state.routes[state.index]?.name || ""), mode) === item.name &&
              state.routes[state.index]?.name === "map-tracking");
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
              <View
                style={[
                  styles.desktopNavIcon,
                  focused && styles.desktopNavIconActive,
                  identity && styles.residentNavIcon,
                ]}
              >
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
              </View>
              {focused ? (
                <View style={styles.desktopActiveMark} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.desktopUtilityArea}>
        {mode === "resident" &&
          profile.identityVerified !== true &&
          (profile.identityStatus === "basic" || profile.identityStatus === "failed") ? (
          <Pressable style={styles.desktopUtilityButton} onPress={() => router.push("/identity-verification" as Href)}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#E6F5F2" />
            <Text style={styles.desktopUtilityText}>Verify Identity</Text>
          </Pressable>
        ) : null}
        {mode === "resident" && !volunteerAccess &&
          (profile.identityVerified === true || profile.identityStatus === "verified") ? (
          <Pressable style={styles.desktopUtilityButton} onPress={() => router.push("/(tabs)/volunteer-application" as Href)}>
            <Ionicons name="people-outline" size={18} color="#E6F5F2" />
            <Text style={styles.desktopUtilityText}>Apply as Volunteer</Text>
          </Pressable>
        ) : null}
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
          onPress={confirmMobileLogout}
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

  const tabs =
    mode === "volunteer" ? volunteerMobileTabs : residentMobileTabs;

  const switchMode = async () => {
    if (!canSwitchMode) return;

    const nextMode = mode === "volunteer" ? "resident" : "volunteer";

    try {
      await setActiveUserMode(nextMode);
      navigation.navigate("index");
    } catch (error: any) {
      AppAlert.alert(
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
          const focused = state.index === routeIndex ||
            (owningModule(String(state.routes[state.index]?.name || ""), mode) === item.name &&
              state.routes[state.index]?.name === "map-tracking");

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
  journeyAction: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#226859", minHeight: 42, paddingHorizontal: 12, marginBottom: 10, borderRadius: 9 },
  journeyActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
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
  mobileBrandName: { color: "#173D32", fontWeight: "700", fontSize: 16 },
  mobileBrandMode: { color: "#607890", fontSize: 9, fontWeight: "800" },
  mobileHeaderStatus: {
    minWidth: 37, flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 7, height: 30, backgroundColor: "#E9F8F1",
  },
  mobileStatusDot: { backgroundColor: "#00A17C", width: 6, height: 6, borderRadius: 3 },
  mobileStatusText: { fontSize: 9, fontWeight: "800", color: "#0B735D" },
  mobileDrawerLayer: { ...StyleSheet.absoluteFillObject, top: 60, zIndex: 100, flexDirection: "row" },
  mobileDrawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 25, 41, 0.45)" },
  mobileDrawer: { height: "100%", width: "82%", maxWidth: 310, backgroundColor: "#123E36", paddingTop: 18, paddingHorizontal: 15, paddingBottom: 12 },
  mobileDrawerBrand: { flexDirection: "row", alignItems: "center", gap: 11, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.16)" },
  mobileDrawerLogo: { width: 44, height: 44 },
  mobileDrawerBrandCopy: { flex: 1 },
  mobileAccountOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 60,
  },
  mobileAccountBackdrop: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,30,42,0.05)",
  },
  mobileAccountMenu: {
    position: "absolute", right: 12, top: 66,
    width: 284, maxWidth: "95%",
    borderRadius: 16, padding: 12, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#E5EFF2",
    shadowColor: "#061F32", shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18, shadowRadius: 25, elevation: 14,
  },
  mobileAccountHeader: {
    flexDirection: "row", gap: 10, alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: "#E7EEF4", marginBottom: 6,
  },
  mobileAccountName: { fontSize: 13, fontWeight: "700", color: "#173D32" },
  mobileAccountRole: { fontSize: 10, color: "#6B829D", marginTop: 3 },
  mobileAccountAction: {
    flexDirection: "row", alignItems: "center", gap: 13,
    minHeight: 44, paddingHorizontal: 13, borderRadius: 10,
  },
  mobileAccountActionText: { fontSize: 12.5, color: "#1A345D", fontWeight: "700" },
  mobileAccountDivider: { height: 1, backgroundColor: "#E6EDF2", marginVertical: 7 },
  mobileDrawerTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  mobileDrawerSub: { color: "#B5E9D9", fontSize: 9, fontWeight: "800" },
  mobileDrawerLabel: { paddingTop: 17, paddingBottom: 9, color: "#90DBC8", fontWeight: "800", letterSpacing: 1.8, fontSize: 9.5 },
  mobileDrawerScroll: { flex: 1 },
  mobileDrawerItem: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 9, borderRadius: 12, marginBottom: 4, overflow: "hidden" },
  mobileDrawerItemOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
  mobileDrawerIconBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  mobileDrawerSubtitle: { color: "#B8DED3", fontSize: 9, marginTop: 2 },
  mobileDrawerActive: { backgroundColor: "#226859" },
  mobileDrawerItemText: { flex: 1, color: "#E3F2EC", fontWeight: "600", fontSize: 13 },
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
    backgroundColor: "#123E36",
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
    fontSize: 21,
    fontWeight: "700",
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
  // Gently raise all six Resident modules by 10px without altering their
  // relative spacing, the botanical sidebar or other account modes.
  desktopResidentNavigationRaised: { marginTop: 0, marginBottom: 0 },
  desktopNavigation: {
    gap: 7,
    paddingRight: 3,
    paddingBottom: 10,
  },
  // Fill remaining height on large desktop displays while allowing scrolling
  // whenever the viewport is too short for all modules.
  desktopResidentNavigation: { flexGrow: 0, paddingVertical: 10 },
  desktopNavItem: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 9,
    borderRadius: 13,
  },
  desktopNavItemActive: {
    backgroundColor: "#226859",
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
    fontSize: 13,
    fontWeight: "500",
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
    color: "#FFD2D2",
  },
  residentSidebarAmbient: { position: "absolute", bottom: 20, left: -50, opacity: 0.055 },
  residentModeLabel: {
    marginTop: 18,
    marginBottom: 12,
    paddingHorizontal: 10,
    color: "#8EE6D1",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
  },
  residentSectionLabel: { marginTop: 10, color: "#83D8C8", letterSpacing: 2 },
  residentNavItem: { minHeight: 49, overflow: "hidden", gap: 11, paddingHorizontal: 8, borderRadius: 9 },
  residentNavItemActive: { backgroundColor: "#226859" },
  residentNavSelectedGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 14 },
  residentNavIcon: {
    width: 40, height: 40, borderRadius: 13, overflow: "hidden", backgroundColor: "#064F53",
  },
  residentIconGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 13, opacity: 1 },
  residentNavCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  residentNavTitle: { fontSize: 13, color: "#E3F2EC", fontWeight: "600" },
  residentNavSubtitle: { fontSize: 9.5, lineHeight: 13, color: "#BBDFD8", marginTop: 3 },
  desktopPressed: {
    opacity: 0.72,
  },
});
