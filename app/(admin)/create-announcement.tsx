import AdminReviewHero from "../../components/admin/AdminReviewHero";
import React, { useEffect, useState } from "react";
import { SJDM_BARANGAYS } from "../../constants/sjdmBarangays";

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
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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
  // LGU Admin declares the official area; programmers verify rather than choose it.
  const [requestedBarangay, setRequestedBarangay] = useState("");
  const [requestOffice, setRequestOffice] = useState("");
  const [requestPosition, setRequestPosition] = useState("");
  const [requestReference, setRequestReference] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const ANNOUNCEMENT_TEMPLATES = [
    { label: "Community Event Reminder", title: "Community Event Reminder", body: "Residents and volunteers are invited to check the published community event details and schedule in VolunServe." },
    { label: "Volunteer Schedule Update", title: "Volunteer Schedule Update", body: "Volunteers, please review your assigned activities and any schedule updates in VolunServe." },
    { label: "Public Service Advisory", title: "Public Service Advisory", body: "Please review the latest official barangay service advisory and follow instructions from authorized LGU personnel." },
  ];

  const [submitting, setSubmitting] =
    useState(false);

  useEffect(() => {
    if (!user?.uid || profile?.role !== "admin") return;
    return onSnapshot(
      doc(db, "lguBarangayRequests", user.uid),
      snapshot => {
        const data = snapshot.data();
        setRequestStatus(typeof data?.status === "string" ? data.status : "");
        if (data?.status === "rejected")
          setRequestError("The previous request was not verified. Check your official details and submit again.");
      },
      () => setRequestError("Area verification is unavailable. Please try again after server permissions are enabled.")
    );
  }, [user?.uid, profile?.role]);

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

  // Server security rules permit LGU Admin publishing only to the barangay
  // assigned in their verified profile. Never show an unauthorized audience.
  const validOfficialBarangay = SJDM_BARANGAYS.includes(barangay);
  const publishBarangay = validOfficialBarangay ? barangay : "";

  const submitAreaVerification = async () => {
    if (!user || requestBusy || validOfficialBarangay ||
        requestStatus === "pending" || requestStatus === "approved") return;
    if (!SJDM_BARANGAYS.includes(requestedBarangay)) {
      setRequestError("Select your officially assigned barangay in San Jose del Monte.");
      return;
    }
    const office = requestOffice.trim();
    const position = requestPosition.trim();
    const reference = requestReference.trim();
    if (office.length < 3 || office.length > 160 || position.length < 3 ||
        position.length > 120 || reference.length < 5 || reference.length > 160) {
      setRequestError("Enter your official LGU office, position, and non-sensitive appointment reference.");
      return;
    }
    setRequestError("");
    setRequestBusy(true);
    try {
      await setDoc(doc(db, "lguBarangayRequests", user.uid), {
        uid: user.uid, desiredBarangay: requestedBarangay, office, position,
        appointmentReference: reference, status: "pending",
        submittedAt: serverTimestamp(), reviewedBy: "",
        reviewedAt: null, rejectionReason: "",
      });
      setRequestStatus("pending");
    } catch {
      setRequestError("Request not submitted. Please check your connection and that area-verification permissions are enabled.");
    } finally {
      setRequestBusy(false);
    }
  };
  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!validOfficialBarangay || !publishBarangay || publishBarangay.toLowerCase() === "all" || publishBarangay !== barangay) {
      Alert.alert(
        "Barangay Required",
        "Your official LGU area is not yet verified. Complete the area-verification request on this page."
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

    if (cleanMessage.length < 10) {
      Alert.alert(
        "Invalid Message",
        "Write at least 10 characters so the announcement meets the official publishing rules."
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
          audience: publishBarangay,

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
        `The announcement was published for ${publishBarangay}.`
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
      <AdminReviewHero eyebrow="LGU OPERATIONS / COMMUNICATION & REPORTS" title="Barangay Announcements" subtitle="Prepare and publish official barangay notices to residents and volunteers within your assigned barangay." icon="megaphone-outline" tag="LOCAL COMMUNICATION" />

      <View style={styles.scopeCard}>
        <Text style={styles.scopeLabel}>OFFICIAL LGU ANNOUNCEMENT AREA</Text>
        <View style={[styles.input, { justifyContent: "center" }]}>
          <Text style={styles.scopeValue}>{validOfficialBarangay ? barangay : "Official barangay not verified"}</Text>
        </View>
        <Text style={styles.scopeHelp}>
          Announcements are published only to the area verified with the LGU appointment.
          Programmers handle system access and verification, not selecting operational barangays.
        </Text>
      </View>

      {!validOfficialBarangay ? (
        <View style={styles.formCard}>
          <Text style={styles.noteTitle}>Request Official Barangay Verification</Text>
          <Text style={styles.scopeHelp}>
            This legacy Admin account has no verified area. Select the barangay where you
            are officially assigned and submit your LGU appointment details. Super Admin
            verifies the request without picking a barangay. Publishing stays unavailable until approved.
          </Text>
          {requestStatus === "pending" || requestStatus === "approved" ? (
            <View style={{ padding: 14, backgroundColor: "#EAF8F6", borderRadius: 9, marginTop: 14 }}>
              <Text style={styles.noteTitle}>
                {requestStatus === "pending" ? "Verification pending" : "Area verified"}
              </Text>
              <Text style={styles.scopeHelp}>
                {requestStatus === "pending"
                  ? "Your request is recorded. Publishing unlocks after independent LGU verification."
                  : "Your authorized area will appear after the Admin profile is refreshed."}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.inputLabel}>OFFICIAL ASSIGNED BARANGAY *</Text>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 170, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10 }}>
                {SJDM_BARANGAYS.map(area => (
                  <TouchableOpacity key={area} accessibilityRole="radio"
                    accessibilityState={{ checked: requestedBarangay === area }}
                    onPress={() => setRequestedBarangay(area)}
                    style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: "#E2E8F0",
                      backgroundColor: requestedBarangay === area ? "#EAF8F6" : "#FFFFFF" }}>
                    <Text style={{ color: "#173D32", fontWeight: requestedBarangay === area ? "700" : "400" }}>
                      {area}{requestedBarangay === area ? " · Selected" : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.inputLabel}>LGU OFFICE / DEPARTMENT *</Text>
              <TextInput style={styles.input} value={requestOffice} onChangeText={setRequestOffice}
                placeholder="Official LGU office" placeholderTextColor="#94A3B8" maxLength={160} />
              <Text style={styles.inputLabel}>OFFICIAL POSITION *</Text>
              <TextInput style={styles.input} value={requestPosition} onChangeText={setRequestPosition}
                placeholder="Position on appointment" placeholderTextColor="#94A3B8" maxLength={120} />
              <Text style={styles.inputLabel}>APPOINTMENT REFERENCE *</Text>
              <TextInput style={styles.input} value={requestReference} onChangeText={setRequestReference}
                placeholder="Non-sensitive official memo/reference" placeholderTextColor="#94A3B8" maxLength={160} />
              <Text style={styles.scopeHelp}>Do not enter government ID numbers, private scans or passwords.</Text>
              {!!requestError && <Text accessibilityRole="alert" style={{ color: "#B91C1C", marginVertical: 10 }}>{requestError}</Text>}
              <TouchableOpacity style={[styles.submitButton, requestBusy && styles.submitButtonDisabled]}
                disabled={requestBusy} onPress={() => void submitAreaVerification()}>
                <Text style={styles.submitText}>{requestBusy ? "Submitting..." : "Submit for Official Verification"}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
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
        <Text style={styles.scopeHelp}>Templates are editable. Confirm current and accurate information before publishing; announcements stay within your assigned barangay.</Text>
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
            (submitting || !validOfficialBarangay) &&
              styles.submitButtonDisabled,
          ]}
          disabled={submitting || !validOfficialBarangay}
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
      )}

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