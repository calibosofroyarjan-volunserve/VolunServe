import React from "react";
import { View, Text } from "react-native";

/**
 * Only a web browser supports the isolated staging-only, no-upload demo.
 * Never silently open the native camera or treat local face detection as
 * production biometric verification.
 */
export default function IdentityFaceDemoNative() {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F4F8FC" }}>
      <Text style={{ fontSize: 21, fontWeight: "800", color: "#0F2F5A" }}>
        Local Face Detection Demo
      </Text>
      <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: "#475569" }}>
        This private, experimental no-upload preview is available only in the
        isolated staging web build. No real identity approval or biometric
        authentication is available on this screen.
      </Text>
    </View>
  );
}
