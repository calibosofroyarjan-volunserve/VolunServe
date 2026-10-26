
import { Ionicons } from "@expo/vector-icons";
import {
  Href,
  Redirect,
  router,
  Stack,
  usePathname,
} from "expo-router";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import {
  useUserSession,
} from "../../lib/useUserSession";

const WEB_PORTAL_URL =
  "https://volunserve-3aa5b.web.app";

const SIDEBAR_WIDTH = 268;

type NavItem = {
  label: string;
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  route: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    icon: "home-outline",
    route:
      "/(admin)/command-center",
  },
  {
    label: "Identity Reviews",
    icon: "shield-checkmark-outline",
    route:
      "/(admin)/identity-reviews",
  },
  {
    label: "Volunteer Approvals",
    icon: "people-outline",
    route:
      "/(admin)/account-approvals",
  },
  {
    label: "Emergency Reports",
    icon: "warning-outline",
    route:
      "/(admin)/admin-cases",
  },
  {
    label: "Assistance Requests",
    icon: "hand-left-outline",
    route:
      "/(admin)/assistance-requests",
  },
  {
    label: "LGU Personnel",
    icon: "business-outline",
    route:
      "/(admin)/lgu-members",
  },
  {
    label: "LGU Attendance",
    icon: "time-outline",
    route:
      "/(admin)/lgu-attendance",
  },
  {
    label: "Volunteer Events",
    icon: "calendar-outline",
    route:
      "/(admin)/admin-events",
  },
  {
    label: "Community Events",
    icon: "leaf-outline",
    route:
      "/(admin)/community-events",
  },
  {
    label: "Event Attendance",
    icon: "checkmark-done-outline",
    route:
      "/(admin)/community-attendance",
  },
  {
    label: "Donation Management",
    icon: "heart-outline",
    route:
      "/(admin)/donor-monitoring",
  },
  {
    label: "Relief Operations",
    icon: "cube-outline",
    route:
      "/(admin)/relief-operations",
  },
  {
    label: "Announcements",
    icon: "megaphone-outline",
    route:
      "/(admin)/create-announcement",
  },
  {
    label: "Analytics",
    icon: "analytics-outline",
    route:
      "/(admin)/admin-analytics",
  },
  {
    label: "Certificates",
    icon: "ribbon-outline",
    route:
      "/(admin)/certificates",
  },
  {
    label: "Disputes",
    icon:
      "shield-checkmark-outline",
    route:
      "/(admin)/admin-disputes",
  },
];

type NavSectionId = "response" | "reviews" | "events" | "management";
const NAV_SECTIONS: { id: NavSectionId; title: string; icon: React.ComponentProps<typeof Ionicons>["name"]; labels: string[] }[] = [
  { id: "response", title: "Response & Assistance", icon: "alert-circle-outline", labels: ["Emergency Reports", "Assistance Requests", "Relief Operations"] },
  { id: "reviews", title: "People & Approvals", icon: "people-outline", labels: ["Identity Reviews", "Volunteer Approvals", "LGU Personnel", "LGU Attendance"] },
  { id: "events", title: "Events & Participation", icon: "calendar-outline", labels: ["Volunteer Events", "Community Events", "Event Attendance", "Certificates"] },
  { id: "management", title: "Management & Reports", icon: "settings-outline", labels: ["Donation Management", "Announcements", "Analytics", "Disputes"] },
];
const navActive = (item: NavItem, pathname: string) =>
  pathname === item.route ||
  (item.route === "/(admin)/command-center" && pathname === "/command-center") ||
  (item.route.includes("/(admin)/") && pathname.endsWith(item.route.split("/").pop() || ""));

const initialsFor = (
  value: string,
) => {
  const parts =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

  return (
    parts
      .map((item) =>
        item
          .charAt(0)
          .toUpperCase(),
      )
      .join("") || "AD"
  );
};

