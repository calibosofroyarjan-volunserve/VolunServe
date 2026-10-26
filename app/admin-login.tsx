import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
  const { width } = useWindowDimensions();
  const narrow = width < 540;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const alertMessage = (title: string, message: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(title + "\n\n" + message);
    } else {
      Alert.alert(title, message);
    }
  };

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
        setError("This portal is reserved for an active Admin or Super Admin account. Residents should use the community sign-in.");
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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.screen, narrow && styles.screenCompact]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.page, narrow && styles.pageCompact]}>
          <LinearGradient
            colors={["#08684F", "#0C9671", "#35B89E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.intro, narrow && styles.introCompact]}
          >
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Ionicons name="shield-checkmark" size={26} color="#0C8669" />
              </View>
              <Text style={styles.brandName}>VOLUNSERVE</Text>
            </View>
            <Text style={styles.introLabel}>AUTHORIZED ACCESS ONLY</Text>
            <Text style={[styles.introTitle, narrow && styles.introTitleCompact]}>Administration Portal</Text>
            <Text style={styles.introText}>
              Dedicated account access for authorized LGU administrators and system administrators.
              This portal is separate from the community account interface.
            </Text>
            <View style={styles.flowCard}>
              <Ionicons name="lock-closed" size={20} color="#C3F8E7" />
              <View style={{ flex: 1 }}>
                <Text style={styles.flowHeading}>Secure authentication flow</Text>
                <Text style={styles.flowText}>
                  Sign in → verify account status and role → open the permitted dashboard.
                  Account authorization is enforced server-side; a new public user cannot self-register as Admin.
                </Text>
              </View>
            </View>
          </LinearGradient>
          <View style={[styles.panel, narrow && styles.panelCompact]}>
            <Text style={styles.eyebrow}>STAFF SIGN-IN</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Use the individual credentials issued to your authorized administrative account.
            </Text>
            <Text style={styles.label}>Administrative email</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={19} color="#647F75" />
              <TextInput
                accessibilityLabel="Administrative email"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder="name@example.gov.ph"
                placeholderTextColor="#93A9A1"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                editable={!working}
              />
            </View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={19} color="#647F75" />
              <TextInput
                accessibilityLabel="Administrative password"
                textContentType="password"
                placeholder="Enter password"
                placeholderTextColor="#93A9A1"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onSubmitEditing={() => void signIn()}
                style={styles.input}
                editable={!working}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(prev => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={10}
                disabled={working}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#416A5B" />
              </TouchableOpacity>
            </View>
            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign in to administrative portal"
              style={[styles.submit, working && styles.disabled]}
              onPress={() => void signIn()}
              disabled={working}
            >
              {working ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />}
              <Text style={styles.submitText}>{working ? "Verifying account..." : "Sign In to Administration"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void resetPassword()}
              disabled={working}
              style={styles.secondaryAction}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>Forgot your administrative password?</Text>
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity
              style={styles.communityLink}
              accessibilityRole="button"
              onPress={() => router.replace("/login")}
            >
              <Ionicons name="arrow-back-outline" size={18} color="#087D5D" />
              <Text style={styles.communityLinkText}>Go to Resident and Volunteer Login</Text>
            </TouchableOpacity>
            <Text style={styles.footer}>
              Admin privileges require Super Admin approval after independent staff credential review.
              Resident AI identity verification alone does not authorize Admin access.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F8F5" },
  screen: { minHeight: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 36 },
  screenCompact: { paddingHorizontal: 12, paddingVertical: 15 },
  page: { width: "100%", maxWidth: 1050, flexDirection: "row", borderRadius: 22, backgroundColor: "#FFFFFF", overflow: "hidden", borderWidth: 1, borderColor: "#DBEAE4" },
  pageCompact: { flexDirection: "column", maxWidth: 550 },
  intro: { flex: 1, minWidth: 0, padding: 38, justifyContent: "center", gap: 17 },
  introCompact: { padding: 23 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  brandName: { color: "#FFFFFF", fontWeight: "900", fontSize: 18, letterSpacing: 1.3 },
  introLabel: { color: "#C9FBE9", fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 12 },
  introTitle: { color: "#FFFFFF", fontSize: 35, lineHeight: 41, fontWeight: "900" },
  introTitleCompact: { fontSize: 27, lineHeight: 33 },
  introText: { color: "#E0FFF5", fontSize: 13, lineHeight: 22 },
  flowCard: { flexDirection: "row", gap: 13, padding: 15, borderRadius: 13, backgroundColor: "rgba(3,52,41,0.23)", marginTop: 14 },
  flowHeading: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", marginBottom: 5 },
  flowText: { color: "#D2FFF1", fontSize: 11, lineHeight: 19 },
  panel: { flex: 1.05, minWidth: 0, padding: 38, gap: 12, justifyContent: "center" },
  panelCompact: { padding: 23 },
  eyebrow: { fontSize: 10, color: "#168064", fontWeight: "900", letterSpacing: 1.3 },
  title: { fontSize: 29, fontWeight: "900", color: "#153E35" },
  subtitle: { fontSize: 12, lineHeight: 19, color: "#638076", marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "800", color: "#2E5146", marginTop: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F7FBF9", borderWidth: 1, borderColor: "#D8E8E1", borderRadius: 11, minHeight: 49, paddingHorizontal: 12, gap: 9 },
  input: { flex: 1, color: "#173D31", fontSize: 13, minWidth: 0, paddingVertical: 12 },
  errorBox: { flexDirection: "row", gap: 8, backgroundColor: "#FFF2F1", padding: 11, borderRadius: 9 },
  errorText: { flex: 1, fontSize: 11, color: "#B42318", lineHeight: 16 },
  notice: { color: "#0F795C", fontSize: 11, lineHeight: 17 },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 11, minHeight: 49, backgroundColor: "#0D8969", marginTop: 8 },
  submitText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: .62 },
  secondaryAction: { alignSelf: "center", padding: 6 },
  actionText: { color: "#0B7F64", fontWeight: "700", fontSize: 11 },
  separator: { height: 1, backgroundColor: "#E1EDE8", marginVertical: 8 },
  communityLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 39 },
  communityLinkText: { color: "#087D5D", fontWeight: "800", fontSize: 12 },
  footer: { textAlign: "center", color: "#718B80", fontSize: 10, lineHeight: 17, marginTop: 8 },
});
