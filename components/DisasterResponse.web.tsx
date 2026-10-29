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
import React, { useEffect, useRef, useState } from "react";
import {useFonts} from "expo-font";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  Inter_700Bold, Inter_800ExtraBold,
} from "@expo-google-fonts/inter";

import { db } from "../lib/firebase";
import { isApprovedProfile } from "../lib/firebaseAuth";
import { useUserSession } from "../lib/useUserSession";
import VerifiedEvacuationCenters from "./VerifiedEvacuationCenters";
import EmergencyResponseQuickActions from "./EmergencyResponseQuickActions";

type Pin = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
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

const CLOUDINARY_CLOUD_NAME = "netjawtz";
const CLOUDINARY_UPLOAD_PRESET = "volunserve_evidence";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

const mapDocument = `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <link
    href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css"
    rel="stylesheet"
  >

  <style>
    html,
    body,
    #map {
      width: 100%;
      height: 100%;
      margin: 0;
    }

    body {
      overflow: hidden;
      font-family: system-ui, sans-serif;
      background: #eef4f7;
    }

    #error {
      position: absolute;
      z-index: 999;
      top: 12px;
      left: 12px;
      right: 12px;
      display: none;
      background: rgba(255,255,255,.96);
      border: 1px solid #edbbbb;
      border-radius: 10px;
      padding: 10px 12px;
      color: #8b2525;
      box-shadow: 0 4px 18px rgba(0,0,0,.12);
      font: 13px/1.4 system-ui, sans-serif;
    }

    .maplibregl-ctrl-attrib {
      font-size: 10px;
    }
  </style>
</head>

<body>
  <div id="map"></div>
  <div id="error"></div>

  <script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>

  <script>
    const errorBox = document.getElementById('error');

    function showError(message) {
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    }

    if (!window.maplibregl) {
      showError(
        'Map library unavailable. Use GPS or enter coordinates manually.'
      );
    } else {
      try {
        const map = new maplibregl.Map({
          container: 'map',
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [121.045, 14.813],
          zoom: 13,
          attributionControl: true
        });

        map.addControl(
          new maplibregl.NavigationControl({
            visualizePitch: true
          }),
          'top-left'
        );

        let marker = null;

        function choose(lat, lng, notify) {
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
          ) {
            return;
          }

          if (!marker) {
            marker = new maplibregl.Marker({
              color: '#087f78',
              draggable: true
            })
              .setLngLat([lng, lat])
              .addTo(map);

            marker.on('dragend', () => {
              const position = marker.getLngLat();

              choose(
                position.lat,
                position.lng,
                true
              );
            });
          } else {
            marker.setLngLat([lng, lat]);
          }

          if (notify) {
            parent.postMessage(
              {
                kind: 'report-pin',
                latitude: lat,
                longitude: lng
              },
              '*'
            );
          }
        }

        map.on('click', (event) => {
          choose(
            event.lngLat.lat,
            event.lngLat.lng,
            true
          );
        });

        window.addEventListener(
          'message',
          (event) => {
            const data = event.data;

            if (
              event.source !== parent ||
              data?.kind !== 'set-pin' ||
              !Number.isFinite(data.latitude) ||
              !Number.isFinite(data.longitude)
            ) {
              return;
            }

            choose(
              data.latitude,
              data.longitude,
              false
            );

            map.flyTo({
              center: [
                data.longitude,
                data.latitude
              ],
              zoom: 16,
              essential: true
            });
          }
        );

        map.on('load', () => {
          parent.postMessage(
            {
              kind: 'report-map-ready'
            },
            '*'
          );
        });

        map.on('error', (event) => {
          console.error(
            'MapLibre error:',
            event?.error || event
          );
        });
      } catch (error) {
        console.error(error);

        showError(
          'Map could not be loaded. Use GPS or enter coordinates manually.'
        );
      }
    }
  </script>
</body>
</html>
`;


const assistanceOptions = [
  "Evacuation",
  "Transport / Vehicle",
  "Medical Assistance",
  "Search and Rescue",
  "Clearing / Heavy Lifting",
  "Relief / Goods Delivery",
  "Safety / Welfare Check",
  "Other",
];


const categoryOptions = [
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
) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const evidenceType = (file: File): "image" | "video" =>
  file.type.startsWith("video/") ? "video" : "image";

type DuplicateBlock = {
  caseId: string;
  status: string;
  category: string;
  reason: "active" | "cooldown";
  remainingMs: number;
};

const PRODUCTION_DUPLICATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEVELOPMENT_DUPLICATE_COOLDOWN_MS = 2 * 60 * 1000;
const LOCAL_DEVELOPMENT =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const DUPLICATE_COOLDOWN_MS = LOCAL_DEVELOPMENT
  ? DEVELOPMENT_DUPLICATE_COOLDOWN_MS
  : PRODUCTION_DUPLICATE_COOLDOWN_MS;
const DUPLICATE_COOLDOWN_LABEL = LOCAL_DEVELOPMENT
  ? "2-minute testing cooldown"
  : "24-hour cooldown";
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

