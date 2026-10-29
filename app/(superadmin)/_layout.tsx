import { AppAlert } from "../../lib/appDialog";
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
import { useUserSession } from "../../lib/useUserSession";

const WEB_PORTAL_URL = "https://volunserve-3aa5b.web.app";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type NavItem = {
  label: string;
  icon: IconName;
  route: string;
  match: string;
};

const navItems: NavItem[] = [
  { label: "System Overview", icon: "stats-chart-outline", route: "/(superadmin)", match: "/" },
  { label: "Admin Accounts", icon: "people-outline", route: "/(superadmin)/admin-accounts", match: "/admin-accounts" },
  { label: "System Records", icon: "albums-outline", route: "/(superadmin)/all-records", match: "/all-records" },
  { label: "Audit Logs", icon: "time-outline", route: "/(superadmin)/admin-logs", match: "/admin-logs" },
];

export default function SuperAdminLayout() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen,setAccountOpen] = useState(false);
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

  if (Platform.OS !== "web") {
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
            VOLUNSERVE SYSTEM
            ADMINISTRATION
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
            Super Admin system
            management is available
            through the VolunServe
            web portal.
          </Text>

          <Text
            style={
              styles.blockedDescription
            }
          >
            Please open the website
            using Chrome, Safari,
            Edge, or another web
            browser on your phone,
            tablet, laptop, or
            desktop computer.
          </Text>

          <TouchableOpacity
            style={
              styles.webButton
            }
            activeOpacity={0.85}
            onPress={() => {
              Linking.openURL(
                WEB_PORTAL_URL
              ).catch(
                (error) => {
                  console.log(
                    "open web portal error",
                    error
                  );
                }
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

  const signOut = async () => {
    try {
      setDrawerOpen(false);
      await logoutUser();
      router.replace("/admin-login" as Href);
    } catch (error: any) {
      AppAlert.alert(
        "Sign Out Failed",
        error?.message || "Unable to sign out. Please try again."
      );
    }
  };

  const confirmSignOut = () => {
    setAccountOpen(false);
    AppAlert.alert("Sign Out", "Sign out of your VolunServe Super Admin account?", [
      { text:"Cancel",style:"cancel" },
      { text:"Sign Out",style:"destructive",onPress:()=>void signOut() },
    ]);
  };
  const activeItem = navItems.find(item => item.match === "/"
    ? pathname === "/" || pathname === "/(superadmin)" || pathname === "/superadmin"
    : pathname.endsWith(item.match));

  return (
    <View style={styles.shell}>
      {desktop ? (
        <SuperAdminSidebar
          onNavigate={(route) => {setAccountOpen(false);router.push(route as Href);}}
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
              accessibilityRole="button"
              accessibilityLabel="Open Super Admin navigation"
              style={styles.menuButton}
              activeOpacity={0.8}
              onPress={() => setDrawerOpen(true)}
            >
              <Ionicons name="menu" size={24} color="#17213A" />
            </TouchableOpacity>
          ) : (
            <View style={styles.breadcrumb}>
              <Ionicons name="home-outline" size={17} color="#246B55" />
              <Text style={styles.breadcrumbMuted}>Super Admin</Text>
              <Ionicons name="chevron-forward" size={13} color="#8BA99A"/>
              <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{pathname.endsWith("/profile") ? "View Profile" : pathname.endsWith("/system-settings") ? "System Settings" : (activeItem?.label || "System Overview")}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.accountArea} accessibilityRole="button"
            accessibilityLabel="Super Admin account menu" accessibilityState={{expanded:accountOpen}}
            onPress={()=>setAccountOpen(open=>!open)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.accountCopy}>
              <Text style={styles.accountName} numberOfLines={1}>
                {fullName}
              </Text>
              <Text style={styles.accountRole}>Super Admin</Text>
            </View>
            <Ionicons name={accountOpen?"chevron-up":"chevron-down"} size={16} color="#426D5C"/>
          </TouchableOpacity>
        </View>
        {accountOpen && (
          <View style={styles.profileMenu} accessibilityLabel="Super Admin profile dropdown">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View Profile"
              style={styles.profileMenuAction}
              onPress={() => {
                setAccountOpen(false);
                router.push("/(superadmin)/profile" as Href);
              }}
            >
              <Ionicons name="person-circle-outline" size={20} color="#087A62" />
              <Text style={styles.profileMenuText}>View Profile</Text>
              <Ionicons name="chevron-forward" size={15} color="#79978A" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="System Settings"
              style={styles.profileMenuAction}
              onPress={() => {
                setAccountOpen(false);
                router.push("/(superadmin)/system-settings" as Href);
              }}
            >
              <Ionicons name="settings-outline" size={19} color="#087A62" />
              <Text style={styles.profileMenuText}>System Settings</Text>
              <Ionicons name="chevron-forward" size={15} color="#79978A" />
            </TouchableOpacity>
            <View style={styles.profileMenuDivider} />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              style={styles.profileMenuAction}
              onPress={confirmSignOut}
            >
              <Ionicons name="log-out-outline" size={19} color="#B42318" />
              <Text style={styles.profileMenuSignOutText}>Sign Out</Text>
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
        <Ionicons name="leaf-outline" size={220} color="#60C79B" />
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
          <Text style={styles.brandTagline}>Community · People · Action</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.sidebarTitle}>SUPER ADMIN PORTAL</Text>
      <Text style={styles.sidebarLabel}>System Administration</Text>

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
    width: 280,
    height: "100%",
    minHeight: 0,
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: "#083E34",
    borderRightWidth: 1,
    borderRightColor: "#DDE8E3",
  },
  sidebarCompact: {
    width: 280,
    maxWidth: "86%",
    height: "100%",
  },
  brand: {
    minHeight: 94,
    paddingTop: 22,
    paddingBottom: 18,
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
  sidebarTitle: { color:"#FFFFFF",fontSize:13,fontWeight:"900",letterSpacing:.6,marginTop:14,marginLeft:24 },
  sidebarLabel: {
    flexShrink: 0,
    marginTop: 7,
    marginBottom: 18,
    marginLeft: 24,
    color: "#A7DCD4",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  sidebarScroll: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 12,
  },
  sidebarContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 4,
    paddingTop: 30,
    paddingBottom: 22,
    gap: 14,
  },
  navItem: {
    minHeight: 58,
    paddingHorizontal: 11,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  navSelectedGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 13 },
  navItemActive: {
    backgroundColor: "#087D61",
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  navIconGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
  navIconActive: {
    backgroundColor: "#226859",
  },
  navText: {
    flex: 1,
    color: "#D8E6E1",
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: "600",
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
  sidebarDecoration:{position:"absolute",left:-73,bottom:60,opacity:.16,transform:[{rotate:"-26deg"}]},
  workspace: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F6F9F8",
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
    borderBottomColor: "#E1ECE6",
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
  breadcrumb:{flexDirection:"row",gap:10,alignItems:"center",minWidth:0,flexShrink:1},
  breadcrumbMuted:{fontSize:12,color:"#71877E"},
  breadcrumbCurrent:{fontSize:12,fontWeight:"900",color:"#17382E",flexShrink:1},
  profileMenu:{position:"absolute",top:61,right:17,zIndex:20,backgroundColor:"#FFFFFF",borderRadius:12,borderWidth:1,borderColor:"#D6E5DE",padding:8,minWidth:212,shadowColor:"#13392C",shadowOpacity:.13,shadowRadius:12,elevation:6},
  profileMenuAction:{minHeight:46,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:11,borderRadius:8},
  profileMenuText:{flex:1,fontSize:12,fontWeight:"800",color:"#174B3E"},
  profileMenuSignOutText:{flex:1,fontSize:12,fontWeight:"800",color:"#B42318"},
  profileMenuDivider:{height:1,backgroundColor:"#EBF0EC",marginVertical:5,marginHorizontal:9},
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
    blockedContainer: {
      flex: 1,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F1F5F9",
    },

    blockedCard: {
      width: "100%",
      maxWidth: 460,
      backgroundColor: "#FFFFFF",
      borderRadius: 22,
      padding: 28,
      alignItems: "center",

      borderWidth: 1,
      borderColor: "#E2E8F0",

      shadowColor: "#000000",

      shadowOffset: {
        width: 0,
        height: 5,
      },

      shadowOpacity: 0.08,
      shadowRadius: 16,

      elevation: 4,
    },

    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,

      alignItems: "center",
      justifyContent: "center",

      backgroundColor: "#CCFBF1",

      marginBottom: 18,
    },

    iconText: {
      color: "#0F766E",
      fontWeight: "900",
      fontSize: 22,
    },

    blockedEyebrow: {
      color: "#0F766E",

      fontWeight: "900",
      fontSize: 10,

      letterSpacing: 1.4,

      marginBottom: 8,

      textAlign: "center",
    },

    blockedTitle: {
      color: "#0F172A",
      fontSize: 25,
      fontWeight: "900",
      textAlign: "center",
    },

    blockedDescription: {
      marginTop: 10,

      color: "#64748B",

      fontSize: 14,
      lineHeight: 21,

      textAlign: "center",

      maxWidth: 360,
    },

    webButton: {
      width: "100%",
      minHeight: 48,

      marginTop: 22,

      borderRadius: 12,

      backgroundColor: "#0F766E",

      alignItems: "center",
      justifyContent: "center",

      paddingHorizontal: 18,
    },

    webButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 14,
    },

    webAddress: {
      marginTop: 12,

      color: "#94A3B8",

      fontSize: 11,
      fontWeight: "600",
    },
});
