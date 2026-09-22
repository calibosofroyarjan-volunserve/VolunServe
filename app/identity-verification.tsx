import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
    useEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
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
    createIdentityVerificationSession,
    isTrustedIdentityVerificationUrl,
} from "../lib/identityVerification";

const COLORS = {
  navy:
    "#173A63",

  primary:
    "#4F46E5",

  primarySoft:
    "#EEF2FF",

  text:
    "#0F172A",

  muted:
    "#64748B",

  border:
    "#E2E8F0",

  bg:
    "#F4F7FB",

  white:
    "#FFFFFF",

  success:
    "#166534",

  successBg:
    "#DCFCE7",

  warning:
    "#92400E",

  warningBg:
    "#FEF3C7",

  danger:
    "#B91C1C",

  dangerBg:
    "#FEE2E2",
};

export default function IdentityVerification() {
  const router =
    useRouter();

  const [
    profile,
    setProfile,
  ] =
    useState<UserProfile | null>(
      null,
    );

  const [
    loadingProfile,
    setLoadingProfile,
  ] =
    useState(true);

  const [
    starting,
    setStarting,
  ] =
    useState(false);

  const [
    consent,
    setConsent,
  ] =
    useState(false);

  useEffect(
    () => {
      let stopProfile:
        | (() => void)
        | undefined;

      const stopAuth =
        onAuthChange(
          (user) => {
            if (
              stopProfile
            ) {
              stopProfile();

              stopProfile =
                undefined;
            }

            if (!user) {
              setProfile(
                null,
              );

              setLoadingProfile(
                false,
              );

              return;
            }

            setLoadingProfile(
              true,
            );

            stopProfile =
              onSnapshot(
                doc(
                  db,
                  "users",
                  user.uid,
                ),

                (
                  snapshot,
                ) => {
                  if (
                    snapshot.exists()
                  ) {
                    setProfile(
                      snapshot.data() as UserProfile,
                    );
                  } else {
                    setProfile(
                      null,
                    );
                  }

                  setLoadingProfile(
                    false,
                  );
                },

                (error) => {
                  console.log(
                    "Identity profile listener error:",
                    error,
                  );

                  setLoadingProfile(
                    false,
                  );
                },
              );
          },
        );

      return () => {
        stopAuth();

        if (
          stopProfile
        ) {
          stopProfile();
        }
      };
    },
    [],
  );

  const identityStatus =
    getIdentityStatus(
      profile,
    );

  const openVerification =
    async () => {
      if (
        !consent &&
        identityStatus !==
          "pending"
      ) {
        Alert.alert(
          "Consent Required",
          "Please confirm the identity verification consent before continuing.",
        );

        return;
      }

      if (starting) {
        return;
      }

      let webWindow: any =
        null;

      if (
        Platform.OS ===
          "web" &&
        typeof window !==
          "undefined"
      ) {
        webWindow =
          window.open(
            "",
            "_blank",
          );

        if (webWindow) {
          try {
            webWindow.document.title =
              "Opening secure verification";

            webWindow.document.body.innerHTML =
              `<div style="font-family:Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F7FB;color:#0F172A;text-align:center;padding:24px"><div><h2 style="margin:0 0 8px">Opening secure verification...</h2><p style="margin:0;color:#64748B">Please wait while VolunServe creates your Didit session.</p></div></div>`;
          } catch {
          }
        }
      }

      setStarting(
        true,
      );

      try {
        const session =
          await Promise.race([
            createIdentityVerificationSession(),
            new Promise<never>((_, reject) => {
              setTimeout(
                () =>
                  reject(
                    new Error(
                      "The verification service is taking too long to respond. Please try again.",
                    ),
                  ),
                65000,
              );
            }),
          ]);

        if (
          !isTrustedIdentityVerificationUrl(
            session.url,
          )
        ) {
          throw new Error(
            "The verification service returned an invalid verification link.",
          );
        }

        if (
          Platform.OS ===
            "web" &&
          typeof window !==
            "undefined"
        ) {
          if (
            webWindow &&
            !webWindow.closed
          ) {
            webWindow.location.replace(
              session.url,
            );
          } else {
            window.location.assign(
              session.url,
            );
          }

          return;
        }

        await Linking.openURL(
          session.url,
        );
      } catch (
        error: any
      ) {
        if (
          webWindow &&
          !webWindow.closed
        ) {
          webWindow.close();
        }

        Alert.alert(
          "Unable to Start Verification",
          error?.message ||
            "Identity verification could not be started.",
        );
      } finally {
        setStarting(
          false,
        );
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
            COLORS.primary
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
          Sign in again before starting identity verification.
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
    identityStatus ===
    "verified"
  ) {
    return (
      <StatusScreen
        icon="shield-checkmark-outline"
        title="Identity Verified"
        message="Your identity has been verified successfully. You can now return to your Profile and apply for Volunteer access."
        background={
          COLORS.successBg
        }
        color={
          COLORS.success
        }
        primaryLabel="Back to Profile"
        primaryAction={() =>
          router.back()
        }
      />
    );
  }

  if (
    identityStatus ===
    "pending"
  ) {
    return (
      <StatusScreen
        icon="time-outline"
        title="Verification In Progress"
        message="Your Didit verification session has already started. Complete the government ID, liveness, and face verification steps in the secure Didit page. Your status will update automatically after Didit sends the result."
        background={
          COLORS.warningBg
        }
        color={
          COLORS.warning
        }
        primaryLabel={
          starting
            ? "Opening..."
            : "Continue Verification"
        }
        primaryAction={() =>
          void openVerification()
        }
        loading={
          starting
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
      <TouchableOpacity
        style={
          styles.backButton
        }
        onPress={() =>
          router.back()
        }
        activeOpacity={
          0.8
        }
      >
        <Ionicons
          name="arrow-back"
          size={20}
          color={
            COLORS.text
          }
        />

        <Text
          style={
            styles.backText
          }
        >
          Back
        </Text>
      </TouchableOpacity>

      <View
        style={
          styles.hero
        }
      >
        <View
          style={
            styles.heroIcon
          }
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={31}
            color="#FFFFFF"
          />
        </View>

        <View
          style={
            styles.heroCopy
          }
        >
          <Text
            style={
              styles.heroEyebrow
            }
          >
            VOLUNSERVE IDENTITY VERIFICATION
          </Text>

          <Text
            style={
              styles.heroTitle
            }
          >
            Verify your identity
          </Text>

          <Text
            style={
              styles.heroText
            }
          >
            Identity verification is completed securely through Didit before a Resident can apply for Volunteer access.
          </Text>
        </View>
      </View>

      {identityStatus ===
      "failed" ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor:
                COLORS.dangerBg,
            },
          ]}
        >
          <Ionicons
            name="alert-circle-outline"
            size={22}
            color={
              COLORS.danger
            }
          />

          <View
            style={
              styles.noticeCopy
            }
          >
            <Text
              style={[
                styles.noticeTitle,
                {
                  color:
                    COLORS.danger,
                },
              ]}
            >
              Previous verification was not completed
            </Text>

            <Text
              style={
                styles.noticeText
              }
            >
              You can start another secure verification session and try again.
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={
          styles.stepsCard
        }
      >
        <Text
          style={
            styles.cardTitle
          }
        >
          Verification process
        </Text>

        <Text
          style={
            styles.cardDescription
          }
        >
          You will leave VolunServe temporarily and complete the following steps on Didit's secure verification page.
        </Text>

        <VerificationStep
          number="1"
          icon="card-outline"
          title="Government ID"
          text="Provide an accepted government-issued identity document."
        />

        <VerificationDivider />

        <VerificationStep
          number="2"
          icon="scan-outline"
          title="Liveness Check"
          text="Follow the secure camera instructions to confirm that a real person is present."
        />

        <VerificationDivider />

        <VerificationStep
          number="3"
          icon="person-circle-outline"
          title="1-to-1 Face Verification"
          text="Didit compares the live face capture with the photo on the submitted ID."
        />
      </View>

      <View
        style={
          styles.card
        }
      >
        <SectionHeader
          icon="lock-closed-outline"
          title="Secure verification"
        />

        <InfoRow
          icon="cloud-outline"
          title="Sensitive media stays with the verification provider"
          text="VolunServe does not ask you to upload the government ID or selfie to a public media URL."
        />

        <InfoRow
          icon="people-outline"
          title="Not a public face search"
          text="Verification compares the submitted identity document with the same person's live capture."
        />

        <InfoRow
          icon="person-add-outline"
          title="Volunteer approval remains separate"
          text="Being identity verified does not automatically approve Volunteer access. A Volunteer application is still reviewed separately."
        />
      </View>

      <View
        style={
          styles.card
        }
      >
        <SectionHeader
          icon="document-text-outline"
          title="Consent"
        />

        <TouchableOpacity
          style={
            styles.consentRow
          }
          activeOpacity={
            0.84
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
                styles.checkboxOn,
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
            I consent to being redirected to the secure identity verification service to provide my government ID and complete liveness and 1-to-1 facial identity verification for my VolunServe account.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.startButton,
            (
              !consent ||
              starting
            ) &&
              styles.disabledButton,
          ]}
          disabled={
            !consent ||
            starting
          }
          onPress={() =>
            void openVerification()
          }
          activeOpacity={
            0.86
          }
        >
          {starting ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <>
              <Ionicons
                name="open-outline"
                size={19}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.startButtonText
                }
              >
                Start Secure Verification
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View
        style={
          styles.footerNote
        }
      >
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={
            COLORS.muted
          }
        />

        <Text
          style={
            styles.footerText
          }
        >
          You can continue using normal Resident services even if identity verification has not been completed. Verification is required only before applying for Volunteer access.
        </Text>
      </View>
    </ScrollView>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon:
    React.ComponentProps<
      typeof Ionicons
    >["name"];
  title: string;
}) {
  return (
    <View
      style={
        styles.sectionHeader
      }
    >
      <View
        style={
          styles.sectionIcon
        }
      >
        <Ionicons
          name={
            icon
          }
          size={21}
          color={
            COLORS.primary
          }
        />
      </View>

      <Text
        style={
          styles.sectionTitle
        }
      >
        {title}
      </Text>
    </View>
  );
}

