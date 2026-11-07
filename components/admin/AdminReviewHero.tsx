import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { liveUi as ui } from "../../constants/volunserveLiveUi";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tag?: string;
};

/**
 * VolunServe Admin's shared page header. Presentation-only:
 * existing route permissions, Firebase writes and review buttons are untouched.
 */
export default function AdminReviewHero({ eyebrow, title, subtitle, icon, tag }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  return (
    <View style={[styles.header, compact && styles.compact]} accessibilityLabel={title + " page header"}>
      <View style={styles.iconTile}>
        <Ionicons name={icon} size={22} color={ui.color.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {compact && !!tag && <Text style={styles.compactTag}>{tag}</Text>}
      </View>
      {!compact && !!tag && <Text style={styles.tag}>{tag}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%", minHeight: 110, borderWidth: 1,
    borderColor: ui.color.border, borderRadius: ui.radius.card,
    backgroundColor: ui.color.surface, paddingHorizontal: 20,
    paddingVertical: 18, flexDirection: "row", alignItems: "flex-start",
    gap: 14, marginBottom: 14,
  },
  compact: { paddingHorizontal: 15, paddingVertical: 15, gap: 11 },
  iconTile: {
    width: 42, height: 42, borderRadius: ui.radius.control,
    backgroundColor: ui.color.primarySoft, alignItems: "center", justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: ui.color.primary, fontSize: 11, lineHeight: 16, fontWeight: "700", marginBottom: 4 },
  title: {
    color: ui.color.text, fontSize: ui.type.page.fontSize,
    lineHeight: ui.type.page.lineHeight, fontWeight: "700",
  },
  compactTitle: { fontSize: 21, lineHeight: 28 },
  subtitle: { color: ui.color.secondary, fontSize: 13, lineHeight: 20, marginTop: 5, maxWidth: 680 },
  tag: {
    color: ui.color.primary, backgroundColor: ui.color.primarySoft,
    borderRadius: ui.radius.control, overflow: "hidden",
    fontSize: 11, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 7,
  },
  compactTag: { color: ui.color.primary, fontSize: 11, fontWeight: "700", marginTop: 8 },
});
