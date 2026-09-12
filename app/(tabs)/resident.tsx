import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../lib/firebase";
import { getUserProfile } from "../../lib/firebaseAuth";

type AssistanceType =
  | "food"
  | "water"
  | "medical"
  | "shelter"
  | "evacuation"
  | "transportation"
  | "other";

type Urgency = "normal" | "urgent" | "critical";
type BeneficiaryType = "self" | "someone_else";

type CapturedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

const ASSISTANCE_OPTIONS: {
  value: AssistanceType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: "food",
    label: "Food",
    icon: "fast-food-outline",
  },
  {
    value: "water",
    label: "Water",
    icon: "water-outline",
  },
  {
    value: "medical",
    label: "Medical",
    icon: "medkit-outline",
  },
  {
    value: "shelter",
    label: "Shelter",
    icon: "home-outline",
  },
  {
    value: "evacuation",
    label: "Evacuation",
    icon: "people-outline",
  },
  {
    value: "transportation",
    label: "Transport",
    icon: "car-outline",
  },
  {
    value: "other",
    label: "Other",
    icon: "ellipsis-horizontal",
  },
];

const URGENCY_OPTIONS: {
  value: Urgency;
  label: string;
  color: string;
  softColor: string;
}[] = [
  {
    value: "normal",
    label: "Normal",
    color: "#168B72",
    softColor: "#E7F8F3",
  },
  {
    value: "urgent",
    label: "Urgent",
    color: "#E58A13",
    softColor: "#FFF4DE",
  },
  {
    value: "critical",
    label: "Critical",
    color: "#E53D4F",
    softColor: "#FFE9EC",
  },
];

