import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Button, Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { db } from "../../lib/firebase";

type LocationType = {
  latitude: number;
  longitude: number;
};

type EvacuationCenter = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity?: number;
  distance?: number;
};

type Incident = {
  id: string;
  latitude: number;
  longitude: number;
  type?: string;
};

type RoutePoint = {
  latitude: number;
  longitude: number;
};

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function MapTracking() {
  const [location, setLocation] = useState<LocationType | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [evacuationCenters, setEvacuationCenters] = useState<EvacuationCenter[]>(
    []
  );
  const [routeCoords, setRouteCoords] = useState<RoutePoint[]>([]);
  const [loadingLocation, setLoadingLocation] = useState(true);

  useEffect(() => {
    getLocation();

    const unsubscribeIncidents = onSnapshot(
      collection(db, "incidents"),
      (snapshot) => {
        const data: Incident[] = snapshot.docs.map((doc) => {
          const raw = doc.data() as {
            latitude?: number;
            longitude?: number;
            type?: string;
          };

          return {
            id: doc.id,
            latitude: Number(raw.latitude ?? 0),
            longitude: Number(raw.longitude ?? 0),
            type: raw.type ?? "incident",
          };
        });

        setIncidents(data);
      }
    );

    const unsubscribeCenters = onSnapshot(
      collection(db, "evacuation_centers"),
      (snapshot) => {
        const centers: EvacuationCenter[] = snapshot.docs.map((doc) => {
          const raw = doc.data() as {
            name?: string;
            latitude?: number;
            longitude?: number;
            capacity?: number;
          };

          return {
            id: doc.id,
            name: raw.name ?? "Evacuation Center",
            latitude: Number(raw.latitude ?? 0),
            longitude: Number(raw.longitude ?? 0),
            capacity: raw.capacity,
          };
        });

        setEvacuationCenters(centers);
      }
    );

    return () => {
      unsubscribeIncidents();
      unsubscribeCenters();
    };
  }, []);

  async function getLocation() {
    try {
      setLoadingLocation(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        alert("Location permission denied");
        setLoadingLocation(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch (error) {
      console.log("Location error:", error);
      alert("Current location is unavailable. Make sure location services are enabled.");
    } finally {
      setLoadingLocation(false);
    }
  }

  const nearestCenter: EvacuationCenter | null = useMemo(() => {
    if (!location || evacuationCenters.length === 0) return null;

    return evacuationCenters.reduce<EvacuationCenter | null>((closest, center) => {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        center.latitude,
        center.longitude
      );

      if (!closest || distance < (closest.distance ?? Infinity)) {
        return { ...center, distance };
      }

      return closest;
    }, null);
  }, [location, evacuationCenters]);

  useEffect(() => {
    if (location && nearestCenter) {
      fetchRoute(
        location.latitude,
        location.longitude,
        nearestCenter.latitude,
        nearestCenter.longitude
      );
    } else {
      setRouteCoords([]);
    }
  }, [location, nearestCenter]);

  async function fetchRoute(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number
  ) {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=polyline`
      );

      const data = await response.json();

      if (!data?.routes?.length) {
        setRouteCoords([]);
        return;
      }

      const points = polyline.decode(data.routes[0].geometry) as number[][];
      const coords: RoutePoint[] = points.map((point) => ({
        latitude: point[0],
        longitude: point[1],
      }));

      setRouteCoords(coords);
    } catch (error) {
      console.log("Route error:", error);
      setRouteCoords([]);
    }
  }

  async function reportIncident() {
    if (!location) return;

    try {
      await addDoc(collection(db, "incidents"), {
        latitude: location.latitude,
        longitude: location.longitude,
        type: "emergency",
        createdAt: new Date(),
      });
    } catch (error) {
      console.log("Report incident error:", error);
      alert("Failed to report incident.");
    }
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Text>Map available only on mobile</Text>
      </View>
    );
  }

  if (loadingLocation) {
    return (
      <View style={styles.center}>
        <Text>Getting location...</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.center}>
        <Text>Location unavailable</Text>
        <Button title="Try Again" onPress={getLocation} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {nearestCenter && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Nearest Evacuation Center</Text>
          <Text style={styles.infoText}>{nearestCenter.name}</Text>
          <Text style={styles.infoText}>
            Distance: {nearestCenter.distance?.toFixed(2)} km
          </Text>
          {nearestCenter.capacity !== undefined && (
            <Text style={styles.infoText}>
              Capacity: {nearestCenter.capacity}
            </Text>
          )}
        </View>
      )}

      <View style={styles.buttonContainer}>
        <Button title="Report Incident" onPress={reportIncident} />
      </View>

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={false}
      >
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          title="You are here"
          pinColor="blue"
        />

        {evacuationCenters.map((center) => (
          <Marker
            key={center.id}
            coordinate={{
              latitude: center.latitude,
              longitude: center.longitude,
            }}
            title={center.name}
            description={
              center.capacity !== undefined
                ? `Capacity: ${center.capacity}`
                : "Evacuation Center"
            }
            pinColor="green"
          />
        ))}

        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            coordinate={{
              latitude: incident.latitude,
              longitude: incident.longitude,
            }}
            title={incident.type ? `Incident: ${incident.type}` : "Incident"}
            pinColor="red"
          />
        ))}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="blue"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  buttonContainer: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    zIndex: 10,
  },

  infoBox: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    elevation: 5,
    zIndex: 10,
  },

  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },

  infoText: {
    fontSize: 15,
    textAlign: "center",
  },
});