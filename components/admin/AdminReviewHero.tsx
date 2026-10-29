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
        <Ionicons name="leaf-outline" size={compact ? 65 : 116} color="rgba(34,122,87,0.14)" />
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
          <View style={styles.iconCircle}><Ionicons name={icon} size={28} color="#07765A" /></View>
          {!!tag && <Text style={styles.tag}>{tag}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%", minHeight: 176, borderRadius: 18, overflow: "hidden",
    backgroundColor: "#E5F5ED", borderWidth: 1, borderColor: "#C6E4D5",
    paddingHorizontal: 28, paddingVertical: 28, marginBottom: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  heroCompact: { paddingHorizontal: 18, paddingVertical: 23, minHeight: 154 },
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
  decorativeStem: { position: "absolute", right: 95, bottom: -14, transform: [{ rotate: "-24deg" }] },
  copy: { flex: 1, minWidth: 0, zIndex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 13 },
  eyebrowMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0A775A" },
  eyebrow: { color: "#0B7459", fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: "#123D32", fontSize: 29, lineHeight: 36, fontWeight: "800", letterSpacing: -0.7 },
  titleCompact: { fontSize: 23, lineHeight: 30 },
  subtitle: { color: "#416C5C", fontSize: 13, lineHeight: 20, marginTop: 8, maxWidth: 660 },
  side: { alignItems: "center", justifyContent: "center", marginLeft: 22, zIndex: 1, gap: 10 },
  iconCircle: {
    width: 70, height: 70, borderRadius: 24, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.80)", borderWidth: 1, borderColor: "#BBDCCA",
  },
  tag: { color: "#0E6C51", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
});
