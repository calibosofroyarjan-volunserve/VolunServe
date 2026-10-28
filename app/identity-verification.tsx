import { AppAlert } from "../lib/appDialog";
import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { db } from "../lib/firebase";
import {
  getIdentityStatus,
  onAuthChange,
  UserProfile,
} from "../lib/firebaseAuth";
import {
  CapturedIdentityMedia,
  getIdentityVerificationStatus,
  IdentityDocumentType,
  IdentityVerificationStatusResult,
  submitIdentityVerification,
} from "../lib/identityVerification";

const COLORS = {
  navy: "#0F2F5A",
  blue: "#2563EB",
  blueSoft: "#EFF6FF",
  teal: "#0F9F8F",
  tealDark: "#0F766E",
  tealSoft: "#ECFDF5",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  bg: "#F4F8FC",
  white: "#FFFFFF",
  success: "#15803D",
  successBg: "#DCFCE7",
  warning: "#92400E",
  warningBg: "#FEF3C7",
  danger: "#B91C1C",
  dangerBg: "#FEE2E2",
};

type WizardStep = 1 | 2 | 3;

const ID_TYPES: Array<{
  value: IdentityDocumentType;
  label: string;
  helper: string;
}> = [
  {
    value: "national_id",
    label: "National ID",
    helper: "PhilSys / National ID",
  },
  {
    value: "drivers_license",
    label: "Driver's License",
    helper: "Valid government-issued license",
  },
  {
    value: "passport",
    label: "Passport",
    helper: "Valid passport bio page",
  },
  {
    value: "other_government_id",
    label: "Other Government ID",
    helper: "UMID or another government-issued photo ID",
  },
];

function mediaFromAsset(
  asset: ImagePicker.ImagePickerAsset,
  fallbackPrefix: string,
): CapturedIdentityMedia {
  const guessedExtension =
    asset.mimeType === "image/png"
      ? "png"
      : asset.mimeType === "image/webp"
        ? "webp"
        : "jpg";

  return {
    uri: asset.uri,
    name:
      asset.fileName ||
      `${fallbackPrefix}-${Date.now()}.${guessedExtension}`,
    type: asset.mimeType || "image/jpeg",
    file: (asset as any).file,
  };
}

async function mediaFromCameraUri(
  uri: string,
): Promise<CapturedIdentityMedia> {
  const name = `identity-face-scan-${Date.now()}.jpg`;

  if (
    Platform.OS === "web" &&
    typeof fetch === "function"
  ) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const type = blob.type || "image/jpeg";

      const file =
        typeof File !== "undefined"
          ? new File(
              [blob],
              name,
              {
                type,
              },
            )
          : blob;

      return {
        uri,
        name,
        type,
        file,
      };
    } catch {
      // Fall through to the native-style multipart object.
    }
  }

  return {
    uri,
    name,
    type: "image/jpeg",
  };
}

function scoreLabel(value?: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "Not available";
  }

  const normalized =
    value <= 1
      ? value * 100
      : value;

  return `${Math.max(
    0,
    Math.min(
      100,
      normalized,
    ),
  ).toFixed(1)}%`;
}

