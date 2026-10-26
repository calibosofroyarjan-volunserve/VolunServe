import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker } from "react-native-maps";

type Point = { latitude: number; longitude: number };
type Props = {
  eventId: string;
  title: string;
  category: string;
  destination: Point;
  origin?: Point | null;
  height?: number;
};
const symbolFor = (category: string) => ({
  "Clean-up Drive": "🧹", "Tree Planting": "🌱", "Feeding Program": "🍲",
  "Pet Welfare": "🐾", "Community Outreach": "🤝",
}[category] || "📍");

export default function CommunityEventRoadMap({ title, category, destination, height = 245 }: Props) {
  const valid = Number.isFinite(destination.latitude) &&
    Number.isFinite(destination.longitude) &&
    Math.abs(destination.latitude) <= 90 &&
    Math.abs(destination.longitude) <= 180;
  if (!valid) return <Text style={styles.warning}>Confirm the exact event venue before navigating.</Text>;
  return (
    <View style={styles.container}>
      <MapView
        style={{ width: "100%", height }}
        mapType="standard"
        key={destination.latitude + "," + destination.longitude}
        initialRegion={{
          latitude: destination.latitude,
          longitude: destination.longitude,
          latitudeDelta: 0.026,
          longitudeDelta: 0.026,
        }}
        showsCompass
        showsUserLocation={false}
        accessibilityLabel={"Event location map for " + title}
      >
        <Marker coordinate={destination} title={title} description="Official event meeting point">
          <View style={styles.pin}>
            <Text style={styles.pinSymbol}>{symbolFor(category)}</Text>
          </View>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{title}</Text>
              <Text style={styles.calloutText}>Event meeting point · Tap Directions below for road navigation</Text>
            </View>
          </Callout>
        </Marker>
      </MapView>
      <View style={styles.noteRow}>
        <Text style={styles.symbol}>{symbolFor(category)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.noteTitle}>Event meeting point</Text>
          <Text style={styles.noteText}>Verified venue coordinates shown; use Google Maps for a road route.</Text>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#DBE6DF", backgroundColor: "#FFFFFF", marginTop: 8 },
  pin: { borderRadius: 14, backgroundColor: "#126A50", borderWidth: 3, borderColor: "#FFFFFF", padding: 7, elevation: 4 },
  pinSymbol: { fontSize: 24 },
  callout: { maxWidth: 215, padding: 8 },
  calloutTitle: { fontSize: 13, fontWeight: "700", color: "#173F31" },
  calloutText: { fontSize: 11, lineHeight: 16, color: "#698174", marginTop: 4 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11 },
  symbol: { fontSize: 22 },
  noteTitle: { fontSize: 12.5, fontWeight: "700", color: "#164A38" },
  noteText: { color: "#6C8175", fontSize: 11, lineHeight: 16, marginTop: 3 },
  warning: { color: "#896B37", fontSize: 12 },
});
