import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Choice<T extends string> = { value: T; label: string };

type Props<F extends string, S extends string> = {
  filterValue: F;
  filterOptions: readonly Choice<F>[];
  onFilterChange: (next: F) => void;
  sortValue: S;
  sortOptions: readonly Choice<S>[];
  onSortChange: (next: S) => void;
  accessibilityContext?: string;
};

/** Search stays in each page; this shared read-only UI changes only client-side lists. */
export default function SuperAdminFilterSort<F extends string, S extends string>({
  filterValue, filterOptions, onFilterChange,
  sortValue, sortOptions, onSortChange, accessibilityContext = "records",
}: Props<F, S>) {
  const [open, setOpen] = useState<"filter" | "sort" | null>(null);
  const isFiltered = filterValue !== filterOptions[0]?.value;
  const isSorted = sortValue !== sortOptions[0]?.value;
  const filterName = filterOptions.find(item => item.value === filterValue)?.label || "All";
  const sortName = sortOptions.find(item => item.value === sortValue)?.label || "Newest";

  return (
    <View style={styles.wrap} accessibilityLabel={accessibilityContext + " filter and sort"}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={"Filter " + accessibilityContext}
          accessibilityState={{ expanded: open === "filter" }}
          style={[styles.button, (open === "filter" || isFiltered) && styles.buttonActive]}
          onPress={() => setOpen(current => current === "filter" ? null : "filter")}
        >
          <Ionicons name="funnel-outline" size={17} color="#087A62" />
          <Text style={styles.buttonText}>Filter</Text>
          {isFiltered ? <View style={styles.activeDot} /> : null}
          <Ionicons name={open === "filter" ? "chevron-up" : "chevron-down"} size={14} color="#537369" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={"Sort " + accessibilityContext}
          accessibilityState={{ expanded: open === "sort" }}
          style={[styles.button, (open === "sort" || isSorted) && styles.buttonActive]}
          onPress={() => setOpen(current => current === "sort" ? null : "sort")}
        >
          <Ionicons name="swap-vertical-outline" size={17} color="#087A62" />
          <Text style={styles.buttonText}>Sort</Text>
          <Ionicons name={open === "sort" ? "chevron-up" : "chevron-down"} size={14} color="#537369" />
        </TouchableOpacity>
        <Text style={styles.currentLabel} numberOfLines={1}>
          {isFiltered ? filterName + " · " : ""}{sortName}
        </Text>
      </View>
      {open ? (
        <View style={styles.panel} accessibilityLabel={open === "filter" ? "Filter options" : "Sort options"}>
          <Text style={styles.panelTitle}>{open === "filter" ? "Show records" : "Sort records"}</Text>
          <View style={styles.choices}>
            {(open === "filter" ? filterOptions : sortOptions).map(option => {
              const selected = open === "filter"
                ? option.value === filterValue
                : option.value === sortValue;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  style={[styles.choice, selected && styles.choiceActive]}
                  onPress={() => {
                    if (open === "filter") onFilterChange(option.value as F);
                    else onSortChange(option.value as S);
                    setOpen(null);
                  }}
                >
                  {selected ? <Ionicons name="checkmark" size={14} color="#087A62" /> : null}
                  <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 },
  button: {
    minHeight: 40, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1,
    borderColor: "#D6E7DE", backgroundColor: "#FFFFFF",
    alignItems: "center", flexDirection: "row", gap: 7,
  },
  buttonActive: { borderColor: "#9BCFBA", backgroundColor: "#EAF8F1" },
  buttonText: { fontSize: 12, fontWeight: "800", color: "#1E5143" },
  activeDot: { width: 6, height: 6, backgroundColor: "#0E9272", borderRadius: 3 },
  currentLabel: { fontSize: 11, color: "#6A8378", flexShrink: 1 },
  panel: {
    marginTop: 9, padding: 13, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#DDEAE4", borderRadius: 12,
  },
  panelTitle: { fontSize: 11, fontWeight: "800", color: "#42695C", marginBottom: 10 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11,
    minHeight: 35, backgroundColor: "#F8FBF9", borderWidth: 1,
    borderColor: "#E0ECE5", borderRadius: 8,
  },
  choiceActive: { borderColor: "#A8D9C0", backgroundColor: "#E2F6EB" },
  choiceText: { fontSize: 11, fontWeight: "700", color: "#526F63" },
  choiceTextActive: { color: "#086B52", fontWeight: "900" },
});
