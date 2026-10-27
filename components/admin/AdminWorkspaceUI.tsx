import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from "react-native";

export const ADMIN_UI = {
  forest: "#0B3E32",
  emerald: "#087F62",
  emeraldDark: "#05694F",
  mint: "#D8F7E8",
  paper: "#F5F9F7",
  white: "#FFFFFF",
  ink: "#132B26",
  muted: "#62776E",
  stroke: "#DCE9E2",
  radius: 16,
} as const;

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function AdminPageHeading({
  eyebrow, title, subtitle, actionLabel, actionIcon = "add-outline", onAction,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}) {
  const { width } = useWindowDimensions();
  return (
    <LinearGradient
      colors={["#083F32", "#0B6F55", "#1E906C"]}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={styles.hero}
    >
      <View pointerEvents="none" style={styles.heroMark}>
        <Ionicons name="leaf-outline" size={134} color="rgba(255,255,255,0.10)" />
      </View>
      <View style={[styles.heroInner, width < 770 && styles.heroCompact]}>
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
          <Text style={[styles.title, width < 770 && styles.titleCompact]}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {actionLabel && onAction ? (
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={actionLabel} onPress={onAction}
            style={styles.action}>
            <Ionicons name={actionIcon} size={17} color={ADMIN_UI.emeraldDark} />
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradient>
  );
}

export function AdminSectionHeading({
  title, caption,
}: {title: string; caption?: string}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionMark} />
      <View style={{flex: 1}}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

export function AdminMetricCard({
  label, value, hint, icon = "analytics-outline",
}: {label: string; value: number | string; hint?: string; icon?: IconName}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        <View style={styles.metricIcon}>
          <Ionicons name={icon} size={17} color={ADMIN_UI.emerald} />
        </View>
      </View>
      <Text style={styles.metricValue} accessibilityLabel={label + ": " + value}>
        {value}
      </Text>
      <Text style={styles.metricHint}>{hint || "Current records"}</Text>
    </View>
  );
}

export function AdminEmptyState({
  title, description, actionLabel, onAction, icon = "file-tray-outline",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={ADMIN_UI.emerald} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity accessibilityRole="button" onPress={onAction}
          style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward-outline" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, overflow: "hidden", marginBottom: 22,
    minHeight: 154, justifyContent: "center" },
  heroMark: {position: "absolute", right: -20, top: -28},
  heroInner: {paddingHorizontal: 27, paddingVertical: 26, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", gap: 18},
  heroCompact: {flexDirection: "column", alignItems: "flex-start", padding: 21},
  heroText: {flex: 1, maxWidth: 720},
  eyebrow: {color: "#A7F3D0", fontSize: 10, fontWeight: "900",
    letterSpacing: 1.8, marginBottom: 9},
  title: {color: "#FFFFFF", fontSize: 32, fontWeight: "800",
    letterSpacing: -0.7, lineHeight: 40},
  titleCompact: {fontSize: 25, lineHeight: 32},
  subtitle: {color: "#D5F5E7", fontSize: 13, lineHeight: 20,
    marginTop: 8, maxWidth: 650},
  action: {minHeight: 43, flexDirection: "row", gap: 7, alignItems: "center",
    justifyContent: "center", backgroundColor: "#FFFFFF", paddingHorizontal: 15,
    borderRadius: 11, alignSelf: "flex-start"},
  actionText: {color: ADMIN_UI.emeraldDark, fontSize: 12, fontWeight: "900"},
  section: {flexDirection: "row", alignItems: "flex-start", gap: 11,
    marginTop: 20, marginBottom: 14},
  sectionMark: {width: 4, height: 29, backgroundColor: ADMIN_UI.emerald,
    borderRadius: 5, marginTop: 1},
  sectionTitle: {color: ADMIN_UI.ink, fontSize: 17, fontWeight: "900"},
  sectionCaption: {color: ADMIN_UI.muted, fontSize: 12, lineHeight: 18, marginTop: 3},
  metricCard: {flexGrow: 1, flexBasis: 200, minWidth: 185, minHeight: 137,
    backgroundColor: ADMIN_UI.white, borderColor: ADMIN_UI.stroke,
    borderWidth: 1, borderRadius: ADMIN_UI.radius, padding: 17,
    justifyContent: "space-between"},
  metricTop: {flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", gap: 8},
  metricLabel: {flex: 1, color: ADMIN_UI.muted, fontSize: 12,
    fontWeight: "800", lineHeight: 18},
  metricIcon: {height: 30, width: 30, borderRadius: 10,
    backgroundColor: "#E7F7ED", alignItems: "center", justifyContent: "center"},
  metricValue: {fontSize: 26, fontWeight: "900", color: ADMIN_UI.ink, marginTop: 9,
    fontVariant: ["tabular-nums"]},
  metricHint: {fontSize: 11, color: ADMIN_UI.muted, lineHeight: 17, marginTop: 5},
  emptyState: {minHeight: 215, borderWidth: 1, borderColor: ADMIN_UI.stroke,
    backgroundColor: ADMIN_UI.white, borderRadius: ADMIN_UI.radius,
    alignItems: "center", justifyContent: "center", padding: 25},
  emptyIcon: {height: 56, width: 56, borderRadius: 17,
    backgroundColor: "#E9F8EF", alignItems: "center", justifyContent: "center",
    marginBottom: 12},
  emptyTitle: {color: ADMIN_UI.ink, fontSize: 16, fontWeight: "900",
    textAlign: "center"},
  emptyDescription: {color: ADMIN_UI.muted, fontSize: 12,
    textAlign: "center", lineHeight: 19, maxWidth: 360, marginTop: 7},
  emptyAction: {marginTop: 17, backgroundColor: ADMIN_UI.emerald,
    borderRadius: 11, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 11, gap: 8},
  emptyActionText: {fontSize: 12, color: "#FFFFFF", fontWeight: "900"},
});
