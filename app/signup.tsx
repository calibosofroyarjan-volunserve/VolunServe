import DateTimePicker from "@react-native-community/datetimepicker";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { auth, db } from "../lib/firebase";
import { signUpUser } from "../lib/firebaseAuth";

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "com.froyarjan123.volunserve",
});

type Step = 1 | 2 | 3 | 4;

type FormState = {
  lastName: string;
  firstName: string;
  middleName: string;
  noMiddleName: boolean;

  dateOfBirth: Date | null;

  phoneLocal: string;
  email: string;

  region: string;
  province: string;
  city: string;
  barangay: string;

  occupationCategory: string;
  occupationSpecialization: string;
  occupationOther: string;

  skills: string[];
  skillOther: string;
  availability: string[];

  password: string;
  confirmPassword: string;

  acceptTerms: boolean;
  confirmReview: boolean;
};

const ALLOWED_REGIONS = ["Region III – Central Luzon"];

const OCCUPATION_OPTIONS = [
  "Medical Professional",
  "Emergency Responder",
  "Government Employee",
  "Student",
  "Private Sector Employee",
  "NGO Worker",
  "Skilled Worker",
  "Unemployed",
  "Retired",
  "Other (Specify)",
];

const SPECIALIZATIONS: Record<string, string[]> = {
  "Medical Professional": [
    "Doctor",
    "Nurse",
    "Midwife",
    "Medical Technologist",
    "Pharmacist",
    "Other Medical Staff",
  ],
  "Emergency Responder": [
    "Firefighter",
    "EMT",
    "Rescue Volunteer",
    "DRRM Officer",
    "Other Responder",
  ],
  "Government Employee": [
    "Health Office",
    "Social Welfare",
    "Public Safety",
    "Administrative Staff",
    "Other Office",
  ],
  Student: [
    "Senior High School",
    "College",
    "Fresh Graduate",
    "Technical-Vocational",
  ],
  "Private Sector Employee": [
    "Operations",
    "Customer Service",
    "Engineering",
    "Management",
    "Other Department",
  ],
  "NGO Worker": [
    "Program Officer",
    "Field Coordinator",
    "Volunteer Manager",
    "Other Role",
  ],
  "Skilled Worker": [
    "Electrician",
    "Plumber",
    "Driver",
    "Welder",
    "Carpenter",
    "Other Skill",
  ],
};

const SKILL_OPTIONS = [
  "First Aid",
  "Medical Assistance",
  "Search and Rescue",
  "Driving",
  "Cooking / Relief Packing",
  "Construction",
  "Logistics",
  "IT / Technology",
  "Teaching",
  "Counseling",
  "Other (Specify)",
];

const AVAILABILITY_OPTIONS = [
  "Weekdays (Mon–Fri)",
  "Weekends (Sat–Sun)",
  "Evenings",
  "Anytime",
  "Emergency Response",
  "Specific Days",
];

const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "qwerty123",
  "12345678",
  "123456789",
  "abc12345",
  "letmein123",
  "admin123",
]);

const SLIDES = [
  {
    title: "Secure Registration",
    body: "Structured, multi-step validation to reduce fraudulent or low-quality registrations.",
  },
  {
    title: "Residential Address Validation",
    body: "Region → Province → City/Municipality → Barangay selections are controlled lists.",
  },
  {
    title: "Administrative Review",
    body: "New accounts require LGU approval before activation.",
  },
];

