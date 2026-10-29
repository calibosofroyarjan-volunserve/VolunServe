
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import ListPagination from "../../components/ui/ListPagination";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

const VOLUNSERVE_LOGO = require("../../assets/images/logo.png");

const GREEN = "#078F82";
const DARK = "#143B4C";
const MUTED = "#657C89";

type CommunityEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  location: string;
  barangay?: string;
  status: string;
  publicationStatus: string;
};

type Participation = {
  id: string;
  eventId: string;
  uid: string;
  fullName?: string;
  status: string;
  checkedInAt?: unknown;
  checkedOutAt?: unknown;
  attendanceVerified?: boolean;
};

type Eligible = {
  key: string;
  event: CommunityEvent;
  person: Participation;
};

function millis(value: unknown): number {
  if (!value || typeof value !== "object") return 0;

  if (
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const n = value.toMillis();

    return typeof n === "number" && Number.isFinite(n)
      ? n
      : 0;
  }

  if (
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const d = value.toDate();

    return d instanceof Date && !Number.isNaN(d.getTime())
      ? d.getTime()
      : 0;
  }

  return 0;
}

function eligibleForEvent(
  event: CommunityEvent,
  person: Participation
) {
  const start = millis(person.checkedInAt);
  const end = millis(person.checkedOutAt);

  return (
    event.publicationStatus === "published" &&
    event.status === "completed" &&
    person.eventId === event.id &&
    person.status === "joined" &&
    !!person.uid &&
    person.attendanceVerified === true &&
    start > 0 &&
    end >= start
  );
}

function eventDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);

  return Number.isNaN(d.getTime())
    ? value || "Date unavailable"
    : d.toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
}

function safeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (s) => {
    const substitutions: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return substitutions[s] || s;
  });
}

function buildPrintableHtml(
  record: Eligible,
  logoUri: string,
  saveMode: boolean
) {
  const name = safeHtml(
    record.person.fullName?.trim() || "Volunteer"
  );

  const activity = safeHtml(
    record.event.title || "Community Service Event"
  );

  const date = safeHtml(eventDate(record.event.date));

  const location = safeHtml(
    [
      record.event.barangay,
      record.event.location,
      "San Jose del Monte, Bulacan",
    ]
      .filter(Boolean)
      .join(", ")
  );

  const logo = safeHtml(logoUri);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>VolunServe – Community Event Certificate Preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #e9efed;
  font-family: Arial, sans-serif;
  color: #163c45;
}

.toolbar {
  padding: 12px 18px;
  background: #143b4c;
  color: white;
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  font-size: 13px;
}

button {
  padding: 10px 18px;
  border: 0;
  border-radius: 7px;
  background: #008e7e;
  color: #fff;
  font-weight: bold;
  cursor: pointer;
}

.page {
  position: relative;
  width: 297mm;
  height: 210mm;
  margin: 16px auto;
  background: #fffdf7;
  box-shadow: 0 8px 26px #0002;
  overflow: hidden;
}

.edge1 {
  position: absolute;
  inset: 11mm;
  border: 1.8px solid #0b8f7c;
}

.edge2 {
  position: absolute;
  inset: 14mm;
  border: 1px solid #86bda3;
}

.content {
  position: absolute;
  inset: 16mm 19mm;
  display: flex;
  flex-direction: column;
  text-align: center;
  align-items: center;
}

.top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
}

.brand {
  display: flex;
  gap: 11px;
  align-items: center;
  color: #11756b;
  font-weight: 900;
  font-size: 24px;
}

.brand img {
  width: 61px;
  height: 61px;
  object-fit: contain;
}

.small {
  font-size: 10px;
  color: #526e69;
  letter-spacing: 1px;
}

.seal {
  height: 69px;
  width: 69px;
  border: 3px double #3b947a;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #21745b;
  font-weight: 900;
  line-height: 1.35;
}

h1 {
  font-size: 32px;
  color: #17475c;
  margin: 26px 0 12px;
  font-family: Georgia, serif;
  letter-spacing: 0.7px;
}

.label {
  font-size: 16px;
  color: #3a4c4c;
  margin: 6px 0;
}

.name {
  font: bold 36px Georgia, serif;
  color: #11191b;
  margin: 16px auto 8px;
  padding: 0 30px 12px;
  border-bottom: 1px solid #a1bea8;
  max-width: 85%;
}

.event {
  font: bold 24px Georgia, serif;
  color: #143b4c;
  margin: 9px 0;
}

.body {
  font-size: 15px;
  line-height: 1.65;
  color: #3c504b;
  max-width: 800px;
}

