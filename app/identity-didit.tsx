import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, firebaseConfig } from "../lib/firebase";

import { getBackendBaseUrl } from "../lib/identityVerification";


export const diditAvailable = process.env.EXPO_PUBLIC_DIDIT_ENABLED === "true" &&
  process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET === "staging" && firebaseConfig.projectId === "volunserve-full-staging";

type VerificationState = {
  identityStatus?: "basic" | "pending" | "verified" | "failed";
  providerStatus?: string;
  requiresManualReview?: boolean;
  sandbox?: boolean;
};

async function authenticatedRequest(path: string, method: "GET" | "POST" = "GET") {
  if (!diditAvailable) throw new Error("Sandbox verification is disabled.");
  const resident = auth.currentUser;
  if (!resident) throw new Error("Sign in to VolunServe to verify your identity.");
  const token = await resident.getIdToken();
  const response = await fetch(getBackendBaseUrl() + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Unable to connect to identity verification.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data;
}

export default function DiditVerificationPage() {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [state, setState] = useState<VerificationState | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!diditAvailable || !auth.currentUser) return;
    setRefreshing(true);
    try {
      const result = await authenticatedRequest("/api/identity/didit/sync");
      setState(result);
      setHasSession(true);
      setErrorMessage("");
    } catch (error: any) {
      if (error?.status !== 404) setErrorMessage(String(error?.message || "Could not refresh status."));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15000);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refresh]);

  async function start() {
    if ((!consent && (!hasSession || state?.identityStatus === "failed")) || busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const session = await authenticatedRequest("/api/identity/didit/start", "POST");
      if (!/^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(session.url || "")) {
        throw new Error("Identity verification returned an invalid secure link.");
      }
      const host = new URL(session.url).hostname;
      if (host !== "didit.me" && !host.endsWith(".didit.me")) {
        throw new Error("Unexpected identity verification destination.");
      }
      setHasSession(true);
      setState({ identityStatus: "pending", providerStatus: "Not Started" });
      await Linking.openURL(session.url);
    } catch (error: any) {
      setErrorMessage(String(error?.message || "Unable to start verification."));
    } finally {
      setBusy(false);
    }
  }

  const approved = state?.identityStatus === "verified";
  const manual = state?.requiresManualReview === true;
  const failed = state?.identityStatus === "failed";
  const status = approved ? "Verified Resident" : manual ? "Needs Review" : failed ? "Verification failed" :
    hasSession ? "Verification in progress" : "Ready to verify";
  const description = approved
    ? "Your identity has been verified in VolunServe."
    : manual ? "Our Admin team needs to review the verification result."
    : failed ? "You may start a new verification attempt." : hasSession ? "Complete the secure identity checks, then return to this screen."
    : "Verify a valid government ID and complete a live face check.";

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>VOLUNSERVE</Text>
        <Text style={styles.heading}>Identity Verification</Text>
        <Text style={styles.subheading}>Secure resident identity verification</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{status}</Text>
        <Text style={styles.description}>{description}</Text>
        {state?.providerStatus ? <Text style={styles.provider}>Verification status: {state.providerStatus}</Text> : null}
        {state?.sandbox ? <Text style={styles.warning}>Sandbox simulation for a test resident.</Text> : null}
        {!approved && !manual && (!hasSession || failed) ? (
          <>
            <View style={styles.step}><Text style={styles.stepText}>1. Present your government-issued ID</Text></View>
            <View style={styles.step}><Text style={styles.stepText}>2. Complete the live face and liveness checks</Text></View>
            <View style={styles.step}><Text style={styles.stepText}>3. Receive a result or Admin review</Text></View>
            <TouchableOpacity style={styles.consentRow} onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
              <View style={[styles.checkbox, consent && styles.checked]}><Text style={styles.checkText}>{consent ? "✓" : ""}</Text></View>
              <Text style={styles.consentText}>I consent to a third-party identity verification provider processing my ID and biometric selfie for VolunServe account verification under the applicable privacy notice.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, (!consent || busy) && styles.disabled]} disabled={!consent || busy} onPress={() => void start()}>
              <Text style={styles.buttonText}>{busy ? "Preparing secure verification..." : "Start Identity Verification"}</Text>
            </TouchableOpacity>
          </>
        ) : !approved ? (
          <TouchableOpacity style={styles.button} disabled={refreshing} onPress={() => void refresh()}>
            {refreshing ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Refresh Verification Status</Text>}
          </TouchableOpacity>
        ) : null}
        {hasSession && !manual && !approved && !failed ? (
          <TouchableOpacity style={styles.button} disabled={busy} onPress={() => void start()}>
            <Text style={styles.buttonText}>Resume Verification</Text>
          </TouchableOpacity>
        ) : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>
      <Text style={styles.footer}>Verification is processed securely. VolunServe receives the result and does not store raw biometric images in this form.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F3F7FB" },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 32, alignItems: "center" },
  header: { width: "100%", maxWidth: 640, marginBottom: 22 },
  eyebrow: { color: "#0F766E", fontWeight: "800", fontSize: 12, letterSpacing: 2 },
  heading: { color: "#0F2F5A", fontSize: 28, fontWeight: "800", marginTop: 6 },
  subheading: { color: "#64748B", marginTop: 7, fontSize: 14 },
  card: { width: "100%", maxWidth: 640, backgroundColor: "#FFF", borderRadius: 18, padding: 24, borderWidth: 1, borderColor: "#E2E8F0" },
  sectionTitle: { color: "#0F2F5A", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  description: { color: "#475569", lineHeight: 22, fontSize: 14, marginBottom: 12 },
  provider: { color: "#475569", fontSize: 13, marginBottom: 12 },
  warning: { color: "#9A6700", fontSize: 13, marginBottom: 12 },
  step: { backgroundColor: "#F8FAFC", paddingVertical: 13, paddingHorizontal: 14, borderRadius: 8, marginVertical: 4 },
  stepText: { color: "#334155", fontSize: 14 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 22 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: "#94A3B8", borderRadius: 5, marginRight: 12, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  checkText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  consentText: { color: "#475569", flex: 1, fontSize: 12, lineHeight: 19 },
  button: { backgroundColor: "#0F766E", padding: 15, borderRadius: 10, alignItems: "center", justifyContent: "center", minHeight: 50 },
  disabled: { opacity: 0.4 },
  buttonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  error: { color: "#B91C1C", marginTop: 14, fontSize: 13 },
  footer: { maxWidth: 620, marginTop: 18, textAlign: "center", color: "#64748B", fontSize: 12, lineHeight: 19 },
});