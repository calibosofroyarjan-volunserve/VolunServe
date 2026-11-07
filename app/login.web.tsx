import { liveUi as designUi } from "../constants/volunserveLiveUi";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import GoogleBrandMark from "../components/auth/GoogleBrandMark";
import AuthFeedback from "../components/auth/AuthFeedback";
import { unifiedPasswordDestination } from "../lib/unifiedLoginRouting";
import { getLoginEmailError, getLoginEmailSuggestion } from "../lib/loginInputValidation";
import { userFacingError } from "../lib/userFacingError";
import { googleSignInErrorMessage } from "../lib/googleSignInFeedback";
import { useSignupGoogle } from "../lib/useSignupGoogle";
import PasswordResetDialog from "../components/auth/PasswordResetDialog";
import { useRouter, type Href } from "expo-router";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";
import { useEffect, useState } from "react";
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
  getUserProfile,
  homeRouteForProfile,
  isApprovedProfile,
  loginUser,
  logoutUser,
} from "../lib/firebaseAuth";

/**
 * Persist only a safe explanation across a Firebase sign-out / route remount.
 * No email addresses, tokens, UIDs or technical error payloads are stored.
 */
const GOOGLE_LOGIN_NOTICE_KEY = "volunserve.google-login-notice";

function rememberGoogleLoginNotice(message: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(GOOGLE_LOGIN_NOTICE_KEY, message); } catch { /* storage disabled */ }
}

function consumeGoogleLoginNotice(): string {
  if (typeof window === "undefined") return "";
  try {
    const message = window.sessionStorage.getItem(GOOGLE_LOGIN_NOTICE_KEY) || "";
    window.sessionStorage.removeItem(GOOGLE_LOGIN_NOTICE_KEY);
    return message;
  } catch { return ""; }
}

