import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, firebaseConfig } from "../../lib/firebase";

// Didit is presented INSIDE the actual Resident verification page.
// The Sandbox result is strictly a demo. This component never imports Firestore
// and never updates residents, identityVerified, roles or approval records.
const ENDPOINT = "https://volunserve-didit-qa-backend.onrender.com/api/demo/didit";
const enabled = process.env.EXPO_PUBLIC_DIDIT_PRESENTATION_ENABLED === "true" &&
  firebaseConfig.projectId === "volunserve-3aa5b" &&
  (process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET || "production") === "production";

type DemoStatus = "demo_approved_simulated" | "demo_declined" |
  "demo_school_id_flagged" | "demo_review_or_processing";

const statusMessages: Record<DemoStatus, string> = {
  demo_approved_simulated: "APPROVED — SANDBOX SIMULATION ONLY",
  demo_declined: "DECLINED — SANDBOX SIMULATION ONLY",
  demo_school_id_flagged: "School ID category reported — Demo declined",
  demo_review_or_processing: "Processing or needs review — Sandbox simulation",
};

export default function DiditSandboxInline() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (!enabled) return null;

  async function callProvider(path: string, method: "GET" | "POST", body?: object) {
    if (!enabled) throw new Error("Sandbox demo is disabled.");
    if (!user || !user.emailVerified) throw new Error("Sign in using an email-verified test Resident account first.");
    const token = await user.getIdToken();
    let response: Response;
    try {
      response = await fetch(ENDPOINT + path, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        ...(method === "POST" ? { body: JSON.stringify(body || {}) } : {}),
      });
    } catch {
      throw new Error("Unable to reach the separate Didit Sandbox QA backend. Check the Render service.");
    }
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages: Record<string, string> = {
        presentation_demo_disabled: "The Sandbox backend is locked until your video test UID is authorized.",
        demo_test_account_only: "Your account is not on the Sandbox presentation allowlist.",
        unauthenticated: "Please log in to VolunServe before starting.",
        invalid_token: "Your sign-in expired. Sign in again to continue.",
        didit_sandbox_unavailable: "Didit Sandbox session unavailable. Check the Sandbox API key and workflow.",
        unexpected_sandbox_session: "Didit returned an unexpected Sandbox session.",
        demo_limit_reached: "The allowed demonstration sessions have been used.",
        demo_session_mismatch: "The provider response did not match this demonstration session.",
        invalid_demo_session: "The demonstration expired. Start a new session.",
      };
      throw new Error(messages[data.error] || data.message || "Sandbox demo request failed.");
    }
    return data;
  }

  async function beginDemo() {
    if (busy || !consent) return;
    setBusy(true);
    setError("");
    try {
      const data = await callProvider("/start", "POST", { consent: true });
      const url = new URL(String(data.url || ""));
      if (url.protocol !== "https:" || (url.hostname !== "didit.me" && !url.hostname.endsWith(".didit.me"))) {
        throw new Error("Provider supplied an unrecognized verification link.");
      }
      setSessionToken(String(data.token || ""));
      setStatus(null);
      await Linking.openURL(url.toString());
    } catch (e: any) {
      setError(String(e?.message || "Could not open Sandbox."));
    } finally {
      setBusy(false);
    }
  }

  async function checkResult() {
    if (!sessionToken || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await callProvider("/status?token=" + encodeURIComponent(sessionToken), "GET");
      setStatus(data.result as DemoStatus);
    } catch (e: any) {
      setError(String(e?.message || "Result unavailable."));
    } finally {
      setBusy(false);
    }
  }

  async function copyUid() {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setError("Test account UID copied. Share only the UID, never your login token or password.");
    } catch {
      setError("Your signed-in test account UID: " + user.uid);
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.icon}><Text style={styles.iconText}>D</Text></View>
        <View style={styles.headingText}>
          <Text style={styles.title}>Verify with Didit</Text>
          <Text style={styles.subtitle}>Integrated identity verification walkthrough · Sandbox demo</Text>
        </View>
        <View style={styles.tag}><Text style={styles.tagText}>DEMO</Text></View>
      </View>
      <Text style={styles.notice}>
        For thesis presentation only: Didit Sandbox returns simulated results. This demonstration
        does not change your VolunServe account to Verified Resident and does not validate whether
        an uploaded School ID is genuine or permitted.
      </Text>
      {!user ? <Text style={styles.helper}>Log in to VolunServe using the video test account to begin.</Text> : (
        <View style={styles.userRow}>
          <Text style={styles.helper} numberOfLines={1}>Signed in: {user.email || "Resident"}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void copyUid()}>
            <Text style={styles.copy}>Copy test UID</Text>
          </TouchableOpacity>
        </View>
      )}
      {!sessionToken ? (
        <>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:consent}}
            onPress={() => setConsent(v => !v)} style={styles.consent}>
            <Text style={styles.check}>{consent ? "☑" : "☐"}</Text>
            <Text style={styles.consentText}>I understand this is a simulated Didit test and consent to the demonstration.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, (!consent || busy || !user) && styles.disabled]}
            disabled={!consent || busy || !user} onPress={() => void beginDemo()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start Didit Sandbox</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity style={[styles.button,busy && styles.disabled]} disabled={busy}
            onPress={() => void checkResult()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Check Didit Result</Text>}
          </TouchableOpacity>
          <Text style={styles.helper}>Complete Didit in the new tab, then return here to check its Sandbox result.</Text>
          {status ? <Text style={styles.status}>{statusMessages[status] || "Unknown Sandbox result"}</Text> : null}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.dividerText}>Existing VolunServe AI verification is still available below.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#fff", borderColor: "#A7D7CE", borderWidth: 1, borderRadius: 16,
    padding: 20, marginBottom: 20, width: "100%" },
  heading: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#0C766D", justifyContent: "center", alignItems: "center" },
  iconText: { color: "#fff", fontSize: 25, fontWeight: "900" },
  headingText: { flex: 1 },
  title: { color: "#083C5B", fontWeight: "800", fontSize: 18 },
  subtitle: { color: "#53677B", fontSize: 12, marginTop: 4 },
  tag: { backgroundColor: "#FFF7ED", paddingVertical: 5, paddingHorizontal: 9, borderRadius: 7 },
  tagText: { color: "#92400E", fontWeight: "800", fontSize: 11 },
  notice: { backgroundColor: "#FFF7ED", color: "#92400E", borderRadius: 10,
    padding: 13, fontSize: 12, lineHeight: 19, marginBottom: 12 },
  userRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12, gap: 10 },
  helper: { fontSize: 12, color: "#52647A", marginBottom: 10, flexShrink: 1 },
  copy: { color: "#0C766D", fontWeight: "800", fontSize: 12 },
  consent: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12,
    borderWidth: 1, borderColor: "#D5E3EA", borderRadius: 9, marginBottom: 12 },
  consentText: { color: "#475569", flex: 1, fontSize: 12, lineHeight: 18 },
  check: { fontSize: 18, color: "#0C766D" },
  button: { minHeight: 46, backgroundColor: "#0C766D", borderRadius: 9,
    alignItems: "center", justifyContent: "center", padding: 12 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.5 },
  status: { backgroundColor: "#ECFDF5", padding: 12, color: "#065F46", fontWeight: "800",
    marginTop: 12, borderRadius: 8, fontSize: 12 },
  error: { color: "#B91C1C", marginTop: 12, fontSize: 12 },
  dividerText: { marginTop: 16, fontSize: 12, color: "#64748B", textAlign: "center" },
});