export default function AdminLayout() {
  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const {
    width,
  } = useWindowDimensions();

  const pathname =
    usePathname();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<NavSectionId | "none" | null>(null);
  const currentSection = NAV_SECTIONS.find((section) =>
    NAV_ITEMS.some((item) => section.labels.includes(item.label) && navActive(item, pathname))
  )?.id ?? "response";
  const visibleSection = expandedSection ?? currentSection;
  useEffect(() => {
    // Open the relevant group after navigation from an overview shortcut.
    setExpandedSection(null);
  }, [pathname]);

  const desktop =
    Platform.OS === "web" &&
    width >= 980;

  const role =
    typeof profile?.role ===
    "string"
      ? profile.role.toLowerCase()
      : "";

  const fullName =
    String(
      profile?.fullName ||
        profile?.email ||
        "Administrator",
    ).trim();

  const initials =
    useMemo(
      () =>
        initialsFor(
          fullName,
        ),
      [fullName],
    );

  const openRoute = (
    route: string,
  ) => {
    setMobileMenuOpen(
      false,
    );

    router.push(
      route as Href,
    );
  };

  const signOut =
    async () => {
      try {
        setMobileMenuOpen(
          false,
        );

        await logoutUser();

        router.replace(
          "/admin-login" as Href,
        );
      } catch (
        error: any
      ) {
        Alert.alert(
          "Sign Out Failed",
          error?.message ||
            "Unable to sign out.",
        );
      }
    };

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
            styles.message
          }
        >
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <Redirect
        href="/login"
      />
    );
  }

  if (
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <Redirect
        href="/login"
      />
    );
  }

  if (
    role ===
    "superadmin"
  ) {
    return (
      <Redirect
        href="/(superadmin)"
      />
    );
  }

  if (
    role !==
    "admin"
  ) {
    return (
      <Redirect
        href="/(tabs)"
      />
    );
  }

  if (
    Platform.OS !==
    "web"
  ) {
    return (
      <View
        style={
          styles.blockedContainer
        }
      >
        <View
          style={
            styles.blockedCard
          }
        >
          <View
            style={
              styles.iconCircle
            }
          >
            <Text
              style={
                styles.iconText
              }
            >
              VS
            </Text>
          </View>

          <Text
            style={
              styles.blockedEyebrow
            }
          >
            VOLUNSERVE ADMINISTRATION
          </Text>

          <Text
            style={
              styles.blockedTitle
            }
          >
            Web Portal Required
          </Text>

          <Text
            style={
              styles.blockedDescription
            }
          >
            Operational Admin management is available through the VolunServe web portal.
          </Text>

          <Text
            style={
              styles.blockedDescription
            }
          >
            Please use a web browser on your phone, tablet, laptop, or desktop computer to continue.
          </Text>

          <TouchableOpacity
            style={
              styles.webButton
            }
            activeOpacity={
              0.85
            }
            onPress={() => {
              Linking
                .openURL(
                  WEB_PORTAL_URL,
                )
                .catch(
                  (error) => {
                    console.log(
                      "open web portal error",
                      error,
                    );
                  },
                );
            }}
          >
            <Text
              style={
                styles.webButtonText
              }
            >
              Open Web Portal
            </Text>
          </TouchableOpacity>

          <Text
            style={
              styles.webAddress
            }
          >
            volunserve-3aa5b.web.app
          </Text>
        </View>
      </View>
    );
  }

  const sidebar = (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Image
          source={require("../../assets/images/logo.png")}
          resizeMode="cover"
          style={styles.brandLogo}
          accessibilityLabel="VolunServe logo"
        />
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>VolunServe</Text>
          <Text style={styles.brandTagline}>LGU ADMINISTRATION</Text>
        </View>
      </View>
      <Text style={styles.sidebarSection}>LGU WORKSPACE</Text>
      <TouchableOpacity
        style={[styles.navItem, styles.overviewNavItem, navActive(NAV_ITEMS[0], pathname) && styles.navItemActive]}
        accessibilityRole="button" accessibilityState={{ selected: navActive(NAV_ITEMS[0], pathname) }}
        activeOpacity={0.84} onPress={() => openRoute(NAV_ITEMS[0].route)}
      >
        <View style={styles.navIcon}><Ionicons name="grid-outline" size={19} color="#E7F4EF" /></View>
        <Text style={[styles.navLabel, navActive(NAV_ITEMS[0], pathname) && styles.navLabelActive]}>Overview</Text>
        {navActive(NAV_ITEMS[0], pathname) ? <View style={styles.activeIndicator} /> : null}
      </TouchableOpacity>
      <ScrollView style={styles.sidebarScroll} contentContainerStyle={styles.sidebarContent}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        accessibilityLabel="LGU Admin module groups">
        {NAV_SECTIONS.map((section) => {
          const expanded = visibleSection === section.id;
          const active = NAV_ITEMS.some((item) => section.labels.includes(item.label) && navActive(item, pathname));
          return <View key={section.id} style={styles.navSection}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={section.title}
              accessibilityState={{ expanded }} activeOpacity={0.85}
              style={[styles.navGroupHeader, active && styles.navGroupHeaderCurrent]}
              onPress={() => setExpandedSection(expanded ? "none" : section.id)}>
              <Ionicons name={section.icon} color={active ? "#FFFFFF" : "#BAD9CF"} size={17} />
              <Text style={[styles.navGroupTitle, active && styles.navGroupTitleCurrent]}>{section.title}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} color="#A9CDC0" size={15} />
            </TouchableOpacity>
            {expanded ? <View style={styles.navGroupChildren}>
              {NAV_ITEMS.filter(item => section.labels.includes(item.label)).map((item) => {
                const selected = navActive(item, pathname);
                return <TouchableOpacity key={item.route} style={[styles.navItem, styles.groupNavItem, selected && styles.navItemActive]}
                  accessibilityRole="button" accessibilityState={{ selected }} activeOpacity={0.82}
                  onPress={() => openRoute(item.route)}>
                  <Ionicons name={item.icon} color={selected ? "#FFFFFF" : "#B4D5C9"} size={17} />
                  <Text numberOfLines={2} style={[styles.navLabel, selected && styles.navLabelActive]}>{item.label}</Text>
                  {selected ? <View style={styles.activeIndicator} /> : null}
                </TouchableOpacity>;
              })}
            </View> : null}
          </View>;
        })}
      </ScrollView>
      <View style={styles.sidebarUtility}>
        <TouchableOpacity
          style={styles.logoutButton}
          accessibilityRole="button"
          accessibilityLabel="Log out of Admin account"
          activeOpacity={0.82}
          onPress={() => void signOut()}
        >
          <Ionicons name="log-out-outline" size={20} color="#D03647" />
          <Text style={styles.signOutLabel}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View
      style={
        styles.shell
      }
    >
      {desktop &&
        sidebar}

      <View
        style={
          styles.main
        }
      >
        <View
          style={
            styles.topBar
          }
        >
          {!desktop && (
            <TouchableOpacity
              style={
                styles.mobileMenuButton
              }
              onPress={() =>
                setMobileMenuOpen(
                  true,
                )
              }
            >
              <Ionicons
                name="menu"
                size={22}
                color="#334155"
              />
            </TouchableOpacity>
          )}

          <View
            style={
              styles.topBarSpacer
            }
          />

          <View
            style={
              styles.profileArea
            }
          >
            <View
              style={
                styles.profileAvatar
              }
            >
              <Text
                style={
                  styles.profileAvatarText
                }
              >
                {initials}
              </Text>
            </View>

            <View
              style={
                styles.profileText
              }
            >
              <Text
                style={
                  styles.profileName
                }
                numberOfLines={
                  1
                }
              >
                {fullName}
              </Text>

              <Text
                style={
                  styles.profileRole
                }
              >
                Administrator
              </Text>
            </View>
          </View>
        </View>

        <View
          style={
            styles.stackArea
          }
        >
          <Stack
            screenOptions={{
              headerShown:
                false,
              contentStyle: {
                backgroundColor:
                  "#F2F9FC",
              },
            }}
          />
        </View>
      </View>

      <Modal
        visible={
          !desktop &&
          mobileMenuOpen
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setMobileMenuOpen(
            false,
          )
        }
      >
        <View
          style={
            styles.mobileOverlay
          }
        >
          <Pressable
            style={
              styles.mobileBackdrop
            }
            onPress={() =>
              setMobileMenuOpen(
                false,
              )
            }
          />

          <View
            style={
              styles.mobileSidebar
            }
          >
            {sidebar}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles =
  StyleSheet.create({
    navSection: { marginBottom: 6 },
    overviewNavItem: { marginHorizontal: 17, marginBottom: 10 },
    navGroupHeader: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 13, borderRadius: 9 },
    navGroupHeaderCurrent: { backgroundColor: "rgba(255,255,255,0.07)" },
    navGroupTitle: { flex: 1, color: "#C9DDD5", fontSize: 12.5, fontWeight: "600" },
    navGroupTitleCurrent: { color: "#FFFFFF", fontWeight: "700" },
    navGroupChildren: { paddingTop: 2, paddingLeft: 16 },
    groupNavItem: { minHeight: 41, marginBottom: 1, gap: 10, paddingHorizontal: 12 },
    shell: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: "#F6F8F7",
    },

    center: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F8FAFC",
    },

    message: {
      marginTop: 10,
      color:
        "#64748B",
      fontWeight:
        "600",
    },

    sidebar: {
      width: SIDEBAR_WIDTH,
      height: "100%",
      minHeight: 0,
      flexShrink: 0,
      overflow: "hidden",
      backgroundColor: "#123E36",
      borderRightWidth: 1,
      borderRightColor: "#DDE8E3",
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

    brandMark: {
      width:
        38,
      height:
        38,
      borderRadius:
        10,
      backgroundColor:
        "#635BDE",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    brandLogo: { width: 47, height: 47, borderRadius: 24, backgroundColor: "#E8F8F5" },
    brandCopy: { flex: 1, minWidth: 0 },
    brandName: {
      color: "#FFFFFF",
      fontSize: 20,
      fontWeight: "700",
    },

    brandTagline: {
      marginTop: 2,
      color: "#B6E9DF",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.65,
    },

    sidebarScroll: {
      flex: 1,
      minHeight: 0,
      marginHorizontal: 10,
    },

    sidebarContent: {
      paddingHorizontal: 7,
      paddingRight: 10,
      paddingBottom: 18,
      gap: 3,
    },

    sidebarSection: {
      flexShrink: 0,
      marginTop: 5,
      marginBottom: 8,
      marginLeft: 27,
      color: "#A7DCD4",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.1,
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
      backgroundColor: "#226859",
    },

    navLabel: {
      flex: 1,
      color: "#E6F5F2",
      fontSize: 13,
      fontWeight: "500",
    },

    navLabelActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },

    divider: {
      height:
        1,
      marginVertical:
        14,
      marginHorizontal:
        10,
      backgroundColor:
        "#29415E",
    },

    navIcon: { width: 30, height: 30, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
    navIconGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
    navIconActive: { backgroundColor: "#226859" },
    activeIndicator: { width: 4, height: 24, borderRadius: 3, backgroundColor: "#E1FFF6" },
    sidebarUtility: { flexShrink: 0, marginHorizontal: 17, paddingTop: 11, paddingBottom: 15, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.18)" },
    logoutButton: { minHeight: 43, borderRadius: 11, flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 11 },
    signOutLabel: {
      color: "#FFCFCF",
      fontSize: 12,
      fontWeight: "800",
    },

    sidebarFooter: {
      paddingHorizontal:
        30,
      paddingBottom:
        26,
    },

    sidebarFooterText: {
      color:
        "#67A5CA",
      fontSize:
        10,
      lineHeight:
        16,
      fontWeight:
        "800",
      letterSpacing:
        1,
    },

    main: {
      flex: 1,
      minWidth: 0,
      backgroundColor: "#F2F9FC",
    },

    topBar: {
      minHeight:
        72,
      paddingHorizontal:
        28,
      flexDirection:
        "row",
      alignItems:
        "center",
      borderBottomWidth:
        1,
      borderBottomColor:
        "#E5E7EB",
      backgroundColor:
        "#FFFFFF",
    },

    topBarSpacer: {
      flex:
        1,
    },

    mobileMenuButton: {
      width:
        40,
      height:
        40,
      borderRadius:
        10,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    profileArea: {
      maxWidth:
        300,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        10,
    },

    profileAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#078F82",
    },

    profileAvatarText: {
      color:
        "#FFFFFF",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    profileText: {
      minWidth:
        0,
    },

    profileName: {
      color:
        "#0F172A",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    profileRole: {
      marginTop:
        2,
      color:
        "#64748B",
      fontSize:
        10.5,
    },

    stackArea: {
      flex:
        1,
      minHeight:
        0,
    },

    mobileOverlay: {
      flex:
        1,
      flexDirection:
        "row",
      backgroundColor:
        "rgba(15,23,42,0.35)",
    },

    mobileBackdrop: {
      ...StyleSheet
        .absoluteFillObject,
    },

    mobileSidebar: {
      width:
        SIDEBAR_WIDTH,
      height:
        "100%",
      zIndex:
        2,
    },

    blockedContainer: {
      flex:
        1,
      padding:
        24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    blockedCard: {
      width:
        "100%",
      maxWidth:
        460,
      backgroundColor:
        "#FFFFFF",
      borderRadius:
        22,
      padding:
        28,
      alignItems:
        "center",
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      shadowColor:
        "#000000",
      shadowOffset: {
        width:
          0,
        height:
          5,
      },
      shadowOpacity:
        0.08,
      shadowRadius:
        16,
      elevation:
        4,
    },

    iconCircle: {
      width:
        72,
      height:
        72,
      borderRadius:
        36,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#CCFBF1",
      marginBottom:
        18,
    },

    iconText: {
      color:
        "#0F766E",
      fontWeight:
        "900",
      fontSize:
        22,
    },

    blockedEyebrow: {
      color:
        "#0F766E",
      fontWeight:
        "900",
      fontSize:
        10,
      letterSpacing:
        1.4,
      marginBottom:
        8,
      textAlign:
        "center",
    },

    blockedTitle: {
      color:
        "#0F172A",
      fontSize:
        25,
      fontWeight:
        "900",
      textAlign:
        "center",
    },

    blockedDescription: {
      marginTop:
        10,
      color:
        "#64748B",
      fontSize:
        14,
      lineHeight:
        21,
      textAlign:
        "center",
      maxWidth:
        360,
    },

    webButton: {
      width:
        "100%",
      minHeight:
        48,
      marginTop:
        22,
      borderRadius:
        12,
      backgroundColor:
        "#0F766E",
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        18,
    },

    webButtonText: {
      color:
        "#FFFFFF",
      fontWeight:
        "900",
      fontSize:
        14,
    },

    webAddress: {
      marginTop:
        12,
      color:
        "#94A3B8",
      fontSize:
        11,
      fontWeight:
        "600",
    },
  });
