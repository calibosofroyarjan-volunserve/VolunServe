import { blockProductionEvidenceUploadDuringStaging } from "../../lib/stagingExpoServiceIsolation";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
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
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | string;

type AssignmentStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "responding"
  | "on_site"
  | "completed"
  | "cancelled"
  | string;

type ConfirmationOutcome =
  | "fully_helped"
  | "partially_helped"
  | "not_helped";

type EvidenceAsset = {
  uri: string;
  kind: "image" | "video";
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  file?: any;
};

type EvidenceAttachment = {
  url: string;
  path: string;
  type: "image" | "video";
  name: string;
  contentType: string;
  sizeBytes: number;
  provider?: "cloudinary";
  publicId?: string;
  assetId?: string;
  resourceType?: string;
};

type EvidenceDraft = {
  photos: EvidenceAsset[];
  video: EvidenceAsset | null;
};

const CLOUDINARY_CLOUD_NAME = "netjawtz";
const CLOUDINARY_UPLOAD_PRESET = "volunserve_evidence";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

const fileNameFromUri = (uri: string) =>
  uri.split("/").pop()?.split("?")[0] || "evidence";

const normalizePickerAsset = (
  asset: ImagePicker.ImagePickerAsset,
  kind: "image" | "video",
): EvidenceAsset => ({
  uri: asset.uri,
  kind,
  fileName:
    asset.fileName ||
    fileNameFromUri(asset.uri) ||
    `${kind}-${Date.now()}`,
  fileSize:
    typeof asset.fileSize === "number"
      ? asset.fileSize
      : null,
  mimeType: asset.mimeType || null,
  file: (asset as any).file,
});

const contentTypeForEvidence = (asset: EvidenceAsset) => {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  return asset.kind === "image"
    ? "image/jpeg"
    : "video/mp4";
};

const extensionForEvidence = (asset: EvidenceAsset) => {
  const name = String(asset.fileName || "");
  const extension = name.includes(".")
    ? name.split(".").pop()
    : "";

  if (extension) {
    return extension;
  }

  return asset.kind === "image" ? "jpg" : "mp4";
};

type DisasterCase = {
  id: string;

  reporterUid?: string;
  reporterName?: string;
  reporterProfilePictureUrl?: string;

  title?: string;
  category?: string;
  severity?: string;

  status?: CaseStatus;

  verificationStatus?: string;
  evidenceReviewStatus?: string;
  evidenceRequestReason?: string;
  evidenceRequestedAt?: any;

  attachments?: EvidenceAttachment[];
  photoEvidenceCount?: number;
  videoEvidenceCount?: number;

  location?: string;
  details?: string;
  needs?: string;

  assistanceTypes?: string[];
  requiredSkills?: string[];
  neededGoods?: string[];

  affectedPeople?: number;

  assignedVolunteerIds?: string[];

  createdAt?: any;
  updatedAt?: any;
};

/**
 * Emergency-report photos only. Do not substitute resident profile photos,
 * user avatars, or generic stock images. The report form saves ordered
 * Cloudinary evidence in disasterCases.attachments.
 */
const getReportPhotoAttachments = (attachments?: EvidenceAttachment[]) => {
  if (!Array.isArray(attachments)) return [];
  return attachments.filter((asset) => {
    if (!asset || typeof asset !== "object") return false;
    if (asset.type !== "image" && !String(asset.contentType || "").startsWith("image/")) {
      return false;
    }
    return typeof asset.url === "string" && /^https:\/\//i.test(asset.url.trim());
  });
};

const reportIconName = (
  category?: string,
): React.ComponentProps<typeof MaterialCommunityIcons>["name"] => {
  const value = String(category || "").toLowerCase();
  if (value.includes("flood") || value.includes("water")) return "waves";
  if (value.includes("fire")) return "fire";
  if (value.includes("road") || value.includes("obstruction")) return "road-variant";
  if (value.includes("medical")) return "medical-bag";
  if (value.includes("home") || value.includes("structural")) return "home-outline";
  return "alert-circle-outline";
};

function ReportPhoto({
  url,
  category,
  expanded = false,
}: {
  url?: string;
  category?: string;
  expanded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);

  const available = typeof url === "string" && url.length > 0 && !failed;
  return (
    <View style={expanded ? styles.reportPhotoExpanded : styles.reportPhotoThumbnail}>
      {available ? (
        <Image
          source={{ uri: url }}
          resizeMode={expanded ? "contain" : "cover"}
          style={styles.reportPhotoImage}
          accessibilityLabel={expanded ? "Uploaded emergency report photo" : "Emergency report photo thumbnail"}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.reportPhotoPlaceholder}>
          <MaterialCommunityIcons
            name={reportIconName(category)}
            size={expanded ? 34 : 27}
            color="#176B52"
          />
          <Text style={styles.reportPhotoPlaceholderText}>
            {failed ? "Photo unavailable" : "No photo"}
          </Text>
        </View>
      )}
    </View>
  );
}


const initialsForPerson = (name?: string) => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return words.map((word) => word.charAt(0).toLocaleUpperCase()).join("") || "VS";
};

