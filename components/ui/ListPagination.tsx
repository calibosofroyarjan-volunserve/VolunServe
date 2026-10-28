import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/** Five-record list paging, consistent for LGU review queues on web/mobile. */
export default function ListPagination({
  page, total, onChange, pageSize = 5,
}: { page: number; total: number; pageSize?: number; onChange: (page: number) => void; }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, pages));
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = Math.min(safePage * pageSize, total);
  const firstButton = Math.max(1, Math.min(safePage - 2, pages - 4));
  const visiblePages = Array.from({ length: Math.min(pages, 5) }, (_, index) => firstButton + index);
  return (
    <View style={styles.container}>
      <Text style={styles.caption}>Showing {first}–{last} of {total} records · {pageSize} per page</Text>
      <View style={styles.buttons}>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Previous page" disabled={safePage <= 1}
          style={[styles.button, safePage <= 1 && styles.disabled]}
          onPress={() => onChange(safePage - 1)}>
          <Text style={styles.text}>Previous</Text>
        </TouchableOpacity>
        {visiblePages.map(number => <TouchableOpacity key={number} accessibilityRole="button"
          accessibilityLabel={`Page ${number} of ${pages}`}
          accessibilityState={{ selected: number === safePage }}
          onPress={() => onChange(number)}
          style={[styles.pagePill, number === safePage && styles.pageSelected]}>
          <Text style={[styles.pagePillText, number === safePage && styles.pageSelectedText]}>{number}</Text>
        </TouchableOpacity>)}
        <Text style={styles.caption}>Page {safePage} of {pages}</Text>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Next page" disabled={safePage >= pages}
          style={[styles.button, safePage >= pages && styles.disabled]}
          onPress={() => onChange(safePage + 1)}>
          <Text style={styles.text}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 16, paddingHorizontal: 12, flexShrink: 1, marginTop: 12,
    borderTopWidth: 1, borderTopColor: "#DCE9E2", backgroundColor: "#F3FAF6", borderRadius: 12 },
  buttons: { flexDirection: "row", alignItems: "center", justifyContent: "center",
    flexWrap: "wrap", gap: 12 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: "#E5F4ED", borderColor: "#C5DFD5", borderWidth: 1,
    alignItems: "center", justifyContent: "center" },
  text: { fontSize: 13, fontWeight: "800", color: "#087668" },
  caption: { fontSize: 12, fontWeight: "700", color: "#4D665F" },
  pagePill: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, backgroundColor: "#D8F0E5" },
  pagePillText: { color: "#0B5F4C", fontSize: 13, fontWeight: "900" },
  pageSelected: {backgroundColor:"#087F61"},
  pageSelectedText: {color:"#FFFFFF"},
  disabled: { opacity: 0.4 },
});
