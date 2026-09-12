import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { logoutUser } from "../lib/firebaseAuth";

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
}: SideDrawerProps) {
  const router = useRouter();
  const currentRole = normalizeRole(role);

  const isGuest = currentRole === "guest";
  const isVolunteer = currentRole === "volunteer";

  const isAdmin =
    currentRole === "admin" ||
    currentRole === "superadmin";

  const isSuperAdmin =
    currentRole === "superadmin";

  const navigate = (route: string) => {
    onClose();

    setTimeout(() => {
      router.push(route as any);
    }, 80);
  };

  const handleLogout = async () => {
    try {
      onClose();

      await logoutUser();

      router.replace("/login");
    } catch (error: any) {
      Alert.alert(
        "Sign Out Failed",
        error?.message ||
          "Unable to sign out. Please try again."
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
                  {name}
                </Text>

                <Text style={styles.profileRole}>
                  {roleLabel(currentRole)}
                </Text>

                {!!email && (
                  <Text
                    style={styles.email}
                    numberOfLines={1}
                  >
                    {email}
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
                    label="Disaster Information"
                    onPress={() =>
                      navigate(
                        "/public/disaster-response"
                      )
                    }
                  />

                  <DrawerItem
                    icon="map-outline"
                    label="Evacuation Map"
                    onPress={() =>
                      navigate(
                        "/public/map-tracking"
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
                  <DrawerSection title="ADMINISTRATION" />

                  <DrawerItem
                    icon="grid-outline"
                    label="Command Center"
                    onPress={() =>
                      navigate(
                        "/(admin)/command-center"
                      )
                    }
                  />

                  <DrawerItem
                    icon="person-add-outline"
                    label="Account Approvals"
                    onPress={() =>
                      navigate(
                        "/(admin)/account-approvals"
                      )
                    }
                  />

                  <DrawerItem
                    icon="warning-outline"
                    label="Disaster Cases"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-cases"
                      )
                    }
                  />

                  <DrawerItem
                    icon="hand-left-outline"
                    label="Assistance Requests"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-requests"
                      )
                    }
                  />

                  <DrawerItem
                    icon="calendar-outline"
                    label="Events and Attendance"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-events"
                      )
                    }
                  />

                  <DrawerItem
                    icon="cash-outline"
                    label="Donation Management"
                    onPress={() =>
                      navigate("/donation-list")
                    }
                  />

                  <DrawerItem
                    icon="megaphone-outline"
                    label="Create Announcement"
                    onPress={() =>
                      navigate(
                        "/(admin)/create-announcement"
                      )
                    }
                  />

                  <DrawerSection title="MONITORING" />

                  <DrawerItem
                    icon="analytics-outline"
                    label="Analytics"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-analytics"
                      )
                    }
                  />

                  <DrawerItem
                    icon="list-outline"
                    label="Admin Logs"
                    onPress={() =>
                      navigate(
                        "/(admin)/admin-logs"
                      )
                    }
                  />

                  {isSuperAdmin && (
                    <DrawerItem
                      icon="settings-outline"
                      label="System Settings"
                      onPress={() =>
                        navigate(
                          "/(admin)/system-settings"
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

                  <DrawerSection title="SERVICES" />

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

                  {isVolunteer && (
                    <DrawerItem
                      icon="people-outline"
                      label="Volunteer Events"
                      onPress={() =>
                        navigate("/volunteer")
                      }
                    />
                  )}

                  <DrawerItem
                    icon="map-outline"
                    label="Map Tracking"
                    onPress={() =>
                      navigate("/map-tracking")
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
                    label="My Disaster Cases"
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

                  {isVolunteer && (
                    <DrawerItem
                      icon="ribbon-outline"
                      label="Volunteer Impact"
                      onPress={() =>
                        navigate(
                          "/volunteer-impact"
                        )
                      }
                    />
                  )}

                  <DrawerItem
                    icon="trophy-outline"
                    label="Event Leaderboard"
                    onPress={() =>
                      navigate(
                        "/event-leaderboard"
                      )
                    }
                  />

                  <DrawerSection title="COMMUNITY" />

                  <DrawerItem
                    icon="megaphone-outline"
                    label="Announcements"
                    onPress={() =>
                      navigate("/announcements")
                    }
                  />

                  <DrawerItem
                    icon="podium-outline"
                    label="Leaderboard"
                    onPress={() =>
                      navigate("/leaderboard")
                    }
                  />

                  <DrawerItem
                    icon="eye-outline"
                    label="Transparency"
                    onPress={() =>
                      navigate("/transparency")
                    }
                  />

                  <DrawerSection title="VERIFICATION" />

                  <DrawerItem
                    icon="scan-outline"
                    label="Scanner"
                    onPress={() =>
                      navigate("/scan")
                    }
                  />

                  <DrawerItem
                    icon="document-outline"
                    label="Certificate"
                    onPress={() =>
                      navigate("/certificate")
                    }
                  />

                  <DrawerItem
                    icon="shield-checkmark-outline"
                    label="Verify Certificate"
                    onPress={() =>
                      navigate(
                        "/verify-certificate"
                      )
                    }
                  />

                  <DrawerItem
                    icon="receipt-outline"
                    label="Verify Receipt"
                    onPress={() =>
                      navigate("/verify-receipt")
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