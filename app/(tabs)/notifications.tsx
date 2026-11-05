import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, useWindowDimensions, View,
} from "react-native";
import { auth, db } from "../../lib/firebase";
import { activeModeForProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";
import { enableAndroidPhoneAlerts, disableAndroidPhoneAlerts } from "../../lib/androidNativePush";

/**
 * An inbox item is ALWAYS private to userId. Old production notifications
 * may lack any reference ID; those open a useful, role-authorized module
 * instead of navigating to a fabricated detail page.
 */
type NotificationItem = {
  id: string;
  userId: string;
  title?: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: any;
  caseId?: string;
  assignmentId?: string;
  eventId?: string;
  certificateId?: string;
  requestId?: string;
  campaignId?: string;
  announcementId?: string;
};

type Filter = "All" | "Unread" | "Emergency" | "Events" | "Donations" | "Account" | "Announcements";
type Category = Exclude<Filter, "All" | "Unread">;
const FILTERS: Filter[] = ["All", "Unread", "Emergency", "Events", "Donations", "Account", "Announcements"];
const PAGE_SIZE = 5;
type Destination = { href: Href; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] };
const routes = {
  home: "/(tabs)" as Href,
  profile: "/(tabs)/profile" as Href,
  events: "/(tabs)/community-events" as Href,
  volunteer: "/(tabs)/volunteer" as Href,
  volunteerImpact: "/(tabs)/volunteer-impact" as Href,
  certificate: "/(tabs)/certificate" as Href,
  disaster: "/(tabs)/disaster-response" as Href,
  myCases: "/(tabs)/my-cases" as Href,
  assistance: "/(tabs)/resident" as Href,
  donations: "/(tabs)/donation" as Href,
  donationHistory: "/(tabs)/donation-history" as Href,
  announcements: "/(tabs)/announcements" as Href,
};

const timestamp = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const formattedDate = (value: any) => {
  const t = timestamp(value);
  if (!t) return "Date unavailable";
  const date = new Date(t);
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
};
const categoryOf = (item: NotificationItem): Category => {
  const text = String(item.type || "").toLowerCase() + " " + String(item.title || "").toLowerCase();
  if (/announcement|advisory|barangay_notice|system_update|public_notice/.test(text)) return "Announcements";
  if (/certificate|event|attendance|community.activity/.test(text)) return "Events";
  if (/donat|assistance.request|fund|campaign|payment|receipt|release/.test(text)) return "Donations";
  if (/emergency|disaster|rescue|incident|response|evacuat|dispatch|volunteer.invitation|volunteer_contribution|arrival/.test(text))
    return "Emergency";
  return "Account";
};
const iconFor = (category: Category): React.ComponentProps<typeof Ionicons>["name"] =>
  category === "Emergency" ? "alert-circle-outline"
    : category === "Events" ? "calendar-outline"
    : category === "Donations" ? "heart-outline"
    : category === "Announcements" ? "megaphone-outline"
    : "person-circle-outline";

