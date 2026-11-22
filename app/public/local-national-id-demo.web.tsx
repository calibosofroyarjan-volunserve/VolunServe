import React from "react";
import { ScrollView, Text, View } from "react-native";
import StagingNationalIdLocalLab from "../../components/identity/StagingNationalIdLocalLab";

/**
 * Localhost-only OCR demo for defense: NO Basic Resident signup needed.
 *
 * This page lives under the existing PUBLIC route, which already supports
 * signed-out access. Never change the root auth guard to accommodate it.
 * Only the local Python OCR companion receives the selected front/back bytes.
 * It cannot write Firebase, process identity approval, or submit Admin review.
 */
function localDevelopmentOnly(): boolean {
  return (
    __DEV__ &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1") &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:")
  );
}

export default function LocalNationalIdDemo() {
  if (!localDevelopmentOnly()) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
        padding: 24, backgroundColor: "#F8FAFC" }}>
        <Text accessibilityRole="alert" style={{ color: "#334155", textAlign: "center" }}>
          This private OCR test is available only during local development on this PC.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F2F6F9" }}
      contentContainerStyle={{ padding: 20, alignItems: "center", paddingBottom: 40 }}>
      <View style={{ width: "100%", maxWidth: 760 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: "#143A5B",
          marginBottom: 8 }}>VolunServe — Local National ID Demo</Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: "#475569",
          marginBottom: 18 }}>
          No signup or login is needed for this private technical demonstration.
          The photos go only to your own computer's OCR companion on 127.0.0.1,
          not to Firebase or Render. This does not create a Resident or submit an
          Admin request. Use the real authenticated Verified Resident flow later.
        </Text>
        <StagingNationalIdLocalLab showAdminReviewLink={false} />
      </View>
    </ScrollView>
  );
}
