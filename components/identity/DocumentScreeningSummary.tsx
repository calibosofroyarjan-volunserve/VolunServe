import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DocumentScreening, documentScreeningLabel } from "../../lib/identityVerification";

const NAMES: Record<string, string> = {
  national_id: "Philippine National ID",
  drivers_license: "Driver's License",
  passport: "Philippine Passport",
  umid: "Unified Multi-Purpose ID (UMID)",
  prc_id: "PRC Professional ID",
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
  const unsupported = screening.status === "unsupported";
  const blurryNationalId = screening.status === "inconclusive" &&
    screening.declaredIdType === "national_id" &&
    screening.detectedIdType === null &&
    screening.imageQualityStatus === "low" &&
    screening.warningCodes.includes("low_document_image_quality");
  const sideProblem = screening.warningCodes?.some((code) =>
    [
      "document_front_back_swapped", "document_front_side_conflict",
      "document_back_looks_like_front", "document_back_evidence_inconclusive",
      "document_back_layout_inconclusive", "low_document_back_image_quality",
      "document_back_image_quality_unavailable",
    ].includes(code),
  );
  const birthConflict = screening.profileBirthDateCheck === "possible_conflict";
  const passportMrzConflict = screening.declaredIdType === "passport" &&
    (screening.passportMrzCheck === "checksum_inconsistent_or_ocr_error" ||
      screening.passportMrzCheck === "multiple_candidates" ||
      screening.passportMrzBirthDateCheck === "possible_conflict");
  const title = passportMrzConflict ? "Passport MRZ needs manual review"
    : sideProblem ? "Retake ID — front/back position may be wrong"
    : birthConflict ? "Birth date needs Admin review"
    : recognized
    ? (screening.detectedIdType === "national_id" ? "National ID text recognized" : "Government ID text recognized")
    : unsupported ? "ID rejected — not supported"
      : mismatch ? "ID rejected — wrong government ID type"
        : blurryNationalId ? "Blurry scan — Admin review / rescan"
          : "ID not accepted — scan inconclusive";
  const icon = recognized && !sideProblem && !passportMrzConflict
    ? "document-text-outline"
    : unsupported || mismatch || sideProblem || passportMrzConflict
      ? "alert-circle-outline" : "help-circle-outline";
  const accent = recognized && !sideProblem && !passportMrzConflict
    ? "#12644E"
    : unsupported || mismatch || sideProblem || passportMrzConflict
      ? "#A13F2B" : "#A46B16";

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
          <Text style={styles.label}>ID back</Text>
          <Text style={styles.value}>
            {screening.declaredIdType === "passport"
              ? "Bio page only"
              : screening.backSideScreened
                ? "Captured and OCR screened"
                : screening.backSideProvided
                  ? "Captured; OCR unavailable"
                  : "Not confirmed"}
          </Text>
        </View>
        {screening.declaredIdType !== "passport" ? (
          <View style={styles.row}>
            <Text style={styles.label}>ID back photo quality</Text>
            <Text style={styles.value}>
              {screening.backImageQualityStatus === "adequate"
                ? "Image sufficiently sharp for OCR (not ID authenticity)"
                : screening.backImageQualityStatus === "low"
                  ? "Too blurry — retake the back"
                  : screening.backImageQualityStatus === "not_checked"
                    ? "Back not provided / not checked"
                    : "Unconfirmed — needs review"}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>Account name vs ID text</Text>
          <Text style={styles.value}>
            {screening.profileNameCheck === "possible_match"
              ? "Name appears in ID text"
              : screening.profileNameCheck === "inconclusive"
                ? "Not confirmed by OCR"
                : "Not checked"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Birthday vs profile</Text>
          <Text style={styles.value}>
            {screening.profileBirthDateCheck === "possible_match" ? "Date appears consistent (OCR only)"
              : screening.profileBirthDateCheck === "possible_conflict" ? "Possible difference — Admin review"
              : screening.profileBirthDateCheck === "not_checked" ? "Not checked (no saved birthday)"
              : "Unclear or absent on scanned ID"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Address vs profile</Text>
          <Text style={styles.value}>
            {screening.profileAddressCheck === "possible_match" ? "Barangay appears consistent (OCR only)"
              : screening.profileAddressCheck === "not_checked" ? "Not checked (no saved barangay)"
              : "Not readable or not on this ID"}
          </Text>
        </View>
        {screening.declaredIdType === "passport" ? (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>Passport MRZ checksum</Text>
              <Text style={styles.value}>
                {screening.passportMrzCheck === "checksum_consistent_unverified"
                  ? "OCR checksum consistent — passport NOT authenticated"
                  : screening.passportMrzCheck === "checksum_inconsistent_or_ocr_error"
                    ? "Checksum discrepancy or OCR error — review"
                    : screening.passportMrzCheck === "multiple_candidates"
                      ? "Conflicting OCR results — review"
                      : "Not read / not checked"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>MRZ birthday vs profile</Text>
              <Text style={styles.value}>
                {screening.passportMrzBirthDateCheck === "possible_match"
                  ? "Possibly consistent (two-digit year, OCR only)"
                  : screening.passportMrzBirthDateCheck === "possible_conflict"
                    ? "Potential mismatch — Admin review"
                    : "Not independently confirmed"}
              </Text>
            </View>
          </>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>Official issuer check</Text>
          <Text style={styles.value}>Not verified — PSA/issuer check required</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Anti-spoofing (PAD)</Text>
          <Text style={styles.value}>Not validated — movement is not proof</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Identity decision</Text>
          <Text style={styles.value}>
            {passportMrzConflict ? "Requires Admin review / corrected passport evidence"
              : sideProblem ? "Rejected / retake correct ID side"
              : birthConflict ? "Pending Admin review — birth date differs"
              : recognized ? "Pending LGU validation (independent check required)"
              : blurryNationalId ? "Pending Admin review — no approval" : "Rejected / retry required"}
          </Text>
        </View>
      </View>
      <Text style={styles.disclaimer}>
        Only the five supported ID types may proceed after document screening.
        Birthday, barangay and ID-type comparisons are only OCR clues.
        They do not prove official issuance, residence or liveness.
        Independent issuer checks, qualified anti-spoofing validation and Admin review are still required.
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
