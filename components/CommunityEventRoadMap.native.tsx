import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Callout, Marker, Polyline } from "react-native-maps";
import { isSjdmEventPoint, isSjdmEventRoute } from "../lib/communityEventSjdmScope";

type Point = { latitude: number; longitude: number };
type Props = {
  eventId: string;
  title: string;
  category: string;
  destination: Point;
  origin?: Point | null;
  height?: number;
};
type Route = { coordinates: Point[]; distanceMeters: number; durationSeconds: number };
const symbolFor = (category: string) => ({
  "Clean-up Drive": "🧹", "Tree Planting": "🌱", "Feeding Program": "🍲",
  "Pet Welfare": "🐾", "Community Outreach": "🤝",
}[category] || "📍");

export default function CommunityEventRoadMap({
  eventId, title, category, destination, origin = null, height = 245,
}: Props) {
  const [route, setRoute] = useState<Route | null>(null);
  const [status, setStatus] = useState<"place" | "loading" | "ready" | "unavailable">("place");
  const mapRef = useRef<MapView | null>(null);
  const validDestination = isSjdmEventPoint(destination.latitude, destination.longitude);

  useEffect(() => {
    setRoute(null);
    if (!validDestination || !origin || !isSjdmEventPoint(origin.latitude, origin.longitude)) {
      setStatus("place");
      return;
    }
    const controller = new AbortController();
    const fetchRoute = async () => {
      setStatus("loading");
      try {
        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const response = await fetch(
          "https://router.project-osrm.org/route/v1/driving/" + coordinates +
            "?overview=full&geometries=geojson&steps=false&alternatives=false",
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error("Route unavailable");
        const json = await response.json();
        const item = json?.routes?.[0];
        const points = item?.geometry?.coordinates;
        if (!Array.isArray(points) || points.length < 2 || points.length > 20000 ||
            !points.every((p: unknown) => Array.isArray(p) && p.length === 2 &&
              Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
              Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) ||
            !Number.isFinite(item.distance) || !Number.isFinite(item.duration)) {
          throw new Error("Invalid road routing response");
        }
        const road = points.map((point: number[]): Point => ({
          latitude: point[1], longitude: point[0],
        }));
        if (!isSjdmEventRoute(road)) throw new Error("Road route exits SJDM");
        if (controller.signal.aborted) return;
        setRoute({ coordinates: road, distanceMeters: item.distance, durationSeconds: item.duration });
        setStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        setRoute(null);
        setStatus("unavailable");
      }
    };
    void fetchRoute();
    return () => controller.abort();
  }, [eventId, validDestination, destination.latitude, destination.longitude, origin?.latitude, origin?.longitude]);

  useEffect(() => {
    if (!route || route.coordinates.length < 2) return;
    mapRef.current?.fitToCoordinates(route.coordinates, {
      edgePadding: { top: 45, right: 45, bottom: 45, left: 45 },
      animated: true,
    });
  }, [route]);

  if (!validDestination) return <Text style={styles.warning}>Confirm an event meeting-point pin inside SJDM before navigating.</Text>;
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
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
        accessibilityLabel={"SJDM event location map for " + title}
      >
        <Marker coordinate={destination} title={title} description="Official SJDM event meeting point">
          <View style={styles.pin}>
            <Text style={styles.pinSymbol}>{symbolFor(category)}</Text>
          </View>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{title}</Text>
              <Text style={styles.calloutText}>Event meeting point · Tap Show Route for directions here</Text>
            </View>
          </Callout>
        </Marker>
        {origin && isSjdmEventPoint(origin.latitude, origin.longitude) && (
          <Marker coordinate={origin} title="Your location" pinColor="#2563EB" />
        )}
        {!!route && <Polyline coordinates={route.coordinates} strokeColor="#087F75" strokeWidth={5} />}
      </MapView>
      <View style={styles.noteRow}>
        <Text style={styles.symbol}>{symbolFor(category)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.noteTitle}>
            {status === "ready" && route
              ? `${(route.distanceMeters / 1000).toFixed(1)} km · about ${Math.max(1, Math.round(route.durationSeconds / 60))} min`
              : status === "loading" ? "Calculating SJDM road route…"
              : status === "unavailable" ? "In-app road route unavailable" : "SJDM event meeting point"}
          </Text>
          <Text style={styles.noteText}>
            {status === "ready" ? "OSRM road estimate · no live traffic · stays inside VolunServe"
              : status === "unavailable" ? "A route within SJDM could not be found. Retry Show Route."
              : "Tap Show Route to request GPS and draw a road route inside VolunServe."}
          </Text>
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
