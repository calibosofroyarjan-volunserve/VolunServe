/**
 * Selectively adapted from origin/fix/email-verification-validation-20261104.
 * Enabled only by EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true; production profile schema retained.
 */
import {Feather} from "@expo/vector-icons";
import GoogleBrandMark from "./GoogleBrandMark";
import BirthdateCalendar from "./BirthdateCalendar";
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
  getUserProfile,
} from "../../lib/firebaseAuth";
import {getRegistrationEmailError} from "../../lib/registrationEmailPolicy";
import {communitySocialRequest} from "../../lib/communitySocial";
import { userFacingError } from "../../lib/userFacingError";
import { googleSignInErrorMessage } from "../../lib/googleSignInFeedback";
import {
  REGISTRATION_EMAIL_CONFLICT_MESSAGE,
  EMAIL_VERIFICATION_INSTRUCTIONS,
  EMAIL_VERIFICATION_PENDING_MESSAGE,
  EMAIL_VERIFICATION_REQUESTED_MESSAGE,
} from "../../lib/signupMessages";

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

function passwordError(value: string): string | null {
  if (!value) return "Create your VolunServe password.";
  if (
    value.length < 8 || !/[A-Z]/.test(value) ||
    !/[a-z]/.test(value) || !/\d/.test(value) ||
    !/[^A-Za-z0-9]/.test(value)
  ) {
    return "Use 8+ characters with uppercase, lowercase, a number and a symbol.";
  }
  return null;
}