/** Explicit allowlisted destinations only. Never open URL text from a notification. */
const destinationFor = (item: NotificationItem, volunteerMode: boolean): Destination => {
  const text = (String(item.type || "") + " " + String(item.title || "") + " " +
    String(item.message || "")).toLowerCase();
  if (item.certificateId || /certificate/.test(text))
    return volunteerMode
      ? { href: routes.certificate, label: "Open My Certificates", icon: "ribbon-outline" }
      : { href: routes.profile, label: "Open My Profile", icon: "person-outline" };
  if (item.announcementId || /announcement|system update|public advisory|barangay notice/.test(text))
    return { href: routes.announcements, label: "View Announcements", icon: "megaphone-outline" };
  if (item.eventId || /community event|event invitation|event attendance|event reminder/.test(text))
    return { href: routes.events, label: "View Community Events", icon: "calendar-outline" };
  if (/volunteer.contribution|volunteer_verified|verified contribution|volunteer impact/.test(text))
    return volunteerMode
      ? { href: routes.volunteerImpact, label: "View My Contributions", icon: "ribbon-outline" }
      : { href: routes.profile, label: "Open My Profile", icon: "person-outline" };
  if (/volunteer invitation|volunteer task|emergency task|assignment offered/.test(text))
    return volunteerMode
      ? { href: routes.volunteer, label: "Open Emergency Tasks", icon: "people-outline" }
      : { href: routes.disaster, label: "Open Emergency Reports", icon: "alert-circle-outline" };
  if (/donation receipt|payment receipt|donation history/.test(text))
    return { href: routes.donationHistory, label: "View Donation History", icon: "receipt-outline" };
  if (item.campaignId || /donat|fundraising|campaign|fund request/.test(text))
    return { href: routes.donations, label: "Open Donations", icon: "heart-outline" };
  if (item.requestId || /assistance application|assistance request|request assistance/.test(text))
    return volunteerMode
      ? { href: routes.home, label: "Open Home", icon: "home-outline" }
      : { href: routes.assistance, label: "View Assistance Requests", icon: "hand-left-outline" };
  if (/confirm lgu arrival|resident confirm|response completed|your emergency report|report validated/.test(text))
    return volunteerMode
      ? { href: routes.volunteer, label: "Open Emergency Tasks", icon: "people-outline" }
      : { href: routes.myCases, label: "View My Reports", icon: "document-text-outline" };
  if (/responder is on the way|response tracking|live map|location update/.test(text))
    return { href: routes.disaster, label: "View Emergency Response", icon: "map-outline" };
  if (item.assignmentId || /volunteer|emergency task/.test(text))
    return volunteerMode
      ? { href: routes.volunteer, label: "Open Emergency Tasks", icon: "people-outline" }
      : { href: routes.disaster, label: "Open Emergency Reports", icon: "alert-circle-outline" };
  if (item.caseId || /emergency|disaster|incident|evacuation|rescue|response/.test(text))
    return volunteerMode
      ? { href: routes.volunteer, label: "Open Emergency Tasks", icon: "people-outline" }
      : { href: routes.myCases, label: "View My Reports", icon: "document-text-outline" };
  if (/identity|verified account|verification|profile|account|password|login/.test(text))
    return { href: routes.profile, label: "Open My Profile", icon: "person-outline" };
  if (categoryOf(item) === "Events")
    return { href: routes.events, label: "View Community Events", icon: "calendar-outline" };
  return { href: routes.home, label: "Open Home", icon: "home-outline" };
};

