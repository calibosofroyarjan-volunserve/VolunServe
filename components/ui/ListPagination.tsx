import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
    <View style={styles.container} accessibilityLabel="Records pagination">
      <View style={styles.summaryRow}>
        <Text style={styles.caption}>Showing {first}–{last} of {total} records · {pageSize} per page</Text>
      </View>
      <View style={styles.controlsRow}>
        {pages === 1 ? (
          <View style={styles.pageStatus}>
            <Text style={styles.pageStatusText}>Page {safePage} of {pages}</Text>
          </View>
        ) : (
          <View style={styles.buttons}>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Previous page" disabled={safePage <= 1}
          style={[styles.button, safePage <= 1 && styles.disabled]}
          onPress={() => onChange(safePage - 1)}>
          <Text style={styles.text}>Previous</Text>
        </TouchableOpacity>
        {visiblePages.map(number => <TouchableOpacity key={number} accessibilityRole="button"
          accessibilityLabel={`Page ${number} of ${pages}`}
          accessibilityHint={`Show records on page ${number}`}
          accessibilityState={{ selected: number === safePage }}
          {...(Platform.OS === "web" && number === safePage ? ({ "aria-current": "page" } as any) : {})}
          onPress={() => onChange(number)}
          style={[styles.pagePill, number === safePage && styles.pageSelected]}>
          <Text style={[styles.pagePillText, number === safePage && styles.pageSelectedText]}>{number}</Text>
        </TouchableOpacity>)}
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Next page" disabled={safePage >= pages}
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
  // Summary and controls use independent rows: side-by-side dashboard cards
  // retain the same table-header baseline regardless of total page count.
  container:{width:"100%",flexDirection:"column",alignItems:"stretch",gap:8,
    marginTop:10,marginBottom:10,paddingTop:11,borderTopWidth:1,borderColor:"#E8EFEB"},
  summaryRow:{width:"100%",minHeight:18,justifyContent:"center"},
  caption:{fontSize:12,lineHeight:18,color:"#557366",fontWeight:"700"},
  controlsRow:{width:"100%",minHeight:44,justifyContent:"center"},
  pageStatus:{width:"100%",minHeight:44,alignItems:"flex-end",justifyContent:"center"},
  pageStatusText:{fontSize:12,lineHeight:18,color:"#557366",fontWeight:"700"},
  buttons:{width:"100%",minHeight:44,flexDirection:"row",flexWrap:"wrap",
    alignItems:"center",justifyContent:"flex-end",gap:6},
  button:{minHeight:44,paddingHorizontal:12,borderWidth:1,borderColor:"#D4E5D9",borderRadius:10,
    backgroundColor:"#F6FBF8",alignItems:"center",justifyContent:"center"},
  text:{fontSize:12,fontWeight:"800",color:"#25654F"},
  pagePill:{minWidth:44,minHeight:44,paddingHorizontal:10,backgroundColor:"#FFFFFF",borderWidth:1,
    borderColor:"#D4E5D9",borderRadius:10,alignItems:"center",justifyContent:"center"},
  pageSelected:{backgroundColor:"#087A62",borderColor:"#087A62"},
  pagePillText:{fontSize:13,fontWeight:"800",color:"#265A47"},
  pageSelectedText:{color:"#FFFFFF"},
  disabled:{opacity:.4},
});
