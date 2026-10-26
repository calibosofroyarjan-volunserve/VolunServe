import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

/** Data-first chart shared by both workspaces. Null remains unavailable, never zero. */
export type WorkspaceBarDatum = {
  key: string;
  label: string;
  shortLabel?: string;
  value: number | null;
  color?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  bars: WorkspaceBarDatum[];
  footer?: string;
  orientation?: "horizontal" | "vertical";
};

const number = (value: number) => value.toLocaleString("en-PH");
const safeCount = (value: number | null) =>
  value !== null && Number.isFinite(value) ? Math.max(0, value) : 0;

const GRAPH_HEIGHT = 186;

export default function WorkspaceBarChart({
  title, subtitle, bars, footer, orientation = "horizontal",
}: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const maximum = Math.max(0, ...bars.map((item) => safeCount(item.value)));
  const horizontalMax = Math.max(1, maximum);

  // Integer tick marks on a shared linear axis; never distort bars for small counts.
  const step = Math.max(1, Math.ceil(maximum / 4));
  const ceiling = step * 4;
  const ticks = [0, 1, 2, 3, 4];

  return (
    <View style={[styles.section, orientation === "vertical" && styles.verticalSection]}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {orientation === "vertical" ? (
        <View accessibilityLabel="Vertical bar chart comparing current workload totals">
          <View style={styles.chartCanvas}>
            {ticks.map((i) => (
              <View key={i} pointerEvents="none" style={[styles.gridRow, { top: 24 + (GRAPH_HEIGHT * i) / 4 }]}>
                <Text style={styles.tickText}>{number(ceiling - i * step)}</Text>
                <View style={styles.gridLine} />
              </View>
            ))}
            <View style={styles.verticalColumns}>
              {bars.map((item) => {
                const available = item.value !== null && Number.isFinite(item.value);
                const value = safeCount(item.value);
                const barHeight = available ? (value / ceiling) * GRAPH_HEIGHT : 0;
                return (
                  <View key={item.key} style={styles.column}
                    accessibilityLabel={item.label + ": " + (available ? number(value) : "unavailable")}>
                    <Text style={[styles.columnValue, { bottom: Math.min(GRAPH_HEIGHT + 6, barHeight + 7) }]}>
                      {available ? number(value) : "—"}
                    </Text>
                    <View style={[styles.verticalBar, {
                      height: barHeight,
                      backgroundColor: item.color || "#23765F",
                      opacity: available ? 1 : 0,
                    }]} />
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.barLabels}>
            <View style={styles.yAxisLabelSpacer} />
            {bars.map((item) => (
              <View key={item.key} style={styles.barLabelItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color || "#23765F" }]} />
                <Text style={styles.barLabelText}>{item.shortLabel || item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View accessibilityLabel="Horizontal bar chart comparing records" style={styles.plot}>
          {bars.map((item) => {
            const available = item.value !== null && Number.isFinite(item.value);
            const value = safeCount(item.value);
            const percentage = Math.min(100, (value / horizontalMax) * 100);
            return (
              <View key={item.key} style={styles.row}>
                <View style={[styles.meta, compact && styles.metaCompact]}>
                  <Text style={styles.label} numberOfLines={compact ? 2 : 1}>{item.label}</Text>
                  <Text style={styles.value}>{available ? number(value) : "Unavailable"}</Text>
                </View>
                <View style={styles.track} accessibilityLabel={item.label + ": " + (available ? number(value) : "unavailable")}>
                  {available && <View style={[styles.bar, {
                    width: `${percentage}%` as `${number}%`,
                    backgroundColor: item.color || "#23765F",
                  }]} />}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {!!footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E1E8E4", backgroundColor: "#FFFFFF" },
  verticalSection: { paddingVertical: 0, borderTopWidth: 0, borderBottomWidth: 0, backgroundColor: "transparent" },
  heading: { marginBottom: 16 },
  title: { fontSize: 17, lineHeight: 23, color: "#173D32", fontWeight: "700", letterSpacing: -0.25 },
  subtitle: { fontSize: 12.5, lineHeight: 19, color: "#728279", marginTop: 5 },
  plot: { gap: 19 },
  row: { gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  metaCompact: { alignItems: "flex-start" },
  label: { color: "#415A50", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  value: { color: "#173D32", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: { height: 11, backgroundColor: "#EDF2EF", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 3 },
  chartCanvas: { height: GRAPH_HEIGHT + 40, width: "100%", position: "relative" },
  gridRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", height: 1 },
  tickText: { width: 33, fontSize: 10, fontWeight: "500", color: "#81948A", textAlign: "right", paddingRight: 7, fontVariant: ["tabular-nums"] },
  gridLine: { flex: 1, height: 1, backgroundColor: "#E6EEE9" },
  verticalColumns: { position: "absolute", top: 24, left: 35, right: 2, height: GRAPH_HEIGHT, flexDirection: "row", alignItems: "flex-end" },
  column: { flex: 1, height: "100%", minWidth: 0, alignItems: "center", justifyContent: "flex-end" },
  verticalBar: { width: "58%", maxWidth: 62, minWidth: 13, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  columnValue: { position: "absolute", color: "#234639", fontWeight: "700", fontSize: 12.5, fontVariant: ["tabular-nums"] },
  barLabels: { flexDirection: "row", paddingTop: 8 },
  yAxisLabelSpacer: { width: 35 },
  barLabelItem: { flex: 1, alignItems: "center", paddingHorizontal: 2, gap: 5 },
  legendDot: { height: 7, width: 7, borderRadius: 2 },
  barLabelText: { fontSize: 11, color: "#476456", fontWeight: "600", lineHeight: 16, textAlign: "center" },
  footer: { color: "#778A7F", fontSize: 11, lineHeight: 17, marginTop: 15 },
});
