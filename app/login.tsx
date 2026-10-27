import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "../lib/firebase";
import PremiumAuthShell, { authCornerCut } from "../components/auth/PremiumAuthShell";
import {
  getUserProfile,
  homeRouteForProfile,
  isApprovedProfile,
  loginUser,
} from "../lib/firebaseAuth";

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "com.froyarjan123.volunserve",
});

export default function Login() {
  const router = useRouter();
  const emailInputRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const applyRememberMe = async () => {
    if (Platform.OS === "web") {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    }
  };


  const [googleRequest, , promptGoogleAsync] = Google.useAuthRequest({
    webClientId: "233201250762-ton2r7m31pomrc42rgfjl7vb292e0var.apps.googleusercontent.com",
    androidClientId: "233201250762-d7tnic7h4q3f6ohip52a36ng22uqrvl5.apps.googleusercontent.com",
    redirectUri,
    scopes: ["openid", "profile", "email"],
  });

  const routeSignedInProfile = async (uid: string) => {
    let profile;

    try {
      profile = await getUserProfile(uid);
    } catch {
      await firebaseSignOut(auth);

      throw new Error(
        "No VolunServe profile was found for this account. Please register first."
      );
    }

    // Staff accounts use a separate email/password portal, never community Google OAuth.
    if (profile.role === "admin" || profile.role === "superadmin") {
      await firebaseSignOut(auth);
      throw new Error("LGU Admin and system staff must use Admin Login with their issued email and password.");
    }

    if (!isApprovedProfile(profile)) {
      await firebaseSignOut(auth);

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

    const destination = homeRouteForProfile(profile);
    router.replace(destination as any);
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      alert(
        "Please enter your email address and password."
      );
      return;
    }

    if (loading || googleLoading) {
      return;
    }

    try {
      setLoading(true);

      await applyRememberMe();
      const { profile } = await loginUser(
        cleanEmail,
        password
      );

      if (profile.role === "admin" || profile.role === "superadmin") {
        await firebaseSignOut(auth);
        throw new Error("Use the LGU Admin Login tab for staff accounts.");
      }
      const destination =
        homeRouteForProfile(profile);

      router.replace(destination as any);
    } catch (error: any) {
      alert(error?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading || googleLoading) {
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      alert("Enter your email address first, then select Forgot password.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(
        auth,
        cleanEmail
      );

      alert(
        "Password reset email sent. Check your inbox and spam folder for the reset link."
      );
    } catch (error: any) {
      const code = String(error?.code || "");

      if (code === "auth/invalid-email") {
        alert("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        alert("Too many reset attempts. Please wait and try again later.");
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

  const handleGoogleLogin = async () => {
    if (!googleRequest || loading || googleLoading) {
      return;
    }

    try {
      setGoogleLoading(true);

      const result = await promptGoogleAsync();

      if (result.type !== "success") {
        if (result.type !== "dismiss" && result.type !== "cancel") {
          alert("Google sign-in was not completed. Please try again.");
        }
        return;
      }

      const idToken = result.params?.id_token;

      if (!idToken) {
        throw new Error(
          "Google did not return a valid sign-in token. Please try again."
        );
      }

      await applyRememberMe();
      const credential =
        GoogleAuthProvider.credential(idToken);

      const userCredential =
        await signInWithCredential(
          auth,
          credential
        );

      await routeSignedInProfile(
        userCredential.user.uid
      );
    } catch (error: any) {
      await firebaseSignOut(auth).catch(() => undefined);

      alert(
        error?.message ||
          "Google sign-in failed. Please try again."
      );
    } finally {
      setGoogleLoading(false);
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
        <View style={[styles.inputBox, authCornerCut(10), focused === "email" && styles.focused]}>
          <Ionicons name="mail-outline" size={21} color="#64748B" />
          <TextInput ref={emailInputRef} style={styles.input} value={email} onChangeText={setEmail}
            accessibilityLabel="Resident email address"
            placeholder="Enter your email address" placeholderTextColor="#8BA0B4"
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" editable={!loading && !googleLoading}
            returnKeyType="next" onFocus={() => setFocused("email")} onBlur={() => setFocused(null)} />
        </View>
        <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10), focused === "password" && styles.focused]}>
          <Ionicons name="lock-closed-outline" size={21} color="#64748B" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword}
            accessibilityLabel="Resident password"
            placeholder="Enter your password" placeholderTextColor="#8BA0B4" secureTextEntry={!showPassword}
            autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password"
            editable={!loading && !googleLoading} returnKeyType="done"
            onSubmitEditing={() => void handleLogin()} onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={loading || googleLoading}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#57728C" />
          </TouchableOpacity>
        </View>
        <View style={styles.options}>
          <TouchableOpacity accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            onPress={() => setRememberMe(value => !value)}
            disabled={loading || googleLoading} style={styles.checkRow}>
            <Ionicons name={rememberMe ? "checkbox-outline" : "square-outline"} size={20} color="#087F66" />
            <Text style={styles.muted}>Remember me</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => void handleForgotPassword()}
            disabled={loading || googleLoading}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void handleLogin()}
          disabled={loading || googleLoading}
          style={({ pressed }) => [styles.signIn, authCornerCut(12),
            (pressed || loading || googleLoading) && styles.disabled]}>
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
          disabled={!googleRequest || loading || googleLoading}
          style={[styles.outlineButton, authCornerCut(10),
            (!googleRequest || loading || googleLoading) && styles.disabled]}>
          {googleLoading ? <ActivityIndicator color="#087F66" /> :
            <View style={styles.centerRow}>
              <Ionicons name="logo-google" color="#2563EB" size={19} />
              <Text style={styles.outlineText}>Continue with Google</Text>
            </View>}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.replace("/public")}
          disabled={loading || googleLoading}
          style={[styles.outlineButton, authCornerCut(10), (loading || googleLoading) && styles.disabled]}>
          <View style={styles.centerRow}>
            <Ionicons name="person-outline" color="#285A4A" size={21} />
            <Text style={styles.outlineText}>Continue as Guest</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.createRow}>
          <Text style={styles.muted}>Don't have an account? </Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/signup")}
            disabled={loading || googleLoading}>
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
