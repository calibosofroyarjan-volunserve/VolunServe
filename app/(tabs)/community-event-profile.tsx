import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { onAuthChange } from "../../lib/firebaseAuth";

// A real, navigable public participant profile. Never reads another user's
// private users/{uid} document or reuses the signed-in user's editable My Profile.
// The existing authenticated event roster API exposes only opt-in-safe display
// fields and verifies that the viewer is an approved Volunteer.
type PublicParticipant = {
  key: string;
  name: string;
  avatarUrl?: string;
  status: "Joined";
};
type RosterResult = {
  ok?: boolean;
  volunteers?: PublicParticipant[];
  message?: string;
};
const API_URL = "https://volunserve.onrender.com";
const safeAvatar = (url: unknown) =>
  typeof url === "string" &&
  /^https:\/\/(?:res\.cloudinary\.com|lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//i.test(url)
    ? url : "";

export default function CommunityEventPublicProfile() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { eventId: rawEventId, member: rawMember, page: rawPage } =
    useLocalSearchParams<{ eventId?: string; member?: string; page?: string }>();
  const eventId = typeof rawEventId === "string" ? rawEventId : "";
  const member = typeof rawMember === "string" ? rawMember : "";
  const page = typeof rawPage === "string" ? rawPage : "1";
  const valid = /^[A-Za-z0-9_-]{1,160}$/.test(eventId) &&
    /^[a-f0-9]{16}$/.test(member) && /^[1-9][0-9]{0,2}$/.test(page);
  const [person, setPerson] = useState<PublicParticipant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const compact = width < 730;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/community-events");
  };

  useEffect(() => {
    let active = true;
    setPerson(null);
    setError("");
    if (!valid) {
      setLoading(false);
      setError("Invalid participant profile link.");
      return () => { active = false; };
    }
    setLoading(true);
    const unsubscribe = onAuthChange(async user => {
      if (!user) {
        if (active) { setLoading(false); setError("Sign in to view joined volunteers."); }
        return;
      }
      try {
        // Re-fetch verified server data: never trust a name or image in the URL.
        const token = await user.getIdToken();
        const response = await fetch(
          `${API_URL}/api/community-events/${encodeURIComponent(eventId)}/volunteers?page=${encodeURIComponent(page)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const payload: RosterResult = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Public volunteer profile unavailable.");
        }
        const matched = (payload.volunteers || []).find(v => v.key === member && v.status === "Joined");
        if (!matched) throw new Error("This volunteer is no longer listed on that page. Return to Community Events and open their profile again.");
        if (active) { setPerson(matched); setError(""); }
      } catch (reason) {
        if (active) {
          setPerson(null);
          setError(reason instanceof Error ? reason.message : "Unable to load public profile.");
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [eventId, member, page, valid]);

  return (
    <ScrollView style={styles.screen}
      contentContainerStyle={[styles.content, compact && styles.contentCompact]}>
      <View style={styles.shell}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
          <Ionicons name="arrow-back-outline" size={18} color="#087865" />
          <Text style={styles.backText}>Back to Community Events</Text>
        </Pressable>

        <View style={styles.pageHeading}>
          <Text style={styles.eyebrow}>VOLUNSERVE / COMMUNITY EVENTS</Text>
          <Text style={styles.pageTitle}>Volunteer Profile</Text>
          <Text style={styles.subtitle}>View the public information of a volunteer participating in this event.</Text>
        </View>

        {loading ? (
          <View style={styles.feedback}>
            <ActivityIndicator color="#07836E" size="large" />
            <Text style={styles.feedbackText}>Loading volunteer profile...</Text>
          </View>
        ) : error ? (
          <View style={styles.feedback}>
            <Ionicons name="information-circle-outline" size={32} color="#67828B" />
            <Text style={styles.feedbackText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={goBack} style={styles.actionButton}>
              <Text style={styles.actionText}>Return to Community Events</Text>
            </Pressable>
          </View>
        ) : person ? (
          <>
            <View style={[styles.profileCard, compact && styles.profileCardCompact]}>
              {safeAvatar(person.avatarUrl) ? (
                <Image source={{ uri: safeAvatar(person.avatarUrl) }} style={styles.portrait} resizeMode="cover" />
              ) : (
                <View style={styles.portraitFallback}>
                  <Ionicons name="person-outline" size={49} color="#087865" />
                </View>
              )}
              <View style={styles.identity}>
                <Text style={styles.label}>COMMUNITY VOLUNTEER</Text>
                <Text style={styles.name}>{person.name}</Text>
                <View style={styles.badges}>
                  <View style={styles.badge}><Ionicons name="people-outline" size={15} color="#077A60" />
                    <Text style={styles.badgeText}>Volunteer</Text></View>
                  <View style={styles.badge}><Ionicons name="checkmark-circle-outline" size={15} color="#077A60" />
                    <Text style={styles.badgeText}>Joined this event</Text></View>
                </View>
                <Text style={styles.identityNote}>This information is provided by the official Community Events participant roster.</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar-outline" size={21} color="#087865" />
                <Text style={styles.sectionTitle}>Community Participation</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Participation</Text>
                <Text style={styles.infoValue}>Joined Volunteer</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Source</Text>
                <Text style={styles.infoValue}>Published Community Event</Text>
              </View>
            </View>
            <View style={styles.privacyCard}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#537D78" />
              <Text style={styles.privacyText}>
                Only public display information is visible. Phone number, email,
                address, verification documents, and private attendance records are not shared.
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F9F7" },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, alignItems: "center" },
  contentCompact: { paddingHorizontal: 13, paddingTop: 14 },
  shell: { width: "100%", maxWidth: 900, gap: 16 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingVertical: 7, paddingRight: 12 },
  backText: { color: "#087865", fontSize: 13, fontWeight: "700" },
  pageHeading: { paddingVertical: 6, gap: 6 },
  eyebrow: { color: "#087865", fontSize: 10, fontWeight: "800", letterSpacing: 1.0 },
  pageTitle: { color: "#163C3A", fontSize: 27, lineHeight: 35, fontWeight: "800" },
  subtitle: { color: "#5B7880", fontSize: 13, lineHeight: 20 },
  profileCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E7E1", borderRadius: 14, padding: 24, flexDirection: "row", alignItems: "center", gap: 23 },
  profileCardCompact: { flexDirection: "column", alignItems: "flex-start", padding: 17, gap: 14 },
  portrait: { width: 114, height: 114, borderRadius: 57, backgroundColor: "#E9F6F2" },
  portraitFallback: { width: 114, height: 114, borderRadius: 57, backgroundColor: "#E7F4EF", alignItems: "center", justifyContent: "center" },
  identity: { flex: 1, minWidth: 0, gap: 8 },
  label: { color: "#0B8269", fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  name: { color: "#173B3B", fontSize: 24, fontWeight: "800", lineHeight: 31 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { backgroundColor: "#E7F7F0", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  badgeText: { color: "#08745E", fontSize: 12, fontWeight: "700" },
  identityNote: { color: "#71838B", fontSize: 12, lineHeight: 19, marginTop: 3 },
  infoCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E7E1", borderRadius: 13, padding: 20, gap: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionTitle: { color: "#173F3A", fontSize: 16, fontWeight: "800" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#EDF2EF" },
  infoKey: { color: "#667E86", fontSize: 12, flex: 1 },
  infoValue: { color: "#24494C", fontSize: 12, fontWeight: "700", textAlign: "right", flex: 1 },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 10, backgroundColor: "#EFF5F3", padding: 14 },
  privacyText: { flex: 1, color: "#657D80", fontSize: 12, lineHeight: 19 },
  feedback: { alignItems: "center", padding: 32, backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#D9E7E1", gap: 13 },
  feedbackText: { color: "#56717A", fontSize: 13, lineHeight: 21, textAlign: "center" },
  actionButton: { paddingVertical: 11, paddingHorizontal: 20, backgroundColor: "#087E69", borderRadius: 8, marginTop: 5 },
  actionText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
});
