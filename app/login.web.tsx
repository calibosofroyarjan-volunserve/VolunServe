import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import GoogleBrandMark from "../components/auth/GoogleBrandMark";
import AuthFeedback from "../components/auth/AuthFeedback";
import PasswordResetDialog from "../components/auth/PasswordResetDialog";
import { useRouter, type Href } from "expo-router";
import {
  browserLocalPersistence,
  browserSessionPersistence,
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
  const [resetOpen, setResetOpen] = useState(false);
  const [focusedInput, setFocusedInput] = useState<
    "email" | "password" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"login" | "google" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string }>({ type: "error", message: "" });
  const showError = (message: string) => setFeedback({ type: "error", message });
  const clearFeedback = () => setFeedback({ type: "error", message: "" });

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
    clearFeedback();
    if (!email.trim() || !password) {
      showError("Please enter your email address and password.");
      return;
    }
    try {
      setLoading(true);
      setPendingAction("login");
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
      showError(error?.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };
  const handleGoogleLogin = async () => {
    if (loading) return;
    clearFeedback();
    try {
      setLoading(true);
      setPendingAction("google");
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

      showError(error?.message || "Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleForgotPassword = () => {
    if (loading) return;
    clearFeedback();
    setResetOpen(true);
  };

  // Shared premium shell supplies the real two-route tab switcher.
  // Authentication, guarded role routing and Resident-only Google OAuth remain intact.
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PremiumAuthShell active="resident">
        <Text style={styles.label}>Email Address</Text>
        <View style={[styles.inputBox, authCornerCut(10), focusedInput === "email" && styles.focused]}>
          <Ionicons name="mail-outline" size={21} color="#194F41" />
          <TextInput style={styles.input} value={email} onChangeText={value => { setEmail(value); clearFeedback(); }}
            accessibilityLabel="Resident or volunteer email address"
            placeholder="Email address" placeholderTextColor="#8BA0B4"
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" editable={!loading}
            returnKeyType="next" onFocus={() => setFocusedInput("email")} onBlur={() => setFocusedInput(null)} />
        </View>
        <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10), focusedInput === "password" && styles.focused]}>
          <Ionicons name="lock-closed-outline" size={21} color="#64748B" />
          <TextInput style={styles.input} value={password} onChangeText={value => { setPassword(value); clearFeedback(); }}
            accessibilityLabel="Resident or volunteer password"
            placeholder="Password" placeholderTextColor="#8BA0B4" secureTextEntry={!showPassword}
            autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password"
            editable={!loading} returnKeyType="done"
            onSubmitEditing={() => void handleLogin()} onFocus={() => setFocusedInput("password")}
            onBlur={() => setFocusedInput(null)} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={loading}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#245947" />
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
          <TouchableOpacity accessibilityRole="button" onPress={handleForgotPassword}
            disabled={loading}>
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
          disabled={loading}
          style={({ pressed }) => [styles.signIn,
            (pressed || loading) && styles.disabled]}>
          <LinearGradient colors={["#16A780", "#00573F"]} start={{x:0,y:0}} end={{x:1,y:1}}
            style={StyleSheet.absoluteFillObject} pointerEvents="none"/>
          {pendingAction === "login" ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.signInText}>Signing in...</Text>
            </View>
          ) : (
            <View style={styles.centerRow}>
              <Text style={styles.signInText}>Login as Resident / Volunteer</Text>
              <Ionicons name="arrow-forward-outline" size={21} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.muted}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => void handleGoogleLogin()}
          disabled={loading}
          style={[styles.outlineButton,
            (loading) && styles.disabled]}>
          {pendingAction === "google" ? (
            <View style={styles.centerRow}>
              <ActivityIndicator color="#087F66" />
              <Text style={styles.outlineText}>Connecting to Google...</Text>
            </View>
          ) : (
            <View style={styles.centerRow}>
              <GoogleBrandMark size={21} />
              <Text style={styles.outlineText}>Continue with Google</Text>
            </View>
          )}
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
          <Text style={styles.muted}>Don't have an account?</Text>
        </View>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Create a resident or volunteer account"
          onPress={() => router.push("/signup")}
          disabled={loading}
          style={styles.createButton}>
          <Ionicons name="person-add-outline" color="#08785D" size={19} />
          <Text style={styles.createLink}>Create An Account</Text>
        </TouchableOpacity>
      </PremiumAuthShell>
      <PasswordResetDialog
        visible={resetOpen}
        initialEmail={email}
        onClose={() => setResetOpen(false)}
      />
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
