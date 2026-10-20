
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
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
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  createdAt?: unknown;
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
  capacity: string;
  description: string;
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
  capacity: "20",
  description: "",
};

const colors = {
  green: "#078F82",
  ink: "#153044",
  muted: "#66788B",
  border: "#DEE9E8",
  bg: "#F5F9F8",
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
  return start > 0 && end >= start ? Math.round((end - start) / 60000) : 0;
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

  return message;
};

export default function CommunityEventsScreen() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();

  const isCompact = width < (Platform.OS === "web" ? 950 : 720);
  const webSideBySide = width >= 1450; // Allow room for the existing navigation sidebar and 360px map rail.
  const webRowNarrow = width < 760;
  const mode = activeModeForProfile(profile);

  const isVolunteer =
    mode === "volunteer" &&
    hasVolunteerAccess(profile);

  const canPropose =
    mode === "resident" &&
    hasResidentAccess(profile);

  const [section, setSection] =
    useState<Section>("explore");

  const [category, setCategory] =
    useState<Category | "All">("All");

  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState<"soonest" | "latest">("soonest");
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

  const [calendarMonth, setCalendarMonth] =
    useState(() => new Date());

  const [clockHour, setClockHour] = useState(8);
  const [clockMinute, setClockMinute] = useState(0);

  const [clockPeriod, setClockPeriod] =
    useState<"AM" | "PM">("AM");

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
          matchesSearch
        );
      })
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );
  }, [events, category, search]);

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
  const selectedEvent = displayEvents.find((event) => event.id === expandedEvent) || displayEvents[0] || null;
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
  const openTimePicker = () => {
    const match =
      /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
        form.time
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
      "time",
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

    const dateOkay =
      /^\d{4}-\d{2}-\d{2}$/.test(form.date);

    const timeOkay =
      /^([01]\d|2[0-3]):[0-5]\d$/.test(form.time);

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
      await addDoc(
        collection(db, "communityEventProposals"),
        {
          title,
          description,
          category: form.category,
          barangay,
          location,
          date: form.date,
          time: form.time,
          capacity,
          proposedBy: user.uid,
          proposerName: String(
            profile.fullName || "Resident"
          ),
          status: "pending",
          adminNote: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setForm(initialForm);
      setCustomVenue(false);
      setCustomCapacity(false);
      setSection("mine");

      setNotice(
        "Proposal submitted! Please wait for Admin/LGU review."
      );
    } catch (error) {
      setNotice(errorText(error));
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

            <Text style={styles.eventTitle}>
              {event.title}
            </Text>
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
            <Text style={styles.description}>
              {event.description ||
                "No additional details provided."}
            </Text>
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
    const selected = selectedEvent?.id === event.id;
    const detailsOpen = expandedEvent === event.id;
    const cover = eventCover(event);
    const toggleDetails = () => setExpandedEvent(detailsOpen ? null : event.id);

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
            {!!event.description && <Text style={styles.lockedEventExcerpt} numberOfLines={2}>{event.description}</Text>}
            <View style={styles.lockedEventMeta}>
              <Ionicons name="calendar-outline" size={14} color="#6B7F93" />
              <Text style={styles.lockedEventMetaText}>{prettyDate(event.date, event.time)}</Text>
            </View>
            <View style={styles.lockedEventMeta}>
              <Ionicons name="location-outline" size={14} color="#6B7F93" />
              <Text style={styles.lockedEventMetaText} numberOfLines={2}>{event.location}{event.barangay ? `, ${event.barangay}` : ""}</Text>
            </View>
            <View style={styles.lockedEventMeta}>
              <Ionicons name="people-outline" size={14} color="#6B7F93" />
              <Text style={styles.lockedEventMetaText}>{Number(event.participantsCount || 0)} / {Number(event.capacity || 0)} volunteers</Text>
            </View>
            <View style={styles.lockedRowActions}>
              <Pressable accessibilityRole="button" onPress={toggleDetails} style={styles.lockedSecondaryAction}>
                <Text style={styles.lockedSecondaryActionText}>{detailsOpen ? "Hide Details" : "View Details"}</Text>
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
            <View style={styles.lockedSectionHeading}>
              <Ionicons name="information-circle-outline" size={19} color="#07877A" />
              <Text style={styles.lockedInlineTitle}>About {event.title}</Text>
            </View>
            <Text style={styles.lockedAboutText} numberOfLines={7}>
              {event.description?.trim() || "No additional description was provided for this event."}
            </Text>
            <Text style={styles.lockedEventMetaText}>{prettyDate(event.date, event.time)} · {event.location}{event.barangay ? `, ${event.barangay}` : ""}</Text>
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
          </View>
        )}
      </View>
    );
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
            <View style={styles.webHero}>
              <LinearGradient colors={["#DBF4EC", "#EBF8F6", "#EFFBFA"]} style={styles.lockedHeroGradient}>
                <View style={styles.lockedHeroWords}>
                  <View style={styles.webHeroKickerRow}><Ionicons name="leaf-outline" size={15} color="#008579" />
                    <Text style={styles.webHeroKicker}>COMMUNITY EVENTS · SAN JOSE DEL MONTE</Text></View>
                  <Text style={[styles.webHeroTitle, isCompact && styles.webHeroTitleSmall]}>Be part of a stronger San Jose del Monte.</Text>
                  <Text style={styles.webHeroDescription}>{isVolunteer ? "Join local community events and make a meaningful difference." : "Discover community activities or propose an event for your barangay."}</Text>
                </View>
                {webSideBySide && <View style={styles.lockedHeroIllustration} pointerEvents="none">
                  <View style={styles.lockedHeroSun} />
                  <View style={styles.lockedHeroHillBack} />
                  <View style={styles.lockedHeroHillFront} />
                  <View style={styles.lockedHeroQuote}>
                    <Ionicons name="leaf" color="#0C8E7A" size={28} />
                    <Text style={styles.lockedHeroMotto} numberOfLines={2}>{"People for a Cleaner,\nBrighter Tomorrow."}</Text>
                  </View>
                </View>}
              </LinearGradient>
            </View>
            <View style={styles.lockedStats}>
              <View style={styles.lockedStatCard}><View style={styles.lockedIconCircle}><Ionicons name="calendar-outline" size={24} color="#078F82" /></View><View style={styles.lockedStatWords}><Text style={styles.lockedStatValue}>{availableCount}</Text><Text style={styles.lockedStatLabel}>Available Events</Text></View></View>
              <View style={styles.lockedStatCard}><View style={[styles.lockedIconCircle, {backgroundColor: "#EAF3FF"}]}><Ionicons name="people-outline" size={24} color="#1879DC" /></View><View style={styles.lockedStatWords}><Text style={styles.lockedStatValue}>{isVolunteer ? myEvents.length : proposals.length}</Text><Text style={styles.lockedStatLabel}>{isVolunteer ? "My Joined Events" : "My Proposals"}</Text></View></View>
              <View style={styles.lockedStatCard}><View style={styles.lockedIconCircle}><Ionicons name="ribbon-outline" size={24} color="#078F82" /></View><View style={styles.lockedStatWords}><Text style={styles.lockedStatValue}>{completedCount}</Text><Text style={styles.lockedStatLabel}>Completed Events</Text></View></View>
            </View>
            <View style={styles.lockedToolbar}>
              <View style={styles.webSectionTabs}>
                <Pressable onPress={() => { setSection("explore"); setNotice(""); }} style={[styles.webSectionTab, section === "explore" && styles.webSectionTabActive]}><Text style={[styles.webSectionTabText, section === "explore" && styles.webSectionTabTextActive]}>Explore Events</Text></Pressable>
                <Pressable onPress={() => { setSection("mine"); setNotice(""); }} style={[styles.webSectionTab, section === "mine" && styles.webSectionTabActive]}><Text style={[styles.webSectionTabText, section === "mine" && styles.webSectionTabTextActive]}>{isVolunteer ? "My Events" : "My Proposals"}</Text></Pressable>
                {canPropose && <Pressable onPress={() => { setSection("propose"); setNotice(""); }} style={[styles.webSectionTab, section === "propose" && styles.webSectionTabActive]}><Text style={[styles.webSectionTabText, section === "propose" && styles.webSectionTabTextActive]}>+ Propose Event</Text></Pressable>}
              </View>
              {section === "explore" && <View style={[styles.webSearchWrap, styles.lockedSearch]}><Ionicons name="search-outline" size={17} color="#6B8392" /><TextInput style={styles.webSearchInput} value={search} onChangeText={setSearch} placeholder="Search community events..." placeholderTextColor="#91A4B1" autoCorrect={false}/></View>}
            </View>
            {!!notice && <View style={styles.webNotice}><Ionicons name="information-circle-outline" size={18} color="#0D8273" /><Text style={styles.webNoticeText}>{notice}</Text></View>}
            {!!recordError && <View style={styles.webError}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><Text style={styles.webErrorText}>{recordError}</Text></View>}
            {section === "explore" && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.webFilters}>
              {(["All", ...categories] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.webFilterChip, category === item && styles.webFilterChipActive]}>
                {item !== "All" && <Ionicons name={categoryIcon(item)} size={15} color={category === item ? "white" : "#067A70"}/>}
                <Text style={[styles.webFilterText, category === item && styles.webFilterTextActive]}>{item}</Text>
              </Pressable>)}
            </ScrollView>}
            {(section === "explore" || (section === "mine" && isVolunteer)) && <View style={styles.lockedEventList}>
              <View style={[styles.webListHeading, styles.lockedListHeading]}>
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
              </View>
              {eventsLoading ? <View style={styles.webLoading}><ActivityIndicator color={colors.green}/></View> :
                eventError ? <View style={styles.webError}><Text style={styles.webErrorText}>{eventError}</Text></View> :
                !displayEvents.length ? <View style={styles.webEmptyCard}><Ionicons name="calendar-outline" size={35} color="#91A6AC"/><Text style={styles.webEmptyTitle}>{section === "mine" ? "No joined events yet" : "No matching community events"}</Text><Text style={styles.webEmptySubtitle}>Browse approved events to see the available activities.</Text></View> :
                <View style={styles.lockedEventListRows}>
                  {visibleEvents.map(renderEvent)}
                  {displayEvents.length > 6 && (
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
          {(section === "explore" || (section === "mine" && isVolunteer)) && (
            <View style={[styles.lockedRail, !webSideBySide && styles.lockedRailStack]}>
              <View style={styles.lockedRailCard}>
                <View style={styles.lockedSectionHeading}><View style={styles.lockedSectionIcon}><Ionicons name="location" size={22} color="#078C80" /></View><View style={{flex:1, minWidth:0}}><Text style={styles.lockedSectionTitle}>Event Location</Text><Text style={styles.lockedSectionSub}>Map of the selected volunteer event</Text></View></View>
                {selectedEvent ? <>
                  <Text style={styles.lockedMapAddress} numberOfLines={3}>{selectedEvent.location}{selectedEvent.barangay ? `, ${selectedEvent.barangay}` : ""}, San Jose del Monte, Bulacan</Text>
                  <View style={styles.lockedMapFrame}>{renderWebMap(selectedEvent)}</View>
                  {!eventHasCoordinates(selectedEvent) && <View style={styles.lockedMapHintRow}>
                    <Ionicons name="information-circle-outline" size={14} color="#7C929E" />
                    <Text style={styles.lockedMapWarning}>Approximate location · confirm the meeting point with Admin/LGU</Text>
                  </View>}
                  {routeEventId === selectedEvent.id && routeOrigin && googleMapsEmbedKey ? (
                    <View style={styles.lockedRouteReady}>
                      <Ionicons name="navigate-circle" size={17} color="#078371" />
                      <Text style={styles.lockedRouteReadyText}>Driving route preview from your permitted device location</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Return to event location map" onPress={() => {setRouteEventId(null); setRouteNotice("");}}>
                        <Text style={styles.lockedRouteReset}>Map</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {!!routeNotice && <View style={styles.lockedRouteHintRow}>
                    <Ionicons name="information-circle-outline" size={15} color="#6F8794" />
                    <Text style={styles.lockedRouteNotice}>{routeNotice}</Text>
                  </View>}
                  <View style={styles.lockedMapActions}>
                    <Pressable style={styles.lockedMapOutline} accessibilityRole="button" accessibilityLabel="Show the route inside VolunServe" disabled={routeLoading} onPress={() => showRouteInVolunServe(selectedEvent)}>
                      {routeLoading ? <ActivityIndicator size="small" color="#08796F"/> : <Ionicons name="map-outline" size={16} color="#0B5963"/>}
                      <Text style={styles.lockedMapOutlineText}>{routeLoading ? "Locating..." : "Show Route Here"}</Text>
                    </Pressable>
                    <Pressable style={styles.lockedMapSolid} accessibilityRole="button" accessibilityLabel="Open navigation in Google Maps" onPress={() => void Linking.openURL(googleMapsNavigationUrl(selectedEvent))}>
                      <Ionicons name="navigate-outline" size={16} color="white"/><Text style={styles.lockedMapSolidText}>Open in Google Maps</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.lockedMapFootnote}>In-app route asks for GPS permission. External directions open in Google Maps. VolunServe does not store or continuously track your location.</Text>
                </> : <View style={styles.lockedMapPlaceholder}><Ionicons name="map-outline" color="#8DA8AF" size={33}/><Text style={styles.webEmptySubtitle}>Select an event to see its location.</Text></View>}
              </View>
              <View style={styles.lockedRailCard}>
                <View style={styles.lockedSectionHeading}><View style={styles.lockedSectionIcon}><Ionicons name="time-outline" size={22} color="#078C80" /></View><View style={{flex:1, minWidth:0}}><Text style={styles.lockedSectionTitle}>My Attendance</Text><Text style={styles.lockedSectionSub}>{selectedEvent?.title || "Your participation record"}</Text></View>
                  {selectedParticipation?.attendanceVerified && <View style={styles.lockedAttendanceVerified}><Ionicons name="checkmark-circle" size={14} color="#06856D"/><Text style={styles.lockedAttendanceVerifiedText}>Verified</Text></View>}
                </View>
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
                          <Text style={styles.lockedAttendanceEventDateText}>{prettyDate(selectedEvent.date, selectedEvent.time)}</Text>
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
                            ? formatHours(Math.round((getTime(selectedParticipation?.checkedOutAt) - getTime(selectedParticipation?.checkedInAt)) / 60000)) : "—"}</Text></View>
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

        {section === "mine" && canPropose && <View style={styles.webProposalWrap}>
          <View style={styles.webListHeading}><View><Text style={styles.webHeadingTitle}>My Event Proposals</Text><Text style={styles.webHeadingHint}>Track Admin/LGU review of your submissions</Text></View></View>
          {proposals.length === 0 ? <View style={styles.webEmptyCard}><Ionicons name="document-text-outline" size={34} color="#93A6AE" /><Text style={styles.webEmptyTitle}>No event proposals yet</Text><Text style={styles.webEmptySubtitle}>Submit a proposal to get started.</Text><Pressable style={styles.webEmptyAction} onPress={() => setSection("propose")}><Text style={styles.webEmptyActionText}>Propose Event</Text></Pressable></View> : proposals.slice().sort((a,b) => getTime(b.createdAt) - getTime(a.createdAt)).map((item) => <View key={item.id} style={styles.webProposalCard}><View style={{ flex: 1 }}><Text style={styles.webProposalTitle}>{item.title}</Text><Text style={styles.webMetaText}>{item.category} · {item.barangay} · {prettyDate(item.date, item.time)}</Text><Text style={styles.webMetaText}>{item.location}</Text>{!!item.adminNote && <Text style={styles.webProposalNote}>Admin note: {item.adminNote}</Text>}</View><View style={styles.webProposalBadge}><Text style={styles.webProposalBadgeText}>{item.status.toUpperCase()}</Text></View></View>)}
        </View>}

        {/* Propose event form */}
        {section === "propose" &&
          canPropose && (
            <View style={[styles.formCard, styles.webProposalWrap]}>
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

              <Text
                style={styles.fieldLabel}
              >
                Event title *
              </Text>

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
                    onPress={
                      openTimePicker
                    }
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
            <View style={styles.formCard}>
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

              <Text
                style={styles.fieldLabel}
              >
                Event title *
              </Text>

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
                    onPress={
                      openTimePicker
                    }
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
                  : "Choose event time"}
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
  webHeroTitle: { fontSize: 25, lineHeight: 32, fontWeight: "900", color: "#0B2740", marginTop: 10, maxWidth: 690, flexShrink: 1 },
  webHeroTitleSmall: { fontSize: 22 },
  webHeroDescription: { fontSize: 12.5, lineHeight: 19, color: "#49677D", marginTop: 8, maxWidth: 690 },
  webHeroIllustration: { alignItems: "center", justifyContent: "center", width: 250, height: 120 },
  webHeroCircleLarge: { position: "absolute", width: 215, height: 215, borderRadius: 110, backgroundColor: "#BEE8D9", opacity: 0.52, right: -10, top: -51 },
  webHeroLeaf: { position: "absolute", top: 8, right: 45, transform: [{ rotate: "-22deg" }] },
  webStatsRow: { flexDirection: "row", gap: 12, marginTop: 14, flexWrap: "wrap" },
  webStatsNarrow: { gap: 8 },
  webStatCard: { flexGrow: 1, flexBasis: 240, minWidth: 0, minHeight: 94, backgroundColor: "white", borderColor: "#DDE9E8", borderWidth: 1, borderRadius: 13, flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 14, paddingVertical: 13 },
  webStatIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  webStatNumber: { fontSize: 23, fontWeight: "900", color: "#092B45" },
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
  webHeadingTitle: { color: "#102F48", fontWeight: "900", fontSize: 17 },
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
  webCardTitle: { fontSize: 16, fontWeight: "900", color: "#0C304A" },
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
  webEmptyTitle: { fontWeight: "900", color: "#214051", fontSize: 15, textAlign: "center" },
  webEmptySubtitle: { fontSize: 12, color: "#6B8290", textAlign: "center" },
  webEmptyAction: { backgroundColor: "#048E81", borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10 },
  webEmptyActionText: { color: "white", fontWeight: "900", fontSize: 12 },
  webProposalWrap: { maxWidth: 940, width: "100%", alignSelf: "center", marginTop: 15 },
  webProposalCard: { flexDirection: "row", gap: 15, backgroundColor: "white", padding: 15, borderRadius: 12, borderWidth: 1, borderColor: "#E1EBEA", marginBottom: 8 },
  webProposalTitle: { color: "#12344A", fontSize: 14, fontWeight: "900", marginBottom: 4 },
  webProposalNote: { fontSize: 11, color: "#9C6F39", marginTop: 6 },
  webProposalBadge: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#E7F5EE" },
  webProposalBadgeText: { color: "#007B6C", fontSize: 10, fontWeight: "900" },
  // Locked Community Events UI — responsive left dashboard and compact right rail.
  lockedColumns: { flexDirection: "row", alignItems: "flex-start", width: "100%", gap: 18 },
  lockedColumnsStack: { flexDirection: "column" },
  lockedMain: { flex: 1, minWidth: 0 },
  lockedRail: { width: 360, maxWidth: "100%", flexShrink: 0, gap: 14 },
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
  lockedStatValue: { fontSize: 22, fontWeight: "900", color: "#0C2C49" },
  lockedStatLabel: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: "#173652" },
  lockedToolbar: { marginTop: 13, gap: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" },
  lockedSearch: { width: 250, minWidth: 190, flexShrink: 1 },
  lockedEventList: { marginTop: 8 },
  lockedEventListRows: { gap: 10, paddingTop: 6 },
  lockedMainStack: { width: "100%", flex: 0 },
  lockedEventShell: { backgroundColor: "white", borderColor: "#E1EBE8", borderWidth: 1, borderRadius: 13, overflow: "hidden", width: "100%" },
  lockedListHeading: { flexWrap: "wrap" },
  lockedListControls: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  lockedSortButton: { flexDirection: "row", alignItems: "center", backgroundColor: "white", borderWidth: 1, borderColor: "#DCE9E6", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11, gap: 8, minWidth: 155 },
  lockedSortCaption: { fontSize: 9, color: "#84939F", fontWeight: "700" },
  lockedSortValue: { fontSize: 11, color: "#113A4B", fontWeight: "900" },
  lockedInlineDetails: { marginHorizontal: 11, marginBottom: 11, borderTopWidth: 1, borderColor: "#E2ECEA", paddingTop: 12, gap: 9 },
  lockedInlineTitle: { color: "#123248", fontSize: 13, fontWeight: "900", flexShrink: 1 },
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
  lockedFallbackLabel: { color: "#08776C", fontWeight: "900", fontSize: 11, marginTop: 10 },
  lockedImageStatus: { position: "absolute", top: 8, left: 8, backgroundColor: "#E6FAEC", borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", gap: 4, alignItems: "center" },
  lockedImageStatusText: { color: "#067C60", fontSize: 9, fontWeight: "900" },
  lockedEventInfo: { flex: 1, minWidth: 0, justifyContent: "center", gap: 5 },
  lockedEventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 5 },
  lockedEventName: { flex: 1, minWidth: 0, color: "#0F3047", fontSize: 15, fontWeight: "900" },
  lockedSlotsPill: { flexDirection: "row", flexShrink: 0, alignItems: "center", gap: 4, backgroundColor: "#E8F8F0", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  lockedSlotsText: { color: "#07836E", fontSize: 9, fontWeight: "800" },
  lockedSmallTag: { backgroundColor: "#E8F7F0", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, gap: 5, flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  lockedSmallTagText: { color: "#06786E", fontSize: 10, fontWeight: "800" },
  lockedEventExcerpt: { fontSize: 10.8, lineHeight: 15, color: "#56748A" },
  lockedEventMeta: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  lockedEventMetaText: { flex: 1, minWidth: 0, color: "#60768A", fontSize: 10.5, lineHeight: 16 },
  lockedRowActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap", marginTop: 2 },
  lockedSecondaryAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#E8F7F4", borderRadius: 8, paddingHorizontal: 11, minHeight: 33 },
  lockedSecondaryActionText: { color: "#076E69", fontSize: 10, fontWeight: "900" },
  lockedPrimaryAction: { backgroundColor: "#087D77", borderRadius: 8, paddingHorizontal: 14, minHeight: 33, alignItems: "center", justifyContent: "center" },
  lockedPrimaryActionText: { color: "white", fontWeight: "900", fontSize: 10 },
  lockedJoined: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
  lockedJoinedText: { color: "#077C69", fontSize: 10, fontWeight: "800" },
  lockedAboutCard: { backgroundColor: "white", borderColor: "#E1EBE8", borderWidth: 1, borderRadius: 13, padding: 16, marginTop: 14, gap: 9 },
  lockedAboutText: { color: "#567183", fontSize: 12, lineHeight: 20 },
  lockedRailCard: { width: "100%", minWidth: 0, backgroundColor: "white", borderRadius: 15, padding: 14, borderWidth: 1, borderColor: "#E1EBE9", overflow: "hidden" },
  lockedSectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  lockedSectionIcon: { width: 40, height: 40, backgroundColor: "#E5F8F2", borderRadius: 10, justifyContent: "center", alignItems: "center" },
  lockedSectionTitle: { color: "#113049", fontSize: 16, fontWeight: "900", flexShrink: 1 },
  lockedSectionSub: { color: "#6E8494", fontSize: 10.5, marginTop: 3 },
  lockedMapAddress: { fontSize: 11, color: "#486980", lineHeight: 17, marginBottom: 9 },
  lockedMapFrame: { width: "100%", height: 232, overflow: "hidden", borderRadius: 11, backgroundColor: "#E5F3EF", borderWidth: 1, borderColor: "#DCEAE8" },
  lockedMapPlaceholder: { backgroundColor: "#F1F7F6", minHeight: 160, borderRadius: 11, justifyContent: "center", alignItems: "center", padding: 18, gap: 12 },
  lockedMapHintRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 8 },
  lockedMapWarning: { flex: 1, color: "#718793", fontSize: 9.5, lineHeight: 15 },
  lockedMapFootnote: { color: "#788E9B", fontSize: 9.5, lineHeight: 15, marginTop: 9 },
  lockedMapActions: { flexDirection: "row", marginTop: 11, gap: 8 },
  lockedMapOutline: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: "#BFD7D8", backgroundColor: "white", borderRadius: 8, paddingHorizontal: 6, height: 41, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 5 },
  lockedMapOutlineText: { color: "#0A5663", fontSize: 10.2, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  lockedMapSolid: { flex: 1, minWidth: 0, backgroundColor: "#007B75", borderRadius: 8, paddingHorizontal: 6, height: 41, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 5 },
  lockedMapSolidText: { color: "white", fontSize: 10.2, fontWeight: "900", flexShrink: 1, textAlign: "center" },
  lockedAttendanceVerified: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: "#E3F8ED", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  lockedAttendanceVerifiedText: { color: "#067D68", fontSize: 9, fontWeight: "900" },
  lockedAttendanceEmpty: { backgroundColor: "#F4F9F9", borderRadius: 11, padding: 22, alignItems: "center", gap: 10 },
  lockedAttendancePanel: { backgroundColor: "transparent", borderWidth: 0, padding: 0, marginTop: 3 },
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
  lockedAttendanceTileValue: { color: "#12344A", fontWeight: "900", fontSize: 11.5, marginTop: 2 },
  lockedAttendanceTileSmall: { color: "#728897", fontSize: 9, marginTop: 2 },
  lockedAttendanceVerifier: { flexDirection: "row", alignItems: "center", gap: 7, padding: 9, backgroundColor: "#F1F9F7", borderRadius: 8, marginBottom: 9 },
  lockedAttendanceVerifierText: { fontSize: 10.5, fontWeight: "800", color: "#08766B", flex: 1 },
});