function PersonProfileAvatar({
  name,
  imageUrl,
}: {
  name?: string;
  imageUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [imageUrl]);
  const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const showImage = /^https:\/\//i.test(url) && !failed;
  return (
    <View style={styles.personAvatar}>
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={styles.personAvatarPhoto}
          resizeMode="cover"
          accessibilityLabel={`Profile photo of ${name || "report participant"}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={styles.personAvatarInitials}>
          {initialsForPerson(name)}
        </Text>
      )}
    </View>
  );
}

type ResponseAssignment = {
  id: string;

  caseId?: string;

  volunteerId?: string;
  volunteerName?: string;
  // Optional profile photo only when safely supplied within an assigned response.
  volunteerProfilePictureUrl?: string;

  caseTitle?: string;

  status?: AssignmentStatus;

  contributionType?: string;
  contributionSummary?: string;

  peopleHelped?: number;

  completionNotes?: string;

  residentConfirmationStatus?: string;
  residentConfirmationOutcome?: string;

  verifiedContributionId?: string;

  responseStartedAt?: any;
  arrivedAt?: any;
  completedAt?: any;

  updatedAt?: any;
};

type AssistanceConfirmation = {
  id: string;

  assignmentId?: string;
  caseId?: string;

  residentId?: string;
  volunteerId?: string;

  outcome?: ConfirmationOutcome;

  reviewState?:
    | "resident_confirmed"
    | "disputed"
    | string;

  residentNote?: string;

  creditStatus?:
    | "credited"
    | "disputed"
    | string;

  createdAt?: any;
};

const activeAssignmentStates = [
  "accepted",
  "responding",
  "on_site",
];

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
    value instanceof Date
  ) {
    return value.getTime();
  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const formatDate = (
  value: any,
) => {
  const ms =
    toMillis(value);

  if (!ms) {
    return "—";
  }

  return new Date(
    ms,
  ).toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  );
};

const humanize = (
  value?: string,
) =>
  String(
    value || "unknown",
  )
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );

const caseStatusLabel = (
  status?: string,
) => {
  switch (status) {
    case "reported":
      return "Submitted";

    case "validated":
      return "Validated";

    case "assigned":
      return "Responder assigned";

    case "in_progress":
      return "Response in progress";

    case "resolved":
      return "Resolved";

    case "closed":
      return "Closed";

    default:
      return humanize(
        status,
      );
  }
};

const assignmentStatusLabel = (
  status?: string,
) => {
  switch (status) {
    case "offered":
      return "Waiting for responder";

    case "accepted":
      return "Accepted";

    case "responding":
      return "Responder on the way";

    case "on_site":
      return "Responder on site";

    case "completed":
      return "Mission completed";

    case "declined":
      return "Declined";

    case "cancelled":
      return "Cancelled";

    default:
      return humanize(
        status,
      );
  }
};

const outcomeLabel = (
  outcome?: ConfirmationOutcome,
) => {
  switch (outcome) {
    case "fully_helped":
      return "Fully helped";

    case "partially_helped":
      return "Partially helped";

    case "not_helped":
      return "Not helped / Admin review";

    default:
      return "Confirmation submitted";
  }
};

export default function MyCases() {
  const router =
    useRouter();

  const {
    user,
    profile,
    loading,
  } =
    useUserSession();

  const [
    cases,
    setCases,
  ] =
    useState<
      DisasterCase[]
    >([]);

  const [
    assignmentsByCase,
    setAssignmentsByCase,
  ] =
    useState<
      Record<
        string,
        ResponseAssignment[]
      >
    >({});

  const [
    confirmations,
    setConfirmations,
  ] =
    useState<
      Record<
        string,
        AssistanceConfirmation
      >
    >({});

  const [
    casesLoading,
    setCasesLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");
  // UI state only: the Firestore queries and workflows are not modified.
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);
  const [reportFilter, setReportFilter] = useState<"all" | "open" | "closed">("all");
  const [reportSearch, setReportSearch] = useState("");
  const closedStatuses = ["resolved", "closed"];
  const openCaseCount = cases.filter(
    (incident) => !closedStatuses.includes(String(incident.status || "")),
  ).length;
  const visibleCases = cases.filter((incident) => {
    const closed = closedStatuses.includes(String(incident.status || ""));
    if (reportFilter === "open" && closed) return false;
    if (reportFilter === "closed" && !closed) return false;
    const term = reportSearch.trim().toLowerCase();
    return !term || [incident.title, incident.category, incident.location, incident.id]
      .some((value) => String(value || "").toLowerCase().includes(term));
  });


  const [
    busyAssignmentId,
    setBusyAssignmentId,
  ] =
    useState("");

  const [
    reviewingAssignmentId,
    setReviewingAssignmentId,
  ] =
    useState("");

  const [
    selectedOutcome,
    setSelectedOutcome,
  ] =
    useState<
      ConfirmationOutcome | null
    >(null);

  const [
    residentNote,
    setResidentNote,
  ] =
    useState("");

  const [
    reviewError,
    setReviewError,
  ] =
    useState("");

  const [
    evidenceDrafts,
    setEvidenceDrafts,
  ] = useState<
    Record<string, EvidenceDraft>
  >({});

  const [
    evidenceBusyCaseId,
    setEvidenceBusyCaseId,
  ] = useState("");

  const [
    evidenceProgressByCase,
    setEvidenceProgressByCase,
  ] = useState<Record<string, string>>({});

  const [
    evidenceErrorByCase,
    setEvidenceErrorByCase,
  ] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) {
      setCases([]);
      setCasesLoading(
        false,
      );

      return;
    }

    setCasesLoading(
      true,
    );

    setError("");

    const residentCasesQuery =
      query(
        collection(
          db,
          "disasterCases",
        ),

        where(
          "reporterUid",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      residentCasesQuery,

      (
        snapshot,
      ) => {
        const rows =
          snapshot.docs
            .map(
              (
                caseDoc,
              ) => ({
                id:
                  caseDoc.id,

                ...(caseDoc.data() as Omit<
                  DisasterCase,
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
                  right.createdAt,
                ) -
                toMillis(
                  left.createdAt,
                ),
            );

        setCases(
          rows,
        );

        setCasesLoading(
          false,
        );
      },

      (
        problem,
      ) => {
        console.error(
          "Resident disasterCases listener failed",
          problem,
        );

        setError(
          "Unable to load your emergency reports. Check the deployed Firestore rules.",
        );

        setCasesLoading(
          false,
        );
      },
    );
  }, [
    user?.uid,
  ]);

  const assignmentWatchKey =
    useMemo(
      () =>
        cases
          .map(
            (
              incident,
            ) => {
              const volunteerIds =
                Array.isArray(
                  incident.assignedVolunteerIds,
                )
                  ? incident.assignedVolunteerIds
                      .map(
                        (
                          value,
                        ) =>
                          String(
                            value ||
                              "",
                          ).trim(),
                      )
                      .filter(
                        Boolean,
                      )
                  : [];

              const uniqueVolunteerIds =
                Array.from(
                  new Set(
                    volunteerIds,
                  ),
                ).sort();

              return `${incident.id}:${uniqueVolunteerIds.join(
                ",",
              )}`;
            },
          )
          .sort()
          .join("|"),

      [
        cases,
      ],
    );

  useEffect(() => {
    if (
      !user ||
      !cases.length
    ) {
      setAssignmentsByCase(
        {},
      );

      return;
    }

    /**
     * Resident assignment reads use exact Firestore documents.
     *
     * Admin assignment documents use:
     *   caseId_volunteerId
     *
     * disasterCases stores assignedVolunteerIds.
     *
     * This avoids a resident-side collection query across
     * responseAssignments, which can be rejected by the
     * linked-case Firestore ownership rules.
     */

    let disposed =
      false;

    const unsubscribers:
      Array<
        () => void
      > = [];

    const buckets:
      Record<
        string,
        Record<
          string,
          ResponseAssignment
        >
      > = {};

    const initialState:
      Record<
        string,
        ResponseAssignment[]
      > = {};

    cases.forEach(
      (
        incident,
      ) => {
        buckets[
          incident.id
        ] = {};

        initialState[
          incident.id
        ] = [];
      },
    );

    setAssignmentsByCase(
      initialState,
    );

    const publishCase =
      (
        caseId: string,
      ) => {
        if (disposed) {
          return;
        }

        const rows =
          Object.values(
            buckets[
              caseId
            ] || {},
          ).sort(
            (
              left,
              right,
            ) =>
              toMillis(
                right.updatedAt,
              ) -
              toMillis(
                left.updatedAt,
              ),
          );

        setAssignmentsByCase(
          (
            current,
          ) => ({
            ...current,

            [
              caseId
            ]:
              rows,
          }),
        );

        setError(
          (
            current,
          ) =>
            current.startsWith(
              "Your reports loaded, but responder assignments",
            )
              ? ""
              : current,
        );
      };

    cases.forEach(
      (
        incident,
      ) => {
        const volunteerIds =
          Array.isArray(
            incident.assignedVolunteerIds,
          )
            ? Array.from(
                new Set(
                  incident.assignedVolunteerIds
                    .map(
                      (
                        value,
                      ) =>
                        String(
                          value ||
                            "",
                        ).trim(),
                    )
                    .filter(
                      Boolean,
                    ),
                ),
              )
            : [];

        if (
          volunteerIds.length ===
          0
        ) {
          publishCase(
            incident.id,
          );

          return;
        }

        volunteerIds.forEach(
          (
            volunteerId,
          ) => {
            const assignmentId =
              `${incident.id}_${volunteerId}`;

            const assignmentRef =
              doc(
                db,
                "responseAssignments",
                assignmentId,
              );

            const unsubscribe =
              onSnapshot(
                assignmentRef,

                (
                  snapshot,
                ) => {
                  if (
                    snapshot.exists()
                  ) {
                    buckets[
                      incident.id
                    ][
                      assignmentId
                    ] = {
                      id:
                        snapshot.id,

                      ...(snapshot.data() as Omit<
                        ResponseAssignment,
                        "id"
                      >),
                    };
                  } else {
                    delete buckets[
                      incident.id
                    ][
                      assignmentId
                    ];
                  }

                  publishCase(
                    incident.id,
                  );
                },

                (
                  problem,
                ) => {
                  console.error(
                    `responseAssignments document listener failed for ${assignmentId}`,
                    problem,
                  );

                  setError(
                    "Your reports loaded, but responder assignments could not be read.",
                  );
                },
              );

            unsubscribers.push(
              unsubscribe,
            );
          },
        );
      },
    );

    return () => {
      disposed =
        true;

      unsubscribers.forEach(
        (
          unsubscribe,
        ) =>
          unsubscribe(),
      );
    };
  }, [
    user?.uid,
    assignmentWatchKey,
  ]);

  useEffect(() => {
    if (!user) {
      setConfirmations(
        {},
      );

      return;
    }

    const confirmationQuery =
      query(
        collection(
          db,
          "assistanceConfirmations",
        ),

        where(
          "residentId",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      confirmationQuery,

      (
        snapshot,
      ) => {
        const next:
          Record<
            string,
            AssistanceConfirmation
          > = {};

        snapshot.docs.forEach(
          (
            confirmationDoc,
          ) => {
            const row = {
              id:
                confirmationDoc.id,

              ...(confirmationDoc.data() as Omit<
                AssistanceConfirmation,
                "id"
              >),
            };

            if (
              row.assignmentId
            ) {
              next[
                row.assignmentId
              ] = row;
            }
          },
        );

        setConfirmations(
          next,
        );
      },

      (
        problem,
      ) => {
        console.error(
          "assistanceConfirmations listener failed",
          problem,
        );

        setError(
          "Assistance confirmations could not be loaded.",
        );
      },
    );
  }, [
    user?.uid,
  ]);

  const draftForCase = (caseId: string): EvidenceDraft =>
    evidenceDrafts[caseId] || {
      photos: [],
      video: null,
    };

  const updateEvidenceDraft = (
    caseId: string,
    updater: (draft: EvidenceDraft) => EvidenceDraft,
  ) => {
    setEvidenceDrafts((current) => ({
      ...current,
      [caseId]: updater(
        current[caseId] || {
          photos: [],
          video: null,
        },
      ),
    }));

    setEvidenceErrorByCase((current) => ({
      ...current,
      [caseId]: "",
    }));
  };

  const chooseAdditionalPhoto = async (incident: DisasterCase) => {
    if (evidenceBusyCaseId) {
      return;
    }

    const existingCount = Number(incident.photoEvidenceCount || 0);
    const draft = draftForCase(incident.id);

    if (existingCount + draft.photos.length >= 10) {
      Alert.alert(
        "Photo Limit",
        "This emergency already has the maximum number of evidence photos.",
      );
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access to attach the additional evidence requested by the LGU.",
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.75,
      });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = normalizePickerAsset(
      result.assets[0],
      "image",
    );

    if (
      typeof asset.fileSize === "number" &&
      asset.fileSize >= 10 * 1024 * 1024
    ) {
      Alert.alert(
        "Photo Too Large",
        "Each additional evidence photo must be under 10 MB.",
      );
      return;
    }

    updateEvidenceDraft(incident.id, (current) => ({
      ...current,
      photos: [...current.photos, asset],
    }));
  };

  const chooseAdditionalVideo = async (incident: DisasterCase) => {
    if (evidenceBusyCaseId) {
      return;
    }

    const existingCount = Number(incident.videoEvidenceCount || 0);
    const draft = draftForCase(incident.id);

    if (existingCount >= 2 && !draft.video) {
      Alert.alert(
        "Video Limit",
        "This emergency already has the maximum number of optional evidence videos.",
      );
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access to attach an optional evidence video.",
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Videos,
      });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = normalizePickerAsset(
      result.assets[0],
      "video",
    );

    if (
      typeof asset.fileSize === "number" &&
      asset.fileSize >= 50 * 1024 * 1024
    ) {
      Alert.alert(
        "Video Too Large",
        "The optional additional evidence video must be under 50 MB.",
      );
      return;
    }

    updateEvidenceDraft(incident.id, (current) => ({
      ...current,
      video: asset,
    }));
  };

  const removeAdditionalPhoto = (
    caseId: string,
    photoIndex: number,
  ) => {
    updateEvidenceDraft(caseId, (current) => ({
      ...current,
      photos: current.photos.filter(
        (_, index) => index !== photoIndex,
      ),
    }));
  };

  const clearAdditionalVideo = (caseId: string) => {
    updateEvidenceDraft(caseId, (current) => ({
      ...current,
      video: null,
    }));
  };

  const uploadAdditionalEvidence = async (
    caseId: string,
    assets: EvidenceAsset[],
  ): Promise<EvidenceAttachment[]> => {
    blockProductionEvidenceUploadDuringStaging();
    const attachments: EvidenceAttachment[] = [];

    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const contentType = contentTypeForEvidence(asset);
      const extension = extensionForEvidence(asset);
      const fileName =
        asset.fileName ||
        `additional-evidence-${Date.now()}-${index}.${extension}`;

      setEvidenceProgressByCase((current) => ({
        ...current,
        [caseId]:
          `Uploading ${asset.kind === "image" ? "photo" : "video"} ${index + 1} of ${assets.length}…`,
      }));

      const body = new FormData();

      if (asset.file) {
        body.append("file", asset.file);
      } else {
        body.append(
          "file",
          {
            uri: asset.uri,
            name: fileName,
            type: contentType,
          } as any,
        );
      }

      body.append(
        "upload_preset",
        CLOUDINARY_UPLOAD_PRESET,
      );

      const response = await fetch(
        CLOUDINARY_UPLOAD_URL,
        {
          method: "POST",
          body,
        },
      );

      const result = await response
        .json()
        .catch(() => null);

      if (
        !response.ok ||
        !result ||
        typeof result.secure_url !== "string" ||
        typeof result.public_id !== "string"
      ) {
        throw new Error(
          result?.error?.message ||
            "Cloudinary evidence upload failed.",
        );
      }

      attachments.push({
        path: result.public_id,
        url: result.secure_url,
        type: asset.kind,
        name: fileName,
        contentType,
        sizeBytes:
          typeof result.bytes === "number"
            ? result.bytes
            : asset.fileSize || 0,
        provider: "cloudinary",
        publicId: result.public_id,
        assetId:
          typeof result.asset_id === "string"
            ? result.asset_id
            : undefined,
        resourceType:
          typeof result.resource_type === "string"
            ? result.resource_type
            : asset.kind,
      });
    }

    return attachments;
  };

  const submitAdditionalEvidence = async (incident: DisasterCase) => {
    if (!user || evidenceBusyCaseId) {
      return;
    }

    if (
      incident.reporterUid !== user.uid ||
      incident.verificationStatus !== "needs_more_evidence"
    ) {
      setEvidenceErrorByCase((current) => ({
        ...current,
        [incident.id]:
          "This case is no longer waiting for additional evidence.",
      }));
      return;
    }

    const draft = draftForCase(incident.id);

    if (draft.photos.length < 1) {
      setEvidenceErrorByCase((current) => ({
        ...current,
        [incident.id]:
          "Add at least one new photo requested by the LGU before submitting.",
      }));
      return;
    }

    const existingAttachments = Array.isArray(incident.attachments)
      ? incident.attachments
      : [];

    const existingPhotos = Number(incident.photoEvidenceCount || 0);
    const existingVideos = Number(incident.videoEvidenceCount || 0);

    if (existingPhotos + draft.photos.length > 10) {
      setEvidenceErrorByCase((current) => ({
        ...current,
        [incident.id]:
          "This case would exceed the evidence photo limit. Remove a selected photo and try again.",
      }));
      return;
    }

    if (existingVideos + (draft.video ? 1 : 0) > 2) {
      setEvidenceErrorByCase((current) => ({
        ...current,
        [incident.id]:
          "This case would exceed the optional evidence video limit.",
      }));
      return;
    }

    setEvidenceBusyCaseId(incident.id);
    setEvidenceErrorByCase((current) => ({
      ...current,
      [incident.id]: "",
    }));

    try {
      const newAttachments =
        await uploadAdditionalEvidence(
          incident.id,
          [
            ...draft.photos,
            ...(draft.video ? [draft.video] : []),
          ],
        );

      setEvidenceProgressByCase((current) => ({
        ...current,
        [incident.id]: "Saving evidence to your existing case…",
      }));

      const batch = writeBatch(db);
      const caseRef = doc(
        db,
        "disasterCases",
        incident.id,
      );

      batch.update(caseRef, {
        attachments: [
          ...existingAttachments,
          ...newAttachments,
        ],
        photoEvidenceCount:
          existingPhotos + draft.photos.length,
        videoEvidenceCount:
          existingVideos + (draft.video ? 1 : 0),
        evidenceReviewStatus: "resubmitted",
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setEvidenceDrafts((current) => {
        const next = { ...current };
        delete next[incident.id];
        return next;
      });

      Alert.alert(
        "Evidence Submitted",
        "Your new evidence was added to the same emergency case. The LGU can now review it again.",
      );
    } catch (problem: any) {
      const message = String(
        problem?.message ||
          problem?.code ||
          "",
      );

      setEvidenceErrorByCase((current) => ({
        ...current,
        [incident.id]:
          message.includes("permission") ||
          message.includes("unauthorized")
            ? "The evidence update was blocked by Firestore rules. Deploy the current Emergency rules and try again."
            : message.includes("Cloudinary") ||
                message.includes("cloudinary")
              ? "The evidence upload failed. Check your connection and try again; your selected files were kept."
              : "Could not submit the additional evidence. Your selected files were kept so you can retry.",
      }));
    } finally {
      setEvidenceBusyCaseId("");
      setEvidenceProgressByCase((current) => ({
        ...current,
        [incident.id]: "",
      }));
    }
  };

  const resetReview =
    () => {
      setReviewingAssignmentId(
        "",
      );

      setSelectedOutcome(
        null,
      );

      setResidentNote(
        "",
      );

      setReviewError(
        "",
      );
    };

  const startReview =
    (
      assignmentId: string,
    ) => {
      setReviewingAssignmentId(
        assignmentId,
      );

      setSelectedOutcome(
        null,
      );

      setResidentNote(
        "",
      );

      setReviewError(
        "",
      );
    };

  const openCaseMap =
    (
      caseId: string,
    ) => {
      router.push({
        pathname:
          "/map-tracking" as any,

        params: {
          caseId,
        },
      });
    };

  const submitConfirmation =
    async (
      incident:
        DisasterCase,

      assignment:
        ResponseAssignment,
    ) => {
      if (!user) {
        return;
      }

      if (
        assignment.status !==
        "completed"
      ) {
        setReviewError(
          "You can confirm assistance only after the responder marks the mission completed.",
        );

        return;
      }

      if (
        !selectedOutcome
      ) {
        setReviewError(
          "Choose Fully Helped, Partially Helped, or Not Helped.",
        );

        return;
      }

      if (
        !assignment.volunteerId
      ) {
        setReviewError(
          "This response assignment is missing its volunteer ID.",
        );

        return;
      }

      if (
        !assignment.contributionType ||
        !assignment.contributionSummary
      ) {
        setReviewError(
          "The responder's completion record is incomplete.",
        );

        return;
      }

      const cleanNote =
        residentNote
          .trim();

      if (
        selectedOutcome ===
          "not_helped" &&
        cleanNote.length <
          10
      ) {
        setReviewError(
          "Please briefly explain what happened so Admin can review the response.",
        );

        return;
      }

      setBusyAssignmentId(
        assignment.id,
      );

      setReviewError(
        "",
      );

      setError(
        "",
      );

      try {
        const batch =
          writeBatch(
            db,
          );

        const confirmationRef =
          doc(
            db,
            "assistanceConfirmations",
            assignment.id,
          );

        const assignmentRef =
          doc(
            db,
            "responseAssignments",
            assignment.id,
          );

        const isDisputed =
          selectedOutcome ===
          "not_helped";

        batch.set(
          confirmationRef,

          {
            assignmentId:
              assignment.id,

            caseId:
              incident.id,

            residentId:
              user.uid,

            volunteerId:
              assignment.volunteerId,

            outcome:
              selectedOutcome,

            reviewState:
              isDisputed
                ? "disputed"
                : "resident_confirmed",

            residentNote:
              cleanNote,

            creditStatus:
              isDisputed
                ? "disputed"
                : "credited",

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
        );

        if (
          isDisputed
        ) {
          const disputeRef =
            doc(
              db,
              "responseDisputes",
              assignment.id,
            );

          batch.set(
            disputeRef,

            {
              assignmentId:
                assignment.id,

              caseId:
                incident.id,

              volunteerId:
                assignment.volunteerId,

              residentId:
                user.uid,

              residentNote:
                cleanNote,

              contributionType:
                assignment.contributionType,

              contributionSummary:
                assignment.contributionSummary,

              status:
                "open",

              createdAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            },
          );

          batch.update(
            assignmentRef,

            {
              residentConfirmationStatus:
                "disputed",

              residentConfirmationOutcome:
                "not_helped",

              residentConfirmedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            },
          );
        } else {
          const contributionRef =
            doc(
              db,
              "verifiedContributions",
              assignment.id,
            );

          batch.set(
            contributionRef,

            {
              assignmentId:
                assignment.id,

              caseId:
                incident.id,

              volunteerId:
                assignment.volunteerId,

              volunteerName:
                assignment.volunteerName ||
                "",

              residentId:
                user.uid,

              outcome:
                selectedOutcome,

              contributionType:
                assignment.contributionType,

              contributionSummary:
                assignment.contributionSummary,

              peopleHelped:
                Number.isInteger(
                  assignment.peopleHelped,
                )
                  ? assignment.peopleHelped
                  : 0,

              completionNotes:
                assignment.completionNotes ||
                "",

              responseStartedAt:
                assignment.responseStartedAt,

              arrivedAt:
                assignment.arrivedAt,

              completedAt:
                assignment.completedAt,

              residentConfirmedAt:
                serverTimestamp(),

              verificationSource:
                "resident_confirmation",

              status:
                "verified",

              createdAt:
                serverTimestamp(),

              verifiedAt:
                serverTimestamp(),
            },
          );

          batch.update(
            assignmentRef,

            {
              residentConfirmationStatus:
                "resident_confirmed",

              residentConfirmationOutcome:
                selectedOutcome,

              verifiedContributionId:
                assignment.id,

              residentConfirmedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            },
          );
        }

        await batch.commit();

        resetReview();
      } catch (
        problem: any
      ) {
        console.error(
          "Spark assistance confirmation failed",
          problem,
        );

        const code =
          String(
            problem?.code ||
              "",
          );

        if (
          code.includes(
            "permission",
          )
        ) {
          setReviewError(
            "Confirmation was blocked by Firestore rules. Deploy the Spark/free rules before testing.",
          );
        } else if (
          code.includes(
            "already",
          )
        ) {
          setReviewError(
            "This response has already been confirmed.",
          );
        } else {
          setReviewError(
            "Could not save your confirmation. Please try again.",
          );
        }
      } finally {
        setBusyAssignmentId(
          "",
        );
      }
    };

  if (
    loading ||
    casesLoading
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
          Loading your emergency reports…
        </Text>
      </View>
    );
  }

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
          Approved resident account required
        </Text>

        <Text
          style={
            styles.centerText
          }
        >
          Sign in with an approved VolunServe
          account to view your reports.
        </Text>
      </View>
    );
  }

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
            RESIDENT CASE TRACKING
          </Text>

          <Text
            style={
              styles.title
            }
          >
            My Emergency Reports
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Check each report's progress, follow responder updates,
            and confirm the assistance you actually received.
          </Text>
        </View>
      </View>

      <View style={styles.reportToolbar}>
        <View style={styles.reportToolbarHeading}>
          <Text style={styles.reportToolbarTitle}>Your reports</Text>
          <Text style={styles.reportToolbarCount}>
            {cases.length} total · {openCaseCount} open · {cases.length - openCaseCount} closed
          </Text>
        </View>
        <View style={styles.reportControls}>
          <View style={styles.reportFilters}>
            {([
              ["all", "All reports"], ["open", "Open"], ["closed", "Closed"],
            ] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: reportFilter === value }}
                onPress={() => setReportFilter(value)}
                style={[styles.reportFilterChip, reportFilter === value && styles.reportFilterChipActive]}
              >
                <Text style={[styles.reportFilterText, reportFilter === value && styles.reportFilterTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Search my reports"
            placeholder="Search report or location"
            placeholderTextColor="#82949C"
            value={reportSearch}
            onChangeText={setReportSearch}
            style={styles.reportSearchInput}
          />
        </View>
        <Text style={styles.reportShowingCount}>
          Showing {visibleCases.length} of {cases.length} reports
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

      {cases.length ===
      0 ? (
        <View
          style={
            styles.emptyCard
          }
        >
          <Text
            style={
              styles.emptyTitle
            }
          >
            No emergency reports yet
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            Requests submitted through Emergency
            Assistance will appear here.
          </Text>
        </View>
      ) : visibleCases.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching reports</Text>
          <Text style={styles.emptyText}>Try another search or select All reports.</Text>
        </View>
      ) : (
        visibleCases.map(
          (
            incident,
          ) => {
            const assignments =
              assignmentsByCase[
                incident.id
              ] || [];
            const reportPhotos = getReportPhotoAttachments(incident.attachments);
            const primaryReportPhoto = reportPhotos[0]?.url;
            const detailsExpanded = expandedCaseIds.includes(incident.id);
            const evidenceRequested = incident.verificationStatus === "needs_more_evidence" &&
              incident.evidenceReviewStatus !== "resubmitted";
            const confirmationRequired = assignments.some(
              (assignment) => assignment.status === "completed" && !confirmations[assignment.id],
            );
            const actionRequired = evidenceRequested || confirmationRequired;
            const closed = closedStatuses.includes(String(incident.status || ""));
            const responseStarted = assignments.some((assignment) =>
              ["accepted", "responding", "on_site"].includes(String(assignment.status || "")),
            );
            const nextUpdate = evidenceRequested
              ? "Additional evidence is needed. Open this report to upload the requested photo."
              : confirmationRequired
                ? "A responder has completed their mission. Open this report to confirm the assistance you received."
                : incident.verificationStatus === "needs_more_evidence"
                  ? "Your additional evidence was sent and is waiting for Admin review."
                  : closed
                    ? "This case is closed. Open it to review the details and response history."
                    : responseStarted
                      ? "A responder accepted this task. Open the report to see their latest updates."
                      : incident.status === "assigned"
                        ? "Volunteer invitations have been sent. Waiting for someone to accept."
                        : incident.status === "validated"
                          ? "Your report is verified. Responder activity will appear when available."
                          : incident.status === "in_progress"
                            ? "This report is in progress. Open details to check responder information."
                            : "Your report has been submitted. Verification updates will appear here.";


            return (
              <View
                key={
                  incident.id
                }
                style={
                  styles.caseCard
                }
              >
                <View
                  style={
                    styles.caseTopRow
                  }
                >
                  <ReportPhoto
                    url={primaryReportPhoto}
                    category={incident.category}
                  />
                  <View
                    style={
                      styles.caseTitleBlock
                    }
                  >
                    <Text
                      style={
                        styles.caseTitle
                      }
                    >
                      {incident.title ||
                        "Emergency assistance request"}
                    </Text>

                    <Text
                      style={
                        styles.reference
                      }
                    >
                      Report #{incident.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      closed && styles.statusBadgeClosed,
                      actionRequired && styles.statusBadgeAttention,
                      incident.status === "in_progress" && styles.statusBadgeActive,
                    ]}
                  >
                    <Text
                      style={
                        styles.statusBadgeText
                      }
                    >
                      {caseStatusLabel(
                        incident.status,
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.metaGrid
                  }
                >
                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      REPORT TYPE
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {incident.category ||
                        "—"}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      PRIORITY
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {humanize(
                        incident.severity,
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      VERIFICATION
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {humanize(
                        incident.verificationStatus,
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.metaItem
                    }
                  >
                    <Text
                      style={
                        styles.metaLabel
                      }
                    >
                      SUBMITTED
                    </Text>

                    <Text
                      style={
                        styles.metaValue
                      }
                    >
                      {formatDate(
                        incident.createdAt,
                      )}
                    </Text>
                  </View>
                </View>

                <View style={[styles.nextUpdateBox, actionRequired && styles.nextUpdateAttention]}>
                  <Text style={[styles.nextUpdateLabel, actionRequired && styles.nextUpdateLabelAttention]}>
                    {actionRequired ? "ACTION NEEDED" : "CURRENT UPDATE"}
                  </Text>
                  <Text style={styles.nextUpdateText}>{nextUpdate}</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsExpanded }}
                  onPress={() => setExpandedCaseIds((previous) =>
                    previous.includes(incident.id)
                      ? previous.filter((id) => id !== incident.id)
                      : [...previous, incident.id]
                  )}
                  style={[styles.detailsToggle, actionRequired && styles.detailsToggleAttention]}
                >
                  <Text style={styles.detailsToggleText}>
                    {detailsExpanded ? "Hide report details"
                      : actionRequired ? "Open report · Action required"
                      : "View report details and responder updates"}
                  </Text>
                  <Text style={styles.detailsToggleSymbol}>{detailsExpanded ? "−" : "+"}</Text>
                </TouchableOpacity>
                {detailsExpanded && (
                  <View style={styles.detailsBody}>
                    <Text style={styles.fullReference}>Report reference: {incident.id}</Text>
                    <View style={styles.detailsSectionHeading}>
                      <MaterialCommunityIcons name="file-document-outline" size={20} color="#176B52" />
                      <Text style={styles.detailsSectionTitle}>Incident information</Text>
                    </View>
                    <View style={styles.reportDetailsGrid}>
                    {reportPhotos.length > 0 && (
                      <View style={styles.reportDetailsMediaColumn}>
                        <View style={styles.reportEvidenceSection}>
                        <Text style={styles.infoLabel}>
                          Uploaded report photos ({reportPhotos.length})
                        </Text>
                        <Text style={styles.reportEvidenceDescription}>
                          Photos provided for this emergency report.
                        </Text>
                        <View style={styles.reportEvidenceGrid}>
                          {reportPhotos.map((photo, index) => (
                            <View
                              key={photo.publicId || photo.path || `${incident.id}-photo-${index}`}
                              style={styles.reportEvidenceTile}
                            >
                              <ReportPhoto
                                url={photo.url}
                                category={incident.category}
                                expanded
                              />
                              <Text style={styles.reportEvidenceCaption}>
                                Photo {index + 1}
                              </Text>
                            </View>
                          ))}
                        </View>
                        </View>
                      </View>
                    )}
                    <View style={styles.reportDetailsInformationColumn}>
                <View
                  style={
                    styles.infoBlock
                  }
                >
                  <Text
                    style={
                      styles.infoLabel
                    }
                  >
                    Response location
                  </Text>

                  <Text
                    style={
                      styles.infoText
                    }
                  >
                    {incident.location ||
                      "No address provided"}
                  </Text>
                </View>

                {!!incident.details && (
                  <View
                    style={
                      styles.infoBlock
                    }
                  >
                    <Text
                      style={
                        styles.infoLabel
                      }
                    >
                      Situation reported
                    </Text>

                    <Text
                      style={
                        styles.infoText
                      }
                    >
                      {
                        incident.details
                      }
                    </Text>
                  </View>
                )}

                {!!incident.needs && (
                  <View
                    style={
                      styles.needsBox
                    }
                  >
                    <Text
                      style={
                        styles.infoLabel
                      }
                    >
                      Assistance requested
                    </Text>

                    <Text
                      style={
                        styles.needsText
                      }
                    >
                      {incident.needs.replace(/\s*\|\s*/g, "\n")}
                    </Text>
                  </View>
                )}


                    </View>
                    </View>

                    <View style={styles.peopleSection}>
                      <View style={styles.detailsSectionHeading}>
                        <MaterialCommunityIcons name="account-group-outline" size={20} color="#176B52" />
                        <Text style={styles.detailsSectionTitle}>People involved</Text>
                      </View>
                      <View style={styles.reporterProfileCard}>
                        <PersonProfileAvatar
                          name={String(profile?.fullName || incident.reporterName || "Resident")}
                          imageUrl={String(profile?.profilePictureUrl || incident.reporterProfilePictureUrl || "")}
                        />
                        <View style={styles.personProfileText}>
                          <Text style={styles.personProfileEyebrow}>REPORT SUBMITTED BY</Text>
                          <Text style={styles.personProfileName}>
                            {profile?.fullName || incident.reporterName || "Resident"}
                          </Text>
                          <Text style={styles.personProfileSubtitle}>Resident · Report owner</Text>
                        </View>
                        <View style={styles.personRolePill}>
                          <Text style={styles.personRolePillText}>Resident</Text>
                        </View>
                      </View>
                    </View>
                {incident.verificationStatus ===
                  "needs_more_evidence" && (
                  <View
                    style={
                      incident.evidenceReviewStatus ===
                      "resubmitted"
                        ? styles.evidenceWaitingCard
                        : styles.evidenceRequestCard
                    }
                  >
                    <View style={styles.evidenceRequestHeader}>
                      <View style={styles.evidenceRequestCopy}>
                        <Text style={styles.evidenceRequestEyebrow}>
                          {incident.evidenceReviewStatus ===
                          "resubmitted"
                            ? "EVIDENCE RESUBMITTED"
                            : "ACTION REQUIRED"}
                        </Text>

                        <Text style={styles.evidenceRequestTitle}>
                          {incident.evidenceReviewStatus ===
                          "resubmitted"
                            ? "Additional evidence sent for LGU review"
                            : "Additional evidence required"}
                        </Text>

                        <Text style={styles.evidenceRequestText}>
                          {incident.evidenceReviewStatus ===
                          "resubmitted"
                            ? "Your new evidence was added to this same emergency case. Wait for the LGU to review it before sending anything else."
                            : "The LGU needs clearer or additional proof before normal dispatch can continue. Add at least one new photo to this existing case; do not create another emergency report."}
                        </Text>
                      </View>
                    </View>

                    {!!incident.evidenceRequestReason && (
                      <View style={styles.evidenceReasonBox}>
                        <Text style={styles.evidenceReasonLabel}>
                          LGU REQUEST
                        </Text>
                        <Text style={styles.evidenceReasonText}>
                          {incident.evidenceRequestReason}
                        </Text>
                      </View>
                    )}

                    {incident.evidenceReviewStatus !==
                      "resubmitted" && (() => {
                      const draft = draftForCase(incident.id);
                      const evidenceError =
                        evidenceErrorByCase[incident.id] || "";
                      const evidenceProgress =
                        evidenceProgressByCase[incident.id] || "";
                      const evidenceBusy =
                        evidenceBusyCaseId === incident.id;

                      return (
                        <View style={styles.evidenceForm}>
                          <View style={styles.evidenceFieldHeader}>
                            <View>
                              <Text style={styles.evidenceFieldTitle}>
                                New photo evidence
                              </Text>
                              <Text style={styles.evidenceFieldHelper}>
                                Required · at least 1 new clear photo · under 10 MB each
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.evidenceAddButton}
                              disabled={evidenceBusy}
                              onPress={() =>
                                chooseAdditionalPhoto(incident)
                              }
                            >
                              <Text style={styles.evidenceAddButtonText}>
                                + Add photo
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {draft.photos.length > 0 ? (
                            <View style={styles.evidencePreviewGrid}>
                              {draft.photos.map((photo, index) => (
                                <View
                                  key={`${photo.uri}-${index}`}
                                  style={styles.evidencePreviewCard}
                                >
                                  <Image
                                    source={{ uri: photo.uri }}
                                    style={styles.evidencePreviewImage}
                                  />

                                  <View style={styles.evidencePreviewFooter}>
                                    <Text
                                      style={styles.evidencePreviewName}
                                      numberOfLines={1}
                                    >
                                      {photo.fileName ||
                                        `Photo ${index + 1}`}
                                    </Text>

                                    <TouchableOpacity
                                      disabled={evidenceBusy}
                                      onPress={() =>
                                        removeAdditionalPhoto(
                                          incident.id,
                                          index,
                                        )
                                      }
                                    >
                                      <Text style={styles.evidenceRemoveText}>
                                        Remove
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <View style={styles.evidenceEmptyBox}>
                              <Text style={styles.evidenceEmptyText}>
                                No new photo selected yet.
                              </Text>
                            </View>
                          )}

                          <View style={styles.evidenceVideoRow}>
                            <View style={styles.evidenceVideoCopy}>
                              <Text style={styles.evidenceFieldTitle}>
                                Additional video
                              </Text>
                              <Text style={styles.evidenceFieldHelper}>
                                Optional · under 50 MB
                              </Text>
                              {!!draft.video && (
                                <Text
                                  style={styles.evidenceSelectedVideo}
                                  numberOfLines={1}
                                >
                                  {draft.video.fileName ||
                                    "Video selected"}
                                </Text>
                              )}
                            </View>

                            <View style={styles.evidenceVideoActions}>
                              <TouchableOpacity
                                style={styles.evidenceSecondaryButton}
                                disabled={evidenceBusy}
                                onPress={() =>
                                  chooseAdditionalVideo(incident)
                                }
                              >
                                <Text style={styles.evidenceSecondaryButtonText}>
                                  {draft.video
                                    ? "Replace video"
                                    : "Add video"}
                                </Text>
                              </TouchableOpacity>

                              {!!draft.video && (
                                <TouchableOpacity
                                  style={styles.evidenceTextButton}
                                  disabled={evidenceBusy}
                                  onPress={() =>
                                    clearAdditionalVideo(incident.id)
                                  }
                                >
                                  <Text style={styles.evidenceRemoveText}>
                                    Remove
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>

                          {!!evidenceError && (
                            <Text style={styles.evidenceErrorText}>
                              {evidenceError}
                            </Text>
                          )}

                          {!!evidenceProgress && (
                            <Text style={styles.evidenceProgressText}>
                              {evidenceProgress}
                            </Text>
                          )}

                          <View style={styles.evidenceSubmitRow}>
                            <Text style={styles.evidencePrivacyText}>
                              Evidence remains attached to this case and is limited to authorized LGU/Admin and assigned response personnel.
                            </Text>

                            <TouchableOpacity
                              style={[
                                styles.evidenceSubmitButton,
                                (evidenceBusy ||
                                  draft.photos.length < 1) &&
                                  styles.evidenceSubmitButtonDisabled,
                              ]}
                              disabled={
                                evidenceBusy ||
                                draft.photos.length < 1
                              }
                              onPress={() =>
                                submitAdditionalEvidence(incident)
                              }
                            >
                              {evidenceBusy ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#FFFFFF"
                                />
                              ) : (
                                <Text style={styles.evidenceSubmitButtonText}>
                                  Submit additional evidence
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}

                <View
                  style={
                    styles.responderSection
                  }
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Volunteer responders
                  </Text>
                  <Text style={styles.responderSectionHelp}>
                    Responders invited or assigned to this emergency will appear below.
                  </Text>

                  {assignments.length ===
                  0 ? (
                    <View
                      style={
                        styles.waitingBox
                      }
                    >
                      <Text
                        style={
                          styles.waitingTitle
                        }
                      >
                        No volunteer responder listed yet
                      </Text>

                      <Text
                        style={
                          styles.waitingText
                        }
                      >
                        This section will update when an assignment is recorded for your report.
                      </Text>
                    </View>
                  ) : (
                    assignments.map(
                      (
                        assignment,
                      ) => {
                        const confirmation =
                          confirmations[
                            assignment.id
                          ];

                        const isReviewing =
                          reviewingAssignmentId ===
                          assignment.id;

                        const canOpenMap =
                          [
                            ...activeAssignmentStates,
                            "completed",
                          ].includes(
                            String(
                              assignment.status,
                            ),
                          );

                        return (
                          <View
                            key={
                              assignment.id
                            }
                            style={
                              styles.assignmentCard
                            }
                          >
                            <View
                              style={
                                styles.assignmentHeader
                              }
                            >
                              <View style={styles.assignmentIdentityRow}>
                                <PersonProfileAvatar
                                  name={assignment.volunteerName || "Volunteer"}
                                  imageUrl={assignment.volunteerProfilePictureUrl}
                                />
                                <View style={styles.assignmentIdentity}>
                                  <Text style={styles.personProfileEyebrow}>VOLUNTEER RESPONDER</Text>
                                  <Text style={styles.volunteerName}>
                                    {assignment.volunteerName || "Assigned responder"}
                                  </Text>
                                  <Text style={styles.assignmentReference}>
                                    Response ID: {assignment.id.slice(0, 12)}
                                  </Text>
                                </View>
                              </View>

                              <View
                                style={
                                  styles.assignmentStatusBadge
                                }
                              >
                                <Text
                                  style={
                                    styles.assignmentStatusText
                                  }
                                >
                                  {assignmentStatusLabel(
                                    assignment.status,
                                  )}
                                </Text>
                              </View>
                            </View>

                            {!!assignment.contributionSummary && (
                              <View
                                style={
                                  styles.contributionBox
                                }
                              >
                                <Text
                                  style={
                                    styles.infoLabel
                                  }
                                >
                                  Responder contribution
                                </Text>

                                {!!assignment.contributionType && (
                                  <Text
                                    style={
                                      styles.contributionType
                                    }
                                  >
                                    {
                                      assignment.contributionType
                                    }
                                  </Text>
                                )}

                                <Text
                                  style={
                                    styles.infoText
                                  }
                                >
                                  {
                                    assignment.contributionSummary
                                  }
                                </Text>

                                {typeof assignment.peopleHelped ===
                                  "number" && (
                                  <Text
                                    style={
                                      styles.contributionMeta
                                    }
                                  >
                                    People assisted:{" "}
                                    {
                                      assignment.peopleHelped
                                    }
                                  </Text>
                                )}

                                {!!assignment.completionNotes && (
                                  <Text
                                    style={
                                      styles.contributionMeta
                                    }
                                  >
                                    Completion note:{" "}
                                    {
                                      assignment.completionNotes
                                    }
                                  </Text>
                                )}
                              </View>
                            )}

                            {canOpenMap && (
                              <TouchableOpacity
                                style={
                                  styles.secondaryButton
                                }
                                onPress={() =>
                                  openCaseMap(
                                    incident.id,
                                  )
                                }
                              >
                                <Text
                                  style={
                                    styles.secondaryButtonText
                                  }
                                >
                                  {activeAssignmentStates.includes(
                                    String(
                                      assignment.status,
                                    ),
                                  )
                                    ? "Open live map / case chat"
                                    : "Open case map / chat"}
                                </Text>
                              </TouchableOpacity>
                            )}

                            {confirmation ? (
                              <View
                                style={[
                                  styles.confirmedBox,

                                  confirmation.outcome ===
                                    "not_helped" &&
                                    styles.disputedBox,
                                ]}
                              >
                                <Text
                                  style={
                                    styles.confirmedTitle
                                  }
                                >
                                  {outcomeLabel(
                                    confirmation.outcome,
                                  )}
                                </Text>

                                <Text
                                  style={
                                    styles.confirmedText
                                  }
                                >
                                  {confirmation.creditStatus ===
                                  "credited"
                                    ? "Verified Contribution recorded. This assistance is now part of the responder's verified volunteer record."
                                    : confirmation.creditStatus ===
                                        "disputed"
                                      ? "This response was sent to Admin for review. No verified volunteer credit was automatically issued."
                                      : "Your confirmation has been recorded."}
                                </Text>

                                {!!confirmation.residentNote && (
                                  <Text
                                    style={
                                      styles.confirmedNote
                                    }
                                  >
                                    “
                                    {
                                      confirmation.residentNote
                                    }
                                    ”
                                  </Text>
                                )}
                              </View>
                            ) : assignment.status ===
                              "completed" ? (
                              isReviewing ? (
                                <View
                                  style={
                                    styles.reviewPanel
                                  }
                                >
                                  <Text
                                    style={
                                      styles.reviewTitle
                                    }
                                  >
                                    Confirm assistance received
                                  </Text>

                                  <Text
                                    style={
                                      styles.reviewCopy
                                    }
                                  >
                                    Confirm what actually happened.
                                    Full or Partial assistance
                                    creates a verified contribution.
                                    Not Helped is sent to Admin
                                    review.
                                  </Text>

                                  <View
                                    style={
                                      styles.outcomeRow
                                    }
                                  >
                                    {(
                                      [
                                        [
                                          "fully_helped",
                                          "Fully Helped",
                                        ],

                                        [
                                          "partially_helped",
                                          "Partially Helped",
                                        ],

                                        [
                                          "not_helped",
                                          "Not Helped",
                                        ],
                                      ] as const
                                    ).map(
                                      ([
                                        value,
                                        label,
                                      ]) => (
                                        <TouchableOpacity
                                          key={
                                            value
                                          }
                                          style={[
                                            styles.outcomeButton,

                                            selectedOutcome ===
                                              value &&
                                              styles.outcomeButtonActive,

                                            value ===
                                              "not_helped" &&
                                              selectedOutcome ===
                                                value &&
                                              styles.outcomeButtonDanger,
                                          ]}
                                          onPress={() => {
                                            setSelectedOutcome(
                                              value,
                                            );

                                            setReviewError(
                                              "",
                                            );
                                          }}
                                        >
                                          <Text
                                            style={[
                                              styles.outcomeButtonText,

                                              selectedOutcome ===
                                                value &&
                                                styles.outcomeButtonTextActive,
                                            ]}
                                          >
                                            {
                                              label
                                            }
                                          </Text>
                                        </TouchableOpacity>
                                      ),
                                    )}
                                  </View>

                                  <Text
                                    style={
                                      styles.noteLabel
                                    }
                                  >
                                    {selectedOutcome ===
                                    "not_helped"
                                      ? "What happened? (required)"
                                      : "Additional note (optional)"}
                                  </Text>

                                  <TextInput
                                    value={
                                      residentNote
                                    }
                                    onChangeText={
                                      setResidentNote
                                    }
                                    multiline
                                    maxLength={
                                      1000
                                    }
                                    placeholder={
                                      selectedOutcome ===
                                      "not_helped"
                                        ? "Example: The responder marked the mission completed, but no assistance was actually provided."
                                        : "Add context about the assistance received if needed."
                                    }
                                    style={
                                      styles.noteInput
                                    }
                                    textAlignVertical="top"
                                  />

                                  {!!reviewError && (
                                    <Text
                                      style={
                                        styles.reviewError
                                      }
                                    >
                                      {
                                        reviewError
                                      }
                                    </Text>
                                  )}

                                  <View
                                    style={
                                      styles.reviewActions
                                    }
                                  >
                                    <TouchableOpacity
                                      style={
                                        styles.cancelButton
                                      }
                                      disabled={
                                        busyAssignmentId ===
                                        assignment.id
                                      }
                                      onPress={
                                        resetReview
                                      }
                                    >
                                      <Text
                                        style={
                                          styles.cancelButtonText
                                        }
                                      >
                                        Cancel
                                      </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      style={
                                        styles.primaryButton
                                      }
                                      disabled={
                                        busyAssignmentId ===
                                        assignment.id
                                      }
                                      onPress={() =>
                                        submitConfirmation(
                                          incident,
                                          assignment,
                                        )
                                      }
                                    >
                                      {busyAssignmentId ===
                                      assignment.id ? (
                                        <ActivityIndicator
                                          size="small"
                                          color="#FFFFFF"
                                        />
                                      ) : (
                                        <Text
                                          style={
                                            styles.primaryButtonText
                                          }
                                        >
                                          Submit confirmation
                                        </Text>
                                      )}
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : (
                                <View
                                  style={
                                    styles.pendingConfirmationBox
                                  }
                                >
                                  <View
                                    style={
                                      styles.pendingConfirmationCopy
                                    }
                                  >
                                    <Text
                                      style={
                                        styles.pendingConfirmationTitle
                                      }
                                    >
                                      Your confirmation is needed
                                    </Text>

                                    <Text
                                      style={
                                        styles.pendingConfirmationText
                                      }
                                    >
                                      The responder marked this
                                      mission completed. Confirm
                                      whether you were fully helped,
                                      partially helped, or not
                                      helped.
                                    </Text>
                                  </View>

                                  <TouchableOpacity
                                    style={
                                      styles.primaryButton
                                    }
                                    onPress={() =>
                                      startReview(
                                        assignment.id,
                                      )
                                    }
                                  >
                                    <Text
                                      style={
                                        styles.primaryButtonText
                                      }
                                    >
                                      Confirm assistance
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              )
                            ) : null}
                          </View>
                        );
                      },
                    )
                  )}
                </View>
                  </View>
                )}
              </View>
            );
          },
        )
      )}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "#F6F8F7",
    },

    container: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 60,
    },

    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor: "#F6F8F7",
      gap: 10,
    },

    loadingText: {
      color: "#64748B",
      fontSize: 13,
    },

    centerCard: {
      margin: 24,
      padding: 24,
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
    },

    centerTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: "#102A3A",
    },

    centerText: {
      marginTop: 8,
      color: "#64748B",
      lineHeight: 20,
    },

    header: {
      marginBottom: 18,
    },

    headerCopy: {
      maxWidth: 760,
    },

    eyebrow: {
      color: "#07857C",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.4,
    },

    title: {
      marginTop: 6,
      color: "#173D32",
      fontSize: 28,
      lineHeight: 36,
      fontWeight: "700",
    },

    subtitle: {
      marginTop: 6,
      color: "#627785",
      fontSize: 14,
      lineHeight: 21,
    },

    errorBox: {
      marginBottom: 14,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#F1B7B7",
      backgroundColor:
        "#FFF3F3",
    },

    errorText: {
      color: "#A83232",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },

    emptyCard: {
      padding: 28,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
      alignItems: "center",
    },

    emptyTitle: {
      color: "#173748",
      fontSize: 17,
      fontWeight: "800",
    },

    emptyText: {
      marginTop: 6,
      color: "#64748B",
      textAlign: "center",
      lineHeight: 20,
    },

    caseCard: {
      marginBottom: 14,
      padding: 21,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    caseTopRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 13,
    },

    caseTitleBlock: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 180,
      minWidth: 155,
    },

    caseTitle: {
      color: "#102A3A",
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "900",
    },

    reference: {
      marginTop: 4,
      color: "#8A9AA5",
      fontSize: 10,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#EAF8F5",
      borderWidth: 1,
      borderColor:
        "#C8E7E1",
    },

    statusBadgeText: {
      color: "#08786F",
      fontSize: 12,
      fontWeight: "800",
    },

    metaGrid: {
      marginTop: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    metaItem: {
      minWidth: 145,
      flexGrow: 1,
      flexBasis: 145,
      padding: 11,
      borderRadius: 10,
      backgroundColor:
        "#F8FAFB",
      borderWidth: 1,
      borderColor:
        "#E7EDF1",
    },

    metaLabel: {
      color: "#91A1AD",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    metaValue: {
      marginTop: 4,
      color: "#183D35",
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "700",
    },

    infoBlock: {
      marginTop: 14,
    },

    infoLabel: {
      color: "#506C65", fontSize: 12, lineHeight: 18, fontWeight: "700",
      textTransform: "uppercase", letterSpacing: 0.35,
    },

    infoText: {
      marginTop: 6, color: "#28453D", fontSize: 14,
      lineHeight: 23,
    },

    needsBox: {
      marginTop: 14, padding: 15, borderRadius: 11,
      backgroundColor: "#F6F9F7", borderWidth: 1, borderColor: "#E0E9E4",
    },

    needsText: {
      marginTop: 7, color: "#28453D", fontSize: 14,
      lineHeight: 23,
    },

    evidenceRequestCard: {
      marginTop: 16,
      padding: 16,
      borderRadius: 14,
      backgroundColor: "#FFF9ED",
      borderWidth: 1,
      borderColor: "#E8C875",
    },

    evidenceWaitingCard: {
      marginTop: 16,
      padding: 16,
      borderRadius: 14,
      backgroundColor: "#EEF8F6",
      borderWidth: 1,
      borderColor: "#BFDCD6",
    },

    evidenceRequestHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },

    evidenceRequestCopy: {
      flex: 1,
    },

    evidenceRequestEyebrow: {
      color: "#9A6700",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },

    evidenceRequestTitle: {
      marginTop: 4,
      color: "#3F3314",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "900",
    },

    evidenceRequestText: {
      marginTop: 5,
      color: "#6F6033",
      fontSize: 11.5,
      lineHeight: 18,
    },

    evidenceReasonBox: {
      marginTop: 12,
      padding: 12,
      borderRadius: 10,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E9D89F",
    },

    evidenceReasonLabel: {
      color: "#9A6700",
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    evidenceReasonText: {
      marginTop: 4,
      color: "#4F4529",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },

    evidenceForm: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: "#E9DDAE",
    },

    evidenceFieldHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },

    evidenceFieldTitle: {
      color: "#263E4B",
      fontSize: 12,
      fontWeight: "900",
    },

    evidenceFieldHelper: {
      marginTop: 3,
      color: "#778A95",
      fontSize: 10,
      lineHeight: 15,
    },

    evidenceAddButton: {
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 9,
      backgroundColor: "#0B8178",
    },

    evidenceAddButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    evidencePreviewGrid: {
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    evidencePreviewCard: {
      width: 180,
      maxWidth: "100%",
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DCE5EA",
    },

    evidencePreviewImage: {
      width: "100%",
      height: 108,
      backgroundColor: "#E8EEF1",
    },

    evidencePreviewFooter: {
      paddingHorizontal: 9,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },

    evidencePreviewName: {
      flex: 1,
      color: "#4D6370",
      fontSize: 9.5,
      fontWeight: "700",
    },

    evidenceRemoveText: {
      color: "#B42318",
      fontSize: 9.5,
      fontWeight: "900",
    },

    evidenceEmptyBox: {
      marginTop: 10,
      padding: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: "#D1DDE2",
      backgroundColor: "#FFFFFF",
    },

    evidenceEmptyText: {
      color: "#83939D",
      fontSize: 10.5,
    },

    evidenceVideoRow: {
      marginTop: 14,
      paddingTop: 13,
      borderTopWidth: 1,
      borderTopColor: "#EFE5BF",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },

    evidenceVideoCopy: {
      flex: 1,
      minWidth: 220,
    },

    evidenceSelectedVideo: {
      marginTop: 5,
      color: "#0B756E",
      fontSize: 10,
      fontWeight: "800",
    },

    evidenceVideoActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    evidenceSecondaryButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: "#BFD9D5",
      backgroundColor: "#FFFFFF",
    },

    evidenceSecondaryButtonText: {
      color: "#0A726B",
      fontSize: 10,
      fontWeight: "900",
    },

    evidenceTextButton: {
      paddingHorizontal: 5,
      paddingVertical: 8,
    },

    evidenceErrorText: {
      marginTop: 11,
      color: "#B42318",
      fontSize: 10.5,
      lineHeight: 16,
      fontWeight: "700",
    },

    evidenceProgressText: {
      marginTop: 11,
      color: "#0B756E",
      fontSize: 10.5,
      lineHeight: 16,
      fontWeight: "800",
    },

    evidenceSubmitRow: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      flexWrap: "wrap",
    },

    evidencePrivacyText: {
      flex: 1,
      minWidth: 240,
      color: "#71838E",
      fontSize: 9.5,
      lineHeight: 15,
    },

    evidenceSubmitButton: {
      minHeight: 40,
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 9,
      backgroundColor: "#0A7D75",
      alignItems: "center",
      justifyContent: "center",
    },

    evidenceSubmitButtonDisabled: {
      opacity: 0.45,
    },

    evidenceSubmitButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    responderSection: {
      marginTop: 22, paddingTop: 20, borderTopWidth: 1,
      borderTopColor: "#E6EEEA",
    },

    sectionTitle: {
      marginBottom: 4, color: "#153F32", fontSize: 17,
      lineHeight: 24, fontWeight: "700",
    },

    waitingBox: {
      marginTop: 12, padding: 17, borderRadius: 11,
      backgroundColor: "#F8FAF9", borderWidth: 1, borderColor: "#E2EAE5",
    },

    waitingTitle: {
      color: "#315A4F", fontSize: 14, lineHeight: 20, fontWeight: "700",
    },

    waitingText: {
      marginTop: 6, color: "#607870", fontSize: 13, lineHeight: 20,
    },

    assignmentCard: {
      marginTop: 12, padding: 18, borderRadius: 12, borderWidth: 1,
      borderColor: "#E0E9E4", backgroundColor: "#FFFFFF",
    },

    assignmentHeader: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", flexWrap: "wrap", gap: 14,
    },

    assignmentIdentity: {
      flexGrow: 1, flexShrink: 1, minWidth: 125,
    },

    volunteerName: {
      color: "#153E34", fontSize: 15, lineHeight: 23, fontWeight: "700",
    },

    assignmentReference: {
      marginTop: 4, color: "#657E75", fontSize: 12, lineHeight: 18,
    },

    assignmentStatusBadge: {
      paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999,
      borderWidth: 1, borderColor: "#D9E5DE", backgroundColor: "#EEF5F1",
    },

    assignmentStatusText: {
      color: "#2F6353", fontSize: 12, lineHeight: 17, fontWeight: "700",
    },

    contributionBox: {
      marginTop: 12,
      padding: 11,
      borderRadius: 9,
      backgroundColor:
        "#F4F9F8",
      borderWidth: 1,
      borderColor:
        "#D8EAE6",
    },

    contributionType: {
      marginTop: 5, color: "#176B52", fontSize: 14, lineHeight: 21, fontWeight: "700",
    },

    contributionMeta: {
      marginTop: 5, color: "#5B756B", fontSize: 12, lineHeight: 19,
    },

    secondaryButton: {
      marginTop: 12,
      alignSelf:
        "flex-start",
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 9,
      backgroundColor:
        "#EEF8F6",
      borderWidth: 1,
      borderColor:
        "#C8E4DF",
    },

    secondaryButtonText: {
      color: "#096C66",
      fontSize: 11,
      fontWeight: "800",
    },

    pendingConfirmationBox: {
      marginTop: 13,
      padding: 13,
      borderRadius: 11,
      backgroundColor:
        "#FFF9E9",
      borderWidth: 1,
      borderColor:
        "#F2D98E",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 12,
      flexWrap: "wrap",
    },

    pendingConfirmationCopy: {
      flex: 1,
      minWidth: 220,
    },

    pendingConfirmationTitle: {
      color: "#765B0A",
      fontSize: 12,
      fontWeight: "900",
    },

    pendingConfirmationText: {
      marginTop: 4,
      color: "#806D32",
      fontSize: 10.5,
      lineHeight: 16,
    },

    reviewPanel: {
      marginTop: 13,
      padding: 14,
      borderRadius: 11,
      backgroundColor:
        "#F8FBFB",
      borderWidth: 1,
      borderColor:
        "#D7E6E3",
    },

    reviewTitle: {
      color: "#153646",
      fontSize: 14,
      fontWeight: "900",
    },

    reviewCopy: {
      marginTop: 5,
      color: "#647984",
      fontSize: 11,
      lineHeight: 17,
    },

    outcomeRow: {
      marginTop: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    outcomeButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#D4DFE4",
      backgroundColor:
        "#FFFFFF",
    },

    outcomeButtonActive: {
      borderColor:
        "#0B8F80",
      backgroundColor:
        "#E9F8F4",
    },

    outcomeButtonDanger: {
      borderColor:
        "#D99090",
      backgroundColor:
        "#FFF1F1",
    },

    outcomeButtonText: {
      color: "#526B79",
      fontSize: 10.5,
      fontWeight: "800",
    },

    outcomeButtonTextActive: {
      color: "#08786F",
    },

    noteLabel: {
      marginTop: 13,
      marginBottom: 5,
      color: "#526B79",
      fontSize: 10.5,
      fontWeight: "800",
    },

    noteInput: {
      minHeight: 88,
      padding: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#CDD9E0",
      backgroundColor:
        "#FFFFFF",
      color: "#173748",
      fontSize: 12,
    },

    reviewError: {
      marginTop: 8,
      color: "#B42318",
      fontSize: 10.5,
      fontWeight: "700",
    },

    reviewActions: {
      marginTop: 12,
      flexDirection: "row",
      justifyContent:
        "flex-end",
      gap: 8,
      flexWrap: "wrap",
    },

    primaryButton: {
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
      alignItems: "center",
      justifyContent:
        "center",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    cancelButton: {
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 9,
      backgroundColor:
        "#EEF2F4",
      alignItems: "center",
      justifyContent:
        "center",
    },

    cancelButtonText: {
      color: "#526B79",
      fontSize: 10.5,
      fontWeight: "800",
    },

    confirmedBox: {
      marginTop: 13,
      padding: 12,
      borderRadius: 10,
      backgroundColor:
        "#ECF9F5",
      borderWidth: 1,
      borderColor:
        "#C8E7DF",
    },

    disputedBox: {
      backgroundColor:
        "#FFF3F3",
      borderColor:
        "#EDC4C4",
    },

    confirmedTitle: {
      color: "#146749", fontSize: 14, lineHeight: 21, fontWeight: "700",
    },

    confirmedText: {
      marginTop: 5, color: "#36574A", fontSize: 13, lineHeight: 21,
    },

    confirmedNote: {
      marginTop: 7, color: "#4D6D5C", fontSize: 13, lineHeight: 20, fontStyle: "italic",
    },
    // Scoped presentation styles for the resident report tracker.
    reportToolbar: {
      marginBottom: 16, padding: 18, borderWidth: 1, borderColor: "#DCE6E2",
      borderRadius: 14, backgroundColor: "#FFFFFF", gap: 12,
    },
    reportToolbarHeading: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 8,
    },
    reportToolbarTitle: {
      color: "#183C34", fontSize: 16, fontWeight: "700",
    },
    reportToolbarCount: { color: "#536B69", fontSize: 13 },
    reportControls: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12,
    },
    reportFilters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    reportFilterChip: {
      minHeight: 40, paddingHorizontal: 13, justifyContent: "center",
      borderWidth: 1, borderColor: "#D8E3DF", borderRadius: 9, backgroundColor: "#FFFFFF",
    },
    reportFilterChipActive: { borderColor: "#176B52", backgroundColor: "#176B52" },
    reportFilterText: {
      color: "#526B67", fontSize: 13, fontWeight: "600",
    },
    reportFilterTextActive: { color: "#FFFFFF" },
    reportSearchInput: {
      minHeight: 42, minWidth: 205, maxWidth: 340, flexGrow: 1,
      paddingHorizontal: 13, borderWidth: 1, borderColor: "#D8E3DF",
      borderRadius: 9, color: "#183C34", backgroundColor: "#FAFCFB",
      fontSize: 14,
    },
    reportShowingCount: { color: "#687E79", fontSize: 12 },
    statusBadgeClosed: { backgroundColor: "#EDF1F4", borderColor: "#D8E0E6" },
    statusBadgeActive: { backgroundColor: "#E9F3FD", borderColor: "#CDE2F5" },
    statusBadgeAttention: { backgroundColor: "#FFF3E6", borderColor: "#F4D5B3" },
    nextUpdateBox: {
      marginTop: 14, paddingHorizontal: 13, paddingVertical: 11,
      borderLeftWidth: 3, borderLeftColor: "#176B52", borderRadius: 8,
      backgroundColor: "#F1F7F4",
    },
    nextUpdateAttention: { borderLeftColor: "#B86C1C", backgroundColor: "#FFF7EB" },
    nextUpdateLabel: {
      color: "#216F56", fontSize: 11,
      fontWeight: "700", letterSpacing: 0.6,
    },
    nextUpdateLabelAttention: { color: "#97540C" },
    nextUpdateText: {
      marginTop: 4, color: "#304C44", fontSize: 14, lineHeight: 21,
    },
    detailsToggle: {
      minHeight: 44, marginTop: 12, paddingHorizontal: 13,
      borderWidth: 1, borderColor: "#C9DBD3", borderRadius: 9,
      backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", gap: 12,
    },
    detailsToggleAttention: { borderColor: "#D7AD79" },
    detailsToggleText: {
      flexShrink: 1, color: "#176B52",
      fontSize: 13, fontWeight: "700",
    },
    detailsToggleSymbol: {
      color: "#176B52", fontSize: 20, fontWeight: "500",
    },
    detailsBody: { marginTop: 6 },
    fullReference: {
      marginTop: 8, marginBottom: 14,
      color: "#697D77", fontSize: 12, lineHeight: 19,
    },
    reportPhotoThumbnail: {
      width: 108,
      height: 82,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "#EDF4F0",
      borderWidth: 1,
      borderColor: "#DCE7E0",
    },
    reportPhotoExpanded: {
      width: "100%",
      height: 175,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "#F3F6F4",
      borderWidth: 1,
      borderColor: "#DFE7E2",
    },
    reportPhotoImage: {
      width: "100%",
      height: "100%",
    },
    reportPhotoPlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 5,
    },
    reportPhotoPlaceholderText: {
      color: "#61746E",
      fontSize: 10,
      fontWeight: "600",
      textAlign: "center",
    },
    reportEvidenceSection: {
      marginTop: 8, gap: 6,
    },
    reportEvidenceDescription: {
      color: "#5B756B", fontSize: 13, lineHeight: 20,
    },
    reportEvidenceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 6,
    },
    reportEvidenceTile: {
      minWidth: 170, flexBasis: 220, flexGrow: 1, maxWidth: 370, gap: 5,
    },
    reportEvidenceCaption: {
      color: "#526F63", fontSize: 12, lineHeight: 18, fontWeight: "600",
    },

    detailsSectionHeading: {
      flexDirection: "row", alignItems: "center", gap: 9,
      marginTop: 10, marginBottom: 12,
    },
    detailsSectionTitle: {
      color: "#153E34", fontSize: 17, lineHeight: 24, fontWeight: "700",
    },
    reportDetailsGrid: {
      flexDirection: "row", flexWrap: "wrap", gap: 22, alignItems: "flex-start",
      padding: 17, borderWidth: 1, borderColor: "#E2EAE5",
      borderRadius: 12, backgroundColor: "#FBFCFB",
    },
    reportDetailsMediaColumn: {
      flexBasis: 255, minWidth: 200, flexGrow: 1, maxWidth: 400,
    },
    reportDetailsInformationColumn: {
      flexBasis: 305, minWidth: 200, flexGrow: 2,
    },
    peopleSection: {
      marginTop: 20, gap: 4,
    },
    reporterProfileCard: {
      padding: 15, backgroundColor: "#F4F8F5",
      borderWidth: 1, borderColor: "#DAE8DF", borderRadius: 12,
      flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14,
    },
    personAvatar: {
      width: 52, height: 52, borderRadius: 26, backgroundColor: "#E0EEE6",
      overflow: "hidden", alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: "#C8DCD0",
    },
    personAvatarPhoto: {
      width: "100%", height: "100%",
    },
    personAvatarInitials: {
      color: "#176B52", fontSize: 17, fontWeight: "700",
    },
    personProfileText: {
      flexGrow: 1, flexShrink: 1, minWidth: 125,
    },
    personProfileEyebrow: {
      color: "#627E71", fontSize: 11, lineHeight: 16,
      letterSpacing: 0.65, fontWeight: "700",
    },
    personProfileName: {
      marginTop: 3, color: "#173E32", fontSize: 16,
      fontWeight: "700", lineHeight: 23,
    },
    personProfileSubtitle: {
      marginTop: 3, color: "#5B766B", fontSize: 12, lineHeight: 18,
    },
    personRolePill: {
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
      borderWidth: 1, borderColor: "#CAE1D2", backgroundColor: "#E5F2E9",
    },
    personRolePillText: {
      color: "#216B4E", fontSize: 12, fontWeight: "700",
    },
    assignmentIdentityRow: {
      flexDirection: "row", alignItems: "center", flexGrow: 1,
      flexShrink: 1, gap: 12,
    },
    responderSectionHelp: {
      marginTop: 2, marginBottom: 5,
      color: "#607870", fontSize: 13, lineHeight: 20,
    },
  });