export default function WebLogin() {
  const router = useRouter();
  const signInGoogle = useSignupGoogle();
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
  const [googleFeedback, setGoogleFeedback] = useState("");
  const [googleProgress, setGoogleProgress] = useState("");
  useEffect(() => {
    const pending = consumeGoogleLoginNotice();
    if (pending) setGoogleFeedback(pending);
  }, []);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string }>({ type: "error", message: "" });
  const showError = (message: string) => setFeedback({ type: "error", message });
  const clearFeedback = () => setFeedback({ type: "error", message: "" });
  const [attemptedLogin, setAttemptedLogin] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const inlineEmailError = attemptedLogin || emailTouched ? getLoginEmailError(email) : null;
  const inlineEmailSuggestion = !inlineEmailError && (attemptedLogin || emailTouched)
    ? getLoginEmailSuggestion(email) : null;
  const inlinePasswordError = (attemptedLogin || passwordTouched) && !password
    ? "Enter your password." : null;

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
    setAttemptedLogin(true);
    clearFeedback();
    const emailError = getLoginEmailError(email);
    if (emailError || !password) {
      showError(emailError || "Enter your password.");
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
      let destination;
      try {
        destination = unifiedPasswordDestination(profile);
      } catch (accessError) {
        await logoutUser();
        throw accessError;
      }
      router.replace(destination as any);
    } catch (error: any) {
      showError(userFacingError(error, "Unable to sign in. Check your details and try again."));
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };
  const handleGoogleLogin = async () => {
    if (loading) return;
    clearFeedback();
    setGoogleFeedback("");
    setGoogleProgress("Opening your Google account chooser...");
    // Clear an older attempt's notice without creating a new error.
    consumeGoogleLoginNotice();
    let selectedUid: string | null = null;
    try {
      setLoading(true);
      setPendingAction("google");
      await applySessionPersistence();

      const googleUser = await signInGoogle();
      selectedUid = googleUser.uid;
      setGoogleProgress("Google account connected. Checking your VolunServe account...");

      let profile;
      try {
        profile = await getUserProfile(googleUser.uid);
      } catch (profileError: unknown) {
        if (profileError instanceof Error && profileError.message === "Profile not found.") {
          // Auth-only Google users must finish registration; preserve that session.
          setGoogleProgress("Your Google email is verified. Complete your VolunServe registration.");
          router.replace("/signup");
          return;
        }
        throw new Error(userFacingError(profileError, "We could not check your VolunServe registration. Check your connection and try again."));
      }

      // Staff access must remain password-only, regardless of approval status.
      if (profile.role === "admin" || profile.role === "superadmin") {
        throw new Error("Staff accounts must use email and password. This Google account belongs to an Admin or Super Admin; use the sign-in fields above.");
      }
      if (!isApprovedProfile(profile)) {
        if (profile.status === "rejected") {
          throw new Error("Your registration was rejected. Contact the VolunServe administrator for details.");
        }
        if (profile.status === "suspended") {
          throw new Error("This account is suspended. Contact the VolunServe administrator.");
        }
        throw new Error("This account is still pending review. You cannot sign in yet.");
      }

      setGoogleProgress("Sign-in approved. Opening your account...");
      router.replace(homeRouteForProfile(profile) as any);
    } catch (error: unknown) {
      const message = googleSignInErrorMessage(error);
      // Preserve every Google failure (including a cancelled or blocked popup)
      // across any auth-driven remount, not only a successfully selected UID.
      rememberGoogleLoginNotice(message);
      if (selectedUid && auth.currentUser?.uid === selectedUid) {
        // Authentication succeeded but VolunServe authorization failed.
        // Save feedback BEFORE sign-out: the global auth guard may remount Login.
        try {
          await logoutUser();
        } catch {
          // Keep the account blocked from protected views by existing guards.
        }
      }
      setGoogleFeedback(message);
    } finally {
      setGoogleProgress("");
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleForgotPassword = () => {
    if (loading) return;
    clearFeedback();
    setResetOpen(true);
  };

  // Shared premium shell for all roles; Google OAuth stays community-only.
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PremiumAuthShell>
        <Text style={styles.label}>Email Address</Text>
        <View style={[styles.inputBox, authCornerCut(10), focusedInput === "email" && styles.focused, !!inlineEmailError && styles.invalidInput]}>
          <Ionicons name="mail-outline" size={21} color="#194F41" />
          <TextInput style={styles.input} value={email} onChangeText={value => { setEmail(value); clearFeedback(); }}
            accessibilityLabel="Email address"
            placeholder="Email address" placeholderTextColor="#8BA0B4"
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" editable={!loading}
            returnKeyType="next" onFocus={() => setFocusedInput("email")} onBlur={() => { setFocusedInput(null); setEmailTouched(true); }} />
        </View>
        {!!inlineEmailError && <Text accessibilityRole="alert" style={styles.fieldError}>{inlineEmailError}</Text>}
        {!!inlineEmailSuggestion && <Text style={styles.fieldSuggestion}>{inlineEmailSuggestion}</Text>}
        <Text style={[styles.label, styles.passwordLabel]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10), focusedInput === "password" && styles.focused, !!inlinePasswordError && styles.invalidInput]}>
          <Ionicons name="lock-closed-outline" size={21} color="#64748B" />
          <TextInput style={styles.input} value={password} onChangeText={value => { setPassword(value); clearFeedback(); }}
            accessibilityLabel="Password"
            placeholder="Password" placeholderTextColor="#8BA0B4" secureTextEntry={!showPassword}
            autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password"
            editable={!loading} returnKeyType="done"
            onSubmitEditing={() => void handleLogin()} onFocus={() => setFocusedInput("password")}
            onBlur={() => { setFocusedInput(null); setPasswordTouched(true); }} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={loading}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#245947" />
          </TouchableOpacity>
        </View>
        {!!inlinePasswordError && <Text accessibilityRole="alert" style={styles.fieldError}>{inlinePasswordError}</Text>}
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
            title="Check your sign-in details"
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
              <Text style={styles.signInText}>Sign In</Text>
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
        {!!googleProgress && (
          <Text style={styles.googleProgress} accessibilityRole="text">{googleProgress}</Text>
        )}
        {!!googleFeedback && (
          <AuthFeedback
            title="Google sign-in could not continue"
            message={googleFeedback}
            onDismiss={() => { setGoogleFeedback(""); consumeGoogleLoginNotice(); }}
          />
        )}
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
          <Text style={styles.createLink}>Sign Up</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Request LGU Admin Access"
          onPress={() => router.push("/admin-request")}
          disabled={loading}
          style={styles.staffRequest}>
          <Text style={styles.staffRequestText}>LGU staff? <Text style={styles.staffRequestLink}>Request Admin Access</Text></Text>
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
  label: {position:"absolute",opacity:0,height:0,width:0, fontSize: designUi.type.label.fontSize, lineHeight: designUi.type.label.lineHeight, fontWeight: designUi.type.label.fontWeight,},
  passwordLabel: {, fontSize: designUi.type.label.fontSize, lineHeight: designUi.type.label.lineHeight, fontWeight: designUi.type.label.fontWeight,},
  inputBox: {minHeight:57,flexDirection:"row",alignItems:"center",paddingHorizontal:17,
    gap:12,backgroundColor:"rgba(255,255,255,.84)",borderColor:"#C8E0D2",
    borderRadius:13,borderWidth:1,marginBottom:2},
  input: {flex:1,minWidth:0,fontSize:15,paddingVertical:14,color:"#103F33"},
  focused: {borderColor:"#068064",backgroundColor:"#FFFFFF",borderWidth:2},
  invalidInput: {borderColor:"#D33434",borderWidth:2,backgroundColor:"#FFFFFF"},
  fieldError: {color:"#C62828",fontSize: designUi.type.meta.fontSize,lineHeight: designUi.type.meta.lineHeight,fontWeight: designUi.type.meta.fontWeight,marginTop:5,marginBottom:5},
  fieldSuggestion: {color:"#9A4C15",fontSize:12,lineHeight:18,fontWeight:"600",marginTop:5,marginBottom:5},
  googleProgress: {fontSize:12,color:"#075B44",fontWeight:"700",textAlign:"center",marginTop:7},
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
  staffRequest:{alignItems:"center",justifyContent:"center",minHeight:38,paddingHorizontal:10,marginTop:1},
  staffRequestText:{fontSize:12,color:"#527766"},
  staffRequestLink:{fontSize:12,fontWeight:"800",color:"#076B51"},
  disabled:{opacity:0.55},
});
