import React from "react";
import { Text, View } from "react-native";

/** No camera or identity actions in native or production app routes. */
export default function LocalFaceCaptureNativeFallback() {
  return <View style={{ flex: 1, padding: 24, backgroundColor: "#F8FAFC",
    alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: "#334155", textAlign: "center" }}>
      The automatic camera-framing demonstration is available only in the
      localhost web development environment. It cannot verify an identity.
    </Text>
  </View>;
}
