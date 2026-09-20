import { Ionicons } from "@expo/vector-icons";

import {
    collection,
    doc,
    onSnapshot,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";

import React, {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { db } from "../../lib/firebase";

import {
    isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
    useUserSession,
} from "../../lib/useUserSession";

// ============================================================
// TYPES
// ============================================================

type VerifiedOutcome =
  | "fully_helped"
  | "partially_helped";

type VerifiedContribution = {
  id: string;

  assignmentId: string;
  caseId: string;

  volunteerId: string;
  volunteerName: string;

  residentId?: string;

  outcome: VerifiedOutcome;

  contributionType: string;
  contributionSummary: string;

  peopleHelped: number;

  completionNotes?: string;

  responseStartedAt?: any;
  arrivedAt?: any;
  completedAt?: any;

  residentConfirmedAt?: any;

  verificationSource?: string;

  status: string;

  createdAt?: any;
  verifiedAt?: any;
};

type ContributionBreakdown = {
  type: string;
  count: number;
};

type VolunteerCertificateSummary = {
  volunteerId: string;
  volunteerName: string;

  contributions: VerifiedContribution[];

  verifiedHelps: number;

  fullVerifiedHelps: number;
  partialVerifiedHelps: number;

  verifiedServiceMinutes: number;

  peopleHelped: number;

  contributionBreakdown:
    ContributionBreakdown[];

  contributionIds: string[];

  snapshotHash: string;

  certificateId: string;
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

  contributionCount?: number;

  contributionIds?: string[];

  snapshotHash?: string;

  verificationStatus?: string;

  issuedByUid?: string;
  issuedByName?: string;
  issuedByRole?: string;

  issuerOrganization?: string;

  issuedAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

// ============================================================
// CONSTANTS
// ============================================================

const CERTIFICATE_TYPE =
  "verified_volunteer_service";

const CERTIFICATE_TITLE =
  "Certificate of Volunteer Service";

const ISSUER_ORGANIZATION =
  "VolunServe – City of San Jose del Monte, Bulacan";

// Maximum response duration credited for one emergency response.
// This protects the display from stale timestamps.
const MAX_RESPONSE_MINUTES =
  24 * 60;

// ============================================================
// DATE HELPERS
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

  const parsed =
    new Date(
      value,
    ).getTime();

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
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
      month: "short",
      day: "numeric",
    },
  );
};

