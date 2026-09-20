import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import QRCode from "react-native-qrcode-svg";

import { db } from "../../lib/firebase";

import {
  isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
  useUserSession,
} from "../../lib/useUserSession";

type ContributionBreakdown = {
  type?: string;
  count?: number;
};

type CertificateRecord = {
  id: string;

  certificateId?: string;

  certificateType?: string;
  certificateTitle?: string;

  userId?: string;
  volunteerId?: string;
  volunteerName?: string;

  verifiedHelps?: number;

  fullVerifiedHelps?: number;
  partialVerifiedHelps?: number;

  verifiedEmergencyResponses?: number;

  verifiedServiceMinutes?: number;

  peopleHelped?: number;

  contributionBreakdown?:
    ContributionBreakdown[];

  contributionIds?: string[];

  contributionCount?: number;

  snapshotHash?: string;

  verificationStatus?: string;

  issuedBy?: string;
  issuedByUid?: string;
  issuedByName?: string;
  issuedByRole?: string;

  issuerOrganization?: string;

  issuedAt?: any;
  createdAt?: any;
  updatedAt?: any;

  // Legacy event certificate support
  eventId?: string;
  name?: string;
  task?: string;
  date?: any;
};

// ============================================================
// HELPERS
// ============================================================

const toMillis = (
  value: any,
) => {
  if (!value) {
    return 0;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      new Date(
        value,
      ).getTime();

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : 0;
  }

  return 0;
};

const formatDate = (
  value: any,
) => {
  const milliseconds =
    toMillis(value);

  if (!milliseconds) {
    return "—";
  }

  return new Date(
    milliseconds,
  ).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
};

const formatDuration = (
  totalMinutes?: number,
) => {
  const safeMinutes =
    Math.max(
      0,

      Math.round(
        Number(
          totalMinutes || 0,
        ),
      ),
    );

  const hours =
    Math.floor(
      safeMinutes / 60,
    );

  const minutes =
    safeMinutes % 60;

  if (
    hours === 0
  ) {
    return `${minutes} minute${
      minutes === 1
        ? ""
        : "s"
    }`;
  }

  if (
    minutes === 0
  ) {
    return `${hours} hour${
      hours === 1
        ? ""
        : "s"
    }`;
  }

  return `${hours} hour${
    hours === 1
      ? ""
      : "s"
  } and ${minutes} minute${
    minutes === 1
      ? ""
      : "s"
  }`;
};

const getCertificateDate = (
  certificate:
    CertificateRecord,
) => {
  return (
    certificate.issuedAt ||
    certificate.createdAt ||
    certificate.date
  );
};

// ============================================================
// SCREEN
// ============================================================

