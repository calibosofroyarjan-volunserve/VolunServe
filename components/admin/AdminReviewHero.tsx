import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tag?: string;
  variant?: "emerald" | "mint";
};

/**
 * Shared botanical-inspired header for LGU Admin operational review screens.
 * Pure presentation: does not alter authentication, verification or approvals.
 */
export default function AdminReviewHero({ eyebrow, title, subtitle, icon, tag, variant = "emerald" }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const mint = variant === "mint";

  return (
    <View style={[styles.hero, mint && styles.heroMint, compact && styles.heroCompact]} accessibilityLabel={title + " page header"}>
      <View pointerEvents="none" style={[styles.orbLarge, mint && styles.orbMintLarge]} />
      <View pointerEvents="none" style={[styles.orbSmall, mint && styles.orbMintSmall]} />
      <View pointerEvents="none" style={[styles.orbAccent, mint && styles.orbMintAccent]} />
      <View pointerEvents="none" style={styles.decorativeStem}>
        <Ionicons name="leaf-outline" size={compact ? 76 : 110} color={mint ? "rgba(15,112,79,0.09)" : "rgba(218,255,233,0.16)"} />
      </View>
      <View style={styles.copy}>
        {!mint ? <Text style={styles.brandIdentity}>VOLUNSERVE  /  LGU OPERATIONS</Text> : null}
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowMark, mint && styles.mintMark]} />
          <Text style={[styles.eyebrow, mint && styles.mintEyebrow]}>{eyebrow}</Text>
        </View>
        <Text style={[styles.title, mint && styles.mintTitle, compact && styles.titleCompact]}>{title}</Text>
        <Text style={[styles.subtitle, mint && styles.mintSubtitle]}>{subtitle}</Text>
      </View>
      {!compact && (
        <View style={styles.side}>
          <View style={[styles.iconCircle, mint && styles.mintIconCircle]}><Ionicons name={icon} size={24} color="#0A624A" /></View>
          {!!tag && <Text style={[styles.tag, mint && styles.mintTag]}>{tag}</Text>}
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
  heroMint: { backgroundColor: "#E4F4EC", borderColor: "#C4E8D8", minHeight: 119, paddingVertical: 17 },
  orbMintLarge: { backgroundColor: "rgba(45,177,128,0.10)", borderColor: "rgba(7,113,81,0.04)" },
  orbMintSmall: { backgroundColor: "rgba(45,177,128,0.07)" },
  orbMintAccent: { backgroundColor: "rgba(71,199,148,0.08)" },
  mintBrand: { color: "#087052" },
  mintEyebrow: { color: "#087052" },
  mintMark: { backgroundColor: "#0B9065" },
  mintTitle: { color: "#143D31" },
  mintSubtitle: { color: "#527568" },
  mintIconCircle: { borderColor: "#B8E3D0", backgroundColor: "#F4FFFA" },
  mintTag: { color: "#0C6349" },
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
    color: "#A8E7C8", fontSize: vsType.size.micro, fontFamily: vsType.family, lineHeight: 15,
    fontWeight: "800", letterSpacing: 1.3, marginBottom: 6,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 },
  eyebrowMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#B5E6C2" },
  eyebrow: { color: "#D4F0DF", fontSize: vsType.size.micro, fontFamily: vsType.family, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: "#FFFFFF", fontSize: vsType.size.page, fontFamily: vsType.family, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  titleCompact: { fontSize: vsType.size.titleSmall, fontFamily: vsType.family, lineHeight: 29 },
  subtitle: { color: "#D4EDE2", fontSize: vsType.size.label, fontFamily: vsType.family, lineHeight: 18, marginTop: 5, maxWidth: 670 },
  side: {
    alignItems: "center", justifyContent: "center", marginLeft: 16, zIndex: 1, gap: 7,
  },
  iconCircle: {
    width: 54, height: 54, borderRadius: 15, alignItems: "center", justifyContent: "center",
    backgroundColor: "#E5F5ED", borderWidth: 1, borderColor: "#D9F1E0",
  },
  tag: { color: "#C7F2DD", fontWeight: "800", fontSize: vsType.size.micro, fontFamily: vsType.family, letterSpacing: 0.5 },
});