.signatures {
  width: 100%;
  margin-top: auto;
  display: flex;
  justify-content: space-around;
  gap: 30px;
  padding-bottom: 3px;
}

.sign {
  width: 35%;
  color: #21383a;
  font-size: 13px;
  font-weight: bold;
}

.line {
  border-top: 1px solid #607c74;
  margin-bottom: 7px;
  height: 1px;
}

.sub {
  font-size: 10px;
  color: #5a7873;
  margin-top: 5px;
  font-weight: normal;
}

.leaf {
  position: absolute;
  color: #a7c9a2;
  opacity: 0.65;
  font-size: 65px;
  z-index: 1;
  line-height: 1;
}

.one {
  top: 3mm;
  left: 4mm;
  transform: rotate(-25deg);
}

.two {
  bottom: 2mm;
  right: 5mm;
  transform: rotate(145deg);
}

.three {
  bottom: 6mm;
  left: 4mm;
  transform: rotate(50deg);
  font-size: 40px;
}

.four {
  top: 4mm;
  right: 6mm;
  transform: rotate(200deg);
  font-size: 40px;
}

.foot {
  position: absolute;
  bottom: 11mm;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 10px;
  color: #807a65;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 0;
  }

  body {
    background: white;
  }

  .toolbar {
    display: none;
  }

  .page {
    margin: 0;
    box-shadow: none;
    width: 297mm;
    height: 210mm;
    page-break-after: avoid;
  }
}
</style>
</head>

<body>
  <div class="toolbar">
    <span>
      ${
        saveMode
          ? "Choose 'Save as PDF' in the print dialog to download."
          : "Choose your printer in the print dialog."
      }
    </span>

    <button onclick="window.print()">
      Print / Save as PDF
    </button>
  </div>

  <div class="page">
    <div class="edge1"></div>
    <div class="edge2"></div>

    <span class="leaf one">❧</span>
    <span class="leaf two">❧</span>
    <span class="leaf three">❧</span>
    <span class="leaf four">❧</span>

    <div class="content">
      <div class="top">
        <div class="brand">
          <img src="${logo}" alt="VolunServe logo"/>

          <div>
            <div>VolunServe</div>
            <div class="small">COMMUNITY SERVICE</div>
          </div>
        </div>

        <div class="seal">
          LGU<br/>
          SEAL<br/>
          <span style="font-size:7px">PLACEHOLDER</span>
        </div>
      </div>

      <h1>CERTIFICATE OF PARTICIPATION</h1>

      <div class="label">
        This certifies that
      </div>

      <div class="name">
        ${name}
      </div>

      <div class="label">
        has actively participated in the
      </div>

      <div class="event">
        ${activity}
      </div>

      <div class="body">
        held on ${date}<br/>
        at ${location}
      </div>

      <p class="body">
        In recognition of your valuable contribution
        in building a cleaner, greener, and safer community.
      </p>

      <div class="signatures">
        <div class="sign">
          <div class="line"></div>
          Authorized LGU Representative

          <div class="sub">
            City of San Jose del Monte, Bulacan
          </div>
        </div>

        <div class="sign">
          <div class="line"></div>
          Community Affairs Representative

          <div class="sub">
            VolunServe Community Events
          </div>
        </div>
      </div>
    </div>

    <div class="foot">
      PREVIEW COPY — Official issuance and signatory approval pending
    </div>
  </div>
