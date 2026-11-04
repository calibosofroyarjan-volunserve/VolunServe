/**
 * Staging rollout: verify ownership BEFORE asking for personal information.
 * Four steps: Email & Password -> Verify -> Personal -> Address & Profile.
 * Only a verified Firebase Auth UID may create the Basic Resident profile.
 *
 * Production signup continues to use the legacy screen until staging E2E
 * passes and this workflow is deliberately promoted.
 */
import {Picker} from "@react-native-picker/picker";
import {useRouter} from "expo-router";
import {
  createUserWithEmailAndPassword,
  getIdToken,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import React, {useEffect, useMemo, useState} from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import {SJDM_BARANGAYS} from "../../constants/sjdmBarangays";
import {OCCUPATION_OPTIONS, SPECIALIZATIONS} from "../../constants/occupationOptions";
import {auth, db} from "../../lib/firebase";
import {
  setVolunServePasswordForCurrentGoogleUser,
  signUpUser,
} from "../../lib/firebaseAuth";
import {getRegistrationEmailError} from "../../lib/registrationEmailPolicy";
import {REGISTRATION_EMAIL_CONFLICT_MESSAGE} from "../../lib/authUserMessages";

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
  if (code === "auth/weak-password") return "Please choose a stronger VolunServe password.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password. If you started registration, check your details and try Resume Registration.";
  }
  const message = String((error as {message?: string} | null)?.message || "");
  if (
    message.length < 260 &&
    message &&
    !/firebase|auth\/|firestore|permission-denied|\[[^\]]+\]|Error \(/i.test(message)
  ) return message;
  return "Unable to complete this action. Check your details and try again.";
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  secret?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  disabled?: boolean;
};
function Field({
  label, value, onChange, placeholder, error, secret,
  keyboardType = "default", disabled,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, !!error && styles.inputError, disabled && styles.disabled]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        secureTextEntry={!!secret}
        autoCapitalize={secret || keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
        keyboardType={keyboardType}
        editable={!disabled}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export default function EmailFirstSignup() {
  const router = useRouter();
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
  const passwordErr = passwordError(password);
  const needsSpecialization = (SPECIALIZATIONS[occupation] || []).length > 0;
  const googleOnly = !!signedInUser &&
    signedInUser.providerData.some(p => p.providerId === "google.com") &&
    !signedInUser.providerData.some(p => p.providerId === "password");
  const emailCanEdit = !signedInUser;
  const personalOk = validName(firstName) && validName(lastName) &&
    (noMiddleName || middleName.trim() === "" || validName(middleName)) &&
    age !== null && age >= 18 && age <= 100 &&
    /^9\d{9}$/.test(phoneClean);
  const addressOk = SJDM_BARANGAYS.includes(barangay) &&
    !!occupation &&
    (!needsSpecialization || !!specialization) &&
    (occupation !== "Other (Specify)" || occupationOther.trim().length >= 2) &&
    reviewed;

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setSignedInUser(user);
      if (!user) {
        setStep(1);
        setChecking(false);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (!active) return;
        if (snapshot.exists()) {
          setCompletedProfile(true);
          setChecking(false);
          return;
        }
        const value = (user.email || "").toLowerCase();
        setEmail(value);
        await reload(user);
        if (!active) return;
        if (user.emailVerified) {
          await getIdToken(user, true);
          if (!active) return;
          setStep(
            user.providerData.some(p => p.providerId === "google.com") &&
            !user.providerData.some(p => p.providerId === "password")
              ? 1 : 3
          );
        } else {
          setStep(2);
        }
      } catch {
        if (active) {
          setError("Unable to load your registration. Check your connection and try again.");
        }
      } finally {
        if (active) setChecking(false);
      }
    });
    return () => {active = false; unsubscribe();};
  }, []);

  async function startEmail() {
    setShowErrors(true);
    setError("");
    setMessage("");
    if (emailErr) return;
    if (passwordErr) return;
    if (!resumeMode && password !== confirmPassword) return;
    if (!resumeMode && !consent) return;
    if (busy) return;
    setBusy(true);
    try {
      if (googleOnly && signedInUser) {
        await setVolunServePasswordForCurrentGoogleUser(password);
        const current = auth.currentUser;
        if (!current) throw new Error("Your Google session expired. Sign in again.");
        await reload(current);
        if (!current.emailVerified) throw new Error("Verify the email linked to your Google account.");
        await getIdToken(current, true);
        setStep(3);
        setMessage("Google email verified and VolunServe password linked.");
      } else if (resumeMode) {
        const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        const snapshot = await getDoc(doc(db, "users", credential.user.uid));
        if (snapshot.exists()) {
          setCompletedProfile(true);
          return;
        }
        await reload(credential.user);
        if (credential.user.emailVerified) {
          await getIdToken(credential.user, true);
          setStep(3);
          setMessage("Welcome back. Complete your registration.");
        } else {
          setStep(2);
          setMessage("Registration resumed. Please verify your email to continue.");
        }
      } else if (signedInUser) {
        throw new Error("A registration session is already active. Resume it or sign out first.");
      } else {
        // Firebase Auth account is created first; NO personal profile yet.
        const credential = await createUserWithEmailAndPassword(
          auth, email.trim().toLowerCase(), password
        );
        setStep(2);
        setShowErrors(false);
        setPassword("");
        setConfirmPassword("");
        try {
          await sendEmailVerification(credential.user);
          setMessage("Verification link sent. Check your inbox and Spam folder.");
        } catch {
          setError("Account created, but the verification email could not be sent. Choose Resend Email below.");
        }
      }
    } catch (e) {
      setError(safeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    if (Platform.OS !== "web") {
      // The native login screen owns its Expo Google AuthSession flow.
      router.push("/login");
      return;
    }
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (!result.user.emailVerified) {
        throw new Error("The connected Google account has not verified its email.");
      }
      const snapshot = await getDoc(doc(db, "users", result.user.uid));
      if (snapshot.exists()) {
        setCompletedProfile(true);
        return;
      }
      setSignedInUser(result.user);
      setEmail((result.user.email || "").toLowerCase());
      const hasPassword = result.user.providerData.some(p => p.providerId === "password");
      if (hasPassword) {
        await getIdToken(result.user, true);
        setStep(3);
        setMessage("Google email verified. Complete your resident details.");
      } else {
        setStep(1);
        setMessage("Google email verified. Create a VolunServe password to use both sign-in methods.");
      }
    } catch (e) {setError(safeAuthError(e));}
    finally {setBusy(false);}
  }

  async function checkVerified() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Your session expired. Choose Resume Registration.");
      await reload(user);
      if (!user.emailVerified) {
        setError("Email is not verified yet. Open the link in your inbox, then press Check Verification again.");
        return;
      }
      await getIdToken(user, true);
      setSignedInUser(user);
      setStep(3);
      setMessage("Email verified! Now enter your personal information.");
    } catch (e) { setError(safeAuthError(e)); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in using Resume Registration first.");
      await reload(user);
      if (user.emailVerified) {
        await getIdToken(user, true);
        setStep(3);
        setMessage("Your email is already verified.");
        return;
      }
      await sendEmailVerification(user);
      setMessage("Another verification email was sent. Check Inbox and Spam.");
    } catch (e) { setError(safeAuthError(e)); }
    finally { setBusy(false); }
  }

  async function changeEmail() {
    // Does not delete or modify the pending Auth user; its owner may resume later.
    if (busy) return;
    setBusy(true);
    try {
      await signOut(auth);
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
    if (!personalOk) {
      setStep(3);
      setError("Complete your name, date of birth, and Philippine mobile number.");
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
      await signUpUser({
        authProvider: "verified_email",
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
    } catch  return (
    <KeyboardAvoidingView style={styles.legacyScreen} behavior={undefined}>
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
          </View
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
                  Enter an accessible email and a VolunServe password.
                  We'll send a verification link before collecting your personal details.
                </Text>
              </View>
            )}

es.subtitle}>Easy, secure registration — four short steps.</Text>
        <View style={styles.steps}>
          {STEP_LABELS.map((label, index) => (
            <View key={label} style={styles.stepItem}>
              <View style={[
                styles.stepNum, step >= index + 1 && styles.stepNumActive,
              ]}>
                <Text style={[
                  styles.stepNumText, step >= index + 1 && styles.stepNumTextActive,
                ]}>{step > index + 1 ? "✓" : index + 1}</Text>
              </View>
              <Text style={[
                styles.stepName, step === index + 1 && styles.stepNameActive,
              ]}>{label}</Text>
            </View>
          ))}
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
            {checkButton("Continue to Login", () => router.replace("/login"))}
          </View>
        ) : (
          <>
            {step === 1 && (
              <View>
                <Text style={styles.sectionTitle}>Step 1 — Email & Password</Text>
                <Text style={styles.helper}>
                  Use an email you can open now. Verification is required before entering personal details.
                </Text>
                <Field
                  label="Email Address *" value={email}
                  onChange={v => {setEmail(v.trim().toLowerCase()); setError("");}}
                  placeholder="you@gmail.com" keyboardType="email-address"
                  disabled={!emailCanEdit}
                  error={(showErrors || email.length > 0) ? emailErr : null}
                />
                <Field
                  label={resumeMode ? "Your VolunServe Password *" : "Create VolunServe Password *"}
                  value={password} onChange={setPassword} secret
                  placeholder="At least 8 characters"
                  error={(showErrors || password.length > 0) && !resumeMode ? passwordErr : null}
                />
                {!resumeMode && (
                  <>
                    <Field
                      label="Confirm Password *" value={confirmPassword}
                      onChange={setConfirmPassword} secret
                      placeholder="Type the same password again"
                      error={(showErrors || confirmPassword.length > 0) &&
                        confirmPassword !== password
                        ? "Passwords must match." : null}
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
                    resumeMode ? "Resume Registration" : "Create Account & Verify Email",
                  () => {void startEmail();}
                )}
                {!signedInUser && !resumeMode && (
                  <>
                    <Text style={styles.orText}>OR</Text>
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
                <Text style={styles.helper}>
                  Open your email and click the verification link sent to:
                </Text>
                <View style={styles.highlight}>
                  <Text style={styles.highlightText}>{signedInUser?.email || email}</Text>
                </View>
                <Text style={styles.helper}>
                  Check your Inbox and Spam folder. When you finish verifying,
                  return to this page and choose Check Verification.
                </Text>
                {checkButton("I've Verified — Check Status", () => {void checkVerified();})}
                {checkButton("Resend Verification Email", () => {void resend();}, true)}
                <Pressable style={styles.inlineButton} onPress={() => {void changeEmail();}}>
                  <Text style={styles.link}>Use a different email / Start over</Text>
                </Pressable>
                <Text style={styles.tiny}>
                  The account may exist while verification is pending, but it cannot
                  access the Resident Dashboard or create a Basic Resident profile.
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
                <Field
                  label="Date of Birth *" value={birth}
                  onChange={setBirth} placeholder="YYYY-MM-DD"
                  error={(showErrors || !!birth) && (age === null || age < 18 || age > 100)
                    ? "Use YYYY-MM-DD. Registration requires ages 18–100." : null}
                />
                <Field
                  label="Mobile Number *" value={phone}
                  onChange={v => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="9XXXXXXXXX" keyboardType="phone-pad"
                  error={(showErrors || !!phone) && !/^9\d{9}$/.test(phoneClean)
                    ? "Enter a valid 10-digit PH mobile number beginning with 9." : null}
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
                <View style={[styles.pickerBox, showErrors && !barangay && styles.inputError]}>
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
                {showErrors && !barangay &&
                  <Text style={styles.error}>Please select your SJDM barangay.</Text>}
                <Text style={styles.label}>Occupation *</Text>
                <View style={[styles.pickerBox, showErrors && !occupation && styles.inputError]}>
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
                {showErrors && !occupation &&
                  <Text style={styles.error}>Please select an occupation.</Text>}
                {needsSpecialization && (
                  <>
                    <Text style={styles.label}>Specialization *</Text>
                    <View style={[styles.pickerBox, showErrors && !specialization && styles.inputError]}>
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
                    {showErrors && !specialization &&
                      <Text style={styles.error}>Please select a specialization.</Text>}
                  </>
                )}
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
                    I confirm my name, birthday, contact, and address are accurate.
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
  errorBox: {padding: 13, borderRadius: 9, backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, marginBottom: 16},
  errorBoxText: {fontSize: 13, color: RED, lineHeight: 19},
  successBox: {padding: 13, borderRadius: 9, backgroundColor: PALE, borderColor: "#86efac", borderWidth: 1, marginBottom: 16},
  successText: {fontSize: 13, color: DARK, lineHeight: 19},
  button: {minHeight: 49, borderRadius: 10, backgroundColor: GREEN, marginTop: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 14},
  altButton: {backgroundColor: "#fff", borderColor: GREEN, borderWidth: 1.5},
  buttonText: {color: "#fff", fontSize: 14, fontWeight: "800", textAlign: "center"},
  altText: {color: GREEN},
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
