import React, { useState } from "react";

import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  Redirect,
  type Href,
} from "expo-router";

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import {
  db,
} from "../../lib/firebase";

import {
  useUserSession,
} from "../../lib/useUserSession";

export default function CreateAnnouncement() {
  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] =
    useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#087F78"
        />

        <Text style={styles.loadingText}>
          Loading...
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <Redirect
        href={"/login" as Href}
      />
    );
  }

  const role =
    typeof profile?.role === "string"
      ? profile.role.toLowerCase()
      : "";

  /*
   * ADMIN ONLY
   *
   * Admin:
   *   Local / operational announcements
   *
   * Super Admin:
   *   Global announcements from the
   *   Super Admin side
   */
  if (role !== "admin") {
    if (role === "superadmin") {
      return (
        <Redirect
          href={"/(superadmin)" as Href}
        />
      );
    }

    return (
      <Redirect
        href={"/(tabs)" as Href}
      />
    );
  }

  const barangay =
    typeof profile?.barangay === "string"
      ? profile.barangay.trim()
      : "";

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!barangay) {
      Alert.alert(
        "Barangay Required",
        "Your Admin account does not have an assigned barangay."
      );

      return;
    }

    if (cleanTitle.length < 3) {
      Alert.alert(
        "Invalid Title",
        "Please enter a clear announcement title."
      );

      return;
    }

    if (cleanMessage.length < 5) {
      Alert.alert(
        "Invalid Message",
        "Please enter an announcement message."
      );

      return;
    }

    try {
      setSubmitting(true);

      await addDoc(
        collection(db, "announcements"),
        {
          title: cleanTitle,

          message: cleanMessage,

          /*
           * Local Admin announcement.
           *
           * audience stores the Admin's
           * assigned barangay.
           */
          audience: barangay,

          priority: "normal",

          /*
           * Publish immediately.
           */
          publishAt: serverTimestamp(),

          /*
           * Optional fields retained for
           * compatibility with Firestore rules.
           */
          linkUrl: "",
          imageUrl: "",

          createdBy: user.uid,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setTitle("");
      setMessage("");

      Alert.alert(
        "Announcement Posted",
        `The announcement was published for ${barangay}.`
      );
    } catch (error: any) {
      console.error(
        "Create announcement error:",
        error
      );

      Alert.alert(
        "Unable to Post",
        error?.message ||
          "The announcement could not be published."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.eyebrow}>
        ADMIN OPERATIONS
      </Text>

      <Text style={styles.title}>
        Local Announcement
      </Text>

      <Text style={styles.subtitle}>
        Publish an operational announcement for
        residents and volunteers in your assigned
        barangay.
      </Text>

      <View style={styles.scopeCard}>
        <Text style={styles.scopeLabel}>
          ANNOUNCEMENT AREA
        </Text>

        <Text style={styles.scopeValue}>
          {barangay || "No barangay assigned"}
        </Text>

        <Text style={styles.scopeHelp}>
          Ordinary Admin accounts can only publish
          announcements for their assigned area.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>
          TITLE
        </Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Announcement title"
          placeholderTextColor="#94A3B8"
          maxLength={120}
        />

        <Text style={styles.inputLabel}>
          MESSAGE
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.messageInput,
          ]}
          value={message}
          onChangeText={setMessage}
          placeholder="Write the announcement..."
          placeholderTextColor="#94A3B8"
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />

        <Text style={styles.characterCount}>
          {message.length}/2000
        </Text>

        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting &&
              styles.submitButtonDisabled,
          ]}
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text style={styles.submitText}>
              Publish Local Announcement
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>
          Admin Announcement Scope
        </Text>

        <Text style={styles.noteText}>
          This page is for local operational
          announcements only. System-wide announcements
          are controlled by the Super Admin.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FA",
  },

  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 60,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FA",
  },

  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },

  eyebrow: {
    color: "#087F78",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  title: {
    color: "#123047",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 5,
  },

  subtitle: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 20,
  },

  scopeCard: {
    backgroundColor: "#EAF8F6",
    borderWidth: 1,
    borderColor: "#C7EAE5",
    borderRadius: 15,
    padding: 16,
    marginBottom: 16,
  },

  scopeLabel: {
    color: "#087F78",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  scopeValue: {
    color: "#123047",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5,
  },

  scopeHelp: {
    color: "#587174",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 20,
  },

  inputLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginBottom: 7,
    marginTop: 6,
  },

  input: {
    width: "100%",
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: "#1E293B",
    marginBottom: 14,
  },

  messageInput: {
    minHeight: 150,
  },

  characterCount: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    marginTop: -8,
    marginBottom: 15,
  },

  submitButton: {
    minHeight: 48,
    backgroundColor: "#087F78",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  submitButtonDisabled: {
    opacity: 0.6,
  },

  submitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  noteCard: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 15,
  },

  noteTitle: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900",
  },

  noteText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});