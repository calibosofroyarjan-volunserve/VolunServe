import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Compact, accessible pagination shared by every LGU record queue.
 * All callers still pass the total *filtered* count and use five-record slices.
 * Paging avoids long continuous record feeds; the screen only scrolls for
 * content that cannot reasonably fit the user's device.
 */
export default function ListPagination({
  page, total, onChange, pageSize = 5,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, pages));
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = Math.min(total, safePage * pageSize);
  const firstButton = Math.max(1, Math.min(safePage - 1, pages - 2));
  const visiblePages = Array.from(
    { length: Math.min(pages, 3) },
    (_, index) => firstButton + index,
  );
  return (
    <View style={styles.container} accessibilityLabel="Records pagination">
      <View style={styles.summaryRow}>
        <Text style={styles.caption}>{total === 0 ? "0 records" : `${first}–${last} of ${total} records`} · {pageSize} per page</Text>
      </View>
      <View style={styles.controlsRow}>
        {pages === 1 ? (
          <Text style={styles.pageStatusText}>Page 1 of 1</Text>
        ) : (
          <View style={styles.buttons}>
            <TouchableOpacity accessibilityRole="button"
              accessibilityLabel="Previous page" disabled={safePage <= 1}
              accessibilityState={{ disabled: safePage <= 1 }}
              style={[styles.button, safePage <= 1 && styles.disabled]}
              onPress={() => onChange(safePage - 1)}>
              <Text style={styles.text}>Prev</Text>
            </TouchableOpacity>
            {visiblePages.map(number => (
              <TouchableOpacity key={number} accessibilityRole="button"
                accessibilityLabel={`Page ${number} of ${pages}`}
                accessibilityState={{ selected: number === safePage }}
                {...(Platform.OS === "web" && number === safePage ? ({ "aria-current": "page" } as any) : {})}
                style={[styles.pagePill, number === safePage && styles.pageSelected]}
                onPress={() => onChange(number)}>
                <Text style={[styles.pagePillText, number === safePage && styles.pageSelectedText]}>{number}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity accessibilityRole="button"
              accessibilityLabel="Next page" disabled={safePage >= pages}
              accessibilityState={{ disabled: safePage >= pages }}
              style={[styles.button, safePage >= pages && styles.disabled]}
              onPress={() => onChange(safePage + 1)}>
              <Text style={styles.text}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center",
    justifyContent: "space-between", gap: 8, minHeight: 38,
    marginTop: 8, marginBottom: 9, paddingTop: 7,
    borderTopWidth: 1, borderTopColor: "#E5EBE7",
  },
  summaryRow: { flex: 1, minWidth: 134, justifyContent: "center" },
  caption: { fontSize: 11, lineHeight: 17, color: "#60756B", fontWeight: "600" },
  controlsRow: { minHeight: 34, alignItems: "flex-end", justifyContent: "center" },
  pageStatusText: { fontSize: 11, color: "#64786C", fontWeight: "600" },
  buttons: { minHeight: 34, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  button: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderColor: "#D8E5DC", borderRadius: 7, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  text: { color: "#205B45", fontSize: 11, fontWeight: "700" },
  pagePill: { minWidth: 34, minHeight: 34, paddingHorizontal: 7, borderWidth: 1, borderColor: "#D8E5DC", borderRadius: 7, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  pageSelected: { backgroundColor: "#176E55", borderColor: "#176E55" },
  pagePillText: { color: "#205B45", fontSize: 11, fontWeight: "700" },
  pageSelectedText: { color: "#FFFFFF" },
  disabled: { opacity: 0.35 },
});
