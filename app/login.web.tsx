import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
} from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../lib/firebase";
import PremiumAuthShell, { authCornerCut } from "../components/auth/PremiumAuthShell";
import {
  connectGoogleAccountWeb,
  getUserProfile,
  homeRouteForProfile,
  isApprovedProfile,
  loginUser,
  logoutUser,
} from "../lib/firebaseAuth";

export default function WebLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [focusedInput, setFocusedInput] = useState<
    "email" | "password" | null
  >(null);
  const [loading, setLoading] = useState(false);

  const applySessionPersistence = async () => {
    await setPersistence(
      auth,
      rememberMe
        ? browserLocalPersistence
        : browserSessionPersistence
    );
  };
  const handleLogin = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      alert("Please enter your email address and password.");
      return;
    }
    try {
      setLoading(true);
      await applySessionPersistence();
      const { profile } = await loginUser(
        email.trim().toLowerCase(),
        password
      );
      if (profile.role === "admin" || profile.role === "superadmin") {
        await logoutUser();
        throw new Error("LGU staff must use the LGU Admin Login tab with email and password.");
      }
      router.replace(homeRouteForProfile(profile) as any);
    } catch (error: any) {
      alert(error?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };
  const handleGoogleLogin = async () => {
    if (loading) return;

    try {
      setLoading(true);
      await applySessionPersistence();

      const googleUser = await connectGoogleAccountWeb();
      let profile;
      try {
        profile = await getUserProfile(googleUser.uid);
      } catch (profileError: any) {
        if (String(profileError?.message || "").trim() === "Profile not found.") {
          // A Google identity is not a completed Resident account.
          // Keep the Firebase session so Signup can prefill Google details.
          router.replace("/signup");
          return;
        }
        throw profileError;
      }

      if (!isApprovedProfile(profile)) {
        await logoutUser();

        if (profile.status === "rejected") {
          throw new Error(
            profile.rejectedReason
              ? `Registration rejected: ${profile.rejectedReason}`
              : "Your registration was rejected. Please contact an administrator."
          );
        }

        if (profile.status === "suspended") {
          throw new Error(
            "Your account is suspended. Please contact an administrator."
          );
        }

        throw new Error(
          "This legacy account is still pending administrative review."
        );
      }

      if (profile.role === "admin" || profile.role === "superadmin") {
        await logoutUser();
        throw new Error("LGU staff must use the LGU Admin Login tab with email and password.");
      }
      router.replace(homeRouteForProfile(profile) as any);
    } catch (error: any) {
      try {
        if (!String(error?.message || "").toLowerCase().includes("cancelled")) {
          await logoutUser();
        }
      } catch {
        // Keep the original authentication error as the user-facing message.
      }

      alert(error?.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      alert(
        "Enter your email address first, then select Forgot password."
      );
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, cleanEmail);
      const isGmail = cleanEmail.endsWith("@gmail.com");
      const message = isGmail
        ? "Password reset request sent. If this Gmail account uses Email/Password sign-in, check Gmail and the Spam folder for the Firebase reset link. If this account was created with Google only, use Continue with Google instead."
        : "Password reset request sent. Check your inbox and Spam folder for the Firebase reset link. Google-only accounts should use Continue with Google.";
      if (typeof window !== "undefined" && isGmail) {
        const openGmail = window.confirm(
          `${message}\n\nOpen Gmail now?`
        );
        if (openGmail) {
          window.open(
            "https://mail.google.com/mail/u/0/#inbox",
            "_blank",
            "noopener,noreferrer"
          );
        }
      } else {
        alert(message);
      }
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "auth/invalid-email") {
        alert("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        alert(
          "Too many reset attempts. Please wait and try again later."
        );
      } else {
        alert(
          error?.message ||
            "Unable to send the password reset email."
        );
      }
    } finally {
      setLoading(false);
    }
  };
  // Shared premium shell supplies the real two-route tab switcher.
  // Authentication, guarded role routing and Resident-only Google OAuth remain intact.
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PremiumAuthShell active="resident">
        <View style={styles.intro}>
          <Text style={styles.kicker}>—  VOLUNSERVE ACCOUNT  —</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to stay connected with your community and help build a safer, stronger city.</Text>
        </View>
        <Text style={styles.label}>Email Address</Text>
        <View style={[styles.inputBox, authCornerCut(10), focusedInput === "email" && styles.focused]}>
          <Ionicons name="mail-outline" size={21} color="#64748B" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            accessibilityLabel="Resident email address"
            placeholder="Enter your email address" placeholderTextColor="#8BA0B4"
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" editable={!loading}
            returnKeyType="next" onFocus={() => setFocusedInput("email")} onBlur={() => setFocusedInput(null)} />
        </View>
        <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10), focusedInput === "password" && styles.focused]}>
          <Ionicons name="lock-closed-outline" size={21} color="#64748B" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword}
            accessibilityLabel="Resident password"
            placeholder="Enter your password" placeholderTextColor="#8BA0B4" secureTextEntry={!showPassword}
            autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password"
            editable={!loading} returnKeyType="done"
            onSubmitEditing={() => void handleLogin()} onFocus={() => setFocusedInput("password")}
            onBlur={() => setFocusedInput(null)} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={loading}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#57728C" />
          </TouchableOpacity>
        </View>
        <View style={styles.options}>
          <TouchableOpacity accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            onPress={() => setRememberMe(value => !value)}
            disabled={loading} style={styles.checkRow}>
            <Ionicons name={rememberMe ? "checkbox-outline" : "square-outline"} size={20} color="#087F66" />
            <Text style={styles.muted}>Remember me</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => void handleForgotPassword()}
            disabled={loading}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void handleLogin()}
          disabled={loading}
          style={({ pressed }) => [styles.signIn, authCornerCut(12),
            (pressed || loading) && styles.disabled]}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> :
            <View style={styles.centerRow}>
              <Text style={styles.signInText}>Sign In</Text>
              <Ionicons name="arrow-forward-outline" size={21} color="#FFFFFF" />
            </View>}
        </Pressable>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.muted}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => void handleGoogleLogin()}
          disabled={loading}
          style={[styles.outlineButton, authCornerCut(10),
            (loading) && styles.disabled]}>
          {loading ? <ActivityIndicator color="#087F66" /> :
            <View style={styles.centerRow}>
              <Ionicons name="logo-google" color="#2563EB" size={19} />
              <Text style={styles.outlineText}>Continue with Google</Text>
            </View>}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.replace("/public")}
          disabled={loading}
          style={[styles.outlineButton, authCornerCut(10), (loading) && styles.disabled]}>
          <View style={styles.centerRow}>
            <Ionicons name="person-outline" color="#285A4A" size={21} />
            <Text style={styles.outlineText}>Continue as Guest</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.createRow}>
          <Text style={styles.muted}>Don't have an account? </Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/signup")}
            disabled={loading}>
            <Text style={styles.createLink}>Create account</Text>
          </TouchableOpacity>
        </View>
      </PremiumAuthShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECF6F1" },
  intro: { alignItems: "center", marginBottom: 15, gap: 8 },
  kicker: { fontSize: 10, fontWeight: "900", letterSpacing: 2.2, color: "#087C64" },
  title: { fontSize: 34, fontWeight: "900", color: "#112333", letterSpacing: -1.1, textAlign: "center" },
  subtitle: { maxWidth: 380, color: "#718198", fontSize: 13, textAlign: "center", lineHeight: 21 },
  label: { fontSize: 12, fontWeight: "900", color: "#18283A", marginBottom: -5 },
  passwordLabel: { marginTop: 5 },
  inputBox: { minHeight: 56, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 17, gap: 11, backgroundColor: "#FCFDFD", borderWidth: 1, borderColor: "#C5D8DC" },
  focused: { borderColor: "#008A6E", backgroundColor: "#FFFFFF" },
  input: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 13, color: "#122F38" },
  eye: { padding: 5 },
  options: { flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: -2 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  muted: { color: "#728095", fontSize: 12 },
  forgot: { color: "#007B60", fontWeight: "800", fontSize: 12 },
  signIn: { minHeight: 57, justifyContent: "center", alignItems: "center",
    backgroundColor: "#007F62", marginTop: 4, shadowColor: "#087F61", shadowOpacity: .2,
    shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  signInText: { fontSize: 16, fontWeight: "900", color: "#FFFFFF" },
  divider: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 3 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#D5E1E1" },
  outlineButton: { minHeight: 51, borderWidth: 1, borderColor: "#C9D8DA",
    backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  outlineText: { fontSize: 13, color: "#172E3B", fontWeight: "800" },
  createRow: { flexDirection: "row", alignItems: "center", justifyContent: "center",
    flexWrap: "wrap", paddingTop: 10 },
  createLink: { fontSize: 12, fontWeight: "900", color: "#008365" },
  disabled: { opacity: .5 },
});
