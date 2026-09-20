import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { db } from "../../lib/firebase";

// ============================================================
// TYPES
// ============================================================

type ContributionBreakdown = {
  type?: string;
  count?: number;
};

type PublicCertificate = {
  certificateId?: string;

  certificateType?: string;
  certificateTitle?: string;

  volunteerName?: string;

  verifiedHelps?: number;

  fullVerifiedHelps?: number;
  partialVerifiedHelps?: number;

  verifiedEmergencyResponses?: number;

  verifiedServiceMinutes?: number;

  peopleHelped?: number;

  contributionBreakdown?:
    ContributionBreakdown[];

  contributionCount?: number;

  issuerOrganization?: string;

  issuedByName?: string;
  issuedByRole?: string;

  verificationStatus?:
    | "issued"
    | "revoked"
    | string;

  snapshotHash?: string;

  issuedAt?: any;
  createdAt?: any;
  updatedAt?: any;

  revocationReason?: string;
  revokedAt?: any;
  revokedByName?: string;
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

  if (hours === 0) {
    return `${minutes} minute${
      minutes === 1
        ? ""
        : "s"
    }`;
  }

  if (minutes === 0) {
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
  } ${minutes} minute${
    minutes === 1
      ? ""
      : "s"
  }`;
};

// ============================================================
// CERTIFICATE ID PARSER
//
// Supports:
//
// VS-2026-E48AAB14D392
//
// OR
//
// http://localhost:8081/verify-certificate
//   ?certificateId=VS-2026-E48AAB14D392
//
// OR Expo / deployed URLs.
// ============================================================

const normalizeCertificateId = (
  value: string,
) => {
  return String(
    value || "",
  )
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
};

const isValidCertificateId = (
  value: string,
) => {
  return /^[A-Z0-9-]{6,80}$/.test(
    value,
  );
};

const extractCertificateId = (
  rawValue: string,
) => {
  const raw =
    String(
      rawValue || "",
    ).trim();

  if (!raw) {
    return "";
  }

  // ----------------------------------------------------------
  // Direct Certificate ID
  // ----------------------------------------------------------

  const direct =
    normalizeCertificateId(
      raw,
    );

  if (
    isValidCertificateId(
      direct,
    )
  ) {
    return direct;
  }

  // ----------------------------------------------------------
  // certificateId query parameter
  // ----------------------------------------------------------

  try {
    const match =
      raw.match(
        /[?&]certificateId=([^&#]+)/i,
      );

    if (
      match?.[1]
    ) {
      const decoded =
        normalizeCertificateId(
          decodeURIComponent(
            match[1],
          ),
        );

      if (
        isValidCertificateId(
          decoded,
        )
      ) {
        return decoded;
      }
    }
  } catch {
    // continue
  }

  // ----------------------------------------------------------
  // Standard URL parser fallback
  // ----------------------------------------------------------

  try {
    const parsed =
      new URL(
        raw,
      );

    const parameter =
      parsed.searchParams.get(
        "certificateId",
      );

    if (parameter) {
      const normalized =
        normalizeCertificateId(
          parameter,
        );

      if (
        isValidCertificateId(
          normalized,
        )
      ) {
        return normalized;
      }
    }
  } catch {
    // Not a standard URL.
  }

  return "";
};

// ============================================================
// SCREEN
// ============================================================

export default function VerifyCertificateScreen() {
  const params =
    useLocalSearchParams<{
      certificateId?:
        | string
        | string[];
    }>();

  // ==========================================================
  // FIX:
  // Properly read Expo Router query parameter.
  // ==========================================================

  const routeCertificateId =
    useMemo(
      () => {
        const value =
          params.certificateId;

        if (
          Array.isArray(
            value,
          )
        ) {
          return String(
            value[0] || "",
          );
        }

        return String(
          value || "",
        );
      },
      [
        params.certificateId,
      ],
    );

  const [
    inputValue,
    setInputValue,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    certificate,
    setCertificate,
  ] =
    useState<
      PublicCertificate | null
    >(null);

  const [
    verifiedCertificateId,
    setVerifiedCertificateId,
  ] =
    useState("");

  // ==========================================================
  // FIRESTORE VERIFICATION
  //
  // Exact GET only.
  // No public collection listing/query.
  // ==========================================================

  const verifyCertificateByValue =
    useCallback(
      async (
        rawValue: string,
      ) => {
        const certificateId =
          extractCertificateId(
            rawValue,
          );

        setError(
          "",
        );

        setCertificate(
          null,
        );

        setVerifiedCertificateId(
          "",
        );

        if (
          !certificateId
        ) {
          setError(
            "Enter a valid VolunServe Certificate ID or verification link.",
          );

          return;
        }

        setInputValue(
          certificateId,
        );

        setLoading(
          true,
        );

        try {
          const certificateRef =
            doc(
              db,
              "publicCertificateVerifications",
              certificateId,
            );

          const snapshot =
            await getDoc(
              certificateRef,
            );

          if (
            !snapshot.exists()
          ) {
            setError(
              "No official VolunServe certificate was found with this ID.",
            );

            return;
          }

          const data =
            snapshot.data() as PublicCertificate;

          // ----------------------------------------------------
          // Protect against an unexpected ID mismatch.
          // ----------------------------------------------------

          const recordCertificateId =
            normalizeCertificateId(
              String(
                data.certificateId ||
                  snapshot.id,
              ),
            );

          if (
            recordCertificateId !==
            certificateId
          ) {
            setError(
              "The certificate verification record does not match the requested Certificate ID.",
            );

            return;
          }

          setCertificate({
            ...data,

            certificateId:
              recordCertificateId,
          });

          setVerifiedCertificateId(
            certificateId,
          );
        } catch (
          problem: any
        ) {
          console.error(
            "Certificate verification failed:",
            problem,
          );

          setError(
            problem?.message ||
              "Unable to verify this certificate right now.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  // ==========================================================
  // AUTO VERIFY FROM ROUTE
  //
  // Certificates page:
  //
  // /verify-certificate
  // ?certificateId=VS-...
  //
  // → fills input
  // → verifies automatically
  // ==========================================================

  useEffect(() => {
    if (
      !routeCertificateId
    ) {
      return;
    }

    const certificateId =
      extractCertificateId(
        routeCertificateId,
      );

    if (
      !certificateId
    ) {
      return;
    }

    setInputValue(
      certificateId,
    );

    void verifyCertificateByValue(
      certificateId,
    );
  }, [
    routeCertificateId,
    verifyCertificateByValue,
  ]);

  // ==========================================================
  // MANUAL VERIFY
  // ==========================================================

  const handleVerify =
    () => {
      void verifyCertificateByValue(
        inputValue,
      );
    };

  // ==========================================================
  // CLEAR
  // ==========================================================

  const clearVerification =
    () => {
      setInputValue(
        "",
      );

      setCertificate(
        null,
      );

      setError(
        "",
      );

      setVerifiedCertificateId(
        "",
      );

      setLoading(
        false,
      );
    };

  // ==========================================================
  // RESULT STATE
  // ==========================================================

  const verificationStatus =
    String(
      certificate?.verificationStatus ||
        "",
    ).toLowerCase();

  const isIssued =
    verificationStatus ===
    "issued";

  const isRevoked =
    verificationStatus ===
    "revoked";

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
      keyboardShouldPersistTaps="handled"
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

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
          PUBLIC VERIFICATION
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Verify Certificate
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Check whether a VolunServe
          Volunteer Service Certificate
          is an official issued record.
        </Text>
      </View>

      {/* =====================================================
          SEARCH
      ===================================================== */}

      <View
        style={
          styles.searchCard
        }
      >
        <Text
          style={
            styles.inputLabel
          }
        >
          CERTIFICATE ID
        </Text>

        <TextInput
          value={
            inputValue
          }
          onChangeText={(
            value,
          ) => {
            setInputValue(
              value,
            );

            setError(
              "",
            );
          }}
          placeholder="Example: VS-2026-ABC123456789"
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={
            handleVerify
          }
          style={
            styles.input
          }
        />

        <Text
          style={
            styles.inputHint
          }
        >
          You may also paste a
          VolunServe verification link.
        </Text>

        <View
          style={
            styles.buttonRow
          }
        >
          <TouchableOpacity
            disabled={
              loading
            }
            style={[
              styles.verifyButton,

              loading &&
                styles.buttonDisabled,
            ]}
            onPress={
              handleVerify
            }
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={17}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.verifyButtonText
                  }
                >
                  Verify Certificate
                </Text>
              </>
            )}
          </TouchableOpacity>

          {(certificate ||
            error ||
            inputValue) && (
            <TouchableOpacity
              style={
                styles.clearButton
              }
              onPress={
                clearVerification
              }
            >
              <Text
                style={
                  styles.clearButtonText
                }
              >
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {!!error && (
        <View
          style={
            styles.errorCard
          }
        >
          <View
            style={
              styles.errorIcon
            }
          >
            <Ionicons
              name="close-circle-outline"
              size={25}
              color="#B42318"
            />
          </View>

          <View
            style={
              styles.errorCopy
            }
          >
            <Text
              style={
                styles.errorTitle
              }
            >
              Certificate Not Verified
            </Text>

            <Text
              style={
                styles.errorText
              }
            >
              {error}
            </Text>
          </View>
        </View>
      )}

      {/* =====================================================
          VERIFIED / REVOKED RESULT
      ===================================================== */}

      {!!certificate && (
        <View
          style={
            styles.resultCard
          }
        >
          {/* ===================================================
              STATUS HEADER
          =================================================== */}

          <View
            style={[
              styles.statusHeader,

              isRevoked
                ? styles.revokedHeader
                : isIssued
                  ? styles.verifiedHeader
                  : styles.recordHeader,
            ]}
          >
            <View
              style={[
                styles.statusIcon,

                isRevoked
                  ? styles.revokedIcon
                  : styles.verifiedIcon,
              ]}
            >
              <Ionicons
                name={
                  isRevoked
                    ? "alert-circle-outline"
                    : "shield-checkmark-outline"
                }
                size={30}
                color={
                  isRevoked
                    ? "#B42318"
                    : "#087F78"
                }
              />
            </View>

            <View
              style={
                styles.statusCopy
              }
            >
              <Text
                style={[
                  styles.statusTitle,

                  isRevoked &&
                    styles.revokedTitle,
                ]}
              >
                {isRevoked
                  ? "Certificate Revoked"
                  : isIssued
                    ? "Verified Certificate"
                    : "Certificate Record Found"}
              </Text>

              <Text
                style={
                  styles.statusDescription
                }
              >
                {isRevoked
                  ? "This certificate exists in VolunServe but has been revoked by an authorized administrator."
                  : isIssued
                    ? "This Certificate ID matches an official VolunServe public verification record."
                    : "A VolunServe certificate record was found for this Certificate ID."}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,

                isRevoked
                  ? styles.revokedBadge
                  : styles.verifiedBadge,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,

                  isRevoked
                    ? styles.revokedBadgeText
                    : styles.verifiedBadgeText,
                ]}
              >
                {isRevoked
                  ? "REVOKED"
                  : isIssued
                    ? "VERIFIED"
                    : "RECORD FOUND"}
              </Text>
            </View>
          </View>

          {/* ===================================================
              CERTIFICATE
          =================================================== */}

          <View
            style={
              styles.certificateBody
            }
          >
            <Text
              style={
                styles.organization
              }
            >
              VOLUNSERVE
            </Text>

            <Text
              style={
                styles.city
              }
            >
              City of San Jose del Monte,
              Bulacan
            </Text>

            <View
              style={
                styles.divider
              }
            />

            <Text
              style={
                styles.certLabel
              }
            >
              CERTIFICATE OF
            </Text>

            <Text
              style={
                styles.certTitle
              }
            >
              {certificate.certificateTitle ||
                "Volunteer Service"}
            </Text>

            <Text
              style={
                styles.presentedText
              }
            >
              Officially issued to
            </Text>

            <Text
              style={
                styles.volunteerName
              }
            >
              {certificate.volunteerName ||
                "Volunteer"}
            </Text>

            {/* ===============================================
                METRICS
            =============================================== */}

            <View
              style={
                styles.metricsGrid
              }
            >
              <MetricBox
                label="VERIFIED RESPONSES"
                value={String(
                  Number(
                    certificate.verifiedHelps ||
                      certificate.verifiedEmergencyResponses ||
                      0,
                  ),
                )}
              />

              <MetricBox
                label="VERIFIED SERVICE"
                value={formatDuration(
                  Number(
                    certificate.verifiedServiceMinutes ||
                      0,
                  ),
                )}
                compact
              />

              <MetricBox
                label="PEOPLE ASSISTED"
                value={String(
                  Number(
                    certificate.peopleHelped ||
                      0,
                  ),
                )}
              />
            </View>

            {/* ===============================================
                BREAKDOWN
            =============================================== */}

            {!!certificate
              .contributionBreakdown
              ?.length && (
              <View
                style={
                  styles.breakdownCard
                }
              >
                <Text
                  style={
                    styles.breakdownTitle
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

            {/* ===============================================
                DETAILS
            =============================================== */}

            <View
              style={
                styles.detailsGrid
              }
            >
              <DetailBox
                label="CERTIFICATE ID"
                value={
                  certificate.certificateId ||
                  verifiedCertificateId
                }
              />

              <DetailBox
                label="DATE ISSUED"
                value={formatDate(
                  certificate.issuedAt ||
                    certificate.createdAt,
                )}
              />

              <DetailBox
                label="ISSUED BY"
                value={
                  certificate.issuedByName ||
                  "Authorized Administrator"
                }
              />

              <DetailBox
                label="ISSUING ORGANIZATION"
                value={
                  certificate.issuerOrganization ||
                  "VolunServe"
                }
              />
            </View>

            {/* ===============================================
                REVOKED DETAILS
            =============================================== */}

            {isRevoked && (
              <View
                style={
                  styles.revocationCard
                }
              >
                <Text
                  style={
                    styles.revocationTitle
                  }
                >
                  Revocation Information
                </Text>

                {!!certificate.revocationReason && (
                  <Text
                    style={
                      styles.revocationText
                    }
                  >
                    Reason:{" "}
                    {
                      certificate.revocationReason
                    }
                  </Text>
                )}

                {!!certificate.revokedAt && (
                  <Text
                    style={
                      styles.revocationText
                    }
                  >
                    Revoked:{" "}
                    {formatDate(
                      certificate.revokedAt,
                    )}
                  </Text>
                )}

                {!!certificate.revokedByName && (
                  <Text
                    style={
                      styles.revocationText
                    }
                  >
                    Authorized by:{" "}
                    {
                      certificate.revokedByName
                    }
                  </Text>
                )}
              </View>
            )}

            {/* ===============================================
                PRIVACY
            =============================================== */}

            <View
              style={
                styles.privacyCard
              }
            >
              <Ionicons
                name="lock-closed-outline"
                size={17}
                color="#64748B"
              />

              <Text
                style={
                  styles.privacyText
                }
              >
                This public verification
                record does not display
                resident identity,
                emergency case details,
                private locations, or
                other confidential case
                information.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* =====================================================
          INFORMATION
      ===================================================== */}

      <View
        style={
          styles.infoCard
        }
      >
        <Text
          style={
            styles.infoTitle
          }
        >
          How verification works
        </Text>

        <Text
          style={
            styles.infoText
          }
        >
          VolunServe checks the exact
          Certificate ID against the
          public verification record.
          Private resident information,
          emergency details, addresses,
          and case records are not shown
          on this page.
        </Text>
      </View>
    </ScrollView>
  );
}

// ============================================================
// METRIC
// ============================================================

function MetricBox({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View
      style={
        styles.metricBox
      }
    >
      <Text
        style={
          compact
            ? styles.metricValueCompact
            : styles.metricValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

// ============================================================
// DETAIL
// ============================================================

function DetailBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.detailBox
      }
    >
      <Text
        style={
          styles.detailLabel
        }
      >
        {label}
      </Text>

      <Text
        selectable
        style={
          styles.detailValue
        }
      >
        {value || "—"}
      </Text>
    </View>
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
      maxWidth: 900,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 70,
    },

    header: {
      marginBottom: 17,
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
      maxWidth: 650,
      color: "#64748B",
      fontSize: 12.5,
      lineHeight: 19,
    },

    // ========================================================
    // SEARCH
    // ========================================================

    searchCard: {
      padding: 17,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    inputLabel: {
      color: "#596F7B",
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    input: {
      marginTop: 7,
      minHeight: 47,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor:
        "#CBD8DE",
      borderRadius: 9,
      backgroundColor:
        "#FBFCFD",
      color: "#173748",
      fontSize: 12,
      fontWeight: "700",
    },

    inputHint: {
      marginTop: 6,
      color: "#8798A1",
      fontSize: 9,
    },

    buttonRow: {
      marginTop: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    verifyButton: {
      flex: 1,
      minWidth: 200,
      minHeight: 44,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
    },

    verifyButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    clearButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent:
        "center",
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#C9D8DE",
      backgroundColor:
        "#FFFFFF",
    },

    clearButtonText: {
      color: "#526A77",
      fontSize: 10.5,
      fontWeight: "800",
    },

    buttonDisabled: {
      opacity: 0.6,
    },

    // ========================================================
    // ERROR
    // ========================================================

    errorCard: {
      marginTop: 14,
      padding: 14,
      flexDirection: "row",
      gap: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor:
        "#EDC5C5",
      backgroundColor:
        "#FFF2F2",
    },

    errorIcon: {
      width: 39,
      height: 39,
      borderRadius: 20,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FBE2E2",
    },

    errorCopy: {
      flex: 1,
    },

    errorTitle: {
      color: "#A83232",
      fontSize: 12,
      fontWeight: "900",
    },

    errorText: {
      marginTop: 3,
      color: "#865858",
      fontSize: 10,
      lineHeight: 16,
    },

    // ========================================================
    // RESULT
    // ========================================================

    resultCard: {
      marginTop: 14,
      borderRadius: 15,
      overflow: "hidden",
      borderWidth: 1,
      borderColor:
        "#D5E3E1",
      backgroundColor:
        "#FFFFFF",
    },

    statusHeader: {
      padding: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 11,
      alignItems: "center",
    },

    verifiedHeader: {
      backgroundColor:
        "#EAF8F4",
    },

    revokedHeader: {
      backgroundColor:
        "#FFF0F0",
    },

    recordHeader: {
      backgroundColor:
        "#F3F6F8",
    },

    statusIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent:
        "center",
    },

    verifiedIcon: {
      backgroundColor:
        "#D7F0E9",
    },

    revokedIcon: {
      backgroundColor:
        "#FADADA",
    },

    statusCopy: {
      flex: 1,
      minWidth: 210,
    },

    statusTitle: {
      color: "#08786F",
      fontSize: 15,
      fontWeight: "900",
    },

    revokedTitle: {
      color: "#A83232",
    },

    statusDescription: {
      marginTop: 3,
      color: "#627781",
      fontSize: 10,
      lineHeight: 16,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    verifiedBadge: {
      backgroundColor:
        "#D9F0E8",
    },

    revokedBadge: {
      backgroundColor:
        "#FADADA",
    },

    statusBadgeText: {
      fontSize: 8,
      fontWeight: "900",
    },

    verifiedBadgeText: {
      color: "#08786F",
    },

    revokedBadgeText: {
      color: "#A83232",
    },

    certificateBody: {
      padding: 22,
    },

    organization: {
      color: "#087F78",
      fontSize: 15,
      fontWeight: "900",
      letterSpacing: 1.5,
      textAlign: "center",
    },

    city: {
      marginTop: 3,
      color: "#7C8F99",
      fontSize: 9,
      textAlign: "center",
    },

    divider: {
      height: 1,
      marginVertical: 18,
      backgroundColor:
        "#D9E5E3",
    },

    certLabel: {
      color: "#71858F",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.5,
      textAlign: "center",
    },

    certTitle: {
      marginTop: 4,
      color: "#173748",
      fontSize: 25,
      lineHeight: 31,
      fontWeight: "900",
      textAlign: "center",
    },

    presentedText: {
      marginTop: 17,
      color: "#81939C",
      fontSize: 10,
      textAlign: "center",
    },

    volunteerName: {
      marginTop: 6,
      color: "#087F78",
      fontSize: 24,
      lineHeight: 31,
      fontWeight: "900",
      textAlign: "center",
    },

    metricsGrid: {
      marginTop: 21,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      justifyContent:
        "center",
    },

    metricBox: {
      flexGrow: 1,
      flexBasis: 160,
      minWidth: 145,
      maxWidth: 230,
      padding: 13,
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#DCE8E5",
      backgroundColor:
        "#F5FAF8",
    },

    metricValue: {
      color: "#087F78",
      fontSize: 20,
      fontWeight: "900",
    },

    metricValueCompact: {
      color: "#087F78",
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "900",
      textAlign: "center",
    },

    metricLabel: {
      marginTop: 4,
      color: "#728690",
      fontSize: 7.5,
      fontWeight: "900",
      letterSpacing: 0.5,
      textAlign: "center",
    },

    breakdownCard: {
      marginTop: 18,
      padding: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#E0E9EC",
      backgroundColor:
        "#FAFCFC",
    },

    breakdownTitle: {
      marginBottom: 5,
      color: "#405D69",
      fontSize: 10.5,
      fontWeight: "900",
    },

    breakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 12,
      paddingVertical: 7,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E2E8EB",
    },

    breakdownType: {
      flex: 1,
      color: "#5A717D",
      fontSize: 10,
    },

    breakdownCount: {
      color: "#087F78",
      fontSize: 10.5,
      fontWeight: "900",
    },

    detailsGrid: {
      marginTop: 18,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    detailBox: {
      flexGrow: 1,
      flexBasis: 220,
      minWidth: 190,
      padding: 12,
      borderRadius: 9,
      backgroundColor:
        "#F7F9FA",
    },

    detailLabel: {
      color: "#84959E",
      fontSize: 7.5,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    detailValue: {
      marginTop: 4,
      color: "#294653",
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "800",
    },

    revocationCard: {
      marginTop: 16,
      padding: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#EDC6C6",
      backgroundColor:
        "#FFF2F2",
    },

    revocationTitle: {
      color: "#A83232",
      fontSize: 11,
      fontWeight: "900",
    },

    revocationText: {
      marginTop: 4,
      color: "#765858",
      fontSize: 9.5,
      lineHeight: 15,
    },

    privacyCard: {
      marginTop: 17,
      padding: 12,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 8,
      borderRadius: 9,
      backgroundColor:
        "#F5F7F8",
    },

    privacyText: {
      flex: 1,
      color: "#71828C",
      fontSize: 9,
      lineHeight: 15,
    },

    // ========================================================
    // INFORMATION
    // ========================================================

    infoCard: {
      marginTop: 14,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    infoTitle: {
      color: "#173748",
      fontSize: 12,
      fontWeight: "900",
    },

    infoText: {
      marginTop: 4,
      color: "#748792",
      fontSize: 10,
      lineHeight: 16,
    },
  });