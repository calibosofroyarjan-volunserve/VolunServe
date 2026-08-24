import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SideDrawerProps = {
  visible: boolean;

  onClose: () => void;

  name?: string;

  email?: string;

  role?: string;
};

export default function SideDrawer({
  visible,
  onClose,
  name = "Froy Arjan",
  email = "",
  role = "resident",
}: SideDrawerProps) {
  const router = useRouter();

  const navigate = (route: string) => {
    onClose();

    setTimeout(() => {
      router.push(route as any);
    }, 80);
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
        {/* BACKDROP */}

        <Pressable
          style={styles.backdrop}
          onPress={onClose}
        />

        {/* DRAWER */}

        <View style={styles.drawer}>
          <SafeAreaView style={styles.safeArea}>
            {/* =================================================
                PROFILE HEADER
            ================================================= */}

            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Ionicons
                  name="person"
                  size={27}
                  color="#078F82"
                />
              </View>

              <View style={styles.profileInformation}>
                <Text style={styles.profileName}>
                  {name}
                </Text>

                <Text style={styles.profileRole}>
                  VolunServe Member
                </Text>

                {!!email && (
                  <Text style={styles.email}>
                    {email}
                  </Text>
                )}
              </View>

              <Pressable
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

            {/* =================================================
                MENU ITEMS
            ================================================= */}

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              {/* MAIN */}

              <DrawerSection title="MAIN" />

              <DrawerItem
                icon="home-outline"
                label="Home"
                onPress={() => navigate("/")}
              />

              <DrawerItem
                icon="person-outline"
                label="My Profile"
                onPress={() => navigate("/profile")}
              />

              <DrawerItem
                icon="notifications-outline"
                label="Notifications"
                onPress={() =>
                  navigate("/notifications")
                }
              />

              {/* SERVICES */}

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

              <DrawerItem
                icon="people-outline"
                label="Volunteer Events"
                onPress={() =>
                  navigate("/volunteer")
                }
              />

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

              {/* MY ACTIVITY */}

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

              <DrawerItem
                icon="ribbon-outline"
                label="Volunteer Impact"
                onPress={() =>
                  navigate("/volunteer-impact")
                }
              />

              <DrawerItem
                icon="trophy-outline"
                label="Event Leaderboard"
                onPress={() =>
                  navigate("/event-leaderboard")
                }
              />

              {/* COMMUNITY */}

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

              {/* VERIFICATION */}

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
                  navigate("/verify-certificate")
                }
              />

              <DrawerItem
                icon="receipt-outline"
                label="Verify Receipt"
                onPress={() =>
                  navigate("/verify-receipt")
                }
              />

              {/* ADMIN */}

              {(role === "admin" ||
                role === "superadmin") && (
                <>
                  <DrawerSection title="ADMINISTRATION" />

                  <DrawerItem
                    icon="grid-outline"
                    label="Admin Dashboard"
                    onPress={() =>
                      navigate("/admin-dashboard")
                    }
                  />

                  <DrawerItem
                    icon="analytics-outline"
                    label="Analytics"
                    onPress={() =>
                      navigate("/analytics")
                    }
                  />

                  <DrawerItem
                    icon="list-outline"
                    label="Admin Logs"
                    onPress={() =>
                      navigate("/admin-logs")
                    }
                  />

                  <DrawerItem
                    icon="cash-outline"
                    label="Donation List"
                    onPress={() =>
                      navigate("/donation-list")
                    }
                  />
                </>
              )}

              {/* FOOTER */}

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

/* ===========================================================
   DRAWER SECTION
=========================================================== */

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

/* ===========================================================
   DRAWER ITEM
=========================================================== */

function DrawerItem({
  icon,
  label,
  onPress,
}: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerItem,
        pressed && styles.drawerItemPressed,
      ]}
    >
      <View style={styles.drawerIcon}>
        <Ionicons
          name={icon}
          size={19}
          color="#078F82"
        />
      </View>

      <Text style={styles.drawerText}>
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

/* ===========================================================
   DRAWER STYLES
=========================================================== */

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

  /* PROFILE */

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

  /* MENU */

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

  /* FOOTER */

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