export default function CertificateScreen() {
  const router =
    useRouter();

  const {
    user,
    profile,
    loading,
  } =
    useUserSession();

  const [
    certificates,
    setCertificates,
  ] =
    useState<
      CertificateRecord[]
    >([]);

  const [
    certificatesLoading,
    setCertificatesLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  // ==========================================================
  // CERTIFICATE LISTENER
  // ==========================================================

  useEffect(() => {
    if (!user) {
      setCertificates(
        [],
      );

      setCertificatesLoading(
        false,
      );

      return;
    }

    setCertificatesLoading(
      true,
    );

    const certificateQuery =
      query(
        collection(
          db,
          "certificates",
        ),

        where(
          "userId",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      certificateQuery,

      (
        snapshot,
      ) => {
        const rows =
          snapshot.docs
            .map(
              (
                certificateDoc,
              ) => ({
                id:
                  certificateDoc.id,

                ...(certificateDoc.data() as Omit<
                  CertificateRecord,
                  "id"
                >),
              }),
            )

            .sort(
              (
                left,
                right,
              ) =>
                toMillis(
                  getCertificateDate(
                    right,
                  ),
                ) -
                toMillis(
                  getCertificateDate(
                    left,
                  ),
                ),
            );

        setCertificates(
          rows,
        );

        setCertificatesLoading(
          false,
        );

        setError(
          "",
        );
      },

      (
        problem,
      ) => {
        console.error(
          "Certificate listener failed:",
          problem,
        );

        setError(
          "Unable to load your certificates. Check the deployed Firestore rules.",
        );

        setCertificatesLoading(
          false,
        );
      },
    );
  }, [
    user?.uid,
  ]);

  // ==========================================================
  // SERVICE CERTIFICATES
  // ==========================================================

  const serviceCertificates =
    useMemo(
      () =>
        certificates.filter(
          (
            item,
          ) =>
            item.certificateType ===
            "verified_volunteer_service",
        ),

      [
        certificates,
      ],
    );

  // ==========================================================
  // KEEP EXISTING EVENT CERTIFICATES SEPARATE
  // ==========================================================

  const legacyEventCertificates =
    useMemo(
      () =>
        certificates.filter(
          (
            item,
          ) =>
            item.certificateType !==
              "verified_volunteer_service" &&
            (
              item.eventId ||
              item.task
            ),
        ),

      [
        certificates,
      ],
    );

  // ==========================================================
  // OPEN VERIFICATION PAGE
  // ==========================================================

  const openVerification =
    (
      certificate:
        CertificateRecord,
    ) => {
      const certificateId =
        certificate.certificateId ||
        certificate.id;

      router.push({
        pathname:
          "/verify-certificate" as any,

        params: {
          certificateId,
        },
      });
    };

  // ==========================================================
  // GENERATE QR VERIFICATION URL
  //
  // Expo Linking automatically uses the current environment.
  //
  // Web:
  // http://.../verify-certificate?certificateId=...
  //
  // App:
  // Expo/app deep-link route.
  // ==========================================================

  const getVerificationUrl =
    (
      certificateId: string,
    ) => {
      return Linking.createURL(
        "/verify-certificate",
        {
          queryParams: {
            certificateId,
          },
        },
      );
    };

  // ==========================================================
  // PRINT / SAVE PDF
  // ==========================================================

  const printCertificate =
    (
      certificate:
        CertificateRecord,
    ) => {
      if (
        Platform.OS ===
        "web"
      ) {
        try {
          const browser =
            globalThis as any;

          const printFunction =
            browser?.window
              ?.print ||
            browser?.print;

          if (
            typeof printFunction ===
            "function"
          ) {
            printFunction.call(
              browser.window ||
                browser,
            );

            return;
          }
        } catch (
          problem
        ) {
          console.error(
            "Print failed:",
            problem,
          );
        }
      }

      Alert.alert(
        "Certificate",
        `Certificate ID: ${
          certificate.certificateId ||
          certificate.id
        }\n\nPrint / Save as PDF is currently available from the web version.`,
      );
    };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (
    loading ||
    certificatesLoading
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <ActivityIndicator
          size="large"
          color="#087F78"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading certificates…
        </Text>
      </View>
    );
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  if (
    !user ||
    !profile ||
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <View
        style={
          styles.centerCard
        }
      >
        <Text
          style={
            styles.centerTitle
          }
        >
          Approved account required
        </Text>

        <Text
          style={
            styles.centerText
          }
        >
          Sign in with an approved
          VolunServe account to view
          your certificates.
        </Text>
      </View>
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <ScrollView
      style={
        styles.screen
      }
      contentContainerStyle={
        styles.container
      }
    >
      <View
        style={
          styles.header
        }
      >
        <Text
          style={
            styles.eyebrow
          }
        >
          VOLUNSERVE RECOGNITION
        </Text>

        <Text
          style={
            styles.title
          }
        >
          My Certificates
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Official certificates issued
          from verified volunteer
          service records.
        </Text>
      </View>

      {!!error && (
        <View
          style={
            styles.errorBox
          }
        >
          <Text
            style={
              styles.errorText
            }
          >
            {error}
          </Text>
        </View>
      )}

      {/* =====================================================
          NO SERVICE CERTIFICATE YET
      ===================================================== */}

      {serviceCertificates.length ===
      0 ? (
        <View
          style={
            styles.pendingCard
          }
        >
          <Text
            style={
              styles.pendingEyebrow
            }
          >
            VERIFIED VOLUNTEER SERVICE
          </Text>

          <Text
            style={
              styles.pendingTitle
            }
          >
            No Volunteer Service
            Certificate issued yet
          </Text>

          <Text
            style={
              styles.pendingText
            }
          >
            Emergency responses must
            first be completed and
            confirmed by residents.
            Admin can then review the
            verified contribution record
            and issue an official
            certificate.
          </Text>
        </View>
      ) : (
        serviceCertificates.map(
          (
            certificate,
          ) => {
            const certificateId =
              certificate.certificateId ||
              certificate.id;

            const verificationUrl =
              getVerificationUrl(
                certificateId,
              );

            const isRevoked =
              certificate.verificationStatus ===
              "revoked";

            const verifiedHelps =
              Number(
                certificate.verifiedHelps ||
                  0,
              );

            const peopleHelped =
              Number(
                certificate.peopleHelped ||
                  0,
              );

            return (
              <View
                key={
                  certificate.id
                }
                style={
                  styles.certificateWrapper
                }
              >
                <View
                  style={
                    styles.certificate
                  }
                >
                  <View
                    style={
                      styles.topLine
                    }
                  />

                  {/* ==========================================
                      ORGANIZATION HEADER
                  ========================================== */}

                  <View
                    style={
                      styles.certificateHeader
                    }
                  >
                    <Text
                      style={
                        styles.logoText
                      }
                    >
                      VOLUNSERVE
                    </Text>

                    <Text
                      style={
                        styles.organization
                      }
                    >
                      Community Volunteer
                      and Disaster Response
                      Platform
                    </Text>

                    <Text
                      style={
                        styles.city
                      }
                    >
                      City of San Jose del
                      Monte, Bulacan
                    </Text>
                  </View>

                  <View
                    style={
                      styles.divider
                    }
                  />

                  {/* ==========================================
                      CERTIFICATE TITLE
                  ========================================== */}

                  <Text
                    style={
                      styles.certSmallTitle
                    }
                  >
                    CERTIFICATE OF
                  </Text>

                  <Text
                    style={
                      styles.certMainTitle
                    }
                  >
                    Volunteer Service
                  </Text>

                  <Text
                    style={
                      styles.presentedText
                    }
                  >
                    This certificate is
                    presented to
                  </Text>

                  <Text
                    style={
                      styles.volunteerName
                    }
                  >
                    {certificate.volunteerName ||
                      profile?.fullName ||
                      "Volunteer"}
                  </Text>

                  <View
                    style={
                      styles.nameLine
                    }
                  />

                  <Text
                    style={
                      styles.bodyText
                    }
                  >
                    in recognition of
                    verified volunteer
                    service rendered
                    through VolunServe
                    emergency response
                    activities.
                  </Text>

                  {/* ==========================================
                      VERIFIED METRICS
                  ========================================== */}

                  <View
                    style={
                      styles.metricsGrid
                    }
                  >
                    <View
                      style={
                        styles.metricCard
                      }
                    >
                      <Text
                        style={
                          styles.metricValue
                        }
                      >
                        {
                          verifiedHelps
                        }
                      </Text>

                      <Text
                        style={
                          styles.metricLabel
                        }
                      >
                        Verified Response
                        {verifiedHelps ===
                        1
                          ? ""
                          : "s"}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.metricCard
                      }
                    >
                      <Text
                        style={
                          styles.metricValueSmall
                        }
                      >
                        {formatDuration(
                          certificate.verifiedServiceMinutes,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.metricLabel
                        }
                      >
                        Verified Service
                      </Text>
                    </View>

                    <View
                      style={
                        styles.metricCard
                      }
                    >
                      <Text
                        style={
                          styles.metricValue
                        }
                      >
                        {
                          peopleHelped
                        }
                      </Text>

                      <Text
                        style={
                          styles.metricLabel
                        }
                      >
                        People Assisted
                      </Text>
                    </View>
                  </View>

                  {/* ==========================================
                      CONTRIBUTION BREAKDOWN
                  ========================================== */}

                  {!!certificate
                    .contributionBreakdown
                    ?.length && (
                    <View
                      style={
                        styles.breakdownSection
                      }
                    >
                      <Text
                        style={
                          styles.breakdownHeading
                        }
                      >
                        Verified Service
                        Contributions
                      </Text>

                      {certificate.contributionBreakdown.map(
                        (
                          item,
                          index,
                        ) => (
                          <View
                            key={`${item.type}-${index}`}
                            style={
                              styles.breakdownRow
                            }
                          >
                            <Text
                              style={
                                styles.breakdownType
                              }
                            >
                              {item.type ||
                                "Volunteer Assistance"}
                            </Text>

                            <Text
                              style={
                                styles.breakdownCount
                              }
                            >
                              {Number(
                                item.count ||
                                  0,
                              )}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  )}

                  <Text
                    style={
                      styles.recognitionText
                    }
                  >
                    This certificate
                    reflects assistance
                    confirmed through the
                    VolunServe resident
                    verification process.
                  </Text>

                  {/* ==========================================
                      ISSUANCE DETAILS
                  ========================================== */}

                  <View
                    style={
                      styles.footerGrid
                    }
                  >
                    <View
                      style={
                        styles.footerItem
                      }
                    >
                      <Text
                        style={
                          styles.footerLabel
                        }
                      >
                        DATE ISSUED
                      </Text>

                      <Text
                        style={
                          styles.footerValue
                        }
                      >
                        {formatDate(
                          certificate.issuedAt,
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.footerItem
                      }
                    >
                      <Text
                        style={
                          styles.footerLabel
                        }
                      >
                        ISSUED BY
                      </Text>

                      <Text
                        style={
                          styles.footerValue
                        }
                      >
                        {certificate.issuedByName ||
                          "Authorized Administrator"}
                      </Text>
                    </View>
                  </View>

                  {/* ==========================================
                      ACTUAL QR VERIFICATION
                  ========================================== */}

                  <View
                    style={
                      styles.qrSection
                    }
                  >
                    <View
                      style={
                        styles.qrCodeBox
                      }
                    >
                      <QRCode
                        value={
                          verificationUrl
                        }
                        size={135}
                        backgroundColor="#FFFFFF"
                      />
                    </View>

                    <View
                      style={
                        styles.qrCopy
                      }
                    >
                      <Text
                        style={
                          styles.qrTitle
                        }
                      >
                        Scan to Verify
                      </Text>

                      <Text
                        style={
                          styles.qrDescription
                        }
                      >
                        Scan this QR code
                        to open the official
                        VolunServe certificate
                        verification record.
                      </Text>

                      <Text
                        style={
                          styles.verificationLabel
                        }
                      >
                        CERTIFICATE ID
                      </Text>

                      <Text
                        selectable
                        style={
                          styles.verificationId
                        }
                      >
                        {
                          certificateId
                        }
                      </Text>

                      <View
                        style={
                          isRevoked
                            ? styles.revokedBadge
                            : styles.validBadge
                        }
                      >
                        <Text
                          style={
                            isRevoked
                              ? styles.revokedBadgeText
                              : styles.validBadgeText
                          }
                        >
                          {isRevoked
                            ? "REVOKED"
                            : "VERIFIED RECORD"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={
                      styles.bottomLine
                    }
                  />
                </View>

                {/* ============================================
                    ACTIONS
                ============================================ */}

                <View
                  style={
                    styles.actions
                  }
                >
                  <TouchableOpacity
                    style={
                      styles.secondaryButton
                    }
                    onPress={() =>
                      openVerification(
                        certificate,
                      )
                    }
                  >
                    <Text
                      style={
                        styles.secondaryButtonText
                      }
                    >
                      Verify Certificate
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={
                      styles.primaryButton
                    }
                    onPress={() =>
                      printCertificate(
                        certificate,
                      )
                    }
                  >
                    <Text
                      style={
                        styles.primaryButtonText
                      }
                    >
                      Print / Save PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          },
        )
      )}

      {/* =====================================================
          LEGACY EVENT CERTIFICATES
          Kept separate so old records are not destroyed.
      ===================================================== */}

      {legacyEventCertificates.length >
        0 && (
        <View
          style={
            styles.legacySection
          }
        >
          <Text
            style={
              styles.legacyHeading
            }
          >
            Event Certificates
          </Text>

          <Text
            style={
              styles.legacySubheading
            }
          >
            Existing certificates from
            earlier volunteer event
            records.
          </Text>

          {legacyEventCertificates.map(
            (
              certificate,
            ) => (
              <View
                key={
                  certificate.id
                }
                style={
                  styles.legacyCard
                }
              >
                <Text
                  style={
                    styles.legacyTitle
                  }
                >
                  {certificate.task ||
                    "Volunteer Event"}
                </Text>

                <Text
                  style={
                    styles.legacyName
                  }
                >
                  {certificate.name ||
                    profile?.fullName ||
                    "Volunteer"}
                </Text>

                <Text
                  style={
                    styles.legacyDate
                  }
                >
                  {formatDate(
                    certificate.date,
                  )}
                </Text>

                <Text
                  style={
                    styles.legacyId
                  }
                >
                  Certificate ID:{" "}
                  {certificate.certificateId ||
                    certificate.id}
                </Text>
              </View>
            ),
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#F4F7FA",
    },

    container: {
      width: "100%",
      maxWidth: 1050,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 70,
    },

    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F4F7FA",
      gap: 10,
    },

    loadingText: {
      color: "#64748B",
      fontSize: 13,
    },

    centerCard: {
      margin: 24,
      padding: 24,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
    },

    centerTitle: {
      color: "#102A3A",
      fontSize: 20,
      fontWeight: "900",
    },

    centerText: {
      marginTop: 6,
      color: "#64748B",
      lineHeight: 20,
    },

    header: {
      marginBottom: 18,
    },

    eyebrow: {
      color: "#087F78",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    title: {
      marginTop: 5,
      color: "#102A3A",
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "900",
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 20,
    },

    errorBox: {
      marginBottom: 14,
      padding: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        "#F1BDBD",
      backgroundColor:
        "#FFF2F2",
    },

    errorText: {
      color: "#A83232",
      fontSize: 11.5,
      fontWeight: "700",
    },

    pendingCard: {
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
      marginBottom: 18,
    },

    pendingEyebrow: {
      color: "#087F78",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    pendingTitle: {
      marginTop: 5,
      color: "#173748",
      fontSize: 17,
      fontWeight: "900",
    },

    pendingText: {
      marginTop: 6,
      maxWidth: 680,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 18,
    },

    certificateWrapper: {
      marginBottom: 24,
    },

    certificate: {
      position: "relative",
      padding: 32,
      borderWidth: 1,
      borderColor:
        "#B9D7D1",
      borderRadius: 5,
      backgroundColor:
        "#FFFFFF",
      overflow: "hidden",
    },

    topLine: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 7,
      backgroundColor:
        "#087F78",
    },

    bottomLine: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 7,
      backgroundColor:
        "#087F78",
    },

    certificateHeader: {
      alignItems: "center",
      marginTop: 8,
    },

    logoText: {
      color: "#087F78",
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 2,
    },

    organization: {
      marginTop: 3,
      color: "#526B79",
      fontSize: 10,
      fontWeight: "700",
      textAlign: "center",
    },

    city: {
      marginTop: 2,
      color: "#83949E",
      fontSize: 9,
      textAlign: "center",
    },

    divider: {
      height: 1,
      backgroundColor:
        "#D7E5E2",
      marginVertical: 22,
    },

    certSmallTitle: {
      color: "#71858F",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 2,
      textAlign: "center",
    },

    certMainTitle: {
      marginTop: 4,
      color: "#173748",
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "900",
      textAlign: "center",
    },

    presentedText: {
      marginTop: 22,
      color: "#7B8E97",
      fontSize: 11,
      textAlign: "center",
    },

    volunteerName: {
      marginTop: 8,
      color: "#087F78",
      fontSize: 27,
      lineHeight: 34,
      fontWeight: "900",
      textAlign: "center",
    },

    nameLine: {
      width: "70%",
      maxWidth: 500,
      alignSelf: "center",
      marginTop: 8,
      height: 1,
      backgroundColor:
        "#BFD4D0",
    },

    bodyText: {
      marginTop: 18,
      alignSelf: "center",
      maxWidth: 650,
      color: "#526B79",
      fontSize: 12,
      lineHeight: 20,
      textAlign: "center",
    },

    metricsGrid: {
      marginTop: 24,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent:
        "center",
    },

    metricCard: {
      flexGrow: 1,
      flexBasis: 170,
      maxWidth: 230,
      minWidth: 150,
      padding: 14,
      borderRadius: 10,
      backgroundColor:
        "#F5FAF8",
      borderWidth: 1,
      borderColor:
        "#D7E8E3",
      alignItems: "center",
    },

    metricValue: {
      color: "#087F78",
      fontSize: 22,
      fontWeight: "900",
    },

    metricValueSmall: {
      color: "#087F78",
      fontSize: 15,
      fontWeight: "900",
      textAlign: "center",
    },

    metricLabel: {
      marginTop: 4,
      color: "#607984",
      fontSize: 8.5,
      lineHeight: 13,
      fontWeight: "800",
      textAlign: "center",
      textTransform:
        "uppercase",
      letterSpacing: 0.5,
    },

    breakdownSection: {
      alignSelf: "center",
      width: "100%",
      maxWidth: 650,
      marginTop: 22,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#E0E9EC",
      backgroundColor:
        "#FAFCFC",
    },

    breakdownHeading: {
      marginBottom: 5,
      color: "#405D69",
      fontSize: 11,
      fontWeight: "900",
      textAlign: "center",
    },

    breakdownRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      paddingVertical: 7,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E4EBEE",
    },

    breakdownType: {
      flex: 1,
      color: "#5A717D",
      fontSize: 10.5,
    },

    breakdownCount: {
      color: "#087F78",
      fontSize: 11,
      fontWeight: "900",
    },

    recognitionText: {
      marginTop: 20,
      alignSelf: "center",
      maxWidth: 620,
      color: "#71858F",
      fontSize: 10,
      lineHeight: 16,
      textAlign: "center",
      fontStyle: "italic",
    },

    footerGrid: {
      marginTop: 24,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent:
        "space-around",
      gap: 20,
    },

    footerItem: {
      minWidth: 180,
      alignItems: "center",
    },

    footerLabel: {
      color: "#8B9BA4",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    footerValue: {
      marginTop: 5,
      color: "#334E5C",
      fontSize: 10.5,
      fontWeight: "800",
      textAlign: "center",
    },

    // ========================================================
    // QR
    // ========================================================

    qrSection: {
      marginTop: 26,
      padding: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#D6E5E1",
      backgroundColor:
        "#F6FAF9",
    },

    qrCodeBox: {
      padding: 10,
      borderRadius: 8,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DDE7E4",
    },

    qrCopy: {
      flex: 1,
      minWidth: 230,
      maxWidth: 430,
    },

    qrTitle: {
      color: "#173748",
      fontSize: 14,
      fontWeight: "900",
    },

    qrDescription: {
      marginTop: 4,
      color: "#647982",
      fontSize: 10.5,
      lineHeight: 16,
    },

    verificationLabel: {
      marginTop: 12,
      color: "#82949E",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    verificationId: {
      marginTop: 3,
      color: "#173748",
      fontSize: 12,
      fontWeight: "900",
    },

    validBadge: {
      marginTop: 9,
      alignSelf:
        "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#DFF4ED",
    },

    validBadgeText: {
      color: "#08786F",
      fontSize: 8.5,
      fontWeight: "900",
    },

    revokedBadge: {
      marginTop: 9,
      alignSelf:
        "flex-start",
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#FFEAEA",
    },

    revokedBadgeText: {
      color: "#A83232",
      fontSize: 8.5,
      fontWeight: "900",
    },

    actions: {
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent:
        "flex-end",
      gap: 9,
    },

    primaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    secondaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#BEDDD7",
      backgroundColor:
        "#EFF8F6",
    },

    secondaryButtonText: {
      color: "#08786F",
      fontSize: 10.5,
      fontWeight: "900",
    },

    legacySection: {
      marginTop: 8,
    },

    legacyHeading: {
      color: "#173748",
      fontSize: 17,
      fontWeight: "900",
    },

    legacySubheading: {
      marginTop: 3,
      marginBottom: 10,
      color: "#7A8E99",
      fontSize: 11,
    },

    legacyCard: {
      marginBottom: 8,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    legacyTitle: {
      color: "#173748",
      fontSize: 12,
      fontWeight: "900",
    },

    legacyName: {
      marginTop: 3,
      color: "#526B79",
      fontSize: 11,
    },

    legacyDate: {
      marginTop: 3,
      color: "#83949E",
      fontSize: 9.5,
    },

    legacyId: {
      marginTop: 5,
      color: "#087F78",
      fontSize: 9,
      fontWeight: "700",
    },
  });