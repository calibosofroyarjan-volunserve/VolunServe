import React from "react";
import { View, Text } from "react-native";

/** Native / non-web fallback. Never performs document or biometric processing. */
export default function LocalNationalIdDemoUnavailable() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
      padding: 24, backgroundColor: "#F8FAFC" }}>
      <Text style={{ color: "#334155", fontSize: 14, textAlign: "center" }}>
        This OCR research demo is only available on localhost in a web browser.
        Use the normal authenticated identity workflow on mobile.
      </Text>
    </View>
  );
}
