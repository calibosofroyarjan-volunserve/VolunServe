import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PremiumAuthShell from "./PremiumAuthShell";
import { liveUi as ui } from "../../constants/volunserveLiveUi";

/**
 * Staging auth boundary. Do not mount credential inputs or login handlers
 * while the public read-only preview is using an intentionally fake Firebase.
 */
export default function ReadOnlyPreviewAuthNotice() {
  const router = useRouter();
  return (
    <PremiumAuthShell>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Ionicons name="eye-outline" color={ui.color.primary} size={28} />
        </View>
        <Text style={styles.eyebrow}>VOLUNSERVE · READ-ONLY PREVIEW</Text>
        <Text style={styles.title}>Sign-in is disabled on this preview</Text>
        <Text style={styles.body}>
          This website is for reviewing the VolunServe interface only. It uses a
          test Firebase configuration and cannot access real accounts.
        </Text>
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" color={ui.color.primary} size={20} />
          <Text style={styles.noticeText}>
            Please do not type your real email, password, ID documents, or payment details here.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open read-only interface preview"
          onPress={() => router.replace("/public/preview")}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Ionicons name="compass-outline" color={ui.color.white} size={20} />
          <Text style={styles.buttonText}>Open UI Preview</Text>
          <Ionicons name="arrow-forward-outline" color={ui.color.white} size={19} />
        </Pressable>
        <Text style={styles.footnote}>
          Login, sign-up, password reset, Google authentication, and live submissions
          are unavailable on this preview. Production VolunServe is separate.
        </Text>
      </View>
    </PremiumAuthShell>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%", maxWidth: 520, alignSelf: "center",
    backgroundColor: ui.color.surface, borderRadius: ui.radius.card,
    borderWidth: 1, borderColor: ui.color.border,
    paddingHorizontal: 26, paddingVertical: 35, alignItems: "center", gap: 13,
  },
  iconBox: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: ui.color.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  eyebrow: {
    color: ui.color.primary, fontSize: 11,
    fontWeight: "700", letterSpacing: 0.8, textAlign: "center",
  },
  title: {
    color: ui.color.text, fontSize: 24, lineHeight: 31,
    fontWeight: "700", textAlign: "center",
  },
  body: {
    color: ui.color.secondary, fontSize: 14, lineHeight: 22, textAlign: "center",
  },
  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 14, borderRadius: ui.radius.control,
    backgroundColor: ui.color.primarySoft, width: "100%", marginTop: 5,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: ui.color.text },
  button: {
    width: "100%", minHeight: 50, borderRadius: ui.radius.control,
    backgroundColor: ui.color.primary, justifyContent: "center",
    alignItems: "center", flexDirection: "row", gap: 11,
    paddingHorizontal: 15, marginTop: 4,
  },
  buttonText: { color: ui.color.white, fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.85 },
  footnote: {
    fontSize: 12, lineHeight: 18, color: ui.color.secondary,
    textAlign: "center", marginTop: 6,
  },
});
