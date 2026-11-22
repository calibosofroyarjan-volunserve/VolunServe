import React, { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { adminReviewStatusBucket } from "../../lib/identityAdminReviewGate";

/**
 * Localhost-only synthetic demonstration of Admin review decisions.
 * It cannot access Admin endpoints, Firebase, real accounts, real OCR,
 * or persist approvals. No actual government verification is performed.
 */
type Decision = "pending" | "verified" | "rejected" | "retry_required";
type Action = "verify" | "reject" | "require_retry";
const NATIONAL_METHOD = "psa_national_id_qr_check";
const navy = "#143A5B";
const base = { color: "#475569", fontSize: 13, lineHeight: 20 } as const;
function localOnly(): boolean {
  return __DEV__ && typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
}
const actionStyle = (backgroundColor: string, disabled = false) => ({
  backgroundColor: disabled ? "#94A3B8" : backgroundColor,
  padding: 12, borderRadius: 8, alignItems: "center" as const, flexGrow: 1,
});
function eligibleForSyntheticApproval(
  method: string, inspected: boolean, personChecked: boolean,
  attested: boolean, notes: string,
): boolean {
  return method === NATIONAL_METHOD && inspected && personChecked &&
    attested && notes.trim().length >= 25;
}

export default function LocalAdminReviewDemo() {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>("pending");
  const [method, setMethod] = useState("");
  const [inspected, setInspected] = useState(false);
  const [personChecked, setPersonChecked] = useState(false);
  const [attested, setAttested] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [audit, setAudit] = useState("");
  if (!localOnly()) return (
    <View style={{ backgroundColor: "#F8FAFC", padding: 28, flex: 1 }}>
      <Text>This private Admin simulation is only available on localhost development.</Text>
    </View>
  );
  const pending = decision === "pending";
  const approvalReady = eligibleForSyntheticApproval(
    method, inspected, personChecked, attested, notes);
  const bucket = adminReviewStatusBucket({
    status: pending ? "pending" : decision === "verified" ? "verified" : "failed",
    identityStatus: pending ? "pending" : decision === "verified" ? "verified" : "failed",
    identityVerified: decision === "verified",
    manualReviewDecision: pending ? "" : decision,
    requiresManualReview: pending,
    targetEligible: true,
  });
  const reset = () => {
    setDecision("pending");
    setMethod("");
    setInspected(false);
    setPersonChecked(false);
    setAttested(false);
    setNotes("");
    setConfirmation(null);
    setAudit("");
    setMessage("Reset completed locally. No Resident account was changed.");
  };
  const startDecision = (action: Action) => {
    if (!pending) return;
    if (action === "verify" && !approvalReady) {
      setMessage("Approval blocked: PSA method, original ID inspection, in-person face comparison, independent review attestation and 25+ characters of notes are required.");
      return;
    }
    if (action !== "verify" && notes.trim().length < 5) {
      setMessage("Enter at least 5 characters explaining rejection or resubmission.");
      return;
    }
    setConfirmation(action);
    setMessage("Confirming here only changes a fictional case in this browser.");
  };
  const confirm = () => {
    if (!confirmation || !pending) return;
    if (confirmation === "verify" && !approvalReady) {
      setMessage("Approval denied: evidence changed.");
      setConfirmation(null);
      return;
    }
    if (confirmation !== "verify" && notes.trim().length < 5) {
      setMessage("Reason too short.");
      setConfirmation(null);
      return;
    }
    const next: Decision = confirmation === "verify" ? "verified" :
      confirmation === "reject" ? "rejected" : "retry_required";
    setDecision(next);
    setConfirmation(null);
    setMessage("Synthetic case finalized. Reset to try another decision.");
    setAudit("LOCAL SIMULATION: " + next + ". No authentication, database write or real Admin approval.");
  };
  const check = (text: string, value: boolean, setter: (x: boolean) => void) => (
    <TouchableOpacity accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => { if (pending) { setter(!value); setConfirmation(null); } }}
      style={{ flexDirection: "row", paddingVertical: 6, gap: 9 }}>
      <Text style={{ color: "#0F766E", fontSize: 18 }}>{value ? "☑" : "☐"}</Text>
      <Text style={{ ...base, flex: 1 }}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ backgroundColor: "#F2F6FA" }}
      contentContainerStyle={{ padding: 20, alignItems: "center", paddingBottom: 50 }}>
      <View style={{ width: "100%", maxWidth: 770 }}>
        <Text style={{ color: navy, fontSize: 25, fontWeight: "800" }}>
          VolunServe — Admin Final Review Demo
        </Text>
        <View style={{ backgroundColor: "#FFF7E9", borderRadius: 10, padding: 15,
          marginTop: 14, marginBottom: 15 }}>
          <Text style={{ fontWeight: "800", color: "#8A4B00" }}>
            SIMULATED ADMIN WORKFLOW — NO REAL RESIDENT OR APPROVAL
          </Text>
          <Text style={{ ...base, marginTop: 5 }}>
            This uses fictional data only. The real Admin Identity Reviews page
            still requires an approved Admin login. Local OCR data is NOT
            transferred to this demonstration.
          </Text>
        </View>
        <View style={{ backgroundColor: "white", borderRadius: 10, padding: 17,
          borderWidth: 1, borderColor: "#CBD5E1", gap: 8 }}>
          <Text style={{ color: navy, fontWeight: "800", fontSize: 18 }}>
            Fictional National ID Review
          </Text>
          <Text style={base}>Applicant: Sample Resident (synthetic)</Text>
          <Text style={base}>ID type: Philippine National ID (declared)</Text>
          <Text style={base}>Channel: In-person LGU review — no media uploaded</Text>
          <Text style={base}>Local OCR result: NOT SUBMITTED</Text>
          <Text style={{ color: navy, fontWeight: "800" }}>
            Simulated status: {bucket.toUpperCase().replaceAll("_", " ")}
          </Text>
        </View>
        <View style={{ backgroundColor: "white", borderRadius: 10, padding: 17,
          borderWidth: 1, borderColor: "#CBD5E1", marginTop: 14, gap: 9 }}>
          <Text style={{ fontWeight: "800", fontSize: 18, color: navy }}>
            Independent Admin Review
          </Text>
          <Text style={base}>
            Checkboxes are for DEMO interaction only. They do not prove that
            the PSA or an LGU actually validated an ID.
          </Text>
          <TouchableOpacity disabled={!pending} accessibilityRole="radio"
            accessibilityState={{ checked: method === NATIONAL_METHOD }}
            onPress={() => { setMethod(method ? "" : NATIONAL_METHOD); setConfirmation(null); }}
            style={{ borderWidth: 1, borderRadius: 8, borderColor: "#CBD5E1", padding: 12 }}>
            <Text style={{ ...base, fontWeight: "700" }}>
              {method === NATIONAL_METHOD ? "◉" : "◯"} PSA National ID independent QR check
            </Text>
          </TouchableOpacity>
          {check("Original physical ID inspected in person", inspected, setInspected)}
          {check("Person compared with ID portrait in person", personChecked, setPersonChecked)}
          {check("Independent ID check completed and attested", attested, setAttested)}
          <Text style={{ ...base, fontWeight: "700" }}>
            Review notes (25+ characters for Verify; 5+ for Reject/Retry)
          </Text>
          <TextInput multiline editable={pending} maxLength={1000}
            accessibilityLabel="Demo Admin review notes"
            value={notes} onChangeText={v => { setNotes(v); setConfirmation(null); }}
            placeholder="Use fictional review notes only; no real ID numbers"
            placeholderTextColor="#64748B"
            style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8,
              padding: 12, minHeight: 90, color: navy, textAlignVertical: "top" }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity accessibilityRole="button" disabled={!pending}
              style={actionStyle("#0F766E", !pending)}
              onPress={() => startDecision("verify")}>
              <Text style={{ color: "white", fontWeight: "800" }}>Verify (Demo)</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={!pending}
              style={actionStyle("#A16207", !pending)}
              onPress={() => startDecision("require_retry")}>
              <Text style={{ color: "white", fontWeight: "800" }}>Require Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={!pending}
              style={actionStyle("#B42318", !pending)}
              onPress={() => startDecision("reject")}>
              <Text style={{ color: "white", fontWeight: "800" }}>Reject (Demo)</Text>
            </TouchableOpacity>
          </View>
          {confirmation ? (
            <View style={{ backgroundColor: "#FFF7E9", borderRadius: 8, padding: 12, gap: 8 }}>
              <Text style={base}>
                Confirm fictional {confirmation.replaceAll("_", " ")} decision?
              </Text>
              <TouchableOpacity onPress={confirm} accessibilityRole="button"
                style={actionStyle(navy)}>
                <Text style={{ color: "white", fontWeight: "700" }}>
                  Confirm SIMULATION (no database write)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmation(null)}
                accessibilityRole="button">
                <Text style={base}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {message ? <Text style={base} accessibilityRole="alert">{message}</Text> : null}
          {audit ? <Text style={{ ...base, color: "#166534" }}>{audit}</Text> : null}
          <TouchableOpacity onPress={reset} accessibilityRole="button"
            style={{ borderRadius: 8, borderWidth: 1, borderColor: "#CBD5E1",
              padding: 12, alignItems: "center" }}>
            <Text style={{ fontWeight: "800", color: navy }}>Reset Fictional Case</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() =>
            router.push("/public/local-national-id-demo" as any)}
            accessibilityRole="button" style={{ paddingVertical: 6 }}>
            <Text style={{ fontWeight: "700", color: "#0F766E" }}>
              Back to separate National ID OCR demo
            </Text>
          </TouchableOpacity>
          <Text style={base}>
            The real backend decision rules and audit writes are evaluated
            separately using synthetic end-to-end route tests.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
