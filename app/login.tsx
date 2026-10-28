import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import GoogleBrandMark from "../components/auth/GoogleBrandMark";
import AuthFeedback from "../components/auth/AuthFeedback";
import PasswordResetModal from "../components/auth/PasswordResetModal";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  signOut as firebaseSignOut,
  GoogleAuthProvider,
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
  StyleSheet,
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
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string }>({ type: "error", message: "" });
  const showError = (message: string) => setFeedback({ type: "error", message });
  const showSuccess = (message: string) => setFeedback({ type: "success", message });
  const clearFeedback = () => setFeedback({ type: "error", message: "" });
  const [focused, setFocused] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetVisible, setResetVisible] = useState(false);
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
      showError("Please enter your email address and password.");
      return;
    }

    if (loading || googleLoading) {
      return;
    }

    try {
      clearFeedback();
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
      showError(error?.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (loading || googleLoading) return;
    clearFeedback();
    // Open the dialog first. No reset email is sent until the user confirms.
    setResetVisible(true);
  };

  const handleGoogleLogin = async () => {
    if (!googleRequest || loading || googleLoading) {
      return;
    }

    try {
      clearFeedback();
      setGoogleLoading(true);

      const result = await promptGoogleAsync();

      if (result.type !== "success") {
        if (result.type !== "dismiss" && result.type !== "cancel") {
          showError("Google sign-in was not completed. Please try again.");
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

      showError(error?.message || "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  // Shared premium shell supplies the real two-route tab switcher.
  // Authentication, guarded role routing and Resident-only Google OAuth remain intact.
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PremiumAuthShell active="resident">
        <Text style={styles.label}>Email Address</Text>
        <View style={[styles.inputBox, authCornerCut(10), focused === "email" && styles.focused]}>
          <Ionicons name="mail-outline" size={21} color="#194F41" />
          <TextInput ref={emailInputRef} style={styles.input} value={email} onChangeText={value => { setEmail(value); clearFeedback(); }}
            accessibilityLabel="Resident or volunteer email address"
            placeholder="Email address" placeholderTextColor="#8BA0B4"
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" editable={!loading && !googleLoading}
            returnKeyType="next" onFocus={() => setFocused("email")} onBlur={() => setFocused(null)} />
        </View>
        <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10), focused === "password" && styles.focused]}>
          <Ionicons name="lock-closed-outline" size={21} color="#64748B" />
          <TextInput style={styles.input} value={password} onChangeText={value => { setPassword(value); clearFeedback(); }}
            accessibilityLabel="Resident or volunteer password"
            placeholder="Password" placeholderTextColor="#8BA0B4" secureTextEntry={!showPassword}
            autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password"
            editable={!loading && !googleLoading} returnKeyType="done"
            onSubmitEditing={() => void handleLogin()} onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={loading || googleLoading}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#245947" />
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
          <TouchableOpacity accessibilityRole="button" onPress={handleForgotPassword}
            disabled={loading || googleLoading}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        {!!feedback.message && (
          <AuthFeedback
            message={feedback.message}
            type={feedback.type}
            onDismiss={clearFeedback}
          />
        )}
        <Pressable accessibilityRole="button" onPress={() => void handleLogin()}
          disabled={loading || googleLoading}
          style={({ pressed }) => [styles.signIn,
            (pressed || loading || googleLoading) && styles.disabled]}>
          <LinearGradient colors={["#16A780", "#00573F"]} start={{x:0,y:0}} end={{x:1,y:1}}
            style={StyleSheet.absoluteFillObject} pointerEvents="none"/>
          {loading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.signInText}>Signing in...</Text>
            </View>
          ) :
            <View style={styles.centerRow}>
              <Text style={styles.signInText}>Login as Resident / Volunteer</Text>
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
          style={[styles.outlineButton,
            (!googleRequest || loading || googleLoading) && styles.disabled]}>
          {googleLoading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color="#087F66" />
              <Text style={styles.outlineText}>Connecting to Google...</Text>
            </View>
          ) :
            <View style={styles.centerRow}>
              <GoogleBrandMark size={21} />
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
          <Text style={styles.muted}>Don't have an account?</Text>
        </View>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Create a resident or volunteer account"
          onPress={() => router.push("/signup")}
          disabled={loading || googleLoading}
          style={styles.createButton}>
          <Ionicons name="person-add-outline" color="#08785D" size={19} />
          <Text style={styles.createLink}>Create An Account</Text>
        </TouchableOpacity>
      </PremiumAuthShell>
      <PasswordResetModal visible={resetVisible} initialEmail={email}
        onClose={() => setResetVisible(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex:1,backgroundColor:"#E8FBEF"},
  label: {position:"absolute",opacity:0,height:0,width:0},
  passwordLabel: {},
  inputBox: {minHeight:57,flexDirection:"row",alignItems:"center",paddingHorizontal:17,
    gap:12,backgroundColor:"rgba(255,255,255,.84)",borderColor:"#C8E0D2",
    borderRadius:13,borderWidth:1,marginBottom:2},
  input: {flex:1,minWidth:0,fontSize:15,paddingVertical:14,color:"#103F33"},
  focused: {borderColor:"#068064",backgroundColor:"#FFFFFF",borderWidth:2},
  eye:{padding:7},
  options:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",
    flexWrap:"wrap",gap:12,marginTop:3,marginBottom:5},
  checkRow:{flexDirection:"row",gap:7,alignItems:"center",minHeight:40},
  muted:{color:"#527766",fontSize:13},
  forgot:{color:"#076B51",fontSize:13,fontWeight:"800"},
  signIn:{minHeight:59,overflow:"hidden",borderRadius:16,justifyContent:"center",
    alignItems:"center",marginTop:3,shadowColor:"#00684A",shadowOpacity:0.18,
    shadowRadius:10,shadowOffset:{width:0,height:5},elevation:3},
  signInText:{fontSize:16,fontWeight:"800",color:"#FFFFFF"},
  centerRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:12,paddingHorizontal:7},
  divider:{flexDirection:"row",alignItems:"center",gap:10,marginTop:8,marginBottom:2},
  dividerLine:{flex:1,height:1,backgroundColor:"#CAE0D5"},
  outlineButton:{minHeight:51,borderWidth:1,borderColor:"#C6DECF",
    backgroundColor:"rgba(255,255,255,.50)",alignItems:"center",justifyContent:"center",
    borderRadius:14},
  outlineText:{fontSize:13,fontWeight:"800",color:"#19493B"},
  createRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",marginTop:7},
  createButton:{borderWidth:1,borderColor:"#9DC9B4",borderRadius:18,minHeight:56,
    flexDirection:"row",alignItems:"center",justifyContent:"center",gap:11,
    backgroundColor:"rgba(255,255,255,.36)"},
  createLink:{fontSize:15,fontWeight:"800",color:"#075B44"},
  disabled:{opacity:0.55},
});
