import React from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import CommunityOnline from "../../components/home/CommunityOnline";
import { useUserSession } from "../../lib/useUserSession";

// Full public member directory; dashboard only shows five rows.
// Public profiles and consent are enforced by the existing backend.
export default function CommunityMembersScreen() {
  const { user }=useUserSession();
  const { width }=useWindowDimensions();
  return <ScrollView style={styles.screen}
    contentContainerStyle={[styles.page,width<760&&styles.mobile]}>
    <View style={styles.shell}>
      <CommunityOnline uid={user?.uid} dashboard={false}/>
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F2F8F5"},
  page:{paddingHorizontal:20,paddingVertical:22,alignItems:"center"},
  mobile:{paddingHorizontal:9,paddingVertical:11},
  shell:{width:"100%",maxWidth:1220},
});
