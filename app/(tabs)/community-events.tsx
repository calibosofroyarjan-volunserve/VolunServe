import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {useFonts} from "expo-font";
import {Inter_400Regular,Inter_500Medium,Inter_600SemiBold,Inter_700Bold,Inter_800ExtraBold} from "@expo-google-fonts/inter";
import * as ImagePicker from "expo-image-picker";
import CommunityEventPinPicker from "../../components/CommunityEventPinPicker";
import CommunityEventLiveLocation from "../../components/CommunityEventLiveLocation";
import CommunityEventHeroArt from "../../components/CommunityEventHeroArt";
import { router } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
  activeModeForProfile,
  hasResidentAccess,
  hasVolunteerAccess,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type Category =
  | "Clean-up Drive"
  | "Tree Planting"
  | "Feeding Program"
  | "Pet Welfare"
  | "Community Outreach"
  | "Other";

type Section = "explore" | "mine" | "propose";
type SelfAttendanceAction = "check-in" | "check-out";
type AttendanceFeedback = {
  eventId: string;
  type: "success" | "error";
  message: string;
};
type EventStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled";

type SelectPicker =
  | "category"
  | "barangay"
  | "venue"
  | "capacity";

type CommunityEvent = {
  id: string;
  title: string;
  description?: string;
  category: Category;
  barangay?: string;
  location: string;
  date: string;
  time: string;
  endTime?: string;
  capacity: number;
  participantsCount?: number;
  proposedBy?: string;
  publicationStatus: "published";
  status: EventStatus;
  createdAt?: unknown;
  proposerName?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  photoUrl?: string;
  photoUrls?: string[];
  videoUrl?: string;
  volunteerTasks?: string;
  requiredRoles?: string[];
  requiredSkills?: string[];
  qualificationNotes?: string;
  whatToBring?: string;
  // Optional verified location coordinates from Admin/LGU, if supplied.
  latitude?: number;
  longitude?: number;
  coordinates?: { latitude?: number; longitude?: number };
};

type Proposal = {
  id: string;
  title: string;
  category: Category;
  barangay: string;
  location: string;
  date: string;
  time: string;
  endTime?: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  createdAt?: unknown;
  volunteerTasks?: string;
  requiredRoles?: string[];
  requiredSkills?: string[];
  photoUrls?: string[];
  videoUrl?: string;
};

type Participation = {
  id: string;
  eventId: string;
  uid: string;
  status: "joined" | "declined";
  attendanceVerified?: boolean;
  checkedInAt?: unknown;
  checkedOutAt?: unknown;
};

type ProposalForm = {
  title: string;
  category: Category;
  barangay: string;
  location: string;
  date: string;
  time: string;
  endTime: string;
  latitude: number | null;
  longitude: number | null;
  capacity: string;
  description: string;
  volunteerTasks: string;
  requiredRoles: string[];
  requiredSkills: string[];
  otherRole: string;
  qualificationNotes: string;
  whatToBring: string;
  photoUrls: string[];
  videoUrl: string;
};

const categories: Category[] = [
  "Clean-up Drive",
  "Tree Planting",
  "Feeding Program",
  "Pet Welfare",
  "Community Outreach",
  "Other",
];

const sjdmBarangays = [
  "Assumption",
  "Bagong Buhay I",
  "Bagong Buhay II",
  "Bagong Buhay III",
  "Citrus",
  "Ciudad Real",
  "Dulong Bayan",
  "Fatima I",
  "Fatima II",
  "Fatima III",
  "Fatima IV",
  "Fatima V",
  "Francisco Homes-Guijo",
  "Francisco Homes-Mulawin",
  "Francisco Homes-Narra",
  "Francisco Homes-Yakal",
  "Gaya-gaya",
  "Graceville",
  "Gumaoc Central",
  "Gumaoc East",
  "Gumaoc West",
  "Kaybanban",
  "Kaypian",
  "Lawang Pari",
  "Maharlika",
  "Minuyan I",
  "Minuyan II",
  "Minuyan III",
  "Minuyan IV",
  "Minuyan V",
  "Minuyan Proper",
  "Muzon East",
  "Muzon Proper",
  "Muzon South",
  "Muzon West",
  "Paradise III",
  "Poblacion",
  "Poblacion I",
  "San Isidro",
  "San Manuel",
  "San Martin I",
  "San Martin II",
  "San Martin III",
  "San Martin IV",
  "San Martin de Porres",
  "San Pedro",
  "San Rafael I",
  "San Rafael II",
  "San Rafael III",
  "San Rafael IV",
  "San Rafael V",
  "San Roque",
  "Santa Cruz I",
  "Santa Cruz II",
  "Santa Cruz III",
  "Santa Cruz IV",
  "Santa Cruz V",
  "Santo Cristo",
  "Santo Niño I",
  "Santo Niño II",
  "Sapang Palay",
  "Tungkong Mangga",
] as const;

const venueChoices = [
  "Barangay Hall",
  "Covered Court",
  "Multi-purpose Hall",
  "Community Center",
  "Public Plaza",
  "School Grounds",
] as const;

const capacityChoices = [
  "10",
  "20",
  "30",
  "50",
  "100",
] as const;

const initialForm: ProposalForm = {
  title: "",
  category: "Clean-up Drive",
  barangay: "",
  location: "",
  date: "",
  time: "",
  endTime: "",
  latitude: null,
  longitude: null,
  capacity: "20",
  description: "",
  volunteerTasks: "",
  requiredRoles: ["General Volunteer"],
  requiredSkills: [],
  otherRole: "",
  qualificationNotes: "",
  whatToBring: "",
  photoUrls: ["", "", ""],
  videoUrl: "",
};

const colors = {
  green: "#078F82",
  ink: "#153044",
  muted: "#66788B",
  border: "#DEE9E8",
  bg: "#F5F9F8",
};

// Event-specific roles are suggestions, never automatic proof of a professional license.
const suggestedRoles: Record<Category, string[]> = {
  "Clean-up Drive": ["General Volunteer", "Cleanup Crew", "Waste Segregation", "Driver", "Safety Marshal"],
  "Tree Planting": ["General Volunteer", "Tree Planter", "Gardening / Forestry", "Driver", "Logistics"],
  "Feeding Program": ["General Volunteer", "Cook", "Food Packer", "Driver", "Nutrition Support"],
  "Pet Welfare": ["General Volunteer", "Animal Care", "Veterinarian", "Driver", "Logistics"],
  "Community Outreach": ["General Volunteer", "First-Aid Volunteer", "Nurse / Medic", "Teacher / Tutor", "Driver", "Organizer"],
  "Other": ["General Volunteer", "Organizer", "Driver", "First-Aid Volunteer", "Nurse / Medic", "Logistics"],
};

const suggestedSkills: Record<Category, string[]> = {
  "Clean-up Drive": ["Teamwork", "Waste Sorting", "Safety Awareness", "Equipment Handling", "Driving"],
  "Tree Planting": ["Planting", "Gardening", "Tool Handling", "Teamwork", "Driving"],
  "Feeding Program": ["Cooking", "Food Safety", "Food Packing", "Organization", "Driving"],
  "Pet Welfare": ["Animal Handling", "Animal Care", "Basic First Aid", "Transport", "Teamwork"],
  "Community Outreach": ["First Aid", "Health Education", "Teaching", "Organization", "Driving"],
  "Other": ["Communication", "First Aid", "Teaching", "Organization", "Driving", "Teamwork"],
};

const professionalRoleNames = ["nurse", "medic", "veterinarian", "doctor", "licensed"];
const needsProfessionalCheck = (roles: string[]) => roles.some((role) =>
  professionalRoleNames.some((word) => role.toLowerCase().includes(word))
);

// Submitted media must already be hosted; this is not an upload endpoint.
const validPublicMediaUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && value.length <= 2048 &&
      !url.username && !url.password;
  } catch { return false; }
};

const videoLinkSupported = (value: string): boolean => {
  if (!value) return true;
  if (!validPublicMediaUrl(value)) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"]
      .includes(host);
  } catch { return false; }
};

const pad2 = (value: number) =>
  String(value).padStart(2, "0");

const toDateString = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatChosenTime = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) return "Select time";

  const hour = Number(match[1]);

  return `${hour % 12 || 12}:${match[2]} ${
    hour >= 12 ? "PM" : "AM"
  }`;
};

const getTime = (value: unknown): number => {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return Number(value.toMillis()) || 0;
  }

  return 0;
};

const prettyDate = (date?: string, time?: string) => {
  if (!date) return "Date to be announced";

  const parsed = new Date(
    `${date}T${time || "00:00"}:00`
  );

  if (Number.isNaN(parsed.getTime())) {
    return `${date} ${time || ""}`;
  }

  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const eventScheduleLabel = (event: {date: string;time: string;endTime?: string}) =>
  `${prettyDate(event.date,event.time)}${event.endTime ? ` – ${formatChosenTime(event.endTime)}` : ""}`;

const categoryIcon = (
  category: Category
): keyof typeof Ionicons.glyphMap => {
  switch (category) {
    case "Clean-up Drive":
      return "leaf-outline";
    case "Tree Planting":
      return "earth-outline";
    case "Feeding Program":
      return "restaurant-outline";
    case "Pet Welfare":
      return "paw-outline";
    case "Community Outreach":
      return "people-outline";
    default:
      return "heart-outline";
  }
};

const eventCover = (event: CommunityEvent): string | null => {
  const url = [event.coverImageUrl, event.imageUrl, event.photoUrl]
    .find((candidate) => typeof candidate === "string" && /^https?:\/\//i.test(candidate));
  return url || null;
};

// Google Maps links use the event's real saved coordinates, when present.
// Without coordinates, Google Maps searches the Admin-provided venue/address.
const eventDestination = (event: CommunityEvent): string => {
  const latitude = Number(event.coordinates?.latitude ?? event.latitude);
  const longitude = Number(event.coordinates?.longitude ?? event.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
    return `${latitude},${longitude}`;
  }
  return [event.location, event.barangay, "San Jose del Monte, Bulacan, Philippines"]
    .filter(Boolean).join(", ");
};

const eventHasCoordinates = (event: CommunityEvent): boolean => {
  const lat = Number(event.coordinates?.latitude ?? event.latitude);
  const lng = Number(event.coordinates?.longitude ?? event.longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180;
};

const googleMapsViewUrl = (event: CommunityEvent) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(eventDestination(event))}&z=15&output=embed`;

const googleMapsDirectionsUrl = (event: CommunityEvent) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(eventDestination(event))}`;

const googleMapsSearchUrl = (event: CommunityEvent) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventDestination(event))}`;

// Google Maps Embed API: publicly visible browser key, restrict it to approved
// website referrers and "Maps Embed API" in Google Cloud Console.
// The existing address-based map remains usable until a key is configured.
const googleMapsEmbedKey = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY || "").trim();
type RouteOrigin = { latitude: number; longitude: number };
const googleMapsEmbeddedDirectionsUrl = (event: CommunityEvent, origin: RouteOrigin) =>
  `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(googleMapsEmbedKey)}` +
  `&origin=${encodeURIComponent(`${origin.latitude},${origin.longitude}`)}` +
  `&destination=${encodeURIComponent(eventDestination(event))}&mode=driving`;

const googleMapsNavigationUrl = (event: CommunityEvent) =>
  `${googleMapsDirectionsUrl(event)}&travelmode=driving&dir_action=navigate`;

const prettyAttendanceTime = (timestamp: unknown): string => {
  const time = getTime(timestamp);
  return time ? new Date(time).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—";
};
const prettyAttendanceDay = (timestamp: unknown): string => {
  const time = getTime(timestamp);
  return time ? new Date(time).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";
};

const durationMinutes = (participation?: Participation): number => {
  if (!participation?.attendanceVerified) return 0;
  const start = getTime(participation.checkedInAt);
  const end = getTime(participation.checkedOutAt);
  return start > 0 && end >= start ? Math.floor((end - start) / 60000) : 0;
};

const formatHours = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
};

const eventStatusText = (status: EventStatus) =>
  status === "active" ? "ONGOING" : status.toUpperCase();

const eventStatusIcon = (status: EventStatus): keyof typeof Ionicons.glyphMap =>
  status === "active" ? "radio-button-on-outline" :
    status === "completed" ? "checkmark-circle-outline" : "time-outline";

const errorText = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  if (
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
  ) {
    return "Firestore access denied. Community Events security rules must be configured before this action can work.";
  }

  if (message.includes("Failed to fetch") || message.includes("Network request failed")) {
    return "Could not connect to the Community Event photo service. Check the backend and try again.";
  }
  return message;
};

// Cloudinary media proxy on the authenticated VolunServe backend (not Firebase Storage).
const COMMUNITY_EVENT_PHOTO_BACKEND_URL = String(
  process.env.EXPO_PUBLIC_VOLUNSERVE_BACKEND_URL || "https://volunserve.onrender.com"
).replace(/\/$/, "");

async function uploadResidentEventPhoto(
  file: File,
  token: string,
  proposalId: string,
  slot: number,
): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024 || file.size < 12) {
    throw new Error("Event site photos must be JPG, PNG or WebP and under 5 MB.");
  }
  const response = await fetch(`${COMMUNITY_EVENT_PHOTO_BACKEND_URL}/api/community-events/proposal-photo/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "X-Proposal-Id": proposalId,
      "X-Photo-Slot": String(slot),
    },
    body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true || typeof result?.photo?.publicUrl !== "string") {
    throw new Error(result?.message || `Cloudinary upload failed (HTTP ${response.status}).`);
  }
  const url = result.photo.publicUrl;
  if (!/^https:\/\//.test(url)) throw new Error("Cloudinary returned an invalid secure photo URL.");
  return url;
}

// Unlike public event evidence, credentials are protected Cloudinary assets
// and are only opened through the authenticated Admin access endpoint.
async function uploadResidentCredentialPhoto(file: Blob, mimeType: string, token: string, proposalId: string): Promise<string> {
  if (!["image/jpeg","image/png","image/webp"].includes(mimeType) || file.size < 12 || file.size > 5*1024*1024) {
    throw new Error("Upload a valid JPG, PNG or WebP credential photo under 5 MB.");
  }
  const response = await fetch(`${COMMUNITY_EVENT_PHOTO_BACKEND_URL}/api/community-events/credential-photo/upload`, {
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":mimeType,"X-Proposal-Id":proposalId},
    body:file,
  });
  const json = await response.json().catch(()=>null);
  if (!response.ok || json?.ok !== true || json?.credentialAssetId !== proposalId) {
    throw new Error(json?.message || "Unable to securely upload credentials.");
  }
  return proposalId;
}

function CredentialPhotoField({preview,onPick,error}: {preview:string;onPick:()=>void;error:string}) {
  return <View style={{marginTop:10,marginBottom:10}}>
    <Text style={styles.fieldLabel}>Credentials / professional certificate photo (optional)</Text>
    <Pressable onPress={onPick} accessibilityRole="button" style={{borderWidth:1,borderColor:"#C7DEDA",backgroundColor:"#F5FBF9",borderRadius:10,minHeight:64,padding:12,flexDirection:"row",alignItems:"center",gap:12}}>
      <Ionicons name="camera-outline" size={24} color="#087F75"/>
      <Text style={{flex:1,color:"#0A7468",fontSize:12,fontWeight:"800"}}>{preview?"Photo selected — change credential":"Upload a photo of license or relevant certificate"}</Text>
    </Pressable>
    {preview?<Image source={{uri:preview}} resizeMode="contain" style={{width:"100%",height:145,marginTop:8,borderRadius:9,backgroundColor:"#EDF2F2"}}/>:null}
    <Text style={{fontSize:10,color:"#617A85",marginTop:5}}>Private Admin-only review. Do not upload credentials as public event evidence. JPG/PNG/WebP, max 5 MB.</Text>
    {!!error&&<Text style={{fontSize:11,color:"#B91C1C",marginTop:5}}>{error}</Text>}
  </View>;
}