</body>
</html>`;
}

export default function CommunityCertificatesAdminScreen() {
  const { loading, user, profile } = useUserSession();

  const role = String(profile?.role || "").toLowerCase();

  const authorized = Boolean(
    user &&
      profile &&
      isApprovedProfile(profile) &&
      (role === "admin" || role === "superadmin")
  );

  const [events, setEvents] = useState<CommunityEvent[]>([]);

  const [participants, setParticipants] =
    useState<Participation[]>([]);

  const [eventsLoading, setEventsLoading] = useState(true);

  const [participantsLoading, setParticipantsLoading] =
    useState(true);

  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [recordPage,setRecordPage] = useState(1);

  useEffect(() => {
    if (!authorized) {
      setEventsLoading(false);
      return;
    }

    setEventsLoading(true);

    return onSnapshot(
      collection(db, "communityEvents"),
      (snap) => {
        setEvents(
          snap.docs.map(
            (d) =>
              ({
                id: d.id,
                ...d.data(),
              }) as CommunityEvent
          )
        );

        setEventsLoading(false);
      },
      (err) => {
        setError(err.message);
        setEventsLoading(false);
      }
    );
  }, [authorized, user?.uid]);

  useEffect(() => {
    if (!authorized) {
      setParticipantsLoading(false);
      return;
    }

    setParticipantsLoading(true);

    return onSnapshot(
      collection(db, "communityEventParticipants"),
      (snap) => {
        setParticipants(
          snap.docs.map(
            (d) =>
              ({
                id: d.id,
                ...d.data(),
              }) as Participation
          )
        );

        setParticipantsLoading(false);
      },
      (err) => {
        setError(err.message);
        setParticipantsLoading(false);
      }
    );
  }, [authorized, user?.uid]);

  const eligible = useMemo<Eligible[]>(() => {
    const byId = new Map(
      events.map((event) => [event.id, event])
    );

    return participants
      .flatMap((person) => {
        const event = byId.get(person.eventId);

        return event && eligibleForEvent(event, person)
          ? [
              {
                key: `${event.id}_${person.uid}`,
                event,
                person,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          (b.event.date || "").localeCompare(
            a.event.date || ""
          ) ||
          (a.person.fullName || "").localeCompare(
            b.person.fullName || ""
          )
      );
  }, [events, participants]);

  const selected =
    eligible.find((item) => item.key === selectedKey) ||
    eligible[0] ||
    null;

  const busy =
    loading || eventsLoading || participantsLoading;

  const openCertificate = (saveAsPdf: boolean) => {
    if (
      !selected ||
      !authorized ||
      Platform.OS !== "web"
    ) {
      return;
    }

    if (
      !eligibleForEvent(
        selected.event,
        selected.person
      )
    ) {
      return;
    }

    const popup = window.open("", "_blank");

    if (!popup) {
      setError(
        "Please allow pop-ups for the VolunServe web portal to open the certificate."
      );
      return;
    }

    const assetPath =
      Image.resolveAssetSource(VOLUNSERVE_LOGO)?.uri || "";

    const logoUri = assetPath
      ? new URL(assetPath, window.location.href).href
      : "";

    popup.document.open();

    popup.document.write(
      buildPrintableHtml(
        selected,
        logoUri,
        saveAsPdf
      )
    );

    popup.document.close();
    popup.focus();

    setError("");
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={GREEN}
        />
      </View>
    );
  }

  if (!user || !authorized) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            VOLUNSERVE · COMMUNITY EVENTS
          </Text>

          <Text style={styles.title}>
            Certificate Generator
          </Text>

          <Text style={styles.subtitle}>
            Certificate of Participation · Completed events
            and verified attendance only
          </Text>
        </View>

        <Ionicons
          name="ribbon-outline"
          size={29}
          color={GREEN}
        />
      </View>

      <View style={styles.note}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={GREEN}
        />

        <Text style={styles.noteText}>
          Design preview only. This screen does not issue
          official certificates in Firestore. Official issuance
          needs approved LGU signatories, the official seal,
          and secure Firestore certificate rules. The current
          emergency certificate system is unchanged.
        </Text>
      </View>

      {!!error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} />
        </View>
      ) : eligible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="document-text-outline"
            size={32}
            color="#91A6A5"
          />

          <Text style={styles.emptyTitle}>
            No eligible volunteers yet
          </Text>

          <Text style={styles.small}>
            Finish a Community Event and verify Time In /
            Time Out in Event Attendance first.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            Verified participants ({eligible.length})
          </Text>

          <ListPagination page={Math.max(1,Math.min(recordPage, Math.max(1,Math.ceil(eligible.length / 5))))} total={eligible.length} pageSize={5} onChange={setRecordPage} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.peopleRow}
          >
            {eligible.slice((Math.max(1,Math.min(recordPage, Math.max(1,Math.ceil(eligible.length / 5)))) - 1) * 5,
              Math.max(1,Math.min(recordPage, Math.max(1,Math.ceil(eligible.length / 5)))) * 5).map((entry) => (
              <Pressable
                key={entry.key}
                style={[
                  styles.personChip,
                  selected?.key === entry.key &&
                    styles.personChipActive,
                ]}
                onPress={() =>
                  setSelectedKey(entry.key)
                }
              >
                <Text
                  style={[
                    styles.personChipName,
                    selected?.key === entry.key &&
                      styles.chipActiveText,
                  ]}
                >
                  {entry.person.fullName ||
                    "Volunteer"}
                </Text>

                <Text
                  style={[
                    styles.chipMeta,
                    selected?.key === entry.key &&
                      styles.chipActiveText,
                  ]}
                >
                  {entry.event.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {selected && (
            <>
              <View style={styles.previewHeading}>
                <Text style={styles.sectionTitle}>
                  Certificate Preview
                </Text>

                <Text style={styles.small}>
                  Landscape A4 · Reference mockup design
                </Text>
              </View>

              <ScrollView
                horizontal
                style={styles.previewScroller}
                contentContainerStyle={{
                  padding: 12,
                }}
              >
                <View style={styles.paper}>
                  <View
                    style={styles.paperLineOuter}
                  />

                  <View
                    style={styles.paperLineInner}
                  />

                  <Ionicons
                    name="leaf-outline"
                    color="#B2CCAC"
                    size={67}
                    style={styles.leafTop}
                  />

                  <Ionicons
                    name="leaf-outline"
                    color="#B2CCAC"
                    size={75}
                    style={styles.leafBottom}
                  />

                  <View style={styles.paperContent}>
                    <View style={styles.brandRow}>
                      <View style={styles.brandGroup}>
                        <Image
                          source={VOLUNSERVE_LOGO}
                          style={styles.logo}
                          resizeMode="contain"
                        />

                        <View>
                          <Text style={styles.brandName}>
                            VolunServe
                          </Text>

                          <Text style={styles.brandSub}>
                            COMMUNITY SERVICE
                          </Text>
                        </View>
                      </View>

                      <View style={styles.seal}>
                        <Text style={styles.sealText}>
                          LGU
                        </Text>

                        <Text style={styles.sealText}>
                          SEAL
                        </Text>

                        <Text style={styles.sealSub}>
                          PLACEHOLDER
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.certificateTitle}>
                      CERTIFICATE OF PARTICIPATION
                    </Text>

                    <Text style={styles.certificateLabel}>
                      This certifies that
                    </Text>

                    <Text style={styles.volunteerName}>
                      {selected.person.fullName ||
                        "Volunteer"}
                    </Text>

                    <View style={styles.nameUnderline} />

                    <Text style={styles.certificateLabel}>
                      has actively participated in the
                    </Text>

                    <Text style={styles.eventTitle}>
                      {selected.event.title}
                    </Text>

                    <Text style={styles.certificateBody}>
                      held on{" "}
                      {eventDate(selected.event.date)}
                    </Text>

                    <Text style={styles.certificateBody}>
                      at{" "}
                      {[
                        selected.event.barangay,
                        selected.event.location,
                        "San Jose del Monte, Bulacan",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>

                    <Text style={styles.recognition}>
                      In recognition of your valuable
                      contribution in building a cleaner,
                      greener, and safer community.
                    </Text>

                    <View style={styles.signatureRow}>
                      <View style={styles.signatureArea}>
                        <View
                          style={styles.signatureLine}
                        />

                        <Text
                          style={styles.signatureRole}
                        >
                          Authorized LGU Representative
                        </Text>

                        <Text
                          style={styles.signatureSub}
                        >
                          City of San Jose del Monte,
                          Bulacan
                        </Text>
                      </View>

                      <View style={styles.signatureArea}>
                        <View
                          style={styles.signatureLine}
                        />

                        <Text
                          style={styles.signatureRole}
                        >
                          Community Affairs Representative
                        </Text>

                        <Text
                          style={styles.signatureSub}
                        >
                          VolunServe Community Events
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.watermark}>
                      PREVIEW COPY — Official issuance pending
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.actions}>
                <Pressable
                  style={styles.saveButton}
                  onPress={() =>
                    openCertificate(true)
                  }
                >
                  <Ionicons
                    name="download-outline"
                    size={17}
                    color="white"
                  />

                  <Text style={styles.saveText}>
                    Download Certificate
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.printButton}
                  onPress={() =>
                    openCertificate(false)
                  }
                >
                  <Ionicons
                    name="print-outline"
                    size={17}
                    color={GREEN}
                  />

                  <Text style={styles.printText}>
                    Print
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.footerHelp}>
                Both actions open the printable preview.
                For a PDF, choose "Save as PDF" in your browser
                print dialog. The generated copy remains marked
                as an unissued preview.
              </Text>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F8F7",
  },

  content: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 1250,
    padding: 17,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },

  header: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 13,
  },

  eyebrow: {
    color: GREEN,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: DARK,
    marginTop: 4,
  },

  subtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 5,
  },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#EAF7F2",
    gap: 8,
    marginBottom: 14,
  },

  noteText: {
    flex: 1,
    color: "#315A55",
    fontSize: 11.5,
    lineHeight: 18,
  },

  error: {
    padding: 11,
    borderRadius: 9,
    backgroundColor: "#FFECE8",
    marginBottom: 10,
  },

  errorText: {
    color: "#AC3528",
    fontSize: 11,
  },

  empty: {
    padding: 30,
    borderWidth: 1,
    borderColor: "#DBE8E2",
    backgroundColor: "white",
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: DARK,
  },

  small: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
  },

  sectionTitle: {
    color: DARK,
    fontSize: 14,
    fontWeight: "900",
  },

  peopleRow: {
    paddingVertical: 12,
    gap: 9,
  },

  personChip: {
    minWidth: 195,
    maxWidth: 250,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D5E6DE",
    backgroundColor: "white",
    padding: 12,
  },

  personChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },

  personChipName: {
    color: DARK,
    fontSize: 12,
    fontWeight: "900",
  },

  chipMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },

  chipActiveText: {
    color: "white",
  },

  previewHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },

  previewScroller: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E8E0",
    backgroundColor: "#F6F8F6",
  },

  paper: {
    width: 880,
    height: 618,
    backgroundColor: "#FFFEF9",
    padding: 24,
    position: "relative",
    overflow: "hidden",
  },

  paperLineOuter: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 2,
    borderColor: "#0B927C",
  },

  paperLineInner: {
    position: "absolute",
    top: 23,
    left: 23,
    right: 23,
    bottom: 23,
    borderWidth: 1,
    borderColor: "#A3C6A8",
  },

  leafTop: {
    position: "absolute",
    top: 14,
    left: 16,
    transform: [{ rotate: "-35deg" }],
    opacity: 0.55,
  },

  leafBottom: {
    position: "absolute",
    right: 13,
    bottom: 13,
    transform: [{ rotate: "140deg" }],
    opacity: 0.6,
  },

  paperContent: {
    flex: 1,
    paddingHorizontal: 27,
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: "center",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },

  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  logo: {
    width: 66,
    height: 66,
  },

  brandName: {
    fontSize: 23,
    color: "#0B756B",
    fontWeight: "900",
  },

  brandSub: {
    fontSize: 9,
    letterSpacing: 1.1,
    color: "#66837A",
    fontWeight: "700",
  },

  seal: {
    width: 64,
    height: 64,
    borderWidth: 2,
    borderColor: "#85B7A0",
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },

  sealText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#28775B",
  },

  sealSub: {
    fontSize: 7,
    fontWeight: "800",
    color: "#798B7D",
  },

  certificateTitle: {
    marginTop: 21,
    fontFamily: "Georgia",
    color: "#14475B",
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
  },

  certificateLabel: {
    marginTop: 10,
    color: "#405C55",
    fontSize: 13,
  },

  volunteerName: {
    fontFamily: "Georgia",
    fontWeight: "900",
    fontSize: 31,
    color: "#141A1E",
    textAlign: "center",
    marginTop: 9,
  },

  nameUnderline: {
    marginTop: 8,
    height: 1,
    backgroundColor: "#B3C7AF",
    width: "78%",
  },

  eventTitle: {
    fontFamily: "Georgia",
    fontSize: 20,
    fontWeight: "900",
    color: "#214658",
    marginTop: 10,
    textAlign: "center",
  },

  certificateBody: {
    color: "#455C58",
    fontSize: 12,
    marginTop: 5,
    textAlign: "center",
  },

  recognition: {
    color: "#455C58",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 620,
    marginTop: 18,
    textAlign: "center",
  },

  signatureRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: "auto",
    gap: 25,
  },

  signatureArea: {
    width: "43%",
    alignItems: "center",
  },

  signatureLine: {
    height: 1,
    width: "90%",
    backgroundColor: "#58776C",
    marginBottom: 8,
  },

  signatureRole: {
    fontSize: 11,
    fontWeight: "900",
    color: "#334E4B",
    textAlign: "center",
  },

  signatureSub: {
    fontSize: 9,
    color: "#73847E",
    textAlign: "center",
    marginTop: 3,
  },

  watermark: {
    marginTop: 12,
    fontSize: 9,
    color: "#8A846C",
    textAlign: "center",
  },

  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 13,
    flexWrap: "wrap",
  },

  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 8,
    minHeight: 42,
    paddingHorizontal: 20,
  },

  saveText: {
    color: "white",
    fontWeight: "900",
    fontSize: 12,
  },

  printButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#9CC6B8",
    borderRadius: 8,
    minHeight: 42,
    paddingHorizontal: 20,
  },

  printText: {
    color: GREEN,
    fontWeight: "900",
    fontSize: 12,
  },

  footerHelp: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 9,
  },
});
