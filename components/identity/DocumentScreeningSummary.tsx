import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DocumentScreening, documentScreeningLabel } from "../../lib/identityVerification";

const NAMES: Record<string, string> = {
  national_id: "Philippine National ID",
  drivers_license: "Driver's License",
  passport: "Philippine Passport",
  other_government_id: "Other Government ID",
};

/** Shared, privacy-safe document-type assessment for Residents and LGU. */
export default function DocumentScreeningSummary({
  screening,
}: {
  screening?: DocumentScreening | null;
}) {
  if (!screening) return null;

  const recognized = screening.status === "text_consistent_unverified";
  const mismatch = screening.status === "mismatch";
  const title = recognized
    ? (screening.detectedIdType === "national_id" ? "National ID text recognized" : "Government ID text recognized")
    : mismatch ? "Selected ID type does not match" : "Document recognition inconclusive";
  const icon = recognized ? "document-text-outline" : mismatch ? "alert-circle-outline" : "help-circle-outline";
  const accent = recognized ? "#12644E" : mismatch ? "#A13F2B" : "#A46B16";

  return (
    <View style={styles.panel} accessibilityLabel="Government ID document screening result">
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={19} color={accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>AUTOMATED DOCUMENT SCREENING</Text>
          <Text style={[styles.heading, { color: accent }]}>{title}</Text>
        </View>
      </View>
      <Text style={styles.detail}>{documentScreeningLabel(screening)}</Text>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.label}>Submitted as</Text>
          <Text style={styles.value}>{NAMES[screening.declaredIdType || ""] || "Not specified"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Text suggests</Text>
          <Text style={styles.value}>{NAMES[screening.detectedIdType || ""] || "Not recognized"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Identity decision</Text>
          <Text style={styles.value}>Pending LGU validation</Text>
        </View>
      </View>
      <Text style={styles.disclaimer}>
        Recognition checks document text only; it cannot prove authenticity,
        official issuance or liveness. Independent LGU verification is required.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#F7FBF9",
    borderColor: "#D4E6DB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginVertical: 10,
    gap: 11,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    backgroundColor: "#E6F2EA", borderRadius: 12,
    padding: 10, alignItems: "center", justifyContent: "center",
  },
  headerText: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "#677D70" },
  heading: { fontSize: 15, fontWeight: "800", lineHeight: 20 },
  detail: { fontSize: 12, lineHeight: 18, color: "#52685D" },
  rows: {
    gap: 9, backgroundColor: "#FFFFFF", borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: "#E4EDE7",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 14 },
  label: { fontSize: 11, color: "#64786C", flexShrink: 0 },
  value: { fontSize: 11, color: "#1D4B37", fontWeight: "700", textAlign: "right", flex: 1 },
  disclaimer: { fontSize: 11, color: "#805F3A", lineHeight: 17 },
});
