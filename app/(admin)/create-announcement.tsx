import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import AdminReviewHero from "../../components/admin/AdminReviewHero";
import React, { useState } from "react";

import {
  ActivityIndicator,
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
  const [templateOpen, setTemplateOpen] = useState(false);
  const [customAnnouncement, setCustomAnnouncement] = useState(true);
  const ANNOUNCEMENT_TEMPLATES = [
    { label: "Community Event Reminder", title: "Community Event Reminder", body: "Residents and volunteers are invited to check the published community event details and schedule in VolunServe." },
    { label: "Volunteer Schedule Update", title: "Volunteer Schedule Update", body: "Volunteers, please review your assigned activities and any schedule updates in VolunServe." },
    { label: "Public Service Advisory", title: "Public Service Advisory", body: "Please review the latest official community service advisory and follow instructions from authorized personnel." },
  ];

  const [formNotice, setFormNotice] = useState<{kind: "error" | "success"; text: string} | null>(null);
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

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    setFormNotice(null);

    if (cleanTitle.length < 3) {
      setFormNotice({ kind: "error", text: "Title is required (at least 3 characters)." });

      return;
    }

    if (cleanMessage.length < 10) {
      setFormNotice({ kind: "error", text: "Message is required (at least 10 characters)." });

      return;
    }

    try {
      setSubmitting(true);
      // Refresh verified Admin claims without overriding profile/role authorization.
      await user.getIdToken(true);

      await addDoc(
        collection(db, "announcements"),
        {
          title: cleanTitle,

          message: cleanMessage,

          audience: "all",

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

      setFormNotice({ kind: "success", text: "Announcement published successfully for residents and volunteers." });
    } catch (error: any) {
      console.error(
        "Create announcement error:",
        error
      );

      setFormNotice({ kind: "error", text: error?.code === "permission-denied" || error?.code === "firestore/permission-denied"
        ? "Publishing blocked by Firestore permissions. Confirm your approved Admin profile, verified email, and deployed announcement rules. Nothing was published."
        : (error?.message || "The announcement could not be published. Please try again.") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <AdminReviewHero eyebrow="LGU OPERATIONS / COMMUNICATION & REPORTS" title="Announcements" subtitle="Prepare and publish authorized operational notices to residents and volunteers across VolunServe." icon="megaphone-outline" tag="COMMUNITY-WIDE" />

      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>ANNOUNCEMENT TYPE</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose announcement type"
          accessibilityState={{ expanded: templateOpen }} onPress={() => setTemplateOpen(!templateOpen)}
          style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Text style={{ color: "#173D32" }}>{customAnnouncement ? "Others — write your own" : (title || "Choose a template")}</Text>
        </TouchableOpacity>
        {templateOpen && <View style={{ borderWidth: 1, borderColor: "#DCE9E3", borderRadius: 9, marginBottom: 14 }}>
          {[...ANNOUNCEMENT_TEMPLATES, { label: "Others — write your own", title: "", body: "" }].map((item) =>
            <TouchableOpacity key={item.label} accessibilityRole="button"
              onPress={() => { setTitle(item.title); setMessage(item.body); setCustomAnnouncement(!item.title); setTemplateOpen(false); }}
              style={{ padding: 13, borderBottomWidth: 1, borderColor: "#EDF3EF" }}>
              <Text style={{ color: "#173D32" }}>{item.label}</Text>
            </TouchableOpacity>)}
        </View>}
        <Text style={styles.scopeHelp}>Templates are editable. Confirm accurate information before publishing to all residents and volunteers.</Text>
        <Text style={styles.inputLabel}>
          TITLE
        </Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={value => { setTitle(value); if (formNotice) setFormNotice(null); }}
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
          onChangeText={value => { setMessage(value); if (formNotice) setFormNotice(null); }}
          placeholder="Write the announcement..."
          placeholderTextColor="#94A3B8"
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />

        <Text style={styles.characterCount}>
          {message.length}/2000
        </Text>

        {formNotice ? (
          <View accessibilityRole="alert" style={[styles.notice, formNotice.kind === "success" ? styles.noticeSuccess : styles.noticeError]}>
            <Text style={styles.noticeText}>{formNotice.text}</Text>
          </View>
        ) : null}

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
              Publish Announcement
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.noteCard}><Text style={styles.noteTitle}>Community-wide announcements</Text><Text style={styles.noteText}>Published announcements appear for residents and volunteers in Community Updates and Notifications.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F8F7",
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
    backgroundColor: "#F6F8F7",
  },

  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },

  eyebrow: {
    color: "#23765F",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 1.3,
  },

  title: {
    color: "#173D32",
    fontSize: designUi.type.page.fontSize,
    fontWeight: designUi.type.page.fontWeight,
    marginTop: 5, lineHeight: designUi.type.page.lineHeight,},

  subtitle: {
    color: "#64748B",
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight,
    marginTop: 6,
    marginBottom: 20, fontWeight: designUi.type.body.fontWeight,},

  scopeCard: {
    backgroundColor: "#EAF8F6",
    borderWidth: 1,
    borderColor: "#C7EAE5",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  scopeLabel: {
    color: "#087F78",
    fontSize: designUi.type.label.fontSize,
    fontWeight: designUi.type.label.fontWeight,
    letterSpacing: 1, lineHeight: designUi.type.label.lineHeight,},

  scopeValue: {
    color: "#173D32",
    fontSize: vsType.size.section, fontFamily: vsType.family,
    fontWeight: "800",
    marginTop: 5,
  },

  scopeHelp: {
    color: "#587174",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 18,
    marginTop: 5,
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 17,
    padding: 20,
  },

  inputLabel: {
    color: "#475569",
    fontSize: designUi.type.label.fontSize,
    fontWeight: designUi.type.label.fontWeight,
    letterSpacing: 0.9,
    marginBottom: 7,
    marginTop: 6, lineHeight: designUi.type.label.lineHeight,},

  input: {
    width: "100%",
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: vsType.size.body, fontFamily: vsType.family,
    color: "#1E293B",
    marginBottom: 14,
  },

  messageInput: {
    minHeight: 150,
  },

  characterCount: {
    color: "#94A3B8",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
    textAlign: "right",
    marginTop: -8,
    marginBottom: 15,
  },

  notice: { borderWidth: 1, borderRadius: 9, padding: 13, marginBottom: 14 },
  noticeError: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  noticeSuccess: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  noticeText: { color: "#163F34", fontSize: designUi.type.body.fontSize, fontWeight: designUi.type.body.fontWeight, lineHeight: designUi.type.body.lineHeight,},
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
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
  },

  noteCard: {
    marginTop: 16,
    borderRadius: 15,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 15,
  },

  noteTitle: {
    color: "#334155",
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight, lineHeight: designUi.type.section.lineHeight,},

  noteText: {
    color: "#64748B",
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight,
    marginTop: 4, fontWeight: designUi.type.body.fontWeight,},
});