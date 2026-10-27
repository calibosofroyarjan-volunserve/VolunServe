import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { auth, db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";
import { AdminPageHeading, AdminSectionHeading, ADMIN_UI } from "./AdminWorkspaceUI";

type Scope = "residents" | "volunteers";
type Item = {id: string; userId?: string; recipientUid?: string; scope?: string;
  type?: string; category?: string; title?: string; message?: string; read?: boolean; createdAt?: any};
type Topic = "all" | "unread" | "identity" | "account" | "assistance"
  | "applications" | "events" | "attendance";
const LIMIT = 5;
const time = (v: any) => typeof v?.toMillis === "function" ? v.toMillis()
  : v instanceof Date ? v.getTime() : typeof v === "number" ? v : 0;

export function categoryForAdminNotification(item: Item): Exclude<Topic, "all" | "unread"> | null {
  const tag = String(item.type || "").toLowerCase();
  const scope = String(item.scope || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  // The stored scope takes precedence; ambiguous labels are not silently assigned
  // to a queue. Legacy events are categorized only when their type is explicit.
  if (scope === "residents" || scope === "resident") {
    if (/ident|verif|id_review|kyc/.test(tag)) return "identity";
    if (/assist|request|relief|claim/.test(tag)) return "assistance";
    return "account";
  }
  if (scope === "volunteers" || scope === "volunteer") {
    if (/attend|check.in|check.out|certificate|hours/.test(tag)) return "attendance";
    if (/event|schedule|task/.test(tag)) return "events";
    return "applications";
  }
  if (/identity|resident_verif|id_review/.test(tag)) return "identity";
  if (/resident_assistance|resident_request/.test(tag)) return "assistance";
  if (/resident_account|resident_registration|resident_approval/.test(tag)) return "account";
  if (/volunteer_application|volunteer_approval|volunteer_rejection/.test(tag)) return "applications";
  if (/volunteer_attendance|volunteer_check|volunteer_certificate/.test(tag)) return "attendance";
  if (/volunteer_event|volunteer_task|volunteer_schedule/.test(tag)) return "events";
  // Do not infer the audience from ambiguous "event" or "account" tags.
  if (category === "resident_identity") return "identity";
  if (category === "volunteer_application") return "applications";
  return null;
}

export default function ScopedAdminInbox({scope}: {scope: Scope}) {
  const {user, profile, loading: sessionLoading} = useUserSession();
  const ready = !sessionLoading && !!user && isApprovedProfile(profile)
    && profile?.role === "admin" && profile?.adminStatus !== "suspended";
  const [owned, setOwned] = useState<Item[]>([]);
  const [legacy, setLegacy] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState([false,false]);
  const [errors, setErrors] = useState([false,false]);
  const [filter, setFilter] = useState<Topic>("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState("");
  const resident = scope === "residents";
  useEffect(() => {
    setOwned([]);setLegacy([]);setLoaded([false,false]);setErrors([false,false]);
    if (!ready || !user) return;
    // Firestore recipient-only queries: never request an unfiltered collection.
    const offA = onSnapshot(query(collection(db,"notifications"),where("userId","==",user.uid)),
      snap=>{setOwned(snap.docs.map(d=>({id:d.id,...d.data()} as Item)));setLoaded(s=>[true,s[1]]);setErrors(s=>[false,s[1]]);},
      ()=>{setLoaded(s=>[true,s[1]]);setErrors(s=>[true,s[1]]);});
    const offB = onSnapshot(query(collection(db,"notifications"),where("recipientUid","==",user.uid)),
      snap=>{setLegacy(snap.docs.map(d=>({id:d.id,...d.data()} as Item)));setLoaded(s=>[s[0],true]);setErrors(s=>[s[0],false]);},
      ()=>{setLoaded(s=>[s[0],true]);setErrors(s=>[s[0],true]);});
    return () => {offA();offB();};
  },[ready,user?.uid]);

  const allScoped = useMemo(()=>{
    const unique = new Map<string,Item>();
    for (const entry of [...owned,...legacy]) {
      if (entry.userId !== user?.uid && entry.recipientUid !== user?.uid) continue;
      const topic = categoryForAdminNotification(entry);
      if (topic && (resident
        ? (topic === "identity" || topic === "account" || topic === "assistance")
        : (topic === "applications" || topic === "events" || topic === "attendance"))) {
        unique.set(entry.id,entry);
      }
    }
    return [...unique.values()].sort((a,b)=>time(b.createdAt)-time(a.createdAt));
  },[owned,legacy,user?.uid,resident]);
  const unread = allScoped.filter(n=>!n.read).length;
  const visibleFiltered = allScoped.filter(n => filter==="all" || (filter==="unread"
    ? !n.read : categoryForAdminNotification(n)===filter));
  const maxPage=Math.max(1,Math.ceil(visibleFiltered.length/LIMIT));
  const safePage=Math.min(page,maxPage);
  const pageItems=visibleFiltered.slice((safePage-1)*LIMIT,safePage*LIMIT);
  const tabs: {key:Topic;label:string}[] = resident
    ? [{key:"all",label:"All"},{key:"unread",label:"Unread"},
      {key:"identity",label:"Identity"},{key:"account",label:"Accounts"},
      {key:"assistance",label:"Assistance"}]
    : [{key:"all",label:"All"},{key:"unread",label:"Unread"},
      {key:"applications",label:"Applications"},{key:"events",label:"Events"},
      {key:"attendance",label:"Attendance"}];
  const markRead=async(ids:string[])=>{
    if(!ready||!user||busy||!ids.length)return;
    const set=new Set(allScoped.filter(n=>!n.read).map(n=>n.id));
    const valid=ids.filter(id=>set.has(id));
    if(!valid.length)return;
    setBusy(true);setWriteError("");
    const results=await Promise.allSettled(valid.map(id=>
      updateDoc(doc(db,"notifications",id),{read:true})));
    if(results.some(v=>v.status==="rejected")) setWriteError("Some alerts could not be marked as read. Try again.");
    setBusy(false);
  };
  if(!ready)return <View style={styles.denied}>
    <Ionicons name="lock-closed-outline" size={28} color={ADMIN_UI.emerald}/>
    <Text style={styles.deniedText}>{sessionLoading?"Checking administrator access…":"An approved LGU Admin account is required."}</Text>
  </View>;
  return <ScrollView style={styles.root} contentContainerStyle={styles.body}>
    <AdminPageHeading
      eyebrow={resident?"LGU ADMIN  /  RESIDENTS":"LGU ADMIN  /  VOLUNTEERS"}
      title={resident?"Resident Notifications":"Volunteer Notifications"}
      subtitle={resident
        ?"Resident identity, account and assistance updates assigned to your LGU Admin account."
        :"Volunteer applications, assignments, event and attendance updates assigned to your LGU Admin account."}/>
    <AdminSectionHeading title={resident?"Resident Alerts":"Volunteer Alerts"}
      caption="Private inbox for this administrator. Review queues are separate from notifications; an empty inbox does not mean all applications were processed."/>
    <View style={styles.summary}>
      <View style={styles.counter}><Text style={styles.counterValue}>{unread}</Text>
        <Text style={styles.counterLabel}>Unread in this section</Text></View>
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={"Open "+(resident?"resident identity review":"volunteer application review")}
        onPress={()=>router.push(resident?"/(admin)/identity-reviews":"/(admin)/volunteers" as any)}
        style={styles.queueButton}>
        <Ionicons name={resident?"shield-checkmark-outline":"people-outline"} size={16} color={ADMIN_UI.emerald}/>
        <Text style={styles.queueText}>{resident?"Open Identity Review Queue":"Open Volunteer Review Queue"}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel="Mark all unread notifications in this section as read"
        disabled={!unread||busy} onPress={()=>void markRead(allScoped.filter(n=>!n.read).map(n=>n.id))}
        style={[styles.queueButton,(!unread||busy)&&styles.disabled]}>
        <Ionicons name="checkmark-done-outline" size={16} color={ADMIN_UI.emerald}/>
        <Text style={styles.queueText}>{busy?"Updating…":"Mark Section Read"}</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.tabs}>
      {tabs.map(tab=><TouchableOpacity key={tab.key} accessibilityRole="button"
        accessibilityState={{selected:filter===tab.key}}
        accessibilityLabel={tab.label+" notifications"}
        onPress={()=>{setFilter(tab.key);setPage(1);}}
        style={[styles.chip,filter===tab.key&&styles.chipActive]}>
        <Text style={[styles.chipLabel,filter===tab.key&&styles.chipLabelActive]}>{tab.label}</Text>
      </TouchableOpacity>)}
    </View>
    {writeError?<Text style={styles.error}>{writeError}</Text>:null}
    {errors.some(Boolean)?<Text style={styles.error}>Some inbox updates could not load. Verify emulator permissions and connection.</Text>:null}
    {!loaded.every(Boolean)?<ActivityIndicator color={ADMIN_UI.emerald} style={{marginTop:35}}/>
    : !pageItems.length?<View style={styles.empty}>
      <Ionicons name="notifications-off-outline" size={34} color={ADMIN_UI.emerald}/>
      <Text style={styles.emptyTitle}>No {resident?"resident":"volunteer"} notifications in this view</Text>
      <Text style={styles.emptyCopy}>Alerts appear when the system sends a matching update to this admin account. Use the review queue for pending work.</Text>
    </View>:pageItems.map(item=><View key={item.id} style={[styles.card,!item.read&&styles.unreadCard]}>
      <View style={styles.cardHead}>
        <View style={styles.category}><Text style={styles.categoryText}>{categoryForAdminNotification(item)?.toUpperCase()}</Text></View>
        {!item.read?<View style={styles.dot}/>:null}
      </View>
      <Text style={styles.itemTitle}>{item.title||"VolunServe notification"}</Text>
      <Text style={styles.itemBody}>{item.message||"Open the relevant module to review this update."}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.date}>{time(item.createdAt)?new Date(time(item.createdAt)).toLocaleString("en-PH"):"Time unavailable"}</Text>
        {!item.read?<TouchableOpacity accessibilityRole="button" disabled={busy}
          onPress={()=>void markRead([item.id])} style={styles.markButton}>
          <Text style={styles.markText}>Mark as Read</Text>
        </TouchableOpacity>:<Text style={styles.readText}>Read</Text>}
      </View>
    </View>)}
    {visibleFiltered.length>LIMIT?<View style={styles.pages}>
      <TouchableOpacity disabled={safePage<=1} onPress={()=>setPage(v=>Math.max(1,v-1))}
        accessibilityRole="button" style={[styles.pageBtn,safePage<=1&&styles.disabled]}><Text>Previous</Text></TouchableOpacity>
      <Text style={styles.pageLabel}>Page {safePage} of {maxPage}</Text>
      <TouchableOpacity disabled={safePage>=maxPage} onPress={()=>setPage(v=>Math.min(maxPage,v+1))}
        accessibilityRole="button" style={[styles.pageBtn,safePage>=maxPage&&styles.disabled]}><Text>Next</Text></TouchableOpacity>
    </View>:null}
  </ScrollView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:ADMIN_UI.paper},
  body:{padding:24,paddingBottom:56,gap:6},
  denied:{flex:1,alignItems:"center",justifyContent:"center",padding:24,gap:12},
  deniedText:{color:ADMIN_UI.ink,fontWeight:"700",textAlign:"center"},
  summary:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:10},
  counter:{padding:14,paddingHorizontal:20,backgroundColor:"#FFFFFF",borderWidth:1,
    borderColor:ADMIN_UI.stroke,borderRadius:14,flexDirection:"row",alignItems:"center",gap:12},
  counterValue:{fontSize:26,fontWeight:"900",color:ADMIN_UI.ink},
  counterLabel:{fontSize:12,color:ADMIN_UI.muted,fontWeight:"700"},
  queueButton:{flexDirection:"row",alignItems:"center",padding:13,paddingHorizontal:15,
    backgroundColor:"#FFFFFF",borderColor:ADMIN_UI.stroke,borderWidth:1,borderRadius:12,gap:8},
  queueText:{color:ADMIN_UI.emerald,fontSize:12,fontWeight:"800"},
  disabled:{opacity:0.4},
  tabs:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:11},
  chip:{paddingVertical:10,paddingHorizontal:15,borderWidth:1,
    borderColor:ADMIN_UI.stroke,borderRadius:11,backgroundColor:"#FFFFFF"},
  chipActive:{backgroundColor:ADMIN_UI.emerald,borderColor:ADMIN_UI.emerald},
  chipLabel:{color:ADMIN_UI.muted,fontSize:12,fontWeight:"700"},
  chipLabelActive:{color:"#FFFFFF"},
  error:{color:"#B42318",fontSize:12,padding:12},
  empty:{minHeight:235,backgroundColor:"#FFFFFF",borderWidth:1,
    borderColor:ADMIN_UI.stroke,borderRadius:16,padding:28,
    justifyContent:"center",alignItems:"center",gap:10},
  emptyTitle:{fontSize:15,color:ADMIN_UI.ink,fontWeight:"900",textAlign:"center"},
  emptyCopy:{fontSize:12,color:ADMIN_UI.muted,textAlign:"center",maxWidth:420,lineHeight:19},
  card:{borderWidth:1,borderColor:ADMIN_UI.stroke,backgroundColor:"#FFFFFF",
    borderRadius:15,padding:19,marginBottom:9},
  unreadCard:{borderLeftWidth:4,borderLeftColor:ADMIN_UI.emerald},
  cardHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  category:{borderRadius:6,backgroundColor:"#E9F8EF",paddingVertical:5,paddingHorizontal:8},
  categoryText:{color:ADMIN_UI.emerald,fontSize:9,fontWeight:"900",letterSpacing:0.7},
  dot:{backgroundColor:ADMIN_UI.emerald,width:7,height:7,borderRadius:7},
  itemTitle:{color:ADMIN_UI.ink,fontSize:14,fontWeight:"900",marginTop:10},
  itemBody:{color:ADMIN_UI.muted,fontSize:12,lineHeight:19,marginTop:7},
  cardFooter:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:13},
  date:{flex:1,color:ADMIN_UI.muted,fontSize:11},
  markButton:{padding:8,borderRadius:8,backgroundColor:"#E9F8EF"},
  markText:{fontSize:11,fontWeight:"900",color:ADMIN_UI.emerald},
  readText:{fontSize:11,color:ADMIN_UI.muted},
  pages:{flexDirection:"row",gap:14,justifyContent:"center",alignItems:"center",marginTop:16},
  pageBtn:{minHeight:37,justifyContent:"center",borderWidth:1,borderColor:ADMIN_UI.stroke,
    borderRadius:10,paddingHorizontal:13,backgroundColor:"#FFFFFF"},
  pageLabel:{fontSize:12,color:ADMIN_UI.muted,fontWeight:"700"}
});
