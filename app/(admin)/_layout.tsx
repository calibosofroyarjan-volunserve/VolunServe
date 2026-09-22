import { Ionicons } from "@expo/vector-icons";
import {
  Href,
  Redirect,
  router,
  Stack,
  usePathname,
} from "expo-router";
import React, {
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
  UserMode,
} from "../../lib/firebaseAuth";
import {
  useUserSession,
} from "../../lib/useUserSession";

const WEB_PORTAL_URL =
  "https://volunserve-3aa5b.web.app";

const SIDEBAR_WIDTH = 280;

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
    label: "Account Approvals",
    icon: "people-outline",
    route:
      "/(admin)/account-approvals",
  },
  {
    label: "Emergency Cases",
    icon: "warning-outline",
    route:
      "/(admin)/admin-cases",
  },
  {
    label: "Events",
    icon: "calendar-outline",
    route:
      "/(admin)/admin-events",
  },
  {
    label: "Donations",
    icon: "heart-outline",
    route: "/donation-list",
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
      "/(admin)/admin-certificates",
  },
  {
    label: "Disputes",
    icon:
      "shield-checkmark-outline",
    route:
      "/(admin)/admin-disputes",
  },
];

const initialsFor = (
  value: string,
) => {
  const parts = value
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

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

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

  const switchMode =
    async (
      mode: UserMode,
    ) => {
      try {
        await setActiveUserMode(
          mode,
        );

        setMobileMenuOpen(
          false,
        );

        router.replace(
          "/(tabs)",
        );
      } catch (
        error: any
      ) {
        Alert.alert(
          "Mode Switch Failed",
          error?.message ||
            "Unable to switch account mode.",
        );
      }
    };

  const signOut =
    async () => {
      try {
        setMobileMenuOpen(
          false,
        );

        await logoutUser();

        router.replace(
          "/login",
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
      <Redirect href="/login" />
    );
  }

  if (
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <Redirect href="/login" />
    );
  }

  if (
    role ===
    "superadmin"
  ) {
    return (
      <Redirect href="/(superadmin)" />
    );
  }

  if (role !== "admin") {
    return (
      <Redirect href="/(tabs)" />
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
              Linking.openURL(
                WEB_PORTAL_URL,
              ).catch(
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
    <View
      style={
        styles.sidebar
      }
    >
      <View
        style={
          styles.brand
        }
      >
        <View
          style={
            styles.brandMark
          }
        >
          <Ionicons
            name="heart"
            size={22}
            color="#FFFFFF"
          />
        </View>

        <View>
          <Text
            style={
              styles.brandName
            }
          >
            VolunServe
          </Text>

          <Text
            style={
              styles.brandTagline
            }
          >
            People. Response. Community.
          </Text>
        </View>
      </View>

      <ScrollView
        style={
          styles.sidebarScroll
        }
        contentContainerStyle={
          styles.sidebarContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text
          style={
            styles.sidebarSection
          }
        >
          ADMIN PORTAL
        </Text>

        {NAV_ITEMS.map(
          (item) => {
            const active =
              pathname ===
                item.route ||
              (
                item.route ===
                  "/(admin)/command-center" &&
                pathname ===
                  "/command-center"
              ) ||
              (
                item.route.includes(
                  "/(admin)/",
                ) &&
                pathname.endsWith(
                  item.route
                    .split("/")
                    .pop() || "",
                )
              );

            return (
              <TouchableOpacity
                key={
                  item.label
                }
                style={[
                  styles.navItem,
                  active &&
                    styles.navItemActive,
                ]}
                activeOpacity={
                  0.82
                }
                onPress={() =>
                  openRoute(
                    item.route,
                  )
                }
              >
                <Ionicons
                  name={
                    item.icon
                  }
                  size={20}
                  color={
                    active
                      ? "#FFFFFF"
                      : "#B9C7DA"
                  }
                />

                <Text
                  style={[
                    styles.navLabel,
                    active &&
                      styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          },
        )}

        <View
          style={
            styles.divider
          }
        />

        <Text
          style={
            styles.sidebarSection
          }
        >
          SWITCH MODE
        </Text>

        <TouchableOpacity
          style={
            styles.navItem
          }
          activeOpacity={
            0.82
          }
          onPress={() =>
            void switchMode(
              "resident",
            )
          }
        >
          <Ionicons
            name="person-outline"
            size={20}
            color="#B9C7DA"
          />

          <Text
            style={
              styles.navLabel
            }
          >
            Use as Resident
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            styles.navItem
          }
          activeOpacity={
            0.82
          }
          onPress={() =>
            void switchMode(
              "volunteer",
            )
          }
        >
          <Ionicons
            name="people-outline"
            size={20}
            color="#B9C7DA"
          />

          <Text
            style={
              styles.navLabel
            }
          >
            Use as Volunteer
          </Text>
        </TouchableOpacity>

        <View
          style={
            styles.divider
          }
        />

        <TouchableOpacity
          style={
            styles.navItem
          }
          activeOpacity={
            0.82
          }
          onPress={() =>
            void signOut()
          }
        >
          <Ionicons
            name="log-out-outline"
            size={20}
            color="#D6DEEA"
          />

          <Text
            style={[
              styles.navLabel,
              styles.signOutLabel,
            ]}
          >
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View
        style={
          styles.sidebarFooter
        }
      >
        <Text
          style={
            styles.sidebarFooterText
          }
        >
          A SAFER{"\n"}
          STRONGER{"\n"}
          COMMUNITY{"\n"}
          TOGETHER.
        </Text>
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
                  "#F5F7FB",
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
    shell: {
      flex: 1,
      flexDirection: "row",
      backgroundColor:
        "#F5F7FB",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F8FAFC",
    },

    message: {
      marginTop: 10,
      color: "#64748B",
      fontWeight: "600",
    },

    sidebar: {
      width:
        SIDEBAR_WIDTH,
      height: "100%",
      backgroundColor:
        "#142A45",
    },

    brand: {
      minHeight: 92,
      paddingHorizontal: 24,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },

    brandMark: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor:
        "#635BDE",
      alignItems: "center",
      justifyContent:
        "center",
    },

    brandName: {
      color: "#FFFFFF",
      fontSize: 21,
      fontWeight: "900",
    },

    brandTagline: {
      marginTop: 2,
      color: "#8FA7C3",
      fontSize: 8.5,
      fontWeight: "600",
    },

    sidebarScroll: {
      flex: 1,
    },

    sidebarContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },

    sidebarSection: {
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 11,
      color: "#718AA8",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    navItem: {
      minHeight: 45,
      marginBottom: 3,
      paddingHorizontal: 12,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },

    navItemActive: {
      backgroundColor:
        "#5548B9",
    },

    navLabel: {
      color: "#D6DEEA",
      fontSize: 13,
      fontWeight: "700",
    },

    navLabelActive: {
      color: "#FFFFFF",
      fontWeight: "900",
    },

    divider: {
      height: 1,
      marginVertical: 14,
      marginHorizontal: 10,
      backgroundColor:
        "#29415E",
    },

    signOutLabel: {
      color: "#F1F5F9",
    },

    sidebarFooter: {
      paddingHorizontal: 30,
      paddingBottom: 26,
    },

    sidebarFooterText: {
      color: "#67A5CA",
      fontSize: 10,
      lineHeight: 16,
      fontWeight: "800",
      letterSpacing: 1,
    },

    main: {
      flex: 1,
      minWidth: 0,
      backgroundColor:
        "#F5F7FB",
    },

    topBar: {
      minHeight: 72,
      paddingHorizontal: 28,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor:
        "#E5E7EB",
      backgroundColor:
        "#FFFFFF",
    },

    topBarSpacer: {
      flex: 1,
    },

    mobileMenuButton: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    profileArea: {
      maxWidth: 300,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    profileAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#64748B",
    },

    profileAvatarText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    profileText: {
      minWidth: 0,
    },

    profileName: {
      color: "#0F172A",
      fontSize: 13,
      fontWeight: "900",
    },

    profileRole: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 10.5,
    },

    stackArea: {
      flex: 1,
      minHeight: 0,
    },

    mobileOverlay: {
      flex: 1,
      flexDirection: "row",
      backgroundColor:
        "rgba(15,23,42,0.35)",
    },

    mobileBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },

    mobileSidebar: {
      width:
        SIDEBAR_WIDTH,
      height: "100%",
      zIndex: 2,
    },

    blockedContainer: {
      flex: 1,
      padding: 24,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    blockedCard: {
      width: "100%",
      maxWidth: 460,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 28,
      alignItems: "center",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
      shadowColor:
        "#000000",
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
      justifyContent:
        "center",
      backgroundColor:
        "#CCFBF1",
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
      backgroundColor:
        "#0F766E",
      alignItems: "center",
      justifyContent:
        "center",
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
