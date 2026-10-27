import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, {
  useMemo,
  useRef,
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
import MapView, {
  Marker,
} from "react-native-maps";

import { db } from "../lib/firebase";
import {
  isApprovedProfile,
} from "../lib/firebaseAuth";
import { useUserSession } from "../lib/useUserSession";
import VerifiedEvacuationCenters from "./VerifiedEvacuationCenters";
import EmergencyResponseQuickActions from "./EmergencyResponseQuickActions";

type Pin = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type EvidenceAsset = {
  uri: string;
  kind: "image" | "video";
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
};

type Attachment = {
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

type Severity =
  | "low"
  | "medium"
  | "high"
  | "critical";

const CLOUDINARY_CLOUD_NAME = "netjawtz";
const CLOUDINARY_UPLOAD_PRESET = "volunserve_evidence";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

const SJDM_REGION = {
  latitude: 14.813,
  longitude: 121.045,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const CATEGORY_OPTIONS = [
  "Flood",
  "Fire",
  "Medical Emergency",
  "Landslide",
  "Road Obstruction",
  "Transport / Mobility",
  "Lost / Stranded Person",
  "Home Repair / Structural Damage",
  "Electrical / Utility Problem",
  "Plumbing / Water Problem",
  "Safety / Welfare Concern",
  "Other",
];

const ASSISTANCE_OPTIONS = [
  "Evacuation",
  "Transport / Vehicle",
  "Medical Assistance",
  "Search and Rescue",
  "Clearing / Heavy Lifting",
  "Relief / Goods Delivery",
  "Safety / Welfare Check",
  "Other",
];

type DuplicateBlock = {
  caseId: string;
  status: string;
  category: string;
  reason: "active" | "cooldown";
  remainingMs: number;
};

const PRODUCTION_DUPLICATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEVELOPMENT_DUPLICATE_COOLDOWN_MS = 2 * 60 * 1000;
const DUPLICATE_COOLDOWN_MS = __DEV__
  ? DEVELOPMENT_DUPLICATE_COOLDOWN_MS
  : PRODUCTION_DUPLICATE_COOLDOWN_MS;
const DUPLICATE_RADIUS_METERS = 500;
const ACTIVE_CASE_STATUSES = new Set([
  "reported",
  "under_review",
  "validated",
  "assigned",
  "accepted",
  "responding",
  "in_progress",
  "on_site",
]);

const normalizeIncidentText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const timestampToMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};

const distanceMetersBetween = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) => {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
};

const formatRemainingCooldown = (remainingMs: number) => {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
};

const SEVERITY_OPTIONS: {
  value: Severity;
  label: string;
  hint: string;
}[] = [
  {
    value: "low",
    label: "Standard",
    hint: "Needs help, but no immediate life threat",
  },
  {
    value: "medium",
    label: "Urgent",
    hint: "Needs prompt response",
  },
  {
    value: "high",
    label: "High",
    hint: "Serious risk or rapidly worsening situation",
  },
  {
    value: "critical",
    label: "Critical",
    hint: "Immediate danger to life or safety",
  },
];

const toggleValue = (
  current: string[],
  value: string,
  setter: React.Dispatch<React.SetStateAction<string[]>>
) => {
  setter(
    current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
  );
};

const deriveRequiredSkills = (
  assistanceTypes: string[]
) => {
  const skills = new Set<string>();

  assistanceTypes.forEach((item) => {
    switch (item) {
      case "Evacuation":
        skills.add("Community Coordination");
        skills.add("General Volunteer Assistance");
        break;

      case "Transport / Vehicle":
        skills.add("Driver / Transport");
        break;

      case "Medical Assistance":
        skills.add("First Aid");
        skills.add("Medical Assistance");
        break;

      case "Search and Rescue":
        skills.add("Search and Rescue");
        break;

      case "Clearing / Heavy Lifting":
        skills.add("Clearing / Heavy Lifting");
        break;

      case "Relief / Goods Delivery":
        skills.add("Community Coordination");
        skills.add("General Volunteer Assistance");
        break;

      case "Safety / Welfare Check":
        skills.add("General Volunteer Assistance");
        break;

      default:
        skills.add("General Volunteer Assistance");
        break;
    }
  });

  if (skills.size === 0) {
    skills.add("General Volunteer Assistance");
  }

  return Array.from(skills);
};

const safeText = (
  value: unknown,
  maxLength: number
) => {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
};

const extensionForAsset = (
  asset: EvidenceAsset
) => {
  const fileName = asset.fileName || "";
  const fileMatch = fileName.match(/\.([A-Za-z0-9]+)$/);

  if (fileMatch?.[1]) {
    return fileMatch[1].toLowerCase();
  }

  const mime = asset.mimeType || "";

  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (asset.kind === "video") return "mp4";

  return "jpg";
};

const contentTypeForAsset = (
  asset: EvidenceAsset
) => {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const extension = extensionForAsset(asset);

  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "mp4") return "video/mp4";

  return "image/jpeg";
};

