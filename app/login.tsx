import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
} from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { auth } from "../lib/firebase";
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

const SLIDES = [
  {
    image: require("../assets/images/slide1.jpg"),
    title: "San Jose del Monte\nDisaster Monitoring",
    desc: "Real-time monitoring of hazards, floods, and emergency incidents across the city.",
  },
  {
    image: require("../assets/images/slide2.jpg"),
    title: "Volunteer Coordination\nNetwork",
    desc: "Organize trained volunteers and response teams during disasters and emergencies.",
  },
  {
    image: require("../assets/images/slide3.jpg"),
    title: "Community Assistance\nPlatform",
    desc: "Residents can request help, report hazards, and coordinate disaster response.",
  },
];

export default function Login() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 820;
  const contentWidth = Math.max(0, Math.min(screenWidth - (isCompact ? 32 : 64), 1120));
  const heroWidth = isCompact ? Math.min(contentWidth, 520) : Math.round((contentWidth - 24) * 0.46);
  const heroHeight = isCompact ? 116 : 584;
  const emailInputRef = useRef<TextInput>(null);

  const mainScrollRef = useRef<ScrollView>(null);
  const heroScrollRef = useRef<ScrollView>(null);

  const scrollX = useRef(new Animated.Value(0)).current;
  const zoomAnim = useRef(new Animated.Value(1)).current;

  const [heroIndex, setHeroIndex] = useState(0);
  const heroIndexRef = useRef(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const [googleRequest, , promptGoogleAsync] = Google.useAuthRequest({
    webClientId: "233201250762-ton2r7m31pomrc42rgfjl7vb292e0var.apps.googleusercontent.com",
    androidClientId: "233201250762-d7tnic7h4q3f6ohip52a36ng22uqrvl5.apps.googleusercontent.com",
    redirectUri,
    scopes: ["openid", "profile", "email"],
  });

  useEffect(() => {
    heroIndexRef.current = heroIndex;
  }, [heroIndex]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(zoomAnim, {
          toValue: 1.08,
          duration: 7000,
          useNativeDriver: true,
        }),
        Animated.timing(zoomAnim, {
          toValue: 1,
          duration: 7000,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [zoomAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next =
        (heroIndexRef.current + 1) % SLIDES.length;

      heroScrollRef.current?.scrollTo({
        x: next * heroWidth,
        animated: true,
      });

      setHeroIndex(next);
      heroIndexRef.current = next;
    }, 5000);

    return () => clearInterval(interval);
  }, [heroWidth]);

  const goToSlide = (index: number) => {
    heroScrollRef.current?.scrollTo({
      x: index * heroWidth,
      animated: true,
    });

    setHeroIndex(index);
    heroIndexRef.current = index;
  };

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

  // One shared login form for Android, iOS and the web. Authentication logic above is unchanged.
  const loginForm = (
    <View style={[styles.loginCard, isCompact && styles.loginCardCompact]}>
      <View style={styles.loginTypeTabs} accessibilityLabel="Choose account sign-in">
        <View style={[styles.loginTypeTab, styles.loginTypeActive]}>
          <Text style={[styles.loginTypeText, styles.loginTypeTextActive]}>Resident Login</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Switch to LGU Admin Login"
          onPress={() => router.push("/admin-login" as Href)}
          style={styles.loginTypeTab}
        >
          <Text style={styles.loginTypeText}>LGU Admin Login</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.welcomeBlock}>
        <Text style={[styles.welcomeTitle, isCompact && styles.welcomeTitleCompact]}>
          Welcome back
        </Text>
        <Text style={styles.welcomeSub}>
          Sign in to your VolunServe account
        </Text>
      </View>

      <Text style={styles.inputLabel}>Email address</Text>
      <View style={[styles.inputWrapper, focused === "email" && styles.inputFocused]}>
        <Ionicons name="mail-outline" size={19} color="#718096" />
        <TextInput
          ref={emailInputRef}
          style={styles.inputField}
          placeholder="Enter your email address"
          placeholderTextColor="#94a3b8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          editable={!loading && !googleLoading}
          returnKeyType="next"
          onFocus={() => setFocused("email")}
          onBlur={() => setFocused(null)}
        />
      </View>

      <Text style={[styles.inputLabel, styles.passwordLabel]}>Password</Text>
      <View style={[styles.inputWrapper, focused === "password" && styles.inputFocused]}>
        <Ionicons name="lock-closed-outline" size={19} color="#718096" />
        <TextInput
          style={styles.inputField}
          placeholder="Enter your password"
          placeholderTextColor="#94a3b8"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="password"
          editable={!loading && !googleLoading}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          onFocus={() => setFocused("password")}
          onBlur={() => setFocused(null)}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          disabled={loading || googleLoading}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          onPress={() => setShowPassword((current) => !current)}
        >
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={20}
            color="#64748b"
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        disabled={loading || googleLoading}
        onPress={handleForgotPassword}
        style={styles.forgotPasswordButton}
      >
        <Text style={styles.forgotPasswordText}>Forgot password?</Text>
      </TouchableOpacity>

      <Pressable
        accessibilityRole="button"
        disabled={loading || googleLoading}
        style={({ pressed }) => [
          styles.primaryButton,
          (pressed || loading || googleLoading) && styles.buttonDisabled,
        ]}
        onPress={handleLogin}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <View style={styles.primaryButtonContent}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </View>
        )}
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.orText}>or continue with</Text>
        <View style={styles.divider} />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        disabled={!googleRequest || loading || googleLoading}
        style={[
          styles.googleButton,
          (!googleRequest || loading || googleLoading) && styles.buttonDisabled,
        ]}
        onPress={handleGoogleLogin}
      >
        {googleLoading ? (
          <ActivityIndicator color="#064e3b" />
        ) : (
          <>
            <Ionicons name="logo-google" size={19} color="#2563eb" />
            <Text style={styles.googleText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        disabled={loading || googleLoading}
        style={[styles.guestButton, (loading || googleLoading) && styles.buttonDisabled]}
        onPress={() => router.replace("/public")}
      >
        <Ionicons name="globe-outline" size={19} color="#176a5b" />
        <Text style={styles.guestText}>Continue as Guest</Text>
      </TouchableOpacity>

      <View style={styles.signupRow}>
        <Text style={styles.signupText}>Don't have an account?</Text>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading || googleLoading}
          onPress={() => router.push("/signup")}
        >
          <Text style={styles.signupLink}> Sign up</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.securityNote}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#287968" />
        <Text style={styles.securityText}>
          Secure access for residents and volunteers
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <View style={styles.brandText}>
          <Text style={styles.headerTitle}>VolunServe</Text>
          <Text style={styles.headerSubtitle}>Community Response Platform</Text>
        </View>
        <View style={styles.headerRight}>
          <Ionicons name="shield-checkmark" size={18} color="#0b7661" />
        </View>
      </View>

      <ScrollView
        ref={mainScrollRef}
        style={styles.mainScroll}
        contentContainerStyle={[styles.mainContent, isCompact && styles.mainContentCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, isCompact && styles.shellCompact]}>
          <View
            style={[
              styles.heroPanel,
              { width: heroWidth, height: heroHeight },
              isCompact && styles.heroPanelCompact,
            ]}
          >
            <Animated.ScrollView
              ref={heroScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: false }
              )}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / heroWidth);
                setHeroIndex(index);
                heroIndexRef.current = index;
              }}
            >
              {SLIDES.map((slide, index) => {
                const inputRange = [
                  (index - 1) * heroWidth,
                  index * heroWidth,
                  (index + 1) * heroWidth,
                ];
                const translateX = scrollX.interpolate({
                  inputRange,
                  outputRange: [-24, 0, 24],
                  extrapolate: "clamp",
                });
                return (
                  <View
                    key={index}
                    style={[styles.slide, { width: heroWidth, height: heroHeight }]}
                  >
                    <Animated.Image
                      source={slide.image}
                      resizeMode="cover"
                      style={[
                        styles.heroImage,
                        { width: heroWidth, height: heroHeight },
                        { transform: [{ translateX }, { scale: zoomAnim }] },
                      ]}
                    />
                    <LinearGradient
                      colors={["rgba(3,35,36,0.82)", "rgba(3,60,53,0.72)", "rgba(4,41,52,0.70)"]}
                      style={styles.heroGradient}
                    />
                    <View style={[styles.heroContent, isCompact && styles.heroContentCompact]}>
                      <View style={styles.systemBadge}>
                        <Ionicons name="heart-circle-outline" size={15} color="#a7f3d0" />
                        <Text style={styles.systemText}>
                          {isCompact ? "SERVING SAN JOSE DEL MONTE" : "CITY RESPONSE NETWORK"}
                        </Text>
                      </View>
                      {isCompact ? (
                        <Text style={styles.heroTitleCompact} numberOfLines={2}>
                          Together, we make a difference.
                        </Text>
                      ) : (
                        <>
                          <Text style={styles.heroTitle}>{slide.title}</Text>
                          <Text style={styles.heroText}>{slide.desc}</Text>
                          <TouchableOpacity
                            accessibilityRole="button"
                            style={styles.accessButton}
                            onPress={() => emailInputRef.current?.focus()}
                          >
                            <Text style={styles.accessText}>Access Portal</Text>
                            <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </Animated.ScrollView>
            <View style={[styles.dotsContainer, isCompact && styles.dotsContainerCompact]}>
              {SLIDES.map((_, index) => (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={`Show community slide ${index + 1}`}
                  onPress={() => goToSlide(index)}
                  style={[styles.dot, index === heroIndex && styles.dotActive]}
                />
              ))}
            </View>
          </View>

          <View style={[styles.formColumn, isCompact && styles.formColumnCompact]}>
            {loginForm}
          </View>
        </View>

        <Text style={styles.footerText}>
          VolunServe · City of San Jose del Monte, Bulacan
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8f6" },
  header: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5efeb",
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "web" ? 14 : 40,
    paddingBottom: 13,
    paddingHorizontal: 22,
  },
  headerCompact: { paddingHorizontal: 16, paddingBottom: 10 },
  headerLogo: { height: 38, width: 38, marginRight: 10 },
  brandText: { flex: 1, justifyContent: "center" },
  headerTitle: { color: "#103b34", fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  headerSubtitle: { color: "#647a74", fontSize: 10, fontWeight: "600", letterSpacing: 0.25 },
  headerRight: {
    width: 34, height: 34, backgroundColor: "#e9f6f1", borderRadius: 17,
    alignItems: "center", justifyContent: "center",
  },
  mainScroll: { flex: 1 },
  mainContent: { flexGrow: 1, paddingTop: 28, paddingBottom: 24, paddingHorizontal: 32 },
  mainContentCompact: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 20 },
  shell: {
    width: "100%", maxWidth: 1120, alignSelf: "center",
    flexDirection: "row", alignItems: "stretch", gap: 24,
  },
  shellCompact: { flexDirection: "column", alignItems: "center", gap: 12 },
  heroPanel: {
    overflow: "hidden", borderRadius: 25, backgroundColor: "#0f766e",
    shadowColor: "#164d43", shadowOpacity: 0.12, shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 }, elevation: 3,
  },
  heroPanelCompact: { borderRadius: 17, elevation: 1 },
  slide: { overflow: "hidden" },
  heroImage: { position: "absolute", left: 0, top: 0 },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroContent: {
    position: "absolute", left: 40, right: 36, top: 0, bottom: 0,
    justifyContent: "center", alignItems: "flex-start",
  },
  heroContentCompact: { left: 18, right: 18, justifyContent: "center", paddingBottom: 6 },
  systemBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.11)",
    borderColor: "rgba(255,255,255,0.22)", borderWidth: 1,
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10,
  },
  systemText: { marginLeft: 5, fontSize: 9, color: "#e7fff6", fontWeight: "800", letterSpacing: 0.7 },
  heroTitle: {
    color: "#ffffff", fontWeight: "900", fontSize: 34,
    lineHeight: 41, marginTop: 23, maxWidth: 410,
  },
  heroText: { color: "#e5f9f1", fontSize: 15, lineHeight: 24, marginTop: 14, maxWidth: 390 },
  heroTitleCompact: { color: "#ffffff", fontWeight: "800", fontSize: 21, lineHeight: 26, marginTop: 9 },
  accessButton: {
    backgroundColor: "#ffffff", borderRadius: 13, marginTop: 25,
    paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row",
    alignItems: "center", gap: 9,
  },
  accessText: { fontSize: 13, fontWeight: "800", color: "#105e50" },
  dotsContainer: {
    position: "absolute", bottom: 18, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 5,
  },
  dotsContainerCompact: { bottom: 9, alignSelf: "flex-end", right: 16 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.47)" },
  dotActive: { backgroundColor: "#ffffff", width: 19 },
  formColumn: { flex: 1, minWidth: 0, justifyContent: "center" },
  formColumnCompact: { width: "100%", maxWidth: 520 },
  loginCard: {
    backgroundColor: "#ffffff", borderRadius: 23,
    borderWidth: 1, borderColor: "#e6ece9",
    paddingVertical: 30, paddingHorizontal: 32,
    shadowColor: "#1a5146", shadowOpacity: 0.08, shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  loginCardCompact: {
    borderRadius: 19, paddingHorizontal: 20, paddingVertical: 20,
    elevation: 1, shadowOpacity: 0.04,
  },
  loginTypeTabs: { flexDirection: "row", backgroundColor: "#F1F7F3", borderRadius: 12,
    padding: 4, borderWidth: 1, borderColor: "#D8E8DF", marginBottom: 23, gap: 4 },
  loginTypeTab: { flex: 1, minWidth: 0, paddingHorizontal: 6, paddingVertical: 12,
    borderRadius: 9, alignItems: "center", justifyContent: "center" },
  loginTypeActive: { backgroundColor: "#087F61" },
  loginTypeText: { fontSize: 12, fontWeight: "800", color: "#467464", textAlign: "center" },
  loginTypeTextActive: { color: "#FFFFFF" },
  welcomeBlock: { marginBottom: 17 },
  welcomeTitle: { color: "#142b31", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  welcomeTitleCompact: { fontSize: 24 },
  welcomeSub: { color: "#64748b", fontSize: 13, lineHeight: 19, marginTop: 3 },
  inputLabel: { fontSize: 12, fontWeight: "700", color: "#34434a", marginBottom: 7 },
  passwordLabel: { marginTop: 13 },
  inputWrapper: {
    minHeight: 51, paddingHorizontal: 13, borderRadius: 12,
    borderWidth: 1, borderColor: "#dae3e5", backgroundColor: "#fafcfc",
    flexDirection: "row", alignItems: "center",
  },
  inputFocused: { borderColor: "#0b8571", borderWidth: 1.5, backgroundColor: "#ffffff" },
  inputField: {
    flex: 1, minWidth: 0, marginLeft: 10, fontSize: 14, color: "#162d33",
    paddingVertical: 10,
  },
  eyeButton: { paddingVertical: 8, paddingLeft: 8 },
  forgotPasswordButton: { alignSelf: "flex-end", marginTop: 10, marginBottom: 2, paddingVertical: 3 },
  forgotPasswordText: { fontSize: 12, color: "#167b70", fontWeight: "700" },
  primaryButton: {
    minHeight: 50, backgroundColor: "#087561", borderRadius: 12,
    marginTop: 14, alignItems: "center", justifyContent: "center",
  },
  primaryButtonContent: { flexDirection: "row", alignItems: "center", gap: 9 },
  primaryButtonText: { fontSize: 15, fontWeight: "800", color: "#ffffff" },
  buttonDisabled: { opacity: 0.56 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 17 },
  divider: { flex: 1, backgroundColor: "#e0e8e5", height: 1 },
  orText: { color: "#71818a", fontSize: 11, marginHorizontal: 12 },
  googleButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    minHeight: 49, borderRadius: 12, backgroundColor: "#ffffff",
    borderWidth: 1, borderColor: "#cfddda", marginBottom: 9, gap: 10,
  },
  googleText: { fontSize: 13, color: "#23353a", fontWeight: "700" },
  guestButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    minHeight: 46, borderRadius: 12, backgroundColor: "#eef8f4",
    borderWidth: 1, borderColor: "#d4e8e0", gap: 10,
  },
  guestText: { fontSize: 13, color: "#176a5b", fontWeight: "700" },
  signupRow: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center",
    justifyContent: "center", marginTop: 16,
  },
  signupText: { color: "#64748b", fontSize: 12 },
  signupLink: { color: "#087561", fontSize: 12, fontWeight: "800" },
  securityNote: { marginTop: 17, paddingTop: 13, borderTopColor: "#e8eeeb", borderTopWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  securityText: { fontSize: 10, color: "#71818a" },
  footerText: {
    textAlign: "center", marginTop: 20, color: "#71848a", fontSize: 11,
  },
});