function VerificationStep({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon:
    React.ComponentProps<
      typeof Ionicons
    >["name"];
  title: string;
  text: string;
}) {
  return (
    <View
      style={
        styles.stepRow
      }
    >
      <View
        style={
          styles.stepNumber
        }
      >
        <Text
          style={
            styles.stepNumberText
          }
        >
          {number}
        </Text>
      </View>

      <View
        style={
          styles.stepIcon
        }
      >
        <Ionicons
          name={
            icon
          }
          size={21}
          color={
            COLORS.primary
          }
        />
      </View>

      <View
        style={
          styles.stepCopy
        }
      >
        <Text
          style={
            styles.stepTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.stepText
          }
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function VerificationDivider() {
  return (
    <View
      style={
        styles.stepDivider
      }
    />
  );
}

function InfoRow({
  icon,
  title,
  text,
}: {
  icon:
    React.ComponentProps<
      typeof Ionicons
    >["name"];
  title: string;
  text: string;
}) {
  return (
    <View
      style={
        styles.infoRow
      }
    >
      <Ionicons
        name={
          icon
        }
        size={21}
        color={
          COLORS.primary
        }
      />

      <View
        style={
          styles.infoCopy
        }
      >
        <Text
          style={
            styles.infoTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.infoText
          }
        >
          {text}
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
  title: string;
  message: string;
  background: string;
  color: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  loading?: boolean;
}) {
  return (
    <View
      style={
        styles.statusScreen
      }
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
          size={40}
          color={
            color
          }
        />
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
            styles.secondaryButton
          }
          onPress={
            secondaryAction
          }
        >
          <Text
            style={
              styles.secondaryButtonText
            }
          >
            {secondaryLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
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
        860,

      alignSelf:
        "center",

      paddingHorizontal:
        20,

      paddingTop:
        22,

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

    backButton: {
      alignSelf:
        "flex-start",

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        7,

      paddingVertical:
        9,

      paddingRight:
        12,

      marginBottom:
        12,
    },

    backText: {
      color:
        COLORS.text,

      fontSize:
        13,

      fontWeight:
        "800",
    },

    hero: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        16,

      padding:
        22,

      borderRadius:
        18,

      backgroundColor:
        COLORS.navy,

      marginBottom:
        16,
    },

    heroIcon: {
      width:
        55,

      height:
        55,

      borderRadius:
        15,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(255,255,255,0.12)",
    },

    heroCopy: {
      flex:
        1,
    },

    heroEyebrow: {
      color:
        "#C7D2FE",

      fontSize:
        10,

      fontWeight:
        "900",

      letterSpacing:
        0.8,
    },

    heroTitle: {
      marginTop:
        4,

      color:
        COLORS.white,

      fontSize:
        25,

      fontWeight:
        "900",
    },

    heroText: {
      marginTop:
        7,

      color:
        "#DBEAFE",

      fontSize:
        13,

      lineHeight:
        20,
    },

    notice: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        10,

      padding:
        14,

      borderRadius:
        13,

      marginBottom:
        15,
    },

    noticeCopy: {
      flex:
        1,
    },

    noticeTitle: {
      fontSize:
        13,

      fontWeight:
        "900",
    },

    noticeText: {
      marginTop:
        3,

      color:
        COLORS.muted,

      fontSize:
        12,

      lineHeight:
        18,
    },

    stepsCard: {
      padding:
        20,

      borderRadius:
        17,

      backgroundColor:
        COLORS.white,

      borderWidth:
        1,

      borderColor:
        COLORS.border,

      marginBottom:
        15,
    },

    card: {
      padding:
        20,

      borderRadius:
        17,

      backgroundColor:
        COLORS.white,

      borderWidth:
        1,

      borderColor:
        COLORS.border,

      marginBottom:
        15,
    },

    cardTitle: {
      color:
        COLORS.text,

      fontSize:
        17,

      fontWeight:
        "900",
    },

    cardDescription: {
      marginTop:
        5,

      marginBottom:
        19,

      color:
        COLORS.muted,

      fontSize:
        12,

      lineHeight:
        18,
    },

    stepRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        11,
    },

    stepNumber: {
      width:
        30,

      height:
        30,

      borderRadius:
        15,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        COLORS.primary,
    },

    stepNumberText: {
      color:
        COLORS.white,

      fontSize:
        12,

      fontWeight:
        "900",
    },

    stepIcon: {
      width:
        42,

      height:
        42,

      borderRadius:
        12,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        COLORS.primarySoft,
    },

    stepCopy: {
      flex:
        1,
    },

    stepTitle: {
      color:
        COLORS.text,

      fontSize:
        13,

      fontWeight:
        "900",
    },

    stepText: {
      marginTop:
        3,

      color:
        COLORS.muted,

      fontSize:
        11.5,

      lineHeight:
        17,
    },

    stepDivider: {
      width:
        2,

      height:
        21,

      marginLeft:
        14,

      marginVertical:
        5,

      backgroundColor:
        "#E2E8F0",
    },

    sectionHeader: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        10,

      marginBottom:
        16,
    },

    sectionIcon: {
      width:
        40,

      height:
        40,

      borderRadius:
        11,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        COLORS.primarySoft,
    },

    sectionTitle: {
      flex:
        1,

      color:
        COLORS.text,

      fontSize:
        16,

      fontWeight:
        "900",
    },

    infoRow: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        11,

      paddingVertical:
        10,

      borderBottomWidth:
        1,

      borderBottomColor:
        "#F1F5F9",
    },

    infoCopy: {
      flex:
        1,
    },

    infoTitle: {
      color:
        COLORS.text,

      fontSize:
        12.5,

      fontWeight:
        "900",
    },

    infoText: {
      marginTop:
        3,

      color:
        COLORS.muted,

      fontSize:
        11.5,

      lineHeight:
        17,
    },

    consentRow: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        10,

      marginBottom:
        18,
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

    checkboxOn: {
      backgroundColor:
        COLORS.primary,

      borderColor:
        COLORS.primary,
    },

    consentText: {
      flex:
        1,

      color:
        COLORS.text,

      fontSize:
        12,

      lineHeight:
        19,

      fontWeight:
        "600",
    },

    startButton: {
      minHeight:
        50,

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
        COLORS.primary,
    },

    startButtonText: {
      color:
        COLORS.white,

      fontSize:
        13,

      fontWeight:
        "900",
    },

    disabledButton: {
      opacity:
        0.45,
    },

    footerNote: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap:
        8,

      paddingHorizontal:
        4,
    },

    footerText: {
      flex:
        1,

      color:
        COLORS.muted,

      fontSize:
        11,

      lineHeight:
        17,
    },

    statusScreen: {
      flex:
        1,

      minHeight:
        540,

      alignItems:
        "center",

      justifyContent:
        "center",

      padding:
        28,

      backgroundColor:
        COLORS.bg,
    },

    statusIcon: {
      width:
        84,

      height:
        84,

      borderRadius:
        24,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    statusTitle: {
      marginTop:
        18,

      color:
        COLORS.text,

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
        540,

      color:
        COLORS.muted,

      fontSize:
        13,

      lineHeight:
        20,

      textAlign:
        "center",
    },

    primaryButton: {
      minWidth:
        190,

      minHeight:
        46,

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal:
        18,

      borderRadius:
        12,

      backgroundColor:
        COLORS.primary,

      marginTop:
        19,
    },

    primaryButtonText: {
      color:
        COLORS.white,

      fontSize:
        13,

      fontWeight:
        "900",
    },

    secondaryButton: {
      minWidth:
        190,

      minHeight:
        43,

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal:
        18,

      borderRadius:
        12,

      borderWidth:
        1,

      borderColor:
        COLORS.border,

      backgroundColor:
        COLORS.white,

      marginTop:
        9,
    },

    secondaryButtonText: {
      color:
        COLORS.text,

      fontSize:
        12.5,

      fontWeight:
        "800",
    },
  });