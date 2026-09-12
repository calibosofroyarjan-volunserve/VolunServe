import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type AssistanceLocationMapProps = {
  latitude: number;
  longitude: number;
  title?: string;
};

export default function AssistanceLocationMap({
  latitude,
  longitude,
  title = "Assistance Location",
}: AssistanceLocationMapProps) {
  const openGoogleMaps = async () => {
    const url =
      `https://www.google.com/maps/search/?api=1&query=` +
      `${latitude},${longitude}`;

    await Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons
          name="location"
          size={34}
          color="#FFFFFF"
        />
      </View>

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.subtitle}>
        GPS location submitted by the resident
      </Text>

      <Text style={styles.coordinates}>
        {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </Text>

      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.85}
        onPress={openGoogleMaps}
      >
        <Ionicons
          name="map-outline"
          size={18}
          color="#FFFFFF"
        />

        <Text style={styles.buttonText}>
          Open in Google Maps
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    minHeight: 230,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE5EC",
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  iconContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  title: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 5,
  },

  coordinates: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },

  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#078F82",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});