export default function AssistanceRequestScreen() {
  const user = auth.currentUser;

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const [beneficiaryType, setBeneficiaryType] =
    useState<BeneficiaryType>("self");

  const [assistanceType, setAssistanceType] =
    useState<AssistanceType | null>(null);

  const [urgency, setUrgency] =
    useState<Urgency>("normal");

  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const [capturedLocation, setCapturedLocation] =
    useState<CapturedLocation | null>(null);

  const [capturingLocation, setCapturingLocation] =
    useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        if (!user) return;

        const loadedProfile =
          await getUserProfile(user.uid);

        if (!mounted) return;

        setProfile(loadedProfile);

        setContactNumber(
          loadedProfile?.phoneNumber || ""
        );

        const barangay =
          loadedProfile?.barangay
            ? `Brgy. ${loadedProfile.barangay}`
            : "";

        setLocationLabel(
          loadedProfile?.address || barangay
        );
      } catch (error) {
        console.log(
          "Load assistance profile error:",
          error
        );
      } finally {
        if (mounted) {
          setLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [user]);

  const assistanceLabel = useMemo(
    () =>
      ASSISTANCE_OPTIONS.find(
        (option) =>
          option.value === assistanceType
      )?.label || "Not selected",
    [assistanceType]
  );

  async function captureCurrentLocation() {
    try {
      setCapturingLocation(true);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Allow location access so authorized responders can find the assistance location."
        );

        return;
      }

      const position =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

      setCapturedLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
      });
    } catch (error) {
      console.log(
        "Assistance GPS error:",
        error
      );

      Alert.alert(
        "Location Error",
        "Your GPS location could not be captured. Check location settings and try again."
      );
    } finally {
      setCapturingLocation(false);
    }
  }

  function validateRequest() {
    if (!user) {
      return "Please sign in again.";
    }

    if (!assistanceType) {
      return "Select the assistance you need.";
    }

    if (description.trim().length < 10) {
      return "Describe the situation using at least 10 characters.";
    }

    if (locationLabel.trim().length < 3) {
      return "Enter the barangay, address, or nearby landmark.";
    }

    if (contactNumber.trim().length < 8) {
      return "Enter a valid contact number.";
    }

    if (!capturedLocation) {
      return "Capture the assistance location using GPS.";
    }

    return null;
  }

  async function submitRequest() {
    const validationError = validateRequest();

    if (validationError) {
      Alert.alert(
        "Incomplete Request",
        validationError
      );

      return;
    }

    if (
      !user ||
      !capturedLocation ||
      !assistanceType
    ) {
      return;
    }

    try {
      setSubmitting(true);

      const requestRef = doc(
        collection(db, "assistanceRequests")
      );

      await setDoc(requestRef, {
        requestId: requestRef.id,

        requesterUid: user.uid,

        requesterName:
          profile?.fullName ||
          user.displayName ||
          "Resident",

        requesterEmail:
          profile?.email ||
          user.email ||
          "",

        requesterBarangay:
          profile?.barangay || "",

        contactNumber:
          contactNumber.trim(),

        beneficiaryType,
        assistanceType,
        urgency,

        description:
          description.trim(),

        location:
          locationLabel.trim(),

        latitude:
          capturedLocation.latitude,

        longitude:
          capturedLocation.longitude,

        gpsAccuracyMeters:
          capturedLocation.accuracy,

        locationCapturedAt:
          serverTimestamp(),

        status: "submitted",

        linkedCaseId: "",

        assignedVolunteerId: "",
        assignedVolunteerName: "",

        adminNote: "",

        reviewedAt: null,
        assignedAt: null,
        deliveredAt: null,
        closedAt: null,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      });

      Alert.alert(
        "Request Submitted",
        `Reference: ${requestRef.id}\n\nYour private request is waiting for LGU review.`
      );

      setBeneficiaryType("self");
      setAssistanceType(null);
      setUrgency("normal");
      setDescription("");
      setCapturedLocation(null);
    } catch (error) {
      console.log(
        "Submit assistance request error:",
        error
      );

      Alert.alert(
        "Submission Failed",
        "The request could not be saved. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProfile) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />

        <ActivityIndicator
          size="large"
          color="#F28C13"
        />

        <Text style={styles.loadingText}>
          Preparing assistance form...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <StatusBar
        style="light"
        backgroundColor="#D96F08"
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <LinearGradient
          colors={["#E17A0B", "#F4A11F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerIcon}>
            <Ionicons
              name="hand-left"
              size={30}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>
              Request Assistance
            </Text>

            <Text style={styles.headerSubtitle}>
              Tell the LGU what you need and
              where help should be sent.
            </Text>
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressCard}>
            {[
              ["1", "Needs"],
              ["2", "Location"],
              ["3", "Submit"],
            ].map(
              ([number, label], index) => (
                <React.Fragment key={number}>
                  {index > 0 ? (
                    <View
                      style={styles.progressLine}
                    />
                  ) : null}

                  <View
                    style={styles.progressItem}
                  >
                    <View
                      style={styles.progressCircle}
                    >
                      <Text
                        style={styles.progressNumber}
                      >
                        {number}
                      </Text>
                    </View>

                    <Text
                      style={styles.progressLabel}
                    >
                      {label}
                    </Text>
                  </View>
                </React.Fragment>
              )
            )}
          </View>

          <View style={styles.card}>
            <SectionTitle
              icon="person-outline"
              title="Who needs assistance?"
            />

            <View style={styles.segmentRow}>
              <SegmentButton
                active={
                  beneficiaryType === "self"
                }
                label="Myself"
                icon="person-outline"
                onPress={() =>
                  setBeneficiaryType("self")
                }
              />

              <SegmentButton
                active={
                  beneficiaryType ===
                  "someone_else"
                }
                label="Someone else"
                icon="people-outline"
                onPress={() =>
                  setBeneficiaryType(
                    "someone_else"
                  )
                }
              />
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle
              icon="heart-outline"
              title="What assistance is needed?"
              required
            />

            <View style={styles.optionGrid}>
              {ASSISTANCE_OPTIONS.map(
                (option) => {
                  const active =
                    assistanceType ===
                    option.value;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      activeOpacity={0.8}
                      onPress={() =>
                        setAssistanceType(
                          option.value
                        )
                      }
                      style={[
                        styles.option,
                        active &&
                          styles.optionActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.optionIcon,
                          active &&
                            styles.optionIconActive,
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={20}
                          color={
                            active
                              ? "#FFFFFF"
                              : "#D9790B"
                          }
                        />
                      </View>

                      <Text
                        style={[
                          styles.optionText,
                          active &&
                            styles.optionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            <Text style={styles.label}>
              Urgency *
            </Text>

            <View style={styles.urgencyRow}>
              {URGENCY_OPTIONS.map(
                (option) => {
                  const active =
                    urgency === option.value;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() =>
                        setUrgency(option.value)
                      }
                      style={[
                        styles.urgencyButton,
                        {
                          backgroundColor:
                            option.softColor,
                        },
                        active && {
                          borderColor:
                            option.color,
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.urgencyDot,
                          {
                            backgroundColor:
                              option.color,
                          },
                        ]}
                      />

                      <Text
                        style={[
                          styles.urgencyText,
                          {
                            color:
                              option.color,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            <Text style={styles.label}>
              Describe the situation *
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Who needs help, how many people are affected, and what is needed?"
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={600}
              style={[
                styles.input,
                styles.textArea,
              ]}
            />

            <Text style={styles.counter}>
              {description.length}/600
            </Text>
          </View>

          <View style={styles.card}>
            <SectionTitle
              icon="location-outline"
              title="Assistance location"
              required
            />

            <Text style={styles.label}>
              Barangay, address, or landmark *
            </Text>

            <TextInput
              value={locationLabel}
              onChangeText={setLocationLabel}
              placeholder="Enter where help is needed"
              placeholderTextColor="#94A3B8"
              maxLength={180}
              style={styles.input}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={capturingLocation}
              onPress={captureCurrentLocation}
              style={[
                styles.locationCard,
                capturedLocation &&
                  styles.locationCardReady,
              ]}
            >
              <View
                style={[
                  styles.locationIcon,
                  capturedLocation &&
                    styles.locationIconReady,
                ]}
              >
                {capturingLocation ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Ionicons
                    name={
                      capturedLocation
                        ? "checkmark"
                        : "locate"
                    }
                    size={23}
                    color="#FFFFFF"
                  />
                )}
              </View>

              <View style={styles.locationCopy}>
                <Text style={styles.locationTitle}>
                  {capturingLocation
                    ? "Capturing current location..."
                    : capturedLocation
                    ? "Current location ready"
                    : "Use Current Location"}
                </Text>

                <Text
                  style={
                    styles.locationSubtitle
                  }
                >
                  {capturedLocation
                    ? `Accuracy: approximately ${Math.round(
                        capturedLocation.accuracy
                      )} meters`
                    : "Tap to securely capture the assistance location"}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>

            <View style={styles.privacyCard}>
              <Ionicons
                name="lock-closed"
                size={19}
                color="#167D70"
              />

              <Text style={styles.privacyText}>
                Exact location is private and
                visible only to authorized LGU
                personnel and the assigned
                responder.
              </Text>
            </View>

            <Text style={styles.label}>
              Contact number *
            </Text>

            <TextInput
              value={contactNumber}
              onChangeText={setContactNumber}
              placeholder="09XXXXXXXXX"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              maxLength={20}
              style={styles.input}
            />
          </View>

          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Ionicons
                name="document-text-outline"
                size={21}
                color="#9A580A"
              />

              <Text style={styles.reviewTitle}>
                Request summary
              </Text>
            </View>

            <SummaryRow
              label="Assistance"
              value={assistanceLabel}
            />

            <SummaryRow
              label="For"
              value={
                beneficiaryType === "self"
                  ? "Myself"
                  : "Someone else"
              }
            />

            <SummaryRow
              label="Urgency"
              value={
                urgency.charAt(0).toUpperCase() +
                urgency.slice(1)
              }
            />

            <SummaryRow
              label="GPS"
              value={
                capturedLocation
                  ? "Location captured"
                  : "Not captured"
              }
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={submitting}
            onPress={submitRequest}
            style={[
              styles.submitButton,
              submitting &&
                styles.submitDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <Text
                  style={styles.submitText}
                >
                  Submit Assistance Request
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#FFFFFF"
                />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            For life-threatening emergencies,
            call the official hotline immediately.
            This form does not replace an
            emergency call.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionTitle({
  icon,
  title,
  required = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  required?: boolean;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionIcon}>
        <Ionicons
          name={icon}
          size={19}
          color="#D9790B"
        />
      </View>

      <Text style={styles.sectionTitle}>
        {title}{" "}
        {required ? (
          <Text style={styles.required}>
            *
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function SegmentButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.segmentButton,
        active &&
          styles.segmentButtonActive,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={
          active
            ? "#FFFFFF"
            : "#64748B"
        }
      />

      <Text
        style={[
          styles.segmentText,
          active &&
            styles.segmentTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>
        {label}
      </Text>

      <Text style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FA",
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8FA",
    gap: 12,
  },

  loadingText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
  },

  header: {
    minHeight: 132,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 30,
    flexDirection: "row",
    alignItems: "center",
  },

  headerIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor:
      "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.32)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  headerCopy: {
    flex: 1,
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: "#FFF7E8",
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },

  progressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#EDF0F3",
    marginBottom: 14,
    elevation: 2,
  },

  progressItem: {
    alignItems: "center",
    width: 64,
  },

  progressCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E58A13",
  },

  progressNumber: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  progressLabel: {
    marginTop: 6,
    color: "#72502B",
    fontSize: 11,
    fontWeight: "800",
  },

  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#F2C675",
    marginTop: 13,
    marginHorizontal: 2,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EBEFF3",
    elevation: 2,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#FFF3DE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  sectionTitle: {
    flex: 1,
    color: "#17243A",
    fontSize: 16,
    fontWeight: "900",
  },

  required: {
    color: "#E53D4F",
  },

  segmentRow: {
    flexDirection: "row",
    gap: 10,
  },

  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  segmentButtonActive: {
    borderColor: "#E58A13",
    backgroundColor: "#E58A13",
  },

  segmentText: {
    color: "#526174",
    fontSize: 13,
    fontWeight: "800",
  },

  segmentTextActive: {
    color: "#FFFFFF",
  },

  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  option: {
    width: "31%",
    minHeight: 84,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E6EBF0",
    backgroundColor: "#FAFBFC",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },

  optionActive: {
    borderColor: "#E58A13",
    backgroundColor: "#FFF7E8",
  },

  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFF0D4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  optionIconActive: {
    backgroundColor: "#E58A13",
  },

  optionText: {
    color: "#526174",
    fontSize: 11.5,
    fontWeight: "800",
  },

  optionTextActive: {
    color: "#9A580A",
  },

  label: {
    color: "#25334A",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 8,
  },

  urgencyRow: {
    flexDirection: "row",
    gap: 8,
  },

  urgencyButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  urgencyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  urgencyText: {
    fontSize: 12,
    fontWeight: "900",
  },

  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    backgroundColor: "#FBFCFD",
    paddingHorizontal: 14,
    color: "#17243A",
    fontSize: 14,
    fontWeight: "600",
  },

  textArea: {
    minHeight: 124,
    paddingTop: 13,
    textAlignVertical: "top",
  },

  counter: {
    alignSelf: "flex-end",
    marginTop: 5,
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },

  locationCard: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0C47A",
    backgroundColor: "#FFF9ED",
    padding: 12,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  locationCardReady: {
    borderColor: "#80D4C4",
    backgroundColor: "#EDFAF7",
  },

  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E58A13",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  locationIconReady: {
    backgroundColor: "#16927A",
  },

  locationCopy: {
    flex: 1,
  },

  locationTitle: {
    color: "#1D2A40",
    fontSize: 13.5,
    fontWeight: "900",
  },

  locationSubtitle: {
    color: "#64748B",
    marginTop: 3,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },

  privacyCard: {
    borderRadius: 14,
    backgroundColor: "#EAF8F5",
    padding: 12,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  privacyText: {
    flex: 1,
    color: "#376B65",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "700",
  },

  reviewCard: {
    borderRadius: 18,
    backgroundColor: "#FFF8E9",
    borderWidth: 1,
    borderColor: "#F4D79E",
    padding: 15,
    marginBottom: 14,
  },

  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  reviewTitle: {
    color: "#6B420E",
    fontSize: 14,
    fontWeight: "900",
  },

  summaryRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F4E2BC",
  },

  summaryLabel: {
    color: "#80633D",
    fontSize: 12,
    fontWeight: "700",
  },

  summaryValue: {
    maxWidth: "58%",
    color: "#3E2C16",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },

  submitButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#E88713",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    elevation: 4,
  },

  submitDisabled: {
    backgroundColor: "#F2B96C",
  },

  submitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  footerNote: {
    color: "#7B8798",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 12,
    marginTop: 14,
  },
});