export default function DisasterResponse() {
  const router = useRouter();
  const {
    user,
    profile,
    loading,
  } = useUserSession();

  const profileData: any = profile || {};

  const mapRef =
    useRef<MapView | null>(null);

  const attemptRef =
    useRef<{
      id: string;
      uid: string;
    } | null>(null);

  const uploadCache =
    useRef(
      new Map<string, Attachment>()
    );

  const submitLock = useRef(false);

  const [category, setCategory] =
    useState("");

  const [severity, setSeverity] =
    useState<Severity>("medium");

  const [description, setDescription] =
    useState("");

  const [affectedPeople, setAffectedPeople] =
    useState("1");

  const [assistanceTypes, setAssistanceTypes] =
    useState<string[]>([]);

  const [otherAssistance, setOtherAssistance] =
    useState("");

  const [needsNote, setNeedsNote] =
    useState("");

  const [incidentAddress, setIncidentAddress] =
    useState("");

  const [pin, setPin] =
    useState<Pin | null>(null);

  const [photos, setPhotos] =
    useState<EvidenceAsset[]>([]);

  const [video, setVideo] =
    useState<EvidenceAsset | null>(null);

  const [confirmed, setConfirmed] =
    useState(false);

  const [locating, setLocating] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [progress, setProgress] =
    useState("");

  const identityVerified =
    profileData.identityVerified === true ||
    profileData.identityStatus === "verified";

  const reporterLabel =
    identityVerified
      ? "Verified Resident"
      : "Basic Account · Unverified Reporter";

  const requiredSkills = useMemo(
    () =>
      deriveRequiredSkills(
        assistanceTypes
      ),
    [assistanceTypes]
  );

  const setIncidentPin = (
    latitude: number,
    longitude: number,
    accuracy: number | null = null,
    center = true
  ) => {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return;
    }

    const nextPin = {
      latitude,
      longitude,
      accuracy,
    };

    setPin(nextPin);

    if (center) {
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        350
      );
    }
  };

  const useCurrentLocation = async () => {
    if (locating || busy) return;

    try {
      setLocating(true);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Location Permission",
          "Allow location access so the response team can find the incident. You can also tap the map to place the incident pin manually."
        );
        return;
      }

      const position =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

      setIncidentPin(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        "Location Error",
        "Could not get your current GPS location. Tap the map to place the incident pin manually."
      );
    } finally {
      setLocating(false);
    }
  };

  const normalizePickerAsset = (
    asset: ImagePicker.ImagePickerAsset,
    kind: "image" | "video"
  ): EvidenceAsset => ({
    uri: asset.uri,
    kind,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
  });

  const addPhoto = (
    asset: EvidenceAsset
  ) => {
    setPhotos((current) => {
      if (
        current.some(
          (item) => item.uri === asset.uri
        )
      ) {
        return current;
      }

      if (current.length >= 5) {
        Alert.alert(
          "Photo Limit",
          "Maximum of 5 incident photos."
        );

        return current;
      }

      return [...current, asset];
    });
  };

  const takePhoto = async () => {
    if (busy) return;

    if (photos.length >= 5) {
      Alert.alert(
        "Photo Limit",
        "Maximum of 5 incident photos."
      );
      return;
    }

    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Camera Permission",
        "Allow camera access to take incident evidence."
      );
      return;
    }

    const result =
      await ImagePicker.launchCameraAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

    if (!result.canceled) {
      addPhoto(
        normalizePickerAsset(
          result.assets[0],
          "image"
        )
      );
    }
  };

  const choosePhoto = async () => {
    if (busy) return;

    if (photos.length >= 5) {
      Alert.alert(
        "Photo Limit",
        "Maximum of 5 incident photos."
      );
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access to attach incident evidence."
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

    if (!result.canceled) {
      addPhoto(
        normalizePickerAsset(
          result.assets[0],
          "image"
        )
      );
    }
  };

  const chooseVideo = async () => {
    if (busy) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access to attach an optional incident video."
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Videos,
      });

    if (!result.canceled) {
      setVideo(
        normalizePickerAsset(
          result.assets[0],
          "video"
        )
      );
    }
  };

  const uploadEvidence = async (
    assets: EvidenceAsset[]
  ): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];

    for (
      let index = 0;
      index < assets.length;
      index += 1
    ) {
      const asset = assets[index];

      const cached =
        uploadCache.current.get(asset.uri);

      if (cached) {
        attachments.push(cached);
        continue;
      }

      const maxBytes =
        asset.kind === "image"
          ? 10 * 1024 * 1024
          : 50 * 1024 * 1024;

      if (
        typeof asset.fileSize === "number" &&
        asset.fileSize >= maxBytes
      ) {
        throw new Error(
          asset.kind === "image"
            ? "cloudinary/photo-too-large"
            : "cloudinary/video-too-large"
        );
      }

      setProgress(
        `Uploading ${
          asset.kind === "image"
            ? "photo"
            : "video"
        } ${index + 1} of ${assets.length}...`
      );

      const extension =
        extensionForAsset(asset);

      const contentType =
        contentTypeForAsset(asset);

      const fileName =
        asset.fileName ||
        `evidence-${Date.now()}-${index}.${extension}`;

      const body = new FormData();

      body.append(
        "file",
        {
          uri: asset.uri,
          name: fileName,
          type: contentType,
        } as any
      );

      body.append(
        "upload_preset",
        CLOUDINARY_UPLOAD_PRESET
      );

      const response =
        await fetch(
          CLOUDINARY_UPLOAD_URL,
          {
            method: "POST",
            body,
          }
        );

      const result =
        await response
          .json()
          .catch(() => null);

      if (
        !response.ok ||
        !result ||
        typeof result.secure_url !== "string" ||
        typeof result.public_id !== "string"
      ) {
        const message =
          result?.error?.message ||
          `Cloudinary upload failed with HTTP ${response.status}.`;

        const uploadError =
          new Error(message) as Error & {
            code?: string;
          };

        uploadError.code =
          "cloudinary/upload-failed";

        throw uploadError;
      }

      const attachment: Attachment = {
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
      };

      uploadCache.current.set(
        asset.uri,
        attachment
      );

      attachments.push(attachment);
    }

    return attachments;
  };

  const resetForm = () => {
    setCategory("");
    setSeverity("medium");
    setDescription("");
    setAffectedPeople("1");
    setAssistanceTypes([]);
    setOtherAssistance("");
    setNeedsNote("");
    setIncidentAddress("");
    setPin(null);
    setPhotos([]);
    setVideo(null);
    setConfirmed(false);

    attemptRef.current = null;
    uploadCache.current.clear();
  };

  const submitReport = async () => {
    if (submitLock.current || busy) {
      return;
    }

    if (
      !user ||
      !profile ||
      !isApprovedProfile(profile)
    ) {
      Alert.alert(
        "Sign In Required",
        "Sign in with your VolunServe account before submitting an emergency report."
      );
      return;
    }

    const trimmedDescription =
      description.trim();

    const trimmedAddress =
      incidentAddress.trim();

    const affected =
      Number(affectedPeople);

    if (!category) {
      Alert.alert(
        "Incident Type Required",
        "Select the type of emergency or incident."
      );
      return;
    }

    if (trimmedDescription.length < 10) {
      Alert.alert(
        "Situation Details Required",
        "Describe what happened in at least 10 characters."
      );
      return;
    }

    if (
      !Number.isInteger(affected) ||
      affected < 1
    ) {
      Alert.alert(
        "Affected People",
        "Enter a valid number of people affected."
      );
      return;
    }

    if (assistanceTypes.length === 0) {
      Alert.alert(
        "Help Needed",
        "Select at least one type of immediate help needed."
      );
      return;
    }

    if (
      assistanceTypes.includes("Other") &&
      otherAssistance.trim().length < 2
    ) {
      Alert.alert(
        "Other Assistance",
        "Briefly describe the other assistance needed."
      );
      return;
    }

    if (!pin) {
      Alert.alert(
        "Incident Location Required",
        "Use GPS or tap the map to place the exact incident pin."
      );
      return;
    }

    if (trimmedAddress.length < 3) {
      Alert.alert(
        "Address Required",
        "Enter the exact address, barangay, or nearby landmark."
      );
      return;
    }

    if (photos.length === 0) {
      Alert.alert(
        "Photo Required",
        "At least one incident photo is required for Admin verification."
      );
      return;
    }

    if (!confirmed) {
      Alert.alert(
        "Confirmation Required",
        "Confirm that the report and attached evidence are accurate to the best of your knowledge."
      );
      return;
    }

    const finalAssistanceTypes =
      assistanceTypes.map((item) =>
        item === "Other"
          ? `Other: ${otherAssistance.trim()}`
          : item
      );

    const finalRequiredSkills =
      deriveRequiredSkills(
        finalAssistanceTypes
      );

    /*
     * Current Firestore schema still requires neededGoods.
     * Emergency reporting intentionally does not ask the resident
     * for a detailed goods/material list. Admin can assess that later.
     */
    const neededGoods = [
      "To Be Assessed By Admin",
    ];

    const needsSummary = [
      `Help: ${finalAssistanceTypes.join(", ")}`,
      `Skills: ${finalRequiredSkills.join(", ")}`,
      needsNote.trim()
        ? `Notes: ${needsNote.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 2500);

    const contactNumber =
      safeText(
        profileData.phoneNumber ||
          profileData.phone ||
          user.phoneNumber ||
          "",
        30
      );

    if (contactNumber.length < 8) {
      Alert.alert(
        "Contact Number Required",
        "Add a valid contact number in Account Settings before submitting an emergency report so Admin or responders can contact you."
      );
      return;
    }

    submitLock.current = true;
    setBusy(true);

    try {
      setProgress("Checking for an existing emergency report...");

      const existingSnapshot = await getDocs(
        query(
          collection(db, "disasterCases"),
          where("reporterUid", "==", user.uid)
        )
      );

      const now = Date.now();
      const currentAddress = normalizeIncidentText(trimmedAddress);
      let block: DuplicateBlock | null = null;

      for (const existingDoc of existingSnapshot.docs) {
        const data: any = existingDoc.data();
        if (normalizeIncidentText(data.category) !== normalizeIncidentText(category)) {
          continue;
        }

        const existingLat = Number(data.latitude);
        const existingLng = Number(data.longitude);
        const hasExistingCoords =
          Number.isFinite(existingLat) && Number.isFinite(existingLng);
        const distance = hasExistingCoords
          ? distanceMetersBetween(
              { latitude: pin.latitude, longitude: pin.longitude },
              { latitude: existingLat, longitude: existingLng }
            )
          : Number.POSITIVE_INFINITY;

        const sameAddress =
          currentAddress.length >= 3 &&
          normalizeIncidentText(data.location) === currentAddress;
        const sameIncidentArea =
          sameAddress || distance <= DUPLICATE_RADIUS_METERS;

        if (!sameIncidentArea) continue;

        const status = normalizeIncidentText(data.status || "reported");

        if (ACTIVE_CASE_STATUSES.has(status)) {
          block = {
            caseId: existingDoc.id,
            status,
            category: String(data.category || category),
            reason: "active",
            remainingMs: 0,
          };
          break;
        }

        if (["resolved", "closed", "cancelled"].includes(status)) {
          const terminalAt =
            timestampToMillis(data.closedAt) ||
            timestampToMillis(data.resolvedAt) ||
            timestampToMillis(data.updatedAt) ||
            timestampToMillis(data.createdAt);
          const elapsed = terminalAt > 0 ? now - terminalAt : Number.POSITIVE_INFINITY;
          const remaining = DUPLICATE_COOLDOWN_MS - elapsed;

          if (remaining > 0) {
            block = {
              caseId: existingDoc.id,
              status,
              category: String(data.category || category),
              reason: "cooldown",
              remainingMs: remaining,
            };
            break;
          }
        }
      }

      if (block) {
        setProgress("");
        submitLock.current = false;
        setBusy(false);

        if (block.reason === "active") {
          Alert.alert(
            "Existing Emergency Report",
            `You already have an active ${block.category} report for this area. Continue using the existing case so the LGU does not receive a duplicate.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "My Reports",
                onPress: () => router.push("/my-cases" as any),
              },
              {
                text: "Track Response",
                onPress: () =>
                  router.push(
                    `/map-tracking?caseId=${encodeURIComponent(block!.caseId)}` as any
                  ),
              },
            ]
          );
        } else {
          Alert.alert(
            "24-Hour Duplicate Cooldown",
            `A similar ${block.category} report in this area was recently completed. ${formatRemainingCooldown(block.remainingMs)} remains before the same incident can be submitted again. If this is a different emergency, change the incident type or confirm the correct location.`,
            [
              { text: "OK", style: "cancel" },
              {
                text: "View My Reports",
                onPress: () => router.push("/my-cases" as any),
              },
            ]
          );
        }
        return;
      }
    } catch (duplicateCheckError) {
      console.log("duplicate emergency check", duplicateCheckError);
      setProgress("");
      submitLock.current = false;
      setBusy(false);
      Alert.alert(
        "Could Not Verify Duplicate Protection",
        "VolunServe could not confirm whether a similar emergency already exists. Check your connection and try again before submitting."
      );
      return;
    }

    if (
      !attemptRef.current ||
      attemptRef.current.uid !== user.uid
    ) {
      attemptRef.current = {
        id: doc(
          collection(
            db,
            "disasterCases"
          )
        ).id,
        uid: user.uid,
      };

      uploadCache.current.clear();
    }

    const caseId =
      attemptRef.current.id;

    const caseRef =
      doc(
        db,
        "disasterCases",
        caseId
      );

    try {
      const evidenceAssets = [
        ...photos,
        ...(video ? [video] : []),
      ];

      const attachments =
        await uploadEvidence(
          evidenceAssets
        );

      setProgress(
        "Saving emergency report for Admin verification..."
      );

      await setDoc(
        caseRef,
        {
          reporterUid: user.uid,

          reporterName:
            safeText(
              profileData.fullName ||
                user.displayName ||
                "Resident",
              120
            ),

          reporterEmail:
            safeText(
              user.email || "",
              160
            ),

          reporterBarangay:
            safeText(
              profileData.barangay || "",
              120
            ),

          reporterAddress:
            safeText(
              profileData.address ||
                profileData.fullAddress ||
                "",
              240
            ),

          contactNumber,

          emergencyContact:
            safeText(
              profileData.emergencyContact ||
                profileData.emergencyContactNumber ||
                "",
              30
            ),

          reporterProfilePictureUrl:
            safeText(
              profileData.profilePictureUrl ||
                profileData.profilePhotoUrl ||
                profileData.photoURL ||
                user.photoURL ||
                "",
              2048
            ),

          source:
            "resident_emergency_assistance",

          requestKind:
            "emergency_assistance",

          title:
            `${category} emergency report`
              .slice(0, 120),

          category,
          severity,

          status: "reported",

          verificationStatus:
            "pending_verification",

          evidenceReviewStatus:
            "pending_review",

          location:
            trimmedAddress.slice(0, 240),

          latitude: pin.latitude,
          longitude: pin.longitude,

          gpsAccuracyMeters:
            pin.accuracy,

          locationCapturedAt:
            serverTimestamp(),

          details:
            trimmedDescription.slice(0, 2000),

          affectedPeople:
            affected,

          assistanceTypes:
            finalAssistanceTypes,

          requiredSkills:
            finalRequiredSkills,

          neededGoods,

          needsNote:
            needsNote
              .trim()
              .slice(0, 1500),

          needs:
            needsSummary,

          attachments,

          photoEvidenceCount:
            photos.length,

          videoEvidenceCount:
            video ? 1 : 0,

          verification: {
            accountApproved: true,

            reporterTrust:
              identityVerified
                ? "verified_resident"
                : "basic_account",

            identityVerified,

            identityStatus:
              profileData.identityStatus ||
              "basic",

            emailVerified:
              Boolean(
                user.emailVerified
              ),

            phoneOnFile:
              contactNumber !==
              "Unavailable",

            gpsProvided: true,

            photoEvidenceProvided: true,

            videoEvidenceProvided:
              Boolean(video),

            duplicateCheckStatus:
              "pending_admin_review",

            locationCheckStatus:
              "pending_admin_review",
          },

          residentConfirmationAccepted:
            true,

          residentConfirmationAt:
            serverTimestamp(),

          privacyScope:
            "admin_and_assigned_responder",

          requiredVolunteers: 0,

          assignedVolunteersCount: 0,

          assignedVolunteerIds: [],

          adminNote: "",

          validatedAt: null,
          validatedBy: null,
          assignedAt: null,
          resolvedAt: null,
          closedAt: null,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      Alert.alert(
        "Emergency Report Submitted",
        `${
          identityVerified
            ? "Your Verified Resident report"
            : "Your Basic Account report"
        } was submitted for Admin verification.\n\nReference: ${caseId}`
      );

      resetForm();
    } catch (cause: any) {
      try {
        const saved =
          await getDocFromServer(
            caseRef
          );

        if (
          saved.exists() &&
          saved.data().reporterUid ===
            user.uid
        ) {
          Alert.alert(
            "Emergency Report Submitted",
            `Your report was saved successfully.\n\nReference: ${caseId}`
          );

          resetForm();
          return;
        }
      } catch {
        // Keep the original submission error.
      }

      const message =
        String(
          cause?.message ||
            cause?.code ||
            ""
        );

      if (
        message.includes(
          "photo-too-large"
        )
      ) {
        Alert.alert(
          "Photo Too Large",
          "Each incident photo must be under 10 MB."
        );
      } else if (
        message.includes(
          "video-too-large"
        )
      ) {
        Alert.alert(
          "Video Too Large",
          "The optional incident video must be under 50 MB."
        );
      } else if (
        message.includes("cloudinary")
      ) {
        Alert.alert(
          "Evidence Upload Failed",
          "Cloudinary upload failed. Check your internet connection and the configured upload preset. Your form is retained."
        );
      } else if (
        message.includes(
          "permission"
        ) ||
        message.includes(
          "unauthorized"
        )
      ) {
        Alert.alert(
          "Submission Blocked",
          "The report was blocked by Firestore permissions. Check the deployed Firestore rules. Your form is retained."
        );
      } else {
        Alert.alert(
          "Submission Failed",
          "Your form was kept. Check your connection and try again; the same report reference will be reused."
        );
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
      setProgress("");
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator
          size="large"
          color="#dc2626"
        />

        <Text style={styles.loadingText}>
          Loading your account...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(profile)
  ) {
    return (
      <View style={styles.centerScreen}>
        <Ionicons
          name="lock-closed"
          size={42}
          color="#64748b"
        />

        <Text style={styles.blockedTitle}>
          Sign in required
        </Text>

        <Text style={styles.blockedText}>
          Sign in with your VolunServe account to submit an emergency report.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons
          name="warning"
          size={42}
          color="#ffffff"
        />

        <Text style={styles.headerTitle}>
          Emergency Response
        </Text>

        <Text style={styles.headerSubtitle}>
          Report an active emergency or immediate safety concern.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <EmergencyResponseQuickActions residentUid={user.uid} />
        <VerifiedEvacuationCenters />

        <View style={styles.accountCard}>
          <View style={styles.accountIcon}>
            <Ionicons
              name={
                identityVerified
                  ? "shield-checkmark"
                  : "person-circle"
              }
              size={24}
              color={
                identityVerified
                  ? "#047857"
                  : "#b45309"
              }
            />
          </View>

          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>
              {profileData.fullName ||
                user.displayName ||
                "Resident"}
            </Text>

            <Text
              style={[
                styles.accountStatus,
                identityVerified
                  ? styles.verifiedText
                  : styles.basicText,
              ]}
            >
              {reporterLabel}
            </Text>
          </View>
        </View>

        {!identityVerified ? (
          <View style={styles.noticeCard}>
            <Ionicons
              name="information-circle"
              size={22}
              color="#b45309"
            />

            <Text style={styles.noticeText}>
              Basic Accounts can report emergencies. Because your identity is not yet verified, Admin will review your GPS, photo evidence, account history, and report details before normal volunteer dispatch.
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>
            01
          </Text>

          <Text style={styles.sectionTitle}>
            What happened?
          </Text>

          <Text style={styles.label}>
            Incident type *
          </Text>

          <View style={styles.chipWrap}>
            {CATEGORY_OPTIONS.map(
              (item) => {
                const active =
                  category === item;

                return (
                  <TouchableOpacity
                    key={item}
                    disabled={busy}
                    style={[
                      styles.chip,
                      active &&
                        styles.chipActive,
                    ]}
                    onPress={() =>
                      setCategory(item)
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active &&
                          styles.chipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>

          <Text style={styles.label}>
            How urgent does it feel? *
          </Text>

          <Text style={styles.helper}>
            Admin will verify the final severity.
          </Text>

          {SEVERITY_OPTIONS.map(
            (option) => {
              const active =
                severity ===
                option.value;

              return (
                <TouchableOpacity
                  key={option.value}
                  disabled={busy}
                  style={[
                    styles.optionRow,
                    active &&
                      styles.optionRowActive,
                  ]}
                  onPress={() =>
                    setSeverity(
                      option.value
                    )
                  }
                >
                  <View
                    style={[
                      styles.radio,
                      active &&
                        styles.radioActive,
                    ]}
                  >
                    {active ? (
                      <View
                        style={
                          styles.radioDot
                        }
                      />
                    ) : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={
                        styles.optionTitle
                      }
                    >
                      {option.label}
                    </Text>

                    <Text
                      style={
                        styles.optionHint
                      }
                    >
                      {option.hint}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }
          )}

          <Text style={styles.label}>
            Number of people affected *
          </Text>

          <TextInput
            editable={!busy}
            style={styles.input}
            value={affectedPeople}
            onChangeText={(value) =>
              setAffectedPeople(
                value.replace(
                  /[^0-9]/g,
                  ""
                )
              )
            }
            keyboardType="number-pad"
            placeholder="1"
            maxLength={4}
          />

          <Text style={styles.label}>
            Situation details *
          </Text>

          <TextInput
            editable={!busy}
            style={[
              styles.input,
              styles.multiline,
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what is happening, who is affected, and any immediate safety concern."
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>
            02
          </Text>

          <Text style={styles.sectionTitle}>
            Exact response location
          </Text>

          <Text style={styles.helper}>
            Use GPS or tap the map to mark the exact place where help is needed.
          </Text>

          <TouchableOpacity
            disabled={locating || busy}
            style={[
              styles.locationButton,
              (locating || busy) &&
                styles.disabledButton,
            ]}
            onPress={
              useCurrentLocation
            }
          >
            {locating ? (
              <ActivityIndicator
                color="#0f766e"
              />
            ) : (
              <Ionicons
                name="locate"
                size={20}
                color="#0f766e"
              />
            )}

            <Text
              style={
                styles.locationButtonText
              }
            >
              {locating
                ? "Finding your location..."
                : "Use my current GPS location"}
            </Text>
          </TouchableOpacity>

          <MapView
            ref={(value) => {
              mapRef.current = value;
            }}
            style={styles.map}
            initialRegion={SJDM_REGION}
            onPress={(event) => {
              if (busy) return;

              const {
                latitude,
                longitude,
              } =
                event.nativeEvent.coordinate;

              setIncidentPin(
                latitude,
                longitude,
                null,
                false
              );
            }}
          >
            {pin ? (
              <Marker
                coordinate={{
                  latitude:
                    pin.latitude,
                  longitude:
                    pin.longitude,
                }}
                draggable={!busy}
                onDragEnd={(event) => {
                  const {
                    latitude,
                    longitude,
                  } =
                    event.nativeEvent
                      .coordinate;

                  setIncidentPin(
                    latitude,
                    longitude,
                    null,
                    false
                  );
                }}
                title="Incident location"
              />
            ) : null}
          </MapView>

          <View style={styles.pinStatus}>
            <Ionicons
              name={
                pin
                  ? "checkmark-circle"
                  : "location-outline"
              }
              size={18}
              color={
                pin
                  ? "#047857"
                  : "#64748b"
              }
            />

            <Text style={styles.pinStatusText}>
              {pin
                ? `Location selected: ${pin.latitude.toFixed(
                    6
                  )}, ${pin.longitude.toFixed(
                    6
                  )}${
                    pin.accuracy !==
                    null
                      ? ` · GPS accuracy ±${Math.round(
                          pin.accuracy
                        )} m`
                      : ""
                  }`
                : "No exact incident location selected yet."}
            </Text>
          </View>

          <Text style={styles.label}>
            Exact address / barangay / landmark *
          </Text>

          <TextInput
            editable={!busy}
            style={[
              styles.input,
              styles.multilineSmall,
            ]}
            value={incidentAddress}
            onChangeText={
              setIncidentAddress
            }
            placeholder="Example: Block 4, Brgy. Muzon, near..."
            multiline
            maxLength={240}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>
            03
          </Text>

          <Text style={styles.sectionTitle}>
            Immediate help needed
          </Text>

          <Text style={styles.helper}>
            Select everything that applies. VolunServe will automatically derive the responder skills for Admin review.
          </Text>

          <View style={styles.chipWrap}>
            {ASSISTANCE_OPTIONS.map(
              (item) => {
                const active =
                  assistanceTypes.includes(
                    item
                  );

                return (
                  <TouchableOpacity
                    key={item}
                    disabled={busy}
                    style={[
                      styles.chip,
                      active &&
                        styles.chipActive,
                    ]}
                    onPress={() =>
                      toggleValue(
                        assistanceTypes,
                        item,
                        setAssistanceTypes
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active &&
                          styles.chipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>

          {assistanceTypes.includes(
            "Other"
          ) ? (
            <>
              <Text style={styles.label}>
                Other assistance *
              </Text>

              <TextInput
                editable={!busy}
                style={styles.input}
                value={otherAssistance}
                onChangeText={
                  setOtherAssistance
                }
                placeholder="Briefly describe the help needed"
                maxLength={150}
              />
            </>
          ) : null}

          <Text style={styles.label}>
            Additional response instructions
          </Text>

          <TextInput
            editable={!busy}
            style={[
              styles.input,
              styles.multilineSmall,
            ]}
            value={needsNote}
            onChangeText={setNeedsNote}
            placeholder="Example: Two senior citizens are inside; road access is narrow."
            multiline
            maxLength={1500}
            textAlignVertical="top"
          />

          <View style={styles.autoSkillCard}>
            <Ionicons
              name="construct-outline"
              size={20}
              color="#0f766e"
            />

            <View style={{ flex: 1 }}>
              <Text
                style={
                  styles.autoSkillTitle
                }
              >
                Responder matching
              </Text>

              <Text
                style={
                  styles.autoSkillText
                }
              >
                {requiredSkills.join(
                  " · "
                )}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.evidenceHeading}>
            <View style={{ flex: 1 }}>
              <Text
                style={styles.sectionNumber}
              >
                04
              </Text>

              <Text
                style={styles.sectionTitle}
              >
                Verification evidence
              </Text>
            </View>

            <View style={styles.requiredPill}>
              <Text
                style={
                  styles.requiredPillText
                }
              >
                PHOTO REQUIRED
              </Text>
            </View>
          </View>

          <Text style={styles.helper}>
            Add at least one current incident photo. Up to 5 photos are allowed. One optional video may also be attached.
          </Text>

          <View style={styles.evidenceButtons}>
            <TouchableOpacity
              disabled={busy}
              style={styles.evidenceButton}
              onPress={takePhoto}
            >
              <Ionicons
                name="camera"
                size={21}
                color="#dc2626"
              />

              <Text
                style={
                  styles.evidenceButtonText
                }
              >
                Take Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={busy}
              style={styles.evidenceButton}
              onPress={choosePhoto}
            >
              <Ionicons
                name="images"
                size={21}
                color="#dc2626"
              />

              <Text
                style={
                  styles.evidenceButtonText
                }
              >
                Add Photo
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.mediaCount}>
            Photos: {photos.length}/5
          </Text>

          {photos.map(
            (item, index) => (
              <View
                key={`${item.uri}-${index}`}
                style={
                  styles.previewContainer
                }
              >
                <Image
                  source={{
                    uri: item.uri,
                  }}
                  style={styles.preview}
                />

                <TouchableOpacity
                  disabled={busy}
                  style={styles.removeBtn}
                  onPress={() =>
                    setPhotos(
                      photos.filter(
                        (_, fileIndex) =>
                          fileIndex !==
                          index
                      )
                    )
                  }
                >
                  <Ionicons
                    name="close-circle"
                    size={30}
                    color="#ef4444"
                  />
                </TouchableOpacity>
              </View>
            )
          )}

          <TouchableOpacity
            disabled={busy}
            style={[
              styles.videoButton,
              video &&
                styles.videoButtonSelected,
            ]}
            onPress={chooseVideo}
          >
            <Ionicons
              name="videocam"
              size={22}
              color="#334155"
            />

            <Text
              style={styles.videoButtonText}
            >
              {video
                ? "Replace Optional Video"
                : "Add Optional Video"}
            </Text>
          </TouchableOpacity>

          {video ? (
            <View style={styles.videoSelected}>
              <Ionicons
                name="videocam"
                size={24}
                color="#ffffff"
              />

              <View style={{ flex: 1 }}>
                <Text
                  style={
                    styles.videoSelectedTitle
                  }
                >
                  Video selected
                </Text>

                <Text
                  numberOfLines={1}
                  style={
                    styles.videoSelectedName
                  }
                >
                  {video.fileName ||
                    "Incident video"}
                </Text>
              </View>

              <TouchableOpacity
                disabled={busy}
                onPress={() =>
                  setVideo(null)
                }
              >
                <Ionicons
                  name="trash-outline"
                  size={22}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>
            05
          </Text>

          <Text style={styles.sectionTitle}>
            Confirm before submitting
          </Text>

          <TouchableOpacity
            disabled={busy}
            style={styles.confirmRow}
            onPress={() =>
              setConfirmed(
                (current) => !current
              )
            }
          >
            <View
              style={[
                styles.checkbox,
                confirmed &&
                  styles.checkboxChecked,
              ]}
            >
              {confirmed ? (
                <Ionicons
                  name="checkmark"
                  size={17}
                  color="#ffffff"
                />
              ) : null}
            </View>

            <Text style={styles.confirmText}>
              I confirm that this report and the attached evidence are accurate to the best of my knowledge. I understand that the exact location and necessary contact details may be shown only to authorized Admins and the responder assigned to this case.
            </Text>
          </TouchableOpacity>

          <View style={styles.privacyCard}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color="#475569"
            />

            <Text style={styles.privacyText}>
              Exact incident location and evidence are for verification and response coordination, not for public display.
            </Text>
          </View>
        </View>

        {progress ? (
          <View style={styles.progressCard}>
            <ActivityIndicator
              color="#dc2626"
            />

            <Text style={styles.progressText}>
              {progress}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          disabled={busy || locating}
          style={[
            styles.submitBtn,
            (busy || locating) &&
              styles.disabledButton,
          ]}
          onPress={submitReport}
        >
          {busy ? (
            <ActivityIndicator
              color="#ffffff"
            />
          ) : (
            <>
              <Ionicons
                name="send"
                size={19}
                color="#ffffff"
              />

              <Text style={styles.submitText}>
                Submit for Admin Verification
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.submitNote}>
          Critical reports may be escalated to official LGU response while verification continues. Volunteer dispatch remains subject to Admin coordination.
        </Text>

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },

  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#f1f5f9",
  },

  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },

  blockedTitle: {
    marginTop: 14,
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },

  blockedText: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600",
  },

  header: {
    backgroundColor: "#dc2626",
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    elevation: 8,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 8,
  },

  headerSubtitle: {
    marginTop: 6,
    color: "#fee2e2",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "600",
  },

  container: {
    padding: 18,
  },

  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },

  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  accountCopy: {
    flex: 1,
  },

  accountName: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },

  accountStatus: {
    marginTop: 3,
    fontSize: 11.5,
    fontWeight: "800",
  },

  verifiedText: {
    color: "#047857",
  },

  basicText: {
    color: "#b45309",
  },

  noticeCard: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 14,
    padding: 13,
  },

  noticeText: {
    flex: 1,
    marginLeft: 9,
    color: "#92400e",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  sectionCard: {
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    elevation: 2,
  },

  sectionNumber: {
    alignSelf: "flex-start",
    color: "#b91c1c",
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900",
  },

  sectionTitle: {
    marginTop: 8,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },

  label: {
    marginTop: 16,
    marginBottom: 7,
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "800",
  },

  helper: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
  },

  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },

  multiline: {
    minHeight: 115,
  },

  multilineSmall: {
    minHeight: 76,
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },

  chip: {
    margin: 4,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },

  chipActive: {
    borderColor: "#dc2626",
    backgroundColor: "#fee2e2",
  },

  chipText: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "800",
  },

  chipTextActive: {
    color: "#b91c1c",
  },

  optionRow: {
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f8fafc",
  },

  optionRowActive: {
    borderColor: "#fca5a5",
    backgroundColor: "#fff7f7",
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  radioActive: {
    borderColor: "#dc2626",
  },

  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#dc2626",
  },

  optionTitle: {
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "900",
  },

  optionHint: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "600",
  },

  locationButton: {
    marginTop: 14,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa",
  },

  locationButtonText: {
    marginLeft: 8,
    color: "#0f766e",
    fontSize: 12.5,
    fontWeight: "900",
  },

  map: {
    width: "100%",
    height: 250,
    marginTop: 12,
    borderRadius: 14,
  },

  pinStatus: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
  },

  pinStatusText: {
    flex: 1,
    marginLeft: 7,
    color: "#475569",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "600",
  },

  autoSkillCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    padding: 12,
  },

  autoSkillTitle: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 9,
  },

  autoSkillText: {
    marginTop: 3,
    marginLeft: 9,
    color: "#475569",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "600",
  },

  evidenceHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  requiredPill: {
    marginLeft: 10,
    borderRadius: 999,
    backgroundColor: "#fff1f2",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  requiredPillText: {
    color: "#be123c",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  evidenceButtons: {
    marginTop: 14,
    flexDirection: "row",
    gap: 9,
  },

  evidenceButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff7f7",
  },

  evidenceButtonText: {
    marginLeft: 7,
    color: "#b91c1c",
    fontSize: 11.5,
    fontWeight: "900",
  },

  mediaCount: {
    marginTop: 10,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },

  previewContainer: {
    position: "relative",
    marginTop: 12,
  },

  preview: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
  },

  removeBtn: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "#ffffff",
    borderRadius: 20,
  },

  videoButton: {
    marginTop: 14,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },

  videoButtonSelected: {
    borderColor: "#94a3b8",
    backgroundColor: "#f1f5f9",
  },

  videoButtonText: {
    marginLeft: 8,
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },

  videoSelected: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#334155",
    padding: 12,
  },

  videoSelectedTitle: {
    marginLeft: 9,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  videoSelectedName: {
    marginTop: 2,
    marginLeft: 9,
    color: "#cbd5e1",
    fontSize: 10.5,
    fontWeight: "600",
  },

  confirmRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  checkboxChecked: {
    borderColor: "#dc2626",
    backgroundColor: "#dc2626",
  },

  confirmText: {
    flex: 1,
    color: "#475569",
    fontSize: 11.5,
    lineHeight: 18,
    fontWeight: "600",
  },

  privacyCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    padding: 11,
  },

  privacyText: {
    flex: 1,
    marginLeft: 8,
    color: "#64748b",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "600",
  },

  progressCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 13,
  },

  progressText: {
    marginLeft: 9,
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "700",
  },

  submitBtn: {
    marginTop: 18,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#dc2626",
    elevation: 4,
  },

  submitText: {
    marginLeft: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  submitNote: {
    marginTop: 10,
    paddingHorizontal: 8,
    color: "#64748b",
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: "600",
  },

  disabledButton: {
    opacity: 0.55,
  },
});
