import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  activeModeForProfile,
  isAdminProfile,
  logoutUser,
  hasVolunteerAccess as profileHasVolunteerAccess,
  setActiveUserMode,
} from "../lib/firebaseAuth";
import { useUserSession } from "../lib/useUserSession";

type DrawerRole =
  | "guest"
  | "applicant"
  | "resident"
  | "volunteer"
  | "admin"
  | "superadmin";

type DrawerIconName =
  React.ComponentProps<typeof Ionicons>["name"];

type SideDrawerProps = {
  visible: boolean;
  onClose: () => void;
  name?: string;
  email?: string;
  role?: string;
  activeMode?: string;
};

type DrawerItemProps = {
  icon: DrawerIconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

const roleLabel = (role: DrawerRole) => {
  switch (role) {
    case "superadmin":
      return "Super Administrator";
    case "admin":
      return "Administrator";
    case "volunteer":
      return "Approved Volunteer";
    case "applicant":
      return "Applicant";
    case "guest":
      return "Public Access";
    default:
      return "Resident";
  }
};

const normalizeRole = (role?: string): DrawerRole => {
  if (
    role === "guest" ||
    role === "applicant" ||
    role === "resident" ||
    role === "volunteer" ||
    role === "admin" ||
    role === "superadmin"
  ) {
    return role;
  }

  return "resident";
};

export default function SideDrawer({
  visible,
  onClose,
  name = "VolunServe Member",
  email = "",
  role = "resident",
  activeMode,
}: SideDrawerProps) {
  const router = useRouter();
  const { profile } = useUserSession();

  // Prefer the live Firestore profile whenever the user is authenticated.
  // This keeps the drawer synchronized with Resident <-> Volunteer mode
  // even when the legacy role remains "resident".
  const currentRole = normalizeRole(profile?.role || role);

  const isGuest =
    !profile && currentRole === "guest";

  const isAdmin = profile
    ? isAdminProfile(profile)
    : currentRole === "admin" ||
      currentRole === "superadmin";

  const isSuperAdmin =
    profile?.role === "superadmin" ||
    (!profile && currentRole === "superadmin");

  const canUseVolunteerMode = profile
    ? profileHasVolunteerAccess(profile)
    : currentRole === "volunteer" ||
      activeMode === "volunteer";

  const currentMode = profile
    ? activeModeForProfile(profile)
    : canUseVolunteerMode && activeMode === "volunteer"
      ? "volunteer"
      : "resident";

  const isVolunteerMode =
    !isGuest &&
    !isAdmin &&
    currentMode === "volunteer";

  const displayName =
    profile?.fullName?.trim() ||
    name ||
    "VolunServe Member";

  const displayEmail =
    profile?.email?.trim() ||
    email ||
    "";

  const navigate = (route: string) => {
    onClose();

    setTimeout(() => {
      router.push(route as any);
    }, 80);
  };

  const showError = (
    title: string,
    message: string,
  ) => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined"
    ) {
      window.alert(`${title}\n\n${message}`);
      return;
    }

    Alert.alert(title, message);
  };

  const handleModeSwitch = async () => {
    if (!canUseVolunteerMode) return;

    const nextMode =
      currentMode === "volunteer"
        ? "resident"
        : "volunteer";

    try {
      // Save first. useUserSession receives the updated activeMode
      // from Firestore and every mode-aware screen updates from it.
      await setActiveUserMode(nextMode);

      onClose();
      router.replace("/(tabs)");
    } catch (error: any) {
      showError(
        "Mode Switch Failed",
        error?.message ||
          "Unable to switch account mode.",
      );
    }
  };

  const handleLogout = async () => {
    try {
      onClose();
      await logoutUser();
      router.replace("/login");
    } catch (error: any) {
      showError(
        "Sign Out Failed",
        error?.message ||
          "Unable to sign out. Please try again.",
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
          style={styles.backdrop}
          onPress={onClose}
        />

        <View style={styles.drawer}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Ionicons
                  name={
                    isAdmin
                      ? "shield-checkmark"
                      : isVolunteerMode
                        ? "people"
                        : "person"
                  }
                  size={27}
                  color="#078F82"
                />
              </View>

              <View style={styles.profileInformation}>
                <Text
                  style={styles.profileName}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>

                <Text style={styles.profileRole}>
                  {isAdmin
                    ? roleLabel(currentRole)
                    : isGuest
                      ? "Public Access"
                      : isVolunteerMode
                        ? "Volunteer Mode"
                        : "Resident Mode"}
                </Text>

                {!!displayEmail && (
                  <Text
                    style={styles.email}
                    numberOfLines={1}
                  >
                    {displayEmail}
                  </Text>
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                style={styles.closeButton}
                onPress={onClose}
              >
                <Ionicons
                  name="close"
                  size={25}
                  color="#1E293B"
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              {isGuest ? (
                <>
                  <DrawerSection title="PUBLIC ACCESS" />

                  <DrawerItem
                    icon="home-outline"
                    label="Public Home"
                    onPress={() =>
                      navigate("/public")
                    }
                  />

                  <DrawerItem
                    icon="warning-outline"
                    label="Emergency Information"
                    onPress={() =>
                      navigate(
                        "/public/disaster-response",
                      )
                    }
                  />

                  <DrawerItem
                    icon="map-outline"
                    label="Evacuation Map"
                    onPress={() =>
                      navigate(
                        "/public/map-tracking",
                      )
                    }
                  />

                  <DrawerItem
                    icon="heart-outline"
                    label="Donation Information"
                    onPress={() =>
                      navigate("/public/donation")
                    }
                  />

                  <DrawerSection title="ACCOUNT" />

                  <DrawerItem
                    icon="log-in-outline"
                    label="Sign In"
                    onPress={() =>
                      navigate("/login")
                    }
                  />

                  <DrawerItem
                    icon="person-add-outline"
                    label="Create Account"
                    onPress={() =>
                      navigate("/signup")
                    }
                  />
                </>
              ) : isAdmin ? (
                <>
                  <DrawerSection title="OPERATIONS" />

                  <DrawerItem
                    icon="grid-outline"
                    label="Command Center"
                    onPress={() =>
                      navigate(
                        "/(admin)/command-center",
                      )
                    }
                  />

                  <DrawerItem
                    icon="warning-outline"
                    label="Disaster Cases"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-cases",
                      )
                    }
                  />

                  <DrawerItem
                    icon="hand-left-outline"
                    label="Assistance Requests"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-requests",
                      )
                    }
                  />

                  <DrawerItem
                    icon="person-add-outline"
                    label="Account Approvals"
                    onPress={() =>
                      navigate(
                        "/(admin)/account-approvals",
                      )
                    }
                  />

                  <DrawerSection title="MANAGEMENT" />

                  <DrawerItem
                    icon="cash-outline"
                    label="Donation Management"
                    onPress={() =>
                      navigate("/donation-list")
                    }
                  />

                  <DrawerItem
                    icon="calendar-outline"
                    label="Events & Attendance"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-events",
                      )
                    }
                  />

                  <DrawerItem
                    icon="megaphone-outline"
                    label="Announcements"
                    onPress={() =>
                      navigate(
                        "/(admin)/create-announcement",
                      )
                    }
                  />

                  <DrawerSection title="MONITORING" />

                  <DrawerItem
                    icon="analytics-outline"
                    label="Analytics"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-analytics",
                      )
                    }
                  />

                  <DrawerItem
                    icon="list-outline"
                    label="Activity Logs"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-logs",
                      )
                    }
                  />

                  {isSuperAdmin && (
                    <DrawerItem
                      icon="settings-outline"
                      label="System Settings"
                      onPress={() =>
                        navigate(
                          "/(admin)/system-settings",
                        )
                      }
                    />
                  )}

                  <DrawerSection title="ACCOUNT" />

                  <DrawerItem
                    icon="log-out-outline"
                    label="Sign Out"
                    danger
                    onPress={handleLogout}
                  />
                </>
              ) : (
                <>
                  {canUseVolunteerMode && (
                    <>
                      <DrawerSection title="MODE" />

                      <DrawerItem
                        icon="swap-horizontal-outline"
                        label={
                          isVolunteerMode
                            ? "Switch to Resident Mode"
                            : "Switch to Volunteer Mode"
                        }
                        onPress={() =>
                          void handleModeSwitch()
                        }
                      />
                    </>
                  )}

                  <DrawerSection title="MAIN" />

                  <DrawerItem
                    icon="home-outline"
                    label="Home"
                    onPress={() =>
                      navigate("/(tabs)")
                    }
                  />

                  <DrawerItem
                    icon="person-outline"
                    label="My Profile"
                    onPress={() =>
                      navigate("/profile")
                    }
                  />

                  <DrawerItem
                    icon="notifications-outline"
                    label="Notifications"
                    onPress={() =>
                      navigate("/notifications")
                    }
                  />

                  {isVolunteerMode ? (
                    <>
                      <DrawerSection title="VOLUNTEER OPERATIONS" />

                      <DrawerItem
                        icon="map-outline"
                        label="Live Response Map"
                        onPress={() =>
                          navigate("/map-tracking")
                        }
                      />

                      <DrawerItem
                        icon="people-outline"
                        label="Volunteer Tasks"
                        onPress={() =>
                          navigate("/volunteer")
                        }
                      />

                      <DrawerItem
                        icon="heart-outline"
                        label="Donation Operations"
                        onPress={() =>
                          navigate("/donation")
                        }
                      />

                      <DrawerSection title="MY VOLUNTEER ACTIVITY" />

                      <DrawerItem
                        icon="ribbon-outline"
                        label="My Progress"
                        onPress={() =>
                          navigate("/volunteer-impact")
                        }
                      />

                      <DrawerItem
                        icon="document-outline"
                        label="Certificates"
                        onPress={() =>
                          navigate("/certificate")
                        }
                      />
                    </>
                  ) : (
                    <>
                      <DrawerSection title="RESIDENT SERVICES" />

                      <DrawerItem
                        icon="map-outline"
                        label="Live Map"
                        onPress={() =>
                          navigate("/map-tracking")
                        }
                      />

                      <DrawerItem
                        icon="warning-outline"
                        label="Report a Disaster"
                        onPress={() =>
                          navigate("/disaster-response")
                        }
                      />

                      <DrawerItem
                        icon="hand-left-outline"
                        label="Request Assistance"
                        onPress={() =>
                          navigate("/resident")
                        }
                      />

                      <DrawerItem
                        icon="heart-outline"
                        label="Make a Donation"
                        onPress={() =>
                          navigate("/donation")
                        }
                      />

                      <DrawerSection title="MY ACTIVITY" />

                      <DrawerItem
                        icon="document-text-outline"
                        label="My Reports"
                        onPress={() =>
                          navigate("/my-cases")
                        }
                      />

                      <DrawerItem
                        icon="time-outline"
                        label="Donation History"
                        onPress={() =>
                          navigate("/donation-history")
                        }
                      />
                    </>
                  )}

                  <DrawerSection title="COMMUNITY" />

                  <DrawerItem
                    icon="megaphone-outline"
                    label="Announcements"
                    onPress={() =>
                      navigate("/announcements")
                    }
                  />

                  <DrawerItem
                    icon="eye-outline"
                    label="Transparency"
                    onPress={() =>
                      navigate("/transparency")
                    }
                  />

                  <DrawerSection title="ACCOUNT" />

                  <DrawerItem
                    icon="log-out-outline"
                    label="Sign Out"
                    danger
                    onPress={handleLogout}
                  />
                </>
              )}

              <View style={styles.footer}>
                <Text style={styles.footerTitle}>
                  VolunServe
                </Text>

                <Text style={styles.footerSubtitle}>
                  City Disaster Response Platform
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function DrawerSection({
  title,
}: {
  title: string;
}) {
  return (
    <Text style={styles.sectionTitle}>
      {title}
    </Text>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
  danger = false,
}: DrawerItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerItem,
        danger && styles.dangerItem,
        pressed && styles.drawerItemPressed,
      ]}
    >
      <View
        style={[
          styles.drawerIcon,
          danger && styles.dangerIcon,
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={
            danger ? "#DC2626" : "#078F82"
          }
        />
      </View>

      <Text
        style={[
          styles.drawerText,
          danger && styles.dangerText,
        ]}
      >
        {label}
      </Text>

      <Ionicons
        name="chevron-forward"
        size={16}
        color="#94A3B8"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.40)",
  },

  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "84%",
    maxWidth: 350,
    backgroundColor: "#F7FAFC",
    elevation: 20,
    shadowColor: "#000000",
    shadowOffset: {
      width: 4,
      height: 0,
    },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },

  safeArea: {
    flex: 1,
  },

  profileHeader: {
    minHeight: 105,
    paddingHorizontal: 17,
    paddingVertical: 17,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEF3",
  },

  avatar: {
    width: 51,
    height: 51,
    borderRadius: 26,
    backgroundColor: "#DFF7F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  profileInformation: {
    flex: 1,
  },

  profileName: {
    color: "#101B2E",
    fontSize: 17,
    fontWeight: "800",
  },

  profileRole: {
    color: "#078F82",
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 2,
  },

  email: {
    color: "#64748B",
    fontSize: 10.5,
    marginTop: 2,
  },

  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 35,
  },

  sectionTitle: {
    color: "#078F82",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 13,
    marginBottom: 6,
    marginLeft: 7,
  },

  drawerItem: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    marginBottom: 5,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDF1F4",
  },

  drawerItemPressed: {
    backgroundColor: "#EAF9F5",
  },

  drawerIcon: {
    width: 33,
    height: 33,
    borderRadius: 10,
    backgroundColor: "#E5F8F3",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  drawerText: {
    flex: 1,
    color: "#273649",
    fontSize: 13,
    fontWeight: "600",
  },

  dangerItem: {
    borderColor: "#FEE2E2",
  },

  dangerIcon: {
    backgroundColor: "#FEF2F2",
  },

  dangerText: {
    color: "#DC2626",
  },

  footer: {
    marginTop: 20,
    paddingTop: 17,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5EBF0",
  },

  footerTitle: {
    color: "#078F82",
    fontSize: 14,
    fontWeight: "800",
  },

  footerSubtitle: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
  },
});