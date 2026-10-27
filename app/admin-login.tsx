import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import React, { useState } from "react";
import PremiumAuthShell, { authCornerCut } from "../components/auth/PremiumAuthShell";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "../lib/firebase";
import {
  isApprovedProfile,
  loginUser,
} from "../lib/firebaseAuth";

/**
 * A dedicated sign-in ENTRY POINT for operational Admin and Super Admin accounts.
 * Accounts still use Firebase Authentication; this is not a second password database.
 * The root protected route guard, backend and Firestore rules remain authoritative.
 * Resident/Volunteer sessions must never gain administrative access.
 */
export default function AdministrativeLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const signIn = async () => {
    if (working) return;
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Enter your authorized administrative email and password.");
      return;
    }
    setWorking(true);
    try {
      const { profile } = await loginUser(cleanEmail, password);
      const admin = profile.role === "admin";
      const superAdmin = profile.role === "superadmin";
      const permitted =
        isApprovedProfile(profile) &&
        (superAdmin || (admin && profile.adminStatus !== "suspended"));
      if (!permitted) {
        // Reject a valid Resident/Volunteer password at this restricted entry.
        await signOut(auth);
        setError(profile.role === "applicant" ? "Your LGU staff application is awaiting independent Super Admin credential approval. You cannot access the Admin Command Center yet." : "This portal is reserved for an active Admin or Super Admin account. Residents should use the community sign-in.");
        return;
      }
      router.replace(
        (superAdmin ? "/(superadmin)" : "/(admin)/command-center") as any,
      );
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please check your credentials.");
    } finally {
      setWorking(false);
    }
  };

  const resetPassword = async () => {
    if (working) return;
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter your administrative email first to request a reset.");
      return;
    }
    setWorking(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setNotice("If this email has an eligible password account, a reset link has been sent. Check your inbox and spam folder.");
    } catch (err: any) {
      if (err?.code === "auth/invalid-email") {
        setError("Enter a valid email address.");
      } else {
        setNotice("If this email has an eligible password account, check your inbox and spam folder.");
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PremiumAuthShell active="admin">
        <View style={styles.intro}>
          <Text style={styles.kicker}>—  AUTHORIZED LGU ACCESS  —</Text>
          <Text style={styles.title}>Administration Portal</Text>
          <Text style={styles.subtitle}>Sign in securely with your issued administrative email and password.</Text>
        </View>
        <View style={[styles.adminNotice, authCornerCut(8)]}>
          <Ionicons name="shield-checkmark-outline" color="#087B62" size={18} />
          <Text style={styles.adminNoticeText}>Verified LGU Admins and system administrators only. No Google authentication.</Text>
        </View>
        <Text style={styles.label}>Administrative Email</Text>
        <View style={[styles.inputBox, authCornerCut(10)]}>
          <Ionicons name="mail-outline" size={21} color="#657A89" />
          <TextInput accessibilityLabel="Administrative email" style={styles.input}
            value={email} onChangeText={setEmail} editable={!working}
            autoCapitalize="none" autoCorrect={false} textContentType="emailAddress"
            autoComplete="email" keyboardType="email-address"
            placeholder="name@example.gov.ph" placeholderTextColor="#91A3AE" />
        </View>
        <Text style={[styles.label, { marginTop: 5 }]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10)]}>
          <Ionicons name="lock-closed-outline" size={21} color="#657A89" />
          <TextInput accessibilityLabel="Administrative password" style={styles.input}
            value={password} onChangeText={setPassword} editable={!working}
            autoCapitalize="none" secureTextEntry={!showPassword}
            textContentType="password" autoComplete="password"
            placeholder="Enter password" placeholderTextColor="#91A3AE"
            onSubmitEditing={() => void signIn()} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={working}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20} color="#57728C" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.forgot} accessibilityRole="button"
          disabled={working} onPress={() => void resetPassword()}>
          <Text style={styles.forgotText}>Forgot your administrative password?</Text>
        </TouchableOpacity>
        {!!error && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Sign in to LGU administration"
          disabled={working} onPress={() => void signIn()}
          style={[styles.submit, authCornerCut(12), working && styles.disabled]}>
          {working ? <ActivityIndicator color="#FFFFFF" /> :
            <View style={styles.rowCenter}>
              <Text style={styles.submitText}>Sign In to Administration</Text>
              <Ionicons name="arrow-forward-outline" size={20} color="#FFFFFF" />
            </View>}
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/admin-request")}
          disabled={working} style={[styles.outlineAction, authCornerCut(10)]}>
          <Ionicons name="document-text-outline" size={19} color="#087B62" />
          <Text style={styles.outlineActionText}>Request Access from Super Admin</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>This requests an LGU Admin account, NOT a programmer Super Admin account. Our Super Admin team verifies LGU staff details and approves access. Pending applicants cannot manage city operations.</Text>
      </PremiumAuthShell>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#EAF7F0" },
  intro: { alignItems: "center", marginBottom: 13, gap: 7 },
  kicker: { color: "#087D62", fontSize: 10, letterSpacing: 2.1, fontWeight: "900" },
  title: { color: "#14283A", fontSize: 29, fontWeight: "900", textAlign: "center", letterSpacing: -.7 },
  subtitle: { fontSize: 13, lineHeight: 20, maxWidth: 370, textAlign: "center", color: "#738293" },
  adminNotice: { backgroundColor: "#E7F8EF", paddingHorizontal: 13, paddingVertical: 11,
    flexDirection: "row", alignItems: "center", gap: 10 },
  adminNoticeText: { flex: 1, fontSize: 11, lineHeight: 17, color: "#286D58", fontWeight: "600" },
  label: { fontSize: 12, color: "#182838", fontWeight: "900", marginBottom: -4 },
  inputBox: { minHeight: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#C9DAD8", gap: 11, backgroundColor: "#FCFDFD" },
  input: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 13, color: "#152F36" },
  eye: { padding: 5 },
  forgot: { alignSelf: "flex-end", paddingVertical: 6 },
  forgotText: { color: "#007F62", fontSize: 12, fontWeight: "800" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12,
    backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "#FFD5D0" },
  errorText: { fontSize: 12, lineHeight: 17, color: "#B42318", flex: 1 },
  notice: { color: "#087F62", fontSize: 12, lineHeight: 17 },
  submit: { marginTop: 5, minHeight: 56, backgroundColor: "#007F62", alignItems: "center",
    justifyContent: "center", shadowColor: "#007F62", shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: .18, elevation: 2 },
  rowCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  disabled: { opacity: .55 },
  divider: { height: 1, backgroundColor: "#DBE5E1", marginVertical: 4 },
  outlineAction: { flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#C5DCD4", minHeight: 52, gap: 9 },
  outlineActionText: { color: "#08785F", fontSize: 13, fontWeight: "800" },
  footer: { textAlign: "center", color: "#718A80", fontSize: 10, lineHeight: 16 },
});
