import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleScan = ({ data }: BarcodeScanningResult) => {
    if (scanned) return;

    const certId = data.trim();

    if (!certId) return;

    setScanned(true);

    router.push({
      pathname: "/verify-certificate",
      params: { certId },
    });
  };

  if (!permission) {
    return (
      <View style={styles.messageContainer}>
        <Text>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.messageContainer}>
        <Text style={styles.message}>
          Camera permission is required to scan certificates.
        </Text>

        <Button
          title="Allow Camera"
          onPress={requestPermission}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />

      {scanned && (
        <View style={styles.scanAgainButton}>
          <Button
            title="Scan Again"
            onPress={() => setScanned(false)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  camera: {
    flex: 1,
  },

  messageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  message: {
    marginBottom: 16,
    textAlign: "center",
  },

  scanAgainButton: {
    position: "absolute",
    right: 24,
    bottom: 40,
    left: 24,
  },
});