const formatDuration = (
  totalMinutes: number,
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
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr${
      hours === 1
        ? ""
        : "s"
    }`;
  }

  return `${hours} hr${
    hours === 1
      ? ""
      : "s"
  } ${minutes} min`;
};

// ============================================================
// SERVICE TIME
// ============================================================

const serviceMinutesForContribution =
  (
    contribution:
      VerifiedContribution,
  ) => {
    const start =
      toMillis(
        contribution.responseStartedAt,
      );

    const end =
      toMillis(
        contribution.completedAt,
      );

    if (
      !start ||
      !end ||
      end <= start
    ) {
      return 0;
    }

    const calculated =
      Math.round(
        (end - start) /
          60000,
      );

    return Math.min(
      MAX_RESPONSE_MINUTES,

      Math.max(
        0,
        calculated,
      ),
    );
  };

// ============================================================
// DETERMINISTIC HASH
//
// No extra crypto package required.
//
// Purpose:
// Same verified contribution snapshot
// = same snapshotHash.
//
// New verified contribution
// = new snapshotHash
// = new certificate ID.
// ============================================================

const fnvHash = (
  value: string,
  seed: number,
) => {
  let hash =
    seed >>> 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^=
      value.charCodeAt(
        index,
      );

    hash =
      Math.imul(
        hash,
        16777619,
      ) >>> 0;
  }

  return hash >>> 0;
};

const createFingerprint = (
  value: string,
) => {
  const first =
    fnvHash(
      value,
      2166136261,
    )
      .toString(16)
      .padStart(
        8,
        "0",
      );

  const reversed =
    value
      .split("")
      .reverse()
      .join("");

  const second =
    fnvHash(
      reversed,
      2246822519,
    )
      .toString(16)
      .padStart(
        8,
        "0",
      );

  return (
    first + second
  ).toUpperCase();
};

// ============================================================
// CONTRIBUTION SNAPSHOT
// ============================================================

const buildSnapshotString = (
  volunteerId: string,
  contributions:
    VerifiedContribution[],
) => {
  const normalized =
    [...contributions]
      .sort(
        (
          left,
          right,
        ) =>
          left.id.localeCompare(
            right.id,
          ),
      )
      .map(
        (
          item,
        ) => ({
          id: item.id,

          assignmentId:
            item.assignmentId,

          volunteerId:
            item.volunteerId,

          outcome:
            item.outcome,

          contributionType:
            item.contributionType,

          contributionSummary:
            item.contributionSummary,

          peopleHelped:
            Number(
              item.peopleHelped ||
                0,
            ),

          responseStartedAt:
            toMillis(
              item.responseStartedAt,
            ),

          arrivedAt:
            toMillis(
              item.arrivedAt,
            ),

          completedAt:
            toMillis(
              item.completedAt,
            ),

          verifiedAt:
            toMillis(
              item.verifiedAt,
            ),
        }),
      );

  return JSON.stringify({
    volunteerId,
    contributions:
      normalized,
  });
};

// ============================================================
// BUILD VOLUNTEER SUMMARY
// ============================================================

const createVolunteerSummary =
  (
    volunteerId: string,
    contributions:
      VerifiedContribution[],
  ):
    VolunteerCertificateSummary => {
    const sortedContributions =
      [...contributions].sort(
        (
          left,
          right,
        ) =>
          toMillis(
            right.verifiedAt ||
              right.createdAt,
          ) -
          toMillis(
            left.verifiedAt ||
              left.createdAt,
          ),
      );

    const volunteerName =
      sortedContributions.find(
        (
          item,
        ) =>
          item.volunteerName?.trim(),
      )?.volunteerName ||
      "Volunteer";

    const fullVerifiedHelps =
      sortedContributions.filter(
        (
          item,
        ) =>
          item.outcome ===
          "fully_helped",
      ).length;

    const partialVerifiedHelps =
      sortedContributions.filter(
        (
          item,
        ) =>
          item.outcome ===
          "partially_helped",
      ).length;

    const verifiedHelps =
      sortedContributions.length;

    const peopleHelped =
      sortedContributions.reduce(
        (
          total,
          item,
        ) =>
          total +
          Math.max(
            0,
            Number(
              item.peopleHelped ||
                0,
            ),
          ),
        0,
      );

    const verifiedServiceMinutes =
      sortedContributions.reduce(
        (
          total,
          item,
        ) =>
          total +
          serviceMinutesForContribution(
            item,
          ),
        0,
      );

    const typeMap =
      new Map<
        string,
        number
      >();

    sortedContributions.forEach(
      (
        contribution,
      ) => {
        const type =
          String(
            contribution.contributionType ||
              "General Volunteer Assistance",
          ).trim() ||
          "General Volunteer Assistance";

        typeMap.set(
          type,

          (
            typeMap.get(
              type,
            ) || 0
          ) + 1,
        );
      },
    );

    const contributionBreakdown =
      Array.from(
        typeMap.entries(),
      )
        .map(
          ([
            type,
            count,
          ]) => ({
            type,
            count,
          }),
        )
        .sort(
          (
            left,
            right,
          ) =>
            right.count -
              left.count ||
            left.type.localeCompare(
              right.type,
            ),
        );

    const contributionIds =
      sortedContributions
        .map(
          (
            item,
          ) => item.id,
        )
        .sort();

    const snapshotString =
      buildSnapshotString(
        volunteerId,
        sortedContributions,
      );

    const snapshotHash =
      createFingerprint(
        snapshotString,
      );

    const year =
      new Date().getFullYear();

    const certificateId =
      `VS-${year}-${snapshotHash.slice(
        0,
        12,
      )}`;

    return {
      volunteerId,
      volunteerName,

      contributions:
        sortedContributions,

      verifiedHelps,

      fullVerifiedHelps,
      partialVerifiedHelps,

      verifiedServiceMinutes,

      peopleHelped,

      contributionBreakdown,

      contributionIds,

      snapshotHash,

      certificateId,
    };
  };

// ============================================================
// SCREEN
// ============================================================

export default function AdminCertificatesScreen() {
  const {
    user,
    profile,
    loading,
  } =
    useUserSession();

  const [
    contributions,
    setContributions,
  ] =
    useState<
      VerifiedContribution[]
    >([]);

  const [
    certificates,
    setCertificates,
  ] =
    useState<
      CertificateRecord[]
    >([]);

  const [
    contributionsLoading,
    setContributionsLoading,
  ] =
    useState(true);

  const [
    certificatesLoading,
    setCertificatesLoading,
  ] =
    useState(true);

  const [
    busyVolunteerId,
    setBusyVolunteerId,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const role =
    String(
      profile?.role || "",
    );

  const isAuthorized =
    Boolean(
      user &&
        profile &&
        isApprovedProfile(
          profile,
        ) &&
        (
          role === "admin" ||
          role ===
            "superadmin"
        ),
    );

  // ==========================================================
  // VERIFIED CONTRIBUTIONS LISTENER
  // ==========================================================

  useEffect(() => {
    if (
      loading
    ) {
      return;
    }

    if (
      !isAuthorized
    ) {
      setContributions(
        [],
      );

      setContributionsLoading(
        false,
      );

      return;
    }

    setContributionsLoading(
      true,
    );

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "verifiedContributions",
        ),

        (
          snapshot,
        ) => {
          const rows =
            snapshot.docs
              .map(
                (
                  contributionDoc,
                ) => {
                  const data =
                    contributionDoc.data() as any;

                  return {
                    id:
                      contributionDoc.id,

                    assignmentId:
                      String(
                        data.assignmentId ||
                          contributionDoc.id,
                      ),

                    caseId:
                      String(
                        data.caseId ||
                          "",
                      ),

                    volunteerId:
                      String(
                        data.volunteerId ||
                          "",
                      ),

                    volunteerName:
                      String(
                        data.volunteerName ||
                          "Volunteer",
                      ),

                    residentId:
                      String(
                        data.residentId ||
                          "",
                      ),

                    outcome:
                      data.outcome as VerifiedOutcome,

                    contributionType:
                      String(
                        data.contributionType ||
                          "General Volunteer Assistance",
                      ),

                    contributionSummary:
                      String(
                        data.contributionSummary ||
                          "",
                      ),

                    peopleHelped:
                      Number.isInteger(
                        data.peopleHelped,
                      )
                        ? data.peopleHelped
                        : 0,

                    completionNotes:
                      String(
                        data.completionNotes ||
                          "",
                      ),

                    responseStartedAt:
                      data.responseStartedAt,

                    arrivedAt:
                      data.arrivedAt,

                    completedAt:
                      data.completedAt,

                    residentConfirmedAt:
                      data.residentConfirmedAt,

                    verificationSource:
                      String(
                        data.verificationSource ||
                          "",
                      ),

                    status:
                      String(
                        data.status ||
                          "",
                      ),

                    createdAt:
                      data.createdAt,

                    verifiedAt:
                      data.verifiedAt,
                  } as VerifiedContribution;
                },
              )

              // Only actual verified Full / Partial assistance
              // is used for service certification.
              .filter(
                (
                  item,
                ) =>
                  item.status ===
                    "verified" &&
                  Boolean(
                    item.volunteerId,
                  ) &&
                  (
                    item.outcome ===
                      "fully_helped" ||
                    item.outcome ===
                      "partially_helped"
                  ),
              );

          setContributions(
            rows,
          );

          setContributionsLoading(
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
            "Verified contribution listener failed:",
            problem,
          );

          setContributions(
            [],
          );

          setContributionsLoading(
            false,
          );

          setError(
            "Unable to load verified volunteer contributions.",
          );
        },
      );

    return unsubscribe;
  }, [
    isAuthorized,
    loading,
  ]);

  // ==========================================================
  // CERTIFICATE LISTENER
  // ==========================================================

  useEffect(() => {
    if (
      loading
    ) {
      return;
    }

    if (
      !isAuthorized
    ) {
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

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "certificates",
        ),

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

              // This Admin screen handles only our
              // verified emergency volunteer service certs.
              .filter(
                (
                  item,
                ) =>
                  item.certificateType ===
                  CERTIFICATE_TYPE,
              )

              .sort(
                (
                  left,
                  right,
                ) =>
                  toMillis(
                    right.issuedAt ||
                      right.createdAt,
                  ) -
                  toMillis(
                    left.issuedAt ||
                      left.createdAt,
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

          setCertificates(
            [],
          );

          setCertificatesLoading(
            false,
          );

          setError(
            "Unable to load issued volunteer certificates.",
          );
        },
      );

    return unsubscribe;
  }, [
    isAuthorized,
    loading,
  ]);

  // ==========================================================
  // GROUP VERIFIED CONTRIBUTIONS BY VOLUNTEER
  // ==========================================================

  const volunteerSummaries =
    useMemo(
      () => {
        const grouped =
          new Map<
            string,
            VerifiedContribution[]
          >();

        contributions.forEach(
          (
            contribution,
          ) => {
            const current =
              grouped.get(
                contribution.volunteerId,
              ) || [];

            current.push(
              contribution,
            );

            grouped.set(
              contribution.volunteerId,
              current,
            );
          },
        );

        return Array.from(
          grouped.entries(),
        )
          .map(
            ([
              volunteerId,
              volunteerContributions,
            ]) =>
              createVolunteerSummary(
                volunteerId,
                volunteerContributions,
              ),
          )
          .sort(
            (
              left,
              right,
            ) =>
              left.volunteerName.localeCompare(
                right.volunteerName,
              ),
          );
      },
      [
        contributions,
      ],
    );

  // ==========================================================
  // ISSUED CERTIFICATE LOOKUPS
  // ==========================================================

  const certificateById =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            CertificateRecord
          >();

        certificates.forEach(
          (
            certificate,
          ) => {
            const certificateId =
              String(
                certificate.certificateId ||
                  certificate.id,
              );

            map.set(
              certificateId,
              certificate,
            );
          },
        );

        return map;
      },
      [
        certificates,
      ],
    );

  const currentSnapshotCertificate =
    (
      summary:
        VolunteerCertificateSummary,
    ) => {
      return certificates.find(
        (
          certificate,
        ) =>
          certificate.volunteerId ===
            summary.volunteerId &&
          certificate.snapshotHash ===
            summary.snapshotHash,
      );
    };

  const adminName =
    String(
      profile?.fullName ||
        profile?.email ||
        "Authorized Administrator",
    ).trim() ||
    "Authorized Administrator";

  const issueCertificate =
    async (
      summary:
        VolunteerCertificateSummary,
    ) => {
      if (
        !user ||
        !profile ||
        !isAuthorized
      ) {
        Alert.alert(
          "Access Denied",
          "Only an authorized Admin or Super Admin can issue volunteer certificates.",
        );

        return;
      }

      if (
        summary.verifiedHelps <=
        0
      ) {
        Alert.alert(
          "No Verified Service",
          "This volunteer has no verified assistance record available for certification.",
        );

        return;
      }

      if (
        summary.contributionIds.length ===
        0
      ) {
        Alert.alert(
          "No Contributions",
          "No verified contribution records were found.",
        );

        return;
      }

      const alreadyIssued =
        currentSnapshotCertificate(
          summary,
        );

      if (
        alreadyIssued
      ) {
        Alert.alert(
          "Already Issued",
          alreadyIssued.verificationStatus ===
            "revoked"
            ? "This exact verified-service snapshot already has a revoked certificate. A new verified contribution is required before a new snapshot certificate can be issued."
            : "A certificate has already been issued for this exact verified-service snapshot.",
        );

        return;
      }

      if (
        certificateById.has(
          summary.certificateId,
        )
      ) {
        Alert.alert(
          "Certificate Already Exists",
          "This certificate record already exists.",
        );

        return;
      }

      setBusyVolunteerId(
        summary.volunteerId,
      );

      try {
        const batch =
          writeBatch(
            db,
          );

        const privateCertificateRef =
          doc(
            db,
            "certificates",
            summary.certificateId,
          );

        const publicCertificateRef =
          doc(
            db,
            "publicCertificateVerifications",
            summary.certificateId,
          );

        const notificationRef =
          doc(
            db,
            "notifications",
            `certificate_${summary.certificateId}`,
          );

        // ======================================================
        // PRIVATE / OWNER CERTIFICATE RECORD
        // ======================================================

        batch.set(
          privateCertificateRef,
          {
            certificateId:
              summary.certificateId,

            certificateType:
              CERTIFICATE_TYPE,

            certificateTitle:
              CERTIFICATE_TITLE,

            // userId is intentionally kept for compatibility
            // with the existing My Certificates query.
            userId:
              summary.volunteerId,

            volunteerId:
              summary.volunteerId,

            volunteerName:
              summary.volunteerName,

            verifiedHelps:
              summary.verifiedHelps,

            fullVerifiedHelps:
              summary.fullVerifiedHelps,

            partialVerifiedHelps:
              summary.partialVerifiedHelps,

            verifiedEmergencyResponses:
              summary.verifiedHelps,

            verifiedServiceMinutes:
              summary.verifiedServiceMinutes,

            peopleHelped:
              summary.peopleHelped,

            contributionBreakdown:
              summary.contributionBreakdown,

            contributionCount:
              summary.contributionIds.length,

            // Private certificate may retain contribution IDs
            // for Admin audit/reference.
            contributionIds:
              summary.contributionIds,

            snapshotHash:
              summary.snapshotHash,

            verificationStatus:
              "issued",

            issuedByUid:
              user.uid,

            issuedByName:
              adminName,

            issuedByRole:
              role,

            issuerOrganization:
              ISSUER_ORGANIZATION,

            issuedAt:
              serverTimestamp(),

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
        );

        // ======================================================
        // PUBLIC-SAFE VERIFICATION RECORD
        //
        // NO:
        // residentId
        // caseId
        // address
        // emergency description
        // private contribution IDs
        // ======================================================

        batch.set(
          publicCertificateRef,
          {
            certificateId:
              summary.certificateId,

            certificateType:
              CERTIFICATE_TYPE,

            certificateTitle:
              CERTIFICATE_TITLE,

            volunteerName:
              summary.volunteerName,

            verifiedHelps:
              summary.verifiedHelps,

            fullVerifiedHelps:
              summary.fullVerifiedHelps,

            partialVerifiedHelps:
              summary.partialVerifiedHelps,

            verifiedEmergencyResponses:
              summary.verifiedHelps,

            verifiedServiceMinutes:
              summary.verifiedServiceMinutes,

            peopleHelped:
              summary.peopleHelped,

            contributionBreakdown:
              summary.contributionBreakdown,

            contributionCount:
              summary.contributionIds.length,

            snapshotHash:
              summary.snapshotHash,

            verificationStatus:
              "issued",

            issuedByName:
              adminName,

            issuedByRole:
              role,

            issuerOrganization:
              ISSUER_ORGANIZATION,

            issuedAt:
              serverTimestamp(),

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
        );

        // ======================================================
        // VOLUNTEER NOTIFICATION
        // ======================================================

        batch.set(
          notificationRef,
          {
            userId:
              summary.volunteerId,

            audience:
              "volunteer",

            type:
              "volunteer_certificate_issued",

            title:
              "Volunteer Service Certificate Issued",

            message:
              `Your verified VolunServe service certificate ${summary.certificateId} is now available in My Certificates.`,

            certificateId:
              summary.certificateId,

            read:
              false,

            createdAt:
              serverTimestamp(),
          },
        );

        await batch.commit();

        Alert.alert(
          "Certificate Issued",
          `Certificate ${summary.certificateId} was issued to ${summary.volunteerName}.`,
        );
      } catch (
        problem: any
      ) {
        console.error(
          "Certificate issuance failed:",
          problem,
        );

        Alert.alert(
          "Issuance Failed",

          problem?.message ||
            "Unable to issue the volunteer certificate.",
        );
      } finally {
        setBusyVolunteerId(
          "",
        );
      }
    };

  // ==========================================================
  // LOADING SCREEN
  // ==========================================================

  if (
    loading ||
    contributionsLoading ||
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
          Loading verified volunteer
          records…
        </Text>
      </View>
    );
  }

  // ==========================================================
  // ACCESS SCREEN
  // ==========================================================

  if (
    !isAuthorized
  ) {
    return (
      <View
        style={
          styles.accessCard
        }
      >
        <View
          style={
            styles.accessIcon
          }
        >
          <Ionicons
            name="shield-outline"
            size={32}
            color="#087F78"
          />
        </View>

        <Text
          style={
            styles.accessTitle
          }
        >
          Admin access required
        </Text>

        <Text
          style={
            styles.accessText
          }
        >
          Volunteer certificate
          issuance is available only to
          approved Admin and Super Admin
          accounts.
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
      {/* =====================================================
          HEADER
      ===================================================== */}

      <View
        style={
          styles.header
        }
      >
        <View
          style={
            styles.headerCopy
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            VOLUNTEER RECOGNITION
          </Text>

          <Text
            style={
              styles.title
            }
          >
            Volunteer Certificates
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Review resident-confirmed
            volunteer contributions and
            issue verifiable Volunteer
            Service Certificates.
          </Text>
        </View>

        <View
          style={
            styles.adminBadge
          }
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={17}
            color="#08786F"
          />

          <Text
            style={
              styles.adminBadgeText
            }
          >
            {role ===
            "superadmin"
              ? "SUPER ADMIN"
              : "ADMIN"}
          </Text>
        </View>
      </View>

      {/* =====================================================
          FLOW INFORMATION
      ===================================================== */}

      <View
        style={
          styles.flowCard
        }
      >
        <View
          style={
            styles.flowIcon
          }
        >
          <Ionicons
            name="ribbon-outline"
            size={24}
            color="#087F78"
          />
        </View>

        <View
          style={
            styles.flowCopy
          }
        >
          <Text
            style={
              styles.flowTitle
            }
          >
            Verified contribution
            certificate flow
          </Text>

          <Text
            style={
              styles.flowText
            }
          >
            Mission Complete does not
            automatically become
            verified service. Only Full
            or Partial assistance
            confirmed by the resident
            appears here for certificate
            issuance.
          </Text>
        </View>
      </View>

      {!!error && (
        <View
          style={
            styles.errorCard
          }
        >
          <Ionicons
            name="alert-circle-outline"
            size={19}
            color="#A83232"
          />

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
          OVERVIEW
      ===================================================== */}

      <View
        style={
          styles.summaryGrid
        }
      >
        <View
          style={
            styles.summaryCard
          }
        >
          <Text
            style={
              styles.summaryValue
            }
          >
            {
              volunteerSummaries.length
            }
          </Text>

          <Text
            style={
              styles.summaryLabel
            }
          >
            Volunteers with Verified
            Service
          </Text>
        </View>

        <View
          style={
            styles.summaryCard
          }
        >
          <Text
            style={
              styles.summaryValue
            }
          >
            {
              contributions.length
            }
          </Text>

          <Text
            style={
              styles.summaryLabel
            }
          >
            Verified Contributions
          </Text>
        </View>

        <View
          style={
            styles.summaryCard
          }
        >
          <Text
            style={
              styles.summaryValue
            }
          >
            {
              certificates.filter(
                (
                  certificate,
                ) =>
                  certificate.verificationStatus !==
                  "revoked",
              ).length
            }
          </Text>

          <Text
            style={
              styles.summaryLabel
            }
          >
            Issued Certificates
          </Text>
        </View>
      </View>

      {/* =====================================================
          VERIFIED VOLUNTEER RECORDS
      ===================================================== */}

      <View
        style={
          styles.sectionHeader
        }
      >
        <View>
          <Text
            style={
              styles.sectionTitle
            }
          >
            Verified Volunteer Records
          </Text>

          <Text
            style={
              styles.sectionSubtitle
            }
          >
            Each certificate represents
            the volunteer's current
            verified-service snapshot.
          </Text>
        </View>
      </View>

      {volunteerSummaries.length ===
      0 ? (
        <View
          style={
            styles.emptyCard
          }
        >
          <View
            style={
              styles.emptyIcon
            }
          >
            <Ionicons
              name="document-text-outline"
              size={29}
              color="#78909C"
            />
          </View>

          <Text
            style={
              styles.emptyTitle
            }
          >
            No verified contributions
            yet
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            A record will appear here
            after a volunteer completes
            an emergency response and
            the resident confirms Full
            or Partial assistance.
          </Text>
        </View>
      ) : (
        volunteerSummaries.map(
          (
            summary,
          ) => {
            const existing =
              currentSnapshotCertificate(
                summary,
              );

            const isBusy =
              busyVolunteerId ===
              summary.volunteerId;

            const isAlreadyIssued =
              Boolean(
                existing,
              );

            const isRevoked =
              existing?.verificationStatus ===
              "revoked";

            return (
              <View
                key={
                  summary.volunteerId
                }
                style={
                  styles.volunteerCard
                }
              >
                {/* ============================================
                    VOLUNTEER HEADER
                ============================================ */}

                <View
                  style={
                    styles.volunteerHeader
                  }
                >
                  <View
                    style={
                      styles.avatar
                    }
                  >
                    <Ionicons
                      name="person-outline"
                      size={23}
                      color="#087F78"
                    />
                  </View>

                  <View
                    style={
                      styles.volunteerHeaderCopy
                    }
                  >
                    <Text
                      style={
                        styles.volunteerName
                      }
                    >
                      {
                        summary.volunteerName
                      }
                    </Text>

                    <Text
                      style={
                        styles.volunteerMeta
                      }
                    >
                      {
                        summary.verifiedHelps
                      }{" "}
                      verified response
                      {summary.verifiedHelps ===
                      1
                        ? ""
                        : "s"}
                    </Text>
                  </View>

                  {existing ? (
                    <View
                      style={
                        isRevoked
                          ? styles.revokedBadge
                          : styles.issuedBadge
                      }
                    >
                      <Text
                        style={
                          isRevoked
                            ? styles.revokedBadgeText
                            : styles.issuedBadgeText
                        }
                      >
                        {isRevoked
                          ? "REVOKED SNAPSHOT"
                          : "CURRENT SNAPSHOT ISSUED"}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={
                        styles.readyBadge
                      }
                    >
                      <Text
                        style={
                          styles.readyBadgeText
                        }
                      >
                        READY FOR REVIEW
                      </Text>
                    </View>
                  )}
                </View>

                {/* ============================================
                    METRICS
                ============================================ */}

                <View
                  style={
                    styles.metricsGrid
                  }
                >
                  <MetricBox
                    label="VERIFIED RESPONSES"
                    value={String(
                      summary.verifiedHelps,
                    )}
                  />

                  <MetricBox
                    label="FULL"
                    value={String(
                      summary.fullVerifiedHelps,
                    )}
                  />

                  <MetricBox
                    label="PARTIAL"
                    value={String(
                      summary.partialVerifiedHelps,
                    )}
                  />

                  <MetricBox
                    label="SERVICE TIME"
                    value={formatDuration(
                      summary.verifiedServiceMinutes,
                    )}
                    compact
                  />

                  <MetricBox
                    label="PEOPLE ASSISTED"
                    value={String(
                      summary.peopleHelped,
                    )}
                  />
                </View>

                {/* ============================================
                    CONTRIBUTION BREAKDOWN
                ============================================ */}

                <View
                  style={
                    styles.breakdownCard
                  }
                >
                  <Text
                    style={
                      styles.breakdownHeading
                    }
                  >
                    Verified Contribution
                    Breakdown
                  </Text>

                  {summary.contributionBreakdown.map(
                    (
                      item,
                    ) => (
                      <View
                        key={
                          item.type
                        }
                        style={
                          styles.breakdownRow
                        }
                      >
                        <Text
                          style={
                            styles.breakdownType
                          }
                        >
                          {
                            item.type
                          }
                        </Text>

                        <Text
                          style={
                            styles.breakdownCount
                          }
                        >
                          {
                            item.count
                          }
                        </Text>
                      </View>
                    ),
                  )}
                </View>

                {/* ============================================
                    VERIFIED CONTRIBUTION HISTORY
                ============================================ */}

                <View
                  style={
                    styles.historySection
                  }
                >
                  <Text
                    style={
                      styles.historyTitle
                    }
                  >
                    Records included in
                    this snapshot
                  </Text>

                  {summary.contributions.map(
                    (
                      contribution,
                      index,
                    ) => (
                      <View
                        key={
                          contribution.id
                        }
                        style={
                          styles.historyRow
                        }
                      >
                        <View
                          style={
                            styles.historyNumber
                          }
                        >
                          <Text
                            style={
                              styles.historyNumberText
                            }
                          >
                            {index +
                              1}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.historyCopy
                          }
                        >
                          <Text
                            style={
                              styles.historyType
                            }
                          >
                            {
                              contribution.contributionType
                            }
                          </Text>

                          <Text
                            style={
                              styles.historySummary
                            }
                            numberOfLines={
                              3
                            }
                          >
                            {
                              contribution.contributionSummary
                            }
                          </Text>

                          <Text
                            style={
                              styles.historyMeta
                            }
                          >
                            {contribution.outcome ===
                            "fully_helped"
                              ? "Full Assistance"
                              : "Partial Assistance"}
                            {"  •  "}
                            {formatDuration(
                              serviceMinutesForContribution(
                                contribution,
                              ),
                            )}
                            {"  •  "}
                            {
                              contribution.peopleHelped
                            }{" "}
                            assisted
                          </Text>

                          <Text
                            style={
                              styles.historyDate
                            }
                          >
                            Verified{" "}
                            {formatDate(
                              contribution.verifiedAt ||
                                contribution.residentConfirmedAt,
                            )}
                          </Text>
                        </View>
                      </View>
                    ),
                  )}
                </View>

                {/* ============================================
                    CERTIFICATE SNAPSHOT DETAILS
                ============================================ */}

                <View
                  style={
                    styles.snapshotBox
                  }
                >
                  <View
                    style={
                      styles.snapshotItem
                    }
                  >
                    <Text
                      style={
                        styles.snapshotLabel
                      }
                    >
                      CERTIFICATE ID
                    </Text>

                    <Text
                      selectable
                      style={
                        styles.snapshotValue
                      }
                    >
                      {
                        summary.certificateId
                      }
                    </Text>
                  </View>

                  <View
                    style={
                      styles.snapshotItem
                    }
                  >
                    <Text
                      style={
                        styles.snapshotLabel
                      }
                    >
                      SNAPSHOT
                    </Text>

                    <Text
                      selectable
                      style={
                        styles.snapshotValueSmall
                      }
                    >
                      {
                        summary.snapshotHash
                      }
                    </Text>
                  </View>
                </View>

                {/* ============================================
                    ISSUE ACTION
                ============================================ */}

                <View
                  style={
                    styles.actionArea
                  }
                >
                  {existing ? (
                    <View
                      style={
                        isRevoked
                          ? styles.existingRevokedBox
                          : styles.existingCertificateBox
                      }
                    >
                      <Ionicons
                        name={
                          isRevoked
                            ? "alert-circle-outline"
                            : "checkmark-circle-outline"
                        }
                        size={21}
                        color={
                          isRevoked
                            ? "#A83232"
                            : "#08786F"
                        }
                      />

                      <View
                        style={
                          styles.existingCopy
                        }
                      >
                        <Text
                          style={
                            isRevoked
                              ? styles.existingRevokedTitle
                              : styles.existingTitle
                          }
                        >
                          {isRevoked
                            ? "This snapshot certificate was revoked"
                            : "Certificate already issued for this snapshot"}
                        </Text>

                        <Text
                          style={
                            styles.existingText
                          }
                        >
                          Certificate ID:{" "}
                          {existing.certificateId ||
                            existing.id}
                        </Text>

                        <Text
                          style={
                            styles.existingText
                          }
                        >
                          Issued:{" "}
                          {formatDate(
                            existing.issuedAt,
                          )}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      disabled={
                        isBusy ||
                        isAlreadyIssued
                      }
                      style={[
                        styles.issueButton,

                        isBusy &&
                          styles.buttonDisabled,
                      ]}
                      onPress={() =>
                        void issueCertificate(
                          summary,
                        )
                      }
                    >
                      {isBusy ? (
                        <ActivityIndicator
                          size="small"
                          color="#FFFFFF"
                        />
                      ) : (
                        <>
                          <Ionicons
                            name="ribbon-outline"
                            size={18}
                            color="#FFFFFF"
                          />

                          <Text
                            style={
                              styles.issueButtonText
                            }
                          >
                            Issue Volunteer
                            Service Certificate
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {!existing && (
                    <Text
                      style={
                        styles.issueHint
                      }
                    >
                      Issuing records this
                      exact verified
                      contribution snapshot
                      and creates a
                      public-safe
                      verification record.
                    </Text>
                  )}
                </View>
              </View>
            );
          },
        )
      )}

      {/* =====================================================
          ISSUED CERTIFICATES
      ===================================================== */}

      <View
        style={
          styles.issuedSection
        }
      >
        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Issued Certificates
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              Official Volunteer Service
              Certificates already
              recorded by VolunServe.
            </Text>
          </View>
        </View>

        {certificates.length ===
        0 ? (
          <View
            style={
              styles.smallEmptyCard
            }
          >
            <Text
              style={
                styles.smallEmptyText
              }
            >
              No Volunteer Service
              Certificates have been
              issued yet.
            </Text>
          </View>
        ) : (
          certificates.map(
            (
              certificate,
            ) => {
              const isRevoked =
                certificate.verificationStatus ===
                "revoked";

              return (
                <View
                  key={
                    certificate.id
                  }
                  style={
                    styles.issuedCard
                  }
                >
                  <View
                    style={
                      styles.issuedIcon
                    }
                  >
                    <Ionicons
                      name="ribbon-outline"
                      size={22}
                      color="#087F78"
                    />
                  </View>

                  <View
                    style={
                      styles.issuedCopy
                    }
                  >
                    <Text
                      style={
                        styles.issuedVolunteer
                      }
                    >
                      {certificate.volunteerName ||
                        "Volunteer"}
                    </Text>

                    <Text
                      selectable
                      style={
                        styles.issuedId
                      }
                    >
                      {certificate.certificateId ||
                        certificate.id}
                    </Text>

                    <Text
                      style={
                        styles.issuedMeta
                      }
                    >
                      {Number(
                        certificate.verifiedHelps ||
                          0,
                      )}{" "}
                      verified response
                      {Number(
                        certificate.verifiedHelps ||
                          0,
                      ) === 1
                        ? ""
                        : "s"}
                      {"  •  "}
                      {formatDuration(
                        Number(
                          certificate.verifiedServiceMinutes ||
                            0,
                        ),
                      )}
                      {"  •  "}
                      {formatDate(
                        certificate.issuedAt,
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      isRevoked
                        ? styles.listRevokedBadge
                        : styles.listVerifiedBadge
                    }
                  >
                    <Text
                      style={
                        isRevoked
                          ? styles.listRevokedText
                          : styles.listVerifiedText
                      }
                    >
                      {isRevoked
                        ? "REVOKED"
                        : "ISSUED"}
                    </Text>
                  </View>
                </View>
              );
            },
          )
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================
// METRIC COMPONENT
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
      maxWidth: 1100,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 80,
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
      fontSize: 12,
    },

    accessCard: {
      margin: 24,
      padding: 28,
      alignItems: "center",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    accessIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E8F6F2",
    },

    accessTitle: {
      marginTop: 12,
      color: "#173748",
      fontSize: 18,
      fontWeight: "900",
    },

    accessText: {
      marginTop: 5,
      maxWidth: 450,
      color: "#70838E",
      fontSize: 11,
      lineHeight: 17,
      textAlign: "center",
    },

    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 14,
      marginBottom: 17,
    },

    headerCopy: {
      flex: 1,
      minWidth: 260,
    },

    eyebrow: {
      color: "#087F78",
      fontSize: 9.5,
      fontWeight: "900",
      letterSpacing: 1.2,
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
      maxWidth: 690,
      color: "#64748B",
      fontSize: 12.5,
      lineHeight: 19,
    },

    adminBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor:
        "#E7F6F1",
      borderWidth: 1,
      borderColor:
        "#C9E8DF",
    },

    adminBadgeText: {
      color: "#08786F",
      fontSize: 8.5,
      fontWeight: "900",
    },

    flowCard: {
      marginBottom: 14,
      padding: 15,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 11,
      borderRadius: 14,
      backgroundColor:
        "#ECF8F5",
      borderWidth: 1,
      borderColor:
        "#CBE7E0",
    },

    flowIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#D8F0E9",
    },

    flowCopy: {
      flex: 1,
    },

    flowTitle: {
      color: "#08786F",
      fontSize: 12.5,
      fontWeight: "900",
    },

    flowText: {
      marginTop: 3,
      color: "#587174",
      fontSize: 10.5,
      lineHeight: 17,
    },

    errorCard: {
      marginBottom: 14,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 10,
      backgroundColor:
        "#FFF1F1",
      borderWidth: 1,
      borderColor:
        "#EDC6C6",
    },

    errorText: {
      flex: 1,
      color: "#A83232",
      fontSize: 10.5,
      fontWeight: "700",
    },

    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 23,
    },

    summaryCard: {
      flexGrow: 1,
      flexBasis: 190,
      minWidth: 170,
      padding: 15,
      borderRadius: 13,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    summaryValue: {
      color: "#087F78",
      fontSize: 24,
      fontWeight: "900",
    },

    summaryLabel: {
      marginTop: 3,
      color: "#6D818C",
      fontSize: 9.5,
      lineHeight: 14,
      fontWeight: "800",
      textTransform:
        "uppercase",
    },

    sectionHeader: {
      marginBottom: 11,
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
    },

    sectionTitle: {
      color: "#173748",
      fontSize: 17,
      fontWeight: "900",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: "#7A8E99",
      fontSize: 10.5,
      lineHeight: 16,
    },

    emptyCard: {
      marginBottom: 20,
      padding: 27,
      alignItems: "center",
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F0F4F6",
    },

    emptyTitle: {
      marginTop: 10,
      color: "#405866",
      fontSize: 14,
      fontWeight: "900",
    },

    emptyText: {
      marginTop: 4,
      maxWidth: 520,
      color: "#7A8D97",
      fontSize: 10.5,
      lineHeight: 17,
      textAlign: "center",
    },

    volunteerCard: {
      marginBottom: 16,
      padding: 18,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    volunteerHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 11,
    },

    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E5F6F1",
    },

    volunteerHeaderCopy: {
      flex: 1,
      minWidth: 180,
    },

    volunteerName: {
      color: "#173748",
      fontSize: 15,
      fontWeight: "900",
    },

    volunteerMeta: {
      marginTop: 2,
      color: "#7B8E98",
      fontSize: 9.5,
    },

    readyBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#FFF7E4",
    },

    readyBadgeText: {
      color: "#8A6827",
      fontSize: 7.5,
      fontWeight: "900",
    },

    issuedBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#E5F6F0",
    },

    issuedBadgeText: {
      color: "#08786F",
      fontSize: 7.5,
      fontWeight: "900",
    },

    revokedBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#FFEAEA",
    },

    revokedBadgeText: {
      color: "#A83232",
      fontSize: 7.5,
      fontWeight: "900",
    },

    metricsGrid: {
      marginTop: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    metricBox: {
      flexGrow: 1,
      flexBasis: 135,
      minWidth: 120,
      padding: 11,
      alignItems: "center",
      borderRadius: 9,
      backgroundColor:
        "#F5FAF8",
      borderWidth: 1,
      borderColor:
        "#DEEAE6",
    },

    metricValue: {
      color: "#087F78",
      fontSize: 19,
      fontWeight: "900",
    },

    metricValueCompact: {
      color: "#087F78",
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "900",
      textAlign: "center",
    },

    metricLabel: {
      marginTop: 4,
      color: "#7A8E98",
      fontSize: 7.5,
      fontWeight: "900",
      letterSpacing: 0.4,
      textAlign: "center",
    },

    breakdownCard: {
      marginTop: 14,
      padding: 13,
      borderRadius: 10,
      backgroundColor:
        "#FAFCFC",
      borderWidth: 1,
      borderColor:
        "#E2EAED",
    },

    breakdownHeading: {
      marginBottom: 5,
      color: "#405D69",
      fontSize: 10.5,
      fontWeight: "900",
    },

    breakdownRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      gap: 12,
      paddingVertical: 7,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E2E8EB",
    },

    breakdownType: {
      flex: 1,
      color: "#596F7B",
      fontSize: 10,
    },

    breakdownCount: {
      color: "#087F78",
      fontSize: 10.5,
      fontWeight: "900",
    },

    historySection: {
      marginTop: 15,
    },

    historyTitle: {
      marginBottom: 8,
      color: "#405D69",
      fontSize: 10.5,
      fontWeight: "900",
    },

    historyRow: {
      flexDirection: "row",
      gap: 9,
      paddingVertical: 9,
      borderTopWidth:
        StyleSheet.hairlineWidth,
      borderTopColor:
        "#E2E8EB",
    },

    historyNumber: {
      width: 27,
      height: 27,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E5F5F1",
    },

    historyNumberText: {
      color: "#087F78",
      fontSize: 9,
      fontWeight: "900",
    },

    historyCopy: {
      flex: 1,
    },

    historyType: {
      color: "#294653",
      fontSize: 10.5,
      fontWeight: "900",
    },

    historySummary: {
      marginTop: 3,
      color: "#657984",
      fontSize: 9.5,
      lineHeight: 15,
    },

    historyMeta: {
      marginTop: 4,
      color: "#08786F",
      fontSize: 8.5,
      fontWeight: "700",
    },

    historyDate: {
      marginTop: 3,
      color: "#94A3AB",
      fontSize: 8,
    },

    snapshotBox: {
      marginTop: 14,
      padding: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      borderRadius: 9,
      backgroundColor:
        "#F7F9FA",
    },

    snapshotItem: {
      flexGrow: 1,
      flexBasis: 230,
    },

    snapshotLabel: {
      color: "#8A9AA3",
      fontSize: 7.5,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    snapshotValue: {
      marginTop: 3,
      color: "#294653",
      fontSize: 10.5,
      fontWeight: "900",
    },

    snapshotValueSmall: {
      marginTop: 3,
      color: "#647984",
      fontSize: 8.5,
      fontWeight: "700",
    },

    actionArea: {
      marginTop: 15,
    },

    issueButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      borderRadius: 10,
      backgroundColor:
        "#087F78",
    },

    issueButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    buttonDisabled: {
      opacity: 0.6,
    },

    issueHint: {
      marginTop: 6,
      color: "#8A9AA3",
      fontSize: 8.5,
      lineHeight: 13,
      textAlign: "center",
    },

    existingCertificateBox: {
      padding: 12,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 9,
      borderRadius: 10,
      backgroundColor:
        "#EBF8F4",
      borderWidth: 1,
      borderColor:
        "#CAE6DE",
    },

    existingRevokedBox: {
      padding: 12,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 9,
      borderRadius: 10,
      backgroundColor:
        "#FFF1F1",
      borderWidth: 1,
      borderColor:
        "#EDC6C6",
    },

    existingCopy: {
      flex: 1,
    },

    existingTitle: {
      color: "#08786F",
      fontSize: 10.5,
      fontWeight: "900",
    },

    existingRevokedTitle: {
      color: "#A83232",
      fontSize: 10.5,
      fontWeight: "900",
    },

    existingText: {
      marginTop: 2,
      color: "#687D87",
      fontSize: 8.5,
    },

    issuedSection: {
      marginTop: 14,
      paddingTop: 19,
      borderTopWidth: 1,
      borderTopColor:
        "#DCE5EA",
    },

    smallEmptyCard: {
      padding: 15,
      borderRadius: 11,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    smallEmptyText: {
      color: "#7B8E98",
      fontSize: 10.5,
    },

    issuedCard: {
      marginBottom: 8,
      padding: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 11,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    issuedIcon: {
      width: 39,
      height: 39,
      borderRadius: 20,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E5F6F1",
    },

    issuedCopy: {
      flex: 1,
      minWidth: 0,
    },

    issuedVolunteer: {
      color: "#294653",
      fontSize: 11,
      fontWeight: "900",
    },

    issuedId: {
      marginTop: 2,
      color: "#087F78",
      fontSize: 9,
      fontWeight: "800",
    },

    issuedMeta: {
      marginTop: 3,
      color: "#82939C",
      fontSize: 8.5,
      lineHeight: 13,
    },

    listVerifiedBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#E3F5EF",
    },

    listVerifiedText: {
      color: "#08786F",
      fontSize: 7.5,
      fontWeight: "900",
    },

    listRevokedBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#FFEAEA",
    },

    listRevokedText: {
      color: "#A83232",
      fontSize: 7.5,
      fontWeight: "900",
    },
  });