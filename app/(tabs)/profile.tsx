import { useRouter } from "expo-router";
import { User } from "firebase/auth";
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
import {
  getUserProfile,
  logoutUser,
  onAuthChange,
  updateUserProfile,
  UserProfile,
} from "../../lib/firebaseAuth";

import SideDrawer from "../../components/SideDrawer";

export default function Profile() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

      // ✅ GET ROLE
      setRole(data.role?.trim().toLowerCase() || "");

      setLoading(false);
    });

    return unsub;
  }, []);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.headerTop}>
        <Text style={styles.pageTitle}>My Profile</Text>
        <TouchableOpacity onPress={() => setDrawerOpen(true)}>
          <Text style={{ fontSize: 26 }}>☰</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Manage your account and view your activity
      </Text>

      {/* PERSONAL INFO */}
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

      {/* USER ACTIVITY */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>My Activity</Text>

        <TouchableOpacity
          style={[styles.editBtn, { marginTop: 15 }]}
          onPress={() => router.push("/(tabs)/donation-history")}
        >
          <Text style={{ fontWeight: "600" }}>My Donation History</Text>
        </TouchableOpacity>
      </View>

      {/* ADMIN SECTION */}
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
        </View>
      )}

      {/* ✅ VERIFY RECEIPT BUTTON - Added above Logout */}
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
        <Text style={{ color: "#fff", fontWeight: "800" }}>Verify Receipt</Text>
      </TouchableOpacity>

      {/* LOGOUT */}
      <TouchableOpacity
        style={styles.logout}
        onPress={async () => {
          await logoutUser();
          router.replace("/login");
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Logout</Text>
      </TouchableOpacity>

      {/* EDIT MODAL */}
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
              <Text style={{ textAlign: "center", marginTop: 10 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SIDE DRAWER */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        name={profile?.fullName || "User"}
        email={profile?.email || ""}
      />
    </ScrollView>
  );
}

/* Components */

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

/* Styles */

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
  cardTitle: { fontSize: 16, fontWeight: "600" },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
