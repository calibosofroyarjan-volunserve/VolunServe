import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { volunserveUi as ui } from "../../constants/volunserveUi";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tag?: string;
};

/**
 * Shared, low-noise page heading for Admin review modules.
 * Presentation only: authorization and review actions stay untouched.
 */
export default function AdminReviewHero({ eyebrow, title, subtitle, icon, tag }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 760;

  return (
    <View style={[styles.hero, compact && styles.heroCompact]} accessibilityLabel={title + " page header"}>
      <View style={styles.iconTile}>
        <Ionicons name={icon} size={22} color={ui.color.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {compact && !!tag && <Text style={styles.tagCompact}>{tag}</Text>}
      </View>
      {!compact && !!tag && <Text style={styles.tag}>{tag}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    minHeight: 112,
    backgroundColor: ui.color.surface,
    borderWidth: 1,
    borderColor: ui.color.border,
    borderRadius: ui.radius.card,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  heroCompact: { paddingHorizontal: 15, paddingVertical: 15, gap: 11 },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: ui.radius.control,
    backgroundColor: ui.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: ui.color.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.45,
    marginBottom: 4,
  },
  title: {
    color: ui.color.text,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "700",
  },
  titleCompact: { fontSize: 20, lineHeight: 26 },
  subtitle: {
    color: ui.color.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    maxWidth: 680,
  },
  tag: {
    color: ui.color.primary,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: ui.radius.small,
    backgroundColor: ui.color.primarySoft,
    overflow: "hidden",
    maxWidth: 160,
  },
  tagCompact: { color: ui.color.primary, fontSize: 11, marginTop: 8, fontWeight: "700" },
});
