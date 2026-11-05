import { Ionicons } from "@expo/vector-icons";
import { Redirect, type Href } from "expo-router";
import {
  addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type Priority = "normal" | "urgent";
type Update = {
  id: string;
  title: string;
  message: string;
  priority?: Priority;
  publishAt?: { toDate?: () => Date };
};

const TEMPLATES = [
  { name: "System Maintenance", title: "VolunServe Scheduled Maintenance", message: "VolunServe platform maintenance is scheduled. Please check for further verified updates before accessing services." },
  { name: "Feature Release", title: "New VolunServe Feature Available", message: "A new VolunServe feature is available. Sign in to your account and explore the latest platform improvements." },
  { name: "Service Notice", title: "VolunServe Service Notice", message: "We are sharing an update about the availability of VolunServe online services. Please use official emergency hotlines for urgent assistance." },
  { name: "Account Security", title: "VolunServe Account Security Reminder", message: "For account security, do not share your password or verification codes. Only sign in through the official VolunServe website or application." },
];

export default function SuperAdminSystemUpdates() {
  const { user, profile, loading } = useUserSession();
  const role = String(profile?.role || "").toLowerCase();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Update[]>([]);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (!user || role !== "superadmin") return;
    return onSnapshot(
      query(collection(db, "announcements"), where("audience", "==", "all"),
        orderBy("publishAt", "desc"), limit(20)),
      snapshot => {
        setHistory(snapshot.docs.map(item => ({
          id: item.id, ...(item.data() as Omit<Update, "id">),
        })));
        setHistoryError("");
      },
      () => setHistoryError("System update history could not be loaded.")
    );
  }, [user?.uid, role]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#087D60" /><Text>Checking system permissions...</Text></View>;
  }
  if (!user || role !== "superadmin") {
    return <Redirect href={"/admin-login" as Href} />;
  }

  const validTitle = title.trim().length >= 3 && title.trim().length <= 120;
  const validMessage = message.trim().length >= 10 && message.trim().length <= 2000;
  const canSubmit = validTitle && validMessage && !busy;

  async function publish() {
    if (!user || !canSubmit) return;
    setBusy(true);
    setNotice("");
    try {
      // Identical permitted schema to existing LGU announcements; only the
      // server-protected publisher role and audience are different.
      await addDoc(collection(db, "announcements"), {
        title: title.trim(),
        message: message.trim(),
        audience: "all",
        priority,
        publishAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        linkUrl: "",
        imageUrl: "",
      });
      setTitle("");
      setMessage("");
      setPriority("normal");
      setReview(false);
      setNotice("System update published to the VolunServe feed for all approved accounts.");
    } catch (error: any) {
      setNotice(error?.code === "permission-denied"
        ? "Publishing is not yet authorized by the active Firebase Rules. The update was not posted."
        : error?.message || "Unable to publish the system update.");
    } finally {
      setBusy(false);
    }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name="settings-outline" size={25} color="#FFFFFF" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>SUPER ADMIN • SYSTEM COMMUNICATIONS</Text>
        <Text style={styles.heroTitle}>System Updates</Text>
        <Text style={styles.heroText}>Publish VolunServe platform maintenance, service and security information. These updates appear to all approved Residents and Volunteers.</Text>
      </View>
    </View>

    <View style={styles.warning}>
      <Ionicons name="shield-checkmark-outline" size={22} color="#075E4F" />
      <View style={{ flex: 1 }}>
        <Text style={styles.warningTitle}>Authority separation</Text>
        <Text style={styles.helper}>System Updates are issued by VolunServe administrators, not by the LGU. Barangay advisories, evacuation instructions and official community announcements must be published by authorized LGU Admins.</Text>
      </View>
    </View>

    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Publish a platform update</Text>
      <Text style={styles.helper}>Audience: All approved VolunServe accounts • Source: Super Admin</Text>
      <Text style={styles.label}>CHOOSE A TEMPLATE (OPTIONAL)</Text>
      <View style={styles.templates}>
        {TEMPLATES.map(template => <Pressable accessibilityRole="button" key={template.name}
          style={styles.chip} onPress={() => {
            setTitle(template.title); setMessage(template.message); setReview(false); setNotice("");
          }}>
          <Text style={styles.chipText}>{template.name}</Text>
        </Pressable>)}
      </View>

      <Text style={styles.label}>UPDATE TITLE *</Text>
      <TextInput style={styles.input} accessibilityLabel="System update title"
        placeholder="e.g. Scheduled platform maintenance" maxLength={120}
        value={title} onChangeText={value => { setTitle(value); setReview(false); }} />
      <Text style={styles.count}>{title.trim().length}/120</Text>

      <Text style={styles.label}>MESSAGE *</Text>
      <TextInput style={[styles.input, styles.multiline]}
        accessibilityLabel="System update message" multiline textAlignVertical="top"
        placeholder="Explain the actual platform change and what users need to do..."
        maxLength={2000} value={message}
        onChangeText={value => { setMessage(value); setReview(false); }} />
      <Text style={styles.count}>{message.trim().length}/2000</Text>

      <Text style={styles.label}>IMPORTANCE</Text>
      <View style={styles.templates}>
        {(["normal", "urgent"] as const).map(value => <Pressable
          key={value} accessibilityRole="button" accessibilityState={{ selected: priority === value }}
          style={[styles.chip, priority === value && styles.selectedChip]}
          onPress={() => { setPriority(value); setReview(false); }}>
          <Text style={styles.chipText}>{value === "normal" ? "Normal" : "Important"}</Text>
        </Pressable>)}
      </View>

      {!review ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Review System Update"
          disabled={!canSubmit} style={[styles.publishButton, !canSubmit && styles.disabled]}
          onPress={() => { setNotice(""); setReview(true); }}>
          <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
          <Text style={styles.publishText}>Review System Update</Text>
        </Pressable>
      ) : (
        <View style={styles.reviewPanel}>
          <Text style={styles.sectionTitle}>Final review • All approved accounts</Text>
          <Text style={styles.reviewTitle}>{title.trim()}</Text>
          <Text style={styles.reviewMessage}>{message.trim()}</Text>
          <Text style={styles.helper}>Source label: VolunServe System Update • {priority === "urgent" ? "Important" : "Normal"}</Text>
          <View style={styles.templates}>
            <Pressable style={styles.secondaryButton} onPress={() => setReview(false)}>
              <Text style={styles.secondaryText}>Edit</Text>
            </Pressable>
            <Pressable disabled={!canSubmit} style={[styles.publishButton, !canSubmit && styles.disabled]}
              onPress={() => void publish()}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send-outline" size={17} color="#FFFFFF" />}
              <Text style={styles.publishText}>{busy ? "Publishing..." : "Confirm Publish"}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
    </View>

    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Published System Updates</Text>
      <Text style={styles.helper}>The 20 most recent notices published to all approved accounts. Barangay-only notices do not appear here.</Text>
      {!!historyError && <Text accessibilityRole="alert" style={styles.notice}>{historyError}</Text>}
      {!history.length && !historyError && <Text style={styles.helper}>No system updates published yet.</Text>}
      {history.map(item => <View key={item.id} style={styles.historyRow}>
        <Ionicons name={item.priority === "urgent" ? "alert-circle-outline" : "settings-outline"}
          size={20} color={item.priority === "urgent" ? "#BD482C" : "#087D60"} />
        <View style={{ flex: 1 }}>
          <Text style={styles.historyTitle}>{item.title}</Text>
          <Text style={styles.helper}>{item.message}</Text>
          <Text style={styles.count}>{item.publishAt?.toDate?.()?.toLocaleString() || "Published"}</Text>
        </View>
      </View>)}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F2F8F7" },
  container: { padding: 24, paddingBottom: 80, maxWidth: 1120, width: "100%", alignSelf: "center", gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  hero: { flexDirection: "row", gap: 17, padding: 24, backgroundColor: "#075548", borderRadius: 16, alignItems: "center" },
  heroIcon: { padding: 15, borderRadius: 16, backgroundColor: "#158B77" },
  eyebrow: { color: "#B7EBDD", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heroTitle: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", marginTop: 5 },
  heroText: { color: "#D5F3E9", fontSize: 13, lineHeight: 21, marginTop: 6 },
  warning: { padding: 16, gap: 13, flexDirection: "row", borderWidth: 1, borderColor: "#B7E5D5", borderRadius: 13, backgroundColor: "#E5F8F0" },
  warningTitle: { color: "#064B40", fontWeight: "800", fontSize: 14, marginBottom: 3 },
  panel: { padding: 22, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DAE9E5", gap: 10 },
  sectionTitle: { color: "#13483C", fontWeight: "800", fontSize: 17 },
  helper: { color: "#59756E", fontSize: 12, lineHeight: 18 },
  label: { color: "#23574C", fontSize: 11, fontWeight: "800", marginTop: 10, letterSpacing: 0.5 },
  templates: { flexDirection: "row", flexWrap: "wrap", gap: 9, alignItems: "center" },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: "#C8DED7", backgroundColor: "#F4FAF8" },
  selectedChip: { borderColor: "#078365", backgroundColor: "#CFF6E6" },
  chipText: { color: "#185648", fontWeight: "700", fontSize: 12 },
  input: { borderWidth: 1, borderColor: "#CADDD8", borderRadius: 9, padding: 13, fontSize: 14, color: "#193F37", backgroundColor: "#FAFDFC" },
  multiline: { minHeight: 138 },
  count: { color: "#6D827C", textAlign: "right", fontSize: 11 },
  publishButton: { backgroundColor: "#087D60", borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 17, paddingVertical: 13, minWidth: 190 },
  publishText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  disabled: { opacity: 0.4 },
  reviewPanel: { backgroundColor: "#F0FAF6", padding: 17, borderRadius: 12, borderWidth: 1, borderColor: "#C5ECDD", gap: 12 },
  reviewTitle: { color: "#145246", fontSize: 17, fontWeight: "800" },
  reviewMessage: { color: "#234B41", lineHeight: 21 },
  secondaryButton: { paddingHorizontal: 25, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: "#AEDBCB" },
  secondaryText: { color: "#14564A", fontWeight: "800" },
  notice: { color: "#A04322", fontSize: 13, fontWeight: "700", marginTop: 6 },
  historyRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#E4F0ED" },
  historyTitle: { color: "#194B3E", fontSize: 14, fontWeight: "800", marginBottom: 4 },
});
