import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { mapsDirectionsUrl } from "../lib/emergencyMapTypes";
import {
  centerUpdatedLabel,
  reportedSpaceText,
  useVerifiedEvacuationCenters,
} from "../lib/useVerifiedEvacuationCenters";

export default function VerifiedEvacuationCenters() {
  const { centers, loading, error } = useVerifiedEvacuationCenters();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)} style={styles.header}>
        <Text style={styles.symbol}>🏠</Text>
        <View style={{flex:1}}>
          <Text style={styles.title}>LGU-Verified Evacuation Centers</Text>
          <Text style={styles.subtitle}>{loading ? "Loading LGU shelter records…" :
            error ? "Shelter directory unavailable" :
            String(centers.length) + " verified active centers · view map and directions"}</Text>
        </View>
        <Text style={styles.toggle}>{expanded ? "−" : "+"}</Text>
      </Pressable>
      {expanded && <View style={styles.body}>
        <Text style={styles.explanation}>Only LGU-verified active centers appear here.
          Space counts come from the last LGU update, not live occupancy.
          Verify conditions with the LGU before travelling.</Text>
        {error ? <Text style={styles.error}>{error}</Text> :
          loading ? <Text>Checking verified shelter records…</Text> :
          !centers.length ? <Text style={styles.explanation}>
            No LGU-verified active centers are listed. This does not mean no shelters exist.
          </Text> : <>
            <MapView style={styles.map}
              initialRegion={{latitude:14.8139,longitude:121.0453,
                latitudeDelta:0.20,longitudeDelta:0.19}}>
              {centers.map(center => (
                <Marker key={center.id}
                  coordinate={{latitude:center.latitude,longitude:center.longitude}}
                  title={center.name} description="LGU-verified active evacuation center">
                  <View style={styles.marker}><Text style={{fontSize:21}}>🏠</Text></View>
                </Marker>
              ))}
            </MapView>
            {centers.map(center => {
              const url = mapsDirectionsUrl(center.latitude,center.longitude);
              return <View key={center.id} style={styles.card}>
                <Text style={styles.centerName}>{center.name}</Text>
                <Text style={styles.address}>{center.address || center.barangay}</Text>
                <Text style={styles.detail}>{reportedSpaceText(center)}</Text>
                <Text style={styles.updated}>{centerUpdatedLabel(center)}</Text>
                {url && <Pressable accessibilityRole="link" style={styles.directions}
                  onPress={() => void Linking.openURL(url)}>
                  <Text style={styles.directionsText}>Directions in Google Maps ↗</Text>
                </Pressable>}
              </View>;
            })}
          </>}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {marginVertical:14,borderRadius:15,borderWidth:1,borderColor:"#CFE2D7",
    backgroundColor:"#F8FBF9",overflow:"hidden"},
  header: {padding:14,flexDirection:"row",alignItems:"center",gap:10},
  symbol: {fontSize:24,backgroundColor:"#DDF2E8",overflow:"hidden",
    padding:9,borderRadius:10},
  title: {fontWeight:"800",fontSize:14,color:"#124935"},
  subtitle: {fontSize:11,color:"#5B7669",marginTop:4},
  toggle: {fontSize:23,color:"#277557"},
  body: {padding:13,borderTopWidth:1,borderColor:"#DDE9E1",gap:10},
  explanation: {fontSize:11.5,lineHeight:18,color:"#60766D"},
  error: {fontSize:12,color:"#AA4A38"},
  map: {width:"100%",height:230,borderRadius:10},
  marker: {width:42,height:42,borderRadius:24,borderWidth:2,borderColor:"#138262",
    backgroundColor:"white",alignItems:"center",justifyContent:"center"},
  card: {padding:12,borderRadius:11,borderWidth:1,borderColor:"#DDEAE0",
    backgroundColor:"white",gap:5},
  centerName: {fontSize:13.5,fontWeight:"800",color:"#174F3B"},
  address: {fontSize:11.5,color:"#527365"},
  detail: {fontSize:11,color:"#607D6F"},
  updated: {fontSize:10.5,color:"#809387"},
  directions: {alignSelf:"flex-start",paddingHorizontal:12,paddingVertical:10,
    backgroundColor:"#107958",borderRadius:8,marginTop:3},
  directionsText: {color:"#FFFFFF",fontSize:11.5,fontWeight:"700"},
});
