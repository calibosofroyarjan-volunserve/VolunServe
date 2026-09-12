import React from "react";
import {
    StyleSheet,
    View,
} from "react-native";
import MapView, {
    Marker,
    PROVIDER_GOOGLE,
} from "react-native-maps";

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
  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
      >
        <Marker
          coordinate={{
            latitude,
            longitude,
          }}
          title={title}
          description="Location submitted by the resident"
          pinColor="#DC2626"
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 230,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE5EC",
    backgroundColor: "#E2E8F0",
  },

  map: {
    width: "100%",
    height: "100%",
  },
});