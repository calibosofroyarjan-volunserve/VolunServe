import { BarCodeScanner } from "expo-barcode-scanner";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

export default function ScanScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    BarCodeScanner.requestPermissionsAsync().then(({ status }) => {
      setHasPermission(status === "granted");
    });
  }, []);

  const handleScan = ({ data }: any) => {
    router.push({
      pathname: "/verify-certificate",
      params: { certId: data },
    });
  };

  if (hasPermission === null) return <Text>Requesting permission...</Text>;
  if (hasPermission === false) return <Text>No camera access</Text>;

  return (
    <View style={{ flex: 1 }}>
      <BarCodeScanner
        onBarCodeScanned={handleScan}
        style={{ flex: 1 }}
      />
    </View>
  );
}