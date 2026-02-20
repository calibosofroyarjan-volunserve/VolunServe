import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
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
import { db } from "../../lib/firebase";

export default function DisasterResponse() {
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [needs, setNeeds] = useState("");
  const [media, setMedia] = useState<
    { uri: string; type: "image" | "video" }[]
  >([]);

  /* ================= PICK MEDIA ================= */

  const pickMedia = async () => {
    if (media.length >= 5) {
      Alert.alert("Limit Reached", "Maximum 5 files only.");
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const fileType = asset.type === "video" ? "video" : "image";

      setMedia([...media, { uri: asset.uri, type: fileType }]);
    }
  };

  const removeMedia = (index: number) => {
    const updated = media.filter((_, i) => i !== index);
    setMedia(updated);
  };

  /* ================= SUBMIT ================= */

  const submitReport = async () => {
    if (!type || !description || !needs || media.length === 0) {
      Alert.alert("Incomplete", "Please complete all required fields.");
      return;
    }

    try {
      await addDoc(collection(db, "disasterReports"), {
        type,
        description,
        needs,
        media,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      Alert.alert("Success", "Report submitted!");

      setType("");
      setDescription("");
      setNeeds("");
      setMedia([]);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Submission failed.");
    }
  };

  /* ================= UI ================= */

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
          <TouchableOpacity style={styles.uploadBtn} onPress={pickMedia}>
            <Ionicons name="cloud-upload" size={22} color="#dc2626" />
            <Text style={styles.uploadText}>
              Upload Photos / Videos ({media.length}/5)
            </Text>
          </TouchableOpacity>

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

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeMedia(index)}
              >
                <Ionicons name="close-circle" size={28} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* SUBMIT */}
        <TouchableOpacity style={styles.submitBtn} onPress={submitReport}>
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

  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#ffffff",
    borderRadius: 20,
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