export default function IdentityVerification() {
  const router = useRouter();

  const cameraRef =
    useRef<any>(null);

  const [
    cameraPermission,
    requestCameraPermission,
  ] =
    useCameraPermissions();

  const [profile, setProfile] =
    useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] =
    useState(true);

  const [step, setStep] =
    useState<WizardStep>(1);

  const [idType, setIdType] =
    useState<IdentityDocumentType>("national_id");
  const [idDocument, setIdDocument] =
    useState<CapturedIdentityMedia | null>(null);
  const [selfie, setSelfie] =
    useState<CapturedIdentityMedia | null>(null);

  const [consent, setConsent] =
    useState(false);
  const [pickingId, setPickingId] =
    useState(false);
  const [pickingSelfie, setPickingSelfie] =
    useState(false);
  const [cameraReady, setCameraReady] =
    useState(false);
  const [submitting, setSubmitting] =
    useState(false);
  const [checkingStatus, setCheckingStatus] =
    useState(false);
  const [statusResult, setStatusResult] =
    useState<IdentityVerificationStatusResult | null>(null);
  const [localMessage, setLocalMessage] =
    useState("");

  useEffect(() => {
    let stopProfile:
      | (() => void)
      | undefined;

    const stopAuth =
      onAuthChange(
        (user) => {
          if (stopProfile) {
            stopProfile();
            stopProfile =
              undefined;
          }

          if (!user) {
            setProfile(null);
            setLoadingProfile(false);
            return;
          }

          setLoadingProfile(true);

          stopProfile =
            onSnapshot(
              doc(
                db,
                "users",
                user.uid,
              ),
              (snapshot) => {
                setProfile(
                  snapshot.exists()
                    ? (snapshot.data() as UserProfile)
                    : null,
                );
                setLoadingProfile(false);
              },
              (error) => {
                console.log(
                  "Identity profile listener error:",
                  error,
                );
                setLoadingProfile(false);
              },
            );
        },
      );

    return () => {
      stopAuth();

      if (stopProfile) {
        stopProfile();
      }
    };
  }, []);

  const identityStatus =
    getIdentityStatus(profile);

  const effectiveStatus =
    statusResult?.identityStatus ||
    identityStatus;

  const selectedIdLabel =
    useMemo(
      () =>
        ID_TYPES.find(
          (item) =>
            item.value ===
            idType,
        )?.label ||
        "Government ID",
      [idType],
    );

  const refreshStatus =
    async (
      silent = false,
    ) => {
      if (checkingStatus) {
        return;
      }

      try {
        setCheckingStatus(true);

        const result =
          await getIdentityVerificationStatus();

        setStatusResult(result);

        if (
          !silent &&
          result.message
        ) {
          setLocalMessage(
            result.message,
          );
        }
      } catch (
        error: any
      ) {
        if (!silent) {
          AppAlert.alert(
            "Unable to Check Status",
            error?.message ||
              "Identity verification status could not be loaded.",
          );
        }
      } finally {
        setCheckingStatus(false);
      }
    };

  useEffect(() => {
    if (
      !profile ||
      identityStatus ===
        "basic"
    ) {
      return;
    }

    void refreshStatus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile,
    identityStatus,
  ]);

  const chooseIdDocument = async () => {
    if (pickingId || submitting) return;
    try {
      setPickingId(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        AppAlert.alert("Camera Required", "Allow camera access to scan your physical government ID.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.92,
        cameraType: ImagePicker.CameraType.back,
      });
      if (!result.canceled && result.assets[0]) {
        setIdDocument(mediaFromAsset(result.assets[0], "government-id-camera"));
        setLocalMessage("");
      }
    } catch (error: any) {
      AppAlert.alert("ID Camera Failed", error?.message || "Unable to scan the government ID.");
    } finally {
      setPickingId(false);
    }
  };

  const openFaceScan =
    async () => {
      if (!idDocument) {
        AppAlert.alert(
          "Government ID Required",
          "Scan a clear government ID using your camera before starting the face scan.",
        );
        return;
      }

      setSelfie(null);
      setCameraReady(false);
      setStep(2);

      if (
        !cameraPermission?.granted
      ) {
        try {
          await requestCameraPermission();
        } catch {
          // The step itself will show the permission fallback.
        }
      }
    };

  const captureFace =
    async () => {
      if (
        pickingSelfie ||
        submitting
      ) {
        return;
      }

      if (
        !cameraPermission
          ?.granted
      ) {
        const permission =
          await requestCameraPermission();

        if (
          !permission.granted
        ) {
          AppAlert.alert(
            "Camera Permission Required",
            "Allow camera access to complete your face scan.",
          );
          return;
        }
      }

      if (
        !cameraRef.current
      ) {
        AppAlert.alert(
          "Camera Not Ready",
          "Wait a moment for the camera preview to load.",
        );
        return;
      }

      try {
        setPickingSelfie(true);

        const photo =
          await cameraRef.current.takePictureAsync(
            {
              quality:
                0.92,
              skipProcessing:
                false,
            },
          );

        if (
          !photo?.uri
        ) {
          throw new Error(
            "The camera did not return a face photo.",
          );
        }

        const media =
          await mediaFromCameraUri(
            photo.uri,
          );

        setSelfie(media);
        setLocalMessage("");
      } catch (
        error: any
      ) {
        AppAlert.alert(
          "Unable to Capture Face",
          error?.message ||
            "The face scan photo could not be captured.",
        );
      } finally {
        setPickingSelfie(false);
      }
    };

  const submitVerification =
    async () => {
      if (submitting) {
        return;
      }

      if (!idDocument) {
        setStep(1);
        AppAlert.alert(
          "Government ID Required",
          "Select a clear image of your government-issued ID.",
        );
        return;
      }

      if (!selfie) {
        setStep(2);
        AppAlert.alert(
          "Face Scan Required",
          "Capture a clear face scan before starting AI verification.",
        );
        return;
      }

      if (!consent) {
        AppAlert.alert(
          "Consent Required",
          "Confirm that VolunServe may process the submitted identity images for account verification.",
        );
        return;
      }

      try {
        setStep(3);
        setSubmitting(true);
        setLocalMessage("");

        const result =
          await submitIdentityVerification(
            {
              idType,
              idDocument,
              selfie,
            },
          );

        setStatusResult({
          identityStatus:
            result.status,
          identityVerified:
            result.status ===
            "verified",
          verificationId:
            result.verificationId,
          decision:
            result.decision,
          matchScore:
            result.matchScore,
          livenessScore:
            result.livenessScore,
          message:
            result.message,
        });

        setLocalMessage(
          result.message ||
            (
              result.status ===
              "verified"
                ? "Identity verification completed successfully."
                : "Your submission is pending LGU/Admin review."
            ),
        );

        if (
          result.status ===
          "verified"
        ) {
          setIdDocument(null);
          setSelfie(null);
          setConsent(false);
        }
      } catch (
        error: any
      ) {
        setStep(2);

        AppAlert.alert(
          "Verification Not Completed",
          error?.message ||
            "Identity verification could not be completed.",
        );
      } finally {
        setSubmitting(false);
      }
    };

  if (
    loadingProfile
  ) {
    return (
      <View
        style={
          styles.centered
        }
      >
        <ActivityIndicator
          size="large"
          color={
            COLORS.teal
          }
        />
        <Text
          style={
            styles.centeredText
          }
        >
          Loading identity status...
        </Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View
        style={
          styles.centered
        }
      >
        <Ionicons
          name="person-circle-outline"
          size={54}
          color="#94A3B8"
        />
        <Text
          style={
            styles.statusTitle
          }
        >
          Account unavailable
        </Text>
        <Text
          style={
            styles.centeredText
          }
        >
          Sign in again before opening identity verification.
        </Text>
        <TouchableOpacity
          style={
            styles.primaryButton
          }
          onPress={() =>
            router.replace(
              "/login",
            )
          }
          activeOpacity={
            0.85
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            Go to Sign In
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (
    effectiveStatus ===
    "verified"
  ) {
    return (
      <StatusScreen
        icon="checkmark-circle"
        title="Verified Resident"
        message={
          localMessage ||
          statusResult?.message ||
          "Your identity has been successfully verified. You now have access to verified resident features."
        }
        background={
          COLORS.successBg
        }
        color={
          COLORS.success
        }
        badge="Verified"
        matchScore={
          statusResult
            ?.matchScore
        }
        primaryLabel="Back to Profile"
        primaryAction={() =>
          router.back()
        }
      />
    );
  }

  if (
    effectiveStatus ===
    "pending"
  ) {
    return (
      <StatusScreen
        icon="hourglass-outline"
        title="Verification in Review"
        message={
          localMessage ||
          statusResult?.message ||
          "Your identity verification has been submitted and is currently under review. Please wait for the final result."
        }
        background={
          COLORS.warningBg
        }
        color={
          COLORS.warning
        }
        badge="Pending"
        matchScore={
          statusResult
            ?.matchScore
        }
        primaryLabel={
          checkingStatus
            ? "Checking..."
            : "Check Status"
        }
        primaryAction={() =>
          void refreshStatus()
        }
        loading={
          checkingStatus
        }
        secondaryLabel="Back to Profile"
        secondaryAction={() =>
          router.back()
        }
      />
    );
  }

  return (
    <ScrollView
      style={
        styles.screen
      }
      contentContainerStyle={
        styles.page
      }
      showsVerticalScrollIndicator={
        false
      }
    >
      <View
        style={
          styles.topBar
        }
      >
        <TouchableOpacity
          style={
            styles.backButton
          }
          onPress={() =>
            step === 1
              ? router.back()
              : setStep(
                  step === 3
                    ? 2
                    : 1,
                )
          }
          activeOpacity={
            0.82
          }
          disabled={
            submitting
          }
        >
          <Ionicons
            name="arrow-back"
            size={19}
            color={
              COLORS.text
            }
          />
          <Text
            style={
              styles.backText
            }
          >
            {step === 1
              ? "Back to Profile"
              : "Back"}
          </Text>
        </TouchableOpacity>

        <View
          style={
            styles.securePill
          }
        >
          <Ionicons
            name="lock-closed"
            size={14}
            color={
              COLORS.tealDark
            }
          />
          <Text
            style={
              styles.securePillText
            }
          >
            Secure Verification
          </Text>
        </View>
      </View>

      <View
        style={
          styles.heading
        }
      >
        <Text
          style={
            styles.eyebrow
          }
        >
          VOLUNSERVE IDENTITY VERIFICATION
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Become a Verified Resident
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Complete the three-step identity check to unlock trusted
          Resident features and Volunteer application access.
        </Text>
      </View>

      <WizardProgress
        step={
          step
        }
      />

      {identityStatus ===
      "failed" ? (
        <View
          style={
            styles.failedNotice
          }
        >
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color={
              COLORS.danger
            }
          />
          <Text
            style={
              styles.failedNoticeText
            }
          >
            Your previous verification needs another attempt. Use a
            clear government ID photo and face scan with good lighting.
          </Text>
        </View>
      ) : null}

      {step === 1 ? (
        <UploadIdStep
          idType={
            idType
          }
          setIdType={
            setIdType
          }
          idDocument={
            idDocument
          }
          selectedIdLabel={
            selectedIdLabel
          }
          picking={
            pickingId
          }
          onPick={() =>
            void chooseIdDocument()
          }
          onNext={() =>
            void openFaceScan()
          }
          onRemove={() =>
            setIdDocument(
              null,
            )
          }
        />
      ) : null}

      {step === 2 ? (
        <FaceScanStep
          cameraRef={
            cameraRef
          }
          cameraPermission={
            cameraPermission
          }
          requestCameraPermission={
            requestCameraPermission
          }
          cameraReady={
            cameraReady
          }
          setCameraReady={
            setCameraReady
          }
          selfie={
            selfie
          }
          pickingSelfie={
            pickingSelfie
          }
          consent={
            consent
          }
          setConsent={
            setConsent
          }
          onCapture={() =>
            void captureFace()
          }
          onRetake={() => {
            setSelfie(null);
            setCameraReady(false);
          }}
          onVerify={() =>
            void submitVerification()
          }
        />
      ) : null}

      {step === 3 ? (
        <AiVerificationStep
          submitting={
            submitting
          }
          idLabel={
            selectedIdLabel
          }
        />
      ) : null}

      <View
        style={
          styles.privacyNote
        }
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={18}
          color={
            COLORS.tealDark
          }
        />
        <Text
          style={
            styles.privacyNoteText
          }
        >
          VolunServe performs a private 1-to-1 comparison between the
          face on your submitted ID and your face scan. It does not
          search a public face database.
        </Text>
      </View>
    </ScrollView>
  );
}

function WizardProgress({
  step,
}: {
  step: WizardStep;
}) {
  const items = [
    {
      number: 1,
      label: "Government ID",
    },
    {
      number: 2,
      label: "Face Scan",
    },
    {
      number: 3,
      label: "AI Verification",
    },
  ];

  return (
    <View
      style={
        styles.progressCard
      }
    >
      {items.map(
        (
          item,
          index,
        ) => {
          const active =
            step ===
            item.number;
          const complete =
            step >
            item.number;

          return (
            <React.Fragment
              key={
                item.number
              }
            >
              <View
                style={
                  styles.progressItem
                }
              >
                <View
                  style={[
                    styles.progressCircle,
                    (
                      active ||
                      complete
                    ) &&
                      styles.progressCircleActive,
                  ]}
                >
                  {complete ? (
                    <Ionicons
                      name="checkmark"
                      size={17}
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.progressNumber,
                        (
                          active ||
                          complete
                        ) &&
                          styles.progressNumberActive,
                      ]}
                    >
                      {item.number}
                    </Text>
                  )}
                </View>

                <Text
                  style={[
                    styles.progressLabel,
                    active &&
                      styles.progressLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </View>

              {index <
              items.length -
                1 ? (
                <View
                  style={[
                    styles.progressLine,
                    complete &&
                      styles.progressLineActive,
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        },
      )}
    </View>
  );
}

function UploadIdStep({
  idType,
  setIdType,
  idDocument,
  selectedIdLabel,
  picking,
  onPick,
  onNext,
  onRemove,
}: {
  idType: IdentityDocumentType;
  setIdType: (
    value:
      IdentityDocumentType,
  ) => void;
  idDocument:
    CapturedIdentityMedia | null;
  selectedIdLabel:
    string;
  picking:
    boolean;
  onPick:
    () => void;
  onNext:
    () => void;
  onRemove:
    () => void;
}) {
  return (
    <View
      style={
        styles.stepCard
      }
    >
      <View
        style={
          styles.stepHeader
        }
      >
        <View
          style={
            styles.stepHeaderNumber
          }
        >
          <Text
            style={
              styles.stepHeaderNumberText
            }
          >
            1
          </Text>
        </View>

        <View
          style={
            styles.stepHeaderCopy
          }
        >
          <Text
            style={
              styles.stepTitle
            }
          >
            Scan Government ID
          </Text>
          <Text
            style={
              styles.stepSubtitle
            }
          >
            Take or choose a clear photo of a valid government-issued
            ID with a visible face.
          </Text>
        </View>
      </View>

      <Text
        style={
          styles.fieldLabel
        }
      >
        ID Type
      </Text>

      <View
        style={
          styles.idTypeGrid
        }
      >
        {ID_TYPES.map(
          (
            item,
          ) => {
            const selected =
              idType ===
              item.value;

            return (
              <TouchableOpacity
                key={
                  item.value
                }
                style={[
                  styles.idTypeButton,
                  selected &&
                    styles.idTypeButtonActive,
                ]}
                activeOpacity={
                  0.82
                }
                onPress={() =>
                  setIdType(
                    item.value,
                  )
                }
              >
                <Ionicons
                  name={
                    selected
                      ? "checkmark-circle"
                      : "card-outline"
                  }
                  size={18}
                  color={
                    selected
                      ? COLORS.blue
                      : "#64748B"
                  }
                />
                <View
                  style={
                    styles.idTypeCopy
                  }
                >
                  <Text
                    style={[
                      styles.idTypeLabel,
                      selected &&
                        styles.idTypeLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={
                      styles.idTypeHelper
                    }
                  >
                    {item.helper}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          },
        )}
      </View>

      <Text
        style={
          styles.fieldLabel
        }
      >
        ID Photo
      </Text>

      {idDocument ? (
        <View
          style={
            styles.mediaPreviewCard
          }
        >
          <Image
            source={{
              uri:
                idDocument.uri,
            }}
            style={
              styles.idPreview
            }
            resizeMode="cover"
          />

          <View
            style={
              styles.mediaPreviewInfo
            }
          >
            <View
              style={
                styles.mediaSuccessIcon
              }
            >
              <Ionicons
                name="checkmark"
                size={17}
                color="#FFFFFF"
              />
            </View>

            <View
              style={
                styles.mediaPreviewCopy
              }
            >
              <Text
                style={
                  styles.mediaPreviewTitle
                }
              >
                {selectedIdLabel} selected
              </Text>
              <Text
                style={
                  styles.mediaPreviewText
                }
                numberOfLines={
                  1
                }
              >
                {idDocument.name}
              </Text>
            </View>

            <TouchableOpacity
              style={
                styles.iconButton
              }
              onPress={
                onRemove
              }
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={
                  COLORS.danger
                }
              />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={
            styles.uploadZone
          }
          activeOpacity={
            0.84
          }
          onPress={
            onPick
          }
          disabled={
            picking
          }
        >
          {picking ? (
            <ActivityIndicator
              color={
                COLORS.blue
              }
            />
          ) : (
            <>
              <View
                style={
                  styles.uploadIcon
                }
              >
                <Ionicons
                  name="image-outline"
                  size={29}
                  color={
                    COLORS.blue
                  }
                />
              </View>

              <Text
                style={
                  styles.uploadTitle
                }
              >
                Tap to open camera and scan ID
              </Text>

              <Text
                style={
                  styles.uploadText
                }
              >
                JPG, PNG or WebP · use a clear image with no glare
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <View
        style={
          styles.stepFooter
        }
      >
        <TouchableOpacity
          style={[
            styles.nextButton,
            !idDocument &&
              styles.disabledButton,
          ]}
          disabled={
            !idDocument
          }
          activeOpacity={
            0.85
          }
          onPress={
            onNext
          }
        >
          <Text
            style={
              styles.nextButtonText
            }
          >
            Next: Face Scan
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FaceScanStep({
  cameraRef,
  cameraPermission,
  requestCameraPermission,
  cameraReady,
  setCameraReady,
  selfie,
  pickingSelfie,
  consent,
  setConsent,
  onCapture,
  onRetake,
  onVerify,
}: {
  cameraRef:
    React.MutableRefObject<any>;
  cameraPermission:
    ReturnType<
      typeof useCameraPermissions
    >[0];
  requestCameraPermission:
    ReturnType<
      typeof useCameraPermissions
    >[1];
  cameraReady:
    boolean;
  setCameraReady:
    (
      value:
        boolean,
    ) => void;
  selfie:
    CapturedIdentityMedia | null;
  pickingSelfie:
    boolean;
  consent:
    boolean;
  setConsent:
    (
      value:
        boolean,
    ) => void;
  onCapture:
    () => void;
  onRetake:
    () => void;
  onVerify:
    () => void;
}) {
  const permissionGranted =
    cameraPermission
      ?.granted ===
    true;

  return (
    <View
      style={
        styles.stepCard
      }
    >
      <View
        style={
          styles.stepHeader
        }
      >
        <View
          style={
            styles.stepHeaderNumber
          }
        >
          <Text
            style={
              styles.stepHeaderNumberText
            }
          >
            2
          </Text>
        </View>

        <View
          style={
            styles.stepHeaderCopy
          }
        >
          <Text
            style={
              styles.stepTitle
            }
          >
            Face Scan
          </Text>
          <Text
            style={
              styles.stepSubtitle
            }
          >
            Position your face inside the oval and look directly at the
            camera in a well-lit area.
          </Text>
        </View>
      </View>

      <View
        style={
          styles.scanGrid
        }
      >
        <View
          style={
            styles.cameraCard
          }
        >
          {selfie ? (
            <Image
              source={{
                uri:
                  selfie.uri,
              }}
              style={
                styles.cameraPreview
              }
              resizeMode="cover"
            />
          ) : permissionGranted ? (
            <CameraView
              ref={
                cameraRef
              }
              style={
                styles.cameraPreview
              }
              facing="front"
              onCameraReady={() =>
                setCameraReady(
                  true,
                )
              }
            />
          ) : (
            <View
              style={
                styles.cameraPermissionCard
              }
            >
              <Ionicons
                name="camera-outline"
                size={42}
                color="#64748B"
              />
              <Text
                style={
                  styles.cameraPermissionTitle
                }
              >
                Camera access required
              </Text>
              <Text
                style={
                  styles.cameraPermissionText
                }
              >
                Allow camera access to use the face scan on this device.
              </Text>
              <TouchableOpacity
                style={
                  styles.cameraPermissionButton
                }
                onPress={() =>
                  void requestCameraPermission()
                }
              >
                <Text
                  style={
                    styles.cameraPermissionButtonText
                  }
                >
                  Allow Camera
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!selfie &&
          permissionGranted ? (
            <View
              pointerEvents="none"
              style={
                styles.scanOverlay
              }
            >
              <View
                style={
                  styles.faceOval
                }
              />

              <View
                style={[
                  styles.scanCorner,
                  styles.scanCornerTopLeft,
                ]}
              />
              <View
                style={[
                  styles.scanCorner,
                  styles.scanCornerTopRight,
                ]}
              />
              <View
                style={[
                  styles.scanCorner,
                  styles.scanCornerBottomLeft,
                ]}
              />
              <View
                style={[
                  styles.scanCorner,
                  styles.scanCornerBottomRight,
                ]}
              />

              <View
                style={
                  styles.scanHintPill
                }
              >
                <View
                  style={
                    styles.scanHintDot
                  }
                />
                <Text
                  style={
                    styles.scanHintText
                  }
                >
                  {cameraReady
                    ? "Center your face"
                    : "Starting camera..."}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View
          style={
            styles.requirementsCard
          }
        >
          <Text
            style={
              styles.requirementsTitle
            }
          >
            Requirements
          </Text>

          <Requirement
            text="Look directly at the camera"
          />
          <Requirement
            text="Keep your face inside the oval"
          />
          <Requirement
            text="Use good, even lighting"
          />
          <Requirement
            text="Remove glasses, mask, or hat"
          />
          <Requirement
            text="Only one person in frame"
          />

          <View
            style={
              styles.captureTruthNote
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={17}
              color="#475569"
            />
            <Text
              style={
                styles.captureTruthText
              }
            >
              This step captures a live camera photo for face comparison.
              It does not claim standalone liveness detection.
            </Text>
          </View>
        </View>
      </View>

      <View
        style={
          styles.captureActions
        }
      >
        {selfie ? (
          <TouchableOpacity
            style={
              styles.secondaryWideButton
            }
            activeOpacity={
              0.84
            }
            onPress={
              onRetake
            }
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color={
                COLORS.blue
              }
            />
            <Text
              style={
                styles.secondaryWideButtonText
              }
            >
              Retake Face Scan
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.captureButton,
              (
                !permissionGranted ||
                !cameraReady ||
                pickingSelfie
              ) &&
                styles.disabledButton,
            ]}
            disabled={
              !permissionGranted ||
              !cameraReady ||
              pickingSelfie
            }
            activeOpacity={
              0.84
            }
            onPress={
              onCapture
            }
          >
            {pickingSelfie ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <Ionicons
                  name="camera"
                  size={19}
                  color="#FFFFFF"
                />
                <Text
                  style={
                    styles.captureButtonText
                  }
                >
                  Capture Photo
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}


      </View>

      <TouchableOpacity
        style={
          styles.consentRow
        }
        activeOpacity={
          0.85
        }
        onPress={() =>
          setConsent(
            !consent,
          )
        }
      >
        <View
          style={[
            styles.checkbox,
            consent &&
              styles.checkboxActive,
          ]}
        >
          {consent ? (
            <Ionicons
              name="checkmark"
              size={15}
              color="#FFFFFF"
            />
          ) : null}
        </View>

        <Text
          style={
            styles.consentText
          }
        >
          I consent to VolunServe processing my submitted government ID
          and face scan for private 1-to-1 identity verification.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.verifyButton,
          (
            !selfie ||
            !consent
          ) &&
            styles.disabledButton,
        ]}
        disabled={
          !selfie ||
          !consent
        }
        activeOpacity={
          0.85
        }
        onPress={
          onVerify
        }
      >
        <Ionicons
          name="scan-outline"
          size={19}
          color="#FFFFFF"
        />
        <Text
          style={
            styles.verifyButtonText
          }
        >
          Start AI Verification
        </Text>
        <Ionicons
          name="arrow-forward"
          size={18}
          color="#FFFFFF"
        />
      </TouchableOpacity>
    </View>
  );
}

function Requirement({
  text,
}: {
  text:
    string;
}) {
  return (
    <View
      style={
        styles.requirementRow
      }
    >
      <View
        style={
          styles.requirementCheck
        }
      >
        <Ionicons
          name="checkmark"
          size={13}
          color="#FFFFFF"
        />
      </View>
      <Text
        style={
          styles.requirementText
        }
      >
        {text}
      </Text>
    </View>
  );
}

function AiVerificationStep({
  submitting,
  idLabel,
}: {
  submitting:
    boolean;
  idLabel:
    string;
}) {
  return (
    <View
      style={[
        styles.stepCard,
        styles.aiCard,
      ]}
    >
      <View
        style={
          styles.stepHeader
        }
      >
        <View
          style={
            styles.stepHeaderNumber
          }
        >
          <Text
            style={
              styles.stepHeaderNumberText
            }
          >
            3
          </Text>
        </View>

        <View
          style={
            styles.stepHeaderCopy
          }
        >
          <Text
            style={
              styles.stepTitle
            }
          >
            AI Verification
          </Text>
          <Text
            style={
              styles.stepSubtitle
            }
          >
            VolunServe is analyzing your {idLabel} face and face scan
            using private 1-to-1 comparison.
          </Text>
        </View>
      </View>

      <View
        style={
          styles.aiCenter
        }
      >
        <View
          style={
            styles.aiScanIcon
          }
        >
          {submitting ? (
            <ActivityIndicator
              size="large"
              color={
                COLORS.blue
              }
            />
          ) : (
            <Ionicons
              name="scan-outline"
              size={38}
              color={
                COLORS.blue
              }
            />
          )}
        </View>

        <Text
          style={
            styles.aiTitle
          }
        >
          Comparing faces...
        </Text>

        <Text
          style={
            styles.aiText
          }
        >
          Checking image quality, detecting facial landmarks, and
          calculating a private match score.
        </Text>

        <View
          style={
            styles.progressTrack
          }
        >
          <View
            style={
              styles.progressFill
            }
          />
        </View>

        <Text
          style={
            styles.aiFootnote
          }
        >
          This may take a few seconds.
        </Text>
      </View>
    </View>
  );
}

function StatusScreen({
  icon,
  title,
  message,
  background,
  color,
  badge,
  matchScore,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryAction,
  loading = false,
}: {
  icon:
    React.ComponentProps<
      typeof Ionicons
    >["name"];
  title:
    string;
  message:
    string;
  background:
    string;
  color:
    string;
  badge:
    string;
  matchScore?:
    number;
  primaryLabel:
    string;
  primaryAction:
    () => void;
  secondaryLabel?:
    string;
  secondaryAction?:
    () => void;
  loading?:
    boolean;
}) {
  return (
    <View
      style={
        styles.statusScreen
      }
    >
      <View
        style={[
          styles.statusCard,
          {
            borderColor:
              background,
          },
        ]}
      >
        <View
          style={[
            styles.statusIcon,
            {
              backgroundColor:
                background,
            },
          ]}
        >
          <Ionicons
            name={
              icon
            }
            size={42}
            color={
              color
            }
          />
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                background,
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color,
              },
            ]}
          >
            {badge}
          </Text>
        </View>

        <Text
          style={
            styles.statusTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.statusMessage
          }
        >
          {message}
        </Text>

        {typeof matchScore ===
        "number" ? (
          <View
            style={
              styles.matchScoreCard
            }
          >
            <Text
              style={
                styles.matchScoreLabel
              }
            >
              AI face match score
            </Text>
            <Text
              style={
                styles.matchScoreValue
              }
            >
              {scoreLabel(
                matchScore,
              )}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={
            styles.primaryButton
          }
          onPress={
            primaryAction
          }
          disabled={
            loading
          }
          activeOpacity={
            0.85
          }
        >
          {loading ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text
              style={
                styles.primaryButtonText
              }
            >
              {primaryLabel}
            </Text>
          )}
        </TouchableOpacity>

        {secondaryLabel &&
        secondaryAction ? (
          <TouchableOpacity
            style={
              styles.statusSecondaryButton
            }
            onPress={
              secondaryAction
            }
            activeOpacity={
              0.85
            }
          >
            <Text
              style={
                styles.statusSecondaryButtonText
              }
            >
              {secondaryLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex:
        1,
      backgroundColor:
        COLORS.bg,
    },

    page: {
      width:
        "100%",
      maxWidth:
        1080,
      alignSelf:
        "center",
      paddingHorizontal:
        24,
      paddingTop:
        24,
      paddingBottom:
        70,
    },

    centered: {
      flex:
        1,
      minHeight:
        520,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        24,
      backgroundColor:
        COLORS.bg,
    },

    centeredText: {
      marginTop:
        10,
      maxWidth:
        480,
      color:
        COLORS.muted,
      fontSize:
        13,
      lineHeight:
        20,
      textAlign:
        "center",
    },

    topBar: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap:
        12,
      marginBottom:
        16,
    },

    backButton: {
      minHeight:
        40,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        7,
      paddingHorizontal:
        11,
      borderRadius:
        10,
      backgroundColor:
        "#FFFFFF",
      borderWidth:
        1,
      borderColor:
        COLORS.border,
    },

    backText: {
      color:
        COLORS.text,
      fontSize:
        12,
      fontWeight:
        "800",
    },

    securePill: {
      minHeight:
        34,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        6,
      paddingHorizontal:
        11,
      borderRadius:
        999,
      backgroundColor:
        COLORS.tealSoft,
    },

    securePillText: {
      color:
        COLORS.tealDark,
      fontSize:
        10.5,
      fontWeight:
        "900",
    },

    heading: {
      marginBottom:
        18,
    },

    eyebrow: {
      color:
        COLORS.tealDark,
      fontSize:
        10,
      fontWeight:
        "900",
      letterSpacing:
        1,
    },

    title: {
      marginTop:
        5,
      color:
        COLORS.navy,
      fontSize:
        29,
      fontWeight:
        "900",
      letterSpacing:
        -0.4,
    },

    subtitle: {
      marginTop:
        6,
      maxWidth:
        760,
      color:
        COLORS.muted,
      fontSize:
        13,
      lineHeight:
        20,
    },

    progressCard: {
      width:
        "100%",
      minHeight:
        86,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        18,
      paddingVertical:
        14,
      marginBottom:
        16,
      borderRadius:
        16,
      backgroundColor:
        "#FFFFFF",
      borderWidth:
        1,
      borderColor:
        COLORS.border,
    },

    progressItem: {
      alignItems:
        "center",
      minWidth:
        100,
    },

    progressCircle: {
      width:
        33,
      height:
        33,
      borderRadius:
        17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
      borderWidth:
        1,
      borderColor:
        "#CBD5E1",
    },

    progressCircleActive: {
      backgroundColor:
        COLORS.blue,
      borderColor:
        COLORS.blue,
    },

    progressNumber: {
      color:
        "#64748B",
      fontSize:
        11,
      fontWeight:
        "900",
    },

    progressNumberActive: {
      color:
        "#FFFFFF",
    },

    progressLabel: {
      marginTop:
        6,
      color:
        "#64748B",
      fontSize:
        10,
      fontWeight:
        "800",
      textAlign:
        "center",
    },

    progressLabelActive: {
      color:
        COLORS.blue,
    },

    progressLine: {
      flex:
        1,
      height:
        2,
      maxWidth:
        150,
      marginHorizontal:
        8,
      marginBottom:
        22,
      backgroundColor:
        "#E2E8F0",
    },

    progressLineActive: {
      backgroundColor:
        COLORS.blue,
    },

    failedNotice: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap:
        9,
      marginBottom:
        14,
      padding:
        13,
      borderRadius:
        12,
      backgroundColor:
        COLORS.dangerBg,
      borderWidth:
        1,
      borderColor:
        "#FECACA",
    },

    failedNoticeText: {
      flex:
        1,
      color:
        "#991B1B",
      fontSize:
        11.5,
      lineHeight:
        17,
    },

    stepCard: {
      padding:
        22,
      borderRadius:
        18,
      backgroundColor:
        "#FFFFFF",
      borderWidth:
        1,
      borderColor:
        COLORS.border,
      shadowColor:
        "#0F172A",
      shadowOpacity:
        0.04,
      shadowRadius:
        18,
      shadowOffset: {
        width:
          0,
        height:
          8,
      },
      elevation:
        2,
    },

    stepHeader: {
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap:
        12,
      marginBottom:
        20,
    },

    stepHeaderNumber: {
      width:
        36,
      height:
        36,
      borderRadius:
        18,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        COLORS.blue,
    },

    stepHeaderNumberText: {
      color:
        "#FFFFFF",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    stepHeaderCopy: {
      flex:
        1,
    },

    stepTitle: {
      color:
        COLORS.navy,
      fontSize:
        18,
      fontWeight:
        "900",
    },

    stepSubtitle: {
      marginTop:
        4,
      color:
        COLORS.muted,
      fontSize:
        12,
      lineHeight:
        18,
    },

    fieldLabel: {
      marginTop:
        2,
      marginBottom:
        8,
      color:
        "#334155",
      fontSize:
        11,
      fontWeight:
        "900",
    },

    idTypeGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        9,
      marginBottom:
        19,
    },

    idTypeButton: {
      flex:
        1,
      minWidth:
        210,
      minHeight:
        62,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        9,
      paddingHorizontal:
        12,
      borderRadius:
        12,
      borderWidth:
        1,
      borderColor:
        COLORS.border,
      backgroundColor:
        "#FFFFFF",
    },

    idTypeButtonActive: {
      borderColor:
        "#93C5FD",
      backgroundColor:
        COLORS.blueSoft,
    },

    idTypeCopy: {
      flex:
        1,
    },

    idTypeLabel: {
      color:
        "#334155",
      fontSize:
        11.5,
      fontWeight:
        "900",
    },

    idTypeLabelActive: {
      color:
        "#1D4ED8",
    },

    idTypeHelper: {
      marginTop:
        2,
      color:
        "#94A3B8",
      fontSize:
        9.5,
    },

    uploadZone: {
      minHeight:
        230,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        24,
      borderRadius:
        15,
      borderWidth:
        1.5,
      borderStyle:
        "dashed",
      borderColor:
        "#BFDBFE",
      backgroundColor:
        "#F8FBFF",
    },

    uploadIcon: {
      width:
        60,
      height:
        60,
      borderRadius:
        16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#DBEAFE",
    },

    uploadTitle: {
      marginTop:
        12,
      color:
        COLORS.navy,
      fontSize:
        13,
      fontWeight:
        "900",
    },

    uploadText: {
      marginTop:
        4,
      color:
        "#64748B",
      fontSize:
        10.5,
      textAlign:
        "center",
    },

    mediaPreviewCard: {
      overflow:
        "hidden",
      borderRadius:
        15,
      borderWidth:
        1,
      borderColor:
        "#BFDBFE",
      backgroundColor:
        "#FFFFFF",
    },

    idPreview: {
      width:
        "100%",
      height:
        240,
      backgroundColor:
        "#E2E8F0",
    },

    mediaPreviewInfo: {
      minHeight:
        65,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        10,
      paddingHorizontal:
        14,
      paddingVertical:
        10,
    },

    mediaSuccessIcon: {
      width:
        31,
      height:
        31,
      borderRadius:
        16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#16A34A",
    },

    mediaPreviewCopy: {
      flex:
        1,
      minWidth:
        0,
    },

    mediaPreviewTitle: {
      color:
        COLORS.text,
      fontSize:
        11.5,
      fontWeight:
        "900",
    },

    mediaPreviewText: {
      marginTop:
        2,
      color:
        "#64748B",
      fontSize:
        9.5,
    },

    iconButton: {
      width:
        36,
      height:
        36,
      borderRadius:
        10,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FEF2F2",
    },

    stepFooter: {
      marginTop:
        17,
      flexDirection:
        "row",
      justifyContent:
        "flex-end",
    },

    nextButton: {
      minHeight:
        47,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        8,
      paddingHorizontal:
        18,
      borderRadius:
        11,
      backgroundColor:
        COLORS.blue,
    },

    nextButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    scanGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        14,
    },

    cameraCard: {
      flex:
        1.45,
      minWidth:
        330,
      height:
        430,
      overflow:
        "hidden",
      position:
        "relative",
      borderRadius:
        16,
      backgroundColor:
        "#0F172A",
      borderWidth:
        1,
      borderColor:
        "#CBD5E1",
    },

    cameraPreview: {
      width:
        "100%",
      height:
        "100%",
    },

    cameraPermissionCard: {
      flex:
        1,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        24,
      backgroundColor:
        "#F8FAFC",
    },

    cameraPermissionTitle: {
      marginTop:
        10,
      color:
        COLORS.text,
      fontSize:
        13,
      fontWeight:
        "900",
    },

    cameraPermissionText: {
      marginTop:
        5,
      maxWidth:
        280,
      color:
        "#64748B",
      fontSize:
        10.5,
      lineHeight:
        16,
      textAlign:
        "center",
    },

    cameraPermissionButton: {
      marginTop:
        14,
      minHeight:
        40,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        15,
      borderRadius:
        10,
      backgroundColor:
        COLORS.blue,
    },

    cameraPermissionButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        11,
      fontWeight:
        "900",
    },

    scanOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    faceOval: {
      width:
        235,
      height:
        310,
      borderRadius:
        118,
      borderWidth:
        3,
      borderColor:
        "#FFFFFF",
      backgroundColor:
        "transparent",
    },

    scanCorner: {
      position:
        "absolute",
      width:
        34,
      height:
        34,
      borderColor:
        "#A7F3D0",
    },

    scanCornerTopLeft: {
      top:
        24,
      left:
        24,
      borderTopWidth:
        4,
      borderLeftWidth:
        4,
      borderTopLeftRadius:
        7,
    },

    scanCornerTopRight: {
      top:
        24,
      right:
        24,
      borderTopWidth:
        4,
      borderRightWidth:
        4,
      borderTopRightRadius:
        7,
    },

    scanCornerBottomLeft: {
      bottom:
        24,
      left:
        24,
      borderBottomWidth:
        4,
      borderLeftWidth:
        4,
      borderBottomLeftRadius:
        7,
    },

    scanCornerBottomRight: {
      bottom:
        24,
      right:
        24,
      borderBottomWidth:
        4,
      borderRightWidth:
        4,
      borderBottomRightRadius:
        7,
    },

    scanHintPill: {
      position:
        "absolute",
      bottom:
        18,
      minHeight:
        31,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        6,
      paddingHorizontal:
        11,
      borderRadius:
        999,
      backgroundColor:
        "rgba(15,23,42,0.72)",
    },

    scanHintDot: {
      width:
        8,
      height:
        8,
      borderRadius:
        4,
      backgroundColor:
        "#34D399",
    },

    scanHintText: {
      color:
        "#FFFFFF",
      fontSize:
        10,
      fontWeight:
        "900",
    },

    requirementsCard: {
      flex:
        0.9,
      minWidth:
        250,
      minHeight:
        300,
      padding:
        17,
      borderRadius:
        15,
      backgroundColor:
        "#F8FAFC",
      borderWidth:
        1,
      borderColor:
        COLORS.border,
    },

    requirementsTitle: {
      marginBottom:
        10,
      color:
        COLORS.navy,
      fontSize:
        12.5,
      fontWeight:
        "900",
    },

    requirementRow: {
      minHeight:
        37,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        9,
    },

    requirementCheck: {
      width:
        21,
      height:
        21,
      borderRadius:
        11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#10B981",
    },

    requirementText: {
      flex:
        1,
      color:
        "#334155",
      fontSize:
        10.5,
      fontWeight:
        "700",
    },

    captureTruthNote: {
      marginTop:
        12,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap:
        7,
      padding:
        10,
      borderRadius:
        10,
      backgroundColor:
        "#FFFFFF",
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
    },

    captureTruthText: {
      flex:
        1,
      color:
        "#64748B",
      fontSize:
        9.5,
      lineHeight:
        14,
    },

    captureActions: {
      marginTop:
        14,
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        9,
    },

    captureButton: {
      minHeight:
        47,
      flex:
        1,
      minWidth:
        220,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        8,
      borderRadius:
        11,
      backgroundColor:
        COLORS.blue,
    },

    captureButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    secondaryWideButton: {
      minHeight:
        47,
      flex:
        1,
      minWidth:
        220,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        8,
      borderRadius:
        11,
      borderWidth:
        1,
      borderColor:
        "#93C5FD",
      backgroundColor:
        "#EFF6FF",
    },

    secondaryWideButtonText: {
      color:
        COLORS.blue,
      fontSize:
        11.5,
      fontWeight:
        "900",
    },

    uploadSelfieButton: {
      minHeight:
        47,
      flex:
        1,
      minWidth:
        220,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        8,
      borderRadius:
        11,
      borderWidth:
        1,
      borderColor:
        "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
    },

    uploadSelfieButtonText: {
      color:
        "#475569",
      fontSize:
        11.5,
      fontWeight:
        "900",
    },

    consentRow: {
      marginTop:
        16,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap:
        9,
      padding:
        13,
      borderRadius:
        11,
      backgroundColor:
        "#F8FAFC",
      borderWidth:
        1,
      borderColor:
        COLORS.border,
    },

    checkbox: {
      width:
        23,
      height:
        23,
      borderRadius:
        7,
      borderWidth:
        2,
      borderColor:
        "#CBD5E1",
      alignItems:
        "center",
      justifyContent:
        "center",
      marginTop:
        1,
    },

    checkboxActive: {
      borderColor:
        COLORS.teal,
      backgroundColor:
        COLORS.teal,
    },

    consentText: {
      flex:
        1,
      color:
        "#334155",
      fontSize:
        10.5,
      lineHeight:
        16,
      fontWeight:
        "700",
    },

    verifyButton: {
      minHeight:
        50,
      marginTop:
        13,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        8,
      borderRadius:
        12,
      backgroundColor:
        COLORS.teal,
    },

    verifyButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        12.5,
      fontWeight:
        "900",
    },

    disabledButton: {
      opacity:
        0.45,
    },

    aiCard: {
      minHeight:
        430,
    },

    aiCenter: {
      flex:
        1,
      minHeight:
        320,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        24,
    },

    aiScanIcon: {
      width:
        94,
      height:
        94,
      borderRadius:
        47,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        COLORS.blueSoft,
      borderWidth:
        5,
      borderColor:
        "#DBEAFE",
    },

    aiTitle: {
      marginTop:
        17,
      color:
        COLORS.navy,
      fontSize:
        17,
      fontWeight:
        "900",
    },

    aiText: {
      marginTop:
        6,
      maxWidth:
        520,
      color:
        "#64748B",
      fontSize:
        11.5,
      lineHeight:
        18,
      textAlign:
        "center",
    },

    progressTrack: {
      width:
        "70%",
      maxWidth:
        430,
      height:
        7,
      marginTop:
        20,
      overflow:
        "hidden",
      borderRadius:
        999,
      backgroundColor:
        "#DBEAFE",
    },

    progressFill: {
      width:
        "58%",
      height:
        "100%",
      borderRadius:
        999,
      backgroundColor:
        COLORS.blue,
    },

    aiFootnote: {
      marginTop:
        8,
      color:
        "#94A3B8",
      fontSize:
        10,
    },

    privacyNote: {
      marginTop:
        14,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap:
        8,
      paddingHorizontal:
        4,
    },

    privacyNoteText: {
      flex:
        1,
      color:
        "#64748B",
      fontSize:
        10.5,
      lineHeight:
        16,
    },

    statusScreen: {
      flex:
        1,
      minHeight:
        590,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        24,
      backgroundColor:
        COLORS.bg,
    },

    statusCard: {
      width:
        "100%",
      maxWidth:
        620,
      alignItems:
        "center",
      padding:
        32,
      borderRadius:
        20,
      backgroundColor:
        "#FFFFFF",
      borderWidth:
        1,
      shadowColor:
        "#0F172A",
      shadowOpacity:
        0.05,
      shadowRadius:
        20,
      shadowOffset: {
        width:
          0,
        height:
          8,
      },
      elevation:
        3,
    },

    statusIcon: {
      width:
        86,
      height:
        86,
      borderRadius:
        43,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    statusBadge: {
      minHeight:
        29,
      marginTop:
        14,
      justifyContent:
        "center",
      paddingHorizontal:
        11,
      borderRadius:
        999,
    },

    statusBadgeText: {
      fontSize:
        10.5,
      fontWeight:
        "900",
    },

    statusTitle: {
      marginTop:
        14,
      color:
        COLORS.navy,
      fontSize:
        24,
      fontWeight:
        "900",
      textAlign:
        "center",
    },

    statusMessage: {
      marginTop:
        8,
      maxWidth:
        500,
      color:
        "#64748B",
      fontSize:
        12.5,
      lineHeight:
        19,
      textAlign:
        "center",
    },

    matchScoreCard: {
      minWidth:
        220,
      marginTop:
        16,
      alignItems:
        "center",
      padding:
        12,
      borderRadius:
        12,
      backgroundColor:
        "#F8FAFC",
      borderWidth:
        1,
      borderColor:
        COLORS.border,
    },

    matchScoreLabel: {
      color:
        "#64748B",
      fontSize:
        9.5,
      fontWeight:
        "800",
    },

    matchScoreValue: {
      marginTop:
        3,
      color:
        COLORS.navy,
      fontSize:
        19,
      fontWeight:
        "900",
    },

    primaryButton: {
      minWidth:
        210,
      minHeight:
        47,
      marginTop:
        18,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        18,
      borderRadius:
        11,
      backgroundColor:
        COLORS.teal,
    },

    primaryButtonText: {
      color:
        "#FFFFFF",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    statusSecondaryButton: {
      minWidth:
        210,
      minHeight:
        43,
      marginTop:
        8,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        18,
      borderRadius:
        11,
      borderWidth:
        1,
      borderColor:
        COLORS.border,
      backgroundColor:
        "#FFFFFF",
    },

    statusSecondaryButtonText: {
      color:
        "#475569",
      fontSize:
        11.5,
      fontWeight:
        "900",
    },
  });