function validName(s: string) {
  return /^[A-Za-z][A-Za-z '-]*[A-Za-z]$/.test(s.trim()) &&
    s.trim().replace(/[^A-Za-z]/g, "").length >= 2;
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


type SignupDropdownProps = {
  label: string;
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (value: string) => void;
  expanded: boolean;
  onToggle: () => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
  searchable?: boolean;
  icon?: "map-pin" | "briefcase" | "layers";
};

/**
 * One accessible boxed selector used by all Step 4 fields.
 * Options open immediately below the field and update React state on tap,
 * without relying on browser-native Picker styling or form submission.
 */
function SignupDropdown({
  label, value, options, placeholder, onChange, expanded, onToggle,
  required = false, disabled = false, error, hint, searchable = false, icon = "layers",
}: SignupDropdownProps) {
  const [search, setSearch] = useState("");
  const filtered = searchable && search.trim()
    ? options.filter(option => option.toLowerCase().includes(search.trim().toLowerCase()))
    : options;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.dropdownRequired}> *</Text>}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label + " dropdown. " + (value || placeholder)}
        accessibilityState={{ expanded: expanded && !disabled, disabled }}
        disabled={disabled}
        onPress={() => { setSearch(""); onToggle(); }}
        style={[
          styles.dropdownTrigger,
          expanded && styles.dropdownTriggerExpanded,
          !!error && styles.dropdownTriggerError,
          disabled && styles.dropdownTriggerDisabled,
        ]}
      >
        <Feather name={icon} size={17} color={disabled ? "#94a3b8" : "#64748b"} />
        <Text numberOfLines={1} style={[
          styles.dropdownSelectedText,
          !value && styles.dropdownPlaceholderText,
          disabled && styles.dropdownDisabledText,
        ]}>{value || placeholder}</Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={19}
          color={disabled ? "#94a3b8" : "#475569"} />
      </Pressable>
      {expanded && !disabled && (
        <View style={styles.dropdownPanel}>
          {searchable && (
            <View style={styles.dropdownSearchShell}>
              <Feather name="search" size={16} color="#64748b" />
              <TextInput
                accessibilityLabel={"Search " + label}
                value={search}
                onChangeText={setSearch}
                placeholder={"Search " + label.toLowerCase() + "..."}
                placeholderTextColor="#94a3b8"
                autoCorrect={false}
                style={styles.dropdownSearchInput}
              />
            </View>
          )}
          <ScrollView
            style={styles.dropdownOptionsScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
          >
            {filtered.length ? filtered.map(option => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={"Select " + option}
                accessibilityState={{ selected: option === value }}
                style={[styles.dropdownOption, option === value && styles.dropdownOptionSelected]}
                onPress={() => { setSearch(""); onChange(option); }}
              >
                <Text style={[
                  styles.dropdownOptionText,
                  option === value && styles.dropdownOptionTextSelected,
                ]}>{option}</Text>
                {option === value && <Feather name="check" size={16} color="#047857" />}
              </Pressable>
            )) : (
              <Text style={styles.dropdownNoResults}>No matching {label.toLowerCase()} found.</Text>
            )}
          </ScrollView>
        </View>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text style={styles.fieldHint}>{hint}</Text>}
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
  const [directoryConsent, setDirectoryConsent] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [noMiddleName, setNoMiddleName] = useState(false);
  const [lastName, setLastName] = useState("");
  const [birth, setBirth] = useState("");
  const [barangay, setBarangay] = useState("");
  const [occupation, setOccupation] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [expandedDropdown, setExpandedDropdown] = useState<"barangay" | "occupation" | "specialization" | null>(null);
  const [occupationOther, setOccupationOther] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const age = useMemo(() => dateAge(birth), [birth]);
  const emailErr = getRegistrationEmailError(email);
  // Show a red message immediately for a complete disallowed address, instead
  // of showing a neutral "valid format" hint or waiting for form submission.
  const completedEmailInput = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim());
  const passwordErr = passwordError(password);
  const needsSpecialization = (SPECIALIZATIONS[occupation] || []).length > 0;
  // A Google user may already have a password from an older incomplete
  // signup. That must NEVER force a new link or skip explicit consent.
  const googleSignupSession = !!signedInUser &&
    signedInUser.providerData.some(p => p.providerId === "google.com");
  const emailCanEdit = !signedInUser;
  const personalOk = validName(firstName) && validName(lastName) &&
    (noMiddleName || middleName.trim() === "" || validName(middleName)) &&
    age !== null && age >= 18 && age <= 100;
  const addressOk = SJDM_BARANGAYS.includes(barangay) &&
    !!occupation &&
    (!needsSpecialization || !!specialization) &&
    (occupation !== "Other (Specify)" || occupationOther.trim().length >= 2) &&
    reviewed;

  const showRegistrationState = useCallback(({user, profileExists}: {user: User; profileExists: boolean}) => {
    setSignedInUser(user);
    setEmail((user.email || "").toLowerCase());
    setCompletedProfile(profileExists && user.emailVerified);
    // Google already proves inbox ownership. Do not request or link a second
    // password during Signup; all verified accounts must finish personal fields.
    setStep(user.emailVerified ? 3 : 2);
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      const revision = ++authRevision.current;
      const isCurrent = () => active && authRevision.current === revision && auth.currentUser?.uid === user?.uid;
      if (lastUid.current !== (user?.uid ?? null)) {
        setFirstName(""); setMiddleName(""); setNoMiddleName(false); setLastName("");
        setBirth(""); setBarangay(""); setOccupation("");
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
    if (googleSignupSession) {
      setStep(3);
      setError("Continue with your personal details. Google signup does not require linking a VolunServe password.");
      return;
    }
    if (resumeMode ? !email.trim() : !!emailErr) return;
    // Existing accounts may have older passwords; only new credentials
    // must pass the current complexity policy.
    if (resumeMode ? !password.trim() : !!passwordErr) return;
    if (!resumeMode && password !== confirmPassword) return;
    if (!resumeMode && !consent) return;
    if (busy) return;
    setBusy(true);
    try {
      {
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
              setMessage(EMAIL_VERIFICATION_REQUESTED_MESSAGE);
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
      const state = await inspectSignupUser(user);
      showRegistrationState(state);
      if (!user.emailVerified) setMessage("Verify your Google email to continue registration.");
      else if (!state.profileExists) setMessage(
        user.providerData.some(p => p.providerId === "password")
          ? "Google email verified. Complete your resident details."
          : "Google verified. Complete Personal Details and Address & Profile; no password linking is needed."
      );
    } catch (e) {
      const code = (e as {code?: unknown} | null)?.code;
      if (code === "auth/account-exists-with-different-credential") {
        setError("This email already has a VolunServe account. Return to Login and use its original sign-in method. Signup does not link accounts or create a second UID.");
      } else {
        setError(googleSignInErrorMessage(e));
      }
    } finally { setBusy(false); }
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
      setMessage(state.profileExists ? "Email verified. Continue to Login." : "Email verified! Continue your registration.");
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
      setStep(3);
      setError("Agree to the Terms and Privacy Notice before completing registration.");
      return;
    }
    if (!personalOk) {
      setStep(3);
      setError("Complete your name and date of birth.");
      return;
    }
    if (!addressOk) {
      setError("Choose your SJDM barangay and occupation, then confirm your details.");
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
      const googleSignupAccount = user.providerData.some(p => p.providerId === "google.com");
      await signUpUser({
        authProvider: googleSignupAccount ? "google" : "verified_email",
        email: (user.email || "").toLowerCase(),
        password: "", // The verified Auth UID already owns its credential.
        firstName: firstName.trim(),
        middleName: noMiddleName ? "" : middleName.trim(),
        lastName: lastName.trim(),
        age: age as number,
        dateOfBirth: birth, // Already validated YYYY-MM-DD by dateAge().
        phoneNumber: "",
        region: "Region III – Central Luzon",
        province: "Bulacan",
        city: "City of San Jose del Monte",
        barangay,
        occupationCategory: occupation,
        occupationSpecialization: specialization,
        occupationOther,
      });
      // Never navigate to an implicit Guest/pending view after only Firebase
      // Auth succeeds. Require the SAME UID to have a completed Resident
      // document before opening the Resident dashboard.
      const createdProfile = await getUserProfile(user.uid);
      if (auth.currentUser?.uid !== user.uid ||
          createdProfile.role !== "resident" ||
          String(createdProfile.email || "").trim().toLowerCase() !== (user.email || "").trim().toLowerCase()) {
        throw new Error("Resident registration could not be confirmed. Stay here and retry; you were not sent to Guest Mode.");
      }
      if(directoryConsent){
        void communitySocialRequest("/api/community/directory/preferences","POST",{directoryListed:true})
          .catch(()=>{/* Member can join later through Community Members. */});
      }
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
          <View style={[styles.legacyMainCard, width < 900 && styles.legacyMainCardMobile]}>
            <View style={styles.legacySignupHeading}>
              <Text style={styles.legacySignupEyebrow}>RESIDENT REGISTRATION  ·  STEP {step} OF 4</Text>
              <Text style={styles.legacySignupTitle}>
                {step === 1 ? "Email & Password" :
              step === 2 ? "Verify Your Email" :
              step === 3 ? "Personal Details" : "Address & Profile"}
              </Text>
              <Text style={styles.legacySignupSubtitle}>
                {step === 1
                ? "Verify your email first before completing your Basic Resident profile."
                : step === 2
                  ? "Open your verification link to continue registration."
                  : step === 3
                    ? "Tell us about yourself."
                    : "Confirm your San Jose del Monte address and profile."}
              </Text>
            </View>
            <View style={styles.legacySelectedRoleBanner}>
              <View style={styles.legacySelectedRoleCopy}>
                <Text style={styles.legacySelectedRoleLabel}>ACCOUNT LEVEL</Text>
                <Text style={styles.legacySelectedRoleName}>Basic Account</Text>
              </View>
              <View style={styles.legacyRoleChoiceBadge}>
                <Text style={styles.legacyRoleChoiceBadgeText}>No approval required</Text>
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
                        ]}>{width < 520 && label === "Address & Profile" ? "Profile" : label}</Text>
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
                <Text style={styles.sectionTitle}>Account details</Text>
                <Text style={styles.helper}>
                  {resumeMode
                    ? "Enter the original email and password you used for VolunServe. This resumes your existing account without creating another."
                    : "Use a @gmail.com or @yahoo.com email. Email verification is required, or continue with Google."}
                </Text>
                <Field
                  label="Email Address *" value={email}
                  onChange={v => {setEmail(v.trim().toLowerCase()); setError("");}}
                  placeholder="name@example.com" keyboardType="email-address"
                  disabled={!emailCanEdit}
                  error={resumeMode ? (!email.trim() ? "Enter your registration email." : null) : emailErr}
                  showError={showErrors || (!resumeMode && completedEmailInput && !!emailErr)}
                  hint={email.trim() && !emailErr
                    ? "Valid email format. Email verification is required before Resident registration."
                    : undefined}
                />
                <Field
                  label={resumeMode ? "Your VolunServe Password *" : "Create VolunServe Password *"}
                  value={password} onChange={setPassword} secret
                  placeholder={resumeMode ? "Enter your existing VolunServe password" : "At least 8 characters"}
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
                        I agree to the VolunServe Terms and Privacy Notice. My basic name and role are visible to approved signed-in members, who can message me by default; I may pause messages or block/report others. Sharing my photo and online status is optional.
                      </Text>
                    </Pressable>
                    {showErrors && !consent &&
                      <Text style={styles.error}>Agree to the Terms and Privacy Notice to continue.</Text>}
                  </>
                )}
                {checkButton(
                  resumeMode ? "Resume Registration" : "Create Account & Verify Email",
                  () => {void startEmail();}
                )}
                {!signedInUser && !resumeMode && (
                  <>
                    <Text style={styles.orText}>OR</Text>
                    {checkButton("Continue with Google", () => {void continueWithGoogle();}, true)}
                  </>
                )}
                {!googleSignupSession && (
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
                <Text style={styles.sectionTitle}>Check your inbox</Text>
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
                <Text style={styles.sectionTitle}>Your information</Text>
                <Text style={styles.helper}>
                  Verified email: {signedInUser?.email || email}. Tell us about yourself.
                </Text>
                <Field
                  label="First Name *" value={firstName}
                  onChange={setFirstName} placeholder="First name"
                  error={(showErrors || !!firstName) && !validName(firstName)
                    ? "Enter at least two valid letters." : null}
                />
                <Field
                  label="Last Name *" value={lastName}
                  onChange={setLastName} placeholder="Last name"
                  error={(showErrors || !!lastName) && !validName(lastName)
                    ? "Enter at least two valid letters." : null}
                />
                <Field
                  label="Middle Name (optional)" value={middleName}
                  onChange={setMiddleName} disabled={noMiddleName}
                  placeholder="Optional"
                  error={(showErrors || !!middleName) && !noMiddleName &&
                    !!middleName.trim() && !validName(middleName)
                    ? "Enter a valid middle name or leave blank." : null}
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
                <BirthdateCalendar
                  value={birth}
                  onChange={setBirth}
                  error={(showErrors || !!birth) && (age === null || age < 18 || age > 100)
                    ? "Select a valid birth date (ages 18–100)." : null}
                />
                {
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{checked: consent}}
                    style={styles.check}
                    onPress={() => setConsent(value => !value)}
                  >
                    <Text style={styles.checkBox}>{consent ? "☑" : "☐"}</Text>
                    <Text style={styles.checkText}>
                      I agree to the VolunServe Terms and Privacy Notice. My basic name and role appear to approved members, and I can control messaging and profile visibility.
                    </Text>
                  </Pressable>
                )}
                {showErrors && !consent &&
                  <Text style={styles.error}>Agree to the Terms and Privacy Notice to continue.</Text>}
                {checkButton("Continue to Address & Profile", () => {
                  setShowErrors(true);
                  if (!consent) {
                    setError("Please agree to the Terms and Privacy Notice first.");
                    return;
                  }
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
                <Text style={styles.sectionTitle}>Your SJDM address</Text>
                <Text style={styles.helper}>
                  Registration is for residents of the City of San Jose del Monte, Bulacan.
                </Text>
                <Text style={styles.label}>Province</Text>
                <Text style={styles.readonly}>Bulacan</Text>
                <Text style={styles.label}>City</Text>
                <Text style={styles.readonly}>City of San Jose del Monte</Text>
                <SignupDropdown
                  label="Barangay"
                  required
                  icon="map-pin"
                  value={barangay}
                  options={SJDM_BARANGAYS}
                  placeholder="Choose your barangay"
                  searchable
                  expanded={expandedDropdown === "barangay"}
                  onToggle={() => setExpandedDropdown(v => v === "barangay" ? null : "barangay")}
                  onChange={v => { setBarangay(v); setExpandedDropdown(null); setError(""); }}
                  error={showErrors && !barangay ? "Please select your SJDM barangay." : null}
                />
                <SignupDropdown
                  label="Occupation"
                  required
                  icon="briefcase"
                  value={occupation}
                  options={OCCUPATION_OPTIONS}
                  placeholder="Choose your occupation"
                  expanded={expandedDropdown === "occupation"}
                  onToggle={() => setExpandedDropdown(v => v === "occupation" ? null : "occupation")}
                  onChange={v => {
                    // Immediately reload the relevant specializations, even
                    // before the Complete Registration button is pressed.
                    setOccupation(v);
                    setSpecialization("");
                    setOccupationOther("");
                    setExpandedDropdown(null);
                    setError("");
                  }}
                  error={showErrors && !occupation ? "Please select an occupation." : null}
                />
                <SignupDropdown
                  label="Specialization"
                  required={needsSpecialization}
                  icon="layers"
                  value={specialization}
                  options={SPECIALIZATIONS[occupation] || []}
                  placeholder={!occupation
                    ? "Select occupation first"
                    : needsSpecialization
                      ? "Choose your specialization"
                      : "Not required for this occupation"}
                  disabled={!needsSpecialization}
                  expanded={expandedDropdown === "specialization" && needsSpecialization}
                  onToggle={() => setExpandedDropdown(v => v === "specialization" ? null : "specialization")}
                  onChange={v => { setSpecialization(v); setExpandedDropdown(null); setError(""); }}
                  hint={!occupation
                    ? "Choose an occupation above to see its specializations."
                    : needsSpecialization && !specialization
                      ? "Select your specialization for " + occupation + " before completing registration."
                      : !needsSpecialization ? "No specialization is required for this occupation." : undefined}
                  error={showErrors && needsSpecialization && !specialization
                    ? "Please select a specialization." : null}
                />
                {occupation === "Other (Specify)" && (
                  <Field label="Specify Occupation *" value={occupationOther}
                    onChange={setOccupationOther} placeholder="Your occupation"
                    error={(showErrors || !!occupationOther) && occupationOther.trim().length < 2
                      ? "Please specify your occupation." : null}/>
                )}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: reviewed}}
                  style={styles.check}
                  onPress={() => setReviewed(v => !v)}
                >
                  <Text style={styles.checkBox}>{reviewed ? "☑" : "☐"}</Text>
                  <Text style={styles.checkText}>
                    I confirm my name, birthday, and address are accurate.
                  </Text>
                </Pressable>
                {showErrors && !reviewed &&
                  <Text style={styles.error}>Please confirm your registration details.</Text>}
                <Pressable accessibilityRole="checkbox"
                  accessibilityState={{checked:directoryConsent}} style={styles.check}
                  onPress={()=>setDirectoryConsent(v=>!v)}>
                  <Text style={styles.checkBox}>{directoryConsent?"☑":"☐"}</Text>
                  <Text style={styles.checkText}>
                    Optional: show my profile photo to other signed-in community members. My basic name and role appear automatically; contact details and online activity stay private.
                  </Text>
                </Pressable>
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

  legacyScreen: { flex: 1, height: Platform.OS === "web" ? ("100vh" as any) : undefined, backgroundColor: "#f3f7f8" },
  legacyDesktopShell: { flex: 1, flexDirection: "row", minHeight: 0 },
  legacyPhotoPanel: { position: "relative", width: "41%", minWidth: 340, maxWidth: 720, height: "100%", justifyContent: "space-between", overflow: "hidden", backgroundColor: "#115e59" },
  legacyPhotoImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  legacyPhotoOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(2, 55, 61, 0.52)" },
  legacyPhotoTop: { paddingHorizontal: 34, paddingTop: 36, flexDirection: "column", alignItems: "flex-start", gap: 18 },
  legacySecureBadge: { borderWidth: 1, borderColor: "rgba(255,255,255,0.27)", backgroundColor: "rgba(4,74,78,0.44)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, maxWidth: 240 },
  legacySecureBadgeText: { color: "#fff", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  legacyPhotoControls: { position: "absolute", top: "48%", left: 14, right: 14, flexDirection: "row", justifyContent: "space-between" },
  legacyPhotoArrow: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", backgroundColor: "rgba(3,35,42,0.5)", alignItems: "center", justifyContent: "center" },
  legacyPhotoArrowText: { color: "#fff", fontSize: 38, lineHeight: 40, fontWeight: "300" },
  legacyPhotoCopy: { paddingHorizontal: 34, paddingBottom: 35 },
  legacyPhotoAccentLine: { width: 82, height: 4, borderRadius: 4, backgroundColor: "#2dd4bf", marginBottom: 30 },
  legacyPhotoTitle: { color: "#fff", fontSize: 39, lineHeight: 46, fontWeight: "800", marginBottom: 13 },
  legacyPhotoBody: { color: "#f0fdfa", fontSize: 15, lineHeight: 24, maxWidth: 490, fontWeight: "400" },
  legacyPhotoFooter: { marginTop: 26, flexDirection: "column", alignItems: "flex-start", gap: 15 },
  legacyPhotoLocation: { color: "#d7f7f3", fontSize: 12, fontWeight: "700" },
  legacyBrandRow: { flexDirection: "row", alignItems: "center" },
  legacyLogo: { width: 54, height: 54, marginRight: 12, backgroundColor: "#fff", borderRadius: 13 },
  legacyBrandTitle: { color: "#fff", fontSize: 27, fontWeight: "800" },
  legacyBrandSub: { color: "#e6fffb", fontSize: 13, fontWeight: "500", marginTop: 2 },
  legacyDots: { flexDirection: "row", alignItems: "center", gap: 8 },
  legacyDot: { width: 9, height: 9, borderRadius: 99 },
  legacyDotOn: { width: 28, backgroundColor: "#2dd4bf" },
  legacyDotOff: { backgroundColor: "rgba(255,255,255,0.6)" },
  legacyFormScroll: { flex: 1, backgroundColor: "#f3f7f8" },
  legacyContent: { width: "100%", maxWidth: 650, alignSelf: "center", justifyContent: "flex-start", minHeight: "100%", paddingHorizontal: 18, paddingTop: 30, paddingBottom: 30 },
  legacyContentMobile: { maxWidth: 650, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 26 },
  legacyMobileBrand: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  legacyMobileLogo: { width: 38, height: 38, borderRadius: 10, marginRight: 9 },
  legacyMobileBrandText: { color: "#115e59", fontSize: 20, fontWeight: "900" },
  legacyMainCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e0e8ec", paddingHorizontal: 30, paddingVertical: 28, shadowColor: "#64748b", shadowOpacity: 0.07, shadowRadius: 16, elevation: 2 },
  legacyMainCardMobile: { paddingHorizontal: 20, paddingVertical: 25, borderRadius: 12 },
  legacySignupHeading: { alignItems: "center", marginBottom: 17 },
  legacySignupEyebrow: { color: "#0f766e", fontSize: 10, fontWeight: "800", letterSpacing: 1.15, textAlign: "center", marginBottom: 8 },
  legacySignupTitle: { color: "#0f172a", fontSize: 27, lineHeight: 34, fontWeight: "800", textAlign: "center" },
  legacySignupSubtitle: { color: "#64748b", fontSize: 13, marginTop: 7, fontWeight: "400", textAlign: "center", lineHeight: 19, maxWidth: 440 },
  legacySelectedRoleBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#cde5e1",
    backgroundColor: "#f0fdfa",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: 16,
  },
  legacySelectedRoleCopy: { minWidth: 0 },
  legacySelectedRoleLabel: { color: "#64748b", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  legacySelectedRoleName: { color: "#115e59", fontSize: 13, fontWeight: "800", marginTop: 2 },
  legacyRoleChoiceBadge: {
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
  },
  legacyRoleChoiceBadgeText: { color: "#334155", fontSize: 10.5, fontWeight: "900" },
  legacyStepperCard: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 23,
  },
  legacyStepRow: { flexDirection: "row", alignItems: "flex-start" },
  legacyStepItem: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  legacyStepNode: { width: 60, alignItems: "center" },
  legacyStepCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#e7edf2", justifyContent: "center", alignItems: "center" },
  legacyStepCircleActive: { backgroundColor: "#0f766e" },
  legacyStepCircleText: { color: "#64748b", fontSize: 12, fontWeight: "900" },
  legacyStepCircleTextActive: { color: "#fff" },
  legacyStepLabel: { color: "#475569", fontSize: 10.5, fontWeight: "600", marginTop: 7, textAlign: "center" },
  legacyStepLabelActive: { color: "#115e59", fontWeight: "900" },
  legacyStepLine: { flex: 1, height: 2, backgroundColor: "#dbe5eb", marginHorizontal: -6, marginTop: 16, borderRadius: 999 },
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
  sectionTitle: {fontSize: 17, fontWeight: "800", color: DARK, marginBottom: 6},
  helper: {fontSize: 13, color: "#64748b", lineHeight: 20, marginBottom: 16},
  field: {marginBottom: 15},
  label: {fontSize: 13, fontWeight: "700", color: "#0f172a", marginBottom: 7},
  input: {height: 46, borderRadius: 8, borderWidth: 1, borderColor: "#cfdbe3", paddingHorizontal: 13, color: "#0f172a", backgroundColor: "#fff", fontSize: 14},
  inputError: {borderColor: RED, borderWidth: 1.5},
  disabled: {backgroundColor: "#f1f5f9"},
  readonly: {minHeight: 48, paddingHorizontal: 13, paddingVertical: 14, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 9, backgroundColor: "#f8fafc", marginBottom: 15, color: "#334155", fontSize: 14},
  error: {fontSize: 12, color: RED, fontWeight: "700", marginTop: 5, marginBottom: 6},
  fieldHint: {fontSize: 12, color: "#52525b", lineHeight: 18, marginTop: 5},
  errorBox: {padding: 13, borderRadius: 9, backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, marginBottom: 16},
  errorBoxText: {fontSize: 13, color: RED, lineHeight: 19},
  successBox: {padding: 13, borderRadius: 9, backgroundColor: PALE, borderColor: "#86efac", borderWidth: 1, marginBottom: 16},
  successText: {fontSize: 13, color: DARK, lineHeight: 19},
  button: {minHeight: 50, borderRadius: 9, backgroundColor: GREEN, marginTop: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14},
  altButton: {backgroundColor: "#fff", borderColor: GREEN, borderWidth: 1.5},
  buttonText: {color: "#fff", fontSize: 14, fontWeight: "700", textAlign: "center"},
  altText: {color: GREEN},
  googleButtonContent: {flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10},
  dim: {opacity: 0.6},
  inlineButton: {paddingVertical: 11, alignItems: "center"},
  link: {fontSize: 13, color: GREEN, fontWeight: "800"},
  orText: {textAlign: "center", color: "#64748b", marginTop: 16, fontSize: 12, fontWeight: "800"},
  check: {flexDirection: "row", alignItems: "flex-start", gap: 10, marginVertical: 11},
  checkBox: {fontSize: 20, color: GREEN},
  checkText: {flex: 1, color: "#475569", fontSize: 12.5, lineHeight: 19},
  highlight: {borderRadius: 10, backgroundColor: "#f0fdf4", padding: 14, marginBottom: 15},
  highlightText: {color: DARK, fontSize: 15, fontWeight: "800"},
  tiny: {fontSize: 11, color: "#64748b", lineHeight: 18, marginTop: 15},
  dropdownRequired: {color: "#c62828"},
  dropdownTrigger: {
    minHeight: 49, borderRadius: 9, borderWidth: 1, borderColor: "#cbd5e1",
    backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, gap: 11,
  },
  dropdownTriggerExpanded: {borderColor: "#047857", borderWidth: 1.5},
  dropdownTriggerError: {borderColor: "#dc2626", borderWidth: 1.5},
  dropdownTriggerDisabled: {backgroundColor: "#f8fafc", borderColor: "#e2e8f0"},
  dropdownSelectedText: {flex: 1, fontSize: 14, fontWeight: "500", color: "#0f172a"},
  dropdownPlaceholderText: {color: "#64748b"},
  dropdownDisabledText: {color: "#94a3b8"},
  dropdownPanel: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#fff", marginTop: 7, overflow: "hidden",
  },
  dropdownSearchShell: {
    minHeight: 44, flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 13, gap: 8,
  },
  dropdownSearchInput: {flex: 1, minHeight: 42, fontSize: 14, color: "#0f172a", paddingVertical: 0},
  dropdownOptionsScroll: {maxHeight: 226},
  dropdownOption: {
    minHeight: 45, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 11, justifyContent: "space-between",
    borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9",
  },
  dropdownOptionSelected: {backgroundColor: "#ecfdf5"},
  dropdownOptionText: {color: "#334155", fontSize: 14, flex: 1},
  dropdownOptionTextSelected: {color: "#047857", fontWeight: "700"},
  dropdownNoResults: {fontSize: 13, color: "#64748b", padding: 17},
  footer: {fontSize: 11, textAlign: "center", color: "#94a3b8", marginTop: 24, lineHeight: 16},
});
