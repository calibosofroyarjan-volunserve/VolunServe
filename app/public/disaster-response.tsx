import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function PublicDisasterResponse() {
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [needs, setNeeds] = useState("");
  const [media, setMedia] = useState<
    { uri: string; type: "image" | "video" }[]
  >([]);

  const requireLogin = () => {
    Alert.alert(
      "Login Required",
      "Please login or create an account to submit a disaster report."
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f1f5f9" }}>
      {/* 🔴 RED HEADER */}
      <View style={styles.header}>
        <Ionicons name="warning" size={50} color="#ffffff" />
        <Text style={styles.headerTitle}>Disaster Response</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* TYPE */}
        <Text style={styles.label}>Type of Disaster *</Text>
        <TextInput
          style={styles.input}
          placeholder="Fire, Landslide, Earthquake..."
          value={type}
          onChangeText={setType}
        />

        {/* DESCRIPTION */}
        <Text style={styles.label}>What happened? *</Text>
        <TextInput
          style={[styles.input, { height: 100 }]}
          placeholder="Describe the situation..."
          multiline
          value={description}
          onChangeText={setDescription}
        />

        {/* NEEDS */}
        <Text style={styles.label}>What do you need? *</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          placeholder="Rescue, Medical Assistance, Evacuation..."
          multiline
          value={needs}
          onChangeText={setNeeds}
        />

        {/* MEDIA SECTION */}
        <Text style={styles.label}>Upload Proof (Required)</Text>

        <View style={styles.mediaCard}>
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={requireLogin}
          >
            <Ionicons name="cloud-upload" size={22} color="#dc2626" />
            <Text style={styles.uploadText}>
              Upload Photos / Videos (0/5)
            </Text>
          </TouchableOpacity>

          {/* Preview example */}
          {media.map((item, index) => (
            <View key={index} style={styles.previewContainer}>
              {item.type === "image" ? (
                <Image source={{ uri: item.uri }} style={styles.preview} />
              ) : (
                <View style={styles.videoPreview}>
                  <Ionicons name="videocam" size={40} color="#ffffff" />
                  <Text style={{ color: "#fff" }}>Video Selected</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* SUBMIT */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={requireLogin}
        >
          <Text style={styles.submitText}>Submit Report</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#dc2626",
    paddingTop: 60,
    paddingBottom: 30,
    alignItems: "center",
    elevation: 8,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 10,
  },

  container: {
    padding: 20,
  },

  label: {
    fontWeight: "bold",
    marginBottom: 6,
    marginTop: 18,
  },

  input: {
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 14,
    elevation: 2,
  },

  mediaCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 15,
    elevation: 4,
  },

  uploadBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
  },

  uploadText: {
    marginLeft: 8,
    fontWeight: "bold",
    color: "#dc2626",
  },

  previewContainer: {
    position: "relative",
    marginTop: 15,
  },

  preview: {
    width: "100%",
    height: 220,
    borderRadius: 16,
  },

  videoPreview: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
  },

  submitBtn: {
    marginTop: 25,
    backgroundColor: "#dc2626",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
  },

  submitText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },
});