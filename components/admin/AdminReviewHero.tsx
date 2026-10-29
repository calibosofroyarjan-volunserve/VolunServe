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
        <Ionicons name="leaf-outline" size={compact ? 48 : 72} color="rgba(34,122,87,0.08)" />
      </View>
      <View style={styles.copy}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowMark} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {!compact && (
        <View style={styles.side}>
          <View style={styles.iconCircle}><Ionicons name={icon} size={22} color="#07765A" /></View>
          {!!tag && <Text style={styles.tag}>{tag}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%", minHeight: 118, borderRadius: 12, overflow: "hidden",
    backgroundColor: "#E5F5ED", borderWidth: 1, borderColor: "#C6E4D5",
    paddingHorizontal: 22, paddingVertical: 17, marginBottom: 13,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  heroCompact: { paddingHorizontal: 16, paddingVertical: 14, minHeight: 105 },
  orbLarge: {
    position: "absolute", width: 350, height: 350, borderRadius: 175,
    backgroundColor: "rgba(79,190,145,0.10)", right: -130, top: -135,
    borderWidth: 1, borderColor: "rgba(48,130,94,0.09)",
  },
  orbSmall: {
    position: "absolute", width: 210, height: 210, borderRadius: 105,
    backgroundColor: "rgba(143,223,184,0.20)", right: 95, top: -130,
  },
  orbAccent: {
    position: "absolute", width: 200, height: 200, borderRadius: 100,
    backgroundColor: "rgba(195,237,214,0.20)", left: -120, bottom: -155,
  },
  decorativeStem: { position: "absolute", right: 75, bottom: -14, transform: [{ rotate: "-24deg" }] },
  copy: { flex: 1, minWidth: 0, zIndex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  eyebrowMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0A775A" },
  eyebrow: { color: "#0B7459", fontSize: 10, fontWeight: "800", letterSpacing: 1.0 },
  title: { color: "#123D32", fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.7 },
  titleCompact: { fontSize: 21, lineHeight: 27 },
  subtitle: { color: "#416C5C", fontSize: 12.5, lineHeight: 18, marginTop: 5, maxWidth: 660 },
  side: { alignItems: "center", justifyContent: "center", marginLeft: 14, zIndex: 1, gap: 5 },
  iconCircle: {
    width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.80)", borderWidth: 1, borderColor: "#BBDCCA",
  },
  tag: { color: "#0E6C51", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
});