// Shared by web and mobile Resident proposal screens.
function ProposalNeedsAndMedia({
  form,
  update,
  onPhotoChange,
  onCredentialPick,
  credentialPreview,
  credentialError,
}: {
  form: ProposalForm;
  update: <K extends keyof ProposalForm>(field: K, value: ProposalForm[K]) => void;
  onPhotoChange: (index: number, value: string) => void;
  onCredentialPick: () => void;
  credentialPreview: string;
  credentialError: string;
}) {
  const roles = [...new Set([...suggestedRoles[form.category], ...form.requiredRoles])];
  const skills = [...new Set([...suggestedSkills[form.category], ...form.requiredSkills])];
  const photoUrls = form.photoUrls.filter((url) => validPublicMediaUrl(url.trim()) && !!url.trim());
  const selectedProfessional = needsProfessionalCheck([
    ...form.requiredRoles, form.otherRole,
  ]);

  return (
    <>
      <View style={styles.residentSectionHeading}>
        <View style={styles.residentSectionIcon}><Ionicons name="people-outline" size={20} color="#047E73" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.residentSectionTitle}>03 · Volunteer needs</Text>
          <Text style={styles.residentSectionSub}>What help is needed, and who can safely do it?</Text>
        </View>
      </View>
      <Text style={styles.fieldLabel}>What will volunteers actually do? *</Text>
      <TextInput
        style={[styles.input, styles.residentMultiline]}
        placeholder="e.g. Plant seedlings, prepare soil, distribute water and monitor planting areas..."
        placeholderTextColor="#91A2AF"
        multiline textAlignVertical="top" maxLength={1200}
        value={form.volunteerTasks}
        onChangeText={(value) => update("volunteerTasks", value)}
      />
      <Text style={styles.fieldLabel}>Needed volunteer roles / occupations *</Text>
      <Text style={styles.residentHelp}>Choose one or more. Suggestions change with the event category.</Text>
      <View style={styles.residentChipRow}>
        {roles.map((role) => {
          const chosen = form.requiredRoles.includes(role);
          return (
            <Pressable key={role} accessibilityRole="checkbox" accessibilityState={{ checked: chosen }}
              onPress={() => update("requiredRoles", chosen
                ? form.requiredRoles.filter((item) => item !== role)
                : [...form.requiredRoles, role])}
              style={[styles.residentChoiceChip, chosen && styles.residentChoiceChipSelected]}>
              <Ionicons name={chosen ? "checkmark-circle" : "add-circle-outline"} size={15}
                color={chosen ? "#FFFFFF" : "#287A71"} />
              <Text style={[styles.residentChoiceText, chosen && styles.residentChoiceTextSelected]}>{role}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={[styles.input, styles.residentSmallInput]}
        placeholder="Another role or occupation? (optional)"
        placeholderTextColor="#91A2AF"
        value={form.otherRole}
        onChangeText={(value) => update("otherRole", value)}
        maxLength={80}
      />
      <Text style={styles.fieldLabel}>Helpful skills (optional)</Text>
      <View style={styles.residentChipRow}>
        {skills.map((skill) => {
          const chosen = form.requiredSkills.includes(skill);
          return (
            <Pressable key={skill} accessibilityRole="checkbox" accessibilityState={{ checked: chosen }}
              onPress={() => update("requiredSkills", chosen
                ? form.requiredSkills.filter((item) => item !== skill)
                : [...form.requiredSkills, skill])}
              style={[styles.residentChoiceChip, styles.residentSkillChip,
                chosen && styles.residentChoiceChipSelected]}>
              <Ionicons name={chosen ? "checkmark" : "add"} size={15}
                color={chosen ? "#FFFFFF" : "#287A71"} />
              <Text style={[styles.residentChoiceText, chosen && styles.residentChoiceTextSelected]}>{skill}</Text>
            </Pressable>
          );
        })}
      </View>
      {selectedProfessional && (
        <View style={styles.residentSafeguard}>
          <Ionicons name="shield-checkmark-outline" size={19} color="#8A5B13" />
          <Text style={styles.residentSafeguardText}>
            Professional role selected. Admin/LGU must check licenses and qualifications before assigning medical or veterinary responsibilities. Unlicensed volunteers may help with non-clinical tasks only.
          </Text>
        </View>
      )}
      <CredentialPhotoField preview={credentialPreview} onPick={onCredentialPick} error={credentialError}/>
      <Text style={styles.fieldLabel}>What volunteers should bring (optional)</Text>
      <TextInput style={[styles.input, styles.residentSmallInput]}
        placeholder="e.g. Gloves, reusable water bottle, closed shoes"
        placeholderTextColor="#91A2AF" value={form.whatToBring}
        onChangeText={(value) => update("whatToBring", value)} maxLength={500} />

      <View style={styles.residentSectionHeading}>
        <View style={styles.residentSectionIcon}><Ionicons name="images-outline" size={20} color="#047E73" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.residentSectionTitle}>04 · Required Site Evidence</Text>
          <Text style={styles.residentSectionSub}>At least one location/activity photo is required. Video is optional.</Text>
        </View>
      </View>
      <View style={styles.residentMediaNotice}>
        <Ionicons name="information-circle-outline" color="#317A8E" size={18} />
        <Text style={styles.residentMediaNoticeText}>
          At least one JPG/PNG/WebP event venue or activity photo is required. Add up to 3 photos using the site upload or valid HTTPS photo links. A YouTube/Vimeo link is optional.
        </Text>
      </View>
      {form.photoUrls.map((url, index) => (
        <View key={index} style={styles.residentMediaField}>
          <Text style={styles.fieldLabel}>{index === 0 ? "Main site photo *" : `Additional site photo ${index + 1} (optional)`}</Text>
          <TextInput style={[styles.input, styles.residentSmallInput]} keyboardType="url"
            autoCapitalize="none" autoCorrect={false}
            placeholder="https://example.com/location-photo.jpg"
            placeholderTextColor="#91A2AF" value={url} maxLength={2048}
            onChangeText={(value) => onPhotoChange(index, value)} />
          {!!url.trim() && validPublicMediaUrl(url.trim()) && (
            <Image source={{ uri: url.trim() }} resizeMode="cover" style={styles.residentMediaPreview} />
          )}
        </View>
      ))}
      <Text style={styles.fieldLabel}>Event site / activity video (optional)</Text>
      <TextInput style={[styles.input, styles.residentSmallInput]} keyboardType="url"
        autoCapitalize="none" autoCorrect={false}
        placeholder="https://youtu.be/... or https://vimeo.com/..."
        placeholderTextColor="#91A2AF" value={form.videoUrl} maxLength={2048}
        onChangeText={(value) => update("videoUrl", value)} />
      {form.videoUrl.trim().length > 0 && videoLinkSupported(form.videoUrl.trim()) && (
        <Pressable style={styles.residentMediaLink} onPress={() => void Linking.openURL(form.videoUrl.trim())}>
          <Ionicons name="play-circle-outline" size={18} color="#067F75" />
          <Text style={styles.residentMediaLinkText}>Preview video link</Text>
        </Pressable>
      )}
      {photoUrls.length > 0 && (
        <Text style={styles.residentHelp}>{photoUrls.length} site photo{photoUrls.length === 1 ? "" : "s"} included for Admin review.</Text>
      )}
    </>
  );
}

export default function CommunityEventsScreen() {
  useFonts({EventInter:Inter_400Regular,EventInterMedium:Inter_500Medium,EventInterSemiBold:Inter_600SemiBold,EventInterBold:Inter_700Bold,EventInterExtraBold:Inter_800ExtraBold});
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();

  const isCompact = width < (Platform.OS === "web" ? 950 : 720);
  const mode = activeModeForProfile(profile);

  const isVolunteer =
    mode === "volunteer" &&
    hasVolunteerAccess(profile);

  const canPropose =
    mode === "resident" &&
    hasResidentAccess(profile);

  // Only approved volunteers need a My Attendance rail; residents use the full event width.
  const webSideBySide = Platform.OS === "web" && isVolunteer && width >= 1450;
  const webRowNarrow = width < 800 || (webSideBySide && width < 1500);

  const [section, setSection] =
    useState<Section>("explore");

  const [category, setCategory] =
    useState<Category | "All">("All");

  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState<"soonest" | "latest">("soonest");
  const [attendanceSort, setAttendanceSort] = useState<"latest" | "oldest">("latest");
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [visibleEventCount, setVisibleEventCount] = useState(6);

  const [events, setEvents] =
    useState<CommunityEvent[]>([]);

  const [proposals, setProposals] =
    useState<Proposal[]>([]);

  const [participations, setParticipations] =
    useState<Participation[]>([]);

  const [eventsLoading, setEventsLoading] =
    useState(true);

  const [eventError, setEventError] = useState("");
  const [recordError, setRecordError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] =
    useState<ProposalForm>(initialForm);

  const [selectPicker, setSelectPicker] =
    useState<SelectPicker | null>(null);

  const [barangaySearch, setBarangaySearch] =
    useState("");

  const [customVenue, setCustomVenue] =
    useState(false);

  const [customCapacity, setCustomCapacity] =
    useState(false);

  const [picker, setPicker] =
    useState<"date" | "time" | null>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<"start" | "end">("start");

  const [calendarMonth, setCalendarMonth] =
    useState(() => new Date());

  const [clockHour, setClockHour] = useState(8);
  const [clockMinute, setClockMinute] = useState(0);

  const [clockPeriod, setClockPeriod] =
    useState<"AM" | "PM">("AM");

  // Local browser files are not uploaded until Submit Proposal is pressed.
  const [localPhotoFiles, setLocalPhotoFiles] = useState<(File | null)[]>([null, null, null]);
  const [localPhotoPreviews, setLocalPhotoPreviews] = useState<string[]>(["", "", ""]);
  const [photoPickerError, setPhotoPickerError] = useState("");
  const [showPhotoLinkFallback, setShowPhotoLinkFallback] = useState(false);
  const [credentialFile, setCredentialFile] = useState<Blob | null>(null);
  const [credentialMimeType, setCredentialMimeType] = useState("");
  const [credentialPreview, setCredentialPreview] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const pickCredentialPhoto = async () => {
    setCredentialError("");
    if (Platform.OS === "web") {
      const d = (globalThis as any).document;
      if (!d) return;
      const input = d.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.onchange = () => {
        const file = input.files?.[0] as File | undefined;
        if (!file) return;
        if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024) {
          setCredentialError("Only JPG/PNG/WebP photos up to 5 MB are allowed.");return;
        }
        setCredentialFile(file);
        setCredentialMimeType(file.type);
        const reader = new FileReader();
        reader.onload = () => setCredentialPreview(typeof reader.result === "string" ? reader.result : "");
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      try {
        const asset = await ImagePicker.launchImageLibraryAsync({
          mediaTypes:["images"],allowsEditing:false,quality:0.85,
        });
        if (asset.canceled || !asset.assets?.[0]) return;
        const selected = asset.assets[0];
        const mime = selected.mimeType || "image/jpeg";
        const blob = await (await fetch(selected.uri)).blob();
        if (blob.size > 5*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(mime)) throw new Error("Credential photo must be JPG/PNG/WebP, max 5 MB.");
        setCredentialFile(blob);
        setCredentialMimeType(mime);
        setCredentialPreview(selected.uri);
      } catch(error:any) {setCredentialError(error?.message||"Credential photo could not be selected.");}
    }
  };

  const [residentDetailsId, setResidentDetailsId] = useState<string | null>(null);
  const [residentDetailTab, setResidentDetailTab] = useState<"details" | "map" | "volunteers" | "media">("details");
  const [residentBarangayFilter, setResidentBarangayFilter] = useState("All Barangays");
  const [residentStatusFilter, setResidentStatusFilter] = useState("All Status");
  const [residentFilterPicker, setResidentFilterPicker] = useState<"category" | "barangay" | "status" | null>(null);

  const pickResidentPhoto = (slot: number) => {
    if (Platform.OS !== "web") {
      void (async () => {
        try {
          const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:false,quality:0.85});
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          const raw = await (await fetch(asset.uri)).blob();
          const blob = new Blob([raw],{type:asset.mimeType||"image/jpeg"}) as File;
          if (!["image/jpeg","image/png","image/webp"].includes(blob.type) || blob.size>5*1024*1024) throw new Error("Site photo must be JPG/PNG/WebP, max 5 MB.");
          setLocalPhotoFiles(previous=>previous.map((file,i)=>i===slot?blob:file));
          setLocalPhotoPreviews(previous=>previous.map((url,i)=>i===slot?asset.uri:url));
          setPhotoPickerError("");
        } catch(error:any){setPhotoPickerError(error?.message||"Could not choose site photo.");}
      })();
      return;
    }
    const docObject = (globalThis as any).document;
    if (!docObject) return;
    const input = docObject.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = () => {
      const selected = input.files?.[0] as File | undefined;
      if (!selected) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
        setPhotoPickerError("Use JPG, PNG, or WebP images up to 5 MB each.");
        return;
      }
      setPhotoPickerError("");
      setLocalPhotoFiles((prev) => prev.map((file, i) => i === slot ? selected : file));
      const reader = new FileReader();
      reader.onload = () => {
        const preview = typeof reader.result === "string" ? reader.result : "";
        setLocalPhotoPreviews((prev) => prev.map((value, i) => i === slot ? preview : value));
      };
      reader.readAsDataURL(selected);
    };
    input.click();
  };

  const [busy, setBusy] = useState(false);
  const [busyEvent, setBusyEvent] = useState("");

  // Volunteer self attendance (web first). Admin alone verifies participation.
  const [attendanceBusy, setAttendanceBusy] = useState("");
  const [attendanceConfirmation, setAttendanceConfirmation] = useState<{
    eventId: string;
    action: SelfAttendanceAction;
  } | null>(null);
  const [attendanceFeedback, setAttendanceFeedback] =
    useState<AttendanceFeedback | null>(null);

  const [expandedEvent, setExpandedEvent] =
    useState<string | null>(null);

  // GPS is requested only when the volunteer clicks the route preview button.
  // Never written to Firestore or saved to local storage.
  const [routeOrigin, setRouteOrigin] = useState<RouteOrigin | null>(null);
  const [routeEventId, setRouteEventId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeNotice, setRouteNotice] = useState("");

  const showRouteInVolunServe = (event: CommunityEvent) => {
    setRouteNotice("");
    if (!googleMapsEmbedKey) {
      setRouteNotice("To show the driving route inside VolunServe, configure the Google Maps Embed API key in your local environment first. You can still tap Open in Google Maps for directions.");
      return;
    }
    if (Platform.OS !== "web") {
      setRouteNotice("In-app route preview is currently available on web. Use Google Maps for directions on mobile.");
      return;
    }
    const geolocation = (globalThis as any).navigator?.geolocation;
    if (!geolocation) {
      setRouteNotice("This browser cannot provide GPS location. Use Open in Google Maps instead.");
      return;
    }
    setRouteLoading(true);
    geolocation.getCurrentPosition(
      (position: { coords: { latitude: number; longitude: number } }) => {
        setRouteOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setRouteEventId(event.id);
        setRouteLoading(false);
        setRouteNotice("");
      },
      () => {
        setRouteEventId(null);
        setRouteLoading(false);
        setRouteNotice("Location permission was denied or unavailable. Allow browser location access to preview the route, or use Google Maps directly.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  // Published community events
  useEffect(() => {
    if (!user || !profile) return;

    setEventsLoading(true);

    const eventQuery = query(
      collection(db, "communityEvents"),
      where("publicationStatus", "==", "published")
    );

    return onSnapshot(
      eventQuery,
      (snapshot) => {
        const list = snapshot.docs.map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as CommunityEvent
        );

        setEvents(list);
        setEventsLoading(false);
        setEventError("");
      },
      (error) => {
        setEventsLoading(false);
        setEventError(errorText(error));
      }
    );
  }, [user?.uid, Boolean(profile)]);

  // Resident proposals
  useEffect(() => {
    if (!user || !canPropose) {
      setProposals([]);
      return;
    }

    const proposalQuery = query(
      collection(db, "communityEventProposals"),
      where("proposedBy", "==", user.uid)
    );

    return onSnapshot(
      proposalQuery,
      (snapshot) => {
        const list = snapshot.docs.map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as Proposal
        );

        setProposals(list);
        setRecordError("");
      },
      (error) => {
        setRecordError(errorText(error));
      }
    );
  }, [user?.uid, canPropose]);

  // Volunteer participations
  useEffect(() => {
    if (!user || !isVolunteer) {
      setParticipations([]);
      return;
    }

    const participationQuery = query(
      collection(db, "communityEventParticipants"),
      where("uid", "==", user.uid)
    );

    return onSnapshot(
      participationQuery,
      (snapshot) => {
        const list = snapshot.docs.map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as Participation
        );

        setParticipations(list);
        setRecordError("");
      },
      (error) => {
        setRecordError(errorText(error));
      }
    );
  }, [user?.uid, isVolunteer]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        const text = [
          event.title,
          event.location,
          event.barangay || "",
          event.description || "",
        ]
          .join(" ")
          .toLowerCase();

        const matchesCategory =
          category === "All" ||
          event.category === category;

        const matchesSearch = text.includes(
          search.trim().toLowerCase()
        );

        return (
          event.status !== "cancelled" &&
          matchesCategory &&
          matchesSearch &&
          (!canPropose || residentBarangayFilter === "All Barangays" || event.barangay === residentBarangayFilter) &&
          (!canPropose || residentStatusFilter === "All Status" || event.status === residentStatusFilter)
        );
      })
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );
  }, [events, category, search, canPropose, residentBarangayFilter, residentStatusFilter]);

  const participationMap = useMemo(
    () =>
      new Map(
        participations.map((item) => [
          item.eventId,
          item,
        ])
      ),
    [participations]
  );

  const myEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          participationMap.get(event.id)?.status ===
          "joined"
      ),
    [events, participationMap]
  );

  // A separate, date-sorted attendance list stays visible independently of event search/filter tabs.
  const myAttendanceEvents = useMemo(() => [...myEvents].sort((a, b) => {
    const aDate = `${a.date || ""}T${a.time || "00:00"}`;
    const bDate = `${b.date || ""}T${b.time || "00:00"}`;
    const byDate = aDate.localeCompare(bDate);
    return (attendanceSort === "latest" ? -byDate : byDate) || a.title.localeCompare(b.title);
  }), [myEvents, attendanceSort]);

  const availableCount = events.filter(
    (event) =>
      event.status === "upcoming" ||
      event.status === "active"
  ).length;

  const completedCount = events.filter(
    (event) => event.status === "completed"
  ).length;

  // A copy is sorted to avoid mutating the Firestore-backed event arrays.
  const displayEvents = useMemo(() => {
    const source = section === "mine" && isVolunteer ? myEvents : filteredEvents;
    return [...source].sort((a, b) => {
      const aDate = `${a.date || ""}T${a.time || "00:00"}`;
      const bDate = `${b.date || ""}T${b.time || "00:00"}`;
      const byDate = aDate.localeCompare(bDate);
      return (dateSort === "soonest" ? byDate : -byDate) || a.title.localeCompare(b.title);
    });
  }, [section, isVolunteer, myEvents, filteredEvents, dateSort]);
  useEffect(() => {
    setVisibleEventCount(6);
  }, [section, category, search, dateSort]);
  const visibleEvents = displayEvents.slice(0, visibleEventCount);
  const selectedEvent = events.find((event) => event.id === expandedEvent) ||
    (isVolunteer ? myAttendanceEvents[0] : undefined) || displayEvents[0] || null;
  const selectedParticipation = selectedEvent ? participationMap.get(selectedEvent.id) : undefined;
  const selectedJoined = selectedParticipation?.status === "joined";
  const selectedOwned = !!selectedEvent && selectedEvent.proposedBy === user?.uid;

  const setValue = <K extends keyof ProposalForm>(
    field: K,
    value: ProposalForm[K]
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const updateProposalPhoto = (index: number, value: string) => {
    setForm((previous) => ({
      ...previous,
      photoUrls: previous.photoUrls.map((item, photoIndex) =>
        index === photoIndex ? value : item),
    }));
  };

  // Dropdown handling
  const openSelect = (which: SelectPicker) => {
    setBarangaySearch("");
    setSelectPicker(which);
  };

  const chooseOption = (
    which: SelectPicker,
    option: string
  ) => {
    if (which === "category") {
      setValue("category", option as Category);
    } else if (which === "barangay") {
      setValue("barangay", option);
    } else if (which === "venue") {
      if (option === "Specify another location") {
        setCustomVenue(true);
        setValue("location", "");
      } else {
        setCustomVenue(false);
        setValue("location", option);
      }
    } else {
      if (option === "Custom capacity") {
        setCustomCapacity(true);
        setValue("capacity", "");
      } else {
        setCustomCapacity(false);
        setValue("capacity", option);
      }
    }

    setSelectPicker(null);
  };

  const selectOptions: string[] =
    selectPicker === "category"
      ? [...categories]
      : selectPicker === "barangay"
        ? sjdmBarangays.filter((name) =>
            name
              .toLowerCase()
              .includes(
                barangaySearch.trim().toLowerCase()
              )
          )
        : selectPicker === "venue"
          ? [
              ...venueChoices,
              "Specify another location",
            ]
          : selectPicker === "capacity"
            ? [
                ...capacityChoices,
                "Custom capacity",
              ]
            : [];

  const selectHeading =
    selectPicker === "category"
      ? "Select event category"
      : selectPicker === "barangay"
        ? "Select barangay"
        : selectPicker === "venue"
          ? "Select venue type"
          : "Select volunteer capacity";

  // Calendar picker
  const openDatePicker = () => {
    const selected =
      /^\d{4}-\d{2}-\d{2}$/.test(form.date)
        ? new Date(`${form.date}T12:00:00`)
        : new Date();

    const base = Number.isNaN(selected.getTime())
      ? new Date()
      : selected;

    setCalendarMonth(
      new Date(
        base.getFullYear(),
        base.getMonth(),
        1
      )
    );

    setPicker("date");
  };

  // Time picker
  const openTimePicker = (target: "start" | "end" = "start") => {
    setTimePickerTarget(target);
    const match =
      /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
        target === "end" ? form.endTime : form.time
      );

    const hour = match ? Number(match[1]) : 8;

    setClockHour(hour % 12 || 12);
    setClockMinute(match ? Number(match[2]) : 0);
    setClockPeriod(hour >= 12 ? "PM" : "AM");

    setPicker("time");
  };

  const savePickedTime = () => {
    const hour24 =
      (clockHour % 12) +
      (clockPeriod === "PM" ? 12 : 0);

    setValue(
      timePickerTarget === "end" ? "endTime" : "time",
      `${pad2(hour24)}:${pad2(clockMinute)}`
    );

    setPicker(null);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const previousMonthDisabled =
    calendarMonth.getFullYear() ===
      today.getFullYear() &&
    calendarMonth.getMonth() === today.getMonth();

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    const offset = new Date(
      year,
      month,
      1
    ).getDay();

    const daysInMonth = new Date(
      year,
      month + 1,
      0
    ).getDate();

    return Array.from(
      {
        length:
          Math.ceil(
            (offset + daysInMonth) / 7
          ) * 7,
      },
      (_, index) => {
        const day = index - offset + 1;

        return day >= 1 && day <= daysInMonth
          ? day
          : null;
      }
    );
  }, [calendarMonth]);

  // Resident proposal submission
  const submitProposal = async () => {
    if (
      !user ||
      !profile ||
      !canPropose ||
      busy
    ) {
      return;
    }

    setNotice("");

    const title = form.title.trim();
    const location = form.location.trim();
    const barangay = form.barangay.trim();
    const description = form.description.trim();
    const capacity = Number(form.capacity);
    const selectedRoles = [...new Set([
      ...form.requiredRoles,
      ...(form.otherRole.trim() ? [form.otherRole.trim()] : []),
    ])];
    const photoUrls = form.photoUrls.map((url) => url.trim()).filter(Boolean);
    const videoUrl = form.videoUrl.trim();
    if (!photoUrls.length && !localPhotoFiles.some(Boolean)) {
      setNotice("At least one event site evidence photo is required. Upload Main Photo or supply a valid HTTPS image link.");
      return;
    }
    if (form.latitude === null || form.longitude === null) {
      setNotice("Set the exact GPS meeting point by tapping the map or using the venue's GPS.");
      return;
    }

    if (form.volunteerTasks.trim().length < 12 || selectedRoles.length === 0) {
      setNotice("Describe what volunteers will do (at least 12 characters) and select at least one needed role.");
      return;
    }
    if (form.otherRole.length > 80 || form.qualificationNotes.length > 500 ||
        photoUrls.some((url) => !validPublicMediaUrl(url)) ||
        !videoLinkSupported(videoUrl)) {
      setNotice("Check the optional links and professional requirements. Photos require HTTPS links; video must be YouTube or Vimeo.");
      return;
    }

    const dateOkay =
      /^\d{4}-\d{2}-\d{2}$/.test(form.date);

    const timeOkay =
      /^([01]\d|2[0-3]):[0-5]\d$/.test(form.time);

    const endTimeOkay = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(form.endTime);
    if (!endTimeOkay || (timeOkay && form.endTime <= form.time)) {
      setNotice("Choose an end time later than the start time, on the same day.");
      return;
    }

    const parsed =
      dateOkay && timeOkay
        ? new Date(
            `${form.date}T${form.time}:00`
          )
        : null;

    if (
      title.length < 5 ||
      description.length < 20 ||
      !location ||
      !barangay
    ) {
      setNotice(
        "Complete the title (5+ characters), description (20+ characters), barangay, and venue."
      );
      return;
    }

    if (
      !parsed ||
      Number.isNaN(parsed.getTime()) ||
      parsed.getTime() <= Date.now()
    ) {
      setNotice(
        "Enter a valid future date and time."
      );
      return;
    }

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 500
    ) {
      setNotice(
        "Volunteer capacity must be between 1 and 500."
      );
      return;
    }

    setBusy(true);

    try {
      const proposalRef = doc(collection(db, "communityEventProposals"));
      const uploadedPhotos = [...form.photoUrls.map((url) => url.trim())];
      // Upload only selected local images. Unchanged HTTPS links remain valid.
      const token = await user.getIdToken();
      for (let index = 0; index < localPhotoFiles.length; index += 1) {
        const file = localPhotoFiles[index];
        if (!file) continue;
        setNotice(`Uploading Community Event photo ${index + 1}...`);
        uploadedPhotos[index] = await uploadResidentEventPhoto(file, token, proposalRef.id, index + 1);
      }
      let credentialAssetId = "";
      if (credentialFile) {
        setNotice("Uploading private professional credential for Admin review...");
        credentialAssetId = await uploadResidentCredentialPhoto(
          credentialFile, credentialMimeType, token, proposalRef.id,
        );
      }
      // Server validates the verified Resident and writes the pending
      // proposal. Direct Firestore creation is not relied upon here.
      const submissionToken = await user.getIdToken();
      const result = await fetch(
        `${COMMUNITY_EVENT_PHOTO_BACKEND_URL}/api/community-events/proposals`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${submissionToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            proposalId: proposalRef.id,
            title,
            description,
            volunteerTasks: form.volunteerTasks.trim(),
            requiredRoles: selectedRoles,
            requiredSkills: [...form.requiredSkills],
            qualificationNotes: "",
            ...(credentialAssetId ? {credentialAssetId} : {}),
            whatToBring: form.whatToBring.trim(),
            photoUrls: uploadedPhotos.filter(Boolean).slice(0, 3),
            videoUrl,
            category: form.category,
            barangay,
            location,
            date: form.date,
            time: form.time,
            endTime: form.endTime,
            latitude: form.latitude,
            longitude: form.longitude,
            capacity,
          }),
        },
      );
      const body = await result.json().catch(() => null);
      if (!result.ok || !body?.ok) {
        throw new Error(
          body?.message ||
          `Community Event proposal failed (HTTP ${result.status}).`,
        );
      }

      setForm(initialForm);
      setLocalPhotoFiles([null, null, null]);
      setLocalPhotoPreviews(["", "", ""]);
      setCredentialFile(null);
      setCredentialMimeType("");
      setCredentialPreview("");
      setCredentialError("");
      setCustomVenue(false);
      setCustomCapacity(false);
      setSection("mine");

      setNotice(
        "Proposal submitted! Please wait for Admin/LGU review."
      );
    } catch (error) {
      // Keep the underlying Firebase error visible for diagnosis. Firestore
      // returns a generic permission-denied for failing Security Rules, so
      // avoid claiming the rules are missing or asking users to open access.
      const firebaseCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";
      const firebaseMessage =
        error instanceof Error ? error.message : String(error);

      console.error("[Community Events] Proposal submission failed", {
        operation: "create",
        collection: "communityEventProposals",
        code: firebaseCode || "unknown",
        message: firebaseMessage,
        accountMode: mode,
        residentAccessEnabled: canPropose,
        // Only field sizes and counts. No name, UID, private media, or tokens.
        payloadShape: {
          titleLength: title.length,
          descriptionLength: description.length,
          volunteerTasksLength: form.volunteerTasks.trim().length,
          lookingForLength: selectedRoles.join(", ").length,
          requiredRolesCount: selectedRoles.length,
          requiredSkillsCount: form.requiredSkills.length,
          photosCount: form.photoUrls.filter(Boolean).length + localPhotoFiles.filter(Boolean).length,
          hasVideo: Boolean(videoUrl),
          capacityIsInteger: Number.isInteger(capacity),
        },
      });

      if (
        firebaseCode === "permission-denied" ||
        firebaseCode === "firestore/permission-denied" ||
        firebaseMessage.includes("Missing or insufficient permissions")
      ) {
        setNotice(
          "Proposal was rejected by Firestore (permission-denied). Open DevTools Console for the original Firebase error and field-size diagnostics. Your account access alone does not guarantee the proposal passes every create rule."
        );
      } else {
        setNotice(
          firebaseCode
            ? `Proposal failed (${firebaseCode}): ${firebaseMessage}`
            : errorText(error)
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // Join or decline an official Community Event
  const respondToEvent = async (
    event: CommunityEvent,
    decision: "joined" | "declined"
  ) => {
    if (
      !user ||
      !profile ||
      !isVolunteer ||
      busyEvent
    ) {
      return;
    }

    // Prevent volunteers from joining
    // or declining an event they proposed.
    if (event.proposedBy === user.uid) {
      setNotice(
        "You proposed this event. You cannot join or decline your own event as a Volunteer."
      );
      return;
    }

    setBusyEvent(event.id);
    setNotice("");

    try {
      const eventRef = doc(
        db,
        "communityEvents",
        event.id
      );

      const participantRef = doc(
        db,
        "communityEventParticipants",
        `${event.id}_${user.uid}`
      );

      await runTransaction(
        db,
        async (transaction) => {
          const eventDoc =
            await transaction.get(eventRef);

          const participantDoc =
            await transaction.get(participantRef);

          if (!eventDoc.exists()) {
            throw new Error(
              "Event no longer exists."
            );
          }

          const current = eventDoc.data();

          // Check again against the latest
          // Firestore event document.
          if (current.proposedBy === user.uid) {
            throw new Error(
              "You proposed this event. You cannot join or decline your own event as a Volunteer."
            );
          }

          const isOpen =
            current.publicationStatus ===
              "published" &&
            ["upcoming", "active"].includes(
              current.status
            );

          if (!isOpen) {
            throw new Error(
              "This event is no longer open for volunteers."
            );
          }

          const previous =
            participantDoc.exists()
              ? participantDoc.data().status
              : null;

          if (previous === "joined") {
            throw new Error(
              "You already joined this event."
            );
          }

          if (decision === "joined") {
            const count = Number(
              current.participantsCount || 0
            );

            const max = Number(
              current.capacity || 0
            );

            if (max < 1 || count >= max) {
              throw new Error(
                "This event is already full."
              );
            }

            transaction.set(participantRef, {
              eventId: event.id,
              uid: user.uid,
              fullName: String(
                profile.fullName || "Volunteer"
              ),
              status: "joined",
              joinedAt: serverTimestamp(),
              declinedAt: null,
              checkedInAt: null,
              checkedOutAt: null,
              attendanceVerified: false,
              attendanceVerifiedAt: null,
              updatedAt: serverTimestamp(),
            });

            transaction.update(eventRef, {
              participantsCount: count + 1,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.set(participantRef, {
              eventId: event.id,
              uid: user.uid,
              status: "declined",
              declinedAt: serverTimestamp(),
              joinedAt: null,
              updatedAt: serverTimestamp(),
            });
          }
        }
      );

      setNotice(
        decision === "joined"
          ? "Joined successfully! Wait for event attendance instructions."
          : "Event declined. You can still join later while slots are open."
      );
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusyEvent("");
    }
  };

  // Secure volunteer self Time In / Time Out. Only server timestamps are
  // written. All eligibility decisions are rechecked in the transaction.
  const recordSelfAttendance = async (
    event: CommunityEvent,
    action: SelfAttendanceAction
  ) => {
    if (!user || !isVolunteer || attendanceBusy || busyEvent) return;

    setAttendanceConfirmation(null);
    setAttendanceFeedback(null);
    setAttendanceBusy(event.id);

    try {
      const eventRef = doc(db, "communityEvents", event.id);
      const participantRef = doc(
        db,
        "communityEventParticipants",
        `${event.id}_${user.uid}`
      );

      await runTransaction(db, async (transaction) => {
        const eventSnapshot = await transaction.get(eventRef);
        const participantSnapshot = await transaction.get(participantRef);

        if (!eventSnapshot.exists() || !participantSnapshot.exists()) {
          throw new Error("Event or your participation record was not found.");
        }

        const currentEvent = eventSnapshot.data();
        const currentParticipation = participantSnapshot.data();

        if (
          currentEvent.publicationStatus !== "published" ||
          currentEvent.status !== "active"
        ) {
          throw new Error("Time In and Time Out are only available while the event is ongoing.");
        }
        if (currentEvent.proposedBy === user.uid) {
          throw new Error("You cannot record volunteer attendance for your own proposed event.");
        }
        if (
          currentParticipation.eventId !== event.id ||
          currentParticipation.uid !== user.uid ||
          currentParticipation.status !== "joined"
        ) {
          throw new Error("Only volunteers joined to this event can record attendance.");
        }
        if (currentParticipation.attendanceVerified === true) {
          throw new Error("This attendance has already been verified by Admin/LGU.");
        }

        if (action === "check-in") {
          if (currentParticipation.checkedInAt || currentParticipation.checkedOutAt) {
            throw new Error("Your Time In has already been recorded.");
          }
          transaction.update(participantRef, {
            checkedInAt: serverTimestamp(),
            checkedOutAt: null,
            updatedAt: serverTimestamp(),
          });
        } else {
          if (!currentParticipation.checkedInAt || currentParticipation.checkedOutAt) {
            throw new Error("You must Time In first, and can Time Out only once.");
          }
          transaction.update(participantRef, {
            checkedOutAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      setAttendanceFeedback({
        eventId: event.id,
        type: "success",
        message: action === "check-in"
          ? "Time In recorded using server time. Remember to Time Out when your participation ends."
          : "Time Out recorded using server time. Your hours are pending Admin/LGU verification.",
      });
    } catch (error) {
      setAttendanceFeedback({
        eventId: event.id,
        type: "error",
        message: errorText(error),
      });
    } finally {
      setAttendanceBusy("");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    (!canPropose && !isVolunteer)
  ) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>
          Community Events is available in
          Resident or approved Volunteer mode.
        </Text>
      </View>
    );
  }

  // Original mobile event card preserved as-is.
  // Event cards for Resident and Volunteer modes
  const renderNativeEvent = (
    event: CommunityEvent
  ) => {
    const participation =
      participationMap.get(event.id);

    const joined =
      participation?.status === "joined";

    const declined =
      participation?.status === "declined";

    // Same UID as the original proposer.
    const isOwnProposal =
      !!user &&
      event.proposedBy === user.uid;

    const full =
      Number(event.participantsCount || 0) >=
      Number(event.capacity || 0);

    const open =
      event.status === "upcoming" ||
      event.status === "active";

    const expanded =
      expandedEvent === event.id;

    return (
      <View
        key={event.id}
        style={styles.eventCard}
      >
        <View style={styles.eventTop}>
          <View style={styles.eventIcon}>
            <Ionicons
              name={categoryIcon(event.category)}
              size={24}
              color={colors.green}
            />
          </View>

          <View
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <Text style={styles.categoryText}>
              {event.category ||
                "Community Service"}
            </Text>

            <Pressable accessibilityRole="button" accessibilityLabel={"Open " + event.title + " event details"} onPress={() => setExpandedEvent(expanded ? null : event.id)}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={{fontSize:11,color:"#087F75",marginTop:4,fontWeight:"700"}}>{expanded ? "Tap to close details" : "Tap title for details and directions"}</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.tag,
              event.status === "completed" &&
                styles.tagMuted,
            ]}
          >
            <Text style={styles.tagText}>
              {event.status === "completed"
                ? "COMPLETED"
                : event.status === "active"
                  ? "ONGOING"
                  : "UPCOMING"}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Ionicons
            name="calendar-outline"
            color={colors.muted}
            size={14}
          />

          <Text style={styles.metaText}>
            {prettyDate(
              event.date,
              event.time
            )}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons
            name="location-outline"
            color={colors.muted}
            size={14}
          />

          <Text style={styles.metaText}>
            {event.location}
            {event.barangay
              ? `, ${event.barangay}`
              : ""}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.slots}>
            {Number(
              event.participantsCount || 0
            )}
            /{Number(event.capacity || 0)} volunteers
          </Text>

          <Pressable
            style={styles.linkButton}
            onPress={() =>
              setExpandedEvent(
                expanded ? null : event.id
              )
            }
          >
            <Text style={styles.linkText}>
              {expanded
                ? "Less details"
                : "View details"}
            </Text>
          </Pressable>
        </View>

        {expanded && (
          <View style={styles.descriptionBox}>
            <Text style={{fontSize:11,fontWeight:"900",color:"#087F75",marginBottom:7}}>ABOUT THIS EVENT</Text>
            <Text style={styles.description}>
              {event.description || "No additional details provided."}
            </Text>
            <View style={{marginTop:12,backgroundColor:"#F2FAF8",padding:12,borderRadius:10,gap:9}}>
              <Text style={{fontSize:13,color:"#153E49",fontWeight:"900"}}>Event Location &amp; Directions</Text>
              <Text style={{fontSize:12,color:"#577987"}}>{eventScheduleLabel(event)}</Text>
              <Text style={{fontSize:12,color:"#577987"}}>{event.location}{event.barangay ? ", " + event.barangay : ""}, San Jose del Monte, Bulacan</Text>
              {!eventHasCoordinates(event) && <Text style={{fontSize:11,color:"#956619"}}>Approximate address — confirm the exact meeting point with Admin/LGU.</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={"Navigate to " + event.title + " in Google Maps"}
                onPress={() => void Linking.openURL(googleMapsNavigationUrl(event))}
                style={{backgroundColor:"#087F75",padding:13,borderRadius:9,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8}}>
                <Ionicons name="navigate-outline" size={17} color="#FFFFFF"/>
                <Text style={{color:"#FFFFFF",fontWeight:"800",fontSize:12}}>Open Directions in Google Maps</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Owner sees the event, but no action buttons */}
        {isVolunteer && isOwnProposal && (
          <View style={styles.ownerNotice}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={colors.green}
            />

            <Text style={styles.ownerNoticeText}>
              You proposed this event. You
              cannot join or decline it as a
              Volunteer.
            </Text>
          </View>
        )}

        {/* Other volunteers can join normally */}
        {isVolunteer && !isOwnProposal && (
          <View style={styles.actionRow}>
            <Pressable
              disabled={
                busyEvent === event.id ||
                joined ||
                !open ||
                full
              }
              style={[
                styles.primaryButton,
                (joined ||
                  !open ||
                  full) &&
                  styles.disabledButton,
              ]}
              onPress={() =>
                void respondToEvent(
                  event,
                  "joined"
                )
              }
            >
              <Text style={styles.primaryButtonText}>
                {busyEvent === event.id
                  ? "Please wait..."
                  : joined
                    ? "Joined"
                    : !open
                      ? "Closed"
                      : full
                        ? "Full"
                        : "Join Event"}
              </Text>
            </Pressable>

            {!joined && open && (
              <Pressable
                disabled={
                  busyEvent === event.id
                }
                style={styles.secondaryButton}
                onPress={() =>
                  void respondToEvent(
                    event,
                    "declined"
                  )
                }
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  {declined
                    ? "Declined"
                    : "Decline"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {joined && (
          <Text style={styles.helper}>
            Attendance and certificates
            are subject to Admin verification
            after event completion.
          </Text>
        )}
        {joined && isVolunteer && !isOwnProposal && (
          <View style={styles.nativeAttendancePanel}>
            <View style={styles.lockedSectionHeading}>
              <Ionicons name="time-outline" size={19} color="#078C80" />
              <Text style={styles.lockedSectionTitle}>My Attendance</Text>
            </View>
            <Text style={styles.lockedAttendanceHistoryDate}>Time In: {prettyAttendanceTime(participation?.checkedInAt)} · Time Out: {prettyAttendanceTime(participation?.checkedOutAt)}</Text>
            <Text style={styles.lockedAttendanceHistoryDate}>{participation?.attendanceVerified ? `Verified · ${formatHours(durationMinutes(participation))} credited` : participation?.checkedOutAt ? "Pending Admin/LGU verification" : participation?.checkedInAt ? "Time In recorded" : "Waiting for Time In"}</Text>
            {!participation?.attendanceVerified && event.status === "active" && !participation?.checkedOutAt && (
              attendanceConfirmation?.eventId === event.id ? (
                <View style={styles.webAttendanceConfirmBox}>
                  <Text style={styles.webAttendanceConfirmText}>Confirm {attendanceConfirmation.action === "check-in" ? "Time In" : "Time Out"} using the server time?</Text>
                  <View style={styles.webAttendanceConfirmButtons}>
                    <Pressable onPress={() => setAttendanceConfirmation(null)} style={styles.webAttendanceCancelButton}><Text style={styles.webAttendanceCancelText}>Cancel</Text></Pressable>
                    <Pressable disabled={!!attendanceBusy} onPress={() => void recordSelfAttendance(event, attendanceConfirmation.action)} style={styles.webAttendanceActionButton}>
                      <Text style={styles.webAttendanceActionButtonText}>{attendanceBusy ? "Saving..." : "Confirm"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable accessibilityRole="button" disabled={!!attendanceBusy}
                  onPress={() => setAttendanceConfirmation({ eventId: event.id, action: participation?.checkedInAt ? "check-out" : "check-in" })}
                  style={styles.webAttendanceActionButton}>
                  <Ionicons name={participation?.checkedInAt ? "log-out-outline" : "log-in-outline"} size={18} color="white" />
                  <Text style={styles.webAttendanceActionButtonText}>{attendanceBusy ? "Saving..." : participation?.checkedInAt ? "Time Out" : "Time In"}</Text>
                </Pressable>
              )
            )}
            {event.status === "upcoming" && <Text style={styles.webAttendanceHint}>Time In opens when Admin/LGU starts the event.</Text>}
            {attendanceFeedback?.eventId === event.id && <Text style={styles.webAttendanceHint}>{attendanceFeedback.message}</Text>}
          </View>
        )}
      </View>
    );
  };

  // One tidy card per event. Details are INSIDE the selected card, never in a detached box.
  // Only one card can expand at a time; the main event list stays easy to scan.
  const renderEvent = (event: CommunityEvent) => {
    const participation = participationMap.get(event.id);
    const joined = participation?.status === "joined";
    const owned = event.proposedBy === user?.uid;
    const full = Number(event.participantsCount || 0) >= Number(event.capacity || 0);
    const open = event.status === "active" || event.status === "upcoming";
    const detailsOpen = expandedEvent === event.id;
    const selected = detailsOpen;
    const cover = eventCover(event);
    const toggleDetails = () => {
      setExpandedEvent(detailsOpen ? null : event.id);
      setRouteEventId(null);
      setRouteOrigin(null);
      setRouteNotice("");
    };

    return (
      <View key={event.id} style={[styles.lockedEventShell, selected && styles.lockedEventSelected]}>
        <View style={[styles.lockedEventRow, webRowNarrow && styles.lockedEventVertical]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${detailsOpen ? "Hide" : "Show"} details for ${event.title}`}
            onPress={toggleDetails}
            style={[styles.lockedEventPicture, webRowNarrow && styles.lockedPictureNarrow]}
          >
            {cover ? (
              <Image source={{ uri: cover }} style={styles.lockedImageFill} resizeMode="cover" />
            ) : (
              <LinearGradient colors={["#C4E8DB", "#E5F8F1", "#9ACCC0"]} style={styles.lockedImageFallback}>
                <Ionicons name={categoryIcon(event.category)} size={44} color="#078477" />
                <Text style={styles.lockedFallbackLabel}>{event.category}</Text>
              </LinearGradient>
            )}
            <View style={styles.lockedImageStatus}>
              <Ionicons name={eventStatusIcon(event.status)} color="#078B71" size={13} />
              <Text style={styles.lockedImageStatusText}>{eventStatusText(event.status)}</Text>
            </View>
          </Pressable>
          <View style={styles.lockedEventInfo}>
            <Pressable accessibilityRole="button" accessibilityLabel={(detailsOpen ? "Close " : "Open ") + event.title + " details and map"}
              accessibilityState={{ expanded: detailsOpen }} onPress={toggleDetails} style={styles.lockedEventSummaryClick}>
              <View style={styles.lockedEventTop}>
              <Text style={styles.lockedEventName} numberOfLines={2}>{event.title}</Text>
              <View style={styles.lockedSlotsPill}>
                <Ionicons name="people-outline" color="#078777" size={14} />
                <Text style={styles.lockedSlotsText}>{Math.max(0, Number(event.capacity || 0) - Number(event.participantsCount || 0))} slots left</Text>
              </View>
            </View>
            <View style={styles.lockedSmallTag}>
              <Ionicons name={categoryIcon(event.category)} color="#078477" size={13} />
              <Text style={styles.lockedSmallTagText}>{event.category}</Text>
            </View>
            <View style={styles.lockedEventMeta}>
              <Ionicons name="calendar-outline" size={14} color="#6B7F93" />
              <Text style={styles.lockedEventMetaText}>{eventScheduleLabel(event)}</Text>
            </View>
            <View style={styles.lockedEventMeta}>
              <Ionicons name="location-outline" size={14} color="#6B7F93" />
              <Text style={styles.lockedEventMetaText} numberOfLines={2}>{event.location}{event.barangay ? `, ${event.barangay}` : ""}</Text>
            </View>
            <View style={styles.lockedEventMeta}>
              <Ionicons name="people-outline" size={14} color="#6B7F93" />
              <Text style={styles.lockedEventMetaText}>{Number(event.participantsCount || 0)} / {Number(event.capacity || 0)} volunteers</Text>
            </View>
            <View style={styles.lockedEventTapHint}>
              <Ionicons name={detailsOpen ? "chevron-up-circle-outline" : "chevron-down-circle-outline"} size={15} color="#087F75" />
              <Text style={styles.lockedEventTapHintText}>{detailsOpen ? "Tap to close" : "Tap to see event details and Google Maps"}</Text>
            </View>
            </Pressable>
            <View style={styles.lockedRowActions}>
              <Pressable accessibilityRole="button" onPress={toggleDetails} style={styles.lockedSecondaryAction}>
                <Text style={styles.lockedSecondaryActionText}>{detailsOpen ? "Close Details" : "Details & Map"}</Text>
                <Ionicons name={detailsOpen ? "chevron-up" : "arrow-forward"} size={14} color="#066E69" />
              </Pressable>
              {isVolunteer && !owned && !joined && open && !full && (
                <Pressable accessibilityRole="button" disabled={!!busyEvent}
                  onPress={() => void respondToEvent(event, "joined")}
                  style={[styles.lockedPrimaryAction, !!busyEvent && styles.webButtonDisabled]}>
                  <Text style={styles.lockedPrimaryActionText}>{busyEvent === event.id ? "Joining..." : "Join Event"}</Text>
                </Pressable>
              )}
              {joined && <View style={styles.lockedJoined}>
                <Ionicons name="checkmark-circle" color="#078877" size={14} />
                <Text style={styles.lockedJoinedText}>Joined</Text>
              </View>}
            </View>
          </View>
        </View>
        {detailsOpen && (
          <View style={styles.lockedInlineDetails}>
            <View style={styles.volunteerDetailHeader}>
              <View style={styles.lockedSectionHeading}>
                <Ionicons name="information-circle-outline" size={19} color="#07877A" />
                <Text style={styles.lockedInlineTitle}>Event Details</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={"Close details for " + event.title}
                onPress={toggleDetails} style={styles.volunteerDetailClose}>
                <Text style={styles.volunteerDetailCloseText}>Close</Text>
                <Ionicons name="close-outline" size={17} color="#647E87" />
              </Pressable>
            </View>
            <View style={styles.volunteerOverviewBox}>
              <Text style={styles.volunteerOverviewLabel}>ABOUT THE EVENT</Text>
              <Text style={styles.lockedAboutText}>
                {event.description?.trim() || "No additional description was provided for this event."}
              </Text>
              <View style={styles.volunteerEventFacts}>
                <View style={styles.volunteerEventFact}>
                  <Ionicons name="calendar-outline" size={19} color="#088277" />
                  <View style={styles.volunteerEventFactText}>
                    <Text style={styles.volunteerEventFactCaption}>DATE & TIME</Text>
                    <Text style={styles.volunteerEventFactValue}>{eventScheduleLabel(event)}</Text>
                  </View>
                </View>
                <View style={styles.volunteerEventFact}>
                  <Ionicons name="location-outline" size={19} color="#088277" />
                  <View style={styles.volunteerEventFactText}>
                    <Text style={styles.volunteerEventFactCaption}>EVENT MEETING PLACE</Text>
                    <Text style={styles.volunteerEventFactValue}>{event.location}{event.barangay ? ", " + event.barangay : ""}</Text>
                  </View>
                </View>
              </View>
            </View>
            {isVolunteer && owned && <View style={styles.webOwnershipNotice}>
              <Ionicons name="information-circle-outline" size={19} color="#0B7C70" />
              <Text style={styles.webOwnershipText}>You proposed this event. You cannot join it as a volunteer.</Text>
            </View>}
            {isVolunteer && !owned && !joined && open && (
              <View style={styles.webDetailActions}>
                <Pressable disabled={!!busyEvent || full}
                  onPress={() => void respondToEvent(event, "joined")}
                  style={[styles.webJoinButton, (!!busyEvent || full) && styles.webButtonDisabled]}>
                  <Ionicons name="people-outline" color="white" size={18} />
                  <Text style={styles.webJoinButtonText}>{busyEvent === event.id ? "Please wait..." : full ? "Event full" : "Join Event"}</Text>
                </Pressable>
                <Pressable disabled={!!busyEvent}
                  onPress={() => void respondToEvent(event, "declined")}
                  style={styles.webDeclineButton}>
                  <Text style={styles.webDeclineButtonText}>Decline</Text>
                </Pressable>
              </View>
            )}
            {isVolunteer && joined && <View style={styles.webJoinedBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#09876A" />
              <Text style={styles.webJoinedBannerText}>You joined this event. Attendance is subject to Admin/LGU verification.</Text>
            </View>}
            {isVolunteer && !owned && !joined && !open && <View style={styles.webClosedBanner}>
              <Ionicons name="lock-closed-outline" size={18} color="#657989" />
              <Text style={styles.webClosedText}>This event is closed for new volunteers.</Text>
            </View>}
            {/* The organizer's live GPS is private and shown ONLY after Join.
                The public event location and route stay available separately. */}
            {isVolunteer && joined && (
              <CommunityEventLiveLocation
                eventId={event.id}
                ownerUid={event.proposedBy}
                currentUid={user?.uid}
                status={event.status}
                isResidentOwner={false}
                isJoinedVolunteer={joined}
              />
            )}
            {/* Event map belongs to the expanded event details, not the My Attendance rail. */}
            <View style={styles.lockedEventMapCard}>
              <View style={styles.lockedSectionHeading}>
                <View style={styles.lockedSectionIcon}><Ionicons name="location" size={21} color="#078C80" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lockedSectionTitle}>Location &amp; Directions</Text>
                  <Text style={styles.lockedSectionSub}>Meeting point and navigation for volunteers</Text>
                </View>
              </View>
              <Text style={styles.lockedMapAddress}>{event.location}{event.barangay ? `, ${event.barangay}` : ""}, San Jose del Monte, Bulacan</Text>
              <View style={styles.lockedMapFrame}>{renderWebMap(event)}</View>
              {!eventHasCoordinates(event) && <View style={styles.lockedMapHintRow}>
                <Ionicons name="information-circle-outline" size={14} color="#7C929E" />
                <Text style={styles.lockedMapWarning}>Approximate location · confirm the exact meeting point with Admin/LGU</Text>
              </View>}
              {routeEventId === event.id && routeOrigin && googleMapsEmbedKey ? (
                <View style={styles.lockedRouteReady}>
                  <Ionicons name="navigate-circle" size={17} color="#078371" />
                  <Text style={styles.lockedRouteReadyText}>Driving route preview from your permitted device location</Text>
                  <Pressable accessibilityRole="button" onPress={() => { setRouteEventId(null); setRouteNotice(""); }}>
                    <Text style={styles.lockedRouteReset}>Location map</Text>
                  </Pressable>
                </View>
              ) : null}
              {!!routeNotice && <View style={styles.lockedRouteHintRow}>
                <Ionicons name="information-circle-outline" size={15} color="#6F8794" />
                <Text style={styles.lockedRouteNotice}>{routeNotice}</Text>
              </View>}
              <View style={styles.lockedMapActions}>
                {!!googleMapsEmbedKey && (
                  <Pressable style={styles.lockedMapOutline} accessibilityRole="button" accessibilityLabel="Show the route inside VolunServe" disabled={routeLoading}
                    onPress={() => showRouteInVolunServe(event)}>
                    {routeLoading ? <ActivityIndicator size="small" color="#08796F" /> : <Ionicons name="map-outline" size={16} color="#0B5963" />}
                    <Text style={styles.lockedMapOutlineText}>{routeLoading ? "Locating..." : "Show Route Here"}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.lockedMapSolid} accessibilityRole="button" accessibilityLabel="Open directions in Google Maps"
                  onPress={() => void Linking.openURL(googleMapsNavigationUrl(event))}>
                  <Ionicons name="navigate-outline" size={16} color="white" />
                  <Text style={styles.lockedMapSolidText}>{eventHasCoordinates(event) ? "Navigate to GPS Pin" : "Open in Google Maps"}</Text>
                </Pressable>
              </View>
              <Text style={styles.lockedMapFootnote}>{googleMapsEmbedKey ? "In-app route preview needs location permission. " : ""}Google Maps opens directions to this event. Your current GPS position is not saved in Firestore.</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const residentGridColumns = width >= 1540 ? 3 : width >= 1100 ? 2 : 1;
  const residentGridWidth = (residentGridColumns === 3 ? "31.9%" : residentGridColumns === 2 ? "48.6%" : "100%") as `${number}%`;
  const residentDetailEvent = residentDetailsId ? events.find((event) => event.id === residentDetailsId) : null;

  const renderResidentEventCard = (event: CommunityEvent) => {
    const cover = eventCover(event);
    return (
      <View key={event.id} style={[styles.ruiCard, { width: residentGridWidth }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View details of ${event.title}`}
          onPress={() => { setResidentDetailsId(event.id); setResidentDetailTab("details"); }}>
          <View style={styles.ruiCardCover}>
            {cover ? <Image source={{ uri: cover }} style={styles.ruiCoverImage} resizeMode="cover" />
              : <LinearGradient colors={["#B4E5CF", "#7FC9AF", "#3A9C83"]} style={styles.ruiCoverFallback}>
                  <Ionicons name={categoryIcon(event.category)} size={52} color="#E9FFF6" />
                  <Text style={styles.ruiCoverFallbackText}>{event.category}</Text>
                </LinearGradient>}
            <View style={styles.ruiImageStatus}><Text style={styles.ruiImageStatusText}>{eventStatusText(event.status)}</Text></View>
          </View>
        </Pressable>
        <View style={styles.ruiCardBody}>
          <Text style={styles.ruiCardTitle} numberOfLines={2}>{event.title}</Text>
          <View style={styles.ruiTagRow}>
            <Text style={styles.ruiCategoryTag}>{event.category}</Text>
            {!!event.barangay && <Text style={styles.ruiBarangayTag}>{event.barangay}</Text>}
          </View>
          <View style={styles.ruiInfoLine}><Ionicons name="calendar-outline" size={14} color="#58738A" /><Text style={styles.ruiMeta}>{eventScheduleLabel(event)}</Text></View>
          <View style={styles.ruiInfoLine}><Ionicons name="location-outline" size={14} color="#58738A" /><Text numberOfLines={2} style={styles.ruiMeta}>{event.location}{event.barangay ? `, ${event.barangay}` : ""}</Text></View>
          <View style={styles.ruiInfoLine}><Ionicons name="people-outline" size={14} color="#58738A" /><Text style={styles.ruiMeta}>{Number(event.participantsCount || 0)} / {Number(event.capacity || 0)} volunteers</Text></View>
          <Pressable style={styles.ruiPrimary} onPress={() => { setResidentDetailsId(event.id); setResidentDetailTab("details"); }} accessibilityRole="button">
            <Text style={styles.ruiPrimaryText}>View Details</Text><Ionicons name="arrow-forward" color="white" size={16} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderResidentEventDetail = (event: CommunityEvent) => {
    const pictures = [eventCover(event), ...(Array.isArray((event as any).photoUrls) ? (event as any).photoUrls : [])]
      .filter((value, idx, arr): value is string => !!value && arr.indexOf(value) === idx);
    const needed = Array.isArray((event as any).requiredRoles) ? (event as any).requiredRoles as string[] : [];
    const skills = Array.isArray((event as any).requiredSkills) ? (event as any).requiredSkills as string[] : [];
    return <View style={styles.ruiDetailsCard}>
      <Pressable style={styles.ruiBack} onPress={() => setResidentDetailsId(null)}><Ionicons name="arrow-back" size={16} color="#0B786F"/><Text style={styles.ruiBackText}>Back to Events</Text></Pressable>
      <View style={[styles.ruiDetailIntro, isCompact && { flexDirection: "column" }]}>
        {pictures.length ? <Image source={{uri:pictures[0]}} style={styles.ruiDetailPhoto} resizeMode="cover" />
          : <LinearGradient colors={["#CBF4E4", "#78C7AC"]} style={styles.ruiDetailPhoto}><Ionicons name={categoryIcon(event.category)} size={62} color="#077D6F" /></LinearGradient>}
        <View style={styles.ruiDetailOverview}>
          <View style={styles.ruiTagRow}><Text style={styles.ruiCategoryTag}>{eventStatusText(event.status)}</Text><Text style={styles.ruiBarangayTag}>{event.category}</Text></View>
          <Text style={styles.ruiDetailTitle}>{event.title}</Text>
          <View style={styles.ruiInfoLine}><Ionicons name="calendar-outline" size={16} color="#60798A"/><Text style={styles.ruiMeta}>{prettyDate(event.date,event.time)}</Text></View>
          <View style={styles.ruiInfoLine}><Ionicons name="location-outline" size={16} color="#60798A"/><Text style={styles.ruiMeta}>{event.location}{event.barangay ? `, ${event.barangay}` : ""}</Text></View>
          <View style={styles.ruiInfoLine}><Ionicons name="people-outline" size={16} color="#60798A"/><Text style={styles.ruiMeta}>{Number(event.participantsCount||0)} / {Number(event.capacity||0)} volunteers</Text></View>
          <View style={styles.ruiInfoLine}><Ionicons name="shield-checkmark-outline" size={16} color="#60798A"/><Text style={styles.ruiMeta}>Published by Admin/LGU · Join through approved Volunteer mode</Text></View>
        </View>
      </View>
      <View style={styles.ruiDetailTabs}>{([ ["details","Details"], ["map","Location & Map"], ["volunteers","Volunteers"], ["media","Media"] ] as const).map(([key,title])=><Pressable key={key} onPress={()=>setResidentDetailTab(key)} style={[styles.ruiDetailTab,residentDetailTab===key && styles.ruiDetailTabActive]}><Text style={[styles.ruiDetailTabText,residentDetailTab===key&&styles.ruiDetailTabTextActive]}>{title}</Text></Pressable>)}</View>
      {residentDetailTab==="details" && <View style={styles.ruiDetailContent}>
        <Text style={styles.ruiSectionTitle}>Description</Text><Text style={styles.ruiParagraph}>{event.description?.trim()||"No description provided."}</Text>
        <Text style={styles.ruiSectionTitle}>Type of Help / Event</Text><Text style={styles.ruiParagraph}>{event.category}</Text>
        <Text style={styles.ruiSectionTitle}>What Volunteers Will Do</Text><Text style={styles.ruiParagraph}>{(event as any).volunteerTasks || "Contact the organizer for task details."}</Text>
        <Text style={styles.ruiSectionTitle}>Required Roles / Occupation</Text><View style={styles.ruiTagRow}>{(needed.length?needed:["General Volunteer"]).map((name)=><Text key={name} style={styles.ruiRequirementTag}>{name}</Text>)}</View>
        {!!skills.length && <><Text style={styles.ruiSectionTitle}>Helpful Skills</Text><View style={styles.ruiTagRow}>{skills.map(name=><Text key={name} style={styles.ruiRequirementTag}>{name}</Text>)}</View></>}
        {!!(event as any).qualificationNotes && <><Text style={styles.ruiSectionTitle}>Qualifications / Supervision</Text><Text style={styles.ruiParagraph}>{(event as any).qualificationNotes}</Text></>}
        {!!(event as any).whatToBring && <><Text style={styles.ruiSectionTitle}>What to Bring</Text><Text style={styles.ruiParagraph}>{(event as any).whatToBring}</Text></>}
      </View>}
      {residentDetailTab==="map" && <View style={styles.ruiDetailContent}>
        <Text style={styles.ruiSectionTitle}>Event Venue & Directions</Text>
        <Text style={styles.ruiParagraph}>{eventDestination(event)}</Text>
        {event.proposedBy === user?.uid && (
          <CommunityEventLiveLocation
            eventId={event.id}
            ownerUid={event.proposedBy}
            currentUid={user?.uid}
            status={event.status}
            isResidentOwner={canPropose}
            isJoinedVolunteer={false}
          />
        )}
        {renderWebMap(event)}
        <Pressable style={styles.ruiPrimary} onPress={()=>void Linking.openURL(googleMapsDirectionsUrl(event))}>
          <Text style={styles.ruiPrimaryText}>Open in Google Maps</Text>
          <Ionicons name="navigate-outline" size={16} color="white"/>
        </Pressable>
      </View>}
      {residentDetailTab==="volunteers" && <View style={styles.ruiDetailContent}><Text style={styles.ruiSectionTitle}>Volunteer Participation</Text><Text style={styles.ruiParagraph}>{Number(event.participantsCount||0)} of {Number(event.capacity||0)} slots filled. Approved volunteers can join in Volunteer Mode. Resident profiles are not disclosed here.</Text></View>}
      {residentDetailTab==="media" && <View style={styles.ruiDetailContent}><Text style={styles.ruiSectionTitle}>Location / Activity Photos</Text><View style={styles.ruiMediaGallery}>{pictures.map((url,index)=><Image key={index} source={{uri:url}} style={styles.ruiGalleryPhoto} resizeMode="cover"/>)}</View>{pictures.length===0&&<Text style={styles.ruiParagraph}>No public photos have been provided.</Text>}{!!(event as any).videoUrl&&videoLinkSupported((event as any).videoUrl)&&<Pressable onPress={()=>void Linking.openURL((event as any).videoUrl)} style={styles.ruiPrimary}><Text style={styles.ruiPrimaryText}>View Optional Event Video</Text><Ionicons name="play-circle-outline" size={16} color="white"/></Pressable>}</View>}
    </View>;
  };

  // Route preview uses the supported Google Maps Embed API when configured.
  // Otherwise the old address-based map continues to show the real saved venue.
  const renderWebMap = (event: CommunityEvent) => {
    if (Platform.OS !== "web") return null;
    const showRoute = routeEventId === event.id && !!routeOrigin && !!googleMapsEmbedKey;
    return React.createElement("iframe" as any, {
      key: `${event.id}-${showRoute ? "route" : "place"}`,
      title: showRoute ? `Driving route to ${event.title}` : `Map location for ${event.title}`,
      src: showRoute && routeOrigin
        ? googleMapsEmbeddedDirectionsUrl(event, routeOrigin)
        : googleMapsViewUrl(event),
      loading: "lazy",
      referrerPolicy: "strict-origin-when-cross-origin",
      allowFullScreen: true,
      style: { display: "block", width: "100%", height: "100%", border: "0", borderRadius: "11px" },
    });
  };

  return (
    <View style={styles.screen}>
      {Platform.OS === "web" && (
      <ScrollView
        contentContainerStyle={[styles.webContent, isCompact && styles.webContentCompact]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Final locked layout: left events, right live map and attendance. Sidebar lives in app layout. */}
        <View style={[styles.lockedColumns, !webSideBySide && styles.lockedColumnsStack]}>
          <View style={[styles.lockedMain, !webSideBySide && styles.lockedMainStack]}>
            {/* Premium Community Events calendar banner; counts use the existing live state. */}
            <View style={styles.webHero}>
              <CommunityEventHeroArt compact={isCompact || webSideBySide}/>
              <View style={[styles.communityHeroLayout,(isCompact || webSideBySide)&&styles.communityHeroLayoutCompact]}>
                <View style={[styles.communityHeroCopy,(isCompact || webSideBySide)&&styles.communityHeroCopyCompact]}>
                  <Text style={styles.communityHeroEyebrow}>VOLUNSERVE  ·  COMMUNITY ENGAGEMENT</Text>
                  <Text style={[styles.communityHeroTitle,(isCompact || webSideBySide)&&styles.communityHeroTitleCompact]}>Community Events</Text>
                  <Text style={styles.communityHeroTagline}>Connect. Participate. Make a difference.</Text>
                  <Text style={styles.communityHeroDescription}>
                    {isVolunteer
                      ? "Explore local activities, join events, and support your community."
                      : "Discover community activities or propose an event for your barangay."}
                  </Text>
                </View>
                <View style={[styles.communityHeroStats,(isCompact || webSideBySide)&&styles.communityHeroStatsCompact]}>
                  {([
                    {icon:"calendar-outline" as const,value:availableCount,label:"Available Events"},
                    {icon:"people-outline" as const,value:isVolunteer?myEvents.length:proposals.length,label:isVolunteer?"My Joined Events":"My Proposals"},
                    {icon:"ribbon-outline" as const,value:completedCount,label:"Completed Events"},
                  ]).map((metric)=>(
                    <View key={metric.label} style={styles.communityHeroStatCard}>
                      <Ionicons name={metric.icon} size={21} color="#078B6B"/>
                      <View style={styles.communityHeroStatCopy}>
                        <Text style={styles.communityHeroStatNumber} numberOfLines={1}>{metric.value}</Text>
                        <Text style={styles.communityHeroStatLabel} numberOfLines={2}>{metric.label}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.lockedToolbar}>
              <View style={styles.webSectionTabs}>
                <Pressable onPress={() => { setSection("explore"); setResidentDetailsId(null); setNotice(""); }} style={[styles.webSectionTab, section === "explore" && styles.webSectionTabActive]}><Text style={[styles.webSectionTabText, section === "explore" && styles.webSectionTabTextActive]}>Explore Events</Text></Pressable>
                <Pressable onPress={() => { setSection("mine"); setResidentDetailsId(null); setNotice(""); }} style={[styles.webSectionTab, section === "mine" && styles.webSectionTabActive]}><Text style={[styles.webSectionTabText, section === "mine" && styles.webSectionTabTextActive]}>{isVolunteer ? "My Events" : "My Proposals"}</Text></Pressable>
                {canPropose && <Pressable onPress={() => { setSection("propose"); setResidentDetailsId(null); setNotice(""); }} style={[styles.webSectionTab, section === "propose" && styles.webSectionTabActive]}><Text style={[styles.webSectionTabText, section === "propose" && styles.webSectionTabTextActive]}>+ Propose Event</Text></Pressable>}
              </View>
              {section === "explore" && <View style={[styles.webSearchWrap, styles.lockedSearch]}><Ionicons name="search-outline" size={17} color="#6B8392" /><TextInput style={styles.webSearchInput} value={search} onChangeText={setSearch} placeholder="Search community events..." placeholderTextColor="#91A4B1" autoCorrect={false}/></View>}
            </View>
            {!!notice && <View style={styles.webNotice}><Ionicons name="information-circle-outline" size={18} color="#0D8273" /><Text style={styles.webNoticeText}>{notice}</Text></View>}
            {!!recordError && <View style={styles.webError}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><Text style={styles.webErrorText}>{recordError}</Text></View>}
            {section === "explore" && canPropose && !residentDetailsId && (
              <View style={styles.ruiFilterBar}>
                <Pressable style={styles.ruiFilterSelect} onPress={()=>setResidentFilterPicker("category")}><Text style={styles.ruiFilterLabel}>{category === "All" ? "All Categories" : category}</Text><Ionicons name="chevron-down-outline" size={15} color="#668198"/></Pressable>
                <Pressable style={styles.ruiFilterSelect} onPress={()=>setResidentFilterPicker("barangay")}><Text style={styles.ruiFilterLabel}>{residentBarangayFilter}</Text><Ionicons name="chevron-down-outline" size={15} color="#668198"/></Pressable>
                <Pressable style={styles.ruiFilterSelect} onPress={()=>setResidentFilterPicker("status")}><Text style={styles.ruiFilterLabel}>{residentStatusFilter === "All Status" ? "All Status" : residentStatusFilter.toUpperCase()}</Text><Ionicons name="chevron-down-outline" size={15} color="#668198"/></Pressable>
                <Pressable style={styles.ruiFilterSelect} onPress={()=>setDateSort((v)=>v==="soonest"?"latest":"soonest")}><Ionicons name="swap-vertical" size={15} color="#07907C"/><Text style={styles.ruiFilterLabel}>Date ({dateSort==="soonest"?"Soonest":"Latest"})</Text></Pressable>
              </View>
            )}
            {section === "explore" && !canPropose && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.webFilters}>
              {(["All", ...categories] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.webFilterChip, category === item && styles.webFilterChipActive]}>
                {item !== "All" && <Ionicons name={categoryIcon(item)} size={15} color={category === item ? "white" : "#067A70"}/>}
                <Text style={[styles.webFilterText, category === item && styles.webFilterTextActive]}>{item}</Text>
              </Pressable>)}
            </ScrollView>}
            {(section === "explore" || (section === "mine" && isVolunteer)) && <View style={styles.lockedEventList}>
              {!residentDetailEvent && <View style={[styles.webListHeading, styles.lockedListHeading]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.webHeadingTitle}>Community Events</Text>
                  <Text style={styles.webHeadingHint}>{section === "explore" ? "Explore activities and make a difference in San Jose del Monte." : "Your community event participation."}</Text>
                </View>
                <View style={styles.lockedListControls}>
                  <Text style={styles.webEventCount}>{displayEvents.length} event{displayEvents.length === 1 ? "" : "s"}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Sort events by date, currently ${dateSort === "soonest" ? "soonest first" : "latest first"}. Tap to change.`}
                    onPress={() => setDateSort((current) => current === "soonest" ? "latest" : "soonest")}
                    style={styles.lockedSortButton}>
                    <Ionicons name="calendar-outline" size={15} color="#087E74" />
                    <View><Text style={styles.lockedSortCaption}>Sort by Date</Text>
                      <Text style={styles.lockedSortValue}>{dateSort === "soonest" ? "Soonest First" : "Latest First"}</Text></View>
                    <Ionicons name="swap-vertical-outline" size={15} color="#087E74" />
                  </Pressable>
                </View>
              </View>}
              {eventsLoading ? <View style={styles.webLoading}><ActivityIndicator color={colors.green}/></View> :
                eventError ? <View style={styles.webError}><Text style={styles.webErrorText}>{eventError}</Text></View> :
                !displayEvents.length ? <View style={styles.webEmptyCard}><Ionicons name="calendar-outline" size={35} color="#91A6AC"/><Text style={styles.webEmptyTitle}>{section === "mine" ? "No joined events yet" : "No matching community events"}</Text><Text style={styles.webEmptySubtitle}>Browse approved events to see the available activities.</Text></View> :
                <View style={styles.lockedEventListRows}>
                  {canPropose ? (residentDetailEvent ? renderResidentEventDetail(residentDetailEvent) : <View style={styles.ruiCardGrid}>{visibleEvents.map(renderResidentEventCard)}</View>) : visibleEvents.map(renderEvent)}
                  {!residentDetailEvent && displayEvents.length > 6 && (
                    <View style={styles.lockedLoadMoreRow}>
                      {visibleEventCount < displayEvents.length ? (
                        <Pressable accessibilityRole="button" onPress={() => setVisibleEventCount((count) => count + 6)} style={styles.lockedLoadMoreButton}>
                          <Text style={styles.lockedLoadMoreText}>Show More Events ({displayEvents.length - visibleEventCount} remaining)</Text>
                          <Ionicons name="chevron-down-outline" size={16} color="#087B71" />
                        </Pressable>
                      ) : (
                        <Pressable accessibilityRole="button" onPress={() => { setVisibleEventCount(6); setExpandedEvent(null); }} style={styles.lockedLoadMoreButton}>
                          <Text style={styles.lockedLoadMoreText}>Show Fewer Events</Text>
                          <Ionicons name="chevron-up-outline" size={16} color="#087B71" />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>}
            </View>}
          </View>
          {isVolunteer && (section === "explore" || section === "mine") && (
            <View style={[styles.lockedRail, !webSideBySide && styles.lockedRailStack]}>
              <View style={[styles.lockedRailCard, styles.lockedAttendanceRail]}>
                <View style={styles.lockedSectionHeading}>
                  <View style={styles.lockedSectionIcon}><Ionicons name="time-outline" size={22} color="#078C80" /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.lockedSectionTitle}>My Attendance</Text>
                    <Text style={styles.lockedSectionSub}>Your joined events · {myAttendanceEvents.length} total</Text>
                  </View>
                  {selectedParticipation?.attendanceVerified && <View style={styles.lockedAttendanceVerified}><Ionicons name="checkmark-circle" size={14} color="#06856D"/><Text style={styles.lockedAttendanceVerifiedText}>Verified</Text></View>}
                </View>
                {isVolunteer && <View style={styles.lockedAttendanceOverview}>
                  <View style={styles.lockedAttendanceOverviewHeading}>
                    <Text style={styles.lockedAttendanceOverviewTitle}>Joined Events</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Change attendance sort by date"
                      onPress={() => setAttendanceSort((previous) => previous === "latest" ? "oldest" : "latest")}
                      style={styles.lockedAttendanceSort}>
                      <Ionicons name="calendar-outline" size={14} color="#087668" />
                      <Text style={styles.lockedAttendanceSortText}>{attendanceSort === "latest" ? "Newest First" : "Oldest First"}</Text>
                      <Ionicons name="swap-vertical-outline" size={13} color="#087668" />
                    </Pressable>
                  </View>
                  {myAttendanceEvents.length === 0 ? (
                    <Text style={styles.lockedAttendanceEmptyText}>No joined events yet. Explore published community events to participate.</Text>
                  ) : <View style={styles.lockedAttendanceHistory}>
                    {(showAllAttendance ? myAttendanceEvents : myAttendanceEvents.slice(0, 4)).map((item) => {
                      const participation = participationMap.get(item.id);
                      const isCurrent = selectedEvent?.id === item.id;
                      const attendanceState = participation?.attendanceVerified ? "Verified" : participation?.checkedOutAt ? "Timed Out" : participation?.checkedInAt ? "Timed In" : "Joined";
                      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View attendance for ${item.title}`}
                        onPress={() => { setExpandedEvent(item.id); setAttendanceConfirmation(null); }}
                        style={[styles.lockedAttendanceHistoryItem, isCurrent && styles.lockedAttendanceHistoryActive]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.lockedAttendanceHistoryTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.lockedAttendanceHistoryDate}>{eventScheduleLabel(item)}</Text>
                        </View>
                        <View style={[styles.lockedAttendanceHistoryBadge, participation?.attendanceVerified && styles.lockedAttendanceHistoryBadgeVerified]}>
                          <Text style={styles.lockedAttendanceHistoryBadgeText}>{attendanceState}</Text>
                        </View>
                      </Pressable>;
                    })}
                    {myAttendanceEvents.length > 4 && <Pressable accessibilityRole="button" onPress={() => setShowAllAttendance((previous) => !previous)} style={styles.lockedAttendanceMore}>
                      <Text style={styles.lockedAttendanceMoreText}>{showAllAttendance ? "Show fewer" : `Show all ${myAttendanceEvents.length} events`}</Text>
                      <Ionicons name={showAllAttendance ? "chevron-up-outline" : "chevron-down-outline"} size={15} color="#087567" />
                    </Pressable>}
                  </View>}
                </View>}
                {!selectedEvent ? <Text style={styles.webEmptySubtitle}>Select an event to view attendance.</Text> :
                  !isVolunteer ? <Text style={styles.webEmptySubtitle}>Attendance is available for approved volunteers.</Text> :
                  selectedOwned ? <Text style={styles.webEmptySubtitle}>Your proposed event cannot be joined as a volunteer.</Text> :
                  !selectedJoined ? <View style={styles.lockedAttendanceEmpty}><Ionicons name="clipboard-outline" color="#8297A3" size={27}/><Text style={styles.webEmptySubtitle}>Join this event to record your attendance.</Text></View> : <>
                  {isVolunteer && selectedJoined && !selectedOwned && <View style={[styles.webParticipationBox, styles.lockedAttendancePanel]}>
                    <View style={styles.lockedAttendanceEventCard}>
                      {eventCover(selectedEvent) ? (
                        <Image source={{ uri: eventCover(selectedEvent)! }} style={styles.lockedAttendanceThumb} resizeMode="cover" />
                      ) : (
                        <LinearGradient colors={["#BDE4D8", "#E8F6EF"]} style={styles.lockedAttendanceThumbFallback}>
                          <Ionicons name={categoryIcon(selectedEvent.category)} size={28} color="#087D73" />
                        </LinearGradient>
                      )}
                      <View style={styles.lockedAttendanceEventInfo}>
                        <Text style={styles.lockedAttendanceEventTitle} numberOfLines={2}>{selectedEvent.title}</Text>
                        <Text style={styles.lockedAttendanceEventPlace} numberOfLines={2}>{selectedEvent.location}{selectedEvent.barangay ? `, ${selectedEvent.barangay}` : ""}</Text>
                        <View style={styles.lockedAttendanceEventDate}><Ionicons name="calendar-outline" size={12} color="#6B8798"/>
                          <Text style={styles.lockedAttendanceEventDateText}>{eventScheduleLabel(selectedEvent)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.lockedAttendanceGrid}>
                      <View style={styles.lockedAttendanceTile}>
                        <View style={[styles.lockedAttendanceTileIcon, { backgroundColor: "#E6F8EE" }]}><Ionicons name="log-in-outline" size={17} color="#00977A" /></View>
                        <View style={styles.lockedAttendanceTileBody}><Text style={styles.lockedAttendanceTileLabel}>Time In</Text>
                          <Text style={styles.lockedAttendanceTileValue} numberOfLines={1}>{prettyAttendanceTime(selectedParticipation?.checkedInAt)}</Text>
                          <Text style={styles.lockedAttendanceTileSmall}>{prettyAttendanceDay(selectedParticipation?.checkedInAt)}</Text></View>
                      </View>
                      <View style={styles.lockedAttendanceTile}>
                        <View style={[styles.lockedAttendanceTileIcon, { backgroundColor: "#FFF0EF" }]}><Ionicons name="log-out-outline" size={17} color="#EB5555" /></View>
                        <View style={styles.lockedAttendanceTileBody}><Text style={styles.lockedAttendanceTileLabel}>Time Out</Text>
                          <Text style={styles.lockedAttendanceTileValue} numberOfLines={1}>{prettyAttendanceTime(selectedParticipation?.checkedOutAt)}</Text>
                          <Text style={styles.lockedAttendanceTileSmall}>{prettyAttendanceDay(selectedParticipation?.checkedOutAt)}</Text></View>
                      </View>
                      <View style={styles.lockedAttendanceTile}>
                        <View style={[styles.lockedAttendanceTileIcon, { backgroundColor: "#EAF3FF" }]}><Ionicons name="time-outline" size={17} color="#2679DE" /></View>
                        <View style={styles.lockedAttendanceTileBody}><Text style={styles.lockedAttendanceTileLabel}>Recorded Duration</Text>
                          <Text style={styles.lockedAttendanceTileValue}>{getTime(selectedParticipation?.checkedInAt) > 0 && getTime(selectedParticipation?.checkedOutAt) >= getTime(selectedParticipation?.checkedInAt) && getTime(selectedParticipation?.checkedOutAt) > 0
                            ? formatHours(Math.floor((getTime(selectedParticipation?.checkedOutAt) - getTime(selectedParticipation?.checkedInAt)) / 60000)) : "—"}</Text></View>
                      </View>
                      <View style={styles.lockedAttendanceTile}>
                        <View style={[styles.lockedAttendanceTileIcon, { backgroundColor: "#FFF8E8" }]}><Ionicons name="star" size={17} color="#E5A51F" /></View>
                        <View style={styles.lockedAttendanceTileBody}><Text style={styles.lockedAttendanceTileLabel}>Credited Hours</Text>
                          <Text style={styles.lockedAttendanceTileValue}>{formatHours(durationMinutes(selectedParticipation))}</Text></View>
                      </View>
                    </View>
                    <View style={styles.lockedAttendanceVerifier}>
                      <Ionicons name="shield-checkmark-outline" size={15} color="#08766F" />
                      <Text style={styles.lockedAttendanceVerifierText} numberOfLines={3}>
                        {selectedParticipation?.attendanceVerified ? "Verified by Admin/LGU" : selectedParticipation?.checkedOutAt ? "Pending Admin/LGU verification" : selectedParticipation?.checkedInAt ? "Checked in · Not yet verified" : "Waiting for Time In"}
                      </Text>
                    </View>

                    {!selectedParticipation?.attendanceVerified && selectedEvent.status === "active" &&
                      (!selectedParticipation?.checkedInAt ||
                        (selectedParticipation?.checkedInAt && !selectedParticipation?.checkedOutAt)) && (
                      <View style={styles.webAttendanceActionArea}>
                        <Text style={styles.webAttendanceActionHelp}>
                          {!selectedParticipation?.checkedInAt ?
                            "At the event venue? Record your arrival to begin attendance." :
                            "Finished your participation? Record your departure."}
                        </Text>
                        {attendanceConfirmation?.eventId === selectedEvent.id ? (
                          <View style={styles.webAttendanceConfirmBox}>
                            <Text style={styles.webAttendanceConfirmText}>
                              {attendanceConfirmation.action === "check-in"
                                ? "Confirm Time In now? Your arrival time will be saved to Firestore."
                                : "Confirm Time Out now? Your departure time will be saved to Firestore."}
                            </Text>
                            <View style={styles.webAttendanceConfirmButtons}>
                              <Pressable accessibilityRole="button" onPress={() => setAttendanceConfirmation(null)} style={styles.webAttendanceCancelButton}>
                                <Text style={styles.webAttendanceCancelText}>Cancel</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                disabled={!!attendanceBusy}
                                onPress={() => void recordSelfAttendance(selectedEvent, attendanceConfirmation?.action === "check-out" ? "check-out" : "check-in")}
                                style={[styles.webAttendanceActionButton, !!attendanceBusy && styles.webButtonDisabled]}
                              >
                                <Ionicons name="checkmark-circle-outline" size={17} color="white" />
                                <Text style={styles.webAttendanceActionButtonText}>Confirm {attendanceConfirmation.action === "check-in" ? "Time In" : "Time Out"}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={!selectedParticipation?.checkedInAt ? "Time In to event" : "Time Out from event"}
                            disabled={!!attendanceBusy || !!busyEvent}
                            onPress={() => setAttendanceConfirmation({eventId: selectedEvent.id, action: selectedParticipation?.checkedInAt ? "check-out" : "check-in"})}
                            style={[styles.webAttendanceActionButton, (!!attendanceBusy || !!busyEvent) && styles.webButtonDisabled]}
                          >
                            {attendanceBusy ? <ActivityIndicator color="white" size="small" /> : <Ionicons name={selectedParticipation?.checkedInAt ? "log-out-outline" : "log-in-outline"} size={19} color="white" />}
                            <Text style={styles.webAttendanceActionButtonText}>
                              {attendanceBusy ? "Saving..." : selectedParticipation?.checkedInAt ? "Time Out" : "Time In"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                    {selectedEvent.status === "upcoming" && <Text style={styles.webAttendanceHint}>Time In opens once Admin/LGU starts the event.</Text>}
                    {selectedEvent.status === "completed" && !selectedParticipation?.attendanceVerified && <Text style={styles.webAttendanceHint}>Event completed. Contact Admin/LGU if attendance needs correction or verification.</Text>}
                    {selectedParticipation?.attendanceVerified && <View style={styles.lockedVerifiedSummary}>
                      <Ionicons name="checkmark-circle" size={17} color="#078269" />
                      <Text style={styles.lockedVerifiedSummaryText}>Attendance verified · {formatHours(durationMinutes(selectedParticipation))} credited</Text>
                    </View>}
                    {attendanceFeedback?.eventId === selectedEvent.id && (
                      <View style={[styles.webAttendanceFeedbackBox, attendanceFeedback.type === "error" && styles.webAttendanceFeedbackError]}>
                        <Ionicons name={attendanceFeedback.type === "success" ? "checkmark-circle-outline" : "alert-circle-outline"} size={17} color={attendanceFeedback.type === "success" ? "#08765D" : "#B42318"} />
                        <Text style={[styles.webAttendanceFeedbackText, attendanceFeedback.type === "error" && styles.webAttendanceFeedbackErrorText]}>{attendanceFeedback.message}</Text>
                      </View>
                    )}
                    {selectedParticipation?.attendanceVerified && selectedEvent.status === "completed" && durationMinutes(selectedParticipation) >= 30 &&
                      <View style={styles.lockedVerifiedSummary}>
                        <Ionicons name="ribbon-outline" size={17} color="#087B68" />
                        <Text style={styles.lockedVerifiedSummaryText}>Meets the attendance and event-completion requirements. Certificate issuance is processed separately.</Text>
                      </View>}
                    {selectedParticipation?.attendanceVerified && durationMinutes(selectedParticipation) < 30 &&
                      <View style={styles.lockedCertificateLine}>
                        <Ionicons name="ribbon-outline" size={15} color="#758A96" />
                        <Text style={styles.lockedCertificateLineText}>Certificate: {durationMinutes(selectedParticipation)} / 30 min · Event completion required</Text>
                      </View>}
                    {!selectedParticipation?.attendanceVerified && <Text style={styles.webAttendanceNote}>Time In/Out uses server time. Admin/LGU verifies participation.</Text>}
                  </View>}
                  </>}
              </View>
            </View>
          )}
        </View>

        {section === "mine" && canPropose && <View style={styles.ruiProposalWrap}>
          <Text style={styles.ruiSectionHeading}>My Event Proposals</Text>
          <Text style={styles.ruiChecklistSubtitle}>Track the status of your submissions.</Text>
          {proposals.length === 0 ? <View style={styles.webEmptyCard}><Ionicons name="document-text-outline" size={34} color="#93A6AE"/><Text style={styles.webEmptyTitle}>No event proposals yet</Text><Pressable style={styles.ruiPrimary} onPress={()=>setSection("propose")}><Text style={styles.ruiPrimaryText}>Propose Event</Text><Ionicons name="arrow-forward" size={15} color="white" /></Pressable></View> :
            proposals.slice().sort((a,b)=>getTime(b.createdAt)-getTime(a.createdAt)).map(item=><View key={item.id} style={styles.ruiProposalRow}>
              {item.photoUrls?.[0]&&validPublicMediaUrl(item.photoUrls[0])?<Image source={{uri:item.photoUrls[0]}} style={styles.ruiProposalThumbnail}/>:<LinearGradient colors={["#D3EEE4","#93CBB4"]} style={styles.ruiProposalThumbnail}><Ionicons name={categoryIcon(item.category)} size={24} color="#078772"/></LinearGradient>}
              <View style={styles.ruiProposalDescription}><Text style={styles.ruiProposalTitle}>{item.title}</Text><Text style={styles.ruiMeta}>{item.barangay} · {eventScheduleLabel(item)}</Text><Text style={styles.ruiProposalNote}>{item.status==="approved"?"Approved and published as an official Community Event.":item.status==="pending"?"Pending Admin/LGU review.":item.adminNote||"Rejected. Review the Admin note."}</Text></View>
              <View style={[styles.ruiProposalStatus,item.status==="pending"&&styles.ruiProposalStatusPending,item.status==="rejected"&&styles.ruiProposalStatusRejected]}><Text style={[styles.ruiProposalStatusText,item.status==="rejected"&&{color:"#B32929"}]}>{item.status.toUpperCase()}</Text></View>
            </View>)}
        </View>}

        {/* Resident Propose Event · desktop layout from the approved visual mockup. */}
        {section === "propose" && canPropose && <View style={[styles.ruiFormRoot, isCompact && styles.ruiFormCompact]}>
          <View style={styles.ruiFormTop}>
            <Pressable onPress={()=>setSection("explore")} style={styles.ruiBack}><Ionicons name="arrow-back" size={16} color="#0A736A"/><Text style={styles.ruiBackText}>Back to Events</Text></Pressable>
            <Text style={styles.ruiFormApproval}>Admin/LGU approval is required before publication.</Text>
          </View>
          <Text style={styles.ruiFormTitle}>Propose a Community Event</Text>

          <View style={styles.ruiFormSection}>
            <View style={styles.ruiStepRow}><Text style={styles.ruiStepNumber}>1</Text><Text style={styles.ruiStepHeading}>Basic Information</Text></View>
            <View style={[styles.ruiFormRow, isCompact && styles.ruiFormRowStack]}>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Event title *</Text><TextInput style={styles.input} value={form.title} placeholder="e.g. Barangay Clean-up Drive" placeholderTextColor="#99ACBA" maxLength={100} onChangeText={v=>setValue("title",v)}/></View>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Category *</Text><Pressable style={styles.pickerField} onPress={()=>openSelect("category")}><Ionicons name="apps-outline" size={18} color={colors.green}/><Text style={styles.pickerFieldText}>{form.category}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable></View>
            </View>
            <View style={[styles.ruiFormRow, isCompact && styles.ruiFormRowStack]}>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Barangay *</Text><Pressable style={styles.pickerField} onPress={()=>openSelect("barangay")}><Ionicons name="location-outline" size={18} color={colors.green}/><Text style={[styles.pickerFieldText,!form.barangay&&styles.pickerPlaceholder]}>{form.barangay||"Select barangay"}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable></View>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Venue / Location *</Text><Pressable style={styles.pickerField} onPress={()=>openSelect("venue")}><Ionicons name="business-outline" size={18} color={colors.green}/><Text style={[styles.pickerFieldText,!form.location&&styles.pickerPlaceholder]}>{customVenue?"Specify exact location":form.location||"Select venue or type location"}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable>{customVenue&&<TextInput style={[styles.input,{marginTop:6}]} value={form.location} placeholder="Street / landmark / meeting point" maxLength={150} onChangeText={v=>setValue("location",v)}/>}</View>
            </View>
            <View style={[styles.ruiFormRow, isCompact && styles.ruiFormRowStack]}>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Event date *</Text><Pressable style={styles.pickerField} onPress={openDatePicker}><Ionicons name="calendar-outline" size={18} color={colors.green}/><Text style={[styles.pickerFieldText,!form.date&&styles.pickerPlaceholder]}>{form.date||"Choose date"}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable></View>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Event time *</Text><Pressable style={styles.pickerField} onPress={() => openTimePicker("start")}><Ionicons name="time-outline" size={18} color={colors.green}/><Text style={styles.pickerFieldText}>{formatChosenTime(form.time)}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable></View>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>End time *</Text><Pressable style={styles.pickerField} onPress={()=>openTimePicker("end")}><Ionicons name="time-outline" size={18} color={colors.green}/><Text style={[styles.pickerFieldText,!form.endTime&&styles.pickerPlaceholder]}>{formatChosenTime(form.endTime)}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable></View>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Volunteer capacity *</Text><Pressable style={styles.pickerField} onPress={()=>openSelect("capacity")}><Ionicons name="people-outline" size={18} color={colors.green}/><Text style={styles.pickerFieldText}>{form.capacity?`${form.capacity} volunteers`:"Select capacity"}</Text><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable>{customCapacity&&<TextInput style={[styles.input,{marginTop:6}]} value={form.capacity} keyboardType="number-pad" maxLength={3} onChangeText={v=>setValue("capacity",v.replace(/[^0-9]/g,""))}/>}</View>
            </View>
            <CommunityEventPinPicker latitude={form.latitude} longitude={form.longitude}
              onChange={(latitude,longitude)=>setForm(previous=>({...previous,latitude,longitude}))}/>
          </View>

          <View style={styles.ruiFormSection}>
            <View style={styles.ruiStepRow}><Text style={styles.ruiStepNumber}>2</Text><Text style={styles.ruiStepHeading}>Event Details</Text></View>
            <Text style={styles.fieldLabel}>Description *</Text><TextInput multiline textAlignVertical="top" style={[styles.input,styles.ruiTextarea]} value={form.description} onChangeText={v=>setValue("description",v)} placeholder="Describe the activity, purpose, location conditions, and what the community needs..." placeholderTextColor="#94A8B8" maxLength={1500}/>
            <Text style={styles.ruiCharCount}>{form.description.length}/1500</Text>
            <Text style={styles.fieldLabel}>What volunteers will actually do *</Text><TextInput multiline textAlignVertical="top" style={[styles.input,styles.ruiSmallTextarea]} value={form.volunteerTasks} onChangeText={v=>setValue("volunteerTasks",v)} placeholder="e.g. Segregate waste, clean pathways, carry supplies and document the activity" placeholderTextColor="#94A8B8" maxLength={1200}/>
            <View style={[styles.ruiFormRow, isCompact&&styles.ruiFormRowStack]}>
              <View style={[styles.ruiFormCell,styles.ruiChecklistColumn]}>
                <Text style={styles.ruiChecklistTitle}>Type of Help / Event *</Text>
                <Text style={styles.ruiChecklistSubtitle}>Select the activity that best describes your event.</Text>
                {categories.map((entry)=><Pressable key={entry} style={styles.ruiChecklistItem} onPress={()=>{setValue("category",entry);setValue("requiredRoles",["General Volunteer"]);setValue("requiredSkills",[]);}}><Ionicons name={form.category===entry?"checkbox":"square-outline"} size={17} color={form.category===entry?"#038B7C":"#92AAC0"}/><Text style={styles.ruiChecklistText}>{entry}</Text></Pressable>)}
              </View>
              <View style={[styles.ruiFormCell,styles.ruiChecklistColumn]}>
                <Text style={styles.ruiChecklistTitle}>Required Skills / Occupation *</Text>
                <Text style={styles.ruiChecklistSubtitle}>Multiple selections allowed. Licenses checked by Admin/LGU.</Text>
                {[...new Set([...suggestedRoles[form.category],...form.requiredRoles])].map((role)=><Pressable key={role} style={styles.ruiChecklistItem} onPress={()=>setValue("requiredRoles",form.requiredRoles.includes(role)?form.requiredRoles.filter(v=>v!==role):[...form.requiredRoles,role])}><Ionicons name={form.requiredRoles.includes(role)?"checkbox":"square-outline"} size={17} color={form.requiredRoles.includes(role)?"#038B7C":"#92AAC0"}/><Text style={styles.ruiChecklistText}>{role}</Text></Pressable>)}
                <TextInput style={[styles.input,styles.ruiMiniInput]} value={form.otherRole} maxLength={80} onChangeText={v=>setValue("otherRole",v)} placeholder="Other occupation / role (optional)" placeholderTextColor="#94A8B8"/>
              </View>
            </View>
            <Text style={styles.fieldLabel}>Other helpful skills (optional)</Text>
            <View style={styles.ruiSkillsChips}>{suggestedSkills[form.category].map(name=><Pressable key={name} onPress={()=>setValue("requiredSkills",form.requiredSkills.includes(name)?form.requiredSkills.filter(v=>v!==name):[...form.requiredSkills,name])} style={[styles.ruiSkillChip,form.requiredSkills.includes(name)&&styles.ruiSkillChipSelected]}><Text style={[styles.ruiSkillChipText,form.requiredSkills.includes(name)&&styles.ruiSkillChipTextSelected]}>{form.requiredSkills.includes(name)?"✓ ":"+ "}{name}</Text></Pressable>)}</View>
            {needsProfessionalCheck([...form.requiredRoles,form.otherRole])&&<View style={styles.residentSafeguard}><Ionicons name="shield-checkmark-outline" size={19} color="#8A5B13"/><Text style={styles.residentSafeguardText}>Clinical and veterinary work requires verified professional qualifications. General volunteers may assist with non-clinical duties.</Text></View>}
            <View style={[styles.ruiFormRow,isCompact&&styles.ruiFormRowStack]}><View style={styles.ruiFormCell}><CredentialPhotoField preview={credentialPreview} onPick={()=>void pickCredentialPhoto()} error={credentialError}/></View><View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>What to bring (optional)</Text><TextInput style={styles.input} value={form.whatToBring} maxLength={500} onChangeText={v=>setValue("whatToBring",v)} placeholder="e.g. Gloves, water, closed shoes"/></View></View>
          </View>

          <View style={styles.ruiFormSection}>
            <View style={styles.ruiStepRow}><Text style={styles.ruiStepNumber}>3</Text><Text style={styles.ruiStepHeading}>Media (Required)</Text></View>
            <Text style={styles.ruiChecklistSubtitle}>Upload at least one real venue/activity evidence photo (Main Photo required). Up to 3 JPG, PNG or WebP images, 5 MB each. Video optional. Never upload private IDs here.</Text>
            <View style={[styles.ruiFormRow,isCompact&&styles.ruiFormRowStack]}>
              <View style={[styles.ruiFormCell,{flex:1.25}]}><Text style={styles.fieldLabel}>Event photos</Text><View style={styles.ruiUploadRow}>{[0,1,2].map(index=><Pressable key={index} onPress={()=>pickResidentPhoto(index)} style={styles.ruiUploadTile}>{localPhotoPreviews[index]?<Image source={{uri:localPhotoPreviews[index]}} resizeMode="cover" style={styles.ruiTilePreview}/>:<Ionicons name="camera-outline" size={24} color="#41718B"/>}<Text style={styles.ruiUploadText}>{index===0?"Main Photo":`Photo ${index+1}`}</Text><Text style={styles.ruiUploadHint}>{localPhotoFiles[index]?"Selected":index===0?"Required":"Optional"}</Text></Pressable>)}</View><Pressable style={styles.ruiBack} onPress={()=>setShowPhotoLinkFallback((v)=>!v)}><Ionicons name="link-outline" size={15} color="#0B786F"/><Text style={styles.ruiBackText}>{showPhotoLinkFallback?"Hide photo links":"Use HTTPS photo links instead"}</Text></Pressable>{showPhotoLinkFallback&&form.photoUrls.map((url,index)=><TextInput key={index} style={[styles.input,{marginBottom:6}]} placeholder={`Photo ${index+1} HTTPS image URL (optional)`} autoCapitalize="none" keyboardType="url" value={url} maxLength={2048} onChangeText={value=>updateProposalPhoto(index,value)}/>)}<Text style={styles.ruiChecklistSubtitle}>At least one photo is required. Files upload on submission; HTTPS photo URLs are an alternative.</Text>{!!photoPickerError&&<Text style={styles.webErrorText}>{photoPickerError}</Text>}</View>
              <View style={styles.ruiFormCell}><Text style={styles.fieldLabel}>Video (Optional)</Text><Text style={styles.ruiChecklistSubtitle}>Add a link to a short YouTube or Vimeo video showing the venue or sample activity.</Text><TextInput style={styles.input} value={form.videoUrl} onChangeText={v=>setValue("videoUrl",v)} maxLength={2048} autoCapitalize="none" keyboardType="url" placeholder="https://youtu.be/..." placeholderTextColor="#94A8B8" />{!!form.videoUrl&&videoLinkSupported(form.videoUrl)&&<Pressable onPress={()=>void Linking.openURL(form.videoUrl)} style={styles.ruiBack}><Ionicons name="play-circle-outline" color="#048D7B" size={17}/><Text style={styles.ruiBackText}>Preview Video</Text></Pressable>}</View>
            </View>
          </View>
          <View style={styles.ruiFormFooter}><Pressable style={styles.ruiCancelButton} onPress={()=>setSection("explore")}><Text style={styles.ruiCancelText}>Cancel</Text></Pressable><Pressable disabled={busy} style={[styles.ruiPrimary,styles.ruiSubmitButton,busy&&styles.disabledButton]} onPress={()=>void submitProposal()}>{busy?<ActivityIndicator color="white" size="small"/>:<Text style={styles.ruiPrimaryText}>Submit Proposal</Text>}<Ionicons name="arrow-forward" color="white" size={16}/></Pressable></View>
        </View>}

        {isVolunteer && (
          <Pressable
            style={
              styles.certificateLink
            }
            onPress={() =>
              router.push(
                "/(tabs)/certificate"
              )
            }
          >
            <Ionicons
              name="ribbon-outline"
              color={colors.green}
              size={18}
            />

            <Text
              style={styles.linkText}
            >
              View My Certificates
            </Text>

            <Ionicons
              name="chevron-forward"
              color={colors.green}
              size={16}
            />
          </Pressable>
        )}
      </ScrollView>
      )}
      <Modal visible={Platform.OS === "web" && residentFilterPicker !== null} transparent animationType="fade" onRequestClose={()=>setResidentFilterPicker(null)}>
        <View style={styles.ruiFilterBackdrop}><View style={styles.ruiFilterModal}>
          <View style={styles.ruiFilterModalHeader}><Text style={styles.ruiSectionHeading}>Filter Events</Text><Pressable onPress={()=>setResidentFilterPicker(null)}><Ionicons name="close" size={22} color="#476578"/></Pressable></View>
          <ScrollView style={{maxHeight:370}}>{(residentFilterPicker==="category"?["All",...categories]:residentFilterPicker==="barangay"?["All Barangays",...sjdmBarangays]:["All Status","upcoming","active","completed"]).map(entry=><Pressable key={entry} style={styles.ruiFilterOption} onPress={()=>{if(residentFilterPicker==="category")setCategory(entry as Category|"All");if(residentFilterPicker==="barangay")setResidentBarangayFilter(entry);if(residentFilterPicker==="status")setResidentStatusFilter(entry);setResidentFilterPicker(null);}}><Text style={styles.ruiFilterLabel}>{entry}</Text></Pressable>)}</ScrollView>
        </View></View>
      </Modal>
      {Platform.OS !== "web" && (
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact &&
            styles.contentCompact,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading */}
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>
              Community Service Events
            </Text>

            <Text style={styles.pageSubtitle}>
              Make a difference in San Jose
              del Monte, Bulacan
            </Text>
          </View>

          <View style={styles.modeTag}>
            <Ionicons
              name={
                isVolunteer
                  ? "people"
                  : "home"
              }
              size={14}
              color={colors.green}
            />

            <Text style={styles.modeTagText}>
              {isVolunteer
                ? "VOLUNTEER"
                : "RESIDENT"}
            </Text>
          </View>
        </View>

        {/* Hero */}
        <LinearGradient
          colors={[
            "#087F75",
            "#13A68D",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroKicker}>
              VOLUNSERVE COMMUNITY
            </Text>

            <Text style={styles.heroTitle}>
              Small actions. Stronger
              communities.
            </Text>

            <Text style={styles.heroSubtitle}>
              {isVolunteer
                ? "Find approved events and join meaningful volunteer activities."
                : "Explore local activities or propose an event for your community."}
            </Text>
          </View>

          <Ionicons
            name="people-circle-outline"
            size={
              isCompact ? 52 : 82
            }
            color="#B8F4E6"
          />
        </LinearGradient>

        {/* Statistics */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons
              name="calendar-outline"
              color={colors.green}
              size={18}
            />

            <Text style={styles.statValue}>
              {availableCount}
            </Text>

            <Text style={styles.statLabel}>
              Available events
            </Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="checkmark-circle-outline"
              color={colors.green}
              size={18}
            />

            <Text style={styles.statValue}>
              {isVolunteer
                ? myEvents.length
                : proposals.length}
            </Text>

            <Text style={styles.statLabel}>
              {isVolunteer
                ? "My joined events"
                : "My proposals"}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="ribbon-outline"
              color={colors.green}
              size={18}
            />

            <Text style={styles.statValue}>
              {completedCount}
            </Text>

            <Text style={styles.statLabel}>
              Completed events
            </Text>
          </View>
        </View>

        {/* Navigation tabs */}
        <View style={styles.sectionTabs}>
          <Pressable
            onPress={() => {
              setSection("explore");
              setNotice("");
            }}
            style={[
              styles.sectionTab,
              section === "explore" &&
                styles.sectionTabActive,
            ]}
          >
            <Text
              style={[
                styles.sectionTabText,
                section === "explore" &&
                  styles.sectionTabTextActive,
              ]}
            >
              Explore Events
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setSection("mine");
              setNotice("");
            }}
            style={[
              styles.sectionTab,
              section === "mine" &&
                styles.sectionTabActive,
            ]}
          >
            <Text
              style={[
                styles.sectionTabText,
                section === "mine" &&
                  styles.sectionTabTextActive,
              ]}
            >
              {isVolunteer
                ? "My Events"
                : "My Proposals"}
            </Text>
          </Pressable>

          {canPropose && (
            <Pressable
              onPress={() => {
                setSection("propose");
                setNotice("");
              }}
              style={[
                styles.sectionTab,
                section === "propose" &&
                  styles.sectionTabActive,
              ]}
            >
              <Text
                style={[
                  styles.sectionTabText,
                  section === "propose" &&
                    styles.sectionTabTextActive,
                ]}
              >
                + Propose Event
              </Text>
            </Pressable>
          )}
        </View>

        {!!notice && (
          <View style={styles.notice}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color="#0F766E"
            />

            <Text style={styles.noticeText}>
              {notice}
            </Text>
          </View>
        )}

        {!!recordError && (
          <View style={styles.notice}>
            <Text style={styles.errorText}>
              {recordError}
            </Text>
          </View>
        )}

        {/* Explore */}
        {section === "explore" && (
          <>
            <View
              style={styles.sectionHeading}
            >
              <Text style={styles.sectionTitle}>
                Official Community Events
              </Text>

              <Text style={styles.sectionHint}>
                Approved and published by
                Admin/LGU
              </Text>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search activities, barangays, or locations"
              placeholderTextColor="#9AABB4"
              style={styles.searchInput}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.filterRow
              }
            >
              {(
                ["All", ...categories] as const
              ).map((item) => (
                <Pressable
                  key={item}
                  onPress={() =>
                    setCategory(item)
                  }
                  style={[
                    styles.filterChip,
                    category === item &&
                      styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      category === item &&
                        styles.filterTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {eventsLoading ? (
              <ActivityIndicator
                style={{ marginTop: 24 }}
                color={colors.green}
              />
            ) : eventError ? (
              <Text style={styles.errorText}>
                {eventError}
              </Text>
            ) : filteredEvents.length ===
              0 ? (
              <View style={styles.emptyPanel}>
                <Ionicons
                  name="calendar-outline"
                  size={26}
                  color="#94A7AE"
                />

                <Text style={styles.empty}>
                  No published events match
                  your search yet.
                </Text>
              </View>
            ) : (
              <View style={styles.eventGrid}>
                {filteredEvents.map(
                  renderNativeEvent
                )}
              </View>
            )}
          </>
        )}

        {/* My events / proposals */}
        {section === "mine" && (
          <>
            <View
              style={styles.sectionHeading}
            >
              <Text style={styles.sectionTitle}>
                {isVolunteer
                  ? "My Joined Events"
                  : "My Event Proposals"}
              </Text>

              <Text style={styles.sectionHint}>
                {isVolunteer
                  ? "Track your upcoming participation"
                  : "Check your proposal review status"}
              </Text>
            </View>

            {isVolunteer ? (
              myEvents.length === 0 ? (
                <View style={styles.emptyPanel}>
                  <Text style={styles.empty}>
                    You haven't joined a
                    community event yet.
                  </Text>
                </View>
              ) : (
                <View style={styles.eventGrid}>
                  {myEvents.map(
                    renderNativeEvent
                  )}
                </View>
              )
            ) : proposals.length === 0 ? (
              <View style={styles.emptyPanel}>
                <Text style={styles.empty}>
                  You haven't submitted an
                  event proposal yet.
                </Text>
              </View>
            ) : (
              proposals
                .slice()
                .sort(
                  (a, b) =>
                    getTime(b.createdAt) -
                    getTime(a.createdAt)
                )
                .map((item) => (
                  <View
                    key={item.id}
                    style={
                      styles.proposalCard
                    }
                  >
                    <View
                      style={
                        styles.proposalHeading
                      }
                    >
                      <Text
                        style={
                          styles.eventTitle
                        }
                      >
                        {item.title}
                      </Text>

                      <View
                        style={styles.tag}
                      >
                        <Text
                          style={
                            styles.tagText
                          }
                        >
                          {(
                            item.status ||
                            "pending"
                          ).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={styles.metaText}
                    >
                      {item.category}
                      {" • "}
                      {item.barangay}
                      {" • "}
                      {prettyDate(
                        item.date,
                        item.time
                      )}
                    </Text>

                    <Text
                      style={styles.metaText}
                    >
                      {item.location}
                    </Text>

                    {!!item.adminNote && (
                      <Text
                        style={styles.helper}
                      >
                        Admin note:{" "}
                        {item.adminNote}
                      </Text>
                    )}
                  </View>
                ))
            )}
          </>
        )}

        {/* Propose event form */}
        {section === "propose" &&
          canPropose && (
            <View style={[styles.formCard, styles.residentFormCard]}>
              <LinearGradient colors={["#E3F7EF", "#F2FBF8", "#FFFFFF"]} style={styles.residentFormHero}>
                <View style={styles.residentFormHeroIcon}><Ionicons name="heart-circle-outline" size={26} color="#078577" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.residentFormKicker}>RESIDENT COMMUNITY PROPOSAL</Text>
                  <Text style={styles.residentFormHeroTitle}>Plan a meaningful community activity</Text>
                  <Text style={styles.residentFormHeroSub}>Tell the LGU what your community needs, what volunteers will do, and who is best suited to help.</Text>
                </View>
              </LinearGradient>
              <View
                style={
                  styles.sectionHeading
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Propose a Community Event
                </Text>

                <Text
                  style={
                    styles.sectionHint
                  }
                >
                  Admin/LGU approval is
                  required before publication.
                </Text>
              </View>

              <View style={styles.residentSectionHeading}>
                <View style={styles.residentSectionIcon}><Ionicons name="document-text-outline" size={20} color="#047E73" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.residentSectionTitle}>01 · Activity overview</Text>
                  <Text style={styles.residentSectionSub}>Name the event, choose a category, and explain its purpose.</Text>
                </View>
              </View>
              <Text style={styles.fieldLabel}>Event title *</Text>

              <TextInput
                style={styles.input}
                placeholder="e.g. Barangay Clean-up Drive"
                placeholderTextColor="#9AABB4"
                value={form.title}
                onChangeText={(value) =>
                  setValue(
                    "title",
                    value
                  )
                }
                maxLength={100}
              />

              {/* Category */}
              <Text
                style={styles.fieldLabel}
              >
                Category *
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose event category"
                style={
                  styles.pickerField
                }
                onPress={() =>
                  openSelect("category")
                }
              >
                <Ionicons
                  name="apps-outline"
                  size={18}
                  color={colors.green}
                />

                <Text
                  style={
                    styles.pickerFieldText
                  }
                >
                  {form.category}
                </Text>

                <Ionicons
                  name="chevron-down"
                  size={17}
                  color={colors.muted}
                />
              </Pressable>

              <View style={styles.residentSectionHeading}>
                <View style={styles.residentSectionIcon}><Ionicons name="location-outline" size={20} color="#047E73" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.residentSectionTitle}>02 · Schedule & location</Text>
                  <Text style={styles.residentSectionSub}>Give a recognizable meeting place and realistic number of volunteers.</Text>
                </View>
              </View>
              <View
                style={styles.formRow}
              >
                {/* Barangay */}
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Barangay *
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Search and select barangay"
                    style={
                      styles.pickerField
                    }
                    onPress={() =>
                      openSelect(
                        "barangay"
                      )
                    }
                  >
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color={colors.green}
                    />

                    <Text
                      style={[
                        styles.pickerFieldText,
                        !form.barangay &&
                          styles.pickerPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {form.barangay ||
                        "Choose barangay"}
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>

                {/* Venue */}
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Venue / location *
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose venue type or specify another location"
                    style={
                      styles.pickerField
                    }
                    onPress={() =>
                      openSelect("venue")
                    }
                  >
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={colors.green}
                    />

                    <Text
                      style={[
                        styles.pickerFieldText,
                        !form.location &&
                          styles.pickerPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {customVenue
                        ? "Other / specify location"
                        : form.location ||
                          "Choose venue"}
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={colors.muted}
                    />
                  </Pressable>

                  {customVenue && (
                    <TextInput
                      style={[
                        styles.input,
                        styles.customInput,
                      ]}
                      placeholder="Enter exact venue / location"
                      placeholderTextColor="#9AABB4"
                      value={
                        form.location
                      }
                      onChangeText={(
                        value
                      ) =>
                        setValue(
                          "location",
                          value
                        )
                      }
                      maxLength={150}
                    />
                  )}
                </View>
              </View>

              <View
                style={styles.formRow}
              >
                {/* Date */}
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Event date *
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose event date from calendar"
                    style={
                      styles.pickerField
                    }
                    onPress={
                      openDatePicker
                    }
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={colors.green}
                    />

                    <Text
                      style={[
                        styles.pickerFieldText,
                        !form.date &&
                          styles.pickerPlaceholder,
                      ]}
                    >
                      {form.date ||
                        "Choose a date"}
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>

                {/* Time */}
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Event time *
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose event time"
                    style={
                      styles.pickerField
                    }
                    onPress={() => openTimePicker("start")}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={colors.green}
                    />

                    <Text
                      style={[
                        styles.pickerFieldText,
                        !form.time &&
                          styles.pickerPlaceholder,
                      ]}
                    >
                      {formatChosenTime(
                        form.time
                      )}
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>

                {/* End Time */}
                <View style={styles.formColumn}>
                  <Text style={styles.fieldLabel}>End time *</Text>
                  <Pressable style={styles.pickerField} onPress={() => openTimePicker("end")}>
                    <Ionicons name="time-outline" size={18} color={colors.green}/>
                    <Text style={styles.pickerFieldText}>{formatChosenTime(form.endTime)}</Text>
                    <Ionicons name="chevron-down" size={17} color={colors.muted}/>
                  </Pressable>
                </View>

                {/* Capacity */}
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Volunteer capacity *
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose volunteer capacity"
                    style={
                      styles.pickerField
                    }
                    onPress={() =>
                      openSelect(
                        "capacity"
                      )
                    }
                  >
                    <Ionicons
                      name="people-outline"
                      size={18}
                      color={colors.green}
                    />

                    <Text
                      style={[
                        styles.pickerFieldText,
                        !form.capacity &&
                          styles.pickerPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {customCapacity
                        ? "Custom capacity"
                        : form.capacity
                          ? `${form.capacity} volunteers`
                          : "Choose capacity"}
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={17}
                      color={colors.muted}
                    />
                  </Pressable>

                  {customCapacity && (
                    <TextInput
                      style={[
                        styles.input,
                        styles.customInput,
                      ]}
                      keyboardType="number-pad"
                      placeholder="Enter 1 to 500 volunteers"
                      placeholderTextColor="#9AABB4"
                      value={
                        form.capacity
                      }
                      onChangeText={(
                        value
                      ) =>
                        setValue(
                          "capacity",
                          value.replace(
                            /[^0-9]/g,
                            ""
                          )
                        )
                      }
                      maxLength={3}
                    />
                  )}
                </View>
              </View>

              <CommunityEventPinPicker latitude={form.latitude} longitude={form.longitude}
                onChange={(latitude,longitude)=>setForm(previous=>({...previous,latitude,longitude}))} />

              {/* Description */}
              <Text
                style={styles.fieldLabel}
              >
                Event description *
              </Text>

              <TextInput
                style={[
                  styles.input,
                  styles.textarea,
                ]}
                placeholder="Describe the activity, purpose, and what volunteers will do..."
                placeholderTextColor="#9AABB4"
                multiline
                textAlignVertical="top"
                value={
                  form.description
                }
                onChangeText={(value) =>
                  setValue(
                    "description",
                    value
                  )
                }
                maxLength={1500}
              />

              <ProposalNeedsAndMedia form={form} update={setValue} onPhotoChange={updateProposalPhoto}
                onCredentialPick={()=>void pickCredentialPhoto()} credentialPreview={credentialPreview} credentialError={credentialError}/>

              <View style={styles.residentSubmissionFooter}>
                <View style={styles.residentSectionIcon}><Ionicons name="shield-checkmark-outline" size={20} color="#047E73" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.residentSectionTitle}>05 · Review & send to Admin</Text>
                  <Text style={styles.residentSectionSub}>An Admin/LGU must review your proposal and any required professional qualifications before publication.</Text>
                </View>
              </View>

              <Text
                style={styles.helper}
              >
                Proposals remain pending
                until reviewed by the
                Admin/LGU. Submission never
                publishes an event automatically.
              </Text>

              <Pressable
                disabled={busy}
                style={[
                  styles.primaryButton,
                  styles.submitButton,
                  busy &&
                    styles.disabledButton,
                ]}
                onPress={() =>
                  void submitProposal()
                }
              >
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  {busy
                    ? "Submitting..."
                    : "Submit Proposal"}
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="white"
                />
              </Pressable>
            </View>
          )}

        {isVolunteer && (
          <Pressable
            style={
              styles.certificateLink
            }
            onPress={() =>
              router.push(
                "/(tabs)/certificate"
              )
            }
          >
            <Ionicons
              name="ribbon-outline"
              color={colors.green}
              size={18}
            />

            <Text
              style={styles.linkText}
            >
              View My Certificates
            </Text>

            <Ionicons
              name="chevron-forward"
              color={colors.green}
              size={16}
            />
          </Pressable>
        )}
      </ScrollView>
      )}

      {/* Dropdown modal */}
      <Modal
        visible={
          selectPicker !== null
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setSelectPicker(null)
        }
      >
        <View
          style={
            styles.pickerBackdrop
          }
        >
          <Pressable
            style={
              StyleSheet.absoluteFill
            }
            accessibilityLabel="Close selection"
            onPress={() =>
              setSelectPicker(null)
            }
          />

          <View
            style={styles.pickerPanel}
          >
            <View
              style={styles.pickerHeader}
            >
              <Text
                style={
                  styles.pickerTitle
                }
              >
                {selectHeading}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dropdown"
                onPress={() =>
                  setSelectPicker(null)
                }
                style={
                  styles.pickerClose
                }
              >
                <Ionicons
                  name="close"
                  size={21}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            {selectPicker ===
              "barangay" && (
              <View
                style={
                  styles.dropdownSearchWrap
                }
              >
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={colors.muted}
                />

                <TextInput
                  style={
                    styles.dropdownSearchInput
                  }
                  placeholder="Search barangay..."
                  placeholderTextColor="#9AABB4"
                  value={
                    barangaySearch
                  }
                  onChangeText={
                    setBarangaySearch
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            <ScrollView
              style={
                styles.dropdownList
              }
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
            >
              {selectOptions.length ===
              0 ? (
                <Text
                  style={
                    styles.dropdownEmpty
                  }
                >
                  No matching barangay found.
                </Text>
              ) : (
                selectOptions.map(
                  (option) => {
                    const selected =
                      selectPicker ===
                      "category"
                        ? form.category ===
                          option
                        : selectPicker ===
                            "barangay"
                          ? form.barangay ===
                            option
                          : selectPicker ===
                              "venue"
                            ? customVenue
                              ? option ===
                                "Specify another location"
                              : form.location ===
                                option
                            : customCapacity
                              ? option ===
                                "Custom capacity"
                              : form.capacity ===
                                option;

                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${option}`}
                        onPress={() => {
                          if (
                            selectPicker
                          ) {
                            chooseOption(
                              selectPicker,
                              option
                            );
                          }
                        }}
                        style={[
                          styles.dropdownOption,
                          selected &&
                            styles.dropdownOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            selected &&
                              styles.dropdownOptionTextSelected,
                          ]}
                        >
                          {option}
                        </Text>

                        {selected && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={
                              colors.green
                            }
                          />
                        )}
                      </Pressable>
                    );
                  }
                )
              )}
            </ScrollView>

            {selectPicker ===
              "barangay" && (
              <Text
                style={
                  styles.pickerHelp
                }
              >
                San Jose del Monte,
                Bulacan
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Calendar and time modal */}
      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setPicker(null)
        }
      >
        <View
          style={
            styles.pickerBackdrop
          }
        >
          <Pressable
            style={
              StyleSheet.absoluteFill
            }
            accessibilityLabel="Close picker"
            onPress={() =>
              setPicker(null)
            }
          />

          <View
            style={styles.pickerPanel}
          >
            <View
              style={styles.pickerHeader}
            >
              <Text
                style={
                  styles.pickerTitle
                }
              >
                {picker === "date"
                  ? "Choose event date"
                  : timePickerTarget === "end" ? "Choose end time" : "Choose start time"}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() =>
                  setPicker(null)
                }
                style={
                  styles.pickerClose
                }
              >
                <Ionicons
                  name="close"
                  size={21}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            {picker === "date" ? (
              <>
                <View
                  style={
                    styles.monthHeader
                  }
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    disabled={
                      previousMonthDisabled
                    }
                    style={[
                      styles.monthArrow,
                      previousMonthDisabled &&
                        styles.monthArrowDisabled,
                    ]}
                    onPress={() =>
                      setCalendarMonth(
                        new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() -
                            1,
                          1
                        )
                      )
                    }
                  >
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={colors.ink}
                    />
                  </Pressable>

                  <Text
                    style={
                      styles.monthTitle
                    }
                  >
                    {calendarMonth.toLocaleDateString(
                      "en-PH",
                      {
                        month: "long",
                        year: "numeric",
                      }
                    )}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    style={
                      styles.monthArrow
                    }
                    onPress={() =>
                      setCalendarMonth(
                        new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() +
                            1,
                          1
                        )
                      )
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.ink}
                    />
                  </Pressable>
                </View>

                <View
                  style={
                    styles.calendarGrid
                  }
                >
                  {[
                    "Sun",
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                  ].map((day) => (
                    <View
                      key={day}
                      style={
                        styles.calendarCell
                      }
                    >
                      <Text
                        style={
                          styles.weekdayText
                        }
                      >
                        {day}
                      </Text>
                    </View>
                  ))}

                  {calendarCells.map(
                    (day, index) => {
                      const date =
                        day === null
                          ? null
                          : new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth(),
                              day
                            );

                      const unavailable =
                        !date ||
                        date.getTime() <
                          today.getTime();

                      const selected =
                        !!date &&
                        toDateString(date) ===
                          form.date;

                      return (
                        <View
                          key={`${calendarMonth.getMonth()}-${index}`}
                          style={
                            styles.calendarCell
                          }
                        >
                          {date && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={date.toLocaleDateString(
                                "en-PH",
                                {
                                  dateStyle:
                                    "full",
                                }
                              )}
                              disabled={
                                unavailable
                              }
                              style={[
                                styles.dayButton,
                                selected &&
                                  styles.dayButtonSelected,
                              ]}
                              onPress={() => {
                                setValue(
                                  "date",
                                  toDateString(
                                    date
                                  )
                                );

                                setPicker(
                                  null
                                );
                              }}
                            >
                              <Text
                                style={[
                                  styles.dayText,
                                  unavailable &&
                                    styles.dayTextDisabled,
                                  selected &&
                                    styles.dayTextSelected,
                                ]}
                              >
                                {day}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    }
                  )}
                </View>

                <Text
                  style={
                    styles.pickerHelp
                  }
                >
                  Only today and future
                  dates are available.
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={
                    styles.clockPreview
                  }
                >
                  {clockHour}:
                  {pad2(clockMinute)}
                  {" "}
                  {clockPeriod}
                </Text>

                <View
                  style={
                    styles.clockControls
                  }
                >
                  {/* Hour */}
                  <View
                    style={
                      styles.clockUnit
                    }
                  >
                    <Text
                      style={
                        styles.clockUnitLabel
                      }
                    >
                      Hour
                    </Text>

                    <Pressable
                      style={
                        styles.clockStep
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Increase hour"
                      onPress={() =>
                        setClockHour(
                          (current) =>
                            current === 12
                              ? 1
                              : current + 1
                        )
                      }
                    >
                      <Ionicons
                        name="add"
                        size={23}
                        color={colors.green}
                      />
                    </Pressable>

                    <Text
                      style={
                        styles.clockNumber
                      }
                    >
                      {pad2(clockHour)}
                    </Text>

                    <Pressable
                      style={
                        styles.clockStep
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Decrease hour"
                      onPress={() =>
                        setClockHour(
                          (current) =>
                            current === 1
                              ? 12
                              : current - 1
                        )
                      }
                    >
                      <Ionicons
                        name="remove"
                        size={23}
                        color={colors.green}
                      />
                    </Pressable>
                  </View>

                  <Text
                    style={
                      styles.clockColon
                    }
                  >
                    :
                  </Text>

                  {/* Minute */}
                  <View
                    style={
                      styles.clockUnit
                    }
                  >
                    <Text
                      style={
                        styles.clockUnitLabel
                      }
                    >
                      Minute
                    </Text>

                    <Pressable
                      style={
                        styles.clockStep
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Increase minute"
                      onPress={() =>
                        setClockMinute(
                          (current) =>
                            (current + 1) %
                            60
                        )
                      }
                    >
                      <Ionicons
                        name="add"
                        size={23}
                        color={colors.green}
                      />
                    </Pressable>

                    <Text
                      style={
                        styles.clockNumber
                      }
                    >
                      {pad2(
                        clockMinute
                      )}
                    </Text>

                    <Pressable
                      style={
                        styles.clockStep
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Decrease minute"
                      onPress={() =>
                        setClockMinute(
                          (current) =>
                            (current + 59) %
                            60
                        )
                      }
                    >
                      <Ionicons
                        name="remove"
                        size={23}
                        color={colors.green}
                      />
                    </Pressable>
                  </View>

                  {/* AM/PM */}
                  <View
                    style={
                      styles.clockUnit
                    }
                  >
                    <Text
                      style={
                        styles.clockUnitLabel
                      }
                    >
                      Period
                    </Text>

                    {(
                      [
                        "AM",
                        "PM",
                      ] as const
                    ).map((period) => (
                      <Pressable
                        key={period}
                        accessibilityRole="button"
                        style={[
                          styles.periodButton,
                          clockPeriod ===
                            period &&
                            styles.periodButtonActive,
                        ]}
                        onPress={() =>
                          setClockPeriod(
                            period
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.periodText,
                            clockPeriod ===
                              period &&
                              styles.periodTextActive,
                          ]}
                        >
                          {period}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Pressable
                  style={
                    styles.pickerConfirm
                  }
                  accessibilityRole="button"
                  onPress={
                    savePickedTime
                  }
                >
                  <Text
                    style={
                      styles.pickerConfirmText
                    }
                  >
                    Set time
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  content: {
    width: "100%",
    maxWidth: 1160,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 35,
  },
  contentCompact: {
    paddingHorizontal: 13,
    paddingTop: 14,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  pageTitle: {
    fontSize: 23,
    fontWeight: "900",
    color: colors.ink,
  },
  pageSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  modeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#E2F6EF",
    borderRadius: 10,
  },
  modeTagText: {
    fontSize: 10,
    color: "#08756B",
    fontWeight: "800",
  },
  hero: {
    borderRadius: 17,
    padding: 18,
    minHeight: 119,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroKicker: {
    fontSize: 10,
    color: "#CBFFF4",
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 21,
    color: "#FFFFFF",
    fontWeight: "900",
    marginTop: 5,
  },
  heroSubtitle: {
    fontSize: 12,
    color: "#E4FFF7",
    marginTop: 5,
    lineHeight: 17,
  },
  statsRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  statValue: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 20,
    marginTop: 3,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 1,
  },
  sectionTabs: {
    flexDirection: "row",
    gap: 5,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginTop: 15,
    marginBottom: 13,
  },
  sectionTab: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderBottomWidth: 3,
    borderColor: "transparent",
  },
  sectionTabActive: {
    borderColor: colors.green,
  },
  sectionTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  sectionTabTextActive: {
    color: colors.green,
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 11,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 11,
  },
  searchInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 43,
    paddingHorizontal: 13,
    fontSize: 13,
    color: colors.ink,
  },
  filterRow: {
    alignItems: "center",
    gap: 7,
    paddingVertical: 11,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "white",
  },
  filterChipActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  filterText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "white",
  },
  eventGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  eventCard: {
    width: "100%",
    maxWidth: 550,
    flexGrow: 1,
    flexBasis: 285,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 2,
  },
  eventTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#E7F6F2",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 3,
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  tag: {
    backgroundColor: "#DDF4EA",
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 7,
  },
  tagMuted: {
    backgroundColor: "#E8EDF1",
  },
  tagText: {
    color: "#087662",
    fontSize: 9,
    fontWeight: "900",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  slots: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  linkButton: {
    padding: 5,
  },
  linkText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "800",
  },
  descriptionBox: {
    backgroundColor: "#F4F9F8",
    padding: 10,
    borderRadius: 8,
    marginTop: 9,
  },
  description: {
    color: "#4C6770",
    fontSize: 12,
    lineHeight: 18,
  },
  ownerNotice: {
    backgroundColor: "#E9F7F2",
    borderRadius: 9,
    padding: 10,
    marginTop: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  ownerNoticeText: {
    color: "#0B7065",
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },
  primaryButton: {
    minHeight: 37,
    backgroundColor: colors.green,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "800",
    fontSize: 12,
  },
  disabledButton: {
    backgroundColor: "#9AACA8",
  },
  secondaryButton: {
    minHeight: 37,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  helper: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 9,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#E9F7F2",
    padding: 11,
    borderRadius: 9,
    marginBottom: 12,
  },
  noticeText: {
    color: "#0B7065",
    fontSize: 12,
    flex: 1,
  },
  errorText: {
    color: "#B42318",
    fontSize: 12,
    marginVertical: 10,
  },
  emptyPanel: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 9,
  },
  empty: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
  },
  proposalCard: {
    backgroundColor: "white",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    gap: 6,
  },
  proposalHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  formCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 11,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    minHeight: 41,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.ink,
    backgroundColor: "#FFFFFF",
  },
  pickerField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    minHeight: 41,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  pickerFieldText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
  },
  pickerPlaceholder: {
    color: "#9AABB4",
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor:
      "rgba(13, 32, 45, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  pickerPanel: {
    backgroundColor: "#FFFFFF",
    width: "100%",
    maxWidth: 390,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.ink,
  },
  pickerClose: {
    padding: 5,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  monthArrow: {
    width: 35,
    height: 35,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowDisabled: {
    opacity: 0.3,
  },
  monthTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarCell: {
    width: "14.285714%",
    aspectRatio: 1.1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayText: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 10,
  },
  dayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayButtonSelected: {
    backgroundColor: colors.green,
  },
  dayText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  dayTextDisabled: {
    color: "#BBC9C8",
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },
  pickerHelp: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 13,
    textAlign: "center",
  },
  clockPreview: {
    color: colors.green,
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 14,
  },
  clockControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  clockUnit: {
    alignItems: "center",
    gap: 9,
    minWidth: 78,
  },
  clockUnitLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  clockStep: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    width: 43,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  clockNumber: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
  },
  clockColon: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 8,
  },
  periodButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  periodButtonActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  periodText: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 12,
  },
  periodTextActive: {
    color: "#FFFFFF",
  },
  pickerConfirm: {
    backgroundColor: colors.green,
    alignItems: "center",
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
  },
  pickerConfirmText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  customInput: {
    marginTop: 8,
  },
  dropdownSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FBFA",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    minHeight: 44,
    gap: 8,
  },
  dropdownSearchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 9,
  },
  dropdownList: {
    maxHeight: 340,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 9,
    marginVertical: 2,
  },
  dropdownOptionSelected: {
    backgroundColor: "#E8F7F2",
  },
  dropdownOptionText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
  },
  dropdownOptionTextSelected: {
    fontWeight: "800",
    color: colors.green,
  },
  dropdownEmpty: {
    color: colors.muted,
    fontSize: 12,
    padding: 14,
    textAlign: "center",
  },
  textarea: {
    minHeight: 86,
  },
  categoryOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  categoryOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  categoryOptionActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  formRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  formColumn: {
    flexBasis: 185,
    flexGrow: 1,
  },
  submitButton: {
    alignSelf: "flex-start",
    marginTop: 12,
  },
  certificateLink: {
    alignSelf: "flex-start",
    marginTop: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
  },
  // Web Community Events redesign. Existing modal/proposal styles retained.
  webContent: { width: "100%", maxWidth: 1540, alignSelf: "center", paddingHorizontal: 18, paddingTop: 18, paddingBottom: 48 },
  webContentCompact: { paddingHorizontal: 12, paddingTop: 12 },
  webHero: { borderRadius: 19, overflow: "hidden", borderWidth: 1, borderColor: "#CEE9E4" },
  webHeroGradient: { minHeight: 153, paddingHorizontal: 28, paddingVertical: 23, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  webHeroKickerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  webHeroKicker: { fontSize: 10, fontWeight: "900", color: "#007B71", letterSpacing: 1.1 },
  webHeroTitle: { fontFamily:"EventInterExtraBold", fontSize: 25, lineHeight: 32, fontWeight: "900", color: "#0B2740", marginTop: 10, maxWidth: 690, flexShrink: 1 },
  webHeroTitleSmall: { fontSize: 22 },
  webHeroDescription: { fontFamily:"EventInter", fontSize: 12.5, lineHeight: 19, color: "#49677D", marginTop: 8, maxWidth: 690 },
  webHeroIllustration: { alignItems: "center", justifyContent: "center", width: 250, height: 120 },
  webHeroCircleLarge: { position: "absolute", width: 215, height: 215, borderRadius: 110, backgroundColor: "#BEE8D9", opacity: 0.52, right: -10, top: -51 },
  webHeroLeaf: { position: "absolute", top: 8, right: 45, transform: [{ rotate: "-22deg" }] },
  webStatsRow: { flexDirection: "row", gap: 12, marginTop: 14, flexWrap: "wrap" },
  webStatsNarrow: { gap: 8 },
  webStatCard: { flexGrow: 1, flexBasis: 240, minWidth: 0, minHeight: 94, backgroundColor: "white", borderColor: "#DDE9E8", borderWidth: 1, borderRadius: 13, flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 14, paddingVertical: 13 },
  webStatIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  webStatNumber: { fontFamily:"EventInterBold", fontSize: 23, fontWeight: "900", color: "#092B45" },
  webStatTitle: { fontSize: 12, fontWeight: "800", color: "#11334B", marginTop: 1 },
  webStatHint: { fontSize: 10.5, color: "#7B8B9B", marginTop: 3 },
  webToolbar: { flexDirection: "row", gap: 13, justifyContent: "space-between", alignItems: "center", marginTop: 15, flexWrap: "wrap" },
  webSectionTabs: { flexDirection: "row", gap: 5, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#DDE8E9" },
  webSectionTab: { paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent" },
  webSectionTabActive: { borderBottomColor: "#008F82" },
  webSectionTabText: { fontSize: 13, fontWeight: "800", color: "#698095" },
  webSectionTabTextActive: { color: "#008F82" },
  webSearchWrap: { width: 350, minWidth: 235, minHeight: 43, borderWidth: 1, borderColor: "#DCE7EB", borderRadius: 11, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13 },
  webSearchInput: { flex: 1, fontSize: 12.5, color: "#1A3E52", paddingVertical: 8, minWidth: 0 },
  webFilters: { gap: 8, paddingTop: 15, paddingBottom: 14, alignItems: "center" },
  webFilterChip: { borderRadius: 25, borderWidth: 1, borderColor: "#DFE8EA", backgroundColor: "white", paddingHorizontal: 12, minHeight: 36, flexDirection: "row", gap: 5, alignItems: "center" },
  webFilterChipActive: { backgroundColor: "#068F82", borderColor: "#068F82" },
  webFilterText: { fontSize: 11.5, fontWeight: "800", color: "#47667B" },
  webFilterTextActive: { color: "white" },
  webMainColumns: { flexDirection: "row", gap: 15, alignItems: "flex-start" },
  webMainColumnsStack: { flexDirection: "column" },
  webListingColumn: { flex: 1.85, minWidth: 0 },
  webDetailColumn: { flex: 1, minWidth: 0 },
  webFullWidth: { width: "100%", flex: 0 },
  webListHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, gap: 8 },
  webHeadingTitle: { fontFamily:"EventInterBold", color: "#17453B", fontWeight: "900", fontSize: 17 },
  webHeadingHint: { color: "#778DA0", fontSize: 11, marginTop: 3 },
  webEventCount: { color: "#718697", fontSize: 11, fontWeight: "700" },
  webCardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start", marginTop: 5 },
  webEventCard: { width: "48.9%", minWidth: 230, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E0ECE9", overflow: "hidden" },
  webEventCompact: { width: "100%" },
  webEventSelected: { borderColor: "#0A9C8D", borderWidth: 1.5 },
  webCover: { height: 146, overflow: "hidden", backgroundColor: "#DAF3ED" },
  webCoverImage: { width: "100%", height: "100%" },
  webCoverArtwork: { flex: 1, alignItems: "center", justifyContent: "center" },
  webCoverRing: { width: 235, height: 235, position: "absolute", top: -115, right: -40, backgroundColor: "#FFFFFF", opacity: 0.26, borderRadius: 120 },
  webArtNote: { color: "#087468", fontSize: 11, fontWeight: "900", marginTop: 4 },
  webStatusPill: { position: "absolute", right: 9, top: 9, borderRadius: 6, backgroundColor: "#E0F8EE", paddingHorizontal: 9, paddingVertical: 6 },
  webStatusDone: { backgroundColor: "#EEF0FF" },
  webStatusText: { color: "#047A70", fontSize: 9.5, fontWeight: "900" },
  webCardBody: { padding: 13, gap: 8 },
  webCardTitle: { fontFamily:"EventInterBold", fontSize: 16, fontWeight: "900", color: "#17483C" },
  webCategoryRow: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" },
  webCategoryTag: { backgroundColor: "#E3F6F0", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  webCategoryTagText: { color: "#087A6C", fontWeight: "800", fontSize: 10 },
  webJoinedTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0F9F4", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 },
  webJoinedText: { color: "#087965", fontSize: 10, fontWeight: "800" },
  webMetaLine: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  webMetaText: { fontSize: 11, color: "#597285", flex: 1, lineHeight: 16 },
  webCardOwnership: { color: "#AB7750", fontSize: 10.5, fontWeight: "700" },
  webCardAction: { marginTop: 5, minHeight: 37, borderRadius: 8, backgroundColor: "#F0F6FA", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  webCardActionActive: { backgroundColor: "#068F83" },
  webCardActionText: { fontSize: 11.5, fontWeight: "900", color: "#076E69" },
  webCardActionTextActive: { color: "white" },
  webDetailCard: { backgroundColor: "white", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#E0EAE8", marginTop: 5 },
  webDetailCover: { height: 178, backgroundColor: "#D0EFE9" },
  webDetailCoverImage: { width: "100%", height: "100%" },
  webDetailArtwork: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  webDetailArtLabel: { fontSize: 13, fontWeight: "900", color: "#057769", marginTop: 8 },
  webDetailStatus: { position: "absolute", left: 14, top: 14, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#DAF8EA", flexDirection: "row", alignItems: "center", gap: 5 },
  webDetailStatusText: { fontSize: 10, fontWeight: "900", color: "#046F63" },
  webDetailBody: { paddingHorizontal: 15, paddingVertical: 16 },
  webDetailTitle: { color: "#0C2D46", fontSize: 19, fontWeight: "900" },
  webDetailCategory: { flexDirection: "row", backgroundColor: "#E8F7F2", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 9, marginBottom: 10 },
  webDetailCategoryText: { fontSize: 10, fontWeight: "800", color: "#007B6C" },
  webDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 10 },
  webDetailText: { fontSize: 12, color: "#546E80", lineHeight: 18, flex: 1 },
  webDivider: { height: 1, backgroundColor: "#E7EEEC", marginTop: 6, marginBottom: 13 },
  webDetailSectionTitle: { color: "#0F3048", fontSize: 13, fontWeight: "900", marginBottom: 7 },
  webDetailDescription: { color: "#536E80", fontSize: 11.5, lineHeight: 18 },
  webDetailActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  webJoinButton: { flex: 1, backgroundColor: "#068E81", minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  webJoinButtonText: { fontSize: 12, fontWeight: "900", color: "white" },
  webButtonDisabled: { opacity: 0.55 },
  webDeclineButton: { borderColor: "#D7A7AD", borderWidth: 1, borderRadius: 9, minHeight: 42, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  webDeclineButtonText: { color: "#B3424A", fontSize: 11.5, fontWeight: "900" },
  webOwnershipNotice: { flexDirection: "row", gap: 9, backgroundColor: "#E6F6F2", borderRadius: 10, padding: 11, marginTop: 15 },
  webOwnershipText: { color: "#0A796D", fontSize: 11, lineHeight: 17, flex: 1 },
  webJoinedBanner: { flexDirection: "row", gap: 8, backgroundColor: "#E8F7F1", borderRadius: 9, padding: 12, marginTop: 16 },
  webJoinedBannerText: { color: "#136F64", fontSize: 11, lineHeight: 17, flex: 1 },
  webClosedBanner: { flexDirection: "row", gap: 8, backgroundColor: "#F3F6F7", borderRadius: 9, padding: 12, marginTop: 16 },
  webClosedText: { color: "#546B7B", fontSize: 11, flex: 1 },
  webDetailResidentNote: { flexDirection: "row", backgroundColor: "#F0F5F7", padding: 11, borderRadius: 9, gap: 8, marginTop: 14 },
  webResidentText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#536D7E" },
  webParticipationBox: { marginTop: 15, backgroundColor: "#F4F9F8", borderColor: "#DCEBE7", borderWidth: 1, borderRadius: 11, padding: 12 },
  webParticipationHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  webParticipationTitle: { color: "#0D726D", fontSize: 13, fontWeight: "900" },
  webPartLine: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#E0EAE8" },
  webPartLabel: { color: "#657987", fontSize: 11 },
  webPartValue: { color: "#183C50", fontSize: 11, fontWeight: "800", textAlign: "right", flexShrink: 1 },
  webVerified: { color: "#08856F" },
  webAttendanceNote: { color: "#6A8690", fontSize: 10, lineHeight: 15, marginTop: 9 },
  webAttendanceStatusPill: { marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: "#E1F3EF" },
  webAttendanceStatusText: { fontSize: 9, fontWeight: "900", color: "#06796D" },
  webAttendanceActionArea: { marginTop: 14, gap: 9 },
  webAttendanceActionHelp: { fontSize: 11, lineHeight: 17, color: "#456C7E" },
  webAttendanceActionButton: { backgroundColor: "#078F82", borderRadius: 9, minHeight: 42, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flex: 1 },
  webAttendanceActionButtonText: { color: "white", fontWeight: "900", fontSize: 12 },
  webAttendanceConfirmBox: { padding: 12, borderRadius: 9, borderWidth: 1, borderColor: "#BCE4D9", backgroundColor: "#EAF8F4", gap: 10 },
  webAttendanceConfirmText: { color: "#225569", fontSize: 11, lineHeight: 17 },
  webAttendanceConfirmButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  webAttendanceCancelButton: { borderRadius: 9, minHeight: 42, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#BCD5D1", paddingHorizontal: 13 },
  webAttendanceCancelText: { color: "#466B76", fontWeight: "800", fontSize: 11 },
  webAttendanceHint: { color: "#688092", backgroundColor: "#EAF1F5", padding: 11, borderRadius: 8, fontSize: 11, lineHeight: 17, marginTop: 12 },
  webAttendanceVerifiedHint: { color: "#076C59", backgroundColor: "#E1F5EB", padding: 11, borderRadius: 8, fontSize: 11, lineHeight: 17, marginTop: 12 },
  webAttendanceFeedbackBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#E1F6EC", padding: 10, borderRadius: 8, marginTop: 10 },
  webAttendanceFeedbackText: { flex: 1, color: "#08765D", fontSize: 11, lineHeight: 16 },
  webAttendanceFeedbackError: { backgroundColor: "#FFF0EF" },
  webAttendanceFeedbackErrorText: { color: "#B42318" },
  webNotice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E8F8F1", borderRadius: 10, padding: 12, marginTop: 12 },
  webNoticeText: { color: "#0D7268", fontSize: 12, flex: 1 },
  webError: { flexDirection: "row", alignItems: "center", gap: 7, padding: 12, backgroundColor: "#FFF0EF", borderRadius: 10, marginTop: 10 },
  webErrorText: { flex: 1, color: "#B42318", fontSize: 12 },
  webLoading: { minHeight: 150, alignItems: "center", justifyContent: "center" },
  webEmptyCard: { backgroundColor: "#FFFFFF", borderRadius: 14, minHeight: 200, padding: 25, alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: "#DFEBE8", marginTop: 5 },
  webEmptyTitle: { fontFamily:"EventInterBold", fontWeight: "900", color: "#214051", fontSize: 15, textAlign: "center" },
  webEmptySubtitle: { fontSize: 12, color: "#6B8290", textAlign: "center" },
  webEmptyAction: { backgroundColor: "#048E81", borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10 },
  webEmptyActionText: { color: "white", fontWeight: "900", fontSize: 12 },
  webProposalWrap: { maxWidth: 1160, width: "100%", alignSelf: "center", marginTop: 18 },
  webProposalCard: { flexDirection: "row", gap: 15, backgroundColor: "white", padding: 15, borderRadius: 12, borderWidth: 1, borderColor: "#E1EBEA", marginBottom: 8 },
  webProposalTitle: { fontFamily:"EventInterBold", color: "#12344A", fontSize: 14, fontWeight: "900", marginBottom: 4 },
  webProposalNote: { fontSize: 11, color: "#9C6F39", marginTop: 6 },
  webProposalBadge: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#E7F5EE" },
  webProposalBadgeText: { color: "#007B6C", fontSize: 10, fontWeight: "900" },
  // Locked Community Events UI — responsive left dashboard and compact right rail.
  lockedColumns: { flexDirection: "row", alignItems: "flex-start", width: "100%", gap: 18 },
  lockedColumnsStack: { flexDirection: "column" },
  lockedMain: { flex: 1, minWidth: 0 },
  lockedRail: { width: 338, maxWidth: "100%", flexShrink: 0, gap: 14 },
  lockedRailStack: { width: "100%" },
  lockedHeroGradient: { minHeight: 196, flexDirection: "row", paddingHorizontal: 26, paddingVertical: 24, alignItems: "center" },
  lockedHeroWords: { flex: 1, minWidth: 0, paddingRight: 12, zIndex: 3 },
  lockedHeroIllustration: { width: 198, height: 146, flexShrink: 0, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 14 },
  lockedHeroSun: { position: "absolute", top: 9, right: 17, width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFD889" },
  lockedHeroHillBack: { position: "absolute", bottom: -104, right: -29, width: 255, height: 172, borderRadius: 130, backgroundColor: "#B8E5D8" },
  lockedHeroHillFront: { position: "absolute", bottom: -110, right: -38, width: 208, height: 156, borderRadius: 106, backgroundColor: "#80CBB9" },
  lockedHeroQuote: { width: "100%", paddingHorizontal: 13, paddingTop: 9, alignItems: "center", justifyContent: "center", zIndex: 2 },
  lockedHeroMotto: { color: "#086C65", fontSize: 11.5, lineHeight: 17, fontWeight: "900", fontStyle: "italic", textAlign: "center", marginTop: 5, flexShrink: 1 },
  lockedStats: { flexDirection: "row", gap: 10, marginTop: 13, flexWrap: "wrap" },
  lockedStatCard: { flexGrow: 1, flexBasis: 145, minWidth: 0, backgroundColor: "white", borderRadius: 13, borderWidth: 1, borderColor: "#DFEBE9", minHeight: 94, padding: 12, alignItems: "center", flexDirection: "row", gap: 11 },
  lockedIconCircle: { width: 48, height: 48, borderRadius: 13, backgroundColor: "#E5F6F1", alignItems: "center", justifyContent: "center" },
  lockedStatWords: { flex: 1, minWidth: 0 },
  lockedStatValue: { fontFamily:"EventInterExtraBold", fontSize: 22, fontWeight: "900", color: "#0C2C49" },
  lockedStatLabel: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: "#173652" },
  lockedToolbar: { marginTop: 13, gap: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" },
  lockedSearch: { width: 250, minWidth: 190, flexShrink: 1 },
  lockedEventList: { marginTop: 8 },
  lockedEventListRows: { gap: 10, paddingTop: 6 },
  lockedMainStack: { width: "100%", flex: 0 },
  lockedEventShell: { backgroundColor: "white", borderColor: "#E1EBE8", borderWidth: 1, borderRadius: 13, overflow: "hidden", width: "100%" },
  lockedEventSummaryClick: { gap: 7, paddingVertical: 6, borderRadius: 8, minWidth: 0 },
  lockedEventTapHint: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
  lockedEventTapHintText: { fontSize: 11, color: "#087F75", fontWeight: "700", flexShrink: 1 },
  lockedListHeading: { flexWrap: "wrap" },
  lockedListControls: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  lockedSortButton: { flexDirection: "row", alignItems: "center", backgroundColor: "white", borderWidth: 1, borderColor: "#DCE9E6", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11, gap: 8, minWidth: 155 },
  lockedSortCaption: { fontSize: 9, color: "#84939F", fontWeight: "700" },
  lockedSortValue: { fontSize: 11, color: "#113A4B", fontWeight: "900" },
  lockedInlineDetails: { marginHorizontal: 11, marginBottom: 11, borderTopWidth: 1, borderColor: "#E2ECEA", paddingTop: 12, gap: 9 },
  lockedInlineTitle: { fontFamily:"EventInterBold", color: "#123248", fontSize: 13, fontWeight: "900", flexShrink: 1 },
  volunteerDetailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 5 },
  volunteerDetailClose: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EDF5F3", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  volunteerDetailCloseText: { color: "#58757C", fontSize: 11, fontWeight: "800" },
  volunteerOverviewBox: { backgroundColor: "#FFFFFF", borderColor: "#E0ECE8", borderWidth: 1, borderRadius: 12, padding: 14, gap: 11 },
  volunteerOverviewLabel: { color: "#0A8478", fontSize: 10, letterSpacing: 0.5, fontWeight: "900" },
  volunteerEventFacts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 3 },
  volunteerEventFact: { flexGrow: 1, flexBasis: 205, flexDirection: "row", gap: 9, alignItems: "flex-start", minWidth: 0, borderRadius: 10, padding: 12, backgroundColor: "#F1F9F6" },
  volunteerEventFactText: { flex: 1, minWidth: 0, gap: 4 },
  volunteerEventFactCaption: { fontSize: 9, fontWeight: "900", color: "#788C99", letterSpacing: 0.4 },
  volunteerEventFactValue: { fontSize: 12, fontWeight: "700", lineHeight: 18, color: "#264655" },

  lockedLoadMoreRow: { flexDirection: "row", justifyContent: "center", marginTop: 5 },
  lockedLoadMoreButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 11, backgroundColor: "#E7F7F2", borderWidth: 1, borderColor: "#CBE8E0" },
  lockedLoadMoreText: { fontSize: 12, fontWeight: "800", color: "#087B71" },
  lockedEventRow: { backgroundColor: "white", borderRadius: 13, padding: 10, flexDirection: "row", gap: 13, width: "100%" },
  lockedEventSelected: { borderColor: "#0A9E8D", borderWidth: 1.5 },
  lockedEventVertical: { flexDirection: "column" },
  lockedEventPicture: { width: 177, minHeight: 170, borderRadius: 10, overflow: "hidden", backgroundColor: "#CFEDE4", flexShrink: 0 },
  lockedPictureNarrow: { width: "100%", minHeight: 160 },
  lockedImageFill: { position: "absolute", width: "100%", height: "100%" },
  lockedImageFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  lockedFallbackLabel: { fontFamily:"EventInterSemiBold", color: "#08776C", fontWeight: "900", fontSize: 11, marginTop: 10 },
  lockedImageStatus: { position: "absolute", top: 8, left: 8, backgroundColor: "#E6FAEC", borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", gap: 4, alignItems: "center" },
  lockedImageStatusText: { color: "#067C60", fontSize: 9, fontWeight: "900" },
  lockedEventInfo: { flex: 1, minWidth: 0, justifyContent: "center", gap: 5 },
  lockedEventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 5 },
  lockedEventName: { fontFamily:"EventInterBold", flex: 1, minWidth: 0, color: "#0F3047", fontSize: 15, fontWeight: "900" },
  lockedSlotsPill: { flexDirection: "row", flexShrink: 0, alignItems: "center", gap: 4, backgroundColor: "#E8F8F0", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  lockedSlotsText: { color: "#07836E", fontSize: 9, fontWeight: "800" },
  lockedSmallTag: { backgroundColor: "#E8F7F0", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, gap: 5, flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  lockedSmallTagText: { color: "#06786E", fontSize: 10, fontWeight: "800" },
  lockedEventExcerpt: { fontSize: 10.8, lineHeight: 15, color: "#56748A" },
  lockedEventMeta: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  lockedEventMetaText: { flex: 1, minWidth: 0, color: "#60768A", fontSize: 10.5, lineHeight: 16 },
  lockedRowActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap", marginTop: 2 },
  lockedSecondaryAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#E8F7F4", borderRadius: 8, paddingHorizontal: 11, minHeight: 33 },
  lockedSecondaryActionText: { fontFamily:"EventInterSemiBold", color: "#076E69", fontSize: 10, fontWeight: "900" },
  lockedPrimaryAction: { backgroundColor: "#087D77", borderRadius: 8, paddingHorizontal: 14, minHeight: 33, alignItems: "center", justifyContent: "center" },
  lockedPrimaryActionText: { fontFamily:"EventInterBold", color: "white", fontWeight: "900", fontSize: 10 },
  lockedJoined: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
  lockedJoinedText: { color: "#077C69", fontSize: 10, fontWeight: "800" },
  lockedAboutCard: { backgroundColor: "white", borderColor: "#E1EBE8", borderWidth: 1, borderRadius: 13, padding: 16, marginTop: 14, gap: 9 },
  lockedAboutText: { color: "#567183", fontSize: 12, lineHeight: 20 },
  lockedRailCard: { width: "100%", minWidth: 0, backgroundColor: "white", borderRadius: 15, padding: 14, borderWidth: 1, borderColor: "#E1EBE9", overflow: "hidden" },
  lockedAttendanceRail: { backgroundColor: "#F2FBF6", borderColor: "#B4DDCB", borderWidth: 1.5 },
  lockedEventMapCard: { backgroundColor: "#F5FAF9", borderRadius: 12, borderWidth: 1, borderColor: "#D6EAE2", padding: 16, marginTop: 4, gap: 4 },
  lockedAttendanceOverview: { backgroundColor: "#E6F6ED", borderRadius: 11, padding: 10, gap: 9, marginBottom: 12 },
  lockedAttendanceOverviewHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 7 },
  lockedAttendanceOverviewTitle: { fontFamily:"EventInterBold", color: "#0D6A55", fontSize: 12, fontWeight: "900" },
  lockedAttendanceSort: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: "white", borderRadius: 8, borderWidth: 1, borderColor: "#B9DECD" },
  lockedAttendanceSortText: { color: "#0B7666", fontSize: 10, fontWeight: "800" },
  lockedAttendanceHistory: { gap: 6 },
  lockedAttendanceHistoryItem: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 9, borderWidth: 1, borderColor: "#C9E5D7", padding: 9, backgroundColor: "#FFFFFF" },
  lockedAttendanceHistoryActive: { borderColor: "#078F82", borderWidth: 1.5, backgroundColor: "#F4FFFA" },
  lockedAttendanceHistoryTitle: { fontFamily:"EventInterBold", fontSize: 11, fontWeight: "900", color: "#133D3D" },
  lockedAttendanceHistoryDate: { fontSize: 10, color: "#567F75", marginTop: 4, lineHeight: 15 },
  lockedAttendanceHistoryBadge: { backgroundColor: "#E3EDF1", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, flexShrink: 0 },
  lockedAttendanceHistoryBadgeVerified: { backgroundColor: "#D8F4E4" },
  lockedAttendanceHistoryBadgeText: { fontFamily:"EventInterBold", fontSize: 9, fontWeight: "900", color: "#087666" },
  lockedAttendanceMore: { flexDirection: "row", alignSelf: "center", alignItems: "center", padding: 8, gap: 5 },
  lockedAttendanceMoreText: { fontSize: 11, fontWeight: "800", color: "#087567" },
  lockedAttendanceEmptyText: { fontSize: 11, color: "#527D72", lineHeight: 17 },
  nativeAttendancePanel: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#F0FAF5", borderWidth: 1, borderColor: "#C0E5D2", gap: 9 },
  lockedSectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  lockedSectionIcon: { width: 40, height: 40, backgroundColor: "#E5F8F2", borderRadius: 10, justifyContent: "center", alignItems: "center" },
  lockedSectionTitle: { fontFamily:"EventInterBold", color: "#17483E", fontSize: 16, fontWeight: "900", flexShrink: 1 },
  lockedSectionSub: { color: "#6E8494", fontSize: 10.5, marginTop: 3 },
  lockedMapAddress: { fontSize: 11, color: "#486980", lineHeight: 17, marginBottom: 9 },
  lockedMapFrame: { width: "100%", height: 260, overflow: "hidden", borderRadius: 11, backgroundColor: "#E5F3EF", borderWidth: 1, borderColor: "#DCEAE8" },
  lockedMapPlaceholder: { backgroundColor: "#F1F7F6", minHeight: 160, borderRadius: 11, justifyContent: "center", alignItems: "center", padding: 18, gap: 12 },
  lockedMapHintRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 8 },
  lockedMapWarning: { flex: 1, color: "#718793", fontSize: 9.5, lineHeight: 15 },
  lockedMapFootnote: { color: "#788E9B", fontSize: 9.5, lineHeight: 15, marginTop: 9 },
  lockedMapActions: { flexDirection: "row", flexWrap: "wrap", marginTop: 11, gap: 8 },
  lockedMapOutline: { flexGrow: 1, flexBasis: 190, minWidth: 0, borderWidth: 1, borderColor: "#BFD7D8", backgroundColor: "white", borderRadius: 9, paddingHorizontal: 11, minHeight: 45, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 7 },
  lockedMapOutlineText: { color: "#0A5663", fontSize: 11, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  lockedMapSolid: { flexGrow: 1, flexBasis: 190, minWidth: 0, backgroundColor: "#007B75", borderRadius: 9, paddingHorizontal: 11, minHeight: 45, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 7 },
  lockedMapSolidText: { color: "white", fontSize: 11, fontWeight: "900", flexShrink: 1, textAlign: "center" },
  lockedAttendanceVerified: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: "#E3F8ED", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  lockedAttendanceVerifiedText: { color: "#067D68", fontSize: 9, fontWeight: "900" },
  lockedAttendanceEmpty: { backgroundColor: "#F4F9F9", borderRadius: 11, padding: 22, alignItems: "center", gap: 10 },
  lockedAttendancePanel: { backgroundColor: "#F0FAF5", borderWidth: 1, borderColor: "#C7E5D4", borderRadius: 12, padding: 10, marginTop: 3 },
  lockedParticipationMeta: { backgroundColor: "#ECF8F5", borderRadius: 8, padding: 9, marginBottom: 7 },
  lockedParticipationText: { fontSize: 11, fontWeight: "800", color: "#087567" },
  lockedCertificateLine: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E5EFED", flexDirection: "row", alignItems: "center", gap: 7 },
  lockedCertificateLineText: { flex: 1, color: "#687F8E", fontSize: 10, lineHeight: 15 },
  lockedVerifiedSummary: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, paddingHorizontal: 10, paddingVertical: 11, backgroundColor: "#E6F7EF", borderRadius: 9 },
  lockedVerifiedSummaryText: { flex: 1, color: "#08705F", fontWeight: "700", fontSize: 10.5, lineHeight: 15 },
  lockedRouteReady: { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#E7F7F0", paddingHorizontal: 9, paddingVertical: 8, borderRadius: 8 },
  lockedRouteReadyText: { color: "#166D61", flex: 1, fontSize: 10, lineHeight: 15 },
  lockedRouteReset: { color: "#075F66", fontSize: 11, fontWeight: "800", textDecorationLine: "underline" },
  lockedRouteHintRow: { flexDirection: "row", gap: 7, marginTop: 8, alignItems: "flex-start" },
  lockedRouteNotice: { color: "#607A89", flex: 1, fontSize: 10, lineHeight: 16 },
  lockedAttendanceEventCard: { backgroundColor: "#FFFFFF", borderColor: "#E1EBED", borderWidth: 1, borderRadius: 10, padding: 7, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 },
  lockedAttendanceThumb: { width: 80, height: 65, borderRadius: 8 },
  lockedAttendanceThumbFallback: { width: 80, height: 65, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  lockedAttendanceEventInfo: { flex: 1, minWidth: 0, gap: 3 },
  lockedAttendanceEventTitle: { fontSize: 12.5, fontWeight: "900", color: "#13334B" },
  lockedAttendanceEventPlace: { fontSize: 10.5, color: "#667F91", lineHeight: 14.5 },
  lockedAttendanceEventDate: { flexDirection: "row", alignItems: "center", gap: 4 },
  lockedAttendanceEventDateText: { fontSize: 9.5, color: "#627F96", flexShrink: 1 },
  lockedAttendanceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%", marginBottom: 9 },
  lockedAttendanceTile: { flexGrow: 1, flexBasis: "47%", minWidth: 0, minHeight: 65, flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 8, gap: 6, backgroundColor: "#FCFEFD", borderWidth: 1, borderColor: "#E2ECEA", borderRadius: 10 },
  lockedAttendanceTileIcon: { width: 29, height: 29, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  lockedAttendanceTileBody: { flex: 1, minWidth: 0 },
  lockedAttendanceTileLabel: { color: "#6C8595", fontSize: 9.5, lineHeight: 14 },
  lockedAttendanceTileValue: { fontFamily:"EventInterBold", color: "#12344A", fontWeight: "900", fontSize: 11.5, marginTop: 2 },
  lockedAttendanceTileSmall: { color: "#728897", fontSize: 9, marginTop: 2 },
  lockedAttendanceVerifier: { flexDirection: "row", alignItems: "center", gap: 7, padding: 9, backgroundColor: "#F1F9F7", borderRadius: 8, marginBottom: 9 },
  lockedAttendanceVerifierText: { fontSize: 10.5, fontWeight: "800", color: "#08766B", flex: 1 },
  // Resident Community Proposal: clear section hierarchy, touch-friendly selections and safe media links.
  residentFormCard: { borderRadius: 19, padding: 20, borderColor: "#DCEAE5", backgroundColor: "#FFFFFF", overflow: "hidden" },
  residentFormHero: { flexDirection: "row", gap: 15, padding: 20, borderRadius: 15, marginBottom: 19, alignItems: "center" },
  residentFormHeroIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: "#D0F0E5", alignItems: "center", justifyContent: "center" },
  residentFormKicker: { fontFamily:"EventInterBold", fontSize: 10, fontWeight: "900", letterSpacing: 1.15, color: "#078578" },
  residentFormHeroTitle: { fontFamily:"EventInterExtraBold", fontSize: 22, lineHeight: 29, fontWeight: "900", color: "#174438", marginTop: 5 },
  residentFormHeroSub: { fontSize: 12, lineHeight: 19, color: "#536D7C", marginTop: 5 },
  residentSectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#E6EFEB", paddingTop: 20, marginTop: 17, marginBottom: 13 },
  residentSectionIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#E3F7EF", alignItems: "center", justifyContent: "center" },
  residentSectionTitle: { fontFamily:"EventInterBold", fontSize: 16, lineHeight: 21, fontWeight: "900", color: "#13334B" },
  residentSectionSub: { fontSize: 11, color: "#728597", lineHeight: 16, marginTop: 3 },
  residentHelp: { fontSize: 11, color: "#6A8291", lineHeight: 17, marginBottom: 7 },
  residentChipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8, marginTop: 4 },
  residentChoiceChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#BEDCD4", backgroundColor: "#F4FBF8", paddingHorizontal: 12, minHeight: 38, borderRadius: 10 },
  residentChoiceChipSelected: { backgroundColor: "#078F82", borderColor: "#078F82" },
  residentChoiceText: { fontSize: 11.5, fontWeight: "800", color: "#286B65" },
  residentChoiceTextSelected: { color: "#FFFFFF" },
  residentSkillChip: { backgroundColor: "#F8FBFC" },
  residentMultiline: { minHeight: 108, textAlignVertical: "top", paddingVertical: 12 },
  residentSmallInput: { marginTop: 8, marginBottom: 8 },
  residentSafeguard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderColor: "#F2DEA8", backgroundColor: "#FFF9EA", padding: 12, borderRadius: 10, marginTop: 8, marginBottom: 9 },
  residentSafeguardText: { flex: 1, fontSize: 11, lineHeight: 17, color: "#795B24" },
  residentMediaNotice: { flexDirection: "row", gap: 9, alignItems: "flex-start", backgroundColor: "#ECF7FA", borderRadius: 10, padding: 13, marginBottom: 10 },
  residentMediaNoticeText: { flex: 1, fontSize: 11, lineHeight: 17, color: "#4C7181" },
  residentMediaField: { marginBottom: 6 },
  residentMediaPreview: { width: "100%", maxWidth: 360, height: 150, borderRadius: 11, backgroundColor: "#E7EFF0", marginTop: 4, marginBottom: 9 },
  residentMediaLink: { flexDirection: "row", gap: 7, alignItems: "center", padding: 8, alignSelf: "flex-start" },
  residentMediaLinkText: { color: "#067E73", fontSize: 11.5, fontWeight: "800" },
  residentSubmissionFooter: { flexDirection: "row", gap: 10, alignItems: "center", borderTopWidth: 1, borderTopColor: "#E6EFEB", marginTop: 21, paddingTop: 17, marginBottom: 12 },
  residentMiniChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 },
  residentMiniChip: { backgroundColor: "#E8F7F2", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  residentMiniChipText: { color: "#08796B", fontSize: 10, fontWeight: "800" },
  residentProposalExcerpt: { color: "#5A7789", fontSize: 11, lineHeight: 17, marginTop: 6 },
  residentProposalPhoto: { height: 120, maxWidth: 280, width: "100%", borderRadius: 8, marginTop: 9 },

  // Donations-style premium banner: calendar emblem, actual counters, safe responsiveness.
  communityHeroLayout:{minHeight:190,paddingTop:24,paddingBottom:24,paddingLeft:163,
    paddingRight:18,flexDirection:"row",alignItems:"center",gap:18},
  communityHeroLayoutCompact:{paddingTop:19,paddingLeft:14,paddingRight:14,
    paddingBottom:18,flexDirection:"column",alignItems:"stretch",gap:10},
  communityHeroCopy:{flex:1,minWidth:0,paddingRight:2},
  communityHeroCopyCompact:{width:"100%",paddingLeft:101,paddingRight:0,
    minHeight:107,justifyContent:"center",flex:0},
  communityHeroEyebrow:{ fontFamily:"EventInterBold",fontSize:10,fontWeight:"900",letterSpacing:1,
    color:"#167B60",marginBottom:4},
  communityHeroTitle:{ fontFamily:"EventInterExtraBold",fontSize:34,lineHeight:40,fontWeight:"900",
    letterSpacing:-0.8,color:"#074A3C"},
  communityHeroTitleCompact:{fontSize:25,lineHeight:30},
  communityHeroTagline:{ fontFamily:"EventInterBold",fontSize:13,fontWeight:"800",color:"#0F6E52",marginTop:5},
  communityHeroDescription:{ fontFamily:"EventInter",fontSize:11.5,lineHeight:18,color:"#46786D",
    marginTop:7,maxWidth:460},
  communityHeroStats:{flexDirection:"row",alignItems:"stretch",gap:9,
    width:"46%",maxWidth:480,minWidth:350},
  communityHeroStatsCompact:{width:"100%",maxWidth:"100%",minWidth:0,
    flexWrap:"wrap",justifyContent:"space-between"},
  communityHeroStatCard:{flex:1,minWidth:95,backgroundColor:"rgba(255,255,255,0.92)",
    borderWidth:1,borderColor:"rgba(229,248,239,0.84)",borderRadius:13,
    minHeight:78,paddingHorizontal:10,paddingVertical:11,
    alignItems:"center",justifyContent:"center",gap:6,
    shadowColor:"#05774F",shadowOpacity:0.05,shadowRadius:6,
    shadowOffset:{width:0,height:3}},
  communityHeroStatCopy:{alignItems:"center",gap:3,minWidth:0},
  communityHeroStatNumber:{ fontFamily:"EventInterExtraBold",fontSize:18,fontWeight:"900",color:"#0C493E"},
  communityHeroStatLabel:{ fontFamily:"EventInterSemiBold",fontSize:9.5,lineHeight:13,textAlign:"center",
    fontWeight:"700",color:"#4D786C"},
  // Final Resident Community Events UI (matches the approved mockup).
  ruiHeroHeight: { minHeight: 170 },
  ruiHeroImage: { position: "absolute", top: 0, right: 0, width: "55%", height: "100%" },
  ruiHeroOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  ruiFilterBar: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 15, marginBottom: 11 },
  ruiFilterSelect: { flex: 1, minWidth: 160, borderWidth: 1, borderColor: "#DCE7E9", backgroundColor: "white", borderRadius: 9, paddingHorizontal: 12, minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  ruiFilterLabel: { color: "#3D5B73", fontSize: 11.5, fontWeight: "700", flexShrink: 1 },
  ruiCardGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", justifyContent: "flex-start", gap: 12 },
  ruiCard: { borderRadius: 12, borderWidth: 1, borderColor: "#DAE9E7", backgroundColor: "#FFFFFF", overflow: "hidden", marginBottom: 5 },
  ruiCardCover: { width: "100%", height: 155, backgroundColor: "#BDEADB" },
  ruiCoverImage: { width: "100%", height: "100%" },
  ruiCoverFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  ruiCoverFallbackText: { fontSize: 11, fontWeight: "800", color: "#EFFFFA" },
  ruiImageStatus: { position: "absolute", top: 10, left: 11, backgroundColor: "#D5F5E6", borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8 },
  ruiImageStatusText: { fontFamily:"EventInterSemiBold", fontSize: 10, fontWeight: "900", color: "#087F70" },
  ruiCardBody: { padding: 12, gap: 7, flex: 1 },
  ruiCardTitle: { fontFamily:"EventInterBold", fontSize: 14.5, fontWeight: "900", color: "#154438", lineHeight: 19 },
  ruiTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginVertical: 4 },
  ruiCategoryTag: { backgroundColor: "#E3F8EC", color: "#058377", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: "800", overflow: "hidden" },
  ruiBarangayTag: { backgroundColor: "#E9F4FF", color: "#2376BB", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: "800", overflow: "hidden" },
  ruiInfoLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  ruiMeta: { color: "#586F85", fontSize: 11, lineHeight: 16, flexShrink: 1 },
  ruiPrimary: { backgroundColor: "#008E7B", minHeight: 37, paddingHorizontal: 14, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 5 },
  ruiPrimaryText: { fontFamily:"EventInterBold", color: "#FFFFFF", fontSize: 11.5, fontWeight: "900" },
  ruiDetailsCard: { backgroundColor: "white", padding: 17, borderWidth: 1, borderColor: "#DCE9E8", borderRadius: 13, width: "100%" },
  ruiBack: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 7, alignSelf: "flex-start" },
  ruiBackText: { color: "#0A786D", fontWeight: "800", fontSize: 11 },
  ruiDetailIntro: { flexDirection: "row", gap: 18 },
  ruiDetailPhoto: { width: 240, height: 190, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ruiDetailOverview: { flex: 1, minWidth: 0, gap: 7 },
  ruiDetailTitle: { fontFamily:"EventInterExtraBold", fontSize: 22, color: "#133448", fontWeight: "900", marginBottom: 5 },
  ruiDetailTabs: { flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: "#DDECE7", gap: 7, marginTop: 13 },
  ruiDetailTab: { paddingVertical: 10, paddingHorizontal: 9 },
  ruiDetailTabActive: { borderBottomWidth: 3, borderBottomColor: "#009987" },
  ruiDetailTabText: { color: "#52728D", fontSize: 11, fontWeight: "700" },
  ruiDetailTabTextActive: { fontFamily:"EventInterBold", color: "#058678", fontWeight: "900" },
  ruiDetailContent: { gap: 9, paddingVertical: 15 },
  ruiSectionTitle: { fontFamily:"EventInterBold", fontSize: 12.5, color: "#173549", fontWeight: "900" },
  ruiParagraph: { color: "#617789", fontSize: 11.5, lineHeight: 18 },
  ruiRequirementTag: { color: "#08776E", backgroundColor: "#E3F7F2", borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, fontSize: 10, overflow: "hidden" },
  ruiMediaGallery: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  ruiGalleryPhoto: { width: 170, height: 120, borderRadius: 8 },
  ruiProposalWrap: { width: "100%", maxWidth: 1160, alignSelf: "center", marginTop: 13 },
  ruiSectionHeading: { fontFamily:"EventInterBold", color: "#14364D", fontSize: 19, fontWeight: "900" },
  ruiProposalRow: { marginTop: 8, backgroundColor: "white", borderWidth: 1, borderColor: "#DBE9E8", borderRadius: 10, flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  ruiProposalThumbnail: { width: 86, height: 68, backgroundColor: "#C3ECDA", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  ruiProposalDescription: { flex: 1, minWidth: 0, gap: 4 },
  ruiProposalTitle: { fontFamily:"EventInterBold", fontSize: 13, fontWeight: "900", color: "#12354C" },
  ruiProposalNote: { color: "#0C8B72", fontSize: 10.5 },
  ruiProposalStatus: { borderRadius: 7, backgroundColor: "#E6F6ED", paddingHorizontal: 9, paddingVertical: 6 },
  ruiProposalStatusPending: { backgroundColor: "#FFF2D9" },
  ruiProposalStatusRejected: { backgroundColor: "#FFE8E8" },
  ruiProposalStatusText: { fontFamily:"EventInterBold", color: "#067965", fontWeight: "900", fontSize: 9 },
  ruiFormRoot: { marginTop: 13, backgroundColor: "white", borderWidth: 1, borderColor: "#E0EAEA", padding: 19, borderRadius: 17, width: "100%" },
  ruiFormCompact: { paddingHorizontal: 12 },
  ruiFormTop: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", alignItems: "center", gap: 10 },
  ruiFormApproval: { fontSize: 10.5, color: "#6C8297" },
  ruiFormTitle: { fontFamily:"EventInterExtraBold", color: "#17483C", fontSize: 23, fontWeight: "900", marginTop: 13, marginBottom: 13 },
  ruiFormSection: { borderWidth: 1, borderColor: "#E6EFED", borderRadius: 13, padding: 16, marginBottom: 12, backgroundColor: "#FFFFFF" },
  ruiStepRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 },
  ruiStepNumber: { fontFamily:"EventInterBold", backgroundColor: "#04927B", borderRadius: 20, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 11, color: "white", fontSize: 12, fontWeight: "900" },
  ruiStepHeading: { fontFamily:"EventInterBold", fontWeight: "900", fontSize: 14, color: "#16483C" },
  ruiFormRow: { flexDirection: "row", gap: 11, marginBottom: 6, alignItems: "flex-start" },
  ruiFormRowStack: { flexDirection: "column" },
  ruiFormCell: { flex: 1, minWidth: 0 },
  ruiTextarea: { minHeight: 85, paddingTop: 12, marginBottom: 2 },
  ruiSmallTextarea: { minHeight: 69, paddingTop: 10, marginBottom: 11 },
  ruiCharCount: { fontSize: 10, color: "#8B9EA9", textAlign: "right", marginBottom: 11 },
  ruiChecklistColumn: { padding: 11, borderWidth: 1, borderColor: "#EEF2F2", borderRadius: 8 },
  ruiChecklistTitle: { fontFamily:"EventInterBold", color: "#14354C", fontWeight: "900", fontSize: 12, marginBottom: 4 },
  ruiChecklistSubtitle: { color: "#7E94A5", fontSize: 10.5, lineHeight: 16, marginBottom: 10 },
  ruiChecklistItem: { flexDirection: "row", gap: 7, alignItems: "center", minHeight: 28 },
  ruiChecklistText: { color: "#35546D", fontSize: 11.5, flexShrink: 1 },
  ruiMiniInput: { marginTop: 9 },
  ruiSkillsChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  ruiSkillChip: { backgroundColor: "#F0F6F7", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  ruiSkillChipSelected: { backgroundColor: "#D7F4E9" },
  ruiSkillChipText: { color: "#467083", fontSize: 10.5 },
  ruiSkillChipTextSelected: { color: "#087A6D", fontWeight: "900" },
  ruiUploadRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  ruiUploadTile: { borderWidth: 1, borderColor: "#BDCEDC", borderRadius: 8, borderStyle: "dashed", width: 92, height: 95, alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 3 },
  ruiTilePreview: { width: "100%", height: 55, borderRadius: 5 },
  ruiUploadText: { color: "#2A536C", fontSize: 10, fontWeight: "900", marginTop: 2 },
  ruiUploadHint: { fontSize: 9, color: "#7790A5" },
  ruiFormFooter: { alignItems: "center", justifyContent: "flex-end", flexDirection: "row", gap: 9 },
  ruiCancelButton: { borderWidth: 1, borderColor: "#D3E2E7", borderRadius: 8, paddingHorizontal: 19, paddingVertical: 11 },
  ruiCancelText: { color: "#4F7186", fontWeight: "800", fontSize: 12 },
  ruiSubmitButton: { paddingHorizontal: 19, marginTop: 0 },
  ruiFilterBackdrop: { backgroundColor: "#0009", flex: 1, justifyContent: "center", alignItems: "center", padding: 15 },
  ruiFilterModal: { backgroundColor: "white", padding: 18, borderRadius: 13, width: "100%", maxWidth: 450 },
  ruiFilterModalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  ruiFilterOption: { minHeight: 39, paddingHorizontal: 8, justifyContent: "center", borderBottomColor: "#EDF1F1", borderBottomWidth: 1 },
});
