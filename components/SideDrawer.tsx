import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
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

          {/* MENU ITEMS */}

          <MenuItem
            label="Home"
            icon="home"
            onPress={() => navigate("/(tabs)/index")}
          />

          <MenuItem
            label="Donation"
            icon="heart"
            onPress={() => navigate("/(tabs)/donation")}
          />

          <MenuItem
            label="Volunteer"
            icon="people"
            onPress={() => navigate("/(tabs)/volunteer")}
          />

          {/* 🔥 ADDED DISASTER RESPONSE */}
          <MenuItem
            label="Disaster Response"
            icon="warning"
            onPress={() => navigate("/(tabs)/disaster-response")}
          />

          <MenuItem
            label="Map Tracking"
            icon="map"
            onPress={() => navigate("/(tabs)/map-tracking")}
          />

          <MenuItem
            label="Profile"
            icon="person"
            onPress={() => navigate("/(tabs)/profile")}
          />

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={styles.logout} onPress={handleLogout}>
            <Text style={{ color: "red", fontWeight: "600" }}>
              Logout
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const MenuItem = ({ label, icon, onPress }: any) => (
  <TouchableOpacity style={styles.item} onPress={onPress}>
    <Ionicons name={icon} size={20} color="#0f766e" />
    <Text style={styles.itemText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  drawer: {
    backgroundColor: "#fff",
    height: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#0f766e",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  email: {
    fontSize: 13,
    color: "#64748b",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  itemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  logout: {
    paddingVertical: 15,
  },
  close: {
    textAlign: "center",
    marginTop: 10,
    color: "#64748b",
  },
});
