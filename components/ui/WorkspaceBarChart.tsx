import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

/** Neutral data-first chart shared by the two administrative dashboards. */
export type WorkspaceBarDatum = {
  key: string;
  label: string;
  value: number | null;
  color?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  bars: WorkspaceBarDatum[];
  footer?: string;
};

const number = (value: number) => value.toLocaleString("en-PH");

export default function WorkspaceBarChart({ title, subtitle, bars, footer }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const safeValues = bars.map((item) =>
    item.value === null || !Number.isFinite(item.value)
      ? 0 : Math.max(0, item.value),
  );
  const max = Math.max(1, ...safeValues);
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View accessibilityRole="summary" style={styles.plot}>
        {bars.map((item) => {
          const available = item.value !== null && Number.isFinite(item.value);
          const value = available ? Math.max(0, item.value as number) : 0;
          const percentage = Math.min(100, Math.max(0, (value / max) * 100));
          return (
            <View key={item.key} style={styles.row}>
              <View style={[styles.meta, compact && styles.metaCompact]}>
                <Text style={styles.label} numberOfLines={compact ? 2 : 1}>{item.label}</Text>
                <Text style={styles.value}>{available ? number(value) : "Unavailable"}</Text>
              </View>
              <View style={styles.track} accessibilityLabel={item.label + ": " + (available ? String(value) : "unavailable")}>
                {available && <View style={[styles.bar, {
                  width: `${percentage}%` as `${number}%`,
                  backgroundColor: item.color || "#23765F",
                }]} />}
              </View>
            </View>
          );
        })}
      </View>
      {!!footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: "#E1E8E4", backgroundColor: "#FFFFFF",
  },
  heading: { marginBottom: 19 },
  title: { fontSize: 16, lineHeight: 22, color: "#173D32", fontWeight: "700" },
  subtitle: { fontSize: 12, lineHeight: 18, color: "#6C7F77", marginTop: 5 },
  plot: { gap: 19 },
  row: { gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  metaCompact: { alignItems: "flex-start" },
  label: { color: "#415A50", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  value: { color: "#173D32", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: { height: 11, backgroundColor: "#EDF2EF", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 3 },
  footer: { color: "#6C7F77", fontSize: 12, lineHeight: 18, marginTop: 17 },
});
