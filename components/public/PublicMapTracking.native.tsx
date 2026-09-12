import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { db } from "../../lib/firebase";

type Point = {
  latitude: number;
  longitude: number;
};

type EvacuationCenter = Point & {
  id: string;
  name: string;
  address: string;
  capacity: number;
  occupied: number;
};

const SJDM_REGION: Region = {
  latitude: 14.8139,
  longitude: 121.0453,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

export default function PublicMapTracking() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  const [userLocation, setUserLocation] = useState<Point | null>(null);
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [loadingLocation, setLoadingLocation] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "evacuation_centers"),
      (snapshot) => {
        const nextCenters = snapshot.docs
          .map((item) => {
            const data = item.data();

            return {
              id: item.id,
              name: String(data.name ?? "Evacuation Center"),
              address: String(data.address ?? "San Jose del Monte"),
              latitude: Number(data.latitude),
              longitude: Number(data.longitude),
              capacity: Number(data.capacity ?? 0),
              occupied: Number(data.occupied ?? 0),
            };
          })
          .filter(
            (center) =>
              Number.isFinite(center.latitude) &&
              Number.isFinite(center.longitude)
          );

        setCenters(nextCenters);
      }
    );

    const loadLocation = async () => {
      try {
        const permission =
          await Location.requestForegroundPermissionsAsync();

        if (permission.status !== "granted") {
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const coordinates = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };

        setUserLocation(coordinates);

        mapRef.current?.animateToRegion(
          {
            ...coordinates,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          },
          700
        );
      } finally {
        setLoadingLocation(false);
      }
    };

    loadLocation();

    return unsubscribe;
  }, []);

  const recenterMap = () => {
    mapRef.current?.animateToRegion(
      userLocation
        ? {
            ...userLocation,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          }
        : SJDM_REGION,
      600
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="#ffffff"
          />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.title}>Public Safety Map</Text>
          <Text style={styles.subtitle}>Guest access</Text>
        </View>

        <View style={styles.backButton} />
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={SJDM_REGION}
        showsCompass
      >
        {userLocation && (
          <Marker
            coordinate={userLocation}
            title="Your Current Location"
            description="Visible only on your device"
            pinColor="#2563eb"
          />
        )}

        {centers.map((center) => (
          <Marker
            key={center.id}
            coordinate={center}
            title={center.name}
            description={
              center.capacity > 0
                ? `${center.occupied}/${center.capacity} occupied`
                : center.address
            }
            pinColor="#0f766e"
          />
        ))}
      </MapView>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Official Evacuation Centers
        </Text>

        <Text style={styles.infoText}>
          {centers.length}{" "}
          {centers.length === 1 ? "center" : "centers"} shown
        </Text>

        <Text style={styles.privacyText}>
          Resident and volunteer live locations are hidden from guests.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.recenterButton}
        onPress={recenterMap}
      >
        {loadingLocation ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Ionicons
            name="locate"
            size={24}
            color="#ffffff"
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e2e8f0",
  },

  header: {
    backgroundColor: "#0f766e",
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  headerText: {
    flex: 1,
    alignItems: "center",
  },

  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },

  subtitle: {
    color: "#ccfbf1",
    fontSize: 12,
    marginTop: 2,
  },

  map: {
    flex: 1,
  },

  infoCard: {
    position: "absolute",
    top: 124,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    padding: 14,
    elevation: 5,
  },

  infoTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
  },

  infoText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },

  privacyText: {
    color: "#475569",
    fontSize: 11,
    marginTop: 5,
  },

  recenterButton: {
    position: "absolute",
    right: 18,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
});