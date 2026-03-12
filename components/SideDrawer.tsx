import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { logoutUser } from "../lib/firebaseAuth";

interface Props {
  visible: boolean;
  onClose: () => void;
  name: string;
  email: string;
}

export default function SideDrawer({
  visible,
  onClose,
  name,
  email,
}: Props) {
  const router = useRouter();

  const navigate = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const handleLogout = async () => {
    await logoutUser();
    onClose();
    router.replace("/login");
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        
        {/* BACKDROP */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* DRAWER */}
        <View style={styles.drawer}>

          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name?.charAt(0)?.toUpperCase()}
              </Text>
            </View>

            <Text style={styles.name}>{name}</Text>
            <Text style={styles.email}>{email}</Text>
          </View>

          {/* NAVIGATION */}

          <View style={styles.section}>

            <MenuItem
              label="Residents"
              icon="home"
              onPress={() => navigate("/resident")}
            />

            <MenuItem
              label="Disaster Response"
              icon="warning"
              onPress={() => navigate("/disaster-response")}
            />

            <MenuItem
              label="Volunteer"
              icon="people"
              onPress={() => navigate("/volunteer")}
            />

            <MenuItem
              label="Map Tracking"
              icon="map"
              onPress={() => navigate("/map-tracking")}
            />

            <MenuItem
              label="Donation"
              icon="heart"
              onPress={() => navigate("/donation")}
            />

          </View>

          {/* ACCOUNT */}

          <View style={styles.accountSection}>

            <MenuItem
              label="Profile"
              icon="person"
              onPress={() => navigate("/profile")}
            />

          </View>

          {/* PUSH LOGOUT TO BOTTOM */}
          <View style={{ flex: 1 }} />

          {/* LOGOUT */}

          <Pressable style={styles.logout} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>

        </View>
      </View>
    </Modal>
  );
}

const MenuItem = ({ label, icon, onPress }: any) => (
  <Pressable
    style={({ pressed }) => [
      styles.item,
      pressed && { backgroundColor: "#f8fafc" },
    ]}
    onPress={onPress}
  >
    <View style={styles.iconWrap}>
      <Ionicons name={icon} size={20} color="#0f766e" />
    </View>

    <Text style={styles.itemText}>{label}</Text>

    <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
  </Pressable>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  drawer: {
    width: "78%",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },

  header: {
    alignItems: "center",
    marginBottom: 30,
  },

  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#0f766e",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "bold",
  },

  name: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    color: "#0f172a",
  },

  email: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },

  section: {
    marginBottom: 15,
  },

  accountSection: {
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 10,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
  },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ecfeff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  itemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },

  logout: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
  },

  logoutText: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },
});