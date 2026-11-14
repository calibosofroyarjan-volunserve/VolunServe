import AdminReviewHero from "../../components/admin/AdminReviewHero";
import React, { useEffect, useState } from "react";

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
  useLocalSearchParams,
  type Href,
} from "expo-router";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  db,
} from "../../lib/firebase";

import {
  useUserSession,
} from "../../lib/useUserSession";
import {
  buildPublicEmergencyAdvisory, canPreparePublicEmergencyAdvisory,
  safePublicAdvisoryBarangay,
} from "../../lib/emergencyPublicAdvisory";
import { SJDM_BARANGAYS } from "../../constants/sjdmBarangays";

export default function CreateAnnouncement() {
  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const params = useLocalSearchParams<{ incidentId?: string }>();
  const incidentId = typeof params.incidentId === "string"
    ? params.incidentId.trim() : "";
  const role = typeof profile?.role === "string" ? profile.role.toLowerCase() : "";

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [customAnnouncement, setCustomAnnouncement] = useState(true);
  const ANNOUNCEMENT_TEMPLATES = [
    { label: "Community Event Reminder", title: "Community Event Reminder", body: "Residents and volunteers are invited to check the published community event details and schedule in VolunServe." },
    { label: "Volunteer Schedule Update", title: "Volunteer Schedule Update", body: "Volunteers, please review your assigned activities and any schedule updates in VolunServe." },
    { label: "Public Service Advisory", title: "Public Service Advisory", body: "Please review the latest official community service advisory and follow instructions from authorized personnel." },
  ];

  const [submitting, setSubmitting] = useState(false);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [advisoryError, setAdvisoryError] = useState("");
  const [advisorySourceValidated, setAdvisorySourceValidated] = useState(false);
  const [advisorySourceSeverity, setAdvisorySourceSeverity] = useState("normal");
  const [advisoryBarangay, setAdvisoryBarangay] = useState("");
  const [advisoryPriority, setAdvisoryPriority] = useState<"normal" | "urgent">("normal");
  const [advisoryReviewed, setAdvisoryReviewed] = useState(false);

  // The emergency ID is an Admin-only route parameter. Never copy raw
  // report text, reporter information, photo URLs or exact coordinates.
  useEffect(() => {
    if (!incidentId || loading || !user || role !== "admin") return;
    let current = true;
    setAdvisoryLoading(true);
    setAdvisorySourceValidated(false);
    setAdvisoryError("");
    setAdvisoryReviewed(false);
    getDoc(doc(db, "disasterCases", incidentId))
      .then(snapshot => {
        if (!current) return;
        const caseData = snapshot.exists() ? snapshot.data() : null;
        if (!canPreparePublicEmergencyAdvisory(caseData)) {
          setAdvisoryBarangay("");
          setAdvisoryError("This report is not currently validated for a public advisory. Review the active case in Emergency Reports.");
          return;
        }
        setAdvisorySourceValidated(true);
        setAdvisorySourceSeverity(String(caseData?.severity || "normal"));
        const draft = buildPublicEmergencyAdvisory(caseData);
        if (draft) {
          setTitle(draft.title);
          setMessage(draft.message);
          setCustomAnnouncement(false);
          setAdvisoryPriority(draft.priority);
          setAdvisoryBarangay(draft.barangay);
        } else {
          // Never infer incident location from reporter's home barangay.
          setTitle("");
          setMessage("");
          setAdvisoryBarangay("");
          setAdvisoryPriority(["high", "critical"].includes(String(caseData?.severity || ""))
            ? "urgent" : "normal");
        }
      })
      .catch(() => {
        if (current) {
          setAdvisoryBarangay("");
          setAdvisoryError("Unable to verify the emergency report. No public advisory may be published from this case.");
        }
      })
      .finally(() => { if (current) setAdvisoryLoading(false); });
    return () => { current = false; };
  }, [incidentId, loading, role, user?.uid]);


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

    if (cleanTitle.length < 3) {
      Alert.alert(
        "Invalid Title",
        "Please enter a clear announcement title."
      );

      return;
    }

    if (cleanMessage.length < 10) {
      Alert.alert(
        "Invalid Message",
        "Write at least 10 characters so the announcement meets the official publishing rules."
      );

      return;
    }

    if (incidentId && (advisoryLoading || advisoryError || !advisorySourceValidated ||
        !safePublicAdvisoryBarangay(advisoryBarangay) || !advisoryReviewed)) {
      Alert.alert("Public Advisory Review Required",
        "Only validated cases with an official SJDM incident barangay may be shared. Review the message and confirm that no personal or exact-location details are included.");
      return;
    }

    try {
      setSubmitting(true);

      if (incidentId) {
        // Re-check current verification just before publication. A link to
        // Announcements is not an authorization to publish unverified cases.
        const latest = await getDoc(doc(db, "disasterCases", incidentId));
        const refreshed = latest.exists()
          ? buildPublicEmergencyAdvisory(latest.data(), advisoryBarangay) : null;
        if (!refreshed || refreshed.barangay !== safePublicAdvisoryBarangay(advisoryBarangay)) {
          throw new Error("Case verification or incident barangay changed. Return to Emergency Reports and review this advisory again.");
        }
      }

      await addDoc(
        collection(db, "announcements"),
        {
          title: cleanTitle,

          message: cleanMessage,

          audience: "all",

          priority: incidentId ? advisoryPriority : "normal",

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
      setAdvisoryReviewed(false);

      Alert.alert(
        "Announcement Posted",
        "Published to all residents and volunteers."
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
      <AdminReviewHero eyebrow="ADMIN WORKSPACE / COMMUNITY UPDATES" title="Announcements" subtitle="Admin reviews and publishes public notices to Residents and Volunteers. Emergency reports remain private." icon="megaphone-outline" tag="COMMUNITY-WIDE" />

      {incidentId ? (
        <View style={styles.scopeCard}>
          <Text style={styles.scopeLabel}>VERIFIED EMERGENCY → PUBLIC ADVISORY</Text>
          <Text style={styles.scopeHelp}>
            {advisoryLoading
              ? "Checking the report before preparing a public draft…"
              : advisoryError || (advisoryBarangay
                ? `Draft for Barangay ${advisoryBarangay}. Admin review is required before publishing.`
                : "Confirm the actual incident barangay below. Never assume the reporter's home barangay is the emergency location.")}
          </Text>
          <Text style={styles.scopeHelp}>
            Never publish resident names, contact information, private photos, house addresses, or GPS pins. A public advisory does not mean official responders have been dispatched.
          </Text>
          {!advisoryLoading && !advisoryError && advisorySourceValidated ? (
            <View style={{ marginTop: 12, marginBottom: 6 }}>
              <Text style={styles.inputLabel}>CONFIRM ACTUAL INCIDENT BARANGAY</Text>
              <TextInput
                style={styles.input}
                value={advisoryBarangay}
                onChangeText={value => {
                  const next = value.slice(0, 70);
                  setAdvisoryBarangay(next);
                  setAdvisoryReviewed(false);
                  const draft = buildPublicEmergencyAdvisory({
                    verificationStatus: "validated", status: "validated",
                    severity: advisorySourceSeverity,
                  }, next);
                  setTitle(draft?.title || "");
                  setMessage(draft?.message || "");
                }}
                placeholder="Type barangay from the official SJDM list"
                placeholderTextColor="#64748B"
                maxLength={70}
              />
              {advisoryBarangay.trim().length >= 2 &&
                !safePublicAdvisoryBarangay(advisoryBarangay) ? (
                <View style={{ borderWidth: 1, borderColor: "#DBE9E3", borderRadius: 8 }}>
                  {SJDM_BARANGAYS.filter(name =>
                    name.toLowerCase().includes(advisoryBarangay.trim().toLowerCase())
                  ).slice(0, 5).map(name => (
                    <TouchableOpacity key={name} accessibilityRole="button"
                      onPress={() => {
                        const draft = buildPublicEmergencyAdvisory({
                          verificationStatus: "validated", status: "validated",
                          severity: advisorySourceSeverity,
                        }, name);
                        if (!draft) return;
                        setAdvisoryBarangay(draft.barangay);
                        setTitle(draft.title);
                        setMessage(draft.message);
                        setAdvisoryReviewed(false);
                      }}
                      style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: "#EDF3EF" }}
                    >
                      <Text style={{ color: "#173D32" }}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <Text style={styles.scopeHelp}>
                Use the actual incident location, not the reporter's registered barangay.
              </Text>
            </View>
          ) : null}
          {!advisoryLoading && !advisoryError && advisorySourceValidated &&
            safePublicAdvisoryBarangay(advisoryBarangay) ? (
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: advisoryReviewed }}
              accessibilityLabel="Confirm public advisory contains no private report details"
              onPress={() => setAdvisoryReviewed(value => !value)}
              style={{ paddingVertical: 11 }}
            >
              <Text style={{ color: "#173D32", fontWeight: "700" }}>
                {advisoryReviewed ? "☑" : "☐"} I checked the advisory for accuracy and private information.
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

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
            (submitting || (Boolean(incidentId) &&
              (advisoryLoading || Boolean(advisoryError) || !advisorySourceValidated ||
              !safePublicAdvisoryBarangay(advisoryBarangay) || !advisoryReviewed))) &&
              styles.submitButtonDisabled,
          ]}
          disabled={submitting || (Boolean(incidentId) &&
            (advisoryLoading || Boolean(advisoryError) || !advisorySourceValidated ||
              !safePublicAdvisoryBarangay(advisoryBarangay) || !advisoryReviewed))}
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
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  title: {
    color: "#173D32",
    fontSize: 30,
    fontWeight: "700",
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
    borderRadius: 9,
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
    color: "#173D32",
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
    borderRadius: 9,
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
    borderRadius: 8,
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