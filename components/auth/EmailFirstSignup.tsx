/**
 * Selectively adapted from origin/fix/email-verification-validation-20261104.
 * Enabled only by EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true; production profile schema retained.
 */
import {Picker} from "@react-native-picker/picker";
import {Feather} from "@expo/vector-icons";
import GoogleBrandMark from "./GoogleBrandMark";
import {useRouter} from "expo-router";
import {
  getIdToken,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import {SJDM_BARANGAYS} from "../../constants/sjdmBarangays";
import {OCCUPATION_OPTIONS, SPECIALIZATIONS} from "../../constants/occupationOptions";
import {auth} from "../../lib/firebase";
import {
  signUpUser,
} from "../../lib/firebaseAuth";
import {getRegistrationEmailError} from "../../lib/registrationEmailPolicy";
import {getResidentRegistrationFieldErrors} from "../../lib/requireCompleteResidentRegistration";
import { userFacingError } from "../../lib/userFacingError";
import {
  REGISTRATION_EMAIL_CONFLICT_MESSAGE,
  EMAIL_VERIFICATION_INSTRUCTIONS,
  EMAIL_VERIFICATION_PENDING_MESSAGE,
  EMAIL_VERIFICATION_REQUESTED_MESSAGE,
} from "../../lib/signupMessages";

import {linkEmailFirstGooglePassword} from "../../lib/emailFirstSignupAuth";
import {useSignupGoogle} from "../../lib/useSignupGoogle";

import {authenticateEmailSignup, inspectSignupUser} from "../../lib/signupRegistration";

type Step = 1 | 2 | 3 | 4;
const STEP_LABELS = ["Email", "Verify", "Personal", "Address & Profile"] as const;
const PHOTO_SLIDES = [
  {
    image: require("../../assets/images/slide1.jpg"),
    title: "Join. Help. Rebuild.",
    body: "Be part of a stronger, safer, and more prepared city through volunteerism and community action.",
  },
  {
    image: require("../../assets/images/slide2.jpg"),
    title: "Respond Together.",
    body: "Connect residents, volunteers, and local responders when communities need help most.",
  },
  {
    image: require("../../assets/images/slide3.jpg"),
    title: "Stronger Communities.",
    body: "Support verified local programs and help San Jose del Monte recover and rebuild.",
  },
];
const DARK = "#064e3b";
const GREEN = "#047857";
const RED = "#b91c1c";
const PALE = "#f0fdf4";

function passwordError(value: string, emailAddress = ""): string | null {
  if (!value) return "Create your VolunServe password.";
  if (value.length < 8) return "Use at least 8 characters.";
  if (value.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) ||
      !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return "Include uppercase, lowercase, a number and a symbol.";
  }
  const localPart = emailAddress.trim().split("@")[0]?.toLowerCase() || "";
  if (localPart.length >= 4 && value.toLowerCase().includes(localPart)) {
    return "Avoid using your email name in your password.";
  }
  if (/(?:password|qwerty|12345678|volunserve|admin123)/i.test(value)) {
    return "Choose a less predictable password; avoid common words and patterns.";
  }
  return null;
}

