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
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [recipientBarangay, setRecipientBarangay] = useState("");
  const [barangaySearch, setBarangaySearch] = useState("");
  const [customAnnouncement, setCustomAnnouncement] = useState(true);
  const ANNOUNCEMENT_TEMPLATES = [
    { label: "Community Event Reminder", title: "Community Event Reminder", body: "Residents and volunteers are invited to check the published community event details and schedule in VolunServe." },
    { label: "Volunteer Schedule Update", title: "Volunteer Schedule Update", body: "Volunteers, please review your assigned activities and any schedule updates in VolunServe." },
    { label: "Public Service Advisory", title: "Public Service Advisory", body: "Please review the latest official barangay service advisory and follow instructions from authorized LGU personnel." },
  ];

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

  // LGU Admin selects the recipient of each local announcement.
  // Author and SJDM audience are validated by server rules, not Super Admin assignment.
  useEffect(() => {
    if (SJDM_BARANGAYS.includes(barangay)) setRecipientBarangay(barangay);
  }, [barangay]);
  const publishBarangay = SJDM_BARANGAYS.includes(recipientBarangay) ? recipientBarangay : "";
  const approvedOperationalAdmin = profile?.status === "approved" &&
    String((profile as any)?.adminStatus || "active") !== "suspended";
  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!approvedOperationalAdmin) {
      Alert.alert("Publishing Unavailable", "Only an active approved LGU Admin can publish.");
      return;
    }
    if (!publishBarangay) {
      Alert.alert("Choose Recipient Barangay", "Select an official SJDM barangay for this announcement.");
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
        error?.code === "permission-denied"
          ? "Publishing is not yet enabled for the selected area. Contact LGU system support."
          : "The announcement could not be published. Check your connection and try again."
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
      <AdminReviewHero eyebrow="LGU OPERATIONS / COMMUNICATION & REPORTS" title="Barangay Announcements" subtitle="Prepare and publish official barangay notices to residents and volunteers to your selected recipient barangay." icon="megaphone-outline" tag="LOCAL COMMUNICATION" />

      <View style={styles.scopeCard}>
        <Text style={styles.scopeLabel}>RECIPIENT BARANGAY *</Text>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Select announcement recipient barangay"
          accessibilityState={{ expanded: barangayOpen }}
          disabled={submitting || !approvedOperationalAdmin}
          onPress={() => setBarangayOpen(open => !open)}
          style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Text style={styles.scopeValue}>{publishBarangay || "Select recipient barangay"}</Text>
          <Text style={styles.scopeValue}>{barangayOpen ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {barangayOpen ? (
          <View style={{borderWidth:1,borderColor:"#C7EAE5",backgroundColor:"#FFFFFF",borderRadius:10,padding:8,marginBottom:12}}>
            <TextInput accessibilityLabel="Search official SJDM barangays" placeholder="Search barangay..."
              placeholderTextColor="#94A3B8" value={barangaySearch} onChangeText={setBarangaySearch}
              style={[styles.input,{marginBottom:4}]} />
            <ScrollView nestedScrollEnabled style={{maxHeight:205}}>
              {SJDM_BARANGAYS.filter(area => area.toLowerCase().includes(barangaySearch.trim().toLowerCase())).map(area => (
                <TouchableOpacity key={area} accessibilityRole="radio"
                  accessibilityState={{checked:recipientBarangay===area}}
                  onPress={() => {setRecipientBarangay(area);setBarangayOpen(false);setBarangaySearch("");}}
                  style={{padding:12,borderBottomWidth:1,borderBottomColor:"#EDF3EF",
                    backgroundColor:recipientBarangay===area?"#EAF8F6":"#FFFFFF"}}>
                  <Text style={{color:"#173D32",fontWeight:recipientBarangay===area?"800":"500"}}>
                    {area}{recipientBarangay===area?" · Selected":""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <Text style={styles.scopeHelp}>
          Choose the barangay that should receive your official LGU notice.
          Publishing is available to active, approved LGU Admin accounts only.
          The programmer Super Admin does not assign announcement recipients.
        </Text>
      </View>

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
        <Text style={styles.scopeHelp}>Templates are editable. Confirm current and accurate information before publishing; announcements go only to your selected recipient barangay.</Text>
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
            (submitting || !approvedOperationalAdmin || !publishBarangay) &&
              styles.submitButtonDisabled,
          ]}
          disabled={submitting || !approvedOperationalAdmin || !publishBarangay}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text style={styles.submitText}>
              Publish Barangay Announcement
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>
          Admin Announcement Scope
        </Text>

        <Text style={styles.noteText}>
          LGU Admins publish to their selected recipient barangay. System-wide
          platform updates are managed separately.
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