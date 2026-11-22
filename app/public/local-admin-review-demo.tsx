import React from "react";
import { View, Text } from "react-native";

/** Native and release builds do not provide any simulated Admin controls. */
export default function LocalAdminReviewDemoUnavailable() {
  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC",
      justifyContent: "center", alignItems: "center", padding: 25 }}>
      <Text style={{ color: "#475569", textAlign: "center" }}>
        The fictional Admin Final Review demo is available only in
        the localhost development web application.
      </Text>
    </View>
  );
}
