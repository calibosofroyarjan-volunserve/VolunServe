import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import {
    Button,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";
import { db } from "../../lib/firebase";

export default function CreateAnnouncement() {

  // 🔥 TEMP ROLE (SAFE — NO CRASH)
  const role: any = "superadmin";

  // 🔒 PROTECTION
  if (role !== "admin" && role !== "superadmin") {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Unauthorized</Text>
      </View>
    );
  }

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!title || !message) {
      alert("Fill all fields");
      return;
    }

    try {
      await addDoc(collection(db, "announcements"), {
        title,
        message,
        createdAt: serverTimestamp(),
      });

      alert("Announcement posted!");
      setTitle("");
      setMessage("");

    } catch (error) {
      console.log(error);
      alert("Error posting announcement");
    }
  };

  return (
    <View style={styles.container}>

      <Text style={styles.title}>
        Create Announcement
      </Text>

      <TextInput
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
        style={styles.input}
      />

      <TextInput
        placeholder="Message"
        value={message}
        onChangeText={setMessage}
        style={styles.input}
        multiline
      />

      <Button
        title="Post Announcement"
        onPress={handleSubmit}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff"
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 15
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 12,
    padding: 12,
    borderRadius: 10
  },

  error: {
    fontSize: 18,
    color: "red"
  }
});