import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type PeopleMetric = {
  label: string;
  value: number | string;
  icon: IconName;
  help: string;
};

/**
 * Shared visual system for the LGU's Resident and Volunteer review workspaces.
 * Decorative graphics only: no fabricated values, account data or access changes.
 */
export default function PeopleWorkspaceHero({
  title, description, section, icon, metrics,
}: {
  title: string;
  description: string;
  section: string;
  icon: IconName;
  metrics: PeopleMetric[];
}) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  return (
    <>
      <LinearGradient
        colors={["#EFFBF5", "#E0F5EB", "#F7FDF9"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.hero, compact && styles.heroCompact]}
      >
        <View style={styles.heroCopy}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowRule} />
            <Text style={styles.eyebrow}>VOLUNSERVE / {section.toUpperCase()}</Text>
          </View>
          <View style={styles.heroTitleRow}>
            <View style={styles.iconWrap}>
              <Ionicons name={icon} color="#0A725A" size={25} />
            </View>
            <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{title}</Text>
          </View>
          <Text style={styles.description}>{description}</Text>
        </View>
        <View pointerEvents="none" style={[styles.decor, compact && styles.decorCompact]} accessibilityElementsHidden>
          <View style={styles.decorRingOne} />
          <View style={styles.decorRingTwo} />
          <Ionicons name="leaf-outline" color="rgba(17,123,93,0.23)" size={compact ? 106 : 165} style={styles.decorLeafOne} />
          <Ionicons name="leaf-outline" color="rgba(20,149,107,0.18)" size={compact ? 75 : 116} style={styles.decorLeafTwo} />
        </View>
      </LinearGradient>
      <View style={[styles.metrics, compact && styles.metricsCompact]}>
        {metrics.map((metric, index) => (
          <View key={metric.label} style={[styles.metricCard, compact && styles.metricCardCompact]}>
            <View style={[styles.metricIcon, index === 0 && styles.metricIconFirst]}>
              <Ionicons name={metric.icon} size={21} color="#08745B" />
            </View>
            <View style={styles.metricCopy}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{typeof metric.value === "number" ? metric.value.toLocaleString("en-PH") : metric.value}</Text>
              <Text style={styles.metricHelp}>{metric.help}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 168, width: "100%", marginBottom: 15, borderRadius: 17, borderWidth: 1,
    borderColor: "#D8E9DF", overflow: "hidden", paddingHorizontal: 27, paddingVertical: 24,
    justifyContent: "center", position: "relative", backgroundColor: "#E9F8EF" },
  heroCompact: { paddingHorizontal: 17, paddingVertical: 20, minHeight: 155 },
  heroCopy: { maxWidth: "78%", zIndex: 2 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  eyebrowRule: { width: 22, height: 3, borderRadius: 2, backgroundColor: "#0A8A6A" },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.25, color: "#176B54" },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  iconWrap: { width: 45, height: 45, borderRadius: 13, backgroundColor: "#D3F0E3",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#C6E7D6" },
  heroTitle: { flexShrink: 1, fontSize: 28, fontWeight: "900", color: "#103D30", letterSpacing: -0.55 },
  heroTitleCompact: { fontSize: 21 },
  description: { marginTop: 10, color: "#527365", fontSize: 12.5, lineHeight: 20, maxWidth: 650 },
  decor: { position: "absolute", right: 0, bottom: -12, width: 210, height: 172 },
  decorCompact: { width: 112, height: 135, right: -23 },
  decorRingOne: { position: "absolute", borderWidth: 1, borderColor: "rgba(27,126,90,0.13)",
    borderRadius: 150, height: 230, width: 230, right: -38, top: -44 },
  decorRingTwo: { position: "absolute", borderWidth: 1, borderColor: "rgba(27,126,90,0.13)",
    borderRadius: 150, height: 160, width: 160, right: 11, top: -9 },
  decorLeafOne: { position: "absolute", right: -3, bottom: -12, transform: [{ rotate: "-28deg" }] },
  decorLeafTwo: { position: "absolute", right: 71, bottom: -18, transform: [{ rotate: "24deg" }] },
  metrics: { width: "100%", flexDirection: "row", gap: 11, flexWrap: "wrap", marginBottom: 19 },
  metricsCompact: { gap: 9 },
  metricCard: { flexGrow: 1, flexBasis: 175, minHeight: 109, borderWidth: 1, borderColor: "#E1EAE5",
    backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  metricCardCompact: { flexBasis: 145, padding: 11, minHeight: 102 },
  metricIcon: { width: 37, height: 37, borderRadius: 11, backgroundColor: "#E2F5EB",
    alignItems: "center", justifyContent: "center" },
  metricIconFirst: { backgroundColor: "#D8F5E7" },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { color: "#405E50", fontSize: 10.5, fontWeight: "800" },
  metricValue: { marginTop: 3, color: "#123E31", fontSize: 23, fontWeight: "900" },
  metricHelp: { marginTop: 1, color: "#779085", fontSize: 9.5, lineHeight: 14 },
});