export default function NotificationsScreen() {
  const { width } = useWindowDimensions();
  const { profile } = useUserSession();
  const volunteerMode = profile ? activeModeForProfile(profile) === "volunteer" : false;
  const compact = width < 660;
  const [uid, setUid] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [pushBusy, setPushBusy] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState("");
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const inFlight = useRef(new Set<string>());

  useEffect(() => onAuthStateChanged(auth, user => {
    setUid(user?.uid ?? null);
    setNotifications([]);
    setError("");
    setPhoneStatus("");
    setPhoneEnabled(false);
    setLoading(!!user);
  }), []);

  useEffect(() => {
    if (!uid) return;
    setError("");
    setLoading(true);
    const q = query(collection(db, "notifications"), where("userId", "==", uid));
    return onSnapshot(q, snapshot => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as NotificationItem))
        .filter(item => item.userId === uid);
      items.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
      setNotifications(items);
      setLoading(false);
      setError("");
    }, (failure: any) => {
      const code = String(failure?.code || "");
      setLoading(false);
      setError(code === "permission-denied"
        ? "Notifications aren't accessible with this session. Please sign in again."
        : "Couldn't load notifications. Check your connection, then tap Retry.");
      console.warn("Notifications inbox listener error", { code: code || "unknown" });
    });
  }, [uid, retryKey]);

  const unread = useMemo(() => notifications.filter(item => !item.read).length, [notifications]);
  const filtered = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return notifications.filter(item => {
      if (filter === "Unread" && item.read) return false;
      if (filter !== "All" && filter !== "Unread" && categoryOf(item) !== filter) return false;
      if (!phrase) return true;
      return [item.title, item.message, item.type].some(v => String(v || "").toLowerCase().includes(phrase));
    });
  }, [notifications, search, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [filter, search]);

  const markAsRead = async (ids: string[]) => {
    if (!uid || !ids.length) return;
    const ownedUnread = notifications.filter(item => item.userId === uid && !item.read).map(item => item.id);
    const allowed = new Set(ownedUnread);
    const selected = [...new Set(ids)].filter(id => allowed.has(id) && !inFlight.current.has(id));
    if (!selected.length) return;
    selected.forEach(id => inFlight.current.add(id));
    setUpdating(true);
    setError("");
    try {
      // Bounded concurrency prevents a large historical inbox from flooding Firebase.
      let failed = 0;
      for (let start = 0; start < selected.length; start += 15) {
        const results = await Promise.allSettled(selected.slice(start, start + 15)
          .map(id => updateDoc(doc(db, "notifications", id), { read: true })));
        failed += results.filter(result => result.status === "rejected").length;
      }
      if (failed) setError(failed === selected.length
        ? "Couldn't mark notifications as read. Check your connection and try again."
        : "Some notifications couldn't be marked as read. You can try again.");
    } catch {
      setError("Couldn't save the read status. Try again.");
    } finally {
      selected.forEach(id => inFlight.current.delete(id));
      setUpdating(false);
    }
  };

  const openNotification = (item: NotificationItem) => {
    if (!uid || item.userId !== uid) return;
    const destination = destinationFor(item, volunteerMode);
    // Navigation must work even if marking as read is temporarily offline.
    if (!item.read) void markAsRead([item.id]);
    router.push(destination.href);
  };

  if (!uid && !loading) return <View style={styles.center}>
    <Ionicons name="lock-closed-outline" size={32} color="#188262" />
    <Text style={styles.emptyTitle}>Sign in to view notifications</Text>
    <Text style={styles.emptyText}>Only your account's notifications are visible here.</Text>
  </View>;

  return <ScrollView style={styles.root} contentContainerStyle={[styles.container, compact && styles.containerCompact]}>
    <View style={styles.heading}>
      <View style={styles.headingIcon}>
        <Ionicons name="notifications-outline" size={22} color="#0B805E"/>
      </View>
      <View style={styles.headingText}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Your VolunServe updates, all in one place.</Text>
      </View>
    </View>

    <View style={[styles.summary, compact && styles.summaryCompact]}>
      <View style={styles.summaryText}>
        <Text style={styles.metric}>{unread}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.metricLabel}>{unread === 1 ? "Unread update" : "Unread updates"}</Text>
          <Text style={styles.metricHelper}>{notifications.length} total · Private to your account</Text>
        </View>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mark all unread notifications as read"
        style={[styles.markAll, (!unread || updating) && styles.disabled]}
        disabled={!unread || updating}
        onPress={() => void markAsRead(notifications.filter(item => !item.read).map(item => item.id))}>
        {updating ? <ActivityIndicator color="#076B52" size="small"/> : <Ionicons name="checkmark-done-outline" size={18} color="#076B52"/>}
        <Text style={styles.markAllText}>{updating ? "Saving..." : "Mark all read"}</Text>
      </TouchableOpacity>
    </View>

    {Platform.OS === "android" && <View style={styles.phoneCard}>
      <View style={styles.phoneIcon}><Ionicons name="phone-portrait-outline" color="#08765B" size={20}/></View>
      <View style={styles.phoneContent}>
        <Text style={styles.phoneTitle}>Android phone alerts</Text>
        <Text style={styles.phoneDescription}>Optional alerts on your installed APK. The inbox also works without phone alerts.</Text>
        {!!phoneStatus && <Text accessibilityLiveRegion="polite" style={styles.phoneStatus}>{phoneStatus}</Text>}
        <View style={styles.phoneActions}>
          <TouchableOpacity accessibilityRole="button" disabled={pushBusy || !uid}
            onPress={() => {
              setPushBusy(true); setPhoneStatus("");
              void enableAndroidPhoneAlerts().then(message => {
                setPhoneEnabled(true); setPhoneStatus(message);
              }).catch(e => setPhoneStatus(e instanceof Error ? e.message : "Phone alerts couldn't be enabled."))
                .finally(() => setPushBusy(false));
            }} style={[styles.phoneButton, pushBusy && styles.disabled]}>
            <Ionicons name="notifications-outline" size={17} color="#FFFFFF"/>
            <Text style={styles.phoneButtonText}>{phoneEnabled ? "Refresh alerts" : "Enable phone alerts"}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={pushBusy}
            onPress={() => {
              setPushBusy(true); setPhoneStatus("");
              void disableAndroidPhoneAlerts().then(message => {
                setPhoneEnabled(false); setPhoneStatus(message);
              }).catch(e => setPhoneStatus(e instanceof Error ? e.message : "Couldn't disable phone alerts."))
                .finally(() => setPushBusy(false));
            }} style={styles.phoneOffButton}>
            <Text style={styles.phoneOffText}>Disable</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>}

    <View style={styles.toolbar}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#638473"/>
        <TextInput accessibilityLabel="Search notifications" placeholder="Search your updates..."
          placeholderTextColor="#90A99B" value={search} onChangeText={setSearch}
          style={styles.searchInput} returnKeyType="search"/>
        {!!search && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search"
          onPress={() => setSearch("")}><Ionicons name="close-circle" size={19} color="#789A8A"/></TouchableOpacity>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}
        contentContainerStyle={styles.filters}>
        {FILTERS.map(option => <TouchableOpacity key={option} accessibilityRole="tab"
          accessibilityState={{selected:filter===option}} onPress={() => setFilter(option)}
          style={[styles.filterPill,filter===option&&styles.filterActive]}>
          <Text style={[styles.filterLabel,filter===option&&styles.filterLabelActive]}>
            {option}{option==="Unread"&&unread>0?" ("+unread+")":""}
          </Text>
        </TouchableOpacity>)}
      </ScrollView>
    </View>

    {!!error && <View style={styles.errorCard}>
      <Ionicons name="alert-circle-outline" size={18} color="#A43C2B"/>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading notifications"
        onPress={() => setRetryKey(k => k + 1)} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>}

    {loading ? <View style={styles.state}>
      <ActivityIndicator color="#087D60"/>
      <Text style={styles.emptyText}>Loading your notifications...</Text>
    </View> : filtered.length===0 ? <View style={styles.state}>
      <View style={styles.emptyIcon}><Ionicons name="checkmark-circle-outline" size={30} color="#138567"/></View>
      <Text style={styles.emptyTitle}>{filter==="Unread" ? "You're all caught up" : search ? "No matching updates" : "No updates yet"}</Text>
      <Text style={styles.emptyText}>{filter==="Unread"
        ? "You've read all your notifications."
        : search ? "Try another search or filter." : "New account and community updates will appear here."}</Text>
      {(search||filter!=="All")&&<TouchableOpacity accessibilityRole="button" onPress={()=>{setSearch("");setFilter("All");}}>
        <Text style={styles.clearFilters}>Show all updates</Text>
      </TouchableOpacity>}
    </View> : <>
      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Your updates</Text>
        <Text style={styles.resultCount}>{filtered.length} {filtered.length===1?"result":"results"} · {Math.min((safePage-1)*PAGE_SIZE+1,filtered.length)}–{Math.min(safePage*PAGE_SIZE,filtered.length)}</Text>
      </View>
      {visible.map(item => {
        const category=categoryOf(item);
        const destination=destinationFor(item,volunteerMode);
        const unreadItem=!item.read;
        return <View key={item.id} style={[styles.card,unreadItem&&styles.unreadCard]}>
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={"Open "+String(item.title||"notification")+": "+destination.label}
            onPress={()=>openNotification(item)} activeOpacity={0.78} style={styles.cardMain}>
            <View style={[styles.typeIcon,unreadItem&&styles.typeIconUnread]}>
              <Ionicons name={iconFor(category)} size={19} color="#087D60"/>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardMeta}>
                <Text style={styles.category}>{category} · {formattedDate(item.createdAt)}</Text>
                {unreadItem&&<View style={styles.newPill}><Text style={styles.newPillText}>NEW</Text></View>}
              </View>
              <Text style={styles.cardTitle}>{item.title||"VolunServe update"}</Text>
              <Text style={styles.message} numberOfLines={2}>{item.message||"You have a new update."}</Text>
              <View style={styles.destinationLine}>
                <Text style={styles.destinationText}>{destination.label}</Text>
                <Ionicons name="arrow-forward-outline" size={15} color="#08765B"/>
              </View>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color="#96B0A2"/>
          </TouchableOpacity>
          {unreadItem && <View style={styles.cardFooter}>
            <TouchableOpacity disabled={updating} accessibilityRole="button"
              accessibilityLabel={"Mark "+String(item.title||"notification")+" as read"}
              onPress={()=>void markAsRead([item.id])} style={styles.readButton}>
              <Ionicons name="checkmark-outline" size={17} color="#087D60"/>
              <Text style={styles.readText}>Mark as read</Text>
            </TouchableOpacity>
          </View>}
        </View>;
      })}
      {totalPages>1&&<View style={styles.pagination}>
        <TouchableOpacity accessibilityRole="button" disabled={safePage<=1}
          style={[styles.pageButton,safePage<=1&&styles.disabled]}
          onPress={()=>setPage(p=>Math.max(1,p-1))}>
          <Ionicons name="chevron-back" size={15} color="#0A765A"/><Text style={styles.pageText}>Previous</Text>
        </TouchableOpacity>
        <Text style={styles.pageCount}>Page {safePage} of {totalPages}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={safePage>=totalPages}
          style={[styles.pageButton,safePage>=totalPages&&styles.disabled]}
          onPress={()=>setPage(p=>Math.min(totalPages,p+1))}>
          <Text style={styles.pageText}>Next</Text><Ionicons name="chevron-forward" size={15} color="#0A765A"/>
        </TouchableOpacity>
      </View>}
      <Text style={styles.footerHint}>Tap any update to open its related VolunServe page. Older records without detail links open the relevant section.</Text>
    </>}
  </ScrollView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#F6F8F7"},
  container:{width:"100%",maxWidth:850,alignSelf:"center",paddingHorizontal:19,paddingTop:26,paddingBottom:55,gap:0},
  containerCompact:{paddingHorizontal:12,paddingTop:13},
  heading:{flexDirection:"row",alignItems:"center",gap:13,paddingVertical:14,paddingHorizontal:16,
    borderRadius:16,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1EAE4"},
  headingIcon:{width:43,height:43,borderRadius:13,backgroundColor:"#E7F4EC",
    alignItems:"center",justifyContent:"center"},
  headingText:{flex:1},
  title:{color:"#183E31",fontSize:23,fontWeight:"900"},
  subtitle:{color:"#738D7E",fontSize:12,lineHeight:18,marginTop:3},
  summary:{backgroundColor:"#FFFFFF",borderRadius:14,borderColor:"#E2EBE4",borderWidth:1,
    paddingHorizontal:16,paddingVertical:12,marginTop:12,flexDirection:"row",
    alignItems:"center",justifyContent:"space-between",gap:10},
  summaryCompact:{flexWrap:"wrap"},
  summaryText:{flexDirection:"row",gap:11,alignItems:"center",flexShrink:1,flexGrow:1},
  metric:{fontSize:23,color:"#087D60",fontWeight:"900",minWidth:25},
  metricLabel:{fontSize:13,color:"#234A3B",fontWeight:"800"},
  metricHelper:{fontSize:10.5,color:"#738D7F",marginTop:3,lineHeight:15},
  markAll:{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:"#EAF6EF",borderRadius:9,
    paddingHorizontal:12,paddingVertical:9},
  markAllText:{fontSize:11,color:"#08745A",fontWeight:"800"},
  disabled:{opacity:.35},
  phoneCard:{marginTop:12,flexDirection:"row",gap:12,backgroundColor:"#FFFFFF",padding:15,borderRadius:13,
    borderColor:"#DFEBE4",borderWidth:1},
  phoneIcon:{backgroundColor:"#E8F7ED",padding:10,borderRadius:10,alignSelf:"flex-start"},
  phoneContent:{flex:1,gap:6},
  phoneTitle:{color:"#204B3B",fontWeight:"900",fontSize:13},
  phoneDescription:{color:"#668476",fontSize:12,lineHeight:18},
  phoneStatus:{color:"#315B48",fontSize:12},
  phoneActions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:4},
  phoneButton:{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:"#087C60",
    borderRadius:9,paddingHorizontal:12,paddingVertical:10},
  phoneButtonText:{color:"#FFFFFF",fontSize:12,fontWeight:"800"},
  phoneOffButton:{borderColor:"#D7E7DC",borderWidth:1,borderRadius:9,paddingHorizontal:12,paddingVertical:10},
  phoneOffText:{color:"#346751",fontSize:12,fontWeight:"700"},
  toolbar:{marginTop:16,gap:10},
  searchWrap:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0E9E3",borderRadius:11,
    flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:13,minHeight:44},
  searchInput:{color:"#214B3A",fontSize:13,flex:1,paddingVertical:9},
  filterScroll:{maxHeight:47},
  filters:{gap:8,paddingBottom:7},
  filterPill:{backgroundColor:"#FFFFFF",borderColor:"#E0E9E3",borderWidth:1,borderRadius:30,
    paddingHorizontal:15,paddingVertical:9,minHeight:36},
  filterActive:{backgroundColor:"#0B7B60",borderColor:"#0B7B60"},
  filterLabel:{color:"#4D6D5C",fontSize:12,fontWeight:"800"},
  filterLabelActive:{color:"#FFFFFF"},
  errorCard:{flexDirection:"row",alignItems:"center",gap:9,backgroundColor:"#FFF4EF",
    borderColor:"#F1D3C7",borderWidth:1,padding:12,borderRadius:10,marginTop:12},
  error:{color:"#9A3A2E",fontSize:12,lineHeight:17,flex:1},
  retryButton:{paddingHorizontal:10,paddingVertical:8,backgroundColor:"#FCE5DA",borderRadius:7},
  retryText:{fontWeight:"800",fontSize:12,color:"#9A3A2E"},
  listHeader:{flexDirection:"row",alignItems:"baseline",justifyContent:"space-between",
    gap:10,marginTop:17,marginBottom:9,flexWrap:"wrap"},
  sectionTitle:{fontSize:16,fontWeight:"900",color:"#214B3A"},
  resultCount:{fontSize:12,color:"#718C7B"},
  card:{borderRadius:12,backgroundColor:"#FFFFFF",borderColor:"#E4EAE6",borderWidth:1,
    marginBottom:8,overflow:"hidden"},
  unreadCard:{backgroundColor:"#F2FAF5",borderColor:"#B7DFC8",borderLeftWidth:3},
  cardMain:{flexDirection:"row",alignItems:"flex-start",gap:11,padding:13,minHeight:91},
  typeIcon:{borderRadius:12,width:38,height:38,alignItems:"center",justifyContent:"center",
    backgroundColor:"#EDF6EF"},
  typeIconUnread:{backgroundColor:"#DDF5E5"},
  cardContent:{flex:1},
  cardMeta:{flexDirection:"row",alignItems:"center",gap:7,justifyContent:"space-between",flexWrap:"wrap"},
  category:{fontSize:11,color:"#6B8C7B",fontWeight:"700",flexShrink:1},
  newPill:{backgroundColor:"#E0F7E8",borderRadius:5,paddingHorizontal:7,paddingVertical:3},
  newPillText:{fontSize:9,color:"#067D58",fontWeight:"900",letterSpacing:.5},
  cardTitle:{fontSize:13,fontWeight:"900",color:"#173F31",marginTop:5},
  message:{fontSize:12,lineHeight:18,color:"#5D7869",marginTop:4},
  destinationLine:{flexDirection:"row",gap:5,alignItems:"center",marginTop:8},
  destinationText:{fontWeight:"800",color:"#08765B",fontSize:11},
  cardFooter:{borderTopWidth:1,borderColor:"#EBF0EC",alignItems:"flex-end",paddingHorizontal:12,paddingVertical:3},
  readButton:{flexDirection:"row",gap:4,alignItems:"center",paddingHorizontal:5,paddingVertical:5},
  readText:{color:"#08765B",fontWeight:"800",fontSize:12},
  pagination:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:9,marginTop:7},
  pageButton:{flexDirection:"row",alignItems:"center",gap:3,backgroundColor:"#E5F3E9",
    paddingVertical:11,paddingHorizontal:13,borderRadius:9},
  pageText:{fontSize:12,fontWeight:"800",color:"#0A765A"},
  pageCount:{fontSize:12,fontWeight:"800",color:"#5C7F6B"},
  footerHint:{marginTop:18,textAlign:"center",fontSize:11,color:"#80978A",lineHeight:17},
  state:{marginTop:10,backgroundColor:"#FFFFFF",borderRadius:16,alignItems:"center",gap:9,
    padding:34,borderWidth:1,borderColor:"#E1EBE5"},
  emptyIcon:{width:54,height:54,borderRadius:27,backgroundColor:"#E4F7E9",
    alignItems:"center",justifyContent:"center"},
  center:{flex:1,alignItems:"center",justifyContent:"center",gap:10,padding:25,
    backgroundColor:"#F4F8F5"},
  emptyTitle:{color:"#234E3A",fontSize:15,fontWeight:"900",textAlign:"center"},
  emptyText:{color:"#698777",fontSize:12,lineHeight:19,textAlign:"center"},
  clearFilters:{color:"#078064",fontSize:12,fontWeight:"800",marginTop:8},
});
