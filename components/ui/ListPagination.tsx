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
  container:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:9,
    marginTop:10,paddingTop:11,borderTopWidth:1,borderColor:"#E8EFEB"},
  caption:{fontSize:10.8,color:"#6D8178",fontWeight:"600"},
  buttons:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"center",gap:5},
  button:{minHeight:42,paddingHorizontal:12,borderWidth:1,borderColor:"#E1EAE5",borderRadius:7,
    backgroundColor:"#F9FCFA",alignItems:"center",justifyContent:"center"},
  text:{fontSize:11,fontWeight:"800",color:"#366C58"},
  pagePill:{minWidth:38,minHeight:42,paddingHorizontal:7,backgroundColor:"#FFFFFF",borderWidth:1,
    borderColor:"#E2EBE5",borderRadius:7,alignItems:"center",justifyContent:"center"},
  pageSelected:{backgroundColor:"#087A62",borderColor:"#087A62"},
  pagePillText:{fontSize:11,fontWeight:"800",color:"#2D5144"},
  pageSelectedText:{color:"#FFFFFF"},
  disabled:{opacity:.38},
});