export default function WebDisasterReport() {
  // Use the same locally bundled Inter font family as the Donations module.
  useFonts({
    EmergencyInter:Inter_400Regular,
    EmergencyInterMedium:Inter_500Medium,
    EmergencyInterSemiBold:Inter_600SemiBold,
    EmergencyInterBold:Inter_700Bold,
    EmergencyInterExtraBold:Inter_800ExtraBold,
  });
  const { user, profile, loading } = useUserSession();
  const profileData: any = profile || {};

  const identityVerified =
    profileData.identityVerified === true ||
    profileData.identityStatus === "verified";

  const reporterLabel =
    identityVerified
      ? "Verified Resident"
      : "Basic Account · Unverified Reporter";

  const [pin, setPin] = useState<Pin | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [assistanceTypes, setAssistanceTypes] = useState<string[]>([]);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [progress, setProgress] = useState("");
  const [success, setSuccess] = useState("");
  const [duplicateBlock, setDuplicateBlock] = useState<DuplicateBlock | null>(null);

  const frame = useRef<HTMLIFrameElement>(null);
  const lock = useRef(false);
  const pinRef = useRef<Pin | null>(null);

  const attempt = useRef<{
    id: string;
    uid: string;
  } | null>(null);

  const uploads = useRef(new Map<File, Attachment>());

  useEffect(() => {
    const urls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoFiles]);

  const selectPin = (
    lat: number,
    lng: number,
    accuracy: number | null = null
  ) => {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return;
    }

    const selected = {
      latitude: lat,
      longitude: lng,
      accuracy,
    };

    pinRef.current = selected;
    setPin(selected);
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));

    frame.current?.contentWindow?.postMessage(
      { kind: "set-pin", ...selected },
      "*"
    );
  };

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        lock.current
      ) {
        return;
      }

      const data = event.data;

      if (data?.kind === "report-pin") {
        selectPin(data.latitude, data.longitude);
      }

      if (
        data?.kind === "report-map-ready" &&
        pinRef.current
      ) {
        frame.current?.contentWindow?.postMessage(
          { kind: "set-pin", ...pinRef.current },
          "*"
        );
      }
    };

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const locate = () => {
    if (!navigator.geolocation) {
      setError(
        "GPS is unavailable. Select the incident location on the map or enter coordinates manually."
      );
      return;
    }

    setLocating(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!lock.current) {
          selectPin(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy
          );
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(
          "Location permission was denied or GPS is unavailable. Click the exact incident location on the map instead."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const uploadEvidence = async (
    caseId: string,
    uid: string,
    files: File[]
  ): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const kind = evidenceType(file);

      setProgress(
        `Uploading ${kind === "image" ? "photo" : "video"} ${index + 1} of ${files.length}…`
      );

      let attachment = uploads.current.get(file);

      if (!attachment) {
        const body = new FormData();
        body.append("file", file);
        body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(CLOUDINARY_UPLOAD_URL, {
          method: "POST",
          body,
        });

        const result = await response.json().catch(() => null);

        if (
          !response.ok ||
          !result ||
          typeof result.secure_url !== "string" ||
          typeof result.public_id !== "string"
        ) {
          const message =
            result?.error?.message ||
            `Cloudinary upload failed with HTTP ${response.status}.`;

          const uploadError = new Error(message) as Error & {
            code?: string;
          };

          uploadError.code = "cloudinary/upload-failed";
          throw uploadError;
        }

        attachment = {
          path: result.public_id,
          url: result.secure_url,
          type: kind,
          name: file.name,
          contentType: file.type,
          sizeBytes:
            typeof result.bytes === "number"
              ? result.bytes
              : file.size,
          provider: "cloudinary",
          publicId: result.public_id,
          assetId:
            typeof result.asset_id === "string"
              ? result.asset_id
              : undefined,
          resourceType:
            typeof result.resource_type === "string"
              ? result.resource_type
              : kind,
        };

        uploads.current.set(file, attachment);
      }

      attachments.push(attachment);
    }

    return attachments;
  };

  const submit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (lock.current) return;
    setError("");

    if (!user || !profile || !isApprovedProfile(profile)) {
      setError(
        "Sign in with your VolunServe account before submitting an emergency report."
      );
      return;
    }

    if (!pin) {
      setError(
        "Select the exact incident location on the map or use GPS first."
      );
      return;
    }

    if (photoFiles.length === 0) {
      setError(
        "At least one incident photo is required so Admin can verify the request before dispatch."
      );
      return;
    }

    if (assistanceTypes.length === 0) {
      setError("Select at least one type of help needed.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const value = (key: string) =>
      String(form.get(key) || "").trim();

    const affectedPeople = Number(value("affectedPeople"));
    const category = value("category");

    if (
      category.length < 2 ||
      value("details").length < 10 ||
      value("location").length < 3 ||
      !Number.isInteger(affectedPeople) ||
      affectedPeople < 1
    ) {
      setError(
        "Complete the incident details, exact address, and number of affected people."
      );
      return;
    }

    if (value("confirmation") !== "confirmed") {
      setError(
        "Confirm that the information and evidence are accurate and may be shared with Admin and the assigned responder."
      );
      return;
    }

    const contactNumber =
      safeText(
        profileData.phoneNumber ||
          profileData.phone ||
          user.phoneNumber ||
          "",
        30
      );

    if (contactNumber.length < 8) {
      setError(
        "Your account has no saved contact number. Update it in Account Settings before requesting assistance."
      );
      return;
    }

    const otherAssistance = value("otherAssistance");

    if (
      assistanceTypes.includes("Other") &&
      otherAssistance.length < 2
    ) {
      setError("Briefly describe the other assistance needed.");
      return;
    }

    const finalAssistanceTypes = assistanceTypes.map((item) =>
      item === "Other"
        ? `Other: ${otherAssistance}`
        : item
    );

    const finalRequiredSkills =
      deriveRequiredSkills(finalAssistanceTypes);

    /*
     * Current Firestore schema still requires neededGoods.
     * Emergency reporting intentionally does not ask the resident
     * for a detailed goods/material list. Admin can assess that later.
     */
    const finalNeededGoods = [
      "To Be Assessed By Admin",
    ];

    const needsSummary = [
      `Help: ${finalAssistanceTypes.join(", ")}`,
      `Skills: ${finalRequiredSkills.join(", ")}`,
      value("needsNote")
        ? `Notes: ${value("needsNote")}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 2500);

    lock.current = true;
    setBusy(true);
    setDuplicateBlock(null);

    // Anti-duplicate guard: do this BEFORE uploading evidence so the resident
    // does not waste time/data on a report that should reuse an existing case.
    try {
      setProgress("Checking for an existing emergency report…");

      const existingSnapshot = await getDocs(
        query(
          collection(db, "disasterCases"),
          where("reporterUid", "==", user.uid)
        )
      );

      const now = Date.now();
      const currentAddress = normalizeIncidentText(value("location"));
      let block: DuplicateBlock | null = null;

      for (const existingDoc of existingSnapshot.docs) {
        const data: any = existingDoc.data();
        const existingCategory = normalizeIncidentText(data.category);
        if (existingCategory !== normalizeIncidentText(category)) continue;

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
        setDuplicateBlock(block);
        setError(
          block.reason === "active"
            ? `You already have an active ${block.category} report for this area. Use the existing case instead of creating a duplicate.`
            : `A similar ${block.category} report in this area is still within the ${DUPLICATE_COOLDOWN_LABEL} (${formatRemainingCooldown(block.remainingMs)} remaining).`
        );
        setProgress("");
        lock.current = false;
        setBusy(false);
        return;
      }
    } catch (duplicateCheckError) {
      console.error("duplicate emergency check", duplicateCheckError);
      setError(
        "VolunServe could not verify duplicate-report protection right now. Please check your connection and try again before submitting."
      );
      setProgress("");
      lock.current = false;
      setBusy(false);
      return;
    }

    if (
      !attempt.current ||
      attempt.current.uid !== user.uid
    ) {
      attempt.current = {
        id: doc(collection(db, "disasterCases")).id,
        uid: user.uid,
      };
      uploads.current.clear();
    }

    const caseId = attempt.current.id;
    const caseRef = doc(db, "disasterCases", caseId);

    try {
      const evidenceFiles = [
        ...photoFiles,
        ...(videoFile ? [videoFile] : []),
      ];

      const attachments = await uploadEvidence(
        caseId,
        user.uid,
        evidenceFiles
      );

      setProgress("Saving request for Admin verification…");

      await setDoc(caseRef, {
        reporterUid: user.uid,
        reporterName:
          safeText(
            profileData.fullName ||
              user.displayName ||
              "Resident",
            120
          ),
        reporterEmail:
          safeText(user.email || "", 160),
        reporterBarangay:
          safeText(profileData.barangay || "", 120),
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
            profileData.reporterProfilePictureUrl ||
              profileData.profilePictureUrl ||
              profileData.profilePhotoUrl ||
              profileData.photoURL ||
              user.photoURL ||
              "",
            2048
          ),

        source: "resident_emergency_assistance",
        requestKind: "emergency_assistance",

        title:
          `${category} emergency report`.slice(0, 120),
        category,
        severity: value("severity"),

        // Keep the existing operational case pipeline compatible.
        status: "reported",

        // Separate verification state prevents automatic dispatch.
        verificationStatus: "pending_verification",
        evidenceReviewStatus: "pending_review",

        location: value("location"),
        latitude: pin.latitude,
        longitude: pin.longitude,
        gpsAccuracyMeters: pin.accuracy,
        locationCapturedAt: serverTimestamp(),

        details: value("details"),
        affectedPeople,

        assistanceTypes: finalAssistanceTypes,
        requiredSkills: finalRequiredSkills,
        neededGoods: finalNeededGoods,
        needsNote: value("needsNote"),

        // Legacy summary retained for current Admin/Volunteer UI compatibility.
        needs: needsSummary,

        attachments,
        photoEvidenceCount: photoFiles.length,
        videoEvidenceCount: videoFile ? 1 : 0,

        verification: {
          accountApproved: true,
          reporterTrust:
            identityVerified
              ? "verified_resident"
              : "basic_account",
          identityVerified,
          identityStatus:
            profileData.identityStatus || "basic",
          emailVerified: Boolean(user.emailVerified),
          phoneOnFile: Boolean(contactNumber),
          gpsProvided: true,
          photoEvidenceProvided: photoFiles.length > 0,
          videoEvidenceProvided: Boolean(videoFile),
          duplicateCheckStatus: "pending_admin_review",
          locationCheckStatus: "pending_admin_review",
        },

        residentConfirmationAccepted: true,
        residentConfirmationAt: serverTimestamp(),
        privacyScope: "admin_and_assigned_responder",

        requiredVolunteers: 0,
        assignedVolunteersCount: 0,
        assignedVolunteerIds: [],
        adminNote: "",

        validatedAt: null,
        validatedBy: null,
        assignedAt: null,
        resolvedAt: null,
        closedAt: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccess(caseId);
    } catch (cause) {
      try {
        const saved = await getDocFromServer(caseRef);

        if (
          saved.exists() &&
          saved.data().reporterUid === user.uid
        ) {
          setSuccess(caseId);
          return;
        }
      } catch {
        // Keep the original submission error.
      }

      const code =
        (cause as { code?: string }).code || "unknown";

      setError(
        code.includes("cloudinary")
          ? "Evidence upload failed. Check the Cloudinary upload preset and your internet connection. Your form is retained."
          : code.includes("permission") ||
              code.includes("unauthorized")
            ? "Submission was blocked. Check the deployed Firestore rules. Your form is retained."
            : `Could not confirm submission (${code}). Check your connection and retry; the same request ID will be used.`
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress("");
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        Loading your account…
      </div>
    );
  }

  return (
    <main className="vs-report">
      <style>{css}</style>

      <header className="page-head premium-head emergency-hero">
        <div className="emergency-hero-content">
          <div className="emergency-hero-icon" aria-hidden="true">
            <div className="emergency-hero-icon-fill">
              <svg viewBox="0 0 80 80" fill="none" focusable="false">
                <path d="M22 56h36M27 55v-9a13 13 0 0 1 26 0v9M25 63h30"
                  stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M40 22v-7M19 30l-5-5M61 30l5-5"
                  stroke="#FFD1A5" strokeWidth="4.5" strokeLinecap="round"/>
                <path d="M40 40v8" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round"/>
                <circle cx="40" cy="53" r="2.3" fill="#FFD1A5"/>
              </svg>
            </div>
          </div>
          <div className="emergency-hero-copy">
            <span className="eyebrow">VOLUNSERVE · EMERGENCY RESPONSE</span>
            <h1>Report an Emergency</h1>
            <strong className="emergency-hero-tagline">Report clearly. Respond together.</strong>
            <p>Share incident details, the exact location, and supporting evidence for coordinated LGU response.</p>
          </div>
        </div>
        <div className="emergency-review-card">
          <span className="emergency-review-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 2l8 3v6c0 5-3.2 8.5-8 11-4.8-2.5-8-6-8-11V5l8-3Z"
                fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
              <path d="m8.4 12 2.4 2.4 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="emergency-review-copy">
            <strong>LGU response verification</strong>
            <span>Reports are reviewed for urgency, location and evidence before responder coordination.</span>
          </span>
        </div>
      </header>

      <EmergencyResponseQuickActions residentUid={user && isApprovedProfile(profile) ? user.uid : ""} />
      {user && isApprovedProfile(profile) && <VerifiedEvacuationCenters />}

      {!success && user && isApprovedProfile(profile) && (
        <section className="workflow-strip" aria-label="Emergency report workflow">
          <div className="workflow-step active">
            <i>1</i>
            <span><strong>Emergency details</strong><small>Type, urgency, situation</small></span>
          </div>
          <div className="workflow-line" />
          <div className="workflow-step">
            <i>2</i>
            <span><strong>Location & evidence</strong><small>GPS, photo, optional video</small></span>
          </div>
          <div className="workflow-line" />
          <div className="workflow-step">
            <i>3</i>
            <span><strong>Review & submit</strong><small>Confirm accurate information</small></span>
          </div>
        </section>
      )}

      {success ? (
        <section className="card success-card" role="status">
          <div className="success-icon">✓</div>
          <div>
            <h2>Emergency report received</h2>
            <p>
              The LGU can now review your severity, exact location, and evidence.
              Keep the same case for updates and live tracking instead of submitting
              a duplicate report.
            </p>
            <p>
              Reference: <strong>{success}</strong>
            </p>
            <div className="success-actions">
              <a href={`/disaster-response?view=tracking&caseId=${encodeURIComponent(success)}`}>Track response</a>
              <a href="/my-cases" className="secondary-link">View My Reports</a>
            </div>
          </div>
        </section>
      ) : !user || !isApprovedProfile(profile) ? (
        <section className="card">
          <h2>Sign in required</h2>
          <p>
            Basic Accounts and Verified Residents can submit emergency reports.
            Sign in with your VolunServe account to continue.
          </p>
          <a href="/login">Go to sign in</a>
        </section>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <section className="resident-summary">
              <div>
                <span className="summary-label">REQUESTING RESIDENT</span>
                <strong>
                  {profileData.fullName || user.displayName || "Resident"}
                </strong>
                <span className="summary-trust">{reporterLabel}</span>
              </div>
              <div>
                <span className="summary-label">CONTACT</span>
                <strong>
                  {profileData.phoneNumber ||
                    profileData.phone ||
                    "Not set"}
                </strong>
              </div>
              <div>
                <span className="summary-label">ACCOUNT BARANGAY</span>
                <strong>{profileData.barangay || "Not set"}</strong>
              </div>
              <a href="/profile">Account Settings</a>
            </section>

            <div className="grid">
              <section className="card">
                <h2>
                  <span>01</span> Emergency details
                </h2>

                <div className="pair">
                  <label>
                    Incident / request type
                    <select
                      name="category"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select type
                      </option>
                      {categoryOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="severity-field">
                    <span className="field-title">How urgent does it feel?</span>
                    <div className="severity-grid">
                      <label className="severity-option critical">
                        <input type="radio" name="severity" value="critical" />
                        <span><strong>Critical</strong><small>Immediate threat to life or safety</small></span>
                      </label>
                      <label className="severity-option urgent">
                        <input type="radio" name="severity" value="medium" defaultChecked />
                        <span><strong>Urgent</strong><small>Serious and needs quick response</small></span>
                      </label>
                      <label className="severity-option high">
                        <input type="radio" name="severity" value="high" />
                        <span><strong>High</strong><small>Important and time-sensitive</small></span>
                      </label>
                      <label className="severity-option standard">
                        <input type="radio" name="severity" value="low" />
                        <span><strong>Standard</strong><small>Non-critical response need</small></span>
                      </label>
                    </div>
                    <small className="field-hint">
                      The LGU verifies the final operational priority.
                    </small>
                  </div>
                </div>

                <label>
                  Number of people affected
                  <input
                    name="affectedPeople"
                    type="number"
                    min="1"
                    step="1"
                    required
                    defaultValue="1"
                  />
                </label>

                <label>
                  Situation details
                  <textarea
                    name="details"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={5}
                    placeholder="Describe what is happening, who is affected, and any immediate safety concern."
                  />
                </label>
              </section>

              <section className="card">
                <h2>
                  <span>02</span> Exact response location
                </h2>
                <p className="section-copy">
                  Use GPS or select the exact incident point. Exact coordinates stay
                  private to the LGU and the authorized responder for this case.
                </p>

                <button
                  type="button"
                  className="secondary"
                  onClick={locate}
                  disabled={locating}
                >
                  {locating
                    ? "Finding your location…"
                    : "Use my current GPS location"}
                </button>

                <iframe
                  ref={frame}
                  title="Select exact assistance location"
                  srcDoc={mapDocument}
                  sandbox="allow-scripts allow-popups"
                  style={{
                    pointerEvents: busy ? "none" : "auto",
                  }}
                />

                <p
                  className="pin-status"
                  aria-live="polite"
                >
                  {pin
                    ? `Location selected: ${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}${
                        pin.accuracy !== null
                          ? ` · GPS accuracy ±${Math.round(pin.accuracy)} m`
                          : ""
                      }`
                    : "No exact location selected yet."}
                </p>

                <details>
                  <summary>Enter coordinates manually</summary>

                  <div className="pair">
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={latitude}
                        onChange={(e) =>
                          setLatitude(e.target.value)
                        }
                      />
                    </label>

                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={longitude}
                        onChange={(e) =>
                          setLongitude(e.target.value)
                        }
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    className="secondary compact-btn"
                    onClick={() => {
                      const lat = Number(latitude);
                      const lng = Number(longitude);

                      if (
                        !latitude ||
                        !longitude ||
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lng) ||
                        Math.abs(lat) > 90 ||
                        Math.abs(lng) > 180
                      ) {
                        setError(
                          "Enter valid latitude and longitude."
                        );
                      } else {
                        selectPin(lat, lng);
                        setError("");
                      }
                    }}
                  >
                    Apply coordinates
                  </button>
                </details>

                <label>
                  Exact address / barangay / landmark
                  <input
                    name="location"
                    required
                    minLength={3}
                    maxLength={240}
                    placeholder="Example: Block 4, Brgy. Muzon, near ..."
                  />
                </label>
              </section>
            </div>

            <section className="card help-card">
              <h2>
                <span>03</span> Response needs
              </h2>

              <div className="help-grid">
                <div>
                  <h3>Assistance type</h3>
                  <p>Select everything that applies.</p>
                  <div className="chip-grid">
                    {assistanceOptions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={
                          assistanceTypes.includes(item)
                            ? "choice active"
                            : "choice"
                        }
                        aria-pressed={assistanceTypes.includes(item)}
                        onClick={() =>
                          toggleValue(
                            assistanceTypes,
                            item,
                            setAssistanceTypes
                          )
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  {assistanceTypes.includes("Other") && (
                    <label>
                      Other assistance
                      <input
                        name="otherAssistance"
                        maxLength={150}
                        placeholder="Describe the help needed"
                      />
                    </label>
                  )}
                </div>

                <div className="auto-match-card">
                  <h3>Responder matching</h3>
                  <p>
                    VolunServe derives the responder skills from the help
                    you select. Admin reviews the final responder requirements.
                  </p>
                  <strong>
                    {deriveRequiredSkills(assistanceTypes).join(" · ")}
                  </strong>
                  <span>
                    Detailed goods or materials are assessed by Admin after
                    reviewing the emergency.
                  </span>
                </div>
              </div>

              <label>
                Additional response instructions
                <textarea
                  name="needsNote"
                  maxLength={1500}
                  rows={3}
                  placeholder="Example: Two senior citizens are inside; road access is narrow."
                />
              </label>
            </section>

            <section className="card evidence">
              <div className="evidence-head">
                <div>
                  <h2>
                    <span>04</span> Verification evidence
                  </h2>
                  <p>
                    Evidence is reviewed by Admin before a responder
                    can be assigned.
                  </p>
                </div>
                <div className="required-pill">
                  PHOTO REQUIRED
                </div>
              </div>

              <div className="evidence-grid">
                <div className="upload-box">
                  <h3>Incident photos</h3>
                  <p>
                    Required · up to 5 JPG, PNG or WebP photos ·
                    under 10 MB each. You can add photos one at a time.
                  </p>

                  <input
                    aria-label="Attach incident photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    required={photoFiles.length === 0}
                    onChange={(e) => {
                      const selected = Array.from(
                        e.target.files || []
                      );

                      const invalidFile = selected.some(
                        (file) =>
                          file.size >= 10 * 1024 * 1024 ||
                          ![
                            "image/jpeg",
                            "image/png",
                            "image/webp",
                          ].includes(file.type)
                      );

                      if (invalidFile) {
                        setError(
                          "Choose JPG, PNG or WebP photos under 10 MB each."
                        );
                        e.target.value = "";
                        return;
                      }

                      setPhotoFiles((current) => {
                        const combined = [...current];

                        selected.forEach((file) => {
                          const duplicate = combined.some(
                            (existing) =>
                              existing.name === file.name &&
                              existing.size === file.size &&
                              existing.lastModified === file.lastModified
                          );

                          if (!duplicate && combined.length < 5) {
                            combined.push(file);
                          }
                        });

                        if (
                          current.length + selected.length > 5 ||
                          combined.length >= 5 &&
                          current.length + selected.length > combined.length
                        ) {
                          setError(
                            "Maximum of 5 incident photos only."
                          );
                        } else {
                          setError("");
                        }

                        return combined;
                      });

                      // Reset so the user can add more photos one-by-one.
                      e.target.value = "";
                    }}
                  />

                  {photoFiles.length === 0 ? (
                    <div className="file-empty">
                      No photo selected yet.
                    </div>
                  ) : (
                    <div className="photo-preview-grid">
                      {photoFiles.map((file, index) => (
                        <div
                          className="photo-preview-card"
                          key={`${file.name}-${index}`}
                        >
                          {photoPreviews[index] ? (
                            <img
                              src={photoPreviews[index]}
                              alt={`Selected incident evidence ${index + 1}`}
                              className="photo-preview-image"
                            />
                          ) : (
                            <div className="photo-preview-loading">
                              Loading preview…
                            </div>
                          )}

                          <div className="photo-preview-meta">
                            <div>
                              <strong>{file.name}</strong>
                              <span>
                                {(file.size / 1024 / 1024).toFixed(1)} MB
                              </span>
                            </div>

                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                setPhotoFiles(
                                  photoFiles.filter(
                                    (_, fileIndex) =>
                                      fileIndex !== index
                                  )
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="upload-box">
                  <h3>Video evidence <span className="optional-mark">Optional</span></h3>
                  <p>
                    One MP4, WebM or MOV video · under 50 MB.
                  </p>

                  <input
                    aria-label="Attach optional incident video"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => {
                      const selected =
                        e.target.files?.[0] || null;

                      if (!selected) {
                        setVideoFile(null);
                        return;
                      }

                      if (
                        selected.size >= 50 * 1024 * 1024 ||
                        ![
                          "video/mp4",
                          "video/webm",
                          "video/quicktime",
                        ].includes(selected.type)
                      ) {
                        setError(
                          "Choose one MP4, WebM or MOV video under 50 MB."
                        );
                        e.target.value = "";
                        setVideoFile(null);
                        return;
                      }

                      setVideoFile(selected);
                      setError("");
                    }}
                  />

                  {videoFile ? (
                    <div className="file">
                      <span>
                        {videoFile.name} · 
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setVideoFile(null)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="file-empty">
                      No video selected.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="card confirmation-card">
              <h2>
                <span>05</span> Review & confirm
              </h2>

              <label className="confirm-row">
                <input
                  type="checkbox"
                  name="confirmation"
                  value="confirmed"
                  required
                />
                <span>
                  I confirm that this request and the attached evidence
                  are accurate to the best of my knowledge. I understand
                  that the exact location and necessary contact details
                  may be shown only to authorized Admins and the responder
                  assigned to this case.
                </span>
              </label>

              <div className="privacy-note">
                Your exact location is not intended for public display.
                It is used for verification and response coordination.
                Live resident tracking, when available for lost or stranded
                cases, is optional and must be started by the resident.
              </div>
            </section>
          </fieldset>

          {duplicateBlock && (
            <div className="duplicate-guard" role="alert">
              <div>
                <strong>Existing emergency protected from duplicates</strong>
                <span>
                  {duplicateBlock.reason === "active"
                    ? "This incident already has an active case. Continue using the same case for updates and live response tracking."
                    : `A similar incident is in its ${DUPLICATE_COOLDOWN_LABEL}. Try again after ${formatRemainingCooldown(duplicateBlock.remainingMs)} if this is still the same incident.`}
                </span>
              </div>
              <div className="duplicate-actions">
                <a href="/my-cases">View existing report</a>
                {duplicateBlock.reason === "active" && (
                  <a
                    href={`/disaster-response?view=tracking&caseId=${encodeURIComponent(duplicateBlock.caseId)}`}
                    className="duplicate-track"
                  >
                    Track response
                  </a>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <footer>
            <div>
              <strong>Submit emergency report</strong>
              <p aria-live="polite">
                {progress ||
                  `LGU review protects against duplicate or unreliable reports. ${DUPLICATE_COOLDOWN_LABEL} applies to similar completed incidents.`}
              </p>
            </div>

            <button
              disabled={busy || locating}
              type="submit"
            >
              {busy
                ? "Submitting…"
                : "Submit Emergency Report →"}
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}

const css = `
.premium-head {
  align-items: stretch;
}
.workflow-strip {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: center;
  gap: 14px;
  margin: 0 0 18px;
  padding: 15px 18px;
  background: rgba(255,255,255,.92);
  border: 1px solid #d9e6ea;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, .045);
}
.workflow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #60758a;
  min-width: 0;
}
.workflow-step i {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-style: normal;
  font-weight: 900;
  background: #edf3f6;
  color: #496075;
}
.workflow-step.active i {
  background: #0f766e;
  color: white;
}
.workflow-step strong, .workflow-step small { display:block; }
.workflow-step strong { color:#102a43; font-size:12px; letter-spacing:.01em; }
.workflow-step small { margin-top:2px; font-size:10px; color:#7b8da0; }
.workflow-line { height:1px; background:#d9e3e8; min-width:32px; }
.severity-field { display:flex; flex-direction:column; gap:8px; }
.field-title { font-weight:800; color:#102a43; font-size:13px; }
.severity-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.severity-option { cursor:pointer; }
.severity-option input { position:absolute; opacity:0; pointer-events:none; }
.severity-option > span {
  display:block;
  min-height:66px;
  padding:10px 12px;
  border:1px solid #d8e3e9;
  border-radius:12px;
  background:#fff;
  transition:.16s ease;
}
.severity-option strong, .severity-option small { display:block; }
.severity-option strong { font-size:13px; color:#17324a; }
.severity-option small { margin-top:4px; font-size:10px; line-height:1.35; color:#708399; }
.severity-option input:checked + span { box-shadow:0 0 0 2px rgba(15,118,110,.12); transform:translateY(-1px); }
.severity-option.critical input:checked + span { border-color:#ef4444; background:#fff5f5; }
.severity-option.critical input:checked + span strong { color:#c62828; }
.severity-option.urgent input:checked + span { border-color:#f59e0b; background:#fff9ed; }
.severity-option.urgent input:checked + span strong { color:#b76a00; }
.severity-option.high input:checked + span { border-color:#eab308; background:#fffceb; }
.severity-option.high input:checked + span strong { color:#8a6a00; }
.severity-option.standard input:checked + span { border-color:#3b82f6; background:#f3f8ff; }
.severity-option.standard input:checked + span strong { color:#1d5fbf; }
.required-mark, .optional-mark {
  display:inline-flex; margin-left:6px; padding:2px 7px; border-radius:999px; font-size:9px; letter-spacing:.04em; vertical-align:middle;
}
.required-mark { color:#b91c1c; background:#fff1f2; }
.optional-mark { color:#456078; background:#eef4f7; }
.success-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
.success-actions a { display:inline-flex; align-items:center; justify-content:center; padding:10px 14px; border-radius:10px; text-decoration:none; font-weight:800; background:#0f766e; color:white; }
.success-actions a.secondary-link { background:#f5f8fa; color:#18354f; border:1px solid #d8e3e9; }
@media (max-width: 900px) {
  .workflow-strip { grid-template-columns:1fr; gap:8px; }
  .workflow-line { display:none; }
  .severity-grid { grid-template-columns:1fr; }
}
.vs-report {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  min-height: 0;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: scroll;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: #94a3b8 #e8eef2;
  background: #f4f7fa;
  color: #102a3a;
  padding: 28px;
  padding-right: 20px;
  font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.vs-report::-webkit-scrollbar {
  width: 12px;
}

.vs-report::-webkit-scrollbar-track {
  background: #e8eef2;
  border-radius: 999px;
}

.vs-report::-webkit-scrollbar-thumb {
  background: #94a3b8;
  border: 3px solid #e8eef2;
  border-radius: 999px;
}

.vs-report::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}
.vs-report * { box-sizing: border-box; }
.vs-report header,
.vs-report form,
.vs-report > section {
  max-width: 1180px;
  margin-left: auto;
  margin-right: auto;
}
.vs-report .page-head {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.vs-report .eyebrow {
  font-size: 10px;
  letter-spacing: 1.4px;
  font-weight: 900;
  color: #07857c;
}
.vs-report h1 {
  font-size: 31px;
  letter-spacing: -.8px;
  line-height: 1.12;
  margin: 7px 0 5px;
}
.vs-report p {
  color: #627785;
  margin: 7px 0 14px;
}
.vs-report .verification-badge {
  width: 290px;
  flex: 0 0 auto;
  padding: 13px 15px;
  border: 1px solid #cde4df;
  border-radius: 13px;
  background: #edf9f6;
}
.vs-report .verification-badge strong,
.vs-report .verification-badge span {
  display: block;
}
.vs-report .verification-badge strong {
  color: #08786f;
  font-size: 12px;
}
.vs-report .verification-badge span {
  margin-top: 3px;
  color: #5d746f;
  font-size: 10.5px;
  line-height: 1.4;
}
.vs-report fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.vs-report .resident-summary {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #dce5ea;
  border-radius: 14px;
  background: #fff;
}
.vs-report .resident-summary > div {
  min-width: 0;
}
.vs-report .resident-summary strong {
  display: block;
  margin-top: 2px;
  overflow-wrap: anywhere;
  font-size: 11.5px;
}
.vs-report .summary-trust {
  display: block;
  margin-top: 3px;
  color: #07857c;
  font-size: 9px;
  font-weight: 800;
}

.vs-report .summary-label {
  color: #91a1ad;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .8px;
}
.vs-report .resident-summary a {
  white-space: nowrap;
  font-weight: 800;
  font-size: 11px;
}
.vs-report .grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.vs-report .card {
  background: #fff;
  border: 1px solid #dce5ea;
  border-radius: 16px;
  padding: 21px;
  box-shadow: 0 8px 24px rgba(17, 50, 67, .035);
}
.vs-report h2 {
  font-size: 17px;
  margin: 0 0 14px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.vs-report h2 span {
  background: #e4f5f1;
  border-radius: 8px;
  padding: 6px 7px;
  color: #07857c;
  font-size: 10px;
}
.vs-report h3 {
  margin: 0;
  color: #173748;
  font-size: 12.5px;
}
.vs-report label {
  display: block;
  font-size: 11.5px;
  font-weight: 750;
  margin: 13px 0 0;
}
.vs-report input:not([type=file]):not([type=checkbox]),
.vs-report select,
.vs-report textarea {
  display: block;
  width: 100%;
  border: 1px solid #cdd9e0;
  border-radius: 9px;
  padding: 10px 11px;
  margin-top: 5px;
  background: #fff;
  color: #142c3d;
  font: inherit;
}
.vs-report textarea { resize: vertical; }
.vs-report .field-hint {
  display: block;
  margin-top: 5px;
  color: #6b7f8b;
  font-size: 9.5px;
  font-weight: 600;
}
.vs-report :is(input,select,textarea,button,a):focus-visible {
  outline: 3px solid #65c7bd;
  outline-offset: 2px;
}
.vs-report .pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
}
.vs-report button {
  cursor: pointer;
  background: #087f78;
  border: 0;
  border-radius: 9px;
  padding: 10px 16px;
  color: white;
  font: 750 12px system-ui;
}
.vs-report button:disabled {
  opacity: .6;
  cursor: wait;
}
.vs-report .secondary {
  background: #eef8f6;
  color: #096c66;
  border: 1px solid #c8e4df;
  padding: 8px 10px;
}
.vs-report .compact-btn { margin-top: 9px; }
.vs-report iframe {
  border: 1px solid #d4e0e7;
  border-radius: 11px;
  width: 100%;
  height: 260px;
  margin-top: 11px;
}
.vs-report .section-copy {
  font-size: 11.5px;
  margin-top: -5px;
}
.vs-report .pin-status {
  font-size: 10.5px;
  margin: 6px 0;
}
.vs-report summary {
  cursor: pointer;
  color: #087f78;
  font-size: 11.5px;
  font-weight: 700;
}
.vs-report .help-card,
.vs-report .evidence,
.vs-report .confirmation-card {
  margin-top: 16px;
}
.vs-report .help-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.vs-report .auto-match-card {
  border: 1px solid #cde4df;
  border-radius: 12px;
  background: #edf9f6;
  padding: 14px;
}
.vs-report .auto-match-card strong,
.vs-report .auto-match-card span {
  display: block;
}
.vs-report .auto-match-card strong {
  margin-top: 10px;
  color: #08786f;
  font-size: 11px;
  line-height: 1.55;
}
.vs-report .auto-match-card span {
  margin-top: 8px;
  color: #607481;
  font-size: 10px;
  line-height: 1.5;
}

.vs-report .help-grid p,
.vs-report .goods-block p {
  font-size: 10.5px;
  margin: 3px 0 9px;
}
.vs-report .goods-block {
  border-top: 1px solid #edf1f4;
  margin-top: 18px;
  padding-top: 16px;
}
.vs-report .chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.vs-report .choice {
  background: #f7fafb;
  color: #456171;
  border: 1px solid #d8e2e7;
  padding: 7px 9px;
  font-size: 10px;
}
.vs-report .choice.active {
  background: #e4f5f1;
  border-color: #74c7bd;
  color: #06756d;
}
.vs-report .evidence-head {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  align-items: flex-start;
}
.vs-report .evidence-head p {
  margin-top: -7px;
  font-size: 10.5px;
}
.vs-report .required-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 6px 9px;
  background: #fff1f0;
  color: #b42318;
  font-size: 8.5px;
  font-weight: 900;
  letter-spacing: .6px;
}
.vs-report .evidence-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.vs-report .upload-box {
  border: 1px solid #e0e7eb;
  background: #fafcfd;
  border-radius: 12px;
  padding: 14px;
}
.vs-report .upload-box p {
  font-size: 10.5px;
  margin: 4px 0 10px;
}
.vs-report input[type=file] {
  width: 100%;
  font-size: 10px;
}
.vs-report .photo-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.vs-report .photo-preview-card {
  overflow: hidden;
  border: 1px solid #dbe5ea;
  border-radius: 12px;
  background: #fff;
}

.vs-report .photo-preview-image {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: cover;
  background: #eef3f6;
}

.vs-report .photo-preview-loading {
  height: 150px;
  display: grid;
  place-items: center;
  background: #eef3f6;
  color: #7b8f9a;
  font-size: 10px;
}

.vs-report .photo-preview-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 9px;
}

.vs-report .photo-preview-meta > div {
  min-width: 0;
}

.vs-report .photo-preview-meta strong,
.vs-report .photo-preview-meta span {
  display: block;
}

.vs-report .photo-preview-meta strong {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #173748;
  font-size: 9.5px;
}

.vs-report .photo-preview-meta span {
  margin-top: 2px;
  color: #91a1ad;
  font-size: 9px;
}

.vs-report .file {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 9px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e8edef;
  overflow-wrap: anywhere;
  font-size: 10px;
}
.vs-report .file-empty {
  margin-top: 9px;
  color: #91a1ad;
  font-size: 10px;
}
.vs-report .confirm-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
  font-weight: 500;
  line-height: 1.55;
}
.vs-report .confirm-row input {
  margin-top: 3px;
  flex: 0 0 auto;
}
.vs-report .privacy-note {
  margin-top: 12px;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f4f8fa;
  color: #607481;
  font-size: 10.5px;
}
.vs-report .duplicate-guard {
  margin: 16px 0 0;
  padding: 16px 18px;
  border: 1px solid #f2c66d;
  border-radius: 14px;
  background: #fffaf0;
  color: #5f4307;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.vs-report .duplicate-guard > div:first-child {
  display: grid;
  gap: 4px;
}

.vs-report .duplicate-guard strong {
  color: #513600;
  font-size: 14px;
}

.vs-report .duplicate-guard span {
  font-size: 13px;
  line-height: 1.55;
}

.vs-report .duplicate-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.vs-report .duplicate-actions a {
  text-decoration: none;
  border: 1px solid #d8aa49;
  color: #634600;
  background: #ffffff;
  border-radius: 10px;
  padding: 9px 12px;
  font-weight: 800;
  font-size: 12px;
  white-space: nowrap;
}

.vs-report .duplicate-actions a.duplicate-track {
  background: #0f766e;
  border-color: #0f766e;
  color: #ffffff;
}

.vs-report .error {
  max-width: 1180px;
  margin: 14px auto 0;
  background: #fff0f0;
  border: 1px solid #edbbbb;
  padding: 13px 14px;
  border-radius: 10px;
  color: #9b2525;
  font-size: 11.5px;
}
.vs-report footer {
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 0 24px;
}
.vs-report footer strong {
  font-size: 12px;
}
.vs-report footer p {
  margin: 2px 0 0;
  font-size: 10.5px;
}
.vs-report a {
  color: #087f78;
}
.vs-report .success-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.vs-report .success-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #e4f5f1;
  color: #087f78;
  font-size: 20px;
  font-weight: 900;
}
@media(max-width: 900px) {
  .vs-report {
    padding: 20px;
    padding-right: 14px;
  }
  .vs-report .page-head {
    flex-direction: column;
  }
  .vs-report .verification-badge {
    width: 100%;
  }
  .vs-report .resident-summary {
    grid-template-columns: 1fr 1fr;
  }
  .vs-report .grid,
  .vs-report .help-grid,
  .vs-report .evidence-grid {
    grid-template-columns: 1fr;
  }
}
@media(max-width: 520px) {
  .vs-report { padding: 14px; }
  .vs-report .pair,
  .vs-report .resident-summary {
    grid-template-columns: 1fr;
  }
  .vs-report .card { padding: 16px; }
  .vs-report footer {
    align-items: stretch;
    flex-direction: column;
  }
  .vs-report footer button {
    width: 100%;
  }
  .vs-report h1 { font-size: 26px; }
}
/* Emergency Response · clean premium language with a distinct siren identity.
   Deliberately no photos, gradients over text, fictitious metrics or animations. */
.vs-report {
  background:#F4F8F7;
  color:#173D39;
  font-family:"EmergencyInter",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  line-height:1.55;
  scrollbar-color:#A9C6BA #E9F2EE;
}
.vs-report .emergency-hero {
  isolation:isolate;
  position:relative;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  min-height:176px;
  padding:24px 26px;
  margin-bottom:17px;
  overflow:hidden;
  border-radius:20px;
  border:1px solid #C6E8DC;
  background:
    radial-gradient(circle at 97% 8%,rgba(255,209,173,.41),transparent 23%),
    linear-gradient(100deg,#F3FFF9 0%,#EFFCF7 38%,#DBF5EB 69%,#99E0CB 100%);
  box-shadow:0 3px 15px rgba(14,91,66,.035);
}
.vs-report .emergency-hero::before {
  content:"";
  position:absolute;
  pointer-events:none;
  width:260px;height:260px;border-radius:50%;
  border:32px solid rgba(24,158,122,.055);
  right:-175px;top:-128px;
}
.vs-report .emergency-hero-content {
  display:flex;align-items:center;gap:24px;
  flex:1;min-width:0;position:relative;z-index:1;
}
.vs-report .emergency-hero-icon {
  width:112px;height:112px;flex:0 0 112px;
  padding:7px;
  background:#FFFFFF;border:1px solid rgba(255,255,255,.95);
  border-radius:25px;
  transform:rotate(-7deg);
  box-shadow:0 9px 20px rgba(4,86,64,.16);
}
.vs-report .emergency-hero-icon-fill {
  width:100%;height:100%;display:grid;place-items:center;
  border-radius:19px;
  background:linear-gradient(145deg,#075E53,#079879 68%,#14B78C);
}
.vs-report .emergency-hero-icon svg {width:76%;height:76%;display:block;}
.vs-report .emergency-hero-copy {min-width:0;max-width:500px;}
.vs-report .emergency-hero .eyebrow {
  display:block;
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:10px;font-weight:700;
  color:#078060;letter-spacing:1.05px;line-height:1.5;
}
.vs-report .emergency-hero h1 {
  font-family:"EmergencyInterExtraBold",Inter,sans-serif;
  font-size:35px;line-height:1.15;letter-spacing:-1.2px;
  color:#064A3B;margin:5px 0 7px;font-weight:800;
}
.vs-report .emergency-hero-tagline {
  display:block;
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:13px;color:#0F715A;line-height:1.5;
}
.vs-report .emergency-hero p {
  margin:6px 0 0;color:#4D786D;
  font-size:12px;line-height:1.65;max-width:510px;
  font-family:"EmergencyInter",Inter,sans-serif;
}
.vs-report .emergency-review-card {
  display:flex;align-items:flex-start;gap:11px;
  width:262px;flex:0 0 262px;
  padding:15px 15px 14px;
  border:1px solid rgba(217,238,228,.92);
  border-radius:14px;background:rgba(255,255,255,.91);
  box-shadow:0 3px 12px rgba(5,90,67,.045);
  position:relative;z-index:1;
}
.vs-report .emergency-review-icon {
  display:grid;place-items:center;
  width:38px;height:38px;flex:0 0 38px;
  border-radius:11px;background:#E4F8EF;color:#078E6C;
}
.vs-report .emergency-review-icon svg{width:22px;height:22px;}
.vs-report .emergency-review-copy{min-width:0;display:grid;gap:5px;}
.vs-report .emergency-review-copy strong {
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:11px;line-height:1.45;color:#164D3E;
}
.vs-report .emergency-review-copy span {
  font-size:10px;line-height:1.6;color:#648276;
}
.vs-report .workflow-strip {
  padding:15px 17px;
  border:1px solid #DCEAE3;
  border-radius:15px;
  margin-bottom:16px;
  box-shadow:none;
  background:#FFFFFF;
}
.vs-report .workflow-step.active i {background:#09896C;}
.vs-report .workflow-step strong {
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:11.5px;color:#1E4C42;
}
.vs-report .workflow-step small {font-size:10px;color:#7A9188;}
.vs-report .workflow-line{background:#DDEBE5;}
.vs-report .resident-summary {
  border:1px solid #DCEAE3;border-radius:14px;
  padding:15px 19px;margin-bottom:15px;
}
.vs-report .resident-summary strong {
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:11.5px;color:#17483B;
}
.vs-report .summary-label{color:#779489;letter-spacing:1px;}
.vs-report .summary-trust{color:#078568;}
.vs-report .card {
  border:1px solid #DDEAE3;
  border-radius:16px;
  padding:22px;
  box-shadow:0 2px 12px rgba(13,77,60,.025);
}
.vs-report .grid{gap:14px;}
.vs-report h2{
  color:#163E36;font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:16px;line-height:1.4;letter-spacing:-.3px;
  margin-bottom:16px;
}
.vs-report h2 span {
  border-radius:9px;background:#E0F6ED;color:#078367;
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:11px;letter-spacing:.02em;padding:7px 9px;
}
.vs-report h3,.vs-report .field-title {
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:12px;color:#1A483D;
}
.vs-report label {
  color:#284D42;font-family:"EmergencyInterSemiBold",Inter,sans-serif;
  font-weight:600;font-size:11.3px;
  margin-top:15px;
}
.vs-report input:not([type=file]):not([type=checkbox]),
.vs-report select,.vs-report textarea {
  margin-top:7px;
  border:1px solid #D2E3DA;border-radius:11px;
  padding:12px 13px;min-height:44px;
  background:#FFFFFF;color:#193C34;
  font-family:"EmergencyInter",Inter,sans-serif;font-size:12px;
}
.vs-report textarea {min-height:104px;}
.vs-report input::placeholder,.vs-report textarea::placeholder{color:#879F95;}
.vs-report :is(input,select,textarea,button,a):focus-visible {
  outline:2px solid #0D9E7A;outline-offset:3px;
}
.vs-report button {
  font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:11.5px;font-weight:700;
  border-radius:10px;
  min-height:41px;
  background:#078B70;
  transition:background-color .15s ease,border-color .15s ease;
}
.vs-report button:hover:not(:disabled){background:#076E59;}
.vs-report .secondary {
  background:#EDF9F3;color:#096F56;border:1px solid #CDE7DA;
}
.vs-report .secondary:hover:not(:disabled){background:#E1F4EA;}
.vs-report .severity-option > span {
  min-height:75px;
  border:1px solid #DCE9E2;border-radius:11px;
  padding:12px 13px;background:#FFFFFF;
}
.vs-report .severity-option strong {
  color:#1E483D;font-family:"EmergencyInterBold",Inter,sans-serif;
  font-size:12px;
}
.vs-report .severity-option small{color:#6D897F;line-height:1.45;}
.vs-report .help-card,.vs-report .evidence,.vs-report .confirmation-card {margin-top:14px;}
.vs-report .choice {
  border-radius:9px;background:#F7FBF9;
  border-color:#D6E5DD;color:#385F53;
  font-family:"EmergencyInterSemiBold",Inter,sans-serif;
}
.vs-report .choice:hover:not(:disabled){background:#EFF8F3;}
.vs-report .choice.active{background:#DFF6EB;border-color:#6EC9A5;color:#08795D;}
.vs-report .auto-match-card {
  background:#F1FAF6;border:1px solid #D7E9DF;border-radius:12px;
}
.vs-report .upload-box {
  background:#FAFDFC;border:1px solid #DDEBE4;
  border-radius:12px;padding:16px;
}
.vs-report .privacy-note{background:#EDF8F3;color:#52756A;border-radius:10px;}
.vs-report footer{padding-top:17px;}
.vs-report footer strong{font-family:"EmergencyInterBold",Inter,sans-serif;color:#16463A;}
.vs-report .success-icon{background:#E4F8ED;color:#087E62;}
@media(max-width:1120px) {
  .vs-report .emergency-hero{padding:21px;gap:16px;}
  .vs-report .emergency-hero-content{gap:17px;}
  .vs-report .emergency-hero-icon{width:90px;height:90px;flex-basis:90px;border-radius:20px;}
  .vs-report .emergency-hero h1{font-size:30px;}
  .vs-report .emergency-review-card{width:238px;flex-basis:238px;padding:12px;}
}
@media(max-width:900px) {
  .vs-report .emergency-hero{flex-direction:column;align-items:stretch;gap:15px;}
  .vs-report .emergency-review-card{width:100%;flex-basis:auto;}
  .vs-report .emergency-hero-content{width:100%;}
}
@media(max-width:520px) {
  .vs-report .emergency-hero{padding:17px;border-radius:17px;}
  .vs-report .emergency-hero-content{gap:13px;align-items:center;}
  .vs-report .emergency-hero-icon {
    width:62px;height:62px;flex-basis:62px;border-radius:15px;
    padding:4px;transform:rotate(-5deg);
  }
  .vs-report .emergency-hero-icon-fill{border-radius:11px;}
  .vs-report .emergency-hero h1{font-size:25px;letter-spacing:-.7px;}
  .vs-report .emergency-hero .eyebrow{font-size:8px;letter-spacing:.8px;}
  .vs-report .emergency-hero-tagline{font-size:11px;}
  .vs-report .emergency-hero p{font-size:10.5px;line-height:1.55;}
  .vs-report .workflow-strip{padding:12px;}
  .vs-report .card{padding:16px;}
}

`;