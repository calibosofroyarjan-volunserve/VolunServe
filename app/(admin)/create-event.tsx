import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

export default function CreateEvent() {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"disaster" | "training">("disaster");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = async () => {
    if (!title || !location || !date || !capacity) {
      Alert.alert("Incomplete", "Please fill all required fields.");
      return;
    }

    const cap = Number(capacity);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert("Invalid Capacity", "Capacity must be a valid number.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) return;

      await addDoc(collection(db, "volunteerEvents"), {
        title,
        type,
        location,
        date,
        capacity: cap,
        description,
        status: "upcoming",
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      Alert.alert("Success", "Volunteer event created.");

      setTitle("");
      setLocation("");
      setDate("");
      setCapacity("");
      setDescription("");
    } catch (error) {
      Alert.alert("Error", "Failed to create event.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Volunteer Event</Text>

      <TextInput
        placeholder="Event Title"
        style={styles.input}
        value={title}
        onChangeText={setTitle}
      />

      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[
            styles.typeButton,
            type === "disaster" && styles.selectedType,
          ]}
          onPress={() => setType("disaster")}
        >
          <Text>Disaster</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeButton,
            type === "training" && styles.selectedType,
          ]}
          onPress={() => setType("training")}
        >
          <Text>Training</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        placeholder="Location"
        style={styles.input}
        value={location}
        onChangeText={setLocation}
      />

      <TextInput
        placeholder="Date (e.g. March 20, 2026)"
        style={styles.input}
        value={date}
        onChangeText={setDate}
      />

      <TextInput
        placeholder="Capacity (Number of volunteers)"
        style={styles.input}
        keyboardType="numeric"
        value={capacity}
        onChangeText={setCapacity}
      />

      <TextInput
        placeholder="Description"
        style={[styles.input, { minHeight: 80 }]}
        multiline
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity style={styles.button} onPress={handleCreate}>
        <Text style={styles.buttonText}>Create Event</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 20 },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#fff",
  },

  typeRow: { flexDirection: "row", marginBottom: 14 },

  typeButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },

  selectedType: {
    backgroundColor: "#dbeafe",
  },

  button: {
    backgroundColor: "#2563eb",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },

  buttonText: { color: "#fff", fontWeight: "700" },
});
