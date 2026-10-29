import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DocumentScreening, documentScreeningLabel } from "../../lib/identityVerification";

const NAMES: Record<string, string> = {
  national_id: "Philippine National ID",
  drivers_license: "Driver's License",
  passport: "Passport",
  other_government_id: "Other Government ID",
};

/** Same evidence-safe ID screening summary in Resident and LGU workspaces. */
export default function DocumentScreeningSummary({
  screening,
}: {
  screening?: DocumentScreening | null;
}) {
  if (!screening) return null;
  return (
    <View style={styles.panel} accessibilityLabel="Government ID screening result">
      <Text style={styles.heading}>Government ID screening</Text>
      <Text style={styles.detail}>{documentScreeningLabel(screening)}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Selected ID</Text>
        <Text style={styles.value}>{NAMES[screening.declaredIdType || ""] || "Not specified"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Recognized type</Text>
        <Text style={styles.value}>{NAMES[screening.detectedIdType || ""] || "Inconclusive"}</Text>
      </View>
      <Text style={styles.disclaimer}>
        OCR and face comparison cannot establish official issuance, document authenticity,
        or live-person identity by themselves. Independent LGU verification is required.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { backgroundColor: "#F5FAF7", borderWidth: 1, borderColor: "#CAE1D4",
    borderRadius: 12, padding: 13, marginVertical: 10, gap: 7 },
  heading: { fontWeight: "800", fontSize: 13, color: "#15583F" },
  detail: { fontSize: 12, lineHeight: 18, color: "#3B6551" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { color: "#697D71", fontSize: 11, flexShrink: 0 },
  value: { color: "#1C4C37", fontSize: 11, fontWeight: "700", textAlign: "right", flexShrink: 1 },
  disclaimer: { fontSize: 11, color: "#7C6452", lineHeight: 16 },
});
