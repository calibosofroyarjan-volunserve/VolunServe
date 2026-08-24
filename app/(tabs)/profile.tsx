import { useRouter } from "expo-router";
import { User } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import SideDrawer from "../../components/SideDrawer";
import { db } from "../../lib/firebase";
import {
  getUserProfile,
  logoutUser,
  onAuthChange,
  updateUserProfile,
  UserProfile,
} from "../../lib/firebaseAuth";

export default function Profile() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [occupation, setOccupation] = useState("");

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      setUser(u);
      const data = await getUserProfile(u.uid);
      setProfile(data);

      setFullName(data.fullName);
      setPhoneNumber(data.phoneNumber);
      setAddress(data.address || "");
      setOccupation(data.occupation || "");

      setRole(data.role?.trim().toLowerCase() || "");
      setLoading(false);
    });

    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const unread = snapshot.docs.filter((doc) => {
          const data: any = doc.data();
          return data.read !== true;
        }).length;

        setUnreadNotifications(unread);
      },
      (error) => {
        console.log("Notification count error:", error);
        setUnreadNotifications(0);
      }
    );

    return () => unsub();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    await updateUserProfile(user.uid, {
      fullName,
      phoneNumber,
      address,
      occupation,
    });

    const updated = await getUserProfile(user.uid);
    setProfile(updated);
    setEditOpen(false);
  };

  const points = profile?.points || 0;
  const joined = profile?.joined || 0;
  const completed = profile?.completed || 0;
  const completionRate = Math.round((completed / (joined || 1)) * 100);

  const getRank = () => {
    if (points >= 50) return "🏆 Elite Volunteer";
    if (points >= 20) return "🥇 Top Performer";
    if (points >= 10) return "🔥 Active";
    if (points >= 5) return "⭐ Contributor";
    return "👤 Beginner";
  };

  const getNextRank = () => {
    if (points >= 50) {
      return {
        label: "Max Rank Reached",
        current: 50,
        target: 50,
        percent: 100,
      };
    }

    if (points >= 20) {
      return {
        label: "Progress to Elite Volunteer",
        current: points,
        target: 50,
        percent: Math.min((points / 50) * 100, 100),
      };
    }

    if (points >= 10) {
      return {
        label: "Progress to Top Performer",
        current: points,
        target: 20,
        percent: Math.min((points / 20) * 100, 100),
      };
    }

    if (points >= 5) {
      return {
        label: "Progress to Active",
        current: points,
        target: 10,
        percent: Math.min((points / 10) * 100, 100),
      };
    }

    return {
      label: "Progress to Contributor",
      current: points,
      target: 5,
      percent: Math.min((points / 5) * 100, 100),
    };
  };

  const nextRank = getNextRank();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerTop}>
        <Text style={styles.pageTitle}>My Profile</Text>
        <TouchableOpacity onPress={() => setDrawerOpen(true)}>
          <Text style={{ fontSize: 26 }}>☰</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Manage your account and view your activity
      </Text>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditOpen(true)}
          >
            <Text style={{ fontWeight: "600" }}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.fullName?.charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.name}>{profile?.fullName}</Text>

        <Info label="Email" value={profile?.email} />
        <Info label="Phone" value={profile?.phoneNumber} />
        <Info label="Location" value={profile?.address} />
        <Info label="Occupation" value={profile?.occupation} />
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>My Activity</Text>

        <View style={styles.statsBox}>
          <Text style={styles.rankText}>{getRank()}</Text>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>⭐ Points</Text>
            <Text style={styles.statValue}>{points}</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>📅 Events Joined</Text>
            <Text style={styles.statValue}>{joined}</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>✅ Completed</Text>
            <Text style={styles.statValue}>{completed}</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>📊 Completion Rate</Text>
            <Text style={styles.statValue}>{completionRate}%</Text>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>{nextRank.label}</Text>
              <Text style={styles.progressValue}>
                {nextRank.current}/{nextRank.target} pts
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${nextRank.percent}%` as any },
                ]}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.editBtn, { marginTop: 15 }]}
          onPress={() => router.push("/(tabs)/donation-history")}
        >
          <Text style={{ fontWeight: "600" }}>My Donation History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.editBtn, styles.notificationBtn, { marginTop: 10 }]}
          onPress={() => router.push("/(tabs)/notifications" as any)}
        >
          <Text style={{ fontWeight: "600" }}>My Notifications</Text>

          {unreadNotifications > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotifications}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>🏆 Achievements</Text>

        {profile?.achievements?.length ? (
          profile.achievements.map((achievement: string, index: number) => (
            <View key={index} style={styles.achievementItem}>
              <Text style={styles.achievementText}>{achievement}</Text>
            </View>
          ))
        ) : (
          <Text style={{ marginTop: 6, color: "#64748b" }}>
            No achievements unlocked yet.
          </Text>
        )}
      </View>

      {(role === "admin" || role === "superadmin") && (
        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.cardTitle}>Administration</Text>

          <TouchableOpacity
            style={[styles.editBtn, { marginTop: 15 }]}
            onPress={() => router.push("/(tabs)/donation-list")}
          >
            <Text style={{ fontWeight: "600" }}>
              Donation Administration
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.editBtn, { marginTop: 10 }]}
            onPress={() => router.push("/(tabs)/transparency")}
          >
            <Text style={{ fontWeight: "600" }}>
              Public Transparency
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.editBtn, { marginTop: 10 }]}
            onPress={() => router.push("/(tabs)/analytics")}
          >
            <Text style={{ fontWeight: "600" }}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.editBtn, { marginTop: 10 }]}
            onPress={() => router.push("/(tabs)/admin-analytics" as any)}
          >
            <Text style={{ fontWeight: "600" }}>
              Admin Analytics Dashboard
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={{
          backgroundColor: "#111827",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 16,
        }}
        onPress={() => router.push("/(tabs)/verify-receipt" as any)}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>
          Verify Receipt
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logout}
        onPress={async () => {
          await logoutUser();
          router.replace("/login");
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Logout</Text>
      </TouchableOpacity>

      <Modal visible={editOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Input value={fullName} onChange={setFullName} placeholder="Full Name" />
            <Input value={phoneNumber} onChange={setPhoneNumber} placeholder="Phone" />
            <Input value={address} onChange={setAddress} placeholder="Address" />
            <Input value={occupation} onChange={setOccupation} placeholder="Occupation" />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={{ color: "#fff" }}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setEditOpen(false)}>
              <Text style={{ textAlign: "center", marginTop: 10 }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        name={profile?.fullName || "User"}
        email={profile?.email || ""}
      />
    </ScrollView>
  );
}

const Info = ({ label, value }: any) => (
  <View style={{ marginTop: 12 }}>
    <Text style={{ fontSize: 12, color: "#64748b" }}>{label}</Text>
    <Text style={{ fontSize: 15, fontWeight: "600" }}>
      {value || "-"}
    </Text>
  </View>
);

const Input = ({ value, onChange, placeholder }: any) => (
  <TextInput
    value={value}
    onChangeText={onChange}
    placeholder={placeholder}
    style={{
      borderWidth: 1,
      borderColor: "#e5e7eb",
      padding: 12,
      borderRadius: 10,
      marginBottom: 10,
    }}
  />
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb", padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageTitle: { fontSize: 26, fontWeight: "700" },
  subtitle: { color: "#64748b", marginBottom: 20 },
  card: { backgroundColor: "#fff", padding: 20, borderRadius: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  notificationBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  notificationBadge: {
    backgroundColor: "#dc2626",
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  notificationBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },

  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#4f46e5",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  name: { textAlign: "center", fontSize: 18, fontWeight: "700", marginTop: 10 },

  statsBox: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rankText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  statLabel: {
    color: "#475569",
    fontWeight: "600",
  },
  statValue: {
    color: "#0f172a",
    fontWeight: "900",
  },
  progressSection: {
    marginTop: 14,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "700",
  },
  progressValue: {
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "800",
  },
  progressTrack: {
    height: 12,
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4f46e5",
    borderRadius: 999,
  },

  achievementItem: {
    marginTop: 8,
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  achievementText: {
    color: "#0f172a",
    fontWeight: "700",
  },

  logout: {
    backgroundColor: "#ef4444",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 40,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  saveBtn: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
});