function validName(s: string) {
  return /^[\p{L}][\p{L}\s'-]*[\p{L}]$/u.test(s.trim()) &&
    (s.trim().match(/\p{L}/gu) || []).length >= 2;
}
function validMiddleName(s: string) {
  const clean = s.trim();
  return !clean || (
    /^[\p{L}][\p{L}\s.'-]*$/u.test(clean) &&
    (clean.match(/\p{L}/gu) || []).length >= 1
  );
}
function dateAge(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  if (
    parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  if (
    today.getMonth() + 1 < m ||
    (today.getMonth() + 1 === m && today.getDate() < d)
  ) age--;
  return age;
}

function safeAuthError(error: unknown): string {
  const code = (error as {code?: string} | null)?.code || "";
  if (code === "auth/email-already-in-use") return REGISTRATION_EMAIL_CONFLICT_MESSAGE;
  if (code === "auth/too-many-requests") return "Too many requests. Please try again later.";
  if (code === "auth/network-request-failed") return "No connection. Check your internet and try again.";
  if (code === "auth/requires-recent-login") return "Sign in with Google again to securely link your VolunServe password.";
  if (code === "auth/weak-password") return "Please choose a stronger VolunServe password.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password. If you started registration, check your details and try Resume Registration.";
  }
  return userFacingError(error, "Unable to complete this registration step. Check your details and try again.");
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  // Submit displays required-field feedback; blur also reveals untouched empty fields.
  showError?: boolean;
  hint?: string;
  secret?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  disabled?: boolean;
};
function Field({
  label, value, onChange, placeholder, error, showError = false, hint, secret,
  keyboardType = "default", disabled,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const visibleError = !!error && (showError || touched || value.length > 0);
  const low = label.toLowerCase();
  const icon = low.includes("email") ? "mail"
    : low.includes("password") ? "lock"
    : low.includes("phone") || low.includes("mobile") ? "phone"
    : low.includes("birth") ? "calendar"
    : low.includes("name") ? "user"
    : "edit-3";
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {(label.endsWith("*") ? label.slice(0, -1).trimEnd() : label)}
        {label.endsWith("*") && <Text style={{color: "#C62828"}}> *</Text>}
      </Text>
      <View style={[
        styles.legacyInputShell,
        focused && styles.legacyInputFocused,
        visibleError && styles.legacyInputInvalid,
        disabled && styles.legacyDisabledInput,
      ]}>
        <Feather name={icon as any} size={17} color="#64748b"/>
        <TextInput
          accessibilityLabel={label}
          style={[styles.legacyInputControl, styles.inputText]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          secureTextEntry={!!secret && !revealed}
          autoCapitalize={secret || keyboardType === "email-address" ? "none" : "words"}
          autoCorrect={false}
          keyboardType={keyboardType}
          autoComplete={
            low.includes("email") ? "email" :
            low.includes("first name") ? "given-name" :
            low.includes("last name") ? "family-name" :
            low.includes("phone") || low.includes("mobile") ? "tel" :
            secret ? "new-password" : "off"
          }
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTouched(true); }}
        />
        {!!secret && (
          <TouchableOpacity
            style={styles.legacyPasswordEyeButton}
            onPress={() => setRevealed(x => !x)}
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            accessibilityRole="button"
          >
            <Feather name={revealed ? "eye-off" : "eye"} size={20} color="#64748b"/>
          </TouchableOpacity>
        )}
      </View>
      {visibleError && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!visibleError && !!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

export default function EmailFirstSignup() {
  const router = useRouter();
  const signInGoogle = useSignupGoogle();
  const authRevision = useRef(0);
  const lastUid = useRef<string | null>(null);
  const {width} = useWindowDimensions();
  const [step, setStep] = useState<Step>(1);
  const [slideIndex, setSlideIndex] = useState(0);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [completedProfile, setCompletedProfile] = useState(false);
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [noMiddleName, setNoMiddleName] = useState(false);
  const [lastName, setLastName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [barangay, setBarangay] = useState("");
  const [occupation, setOccupation] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [occupationOther, setOccupationOther] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const age = useMemo(() => dateAge(birth), [birth]);
  const phoneClean = phone.replace(/\D/g, "");
  const emailErr = getRegistrationEmailError(email);
  const passwordErr = passwordError(password, email);
  const needsSpecialization = (SPECIALIZATIONS[occupation] || []).length > 0;
  const googleOnly = !!signedInUser &&
    signedInUser.providerData.some(p => p.providerId === "google.com") &&
    !signedInUser.providerData.some(p => p.providerId === "password");
  const emailCanEdit = !signedInUser;
  const registrationErrors = getResidentRegistrationFieldErrors({
    firstName, lastName, middleName: noMiddleName ? "" : middleName,
    age: age ?? -1, phoneNumber: "+63" + phoneClean,
    region: "Region III – Central Luzon", province: "Bulacan",
    city: "City of San Jose del Monte", barangay,
    occupationCategory: occupation, occupationSpecialization: specialization,
    occupationOther,
  });
  const personalOk = !["firstName","lastName","middleName","age","phoneNumber"]
    .some(field => !!registrationErrors[field as keyof typeof registrationErrors]);
  const addressOk = !["region","city","barangay","occupationCategory",
    "occupationSpecialization","occupationOther"]
    .some(field => !!registrationErrors[field as keyof typeof registrationErrors]) && reviewed;

  const showRegistrationState = useCallback(({user, profileExists}: {user: User; profileExists: boolean}) => {
    setSignedInUser(user);
    setEmail((user.email || "").toLowerCase());
    setCompletedProfile(profileExists && user.emailVerified);
    // Google already verifies mailbox ownership: skip creating a second password.
    // All providers still MUST complete Personal Details and Address & Profile.
    setStep(user.emailVerified ? 3 : 2);
  }, []);

  // Google display names can save two fields without making them immutable.
  // Never overwrite what a person has already typed.
  useEffect(() => {
    if (!signedInUser?.emailVerified ||
        !signedInUser.providerData.some(p => p.providerId === "google.com")) return;
    const name = (signedInUser.displayName || "").trim().split(/\s+/).filter(Boolean);
    if (name.length < 2) return;
    const suggestedFirst = name.slice(0, -1).filter(part =>
      (part.match(/\p{L}/gu) || []).length >= 2
    ).join(" ");
    const suggestedLast = name[name.length - 1].replace(/\.+$/, "");
    // Ignore middle initials such as "P." rather than prefill an invalid first
    // name; users can correct either suggestion before finishing registration.
    if (validName(suggestedFirst)) setFirstName(current => current || suggestedFirst);
    if (validName(suggestedLast)) setLastName(current => current || suggestedLast);
  }, [signedInUser?.uid, signedInUser?.displayName, signedInUser?.emailVerified]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      const revision = ++authRevision.current;
      const isCurrent = () => active && authRevision.current === revision && auth.currentUser?.uid === user?.uid;
      if (lastUid.current !== (user?.uid ?? null)) {
        setFirstName(""); setMiddleName(""); setNoMiddleName(false); setLastName("");
        setBirth(""); setPhone(""); setBarangay(""); setOccupation("");
        setSpecialization(""); setOccupationOther(""); setReviewed(false);
        setPassword(""); setConfirmPassword(""); setConsent(false);
        lastUid.current = user?.uid ?? null;
      }
      setCompletedProfile(false);
      setSignedInUser(user);
      if (!user) { setStep(1); setChecking(false); return; }
      try {
        const state = await inspectSignupUser(user);
        if (isCurrent()) showRegistrationState(state);
      } catch {
        if (isCurrent()) setError("Unable to load your registration. Check your connection and try again.");
      } finally {
        if (isCurrent()) setChecking(false);
      }
    });
    return () => {active = false; unsubscribe();};
  }, [showRegistrationState]);

  async function startEmail() {
    setShowErrors(true);
    setError("");
    setMessage("");
    if (emailErr) return;
    // Existing accounts may have older passwords; only new credentials
    // must pass the current complexity policy.
    if (resumeMode ? !password.trim() : !!passwordErr) return;
    if (!resumeMode && password !== confirmPassword) return;
    if (!resumeMode && !consent) return;
    if (busy) return;
    setBusy(true);
    try {
      if (googleOnly && signedInUser) {
        const current = await linkEmailFirstGooglePassword(password);
        const state = await inspectSignupUser(current);
        showRegistrationState(state);
        if (!current.emailVerified) {
          await sendEmailVerification(current);
          setMessage(EMAIL_VERIFICATION_REQUESTED_MESSAGE);
        } else setMessage("Google email verified and VolunServe password linked.");
      } else {
        if (signedInUser && !resumeMode) {
          throw new Error("A registration session is already active. Resume it or sign out first.");
        }
        const user = await authenticateEmailSignup(email, password, resumeMode, !resumeMode);
        const state = await inspectSignupUser(user);
        showRegistrationState(state);
        setShowErrors(false); setPassword(""); setConfirmPassword("");
        if (!user.emailVerified) {
          if (!resumeMode) {
            try {
              await sendEmailVerification(user);
              setMessage("Verification email sent. This is only a pending Firebase login, NOT a Guest or Basic Resident account. After verifying, finish Personal Details and Address & Profile.");
            } catch {
              setError("Your registration is saved, but verification email could not be requested. Choose Resend Verification Email or use a different address.");
            }
          } else setMessage("Registration resumed. Please verify your email to continue.");
        } else setMessage(state.profileExists ? "This account is already registered. Continue to Login." : "Welcome back. Complete your registration.");
      }
    } catch (e) {
      setError(safeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const user = await signInGoogle();
      const googleEmailError = getRegistrationEmailError(user.email || "");
      if (googleEmailError) {
        if (auth.currentUser?.uid === user.uid) await signOut(auth);
        throw new Error(googleEmailError);
      }
      const state = await inspectSignupUser(user);
      showRegistrationState(state);
      if (!user.emailVerified) setMessage("Verify your Google email to continue registration.");
      else if (!state.profileExists) setMessage(
        "Google verified! Continue with your personal details. No extra password is needed when signing in with Google."
      );
    } catch (e) {setError(safeAuthError(e));}
    finally {setBusy(false);}
  }

  async function checkVerified() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Your session expired. Choose Resume Registration.");
      const state = await inspectSignupUser(user);
      if (!user.emailVerified) {
        setError(EMAIL_VERIFICATION_PENDING_MESSAGE);
        return;
      }
      showRegistrationState(state);
      setMessage(state.profileExists ? "Email verified. Continue to Login." : "Email verified! Complete Personal Details (Step 3) and Address & Profile (Step 4) to finish your Resident registration.");
    } catch (e) { setError(safeAuthError(e)); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in using Resume Registration first.");
      const state = await inspectSignupUser(user);
      if (user.emailVerified) {
        showRegistrationState(state);
        setMessage("Your email is already verified.");
        return;
      }
      await sendEmailVerification(user);
      setMessage(EMAIL_VERIFICATION_REQUESTED_MESSAGE);
    } catch (e) { setError(safeAuthError(e)); }
    finally { setBusy(false); }
  }

  function formatBirthday(value: string) {
    // Auto-add separators so people can simply type eight date digits.
    const digits = value.replace(/\D/g, "").slice(0, 8);
    return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)]
      .filter(Boolean).join("-");
  }

  async function changeEmail() {
    // Does not delete or modify the pending Auth user; its owner may resume later.
    if (busy) return;
    setBusy(true);
    try {
      await signOut(auth);
      setCompletedProfile(false);
      setSignedInUser(null);
      setEmail(""); setPassword(""); setConfirmPassword("");
      setStep(1); setResumeMode(false); setConsent(false);
      setMessage(""); setError(""); setShowErrors(false);
    } catch (e) { setError(safeAuthError(e)); }
    finally { setBusy(false); }
  }

  async function complete() {
    setShowErrors(true);
    setError(""); setMessage("");
    if (!consent) {
      setError("Please agree to the Terms of Use and Privacy Notice to finish registration.");
      return;
    }
    if (!personalOk) {
      setStep(3);
      setError("Review the highlighted Personal Details. Each field explains what needs correcting.");
      return;
    }
    if (!addressOk) {
      setError("Review the highlighted Address & Profile fields, then confirm your details.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Session expired. Return to Email to resume registration.");
      await reload(user);
      if (!user.emailVerified) {
        setStep(2);
        throw new Error("Email verification is required before creating a Basic Resident profile.");
      }
      await getIdToken(user, true);
      const googleOnlyAccount = user.providerData.some(p => p.providerId === "google.com") &&
        !user.providerData.some(p => p.providerId === "password");
      await signUpUser({
        authProvider: googleOnlyAccount ? "google" : "verified_email",
        email: (user.email || "").toLowerCase(),
        password: "", // The verified Auth UID already owns its credential.
        firstName: firstName.trim(),
        middleName: noMiddleName ? "" : middleName.trim(),
        lastName: lastName.trim(),
        age: age as number,
        phoneNumber: "+63" + phoneClean,
        region: "Region III – Central Luzon",
        province: "Bulacan",
        city: "City of San Jose del Monte",
        barangay,
        occupationCategory: occupation,
        occupationSpecialization: specialization,
        occupationOther,
      });
      setCompletedProfile(true);
      router.replace("/(tabs)");
    } catch (e) {
      setError(safeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  const checkButton = (label: string, onPress: () => void, alt = false) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={[styles.button, alt && styles.altButton, busy && styles.dim]}
    >
      {busy ? <ActivityIndicator color={alt ? GREEN : "#fff"} /> :
        label === "Continue with Google" ? (
          <View style={styles.googleButtonContent}>
            <GoogleBrandMark size={21} />
            <Text style={[styles.buttonText, alt && styles.altText]}>{label}</Text>
          </View>
        ) : <Text style={[styles.buttonText, alt && styles.altText]}>{label}</Text>}
    </Pressable>
  );

  if (checking) return (
    <View style={[styles.screen, styles.center]}>
      <ActivityIndicator color={GREEN} size="large"/>
      <Text style={styles.subtitle}>Checking your registration...</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.legacyScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.legacyDesktopShell}>
        {width >= 900 ? (
          <View style={styles.legacyPhotoPanel}>
            <Image
              source={PHOTO_SLIDES[slideIndex].image}
              style={styles.legacyPhotoImage}
              resizeMode="cover"
            />
            <View style={styles.legacyPhotoOverlay} />

            <View style={styles.legacyPhotoTop}>
              <View style={styles.legacyBrandRow}>
                <Image
                  source={require("../../assets/images/logo.png")}
                  style={styles.legacyLogo}
                  resizeMode="contain"
                />
                <View>
                  <Text style={styles.legacyBrandTitle}>VolunServe</Text>
                  <Text style={styles.legacyBrandSub}>City Disaster Response Platform</Text>
                </View>
              </View>

              <View style={styles.legacySecureBadge}>
                <Text style={styles.legacySecureBadgeText}>🔒 Secure community registration</Text>
              </View>
            </View>

            <View style={styles.legacyPhotoControls}>
              <TouchableOpacity
                style={styles.legacyPhotoArrow}
                onPress={() =>
                  setSlideIndex((slideIndex + PHOTO_SLIDES.length - 1) % PHOTO_SLIDES.length)
                }
              >
                <Text style={styles.legacyPhotoArrowText}>‹</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.legacyPhotoArrow}
                onPress={() => setSlideIndex((slideIndex + 1) % PHOTO_SLIDES.length)}
              >
                <Text style={styles.legacyPhotoArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.legacyPhotoCopy}>
              <View style={styles.legacyPhotoAccentLine} />
              <Text style={styles.legacyPhotoTitle}>{PHOTO_SLIDES[slideIndex].title}</Text>
              <Text style={styles.legacyPhotoBody}>{PHOTO_SLIDES[slideIndex].body}</Text>

              <View style={styles.legacyPhotoFooter}>
                <View style={styles.legacyDots}>
                  {PHOTO_SLIDES.map((_, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSlideIndex(index)}
                      style={[styles.legacyDot, index === slideIndex ? styles.legacyDotOn : styles.legacyDotOff]}
                    />
                  ))}
                </View>

                <Text style={styles.legacyPhotoLocation}>
                  📍  Stronger Communities{`\n`}     Brighter Tomorrows
                </Text>
              </View>
            </View>
          </View>
        ) : null}
        <ScrollView
          style={styles.legacyFormScroll}
          contentContainerStyle={[
            styles.legacyContent,
            width < 900 && styles.legacyContentMobile,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {width < 900 && (
            <View style={styles.legacyMobileBrand}>
              <Image
                source={require("../../assets/images/logo.png")}
                style={styles.legacyMobileLogo}
                resizeMode="contain"
              />
              <Text style={styles.legacyMobileBrandText}>VolunServe</Text>
            </View>
          )}
          <View style={styles.legacyMainCard}>
            <View style={styles.legacySignupHeading}>
              <Text style={styles.legacySignupTitle}>
                {step === 1 ? "Email & Password" :
              step === 2 ? "Verify Your Email" :
              step === 3 ? "Personal Details" : "Address & Profile"}
              </Text>
              <Text style={styles.legacySignupSubtitle}>
                {step === 1
                ? "Sign up with email and password, or choose optional Google sign-in below."
                : step === 2
                  ? "Verify your inbox, then come back to continue."
                  : step === 3
                    ? "Just a few details about you."
                    : "Select your barangay and finish your Basic Resident profile."}
              </Text>
            </View>
            <View style={styles.legacySelectedRoleBanner}>
              <View style={styles.legacySelectedRoleCopy}>
                <Text style={styles.legacySelectedRoleLabel}>ACCOUNT LEVEL</Text>
                <Text style={styles.legacySelectedRoleName}>{completedProfile ? "Basic Account" : "Registration Pending"}</Text>
              </View>
              <View style={styles.legacyRoleChoiceBadge}>
                <Text style={styles.legacyRoleChoiceBadgeText}>{completedProfile ? "Active Resident" : "Not yet a Resident profile"}</Text>
              </View>
            </View>
            <View style={styles.legacyStepperCard}>
              <View style={styles.legacyStepRow}>
                {STEP_LABELS.map((label, index) => {
                  const n = index + 1;
                  return (
                    <View key={label} style={styles.legacyStepItem}>
                      <View style={styles.legacyStepNode}>
                        <View style={[
                          styles.legacyStepCircle,
                          step >= n && styles.legacyStepCircleActive,
                        ]}>
                          <Text style={[
                            styles.legacyStepCircleText,
                            step >= n && styles.legacyStepCircleTextActive,
                          ]}>{step > n ? "✓" : n}</Text>
                        </View>
                        <Text style={[
                          styles.legacyStepLabel,
                          step === n && styles.legacyStepLabelActive,
                        ]}>{label}</Text>
                      </View>
                      {n < 4 && (
                        <View style={[
                          styles.legacyStepLine,
                          step > n && styles.legacyStepLineActive,
                        ]}/>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
            {step === 1 && !completedProfile && (
              <View style={styles.legacyInfoBox}>
                <Text style={styles.legacyInfoTitle}>Basic Account registration</Text>
                <Text style={styles.legacyInfoText}>
                  {resumeMode
                    ? "Started email verification but did not finish? Enter the same email and VolunServe password to resume. A pending Firebase login is not yet a Resident or Guest account."
                    : "Enter an accessible email and a VolunServe password. We'll send a verification link before collecting your personal details."}
                </Text>
              </View>
            )}

        {!!error && <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>}
        {!!message && <View style={styles.successBox}>
          <Text style={styles.successText}>{message}</Text>
        </View>}

        {completedProfile ? (
          <View>
            <Text style={styles.sectionTitle}>Registration already completed</Text>
            <Text style={styles.helper}>This account has a VolunServe profile. Sign in to continue.</Text>
            {checkButton("Continue to Login", () => {void signOut(auth).then(() => router.replace("/login")).catch(e => setError(safeAuthError(e)));})}
          </View>
        ) : (
          <>
            {signedInUser && step !== 2 && (
              <Pressable disabled={busy} style={styles.inlineButton} onPress={() => {void changeEmail();}}>
                <Text style={styles.link}>Use a different account / Start over</Text>
              </Pressable>
            )}
            {step === 1 && (
              <View>
                <Text style={styles.sectionTitle}>Step 1 — Get Started</Text>
                <Text style={styles.helper}>
                  {resumeMode
                    ? "Use your original email and password to continue unfinished registration."
                    : "Create a password and verify your email. No Google account is required."}
                </Text>
                <Field
                  label="Email Address *" value={email}
                  onChange={v => {setEmail(v.trim().toLowerCase()); setError("");}}
                  placeholder="name@example.com" keyboardType="email-address"
                  disabled={!emailCanEdit}
                  error={resumeMode ? (!email.trim() ? "Enter your registration email." : null) : emailErr}
                  showError={showErrors}
                  hint={email.trim() && !emailErr
                    ? "Email format accepted. You must open the verification link to confirm access to this inbox."
                    : undefined}
                />
                <Field
                  label={resumeMode ? "Your VolunServe Password *" : "Create VolunServe Password *"}
                  value={password} onChange={setPassword} secret
                  placeholder={resumeMode ? "Enter your existing VolunServe password" : "At least 8 characters"}
                  hint={resumeMode ? "Use your original password." : "8–128 characters, with upper/lowercase letters, a number and a symbol."}
                  error={resumeMode
                    ? !password.trim() ? "Enter the VolunServe password you created earlier." : null
                    : passwordErr}
                  showError={showErrors}
                />
                {!resumeMode && (
                  <>
                    <Field
                      label="Confirm Password *" value={confirmPassword}
                      onChange={setConfirmPassword} secret
                      placeholder="Type the same password again"
                      error={!confirmPassword.trim()
                        ? "Confirm your password."
                        : confirmPassword !== password ? "Passwords must match." : null}
                      showError={showErrors}
                    />
                    <Pressable
                      onPress={() => setConsent(v => !v)}
                      style={styles.check}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: consent}}
                    >
                      <Text style={styles.checkBox}>{consent ? "☑" : "☐"}</Text>
                      <Text style={styles.checkText}>
                        I agree to the Terms of Use and Privacy Notice for VolunServe account registration.
                      </Text>
                    </Pressable>
                    {showErrors && !consent &&
                      <Text style={styles.error}>Agree to the Terms and Privacy Notice to continue.</Text>}
                  </>
                )}
                {checkButton(
                  googleOnly ? "Link Password & Continue" :
                    resumeMode ? "Resume Registration" : "Continue to Email Verification",
                  () => {void startEmail();}
                )}
                {!signedInUser && !resumeMode && (
                  <>
                    <Text style={styles.orText}>OR</Text>
                    <Text style={styles.helper}>Optional: continue with Google instead of creating a VolunServe password.</Text>
                    {checkButton("Continue with Google", () => {void continueWithGoogle();}, true)}
                  </>
                )}
                {!googleOnly && (
                  <Pressable style={styles.inlineButton} onPress={() => {
                    setResumeMode(v => !v);
                    setPassword(""); setConfirmPassword(""); setError(""); setShowErrors(false);
                  }}>
                    <Text style={styles.link}>
                      {resumeMode ? "New user? Create account" : "Already started? Resume Registration"}
                    </Text>
                  </Pressable>
                )}
                <Pressable style={styles.inlineButton} onPress={() => router.push("/login")}>
                  <Text style={styles.link}>Already registered? Sign In / Forgot Password</Text>
                </Pressable>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={styles.sectionTitle}>Step 2 — Verify Your Email</Text>
                <Text style={styles.helper}>Your Resident profile is not created yet. You must finish Steps 3 and 4 after verification.</Text>
                <Text style={styles.helper}>
                  Open your email and click the verification link sent to:
                </Text>
                <View style={styles.highlight}>
                  <Text style={styles.highlightText}>{signedInUser?.email || email}</Text>
                </View>
                <Text style={styles.helper}>
                  {EMAIL_VERIFICATION_INSTRUCTIONS} Check your Inbox and Spam folder.
                  After clicking the verification link, return here and choose Check Verification.
                </Text>
                {checkButton("I've Verified — Check Status", () => {void checkVerified();})}
                {checkButton("Resend Verification Email", () => {void resend();}, true)}
                <Pressable style={styles.inlineButton} onPress={() => {void changeEmail();}}>
                  <Text style={styles.link}>Use a different email / Start over</Text>
                </Pressable>
                <Text style={styles.tiny}>
                  If the address was mistyped or the inbox cannot receive mail,
                  select &quot;Use a different email / Start over.&quot; Until verified,
                  this account cannot access the Resident Dashboard or create a Basic Resident profile.
                </Text>
              </View>
            )}

            {step === 3 && (
              <View>
                <Text style={styles.sectionTitle}>Step 3 — Personal Details</Text>
                <Text style={styles.helper}>
                  Verified email: {signedInUser?.email || email}. Tell us about yourself.
                </Text>
                <Field
                  label="First Name *" value={firstName}
                  onChange={setFirstName} placeholder="First name"
                  error={(showErrors || !!firstName) ? registrationErrors.firstName : null}
                />
                <Field
                  label="Last Name *" value={lastName}
                  onChange={setLastName} placeholder="Last name"
                  error={(showErrors || !!lastName) ? registrationErrors.lastName : null}
                />
                <Field
                  label="Middle Name (optional)" value={middleName}
                  onChange={setMiddleName} disabled={noMiddleName}
                  placeholder="Optional"
                  error={(showErrors || !!middleName) && !noMiddleName ? registrationErrors.middleName : null}
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: noMiddleName}}
                  style={styles.check}
                  onPress={() => {setNoMiddleName(v => !v); setMiddleName("");}}
                >
                  <Text style={styles.checkBox}>{noMiddleName ? "☑" : "☐"}</Text>
                  <Text style={styles.checkText}>I have no middle name</Text>
                </Pressable>
                <Field
                  label="Date of Birth *" value={birth}
                  onChange={v => setBirth(formatBirthday(v))} placeholder="YYYY-MM-DD"
                  keyboardType="phone-pad"
                  hint="Type 8 digits (year, month, day). The dashes appear automatically."
                  error={(showErrors || !!birth) ? registrationErrors.age : null}
                />
                <Field
                  label="Mobile Number *" value={phone}
                  onChange={v => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="9XXXXXXXXX" keyboardType="phone-pad"
                  error={(showErrors || !!phone) ? registrationErrors.phoneNumber : null}
                />
                {checkButton("Continue to Address & Profile", () => {
                  setShowErrors(true);
                  if (!personalOk) {
                    setError("Please complete the highlighted personal information first.");
                    return;
                  }
                  setShowErrors(false); setError(""); setMessage(""); setStep(4);
                })}
              </View>
            )}

            {step === 4 && (
              <View>
                <Text style={styles.sectionTitle}>Step 4 — Address & Profile</Text>
                <Text style={styles.helper}>
                  Registration is for residents of the City of San Jose del Monte, Bulacan.
                </Text>
                <Text style={styles.label}>Province</Text>
                <Text style={styles.readonly}>Bulacan</Text>
                <Text style={styles.label}>City</Text>
                <Text style={styles.readonly}>City of San Jose del Monte</Text>
                <Text style={styles.label}>Barangay *</Text>
                <View style={[styles.pickerBox, showErrors && !!registrationErrors.barangay && styles.inputError]}>
                  <Picker
                    selectedValue={barangay}
                    onValueChange={v => setBarangay(String(v))}
                  >
                    <Picker.Item label="Choose your barangay" value=""/>
                    {SJDM_BARANGAYS.map(b =>
                      <Picker.Item key={b} label={b} value={b}/>
                    )}
                  </Picker>
                </View>
                {showErrors && registrationErrors.barangay &&
                  <Text accessibilityRole="alert" style={styles.error}>{registrationErrors.barangay}</Text>}
                <Text style={styles.label}>Occupation *</Text>
                <View style={[styles.pickerBox, showErrors && !!registrationErrors.occupationCategory && styles.inputError]}>
                  <Picker
                    selectedValue={occupation}
                    onValueChange={v => {
                      setOccupation(String(v)); setSpecialization(""); setOccupationOther("");
                    }}
                  >
                    <Picker.Item label="Choose occupation" value=""/>
                    {OCCUPATION_OPTIONS.map(o =>
                      <Picker.Item key={o} label={o} value={o}/>
                    )}
                  </Picker>
                </View>
                {showErrors && registrationErrors.occupationCategory &&
                  <Text accessibilityRole="alert" style={styles.error}>{registrationErrors.occupationCategory}</Text>}
                {needsSpecialization && (
                  <>
                    <Text style={styles.label}>Specialization *</Text>
                    <View style={[styles.pickerBox, showErrors && !!registrationErrors.occupationSpecialization && styles.inputError]}>
                      <Picker
                        selectedValue={specialization}
                        onValueChange={v => setSpecialization(String(v))}
                      >
                        <Picker.Item label="Choose specialization" value=""/>
                        {(SPECIALIZATIONS[occupation] || []).map(o =>
                          <Picker.Item key={o} label={o} value={o}/>
                        )}
                      </Picker>
                    </View>
                    {showErrors && registrationErrors.occupationSpecialization &&
                      <Text accessibilityRole="alert" style={styles.error}>{registrationErrors.occupationSpecialization}</Text>}
                  </>
                )}
                {occupation === "Other (Specify)" && (
                  <Field label="Specify Occupation *" value={occupationOther}
                    onChange={setOccupationOther} placeholder="Your occupation"
                    error={(showErrors || !!occupationOther) ? registrationErrors.occupationOther : null}/>
                )}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: reviewed}}
                  style={styles.check}
                  onPress={() => {
                    const next = !reviewed;
                    setReviewed(next);
                    // Google OAuth users did not see the password signup consent.
                    // The final confirmation explicitly obtains it instead.
                    if (!consent) setConsent(next);
                  }}
                >
                  <Text style={styles.checkBox}>{reviewed ? "☑" : "☐"}</Text>
                  <Text style={styles.checkText}>
                    {consent
                      ? "I confirm my name, birthday, contact, and address are accurate."
                      : "I confirm my details are accurate and agree to the Terms of Use and Privacy Notice."}
                  </Text>
                </Pressable>
                {showErrors && !reviewed &&
                  <Text style={styles.error}>Please confirm your registration details.</Text>}
                {checkButton("Complete Basic Resident Registration", () => {void complete();})}
                {checkButton("Back to Personal Details", () => {
                  setError(""); setShowErrors(false); setStep(3);
                }, true)}
              </View>
            )}
          </>
        )}
            <Text style={styles.footer}>
              VolunServe • Secure community registration • SJDM, Bulacan
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  legacyInputShell: { height: 46, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfdbe3", borderRadius: 8, paddingLeft: 13 },
  legacyInputFocused: { borderColor: "#0f766e", backgroundColor: "#fff" },
  legacyInputInvalid: { borderColor: "#dc2626" },
  legacyDisabledInput: { backgroundColor: "#f1f5f9", opacity: 0.85 },
  legacyInputControl: { flex: 1, height: 44, borderWidth: 0, backgroundColor: "transparent", paddingLeft: 9 },
  legacyInputIcon: { color: "#64748b", fontSize: 16, width: 25, textAlign: "center" },
  legacyPasswordEyeButton: { minWidth: 44, height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  inputText: {color: "#0f172a", fontSize: 14, paddingVertical: 0},

  legacyScreen: { flex: 1, height: Platform.OS === "web" ? ("100vh" as any) : undefined, backgroundColor: "#eef4f7" },
  legacyDesktopShell: { flex: 1, flexDirection: "row", minHeight: 0 },
  legacyPhotoPanel: { position: "relative", width: "46%", minWidth: 520, height: "100%", justifyContent: "space-between", overflow: "hidden", backgroundColor: "#115e59" },
  legacyPhotoImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  legacyPhotoOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(2, 55, 61, 0.52)" },
  legacyPhotoTop: { paddingHorizontal: 48, paddingTop: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  legacySecureBadge: { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(4,74,78,0.42)", borderRadius: 14, paddingHorizontal: 17, paddingVertical: 11, maxWidth: 205 },
  legacySecureBadgeText: { color: "#fff", fontSize: 12, lineHeight: 16, fontWeight: "800" },
  legacyPhotoControls: { position: "absolute", top: "48%", left: 28, right: 28, flexDirection: "row", justifyContent: "space-between" },
  legacyPhotoArrow: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", backgroundColor: "rgba(3,35,42,0.5)", alignItems: "center", justifyContent: "center" },
  legacyPhotoArrowText: { color: "#fff", fontSize: 38, lineHeight: 40, fontWeight: "300" },
  legacyPhotoCopy: { paddingHorizontal: 48, paddingBottom: 46 },
  legacyPhotoAccentLine: { width: 82, height: 4, borderRadius: 4, backgroundColor: "#2dd4bf", marginBottom: 30 },
  legacyPhotoTitle: { color: "#fff", fontSize: 50, lineHeight: 57, fontWeight: "900", marginBottom: 17 },
  legacyPhotoBody: { color: "#f0fdfa", fontSize: 17, lineHeight: 27, maxWidth: 570, fontWeight: "500" },
  legacyPhotoFooter: { marginTop: 38, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  legacyPhotoLocation: { color: "#d7f7f3", fontSize: 12, fontWeight: "700" },
  legacyBrandRow: { flexDirection: "row", alignItems: "center" },
  legacyLogo: { width: 62, height: 62, marginRight: 12, backgroundColor: "#fff", borderRadius: 18 },
  legacyBrandTitle: { color: "#fff", fontSize: 32, fontWeight: "900" },
  legacyBrandSub: { color: "#e6fffb", fontSize: 13, fontWeight: "500", marginTop: 2 },
  legacyDots: { flexDirection: "row", alignItems: "center", gap: 8 },
  legacyDot: { width: 9, height: 9, borderRadius: 99 },
  legacyDotOn: { width: 28, backgroundColor: "#2dd4bf" },
  legacyDotOff: { backgroundColor: "rgba(255,255,255,0.6)" },
  legacyFormScroll: { flex: 1, backgroundColor: "#eef7fb" },
  legacyContent: { width: "100%", maxWidth: 610, alignSelf: "center", justifyContent: "flex-start", minHeight: "100%", paddingHorizontal: 0, paddingTop: 54, paddingBottom: 54 },
  legacyContentMobile: { maxWidth: 610, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 30 },
  legacyMobileBrand: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  legacyMobileLogo: { width: 38, height: 38, borderRadius: 10, marginRight: 9 },
  legacyMobileBrandText: { color: "#115e59", fontSize: 20, fontWeight: "900" },
  legacyMainCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#dce6eb", paddingHorizontal: 32, paddingVertical: 34, shadowColor: "#64748b", shadowOpacity: 0.12, shadowRadius: 22, elevation: 5 },
  legacySignupHeading: { alignItems: "center", marginBottom: 22 },
  legacySignupTitle: { color: "#0f172a", fontSize: 31, lineHeight: 37, fontWeight: "900", textAlign: "center" },
  legacySignupSubtitle: { color: "#64748b", fontSize: 15, marginTop: 4, fontWeight: "500", textAlign: "center", lineHeight: 21 },
  legacySelectedRoleBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#cde5e1",
    backgroundColor: "#f0fdfa",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  legacySelectedRoleCopy: { minWidth: 0 },
  legacySelectedRoleLabel: { color: "#64748b", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  legacySelectedRoleName: { color: "#115e59", fontSize: 14, fontWeight: "900", marginTop: 2 },
  legacyRoleChoiceBadge: {
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
  },
  legacyRoleChoiceBadgeText: { color: "#334155", fontSize: 10.5, fontWeight: "900" },
  legacyStepperCard: {
    backgroundColor: "transparent",
    paddingHorizontal: 4,
    paddingVertical: 0,
    marginBottom: 28,
  },
  legacyStepRow: { flexDirection: "row", alignItems: "flex-start" },
  legacyStepItem: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  legacyStepNode: { width: 70, alignItems: "center" },
  legacyStepCircle: { width: 38, height: 38, borderRadius: 999, backgroundColor: "#e7edf2", justifyContent: "center", alignItems: "center" },
  legacyStepCircleActive: { backgroundColor: "#0f766e" },
  legacyStepCircleText: { color: "#64748b", fontSize: 12, fontWeight: "900" },
  legacyStepCircleTextActive: { color: "#fff" },
  legacyStepLabel: { color: "#334155", fontSize: 11.5, fontWeight: "700", marginTop: 7 },
  legacyStepLabelActive: { color: "#115e59", fontWeight: "900" },
  legacyStepLine: { flex: 1, height: 2, backgroundColor: "#dbe5eb", marginHorizontal: -9, marginTop: 18, borderRadius: 999 },
  legacyStepLineActive: { backgroundColor: "#0f766e" },
  legacyInfoBox: {
    backgroundColor: "#eff6ff", borderRadius: 10, borderWidth: 1,
    borderColor: "#bfdbfe", padding: 12, marginBottom: 18,
  },
  legacyInfoTitle: {color: "#0f172a", fontSize: 13, fontWeight: "800", marginBottom: 5},
  legacyInfoText: {color: "#475569", fontSize: 12, lineHeight: 18},

  screen: {flex: 1, backgroundColor: "#ecfdf5"},
  center: {justifyContent: "center", alignItems: "center", gap: 14},
  container: {flexGrow: 1, padding: 18, alignItems: "center", justifyContent: "center"},
  desktop: {flexDirection: "row", padding: 28, alignItems: "stretch"},
  side: {flex: 1, backgroundColor: DARK, borderRadius: 18, padding: 34, justifyContent: "center", maxWidth: 640},
  brand: {fontSize: 30, fontWeight: "900", color: "#fff"},
  brandSub: {fontSize: 14, fontWeight: "600", color: "#a7f3d0", marginTop: 5},
  sideTitle: {fontSize: 38, lineHeight: 44, fontWeight: "900", color: "#fff", marginTop: 56},
  sideCopy: {fontSize: 17, lineHeight: 25, color: "#d1fae5", marginTop: 18},
  sideNote: {borderRadius: 12, backgroundColor: "#065f46", padding: 18, marginTop: 28},
  sideNoteText: {color: "#fff", lineHeight: 22},
  card: {width: "100%", maxWidth: 620, backgroundColor: "#fff", borderRadius: 18, padding: 26, alignSelf: "center", marginVertical: 12},
  mobileBrand: {fontSize: 22, color: GREEN, fontWeight: "900", marginBottom: 15},
  title: {fontSize: 25, fontWeight: "900", color: DARK, textAlign: "center"},
  subtitle: {fontSize: 14, textAlign: "center", color: "#64748b", marginTop: 8, marginBottom: 20},
  steps: {flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginVertical: 20},
  stepItem: {flex: 1, alignItems: "center"},
  stepNum: {width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#e2e8f0"},
  stepNumActive: {backgroundColor: GREEN},
  stepNumText: {fontSize: 13, fontWeight: "800", color: "#475569"},
  stepNumTextActive: {color: "#fff"},
  stepName: {fontSize: 11, marginTop: 8, textAlign: "center", color: "#64748b"},
  stepNameActive: {fontWeight: "800", color: DARK},
  sectionTitle: {fontSize: 20, fontWeight: "800", color: DARK, marginBottom: 8},
  helper: {fontSize: 13, color: "#475569", lineHeight: 20, marginBottom: 16},
  field: {marginBottom: 16},
  label: {fontSize: 12.5, fontWeight: "800", color: "#0f172a", marginBottom: 7},
  input: {height: 46, borderRadius: 8, borderWidth: 1, borderColor: "#cfdbe3", paddingHorizontal: 13, color: "#0f172a", backgroundColor: "#fff", fontSize: 14},
  inputError: {borderColor: RED, borderWidth: 1.5},
  disabled: {backgroundColor: "#f1f5f9"},
  readonly: {padding: 12, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, backgroundColor: "#f8fafc", marginBottom: 15, color: "#334155"},
  error: {fontSize: 12, color: RED, fontWeight: "700", marginTop: 5, marginBottom: 6},
  fieldHint: {fontSize: 12, color: "#52525b", lineHeight: 18, marginTop: 5},
  errorBox: {padding: 13, borderRadius: 9, backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, marginBottom: 16},
  errorBoxText: {fontSize: 13, color: RED, lineHeight: 19},
  successBox: {padding: 13, borderRadius: 9, backgroundColor: PALE, borderColor: "#86efac", borderWidth: 1, marginBottom: 16},
  successText: {fontSize: 13, color: DARK, lineHeight: 19},
  button: {minHeight: 49, borderRadius: 10, backgroundColor: GREEN, marginTop: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 14},
  altButton: {backgroundColor: "#fff", borderColor: GREEN, borderWidth: 1.5},
  buttonText: {color: "#fff", fontSize: 14, fontWeight: "800", textAlign: "center"},
  altText: {color: GREEN},
  googleButtonContent: {flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10},
  dim: {opacity: 0.6},
  inlineButton: {paddingVertical: 11, alignItems: "center"},
  link: {fontSize: 13, color: GREEN, fontWeight: "800"},
  orText: {textAlign: "center", color: "#64748b", marginTop: 16, fontSize: 12, fontWeight: "800"},
  check: {flexDirection: "row", alignItems: "flex-start", gap: 8, marginVertical: 9},
  checkBox: {fontSize: 20, color: GREEN},
  checkText: {flex: 1, color: "#475569", fontSize: 13, lineHeight: 20},
  highlight: {borderRadius: 10, backgroundColor: "#f0fdf4", padding: 14, marginBottom: 15},
  highlightText: {color: DARK, fontSize: 15, fontWeight: "800"},
  tiny: {fontSize: 11, color: "#64748b", lineHeight: 18, marginTop: 15},
  pickerBox: {borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", marginBottom: 13, overflow: "hidden"},
  footer: {fontSize: 11, textAlign: "center", color: "#94a3b8", marginTop: 35},
});
