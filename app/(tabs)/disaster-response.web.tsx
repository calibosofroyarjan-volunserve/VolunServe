import {
  collection,
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";

import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

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
  "Home Repair",
  "Clearing / Heavy Lifting",
  "Relief / Goods Delivery",
  "Safety / Welfare Check",
  "Other",
];

const skillOptions = [
  "General Volunteer Assistance",
  "Driver / Transport",
  "First Aid",
  "Medical Assistance",
  "Search and Rescue",
  "Carpentry",
  "Electrical",
  "Plumbing",
  "Clearing / Heavy Lifting",
  "Community Coordination",
  "Other",
];

const goodsOptions = [
  "No Goods Needed",
  "Drinking Water",
  "Food Packs",
  "Medicine / First Aid Supplies",
  "Blankets / Clothing",
  "Hygiene Kits",
  "Baby Supplies",
  "Construction / Repair Materials",
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

const evidenceType = (file: File): "image" | "video" =>
  file.type.startsWith("video/") ? "video" : "image";

export default function WebDisasterReport() {
  const { user, profile, loading } = useUserSession();
  const profileData: any = profile || {};

  const [pin, setPin] = useState<Pin | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [assistanceTypes, setAssistanceTypes] = useState<string[]>([]);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [neededGoods, setNeededGoods] = useState<string[]>([]);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [progress, setProgress] = useState("");
  const [success, setSuccess] = useState("");

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
        "Sign in with an approved resident account before requesting assistance."
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

    if (requiredSkills.length === 0) {
      setError(
        "Select at least one required responder skill or General Volunteer Assistance."
      );
      return;
    }

    const form = new FormData(event.currentTarget);
    const value = (key: string) =>
      String(form.get(key) || "").trim();

    const affectedPeople = Number(value("affectedPeople"));

    if (
      value("title").length < 3 ||
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
      String(profileData.phoneNumber || profileData.phone || "").trim();

    if (!contactNumber) {
      setError(
        "Your account has no saved contact number. Update it in Account Settings before requesting assistance."
      );
      return;
    }

    const allGoods =
      neededGoods.length > 0 ? neededGoods : ["No Goods Needed"];

    const otherAssistance = value("otherAssistance");
    const otherSkill = value("otherSkill");
    const otherGoods = value("otherGoods");

    const finalAssistanceTypes = assistanceTypes.map((item) =>
      item === "Other" && otherAssistance
        ? `Other: ${otherAssistance}`
        : item
    );

    const finalRequiredSkills = requiredSkills.map((item) =>
      item === "Other" && otherSkill
        ? `Other: ${otherSkill}`
        : item
    );

    const finalNeededGoods = allGoods.map((item) =>
      item === "Other" && otherGoods
        ? `Other: ${otherGoods}`
        : item
    );

    const needsSummary = [
      `Help: ${finalAssistanceTypes.join(", ")}`,
      `Skills: ${finalRequiredSkills.join(", ")}`,
      `Goods: ${finalNeededGoods.join(", ")}`,
      value("needsNote")
        ? `Notes: ${value("needsNote")}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    lock.current = true;
    setBusy(true);

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
          profileData.fullName ||
          user.displayName ||
          "Resident",
        reporterEmail: user.email || "",
        reporterBarangay: profileData.barangay || "",
        reporterAddress:
          profileData.address ||
          profileData.fullAddress ||
          "",
        contactNumber,
        emergencyContact:
          profileData.emergencyContact ||
          profileData.emergencyContactNumber ||
          "",
        reporterProfilePictureUrl:
          profileData.reporterProfilePictureUrl ||
          profileData.profilePictureUrl ||
          profileData.profilePhotoUrl ||
          profileData.photoURL ||
          user.photoURL ||
          "",

        source: "resident_emergency_assistance",
        requestKind: "emergency_assistance",

        title: value("title"),
        category: value("category"),
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

      <header className="page-head">
        <div>
          <span className="eyebrow">
            COMMUNITY RESPONSE · SAN JOSE DEL MONTE
          </span>
          <h1>Request emergency assistance</h1>
          <p>
            Tell the response team what happened, what help is needed,
            and where responders should go.
          </p>
        </div>

        <div className="verification-badge">
          <strong>Admin verification required</strong>
          <span>
            No volunteer is dispatched until the request is reviewed.
          </span>
        </div>
      </header>

      {success ? (
        <section className="card success-card" role="status">
          <div className="success-icon">✓</div>
          <div>
            <h2>Request submitted for verification</h2>
            <p>
              Admin will review your location, assistance details and
              evidence before assigning a responder. You will be notified
              when an assigned responder accepts the request.
            </p>
            <p>
              Reference: <strong>{success}</strong>
            </p>
            <a href="/">Return to dashboard</a>
          </div>
        </section>
      ) : !user || !isApprovedProfile(profile) ? (
        <section className="card">
          <h2>Approved account required</h2>
          <p>
            Sign in and complete account approval before requesting
            emergency assistance.
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
                  <span>01</span> What happened?
                </h2>

                <label>
                  Request title
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Example: Family needs evacuation after flooding"
                  />
                </label>

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

                  <label>
                    Urgency
                    <select
                      name="severity"
                      defaultValue="medium"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
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
                    maxLength={4000}
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
                  Pin the exact place where help is needed. This
                  location is for Admin and the assigned responder.
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
                    maxLength={300}
                    placeholder="Example: Block 4, Brgy. Muzon, near ..."
                  />
                </label>
              </section>
            </div>

            <section className="card help-card">
              <h2>
                <span>03</span> What help is needed?
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

                <div>
                  <h3>Required responder skills / service</h3>
                  <p>
                    This helps Admin choose the right volunteer.
                  </p>
                  <div className="chip-grid">
                    {skillOptions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={
                          requiredSkills.includes(item)
                            ? "choice active"
                            : "choice"
                        }
                        aria-pressed={requiredSkills.includes(item)}
                        onClick={() =>
                          toggleValue(
                            requiredSkills,
                            item,
                            setRequiredSkills
                          )
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  {requiredSkills.includes("Other") && (
                    <label>
                      Other skill / service
                      <input
                        name="otherSkill"
                        maxLength={150}
                        placeholder="Example: Roofing technician"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="goods-block">
                <h3>Goods / supplies needed</h3>
                <p>
                  Select required supplies, or choose No Goods Needed.
                </p>

                <div className="chip-grid">
                  {goodsOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={
                        neededGoods.includes(item)
                          ? "choice active"
                          : "choice"
                      }
                      aria-pressed={neededGoods.includes(item)}
                      onClick={() => {
                        if (item === "No Goods Needed") {
                          setNeededGoods(
                            neededGoods.includes(item) ? [] : [item]
                          );
                          return;
                        }

                        const withoutNone = neededGoods.filter(
                          (value) => value !== "No Goods Needed"
                        );
                        toggleValue(
                          withoutNone,
                          item,
                          setNeededGoods
                        );
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                {neededGoods.includes("Other") && (
                  <label>
                    Other goods / supplies
                    <input
                      name="otherGoods"
                      maxLength={180}
                      placeholder="Specify the needed items"
                    />
                  </label>
                )}
              </div>

              <label>
                Additional response instructions
                <textarea
                  name="needsNote"
                  maxLength={1200}
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
                  <h3>Optional verification video</h3>
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
                <span>05</span> Confirm before submitting
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
                  may be shown to authorized Admins and the volunteer
                  assigned to this request.
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

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <footer>
            <div>
              <strong>Submit for Admin verification</strong>
              <p aria-live="polite">
                {progress ||
                  "A responder will not be dispatched until Admin validates the request."}
              </p>
            </div>

            <button
              disabled={busy || locating}
              type="submit"
            >
              {busy
                ? "Submitting…"
                : "Submit assistance request →"}
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}

const css = `
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
`;
