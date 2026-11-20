import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { db } from "../../lib/firebase";
import {
  activeModeForProfile,
  hasResidentAccess,
  hasVolunteerAccess,
  logoutUser,
  setActiveUserMode,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";
import { useAnnouncementAlerts } from "../../lib/announcementAlerts";
import { AppAlert } from "../../lib/appDialog";

type Notice = {
  id: string;
  title?: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: unknown;
};

const toMillis = (date: unknown): number => {
  if (date && typeof date === "object" && "toMillis" in date) {
    const method = (date as { toMillis?: unknown }).toMillis;
    if (typeof method === "function") {
      return (method as () => number).call(date);
    }
  }
  if (typeof date === "number") return date;
  if (typeof date === "string") return Date.parse(date) || 0;
  return 0;
};

/**
 * Desktop account actions for every non-Home Resident/Volunteer tab.
 * Home already provides these actions; keep its working UI unchanged.
 * React Navigation renders this as a tab header, above the scrollable screen,
 * so embedded maps, forms and page cards cannot cover the controls.
 */
export default function ResidentDesktopActions() {
  const router = useRouter();
  const { user, profile } = useUserSession();
  const { items: announcementAlerts } = useAnnouncementAlerts(user?.uid);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [menu, setMenu] = useState<"notifications" | "account" | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setNotices([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "notifications"), where("userId", "==", user.uid)),
      (snapshot) => setNotices(snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Notice, "id">),
      }))),
      () => setNotices([])
    );
  }, [user?.uid]);

  const notifications = useMemo<Notice[]>(
    () => [...notices, ...announcementAlerts].sort(
      (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
    ),
    [notices, announcementAlerts]
  );
  const unread = notifications.filter((item) => !item.read).length;
  const mode = activeModeForProfile(profile);
  const isVolunteer = mode === "volunteer" && hasVolunteerAccess(profile);
  const canSwitchMode = hasResidentAccess(profile) && hasVolunteerAccess(profile);
  const verified = profile?.identityVerified === true || profile?.identityStatus === "verified";
  const composedName = [profile?.firstName, profile?.middleName, profile?.lastName]
    .filter(Boolean).join(" ").trim();
  const displayName =
    profile?.fullName?.trim() ||
    composedName ||
    user?.displayName?.trim() ||
    profile?.email?.split("@")[0] ||
    user?.email?.split("@")[0] ||
    "VolunServe Member";

  const navigate = (href: string) => {
    setMenu(null);
    router.push(href as Href);
  };

  const switchMode = async () => {
    if (!canSwitchMode) return;
    setMenu(null);
    try {
      await setActiveUserMode(isVolunteer ? "resident" : "volunteer");
      router.replace("/(tabs)");
    } catch (error: any) {
      AppAlert.alert("Unable to switch mode", error?.message || "Please try again.");
    }
  };

  const signOut = async () => {
    setMenu(null);
    if (loggingOut) return;
    const confirmed = await AppAlert.confirm("Log Out", "Are you sure you want to log out of VolunServe?", "Log Out");
    if (!confirmed) return;
    setLoggingOut(true);
    try {
      await logoutUser();
      router.replace("/login");
    } catch (error: any) {
      AppAlert.alert("Log out failed", error?.message || "Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.systemPill}>
        <View style={styles.systemDot} />
        <Text style={styles.systemText}>System operational</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open notifications"
        accessibilityState={{ expanded: menu === "notifications" }}
        onPress={() => setMenu(menu === "notifications" ? null : "notifications")}
        style={styles.bell}
      >
        <Ionicons name="notifications-outline" size={23} color="#122B55" />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={menu === "account" ? "Close account menu" : "Open account menu"}
        accessibilityState={{ expanded: menu === "account" }}
        onPress={() => setMenu(menu === "account" ? null : "account")}
        style={styles.accountButton}
      >
        {profile?.profilePictureUrl ? (
          <Image source={{ uri: profile.profilePictureUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.accountText}>
          <Text numberOfLines={1} style={styles.accountName}>{displayName}</Text>
          <Text style={styles.accountRole}>{isVolunteer ? "Volunteer" : "Resident"}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color="#183153" />
      </Pressable>

      <Modal
        visible={menu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenu(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => setMenu(null)}
            style={StyleSheet.absoluteFillObject}
          />
          {menu === "notifications" ? (
            <View style={[styles.popover, styles.notificationPopover]}>
              <View style={styles.popoverHeading}>
                <View>
                  <Text style={styles.popoverTitle}>Notifications</Text>
                  <Text style={styles.popoverSubtitle}>{unread} unread update{unread === 1 ? "" : "s"}</Text>
                </View>
                <Pressable accessibilityLabel="Close notifications" onPress={() => setMenu(null)} style={styles.close}>
                  <Ionicons name="close-outline" size={20} color="#60768A" />
                </Pressable>
              </View>
              {notifications.length ? notifications.slice(0, 5).map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={"Open notification: " + (item.title || "VolunServe update")}
                  onPress={() => navigate("/notifications")}
                  style={[styles.noticeRow, !item.read && styles.unreadNotice]}
                >
                  <View style={styles.noticeIcon}>
                    <Ionicons
                      name={item.type === "announcement" ? "megaphone-outline" : "notifications-outline"}
                      size={17}
                      color="#087F74"
                    />
                  </View>
                  <View style={styles.noticeText}>
                    <Text style={styles.noticeTitle} numberOfLines={1}>{item.title || "VolunServe update"}</Text>
                    <Text style={styles.noticeMessage} numberOfLines={2}>{item.message || "Open your notifications for details."}</Text>
                  </View>
                  {!item.read && <View style={styles.unreadDot} />}
                </Pressable>
              )) : (
                <View style={styles.empty}>
                  <Ionicons name="notifications-off-outline" size={23} color="#8A9BA6" />
                  <Text style={styles.emptyText}>You're all caught up. No notifications yet.</Text>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all notifications"
                onPress={() => navigate("/notifications")}
                style={styles.viewAll}
              >
                <Text style={styles.viewAllText}>View All Notifications</Text>
                <Ionicons name="arrow-forward" size={16} color="#087F74" />
              </Pressable>
            </View>
          ) : null}
          {menu === "account" ? (
            <View style={[styles.popover, styles.accountPopover]}>
              <View style={styles.identity}>
                {profile?.profilePictureUrl ? (
                  <Image source={{ uri: profile.profilePictureUrl }} style={styles.identityAvatar} />
                ) : (
                  <View style={[styles.identityAvatar, styles.identityAvatarFallback]}>
                    <Text style={styles.identityAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.identityText}>
                  <Text style={styles.identityName} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.identityRole}>{isVolunteer ? "Volunteer Account" : "Resident Account"}</Text>
                </View>
                {verified && <Ionicons name="checkmark-circle" size={18} color="#087B55" />}
              </View>
              <MenuAction icon="person-outline" label="My Profile" onPress={() => navigate("/profile")} />
              {!isVolunteer && <MenuAction icon="document-text-outline" label="My Reports" onPress={() => navigate("/my-cases")} />}
              {canSwitchMode && (
                <MenuAction
                  icon="swap-horizontal"
                  label={"Switch to " + (isVolunteer ? "Resident" : "Volunteer") + " Mode"}
                  onPress={() => void switchMode()}
                />
              )}
              <View style={styles.divider} />
              <MenuAction
                icon="log-out-outline"
                label={loggingOut ? "Logging out..." : "Log Out"}
                disabled={loggingOut}
                destructive
                onPress={() => void signOut()}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function MenuAction({
  icon,
  label,
  onPress,
  destructive,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={styles.menuAction}
    >
      <Ionicons name={icon} size={19} color={destructive ? "#D53242" : "#1A3156"} />
      <Text style={[styles.menuActionLabel, destructive && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 78,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EDF8FE",
    borderBottomWidth: 1,
    borderBottomColor: "#E0EBEF",
    zIndex: 50,
    overflow: "visible",
  },
  systemPill: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#B9E9D9",
    backgroundColor: "#E7FBF3",
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  systemDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#0AA679" },
  systemText: { color: "#08735C", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "800" },
  bell: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2EAF0",
  },
  badge: {
    position: "absolute", right: -4, top: -5,
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 4, backgroundColor: "#ED4056",
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: vsType.size.micro, fontFamily: vsType.family, fontWeight: "800" },
  accountButton: {
    minHeight: 50, width: 198, maxWidth: 260,
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 10, borderRadius: 13,
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2EAF0",
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#1489CC",
  },
  avatarInitial: { color: "#FFFFFF", fontSize: vsType.size.bodyStrong, fontFamily: vsType.family, fontWeight: "800" },
  accountText: { flex: 1, minWidth: 0 },
  accountName: { color: "#0F2552", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "800" },
  accountRole: { color: "#6B7F9B", fontSize: vsType.size.micro, fontFamily: vsType.family, marginTop: 3 },
  modalRoot: { flex: 1, backgroundColor: "transparent" },
  popover: {
    position: "absolute", top: 76, right: 24,
    backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#E0E9EE", borderRadius: 16,
    padding: 13, elevation: 20,
    shadowColor: "#102C3D", shadowOpacity: 0.15,
    shadowRadius: 19, shadowOffset: { width: 0, height: 7 },
  },
  notificationPopover: { width: 360, maxWidth: "95%" },
  accountPopover: { width: 306, maxWidth: "95%" },
  popoverHeading: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EAF1F3",
    paddingBottom: 12, marginBottom: 5,
  },
  popoverTitle: { fontSize: vsType.size.bodyStrong, fontFamily: vsType.family, fontWeight: "800", color: "#173847" },
  popoverSubtitle: { fontSize: vsType.size.caption, fontFamily: vsType.family, color: "#6B808D", marginTop: 3 },
  close: { padding: 6 },
  noticeRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, borderBottomWidth: 1, borderBottomColor: "#EFF3F5", borderRadius: 8,
  },
  unreadNotice: { backgroundColor: "#F1FAF6" },
  noticeIcon: { width: 35, height: 35, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#E2F3EC" },
  noticeText: { flex: 1, minWidth: 0 },
  noticeTitle: { color: "#203B4B", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "800" },
  noticeMessage: { color: "#506879", fontSize: vsType.size.caption, fontFamily: vsType.family, lineHeight: 17, marginTop: 3 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#0B9277" },
  empty: { alignItems: "center", padding: 22, gap: 8 },
  emptyText: { color: "#68818E", textAlign: "center", fontSize: vsType.size.caption, fontFamily: vsType.family },
  viewAll: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, paddingVertical: 12, marginTop: 7 },
  viewAllText: { color: "#087F74", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "800" },
  identity: { flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#EAF0F4", paddingBottom: 13, marginBottom: 7 },
  identityAvatar: { width: 38, height: 38, borderRadius: 19 },
  identityAvatarFallback: { backgroundColor: "#E1F1FD", alignItems: "center", justifyContent: "center" },
  identityAvatarText: { color: "#1178CE", fontSize: vsType.size.section, fontFamily: vsType.family, fontWeight: "800" },
  identityText: { flex: 1, minWidth: 0 },
  identityName: { color: "#102850", fontSize: vsType.size.label, fontFamily: vsType.family, fontWeight: "800" },
  identityRole: { color: "#647C9B", fontSize: vsType.size.caption, fontFamily: vsType.family, marginTop: 3 },
  menuAction: { minHeight: 45, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: 10 },
  menuActionLabel: { color: "#1A3156", fontSize: vsType.size.label, fontFamily: vsType.family, fontWeight: "700" },
  danger: { color: "#D53242" },
  divider: { height: 1, backgroundColor: "#E7EDF2", marginHorizontal: 9, marginVertical: 8 },
});
