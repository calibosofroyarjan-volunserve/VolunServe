import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

type Attendance = {
  id: string;
  eventId?: string;
  status?: string;
  checkedInAt?: unknown;
  checkedOutAt?: unknown;
  attendanceVerified?: boolean;
};

function millis(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as any).toMillis === "function") return (value as any).toMillis();
  if (typeof (value as any).seconds === "number") return (value as any).seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function recordedMinutes(item: Attendance): number {
  const start = millis(item.checkedInAt);
  const end = millis(item.checkedOutAt);
  return start > 0 && end >= start ? Math.floor((end - start) / 60000) : 0;
}

function hours(minutes: number): string {
  const n = Math.max(0, Math.floor(minutes));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** Uses the same private, UID-filtered participation source as My Attendance.
 * It never invents hours or issues certificates from unverified sessions. */
export default function VolunteerAttendanceSummary({ uid }: { uid: string }) {
  const [entries, setEntries] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!uid) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(
      query(collection(db, "communityEventParticipants"), where("uid", "==", uid)),
      snapshot => {
        setEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
        setLoading(false);
        setError("");
      },
      e => {
        console.error("[Certificates] Attendance history read failed", e?.code || e);
        setError("Unable to load tracked hours. Please check your Volunteer access.");
        setLoading(false);
      }
    );
  }, [uid]);
  const joined = useMemo(() => entries.filter(e => e.status === "joined"), [entries]);
  const verified = joined.filter(e => e.attendanceVerified === true);
  const credited = verified.reduce((sum, item) => sum + recordedMinutes(item), 0);
  const pending = joined.filter(e => !e.attendanceVerified && millis(e.checkedOutAt) > 0).length;
  const recent = [...joined].sort((a,b) => millis(b.checkedInAt) - millis(a.checkedInAt)).slice(0, 5);
  return (
    <View style={s.panel}>
      <View style={s.heading}>
        <Ionicons name="time-outline" size={22} color="#087C6B" />
        <View style={s.headingCopy}>
          <Text style={s.title}>My Attendance & Tracked Hours</Text>
          <Text style={s.sub}>Your actual event Time In / Time Out history, kept separate from issued certificates.</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator color="#087C6B" /> : error ? <Text style={s.error}>{error}</Text> : (
        <>
          <View style={s.stats}>
            <View style={s.stat}><Text style={s.number}>{hours(credited)}</Text><Text style={s.caption}>Admin-verified hours</Text></View>
            <View style={s.stat}><Text style={s.number}>{verified.length}</Text><Text style={s.caption}>Verified sessions</Text></View>
            <View style={s.stat}><Text style={s.number}>{pending}</Text><Text style={s.caption}>Awaiting verification</Text></View>
          </View>
          {recent.length === 0 ?
            <Text style={s.empty}>No joined event attendance yet. Join an upcoming event, then use Time In and Time Out once Admin starts it.</Text> :
            recent.map(item => {
              const minutes = recordedMinutes(item);
              const date = millis(item.checkedInAt);
              const label = item.attendanceVerified ? "Verified" :
                millis(item.checkedOutAt) ? "Pending verification" :
                millis(item.checkedInAt) ? "Timed in" : "Joined";
              return (
                <View key={item.id} style={s.entry}>
                  <View style={s.entryLeft}>
                    <Text style={s.entryName}>Community event attendance</Text>
                    <Text style={s.caption}>{date ? new Date(date).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" }) : "Time In not recorded"} · {label}</Text>
                  </View>
                  <Text style={s.entryHours}>{item.attendanceVerified ? hours(minutes) : minutes > 0 ? hours(minutes) + " recorded" : "—"}</Text>
                </View>
              );
            })
          }
          <Text style={s.foot}>Recorded time is not credited until Admin verifies attendance. Certificates require a separately issued, verified certificate record.</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor:"#FFFFFF", borderWidth:1, borderColor:"#D7EAE2", borderRadius:15, padding:17, gap:14 },
  heading: { flexDirection:"row", alignItems:"center", gap:10 },
  headingCopy: { flex:1, gap:3 }, title:{fontSize: vsType.size.card, fontFamily: vsType.family, fontWeight:"800", color:"#173B43"},
  sub:{fontSize: vsType.size.caption, fontFamily: vsType.family, color:"#617983", lineHeight:17},
  stats:{flexDirection:"row",flexWrap:"wrap",gap:10},
  stat:{minWidth:110,flexGrow:1,flexBasis:110,backgroundColor:"#F1F9F5",padding:12,borderRadius:10},
  number:{fontSize: vsType.size.titleSmall, fontFamily: vsType.family,fontWeight:"800",color:"#096E5C"},
  caption:{fontSize: vsType.size.caption, fontFamily: vsType.family,color:"#607B82",marginTop:4},
  entry:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:9,paddingTop:10,borderTopWidth:1,borderTopColor:"#EEF3F0"},
  entryLeft:{flex:1},entryName:{fontSize: vsType.size.meta, fontFamily: vsType.family,fontWeight:"700",color:"#25434B"},
  entryHours:{fontWeight:"800",fontSize: vsType.size.meta, fontFamily: vsType.family,color:"#0C7760"},
  foot:{fontSize: vsType.size.micro, fontFamily: vsType.family,color:"#6D8387",lineHeight:16},
  empty:{fontSize: vsType.size.meta, fontFamily: vsType.family,color:"#68818A"},
  error:{fontSize: vsType.size.meta, fontFamily: vsType.family,color:"#A62E2E"}
});