function sanitizeName(input: string) {
  return input.replace(/[^A-Za-z\s'-]/g, "");
}

function sanitizePhoneLocal(input: string) {
  return input.replace(/\D/g, "").slice(0, 10);
}

function toE164FromLocal(local: string) {
  return `+63${local}`;
}

function calculateAge(birthDate: Date) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

function formatDOB(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function getFriendlyAuthError(error: any) {
  const code = error?.code || "";

  if (code === "auth/email-already-in-use") {
    return "This email address is already registered.";
  }

  if (code === "auth/invalid-email") {
    return "The email address format is invalid.";
  }

  if (code === "auth/weak-password") {
    return "Your password is too weak.";
  }

  if (code === "auth/network-request-failed") {
    return "Network error. Please check your internet connection and try again.";
  }

  if (code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email using a different sign-in method.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function splitDisplayName(displayName: string) {
  const clean = displayName.trim().replace(/\s+/g, " ");
  if (!clean) {
    return { firstName: "", lastName: "" };
  }

  const parts = clean.split(" ");

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function Dropdown({
  label,
  value,
  options,
  placeholder = "Select...",
  enabled = true,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  enabled?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const triggerRef = useRef<any>(null);

  const openMenu = () => {
    if (!enabled) return;

    triggerRef.current?.measureInWindow(
      (x: number, y: number, w: number, h: number) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      }
    );
  };

  const closeMenu = () => setOpen(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        style={[styles.ddTrigger, !enabled && styles.disabledInput]}
      >
        <Text style={[styles.ddValue, !value && styles.ddPlaceholder]}>
          {value ? value : placeholder}
        </Text>
        <Text style={styles.ddChevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.ddBackdrop} onPress={closeMenu}>
          <View
            style={[
              styles.ddPanel,
              anchor && {
                position: "absolute",
                width: anchor.w,
                left: anchor.x,
                top: anchor.y + anchor.h + 6,
              },
            ]}
          >
            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <View style={styles.ddEmpty}>
                  <Text style={styles.ddEmptyText}>No options</Text>
                </View>
              ) : (
                options.map((opt) => {
                  const active = opt === value;

                  return (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        onChange(opt);
                        closeMenu();
                      }}
                      style={[styles.ddItem, active && styles.ddItemActive]}
                    >
                      <Text
                        style={[styles.ddItemText, active && styles.ddItemTextActive]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function TermsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.termsModalWrap}>
        <View style={styles.termsHeader}>
          <Text style={styles.termsHeaderTitle}>Terms & Data Privacy</Text>
          <TouchableOpacity onPress={onClose} style={styles.termsCloseBtn}>
            <Text style={styles.termsCloseText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.termsBody} showsVerticalScrollIndicator>
          <Text style={styles.termsH1}>VolunServe Registration Terms</Text>
          <Text style={styles.termsP}>
            By registering, you confirm the information you provide is accurate and
            complete. Your account may be subject to administrative review before
            activation.
          </Text>

          <Text style={styles.termsH2}>Data Privacy</Text>
          <Text style={styles.termsP}>
            We collect your personal data (name, contact info, and address) to support
            LGU service delivery, coordination, and verification. Access is restricted
            to authorized administrators.
          </Text>

          <Text style={styles.termsH2}>Consent</Text>
          <Text style={styles.termsP}>
            You consent to secure processing of your data for registration verification,
            volunteer coordination, and program communication. You may request correction
            of incorrect information via the administrator.
          </Text>

          <Text style={styles.termsH2}>Security</Text>
          <Text style={styles.termsP}>
            Use a strong password. Do not share your login credentials. Suspicious
            activity may result in account review.
          </Text>

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function CheckRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ValidationText({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <Text style={[styles.validation, { color: ok ? "#16a34a" : "#dc2626" }]}>
      {ok ? "✓" : "•"} {children}
    </Text>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secureTextEntry,
  editable = true,
  invalid = false,
  returnKeyType,
  onSubmitEditing,
  autoCapitalize,
  autoCorrect = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secureTextEntry?: boolean;
  editable?: boolean;
  invalid?: boolean;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.disabledInput, invalid && styles.inputInvalid]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={
          autoCapitalize
            ? autoCapitalize
            : keyboardType === "email-address"
            ? "none"
            : "words"
        }
        autoCorrect={autoCorrect}
        secureTextEntry={secureTextEntry}
        editable={editable}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={false}
      />
    </View>
  );
}

export default function Signup() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [step, setStep] = useState<Step>(1);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const [googleBound, setGoogleBound] = useState(false);
  const [googleProfileLoaded, setGoogleProfileLoaded] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [specificDays, setSpecificDays] = useState("");

  const [formData, setFormData] = useState<FormState>({
    lastName: "",
    firstName: "",
    middleName: "",
    noMiddleName: false,

    dateOfBirth: null,

    phoneLocal: "",
    email: "",

    region: "",
    province: "",
    city: "",
    barangay: "",

    occupationCategory: "",
    occupationSpecialization: "",
    occupationOther: "",

    skills: [],
    skillOther: "",
    availability: [],

    password: "",
    confirmPassword: "",

    acceptTerms: false,
    confirmReview: false,
  });

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  function toggleSelection(list: string[], item: string) {
    if (list.includes(item)) {
      return list.filter((i) => i !== item);
    }
    return [...list, item];
  }

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId:
      "233201250762-ton2r7m31pomrc42rgfjl7vb292e0var.apps.googleusercontent.com",
    androidClientId:
      "233201250762-d7tnic7h4q3f6ohip52a36ng22uqrvl5.apps.googleusercontent.com",
    redirectUri,
    scopes: ["openid", "profile", "email"],
  });

  const scrollRef = useRef<ScrollView | null>(null);

  const [slideIndex, setSlideIndex] = useState(0);
  const [termsOpen, setTermsOpen] = useState(false);

  const [regions, setRegions] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [barangays, setBarangays] = useState<string[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);

  const [dobOpen, setDobOpen] = useState(false);

  const today = new Date();
  const maxDOB = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const minDOB = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());

  useEffect(() => {
    setRegions(ALLOWED_REGIONS);

    if (ALLOWED_REGIONS.length === 1) {
      setFormData((prev) => ({ ...prev, region: ALLOWED_REGIONS[0] }));
    }
  }, []);

  useEffect(() => {
    const handleGoogleSuccess = async () => {
      if (response?.type !== "success") return;

      try {
        const idToken = response.params?.id_token;

        if (!idToken) {
          Alert.alert("Google Error", "No ID token returned.");
          return;
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        const user = userCred.user;

        const parsed = splitDisplayName(user.displayName || "");

        const googleEmail = (user.email || "").trim().toLowerCase();
        const firstNameFromGoogle = parsed.firstName ? sanitizeName(parsed.firstName) : "";
        const lastNameFromGoogle = parsed.lastName ? sanitizeName(parsed.lastName) : "";

        updateField("email", googleEmail);

        if (firstNameFromGoogle) {
          updateField("firstName", firstNameFromGoogle);
        }

        if (lastNameFromGoogle) {
          updateField("lastName", lastNameFromGoogle);
        }

        setGoogleBound(true);
        setGoogleProfileLoaded(true);
        setStep(1);

        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }, 0);

        Alert.alert(
          "Google Account Connected",
          "Your Google account information has been added to the registration form."
        );
      } catch (error: any) {
        Alert.alert("Firebase Error", getFriendlyAuthError(error));
      }
    };

    handleGoogleSuccess();
  }, [response]);

  useEffect(() => {
    const fetchProvinces = async () => {
      if (!formData.region) return;

      try {
        setLoadingAddress(true);
        setProvinces([]);
        setCities([]);
        setBarangays([]);

        const snap = await getDocs(
          collection(db, "address_regions", formData.region, "provinces")
        );

        setProvinces(snap.docs.map((d) => d.id).sort());
      } catch (err: any) {
        Alert.alert("Address Error", err?.message || "Failed to load provinces.");
      } finally {
        setLoadingAddress(false);
      }
    };

    fetchProvinces();
  }, [formData.region]);

  useEffect(() => {
    const fetchCities = async () => {
      if (!formData.region || !formData.province) return;

      try {
        setLoadingAddress(true);
        setCities([]);
        setBarangays([]);

        const snap = await getDocs(
          collection(
            db,
            "address_regions",
            formData.region,
            "provinces",
            formData.province,
            "cities"
          )
        );

        setCities(snap.docs.map((d) => d.id).sort());
      } catch (err: any) {
        Alert.alert("Address Error", err?.message || "Failed to load cities.");
      } finally {
        setLoadingAddress(false);
      }
    };

    fetchCities();
  }, [formData.region, formData.province]);

  useEffect(() => {
    const fetchBarangays = async () => {
      if (!formData.region || !formData.province || !formData.city) return;

      try {
        setLoadingAddress(true);
        setBarangays([]);

        const snap = await getDocs(
          collection(
            db,
            "address_regions",
            formData.region,
            "provinces",
            formData.province,
            "cities",
            formData.city,
            "barangays"
          )
        );

        setBarangays(snap.docs.map((d) => d.id).sort());
      } catch (err: any) {
        Alert.alert("Address Error", err?.message || "Failed to load barangays.");
      } finally {
        setLoadingAddress(false);
      }
    };

    fetchBarangays();
  }, [formData.region, formData.province, formData.city]);

  const specializationOptions = SPECIALIZATIONS[formData.occupationCategory] ?? [];

  const validation = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nameOk = (s: string) => s.trim().length >= 2;

    const lastNameValid = nameOk(formData.lastName);
    const firstNameValid = nameOk(formData.firstName);
    const middleNameValid = formData.noMiddleName ? true : nameOk(formData.middleName);

    const ageNumber = formData.dateOfBirth ? calculateAge(formData.dateOfBirth) : 0;
    const ageValid = !!formData.dateOfBirth && ageNumber >= 18;

    const phoneValid = /^9\d{9}$/.test(formData.phoneLocal);
    const emailValid = emailRegex.test(formData.email.trim().toLowerCase());

    const step1Valid =
      lastNameValid &&
      firstNameValid &&
      middleNameValid &&
      ageValid &&
      phoneValid &&
      emailValid;

    const step2Valid =
      !!formData.region &&
      !!formData.province &&
      !!formData.city &&
      !!formData.barangay;

    const needsSpec = specializationOptions.length > 0;
    const isOther = formData.occupationCategory === "Other (Specify)";
    const occupationOtherValid = !isOther || formData.occupationOther.trim().length >= 2;
    const specializationValid = !needsSpec || !!formData.occupationSpecialization;
    const step3Valid =
      !!formData.occupationCategory && occupationOtherValid && specializationValid;

    const passwordChecks = {
      minLength: formData.password.length >= 8,
      upper: /[A-Z]/.test(formData.password),
      lower: /[a-z]/.test(formData.password),
      number: /\d/.test(formData.password),
      special: /[^A-Za-z0-9]/.test(formData.password),
      notCommon: !COMMON_PASSWORDS.has(formData.password.toLowerCase()),
      matches:
        formData.password === formData.confirmPassword &&
        !!formData.confirmPassword,
    };

    const passwordScore = Object.values(passwordChecks).filter(Boolean).length;
    const passwordStrength =
      passwordScore <= 2 ? "Weak" : passwordScore <= 5 ? "Medium" : "Strong";
    const passwordValid =
      passwordScore === Object.keys(passwordChecks).length;

    const step4Valid =
      passwordValid && formData.acceptTerms && formData.confirmReview;

    return {
      lastNameValid,
      firstNameValid,
      middleNameValid,
      ageValid,
      ageNumber,
      phoneValid,
      emailValid,
      step1Valid,
      step2Valid,
      step3Valid,
      step4Valid,
      passwordChecks,
      passwordStrength,
      needsSpec,
      isOther,
    };
  }, [formData, specializationOptions.length]);

  const isStepValid = (s: Step) => {
    if (s === 1) return validation.step1Valid;
    if (s === 2) return validation.step2Valid;
    if (s === 3) return validation.step3Valid;
    return validation.step4Valid;
  };

  const goNext = () => {
    if (!isStepValid(step)) {
      Alert.alert("Incomplete", "Please complete the required fields for this step.");
      return;
    }

    Keyboard.dismiss();

    if (step < 4) {
      setStep((prev) => (prev + 1) as Step);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 0);
    }
  };

  const goBack = () => {
    Keyboard.dismiss();

    if (step > 1) {
      setStep((prev) => (prev - 1) as Step);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 0);
    }
  };

  const handleGooglePress = async () => {
    try {
      await promptAsync();
    } catch (error: any) {
      Alert.alert("Google Error", getFriendlyAuthError(error));
    }
  };

  const handleSubmit = async () => {
    if (loadingSubmit) return;

    if (!validation.step4Valid) {
      Alert.alert(
        "Incomplete",
        "Please satisfy all security and compliance requirements."
      );
      return;
    }

    if (!formData.dateOfBirth || !validation.ageValid) {
      Alert.alert(
        "Ineligible",
        "Applicants must be at least 18 years old at the time of registration."
      );
      return;
    }

    try {
      setLoadingSubmit(true);

      await signUpUser({
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        middleName: formData.noMiddleName ? "" : formData.middleName.trim(),

        age: validation.ageNumber,

        email: formData.email.trim().toLowerCase(),
        password: formData.password,

        phoneNumber: toE164FromLocal(formData.phoneLocal),

        region: formData.region,
        province: formData.province,
        city: formData.city,
        barangay: formData.barangay,

        occupationCategory: formData.occupationCategory,
        occupationSpecialization: formData.occupationSpecialization || "",
        occupationOther: formData.occupationOther || "",

        skills: formData.skills,
        skillOther: formData.skillOther,
        availability: formData.availability
      } as any);

      Alert.alert(
        "Registration Submitted",
        "Your registration has been recorded and is subject to administrative review before activation.",
        [{ text: "OK", onPress: () => router.replace("/login") }]
      );
    } catch (e: any) {
      Alert.alert("Registration Error", getFriendlyAuthError(e));
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f8fafc" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBrand}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.topBrandLogo}
            resizeMode="contain"
          />

          <Text style={styles.topBrandText}>VolunServe</Text>
        </View>

        <View style={styles.brandDivider} />

        <View style={styles.carouselWrap}>
          <FlatList
            data={SLIDES}
            keyExtractor={(item) => item.title}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const idx = Math.round(x / (width - 40));
              setSlideIndex(idx);
            }}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <View style={[styles.carouselCard, { width: width - 40 }]}>
                <Text style={styles.carouselTitle}>{item.title}</Text>
                <Text style={styles.carouselText}>{item.body}</Text>
              </View>
            )}
          />
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === slideIndex ? styles.dotOn : styles.dotOff]}
              />
            ))}
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Registration</Text>
        </View>

        <Text style={styles.helperText}>
          Register as a verified volunteer for your local community.
        </Text>

        <TouchableOpacity
          onPress={handleGooglePress}
          disabled={!request}
          style={[
            styles.googleBtn,
            (!request || googleProfileLoaded) && styles.googleBtnDisabled,
          ]}
        >
          {googleProfileLoaded ? (
            <Text style={styles.googleBtnText}>Google Account Connected</Text>
          ) : (
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        {googleBound ? (
          <View style={styles.googleBoundNote}>
            <Text style={styles.googleBoundNoteText}>
              Google account linked. Your email is locked to the connected Google account.
            </Text>
          </View>
        ) : null}

        <View style={styles.progressWrap}>
          {[1, 2, 3, 4].map((n) => {
            const active = step >= n;
            return (
              <View
                key={n}
                style={[
                  styles.progressSegment,
                  active ? styles.progressSegmentOn : styles.progressSegmentOff,
                ]}
              />
            );
          })}
        </View>

        <Text style={styles.subtitle}>Step {step} of 4</Text>

        {step === 1 && (
          <View>
            <Field
              label="Email Address *"
              value={formData.email}
              onChange={(v) => updateField("email", v.trim().toLowerCase())}
              keyboardType="email-address"
              invalid={!validation.emailValid && formData.email.length > 0}
              returnKeyType="next"
              editable={!googleBound}
              autoCapitalize="none"
            />

            <ValidationText ok={validation.emailValid}>
              {googleBound
                ? "Email is linked to your connected Google account."
                : "Enter a valid email format."}
            </ValidationText>

            <Field
              label="Last Name *"
              value={formData.lastName}
              onChange={(v) => updateField("lastName", sanitizeName(v))}
              invalid={!validation.lastNameValid && formData.lastName.length > 0}
              returnKeyType="next"
            />

            <Field
              label="First Name *"
              value={formData.firstName}
              onChange={(v) => updateField("firstName", sanitizeName(v))}
              invalid={!validation.firstNameValid && formData.firstName.length > 0}
              returnKeyType="next"
            />

            <Field
              label="Middle Name *"
              value={formData.middleName}
              onChange={(v) => updateField("middleName", sanitizeName(v))}
              editable={!formData.noMiddleName}
              invalid={
                !formData.noMiddleName &&
                formData.middleName.length > 0 &&
                !validation.middleNameValid
              }
              returnKeyType="next"
            />

            <CheckRow
              label="No Middle Name"
              checked={formData.noMiddleName}
              onPress={() => {
                const next = !formData.noMiddleName;
                updateField("noMiddleName", next);
                if (next) updateField("middleName", "");
              }}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Date of Birth *</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setDobOpen(true)}
                style={[
                  styles.input,
                  !validation.ageValid && formData.dateOfBirth !== null
                    ? styles.inputInvalid
                    : null,
                  { justifyContent: "center" },
                ]}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: formData.dateOfBirth ? "#0f172a" : "#94a3b8",
                  }}
                >
                  {formData.dateOfBirth
                    ? formatDOB(formData.dateOfBirth)
                    : "MM/DD/YYYY"}
                </Text>
              </TouchableOpacity>

              {dobOpen && (
                <DateTimePicker
                  value={formData.dateOfBirth || maxDOB}
                  mode="date"
                  display="default"
                  maximumDate={maxDOB}
                  minimumDate={minDOB}
                  onChange={(event, selectedDate) => {
                    setDobOpen(false);
                    if (selectedDate) {
                      updateField("dateOfBirth", selectedDate);
                    }
                  }}
                />
              )}

              <ValidationText ok={validation.ageValid}>
                {formData.dateOfBirth
                  ? validation.ageValid
                    ? `Age: ${validation.ageNumber}`
                    : "You must be at least 18 years old to proceed."
                  : "Applicants must be at least 18 years old at the time of registration."}
              </ValidationText>
            </View>

            <Text style={styles.label}>Mobile Number *</Text>
            <View style={styles.phoneWrap}>
              <View style={styles.phonePrefix}>
                <Text style={styles.flag}>🇵🇭</Text>
                <Text style={styles.phonePrefixText}>+63</Text>
              </View>

              <TextInput
                style={[
                  styles.phoneInput,
                  !validation.phoneValid && formData.phoneLocal.length > 0
                    ? styles.inputInvalid
                    : null,
                ]}
                value={formData.phoneLocal}
                onChangeText={(v) =>
                  updateField("phoneLocal", sanitizePhoneLocal(v.trim()))
                }
                keyboardType="phone-pad"
                placeholder="9123456789"
                maxLength={10}
                returnKeyType="next"
              />
            </View>

            <ValidationText ok={validation.phoneValid}>
              Enter a valid Philippine mobile number starting with 9 (10 digits).
            </ValidationText>

            <View style={{ height: 24 }} />
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.locationHelpText}>
              Your residential address helps LGUs assign volunteers to nearby
              emergency operations.
            </Text>

            {loadingAddress ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>Loading address options…</Text>
              </View>
            ) : null}

            <Dropdown
              label="Region *"
              value={formData.region}
              options={regions}
              enabled={false}
              onChange={(value) => {
                updateField("region", value);
                updateField("province", "");
                updateField("city", "");
                updateField("barangay", "");
              }}
            />

            <Dropdown
              label="Province *"
              value={formData.province}
              options={provinces}
              enabled={!!formData.region && provinces.length > 0}
              onChange={(value) => {
                updateField("province", value);
                updateField("city", "");
                updateField("barangay", "");
              }}
            />

            <Dropdown
              label="City / Municipality *"
              value={formData.city}
              options={cities}
              enabled={!!formData.province && cities.length > 0}
              onChange={(value) => {
                updateField("city", value);
                updateField("barangay", "");
              }}
            />

            <Dropdown
              label="Barangay *"
              value={formData.barangay}
              options={barangays}
              enabled={!!formData.city && barangays.length > 0}
              onChange={(value) => updateField("barangay", value)}
            />

            <View style={{ height: 24 }} />
          </View>
        )}

        {step === 3 && (
          <View>
            <Dropdown
              label="Occupation Category *"
              value={formData.occupationCategory}
              options={OCCUPATION_OPTIONS}
              onChange={(value) => {
                updateField("occupationCategory", value);
                updateField("occupationSpecialization", "");
                updateField("occupationOther", "");
              }}
            />

            {validation.needsSpec && (
              <Dropdown
                label="Specialization *"
                value={formData.occupationSpecialization}
                options={specializationOptions}
                enabled={!!formData.occupationCategory}
                onChange={(value) =>
                  updateField("occupationSpecialization", value)
                }
              />
            )}

            {validation.isOther && (
              <Field
                label="Specify Occupation *"
                value={formData.occupationOther}
                onChange={(v) => updateField("occupationOther", v)}
                invalid={
                  formData.occupationOther.length > 0 &&
                  formData.occupationOther.trim().length < 2
                }
              />
            )}

            <Text style={styles.label}>Skills *</Text>

            <View style={styles.cardBox}>
              <View style={styles.skillWrap}>
                {SKILL_OPTIONS.map((skill) => {
                  const active = formData.skills.includes(skill);

                  return (
                    <Pressable
                      key={skill}
                      onPress={() =>
                        updateField(
                          "skills",
                          toggleSelection(formData.skills, skill)
                        )
                      }
                      style={[
                        styles.skillTag,
                        active && styles.skillTagActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.skillText,
                          active && styles.skillTextActive,
                        ]}
                      >
                        {skill}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {formData.skills.includes("Other (Specify)") && (
                <Field
                  label="Specify Skill"
                  value={formData.skillOther}
                  onChange={(v) => updateField("skillOther", v)}
                />
              )}
            </View>

            <Text style={styles.label}>Availability *</Text>

            <View style={styles.cardBox}>

              {AVAILABILITY_OPTIONS.map((item) => {
                const active = formData.availability.includes(item);

                return (
                  <TouchableOpacity
                    key={item}
                    style={styles.checkboxRow}
                    onPress={() =>
                      updateField(
                        "availability",
                        toggleSelection(formData.availability, item)
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <View style={[styles.checkbox, active && styles.checkboxOn]}>
                      {active ? <Text style={styles.checkboxTick}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>{item}</Text>
                  </TouchableOpacity>
                );
              })}

              {formData.availability.includes("Specific Days") && (
                <TextInput
                  style={styles.input}
                  placeholder="Example: Monday, Wednesday"
                  value={specificDays}
                  onChangeText={setSpecificDays}
                />
              )}
            </View>

            <View style={{ height: 24 }} />
          </View>
        )}

        {step === 4 && (
          <View>
            <Field
              label="Password *"
              value={formData.password}
              onChange={(v) => updateField("password", v)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.passwordToggleBtn}
              onPress={() => setShowPassword((prev) => !prev)}
            >
              <Text style={styles.passwordToggleText}>
                {showPassword ? "Hide Password" : "Show Password"}
              </Text>
            </TouchableOpacity>

            <Field
              label="Confirm Password *"
              value={formData.confirmPassword}
              onChange={(v) => updateField("confirmPassword", v)}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.passwordToggleBtn}
              onPress={() => setShowConfirmPassword((prev) => !prev)}
            >
              <Text style={styles.passwordToggleText}>
                {showConfirmPassword ? "Hide Confirm Password" : "Show Confirm Password"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>
              Password Strength: {validation.passwordStrength}
            </Text>

            <ValidationText ok={validation.passwordChecks.minLength}>
              Minimum 8 characters.
            </ValidationText>
            <ValidationText ok={validation.passwordChecks.upper}>
              At least one uppercase letter.
            </ValidationText>
            <ValidationText ok={validation.passwordChecks.lower}>
              At least one lowercase letter.
            </ValidationText>
            <ValidationText ok={validation.passwordChecks.number}>
              At least one number.
            </ValidationText>
            <ValidationText ok={validation.passwordChecks.special}>
              At least one special character.
            </ValidationText>
            <ValidationText ok={validation.passwordChecks.notCommon}>
              Must not be a common password.
            </ValidationText>
            <ValidationText ok={validation.passwordChecks.matches}>
              Passwords must match.
            </ValidationText>

            <Text style={styles.sectionTitle}>Compliance & Data Privacy</Text>

            <TouchableOpacity
              onPress={() => setTermsOpen(true)}
              style={styles.termsOpenBtn}
            >
              <Text style={styles.termsOpenText}>
                View Terms & Data Privacy (Full Screen)
              </Text>
            </TouchableOpacity>

            <CheckRow
              label="I agree to the compliance and data privacy statements."
              checked={formData.acceptTerms}
              onPress={() => updateField("acceptTerms", !formData.acceptTerms)}
            />

            <CheckRow
              label="I confirm the details I provided are final and correct."
              checked={formData.confirmReview}
              onPress={() => updateField("confirmReview", !formData.confirmReview)}
            />

            <View style={{ height: 24 }} />
          </View>
        )}

        <View style={styles.actions}>
          {step > 1 ? (
            <TouchableOpacity
              style={[styles.navBtn, styles.secondaryBtn]}
              onPress={goBack}
              disabled={loadingSubmit}
            >
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step < 4 ? (
            <TouchableOpacity
              style={[
                styles.navBtn,
                styles.primaryBtn,
                !isStepValid(step) && styles.disabledBtn,
              ]}
              onPress={goNext}
              disabled={!isStepValid(step)}
            >
              <Text style={styles.primaryText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.navBtn,
                styles.primaryBtn,
                (!validation.step4Valid || loadingSubmit) && styles.disabledBtn,
              ]}
              onPress={handleSubmit}
              disabled={!validation.step4Valid || loadingSubmit}
            >
              {loadingSubmit ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Submit</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => router.push("/login")} style={{ marginTop: 14 }}>
          <Text style={styles.link}>
            Already have an account? <Text style={styles.linkStrong}>Sign in</Text>
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <TermsModal visible={termsOpen} onClose={() => setTermsOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },

  checkRow: {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 12,
 },

  topBrand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: "#ffffff",
  },

  topBrandLogo: {
    width: 34,
    height: 34,
    marginRight: 8,
  },

  topBrandText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },

  brandDivider: {
    height: 3,
    backgroundColor: "#0f766e",
    marginBottom: 18,
  },

  carouselWrap: {
    marginBottom: 18,
    marginTop: 4,
  },

  carouselCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginRight: 10,
  },

  carouselTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    color: "#111827",
  },

  carouselText: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  dotOn: { backgroundColor: "#4f46e5" },
  dotOff: { backgroundColor: "#cbd5e1" },

  header: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 18,
  },

  title: {
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    color: "#0f172a",
  },

  helperText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
  },

  subtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 16,
  },

  googleBtn: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    marginBottom: 12,
  },

  googleBtnDisabled: {
    opacity: 0.85,
  },

  googleBtnText: {
    fontWeight: "800",
    color: "#111",
  },

  googleBoundNote: {
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  googleBoundNoteText: {
    color: "#3730a3",
    fontSize: 12.5,
    fontWeight: "700",
  },

  progressWrap: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },

  progressSegment: {
    flex: 1,
    height: 8,
    borderRadius: 999,
  },

  progressSegmentOn: {
    backgroundColor: "#4f46e5",
  },

  progressSegmentOff: {
    backgroundColor: "#cbd5e1",
  },

  field: {
    marginBottom: 18,
  },

  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 10,
  },

  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
  },

  inputInvalid: {
    borderColor: "#dc2626",
  },

  disabledInput: {
    backgroundColor: "#f1f5f9",
    opacity: 0.85,
  },

  phoneWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 12,
  },

  phonePrefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 54,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    backgroundColor: "#fff",
  },

  flag: {
    fontSize: 18,
  },

  phonePrefixText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
  },

  phoneInput: {
    flex: 1,
    height: 54,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: "#fff",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  loadingText: {
    color: "#64748b",
    fontSize: 12,
  },

  locationHelpText: {
    color: "#64748b",
    marginBottom: 10,
    fontSize: 12.5,
    lineHeight: 18,
  },

  validation: {
    fontSize: 12,
    marginBottom: 10,
  },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },

  checkboxOn: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },

  checkboxTick: {
    color: "#fff",
    fontWeight: "900",
  },

  checkboxLabel: {
    marginLeft: 10,
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },

  checkLabel: {
    flex: 1,
    fontSize: 13,
    color: "#334155",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginVertical: 10,
    color: "#0f172a",
  },

  cardBox: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 18,
  },

  skillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },

  skillTag: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#d1d5db",
    margin: 6,
    backgroundColor: "#f9fafb",
  },

  skillTagActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },

  skillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },

  skillTextActive: {
    color: "#ffffff",
  },

  passwordToggleBtn: {
    alignSelf: "flex-start",
    marginTop: -4,
    marginBottom: 12,
  },

  passwordToggleText: {
    color: "#4f46e5",
    fontWeight: "800",
    fontSize: 13,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 10,
  },

  navBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  primaryBtn: {
    backgroundColor: "#4f46e5",
  },

  secondaryBtn: {
    backgroundColor: "#e2e8f0",
  },

  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },

  secondaryText: {
    color: "#334155",
    fontWeight: "900",
  },

  disabledBtn: {
    opacity: 0.5,
  },

  link: {
    textAlign: "center",
    fontSize: 14,
    color: "#64748b",
  },

  linkStrong: {
    color: "#4f46e5",
    fontWeight: "900",
  },

  ddTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },

  ddValue: {
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "700",
    flex: 1,
    paddingRight: 8,
  },

  ddPlaceholder: {
    color: "#94a3b8",
    fontWeight: "700",
  },

  ddChevron: {
    fontSize: 16,
    color: "#334155",
    fontWeight: "900",
  },

  ddBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.15)",
  },

  ddPanel: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    elevation: 6,
  },

  ddItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },

  ddItemActive: {
    backgroundColor: "#eef2ff",
  },

  ddItemText: {
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "700",
  },

  ddItemTextActive: {
    color: "#1d4ed8",
  },

  ddEmpty: {
    padding: 14,
  },

  ddEmptyText: {
    color: "#64748b",
    fontWeight: "700",
  },

  termsOpenBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 12,
  },

  termsOpenText: {
    color: "#1d4ed8",
    fontWeight: "900",
  },

  termsModalWrap: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  termsHeader: {
    paddingTop: Platform.OS === "ios" ? 54 : 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  termsHeaderTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },

  termsCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
  },

  termsCloseText: {
    fontWeight: "900",
    color: "#0f172a",
  },

  termsBody: {
    padding: 16,
    paddingBottom: 40,
  },

  termsH1: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  termsH2: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 14,
    marginBottom: 8,
  },

  termsP: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },
});