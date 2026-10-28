import { AppAlert } from "../../lib/appDialog";
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
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import {
  db,
} from "../../lib/firebase";

import {
  useUserSession,
} from "../../lib/useUserSession";
import { SJDM_BARANGAYS } from "../../constants/sjdmBarangays";

export default function CreateAnnouncement() {
  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [barangayPickerOpen, setBarangayPickerOpen] = useState(false);
  const [barangaySearch, setBarangaySearch] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
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

  const assignedBarangay =
    typeof profile?.barangay === "string"
      ? profile.barangay.trim()
      : "";
  const barangay = selectedBarangay ||
    (SJDM_BARANGAYS.includes(assignedBarangay) ? assignedBarangay : "");
  const shownBarangays = SJDM_BARANGAYS.filter(item =>
    item.toLowerCase().includes(barangaySearch.trim().toLowerCase())
  );

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!SJDM_BARANGAYS.includes(barangay)) {
      AppAlert.alert(
        "Select Barangay",
        "Choose an official SJDM barangay before publishing."
      );

      return;
    }

    if (cleanTitle.length < 3) {
      AppAlert.alert(
        "Invalid Title",
        "Please enter a clear announcement title."
      );

      return;
    }

    if (cleanMessage.length < 5) {
      AppAlert.alert(
        "Invalid Message",
        "Please enter an announcement message."
      );

      return;
    }

    try {
      setSubmitting(true);

      const batch = writeBatch(db);
      const announcementRef = doc(collection(db, "announcements"));
      batch.set(announcementRef, {
        title: cleanTitle,
        message: cleanMessage,
        audience: barangay,
        priority: "normal",
        publishAt: serverTimestamp(),
        linkUrl: "",
        imageUrl: "",
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "adminLogs")), {
        actionType: "announcement_published",
        targetType: "announcement",
        targetId: announcementRef.id,
        adminUid: user.uid,
        adminName: user.displayName || user.email || "LGU Administrator",
        description: "Published an LGU announcement for an authorized SJDM barangay.",
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      setTitle("");
      setMessage("");

      AppAlert.alert(
        "Announcement Posted",
        `The announcement was published for ${barangay}.`
      );
    } catch (error: any) {
      console.error(
        "Create announcement error:",
        error
      );

      AppAlert.alert(
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
        Publish an official LGU announcement for one selected
        SJDM barangay. Check the audience before publishing.
      </Text>

      <View style={styles.scopeCard}>
        <Text style={styles.scopeLabel}>
          ANNOUNCEMENT AREA
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Choose the announcement barangay"
          accessibilityState={{expanded:barangayPickerOpen}}
          onPress={() => setBarangayPickerOpen(value => !value)}
          style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",
            backgroundColor:"#FFFFFF",borderRadius:10,borderWidth:1,borderColor:"#AFCFC4",
            paddingHorizontal:12,minHeight:48,marginVertical:10}}>
          <Text style={styles.scopeValue}>{barangay || "Select SJDM barangay"}</Text>
          <Text style={{color:"#087F78",fontSize:16}}>{barangayPickerOpen ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {barangayPickerOpen && (
          <View style={{backgroundColor:"#FFFFFF",borderRadius:10,
            borderWidth:1,borderColor:"#DCE9E3",overflow:"hidden",marginBottom:10}}>
            <TextInput
              accessibilityLabel="Search SJDM barangays"
              value={barangaySearch}
              onChangeText={setBarangaySearch}
              placeholder="Search 62 barangays..."
              placeholderTextColor="#7C918A"
              style={{height:46,paddingHorizontal:12,color:"#173D32",
                borderBottomWidth:1,borderBottomColor:"#E1EAE5"}}
            />
            <ScrollView style={{maxHeight:220}} keyboardShouldPersistTaps="handled">
              {shownBarangays.map(item => (
                <TouchableOpacity key={item} accessibilityRole="button"
                  accessibilityLabel={"Target "+item}
                  onPress={() => {setSelectedBarangay(item);setBarangayPickerOpen(false);setBarangaySearch("");}}
                  style={{paddingVertical:12,paddingHorizontal:13,
                    backgroundColor:barangay===item?"#E7F5EF":"#FFFFFF",
                    borderBottomColor:"#EEF3F0",borderBottomWidth:1}}>
                  <Text style={{color:"#173D32",fontWeight:barangay===item?"800":"500"}}>
                    {item}{barangay===item?"  ✓":""}
                  </Text>
                </TouchableOpacity>
              ))}
              {shownBarangays.length===0 && <Text style={{color:"#607A70",padding:12}}>
                No matching SJDM barangay.
              </Text>}
            </ScrollView>
          </View>
        )}

        <Text style={styles.scopeHelp}>
          Only approved LGU Admins can publish. Select one of the
          official SJDM barangays; this message is not citywide.
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
        <Text style={styles.scopeHelp}>Templates are editable. Review the selected barangay and verify the announcement before publishing.</Text>
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
          Approved city LGU Admin accounts can publish to one
          selected SJDM barangay per announcement. Super Admin
          accounts are for system oversight, not LGU publishing.
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