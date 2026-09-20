import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";

import React, {
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================================
// CERTIFICATE ID PARSER
//
// Supported QR values:
//
// 1. Plain certificate ID
//    VS-2026-ABC123...
//
// 2. Verification URL
//    .../verify-certificate?certificateId=VS-2026-ABC123
//
// 3. Expo / app deep links containing certificateId.
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
  return /^VS-[A-Z0-9-]{6,75}$/.test(
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
  // CASE 1:
  // QR contains only the certificate ID.
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
  // CASE 2:
  // QR contains certificateId as a query parameter.
  // Works for:
  //
  // https://...
  // exp://...
  // volunserve://...
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
    // Continue to other parsing methods.
  }

  // ----------------------------------------------------------
  // CASE 3:
  // URL parser fallback.
  // ----------------------------------------------------------

  try {
    const parsed =
      new URL(
        raw,
      );

    const value =
      parsed.searchParams.get(
        "certificateId",
      );

    if (value) {
      const normalized =
        normalizeCertificateId(
          value,
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

export default function ScannerScreen() {
  const router =
    useRouter();

  const [
    permission,
    requestPermission,
  ] =
    useCameraPermissions();

  const [
    scanned,
    setScanned,
  ] =
    useState(false);

  const [
    scannedValue,
    setScannedValue,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    manualValue,
    setManualValue,
  ] =
    useState("");

  const [
    opening,
    setOpening,
  ] =
    useState(false);

  // ==========================================================
  // CAMERA PERMISSION STATE
  // ==========================================================

  const cameraPermissionGranted =
    Boolean(
      permission?.granted,
    );

  const cameraPermissionKnown =
    permission !== null;

  const cameraPermissionDenied =
    Boolean(
      permission &&
        !permission.granted &&
        !permission.canAskAgain,
    );

  // ==========================================================
  // PLATFORM MESSAGE
  // ==========================================================

  const cameraHint =
    useMemo(
      () => {
        if (
          Platform.OS ===
          "web"
        ) {
          return "Allow browser camera access, then point the camera at a VolunServe certificate QR code.";
        }

        return "Point the back camera at a VolunServe certificate QR code.";
      },
      [],
    );

  // ==========================================================
  // OPEN VERIFICATION
  // ==========================================================

  const openCertificateVerification =
    (
      certificateId: string,
    ) => {
      if (
        !certificateId
      ) {
        return;
      }

      setOpening(
        true,
      );

      router.push({
        pathname:
          "/verify-certificate" as any,

        params: {
          certificateId,
        },
      });

      setTimeout(
        () => {
          setOpening(
            false,
          );
        },
        800,
      );
    };

  // ==========================================================
  // HANDLE SCANNED QR
  // ==========================================================

  const handleBarcodeScanned =
    ({
      data,
    }: {
      data: string;
    }) => {
      if (
        scanned ||
        opening
      ) {
        return;
      }

      setScanned(
        true,
      );

      setScannedValue(
        String(
          data || "",
        ),
      );

      setError(
        "",
      );

      const certificateId =
        extractCertificateId(
          data,
        );

      if (
        !certificateId
      ) {
        setError(
          "This QR code is not a valid VolunServe certificate QR.",
        );

        return;
      }

      openCertificateVerification(
        certificateId,
      );
    };

  // ==========================================================
  // MANUAL FALLBACK
  //
  // Useful for:
  // - Desktop without camera
  // - Browser camera denied
  // - Testing
  // - Pasted QR URL
  // ==========================================================

  const verifyManualValue =
    () => {
      setError(
        "",
      );

      const certificateId =
        extractCertificateId(
          manualValue,
        );

      if (
        !certificateId
      ) {
        setError(
          "Enter a valid VolunServe Certificate ID or verification link.",
        );

        return;
      }

      openCertificateVerification(
        certificateId,
      );
    };

  // ==========================================================
  // RESET SCANNER
  // ==========================================================

  const scanAgain =
    () => {
      setScanned(
        false,
      );

      setScannedValue(
        "",
      );

      setError(
        "",
      );
    };

  // ==========================================================
  // CAMERA PERMISSION STILL LOADING
  // ==========================================================

  if (
    !cameraPermissionKnown
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
          Preparing scanner…
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
          VOLUNSERVE VERIFICATION
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Certificate Scanner
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Scan the QR code printed on
          a VolunServe Volunteer
          Service Certificate.
        </Text>
      </View>

      {/* =====================================================
          PURPOSE
      ===================================================== */}

      <View
        style={
          styles.purposeCard
        }
      >
        <View
          style={
            styles.purposeIcon
          }
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={23}
            color="#087F78"
          />
        </View>

        <View
          style={
            styles.purposeCopy
          }
        >
          <Text
            style={
              styles.purposeTitle
            }
          >
            Certificate authenticity
            check
          </Text>

          <Text
            style={
              styles.purposeText
            }
          >
            The scanner reads only the
            certificate verification
            code. It does not expose
            resident information,
            emergency case details, or
            other private records.
          </Text>
        </View>
      </View>

      {/* =====================================================
          CAMERA PERMISSION NOT YET GRANTED
      ===================================================== */}

      {!cameraPermissionGranted ? (
        <View
          style={
            styles.permissionCard
          }
        >
          <View
            style={
              styles.largeCameraIcon
            }
          >
            <Ionicons
              name="camera-outline"
              size={35}
              color="#087F78"
            />
          </View>

          <Text
            style={
              styles.permissionTitle
            }
          >
            Camera access required
          </Text>

          <Text
            style={
              styles.permissionText
            }
          >
            Camera access is used only
            while scanning the QR code
            on a certificate.
          </Text>

          {!cameraPermissionDenied ? (
            <TouchableOpacity
              style={
                styles.primaryButton
              }
              onPress={() =>
                void requestPermission()
              }
            >
              <Ionicons
                name="camera-outline"
                size={17}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Allow Camera
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={
                styles.permissionDeniedBox
              }
            >
              <Text
                style={
                  styles.permissionDeniedText
                }
              >
                Camera permission is
                disabled. You can enable
                it from your browser or
                device settings, or use
                the manual verification
                option below.
              </Text>
            </View>
          )}
        </View>
      ) : (
        /* ===================================================
           ACTUAL CAMERA SCANNER
        =================================================== */

        <View
          style={
            styles.scannerCard
          }
        >
          <View
            style={
              styles.scannerHeader
            }
          >
            <View>
              <Text
                style={
                  styles.scannerTitle
                }
              >
                Scan certificate QR
              </Text>

              <Text
                style={
                  styles.scannerHint
                }
              >
                {cameraHint}
              </Text>
            </View>

            <View
              style={
                styles.liveBadge
              }
            >
              <View
                style={
                  styles.liveDot
                }
              />

              <Text
                style={
                  styles.liveText
                }
              >
                LIVE
              </Text>
            </View>
          </View>

          <View
            style={
              styles.cameraContainer
            }
          >
            <CameraView
              style={
                styles.camera
              }
              facing={
               Platform.OS === "web"
              ? "front"
             : "back"
              }
              barcodeScannerSettings={{
                barcodeTypes: [
                  "qr",
                ],
              }}
              onBarcodeScanned={
                scanned
                  ? undefined
                  : handleBarcodeScanned
              }
            />

            {/* ===============================================
                SCAN TARGET OVERLAY
            =============================================== */}

            <View
              pointerEvents="none"
              style={
                styles.scanOverlay
              }
            >
              <View
                style={
                  styles.scanFrame
                }
              >
                <View
                  style={[
                    styles.corner,
                    styles.cornerTopLeft,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.cornerTopRight,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.cornerBottomLeft,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.cornerBottomRight,
                  ]}
                />
              </View>

              <Text
                style={
                  styles.overlayText
                }
              >
                Align the certificate
                QR inside the frame
              </Text>
            </View>
          </View>

          {/* ===============================================
              INVALID / PREVIOUS QR
          =============================================== */}

          {scanned && (
            <View
              style={
                styles.scanResultBox
              }
            >
              {error ? (
                <>
                  <View
                    style={
                      styles.resultIconError
                    }
                  >
                    <Ionicons
                      name="close"
                      size={19}
                      color="#A83232"
                    />
                  </View>

                  <View
                    style={
                      styles.resultCopy
                    }
                  >
                    <Text
                      style={
                        styles.resultTitleError
                      }
                    >
                      Invalid certificate
                      QR
                    </Text>

                    <Text
                      style={
                        styles.resultText
                      }
                    >
                      {error}
                    </Text>

                    {!!scannedValue && (
                      <Text
                        numberOfLines={
                          2
                        }
                        style={
                          styles.scannedRaw
                        }
                      >
                        Scanned:{" "}
                        {
                          scannedValue
                        }
                      </Text>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <ActivityIndicator
                    size="small"
                    color="#087F78"
                  />

                  <View
                    style={
                      styles.resultCopy
                    }
                  >
                    <Text
                      style={
                        styles.resultTitle
                      }
                    >
                      Certificate QR
                      recognized
                    </Text>

                    <Text
                      style={
                        styles.resultText
                      }
                    >
                      Opening official
                      verification…
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {scanned &&
            !!error && (
              <TouchableOpacity
                style={
                  styles.scanAgainButton
                }
                onPress={
                  scanAgain
                }
              >
                <Ionicons
                  name="scan-outline"
                  size={17}
                  color="#087F78"
                />

                <Text
                  style={
                    styles.scanAgainText
                  }
                >
                  Scan Again
                </Text>
              </TouchableOpacity>
            )}
        </View>
      )}

      {/* =====================================================
          MANUAL FALLBACK
      ===================================================== */}

      <View
        style={
          styles.manualCard
        }
      >
        <View
          style={
            styles.manualHeader
          }
        >
          <View
            style={
              styles.manualIcon
            }
          >
            <Ionicons
              name="keypad-outline"
              size={20}
              color="#087F78"
            />
          </View>

          <View
            style={
              styles.manualHeaderCopy
            }
          >
            <Text
              style={
                styles.manualTitle
              }
            >
              Manual verification
            </Text>

            <Text
              style={
                styles.manualSubtitle
              }
            >
              Use this if camera scanning
              is unavailable.
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.inputLabel
          }
        >
          CERTIFICATE ID OR QR LINK
        </Text>

        <TextInput
          value={
            manualValue
          }
          onChangeText={(
            value,
          ) => {
            setManualValue(
              value,
            );

            setError(
              "",
            );
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="VS-2026-ABC123... or verification link"
          placeholderTextColor="#94A3B8"
          returnKeyType="go"
          onSubmitEditing={
            verifyManualValue
          }
          style={
            styles.input
          }
        />

        <TouchableOpacity
          style={[
            styles.manualButton,

            opening &&
              styles.buttonDisabled,
          ]}
          disabled={
            opening
          }
          onPress={
            verifyManualValue
          }
        >
          {opening ? (
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
                  styles.manualButtonText
                }
              >
                Verify Certificate
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* =====================================================
          FLOW EXPLANATION
      ===================================================== */}

      <View
        style={
          styles.flowCard
        }
      >
        <Text
          style={
            styles.flowTitle
          }
        >
          Verification flow
        </Text>

        <View
          style={
            styles.flowRow
          }
        >
          <View
            style={
              styles.stepCircle
            }
          >
            <Text
              style={
                styles.stepNumber
              }
            >
              1
            </Text>
          </View>

          <Text
            style={
              styles.flowText
            }
          >
            Scan the QR printed on the
            certificate.
          </Text>
        </View>

        <View
          style={
            styles.flowLine
          }
        />

        <View
          style={
            styles.flowRow
          }
        >
          <View
            style={
              styles.stepCircle
            }
          >
            <Text
              style={
                styles.stepNumber
              }
            >
              2
            </Text>
          </View>

          <Text
            style={
              styles.flowText
            }
          >
            VolunServe reads the
            Certificate ID.
          </Text>
        </View>

        <View
          style={
            styles.flowLine
          }
        />

        <View
          style={
            styles.flowRow
          }
        >
          <View
            style={
              styles.stepCircle
            }
          >
            <Text
              style={
                styles.stepNumber
              }
            >
              3
            </Text>
          </View>

          <Text
            style={
              styles.flowText
            }
          >
            The official verification
            page checks the exact public
            certificate record.
          </Text>
        </View>

        <View
          style={
            styles.flowLine
          }
        />

        <View
          style={
            styles.flowRow
          }
        >
          <View
            style={
              styles.stepCircle
            }
          >
            <Text
              style={
                styles.stepNumber
              }
            >
              4
            </Text>
          </View>

          <Text
            style={
              styles.flowText
            }
          >
            Result appears as Verified,
            Revoked, or Not Found.
          </Text>
        </View>
      </View>
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
      maxWidth: 920,
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
      fontSize: 13,
      lineHeight: 20,
    },

    purposeCard: {
      marginBottom: 14,
      padding: 14,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 11,
      borderRadius: 13,
      backgroundColor:
        "#EDF8F5",
      borderWidth: 1,
      borderColor:
        "#CAE5DE",
    },

    purposeIcon: {
      width: 39,
      height: 39,
      borderRadius: 20,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#D8EFE9",
    },

    purposeCopy: {
      flex: 1,
    },

    purposeTitle: {
      color: "#08786F",
      fontSize: 12.5,
      fontWeight: "900",
    },

    purposeText: {
      marginTop: 3,
      color: "#587174",
      fontSize: 10.5,
      lineHeight: 17,
    },

    permissionCard: {
      padding: 22,
      alignItems: "center",
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    largeCameraIcon: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EAF7F4",
    },

    permissionTitle: {
      marginTop: 12,
      color: "#173748",
      fontSize: 16,
      fontWeight: "900",
    },

    permissionText: {
      marginTop: 5,
      maxWidth: 450,
      color: "#71858F",
      fontSize: 11,
      lineHeight: 17,
      textAlign: "center",
    },

    primaryButton: {
      marginTop: 15,
      minHeight: 42,
      paddingHorizontal: 18,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    permissionDeniedBox: {
      marginTop: 14,
      padding: 11,
      maxWidth: 520,
      borderRadius: 9,
      backgroundColor:
        "#FFF4E8",
    },

    permissionDeniedText: {
      color: "#8A672F",
      fontSize: 10.5,
      lineHeight: 16,
      textAlign: "center",
    },

    scannerCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
      overflow: "hidden",
    },

    scannerHeader: {
      padding: 15,
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 12,
    },

    scannerTitle: {
      color: "#173748",
      fontSize: 14,
      fontWeight: "900",
    },

    scannerHint: {
      marginTop: 3,
      maxWidth: 570,
      color: "#7A8E99",
      fontSize: 10.5,
      lineHeight: 16,
    },

    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#E7F6F1",
    },

    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#087F78",
    },

    liveText: {
      color: "#087F78",
      fontSize: 8,
      fontWeight: "900",
    },

    cameraContainer: {
      position: "relative",
      width: "100%",
      height: 430,
      backgroundColor:
        "#101820",
    },

    camera: {
      width: "100%",
      height: "100%",
    },

    scanOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent:
        "center",
    },

    scanFrame: {
      position: "relative",
      width: 240,
      height: 240,
    },

    corner: {
      position: "absolute",
      width: 46,
      height: 46,
      borderColor:
        "#FFFFFF",
    },

    cornerTopLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderTopLeftRadius: 10,
    },

    cornerTopRight: {
      top: 0,
      right: 0,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderTopRightRadius: 10,
    },

    cornerBottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderBottomLeftRadius: 10,
    },

    cornerBottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderBottomRightRadius: 10,
    },

    overlayText: {
      marginTop: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor:
        "rgba(15,23,42,0.72)",
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "800",
    },

    scanResultBox: {
      margin: 14,
      padding: 12,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 10,
      borderRadius: 10,
      backgroundColor:
        "#F6F9FA",
      borderWidth: 1,
      borderColor:
        "#E0E7EA",
    },

    resultIconError: {
      width: 31,
      height: 31,
      alignItems: "center",
      justifyContent:
        "center",
      borderRadius: 16,
      backgroundColor:
        "#FADEDE",
    },

    resultCopy: {
      flex: 1,
    },

    resultTitle: {
      color: "#08786F",
      fontSize: 11,
      fontWeight: "900",
    },

    resultTitleError: {
      color: "#A83232",
      fontSize: 11,
      fontWeight: "900",
    },

    resultText: {
      marginTop: 3,
      color: "#647982",
      fontSize: 10,
      lineHeight: 15,
    },

    scannedRaw: {
      marginTop: 5,
      color: "#95A2AA",
      fontSize: 8.5,
    },

    scanAgainButton: {
      marginHorizontal: 14,
      marginBottom: 14,
      minHeight: 39,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#C3E0DA",
      backgroundColor:
        "#EEF8F5",
    },

    scanAgainText: {
      color: "#08786F",
      fontSize: 10.5,
      fontWeight: "900",
    },

    manualCard: {
      marginTop: 14,
      padding: 17,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    manualHeader: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
    },

    manualIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EAF7F4",
    },

    manualHeaderCopy: {
      flex: 1,
    },

    manualTitle: {
      color: "#173748",
      fontSize: 13,
      fontWeight: "900",
    },

    manualSubtitle: {
      marginTop: 2,
      color: "#81939D",
      fontSize: 9.5,
    },

    inputLabel: {
      marginTop: 15,
      color: "#71858F",
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    input: {
      marginTop: 6,
      minHeight: 45,
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#CBD8DE",
      backgroundColor:
        "#FBFCFD",
      color: "#173748",
      fontSize: 12,
    },

    manualButton: {
      marginTop: 11,
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
    },

    manualButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    buttonDisabled: {
      opacity: 0.6,
    },

    flowCard: {
      marginTop: 14,
      padding: 17,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    flowTitle: {
      marginBottom: 12,
      color: "#173748",
      fontSize: 13,
      fontWeight: "900",
    },

    flowRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E5F4F0",
    },

    stepNumber: {
      color: "#08786F",
      fontSize: 10,
      fontWeight: "900",
    },

    flowText: {
      flex: 1,
      color: "#526B79",
      fontSize: 10.5,
      lineHeight: 16,
    },

    flowLine: {
      width: 1,
      height: 12,
      marginLeft: 14,
      backgroundColor:
        "#D5E5E1",
    },
  });