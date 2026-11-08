import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tag?: string;
};

/**
 * Shared botanical-inspired header for LGU Admin operational review screens.
 * Pure presentation: does not alter authentication, verification or approvals.
 */
export default function AdminReviewHero({ eyebrow, title, subtitle, icon, tag }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 760;

  return (
    <View style={[styles.hero, compact && styles.heroCompact]} accessibilityLabel={title + " page header"}>
      <View pointerEvents="none" style={styles.orbLarge} />
      <View pointerEvents="none" style={styles.orbSmall} />
      <View pointerEvents="none" style={styles.orbAccent} />
      <View pointerEvents="none" style={styles.decorativeStem}>
        <Ionicons name="leaf-outline" size={compact ? 76 : 110} color="rgba(218,255,233,0.16)" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.brandIdentity}>VOLUNSERVE  /  LGU OPERATIONS</Text>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowMark} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {!compact && (
        <View style={styles.side}>
          <View style={styles.iconCircle}><Ionicons name={icon} size={24} color="#0A624A" /></View>
          {!!tag && <Text style={styles.tag}>{tag}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%", minHeight: 138, borderRadius: 16, overflow: "hidden",
    backgroundColor: "#103D30", borderWidth: 1, borderColor: "#286B52",
    paddingHorizontal: 24, paddingVertical: 20, marginBottom: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  heroCompact: { paddingHorizontal: 17, paddingVertical: 17, minHeight: 120 },
  orbLarge: {
    position: "absolute", width: 350, height: 350, borderRadius: 175,
    backgroundColor: "rgba(114,207,160,0.12)", right: -130, top: -135,
    borderWidth: 1, borderColor: "rgba(206,245,224,0.12)",
  },
  orbSmall: {
    position: "absolute", width: 220, height: 220, borderRadius: 110,
    backgroundColor: "rgba(133,216,171,0.10)", right: 95, top: -135,
  },
  orbAccent: {
    position: "absolute", width: 220, height: 220, borderRadius: 110,
    backgroundColor: "rgba(195,237,214,0.06)", left: -128, bottom: -161,
  },
  decorativeStem: {
    position: "absolute", right: 72, bottom: -24, transform: [{ rotate: "-24deg" }],
  },
  copy: { flex: 1, minWidth: 0, zIndex: 1 },
  brandIdentity: {
    color: "#A8E7C8", fontSize: 10, lineHeight: 15,
    fontWeight: "800", letterSpacing: 1.3, marginBottom: 6,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 },
  eyebrowMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#B5E6C2" },
  eyebrow: { color: "#D4F0DF", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: "#FFFFFF", fontSize: 27, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  titleCompact: { fontSize: 22, lineHeight: 29 },
  subtitle: { color: "#D4EDE2", fontSize: 12.5, lineHeight: 18, marginTop: 5, maxWidth: 670 },
  side: {
    alignItems: "center", justifyContent: "center", marginLeft: 16, zIndex: 1, gap: 7,
  },
  iconCircle: {
    width: 54, height: 54, borderRadius: 15, alignItems: "center", justifyContent: "center",
    backgroundColor: "#E5F5ED", borderWidth: 1, borderColor: "#D9F1E0",
  },
  tag: { color: "#C7F2DD", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
});
