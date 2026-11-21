import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from "react-native";
import { onAuthChange } from "../../lib/firebaseAuth";
import { CertificatePaper } from "./certificate";

type Tab = "info" | "activity" | "progress" | "certificates";
type PublicProfile = {
  name: string; avatarUrl?: string; role: "Volunteer"; joinedEvent: boolean;
  accountJoinedAt: string | null; approved: boolean;
};
type Activity = { title: string; type: string; outcome: string; peopleHelped: number; verifiedAt: string | null };
type EventProgress = {
  title: string; date: string; barangay: string; verifiedMinutes: number;
  completed: boolean; certificateIssued: boolean; status: string;
};
type Certificate = {
  title: string; certificateId: string; eventTitle: string; eventDate: string;
  eventLocation: string; eventBarangay: string; issuedByName: string;
  issuedAt: string | null; serviceMinutes: number; verifiedHelps: number;
  peopleHelped: number; type: string; status: "Issued";
};
type Portfolio = {
  ok: boolean; message?: string; profile: PublicProfile;
  summary: { joinedEvents:number; completedEvents:number; verifiedMinutes:number; certificateCount:number; verifiedHelps:number };
  activity: Activity[]; progress: EventProgress[]; certificates: Certificate[];
};
const API_URL = "https://volunserve.onrender.com";
const green = "#007E65";
const dateLabel = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  const day = new Date(/^\d{4}-\d\d-\d\d$/.test(value) ? value + "T00:00:00" : value);
  return Number.isFinite(day.getTime()) ? day.toLocaleDateString("en-PH", {month:"short",day:"numeric",year:"numeric"}) : "Not recorded";
};
const timeLabel = (value: number) => {
  const minutes=Math.max(0,Math.floor(Number(value)||0));
  return minutes<60 ? `${minutes}m` : `${Math.floor(minutes/60)}h${minutes%60 ? " "+minutes%60+"m" : ""}`;
};
const formatWord = (value: string | null | undefined) =>
  String(value||"—").replace(/_/g," ").replace(/\b\w/g, match=>match.toUpperCase());
const safeAvatar = (url: unknown) =>
  typeof url==="string" &&
  /^https:\/\/(?:res\.cloudinary\.com|lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//i.test(url) ? url : "";

function Metric({ icon, value, label, sub, tint }: {
  icon:React.ComponentProps<typeof Ionicons>["name"]; value:string; label:string; sub:string; tint:string;
}) {
  return <View style={styles.metric}>
    <View style={[styles.metricIcon,{backgroundColor:tint+"15"}]}>
      <Ionicons name={icon} size={22} color={tint}/>
    </View>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricSub}>{sub}</Text>
  </View>;
}
function PanelTitle({icon,children}: {icon:React.ComponentProps<typeof Ionicons>["name"];children:string}) {
  return <View style={styles.panelHeading}>
    <View style={styles.panelIcon}><Ionicons name={icon} size={20} color={green}/></View>
    <Text style={styles.panelTitle}>{children}</Text>
  </View>;
}
function InfoLine({label,value}: {label:string;value:string}) {
  return <View style={styles.infoLine}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>;
}

export default function CommunityEventPublicProfile() {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const compact=width<750;
  const {eventId:rawEventId, member:rawMember}=useLocalSearchParams<{eventId?:string;member?:string}>();
  const eventId=typeof rawEventId==="string" ? rawEventId : "";
  const member=typeof rawMember==="string" ? rawMember : "";
  const valid=/^[A-Za-z0-9_-]{1,160}$/.test(eventId)&&/^[a-f0-9]{16}$/.test(member);
  const [tab,setTab]=useState<Tab>("info");
  const [selectedCertificate,setSelectedCertificate]=useState<Certificate|null>(null);
  const [profile,setProfile]=useState<Portfolio|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const goBack=()=>router.canGoBack()?router.back():router.replace("/(tabs)/community-events");

  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setProfile(null);setTab("info");setSelectedCertificate(null);
    if(!valid){setLoading(false);setError("Invalid volunteer profile link.");return ()=>{active=false;};}
    const unsubscribe=onAuthChange(async user=>{
      if(!user){
        if(active){setLoading(false);setError("Sign in as an approved Volunteer to view this profile.");}
        return;
      }
      try {
        const token=await user.getIdToken();
        const response=await fetch(
          `${API_URL}/api/community-events/${encodeURIComponent(eventId)}/volunteers/${encodeURIComponent(member)}/profile`,
          {headers:{Authorization:`Bearer ${token}`}},
        );
        const payload: Portfolio = await response.json();
        if(!response.ok||!payload.ok||!payload.profile)
          throw new Error(payload.message||"Volunteer achievements are unavailable.");
        if(active){setProfile(payload);setError("");}
      } catch(reason) {
        if(active){setError(reason instanceof Error ? reason.message : "Unable to load public volunteer profile.");setProfile(null);}
      } finally {
        if(active)setLoading(false);
      }
    });
    return ()=>{active=false;unsubscribe();};
  },[eventId,member,valid]);

  const name=profile?.profile.name||"Volunteer";
  const photo=safeAvatar(profile?.profile.avatarUrl);
  const tabs: {key:Tab;label:string}[]=[
    {key:"info",label:"Info"},{key:"activity",label:"Activity"},
    {key:"progress",label:"My Progress"},{key:"certificates",label:"Certificates"},
  ];

  return <ScrollView style={styles.screen} showsVerticalScrollIndicator
    contentContainerStyle={[styles.page,compact&&styles.pageCompact]}>
    <View style={styles.shell}>
      <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
        <Ionicons name="arrow-back" size={18} color={green}/><Text style={styles.backText}>Back to Community Events</Text>
      </Pressable>
      <View style={styles.pageHeading}>
        <Text style={styles.pageTitle}>Volunteer Profile</Text>
        <Text style={styles.pageSubtitle}>Public volunteer achievements and participation records.</Text>
      </View>
      {loading ? <View style={styles.feedback}>
        <ActivityIndicator size="large" color={green}/><Text style={styles.muted}>Loading volunteer achievements...</Text>
      </View> : error ? <View style={styles.feedback}>
        <Ionicons name="alert-circle-outline" size={34} color="#6D8491"/>
        <Text style={styles.muted}>{error}</Text>
        <Pressable onPress={goBack} style={styles.returnButton}><Text style={styles.returnText}>Back to Events</Text></Pressable>
      </View> : profile ? <>
        <View style={styles.hero}>
          <View style={styles.cover}/>
          <View style={[styles.heroContent,compact&&styles.heroCompact]}>
            {photo ? <Image source={{uri:photo}} resizeMode="cover" style={styles.avatar}/> :
              <View style={styles.avatarFallback}><Text style={styles.avatarInitials}>{name.trim().slice(0,1).toUpperCase()}</Text></View>}
            <View style={styles.heroIdentity}>
              <View style={styles.nameRow}>
                <Text style={styles.heroName}>{name}</Text>
                <View style={styles.rolePill}><Ionicons name="people-outline" size={13} color="#4F46E5"/>
                  <Text style={styles.roleText}>Volunteer</Text></View>
              </View>
              <Text style={styles.heroCaption}>Approved community volunteer · Joined this event</Text>
            </View>
          </View>
        </View>
        <View style={styles.tabBar}>
          {tabs.map(item=><Pressable key={item.key} accessibilityRole="tab"
            accessibilityState={{selected:tab===item.key}}
            onPress={()=>setTab(item.key)} style={[styles.tab,tab===item.key&&styles.tabActive]}>
            <Text style={[styles.tabText,tab===item.key&&styles.tabTextActive]}>{item.label}</Text>
          </Pressable>)}
        </View>
        {tab==="info"&&<>
          <View style={styles.panel}>
            <PanelTitle icon="checkmark-circle-outline">Community Volunteer</PanelTitle>
            <Text style={styles.panelDescription}>This member is an approved volunteer participating in a published VolunServe community event.</Text>
            <View style={styles.infoSplit}>
              <View style={styles.infoBlock}>
                <PanelTitle icon="person-outline">Public Information</PanelTitle>
                <InfoLine label="Full Name" value={name}/>
                <InfoLine label="Role" value="Volunteer"/>
                <InfoLine label="Account Joined" value={dateLabel(profile.profile.accountJoinedAt)}/>
              </View>
              <View style={styles.infoBlock}>
                <PanelTitle icon="shield-checkmark-outline">Volunteer Information</PanelTitle>
                <InfoLine label="Volunteer Access" value="Approved"/>
                <InfoLine label="Current Event" value="Joined"/>
                <InfoLine label="Community Certificates" value={String(profile.summary.certificateCount)}/>
              </View>
            </View>
          </View>
        </>}
        {tab==="activity"&&<View style={styles.panel}>
          <PanelTitle icon="checkmark-done-outline">Verified Volunteer Activity</PanelTitle>
          {profile.activity.length===0 ?
            <Text style={styles.empty}>No verified emergency contributions available for this volunteer.</Text> :
            profile.activity.map((item,index)=><View key={index} style={styles.record}>
              <View style={styles.recordTop}>
                <Text style={styles.recordTitle}>{item.title}</Text>
                <Text style={styles.verified}>Verified</Text>
              </View>
              <Text style={styles.recordDate}>{dateLabel(item.verifiedAt)}</Text>
              <View style={styles.recordFields}>
                <View style={styles.field}><Text style={styles.fieldLabel}>CONTRIBUTION</Text><Text style={styles.fieldValue}>{formatWord(item.type)}</Text></View>
                <View style={styles.field}><Text style={styles.fieldLabel}>PEOPLE HELPED</Text><Text style={styles.fieldValue}>{item.peopleHelped}</Text></View>
                <View style={styles.field}><Text style={styles.fieldLabel}>OUTCOME</Text><Text style={styles.fieldValue}>{formatWord(item.outcome)}</Text></View>
              </View>
            </View>)}
        </View>}
        {tab==="progress"&&<>
          <View style={styles.metrics}>
            <Metric icon="time-outline" tint="#078F82" value={timeLabel(profile.summary.verifiedMinutes)}
              label="Community Service" sub="Verified event attendance"/>
            <Metric icon="checkmark-circle-outline" tint="#2479C6"
              value={String(profile.summary.completedEvents)} label="Completed Events" sub="Verified completed events"/>
            <Metric icon="ribbon-outline" tint="#C28A1A"
              value={String(profile.summary.certificateCount)} label="Certificates Earned" sub="Issued certificates"/>
            <Metric icon="heart-outline" tint="#8062BB"
              value={String(profile.summary.verifiedHelps)} label="Verified Emergency Helps" sub="Confirmed assistance"/>
          </View>
          <View style={styles.panel}>
            <PanelTitle icon="calendar-outline">Community Event Progress</PanelTitle>
            <Text style={styles.panelDescription}>Verified service totals and participation in published events.</Text>
            <View style={styles.progressSummary}>
              <View style={styles.progressMetric}><Text style={styles.progressNumber}>{profile.summary.joinedEvents}</Text><Text style={styles.mutedSmall}>Joined Events</Text></View>
              <View style={styles.progressMetric}><Text style={styles.progressNumber}>{profile.summary.completedEvents}</Text><Text style={styles.mutedSmall}>Verified Completions</Text></View>
              <View style={styles.progressMetric}><Text style={styles.progressNumber}>{timeLabel(profile.summary.verifiedMinutes)}</Text><Text style={styles.mutedSmall}>Verified Attendance</Text></View>
            </View>
            {profile.progress.length===0 ? <Text style={styles.empty}>No published community event participation yet.</Text> :
              profile.progress.map((e,i)=><View key={i} style={styles.progressRow}>
                <View style={styles.progressIcon}><Ionicons name="leaf-outline" color={green} size={21}/></View>
                <View style={styles.progressBody}>
                  <Text style={styles.recordTitle}>{e.title||"Community Event"}</Text>
                  <Text style={styles.recordDate}>{dateLabel(e.date)}{e.barangay?" · "+e.barangay:""}</Text>
                  <Text style={styles.verifiedNote}>{e.verifiedMinutes>0?`${timeLabel(e.verifiedMinutes)} verified attendance`:e.completed?"Verified completion":"Attendance not verified yet"}</Text>
                </View>
                <Text style={[styles.statusTag,e.certificateIssued&&styles.statusIssued]}>{e.status.toUpperCase()}</Text>
              </View>)}
          </View>
        </>}
        {tab==="certificates"&&<View style={styles.panel}>
          <PanelTitle icon="ribbon-outline">Actual Issued Certificates</PanelTitle>
          <Text style={styles.panelDescription}>Certificates shown here are issued records retrieved for this volunteer. Select View Certificate to open the official read-only VolunServe certificate design.</Text>
          {profile.certificates.length===0 ? <Text style={styles.empty}>No issued certificates to display.</Text> :
            profile.certificates.map((certificate,i)=><View key={certificate.certificateId || i} style={styles.certificate}>
              <View style={styles.certificateIcon}><Ionicons name="ribbon-outline" size={24} color="#4F46E5"/></View>
              <View style={styles.certificateBody}>
                <Text style={styles.recordTitle}>{certificate.title}</Text>
                {certificate.eventTitle ? <Text style={styles.recordDate}>{certificate.eventTitle}</Text> : null}
                <Text style={styles.certificateRecordId} selectable>Certificate ID: {certificate.certificateId}</Text>
                <View style={styles.certificateMeta}>
                  <View><Text style={styles.fieldLabel}>ISSUED</Text><Text style={styles.fieldValue}>{dateLabel(certificate.issuedAt)}</Text></View>
                  <View><Text style={styles.fieldLabel}>SERVICE TIME</Text><Text style={styles.fieldValue}>{timeLabel(certificate.serviceMinutes)}</Text></View>
                  <View><Text style={styles.fieldLabel}>STATUS</Text><Text style={styles.fieldValue}>Issued</Text></View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`View actual certificate ${certificate.title}`}
                  onPress={()=>setSelectedCertificate(certificate)} style={styles.viewCertificateButton}>
                  <Ionicons name="eye-outline" color="#006D56" size={17}/>
                  <Text style={styles.viewCertificateText}>View Certificate</Text>
                  <Ionicons name="arrow-forward-outline" color="#006D56" size={16}/>
                </Pressable>
              </View>
              <Text style={styles.verified}>Issued</Text>
            </View>)}
        </View>}
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={19} color="#527A73"/>
          <Text style={styles.noticeText}>Public, read-only volunteer portfolio. Email, phone, home address, ID documents, private incident details, attendance timestamps and editing controls are not shared.</Text>
        </View>
      </> : null}
    </View>
    <Modal visible={!!selectedCertificate} transparent animationType="fade"
      onRequestClose={()=>setSelectedCertificate(null)}>
      <View style={styles.paperOverlay}>
        <View style={styles.paperDialog}>
          <View style={styles.paperHeader}>
            <View style={{flex:1}}>
              <Text style={styles.paperHeaderTitle}>Issued VolunServe Certificate</Text>
              <Text style={styles.paperHeaderSub}>Read-only · Original certificate information</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close certificate preview"
              onPress={()=>setSelectedCertificate(null)} style={styles.closePaper}>
              <Ionicons name="close" color="#395E5A" size={21}/>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.paperScroll} showsVerticalScrollIndicator>
            {selectedCertificate && <CertificatePaper displayName={name}
              certificate={{
                id:selectedCertificate.certificateId,
                certificateId:selectedCertificate.certificateId,
                certificateType:selectedCertificate.type,
                verificationStatus:"issued",
                volunteerName:name,
                eventTitle:selectedCertificate.eventTitle,
                eventDate:selectedCertificate.eventDate,
                eventLocation:selectedCertificate.eventLocation,
                eventBarangay:selectedCertificate.eventBarangay,
                verifiedServiceMinutes:selectedCertificate.serviceMinutes,
                verifiedHelps:selectedCertificate.verifiedHelps,
                peopleHelped:selectedCertificate.peopleHelped,
                issuedByName:selectedCertificate.issuedByName,
                issuedAt:selectedCertificate.issuedAt,
              }}/>
            }
          </ScrollView>
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F6F9F8"},page:{paddingHorizontal:24,paddingTop:24,paddingBottom:50,alignItems:"center"},
  pageCompact:{paddingHorizontal:12,paddingTop:14},shell:{width:"100%",maxWidth:1120,gap:16},
  back:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:8,paddingVertical:6},
  backText:{fontWeight:"700",fontSize:12,color:green},
  pageHeading:{gap:5,marginTop:2},pageTitle:{fontWeight:"800",fontSize:26,color:"#103E39"},
  pageSubtitle:{fontSize:13,color:"#647A8A"},
  hero:{backgroundColor:"#FFFFFF",borderRadius:15,borderWidth:1,borderColor:"#DFE8E7",overflow:"hidden"},
  cover:{height:115,backgroundColor:"#0B4A38"},
  heroContent:{paddingHorizontal:28,paddingTop:12,paddingBottom:22,flexDirection:"row",alignItems:"center",gap:18},
  heroCompact:{paddingHorizontal:15,flexWrap:"wrap",gap:12,paddingBottom:18},
  avatar:{width:92,height:92,borderRadius:48,borderWidth:4,borderColor:"white",marginTop:-52,backgroundColor:"#E3F1EC"},
  avatarFallback:{width:92,height:92,borderRadius:48,borderWidth:4,borderColor:"white",marginTop:-52,
    backgroundColor:"#2F681F",alignItems:"center",justifyContent:"center"},
  avatarInitials:{fontSize:40,color:"white",fontWeight:"600"},
  heroIdentity:{flex:1,minWidth:0,gap:7},nameRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},
  heroName:{fontSize:22,color:"#10223C",fontWeight:"800"},heroCaption:{color:"#648090",fontSize:12},
  rolePill:{backgroundColor:"#EFF2FF",borderRadius:9,paddingHorizontal:11,paddingVertical:7,flexDirection:"row",gap:6,alignItems:"center"},
  roleText:{fontSize:11,color:"#4F46E5",fontWeight:"800"},
  tabBar:{flexDirection:"row",flexWrap:"wrap",alignSelf:"flex-start",borderWidth:1,borderColor:"#E1EAF0",
    backgroundColor:"#FFFFFF",borderRadius:10,padding:5,gap:4},
  tab:{paddingVertical:10,paddingHorizontal:14,borderRadius:8},tabActive:{backgroundColor:green},
  tabText:{fontSize:12,fontWeight:"700",color:"#385571"},tabTextActive:{color:"#FFFFFF"},
  panel:{padding:20,borderRadius:14,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DFE8EB",gap:14},
  panelHeading:{flexDirection:"row",alignItems:"center",gap:10},panelIcon:{width:36,height:36,
    borderRadius:11,backgroundColor:"#E8F7F3",alignItems:"center",justifyContent:"center"},
  panelTitle:{fontSize:16,fontWeight:"800",color:"#173C3B"},panelDescription:{fontSize:12,color:"#647C8B",lineHeight:19},
  infoSplit:{flexDirection:"row",flexWrap:"wrap",gap:12},infoBlock:{flexGrow:1,flexBasis:270,backgroundColor:"#FFFFFF",
    borderRadius:12,borderColor:"#E2EAEE",borderWidth:1,padding:15,gap:6},
  infoLine:{flexDirection:"row",justifyContent:"space-between",gap:12,borderBottomWidth:1,borderBottomColor:"#EDF2F5",paddingVertical:10},
  infoLabel:{fontSize:12,color:"#688399",flex:1},infoValue:{fontSize:12,fontWeight:"700",textAlign:"right",color:"#10273D",flex:1},
  record:{backgroundColor:"#FAFBFD",borderWidth:1,borderColor:"#E2EAF0",borderRadius:12,padding:16,gap:9},
  recordTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"},
  recordTitle:{fontWeight:"800",fontSize:13,color:"#10243A",flexShrink:1},
  verified:{fontSize:11,fontWeight:"800",color:"#09633D",backgroundColor:"#DDF8E8",paddingVertical:6,paddingHorizontal:11,borderRadius:30,overflow:"hidden"},
  recordDate:{fontSize:11,color:"#758DA7",marginTop:3},recordFields:{flexDirection:"row",gap:20,flexWrap:"wrap",marginTop:4},
  field:{minWidth:90,gap:3},fieldLabel:{fontSize:10,color:"#8CA1B9",fontWeight:"800"},
  fieldValue:{fontSize:11,fontWeight:"700",color:"#283F5D"},
  empty:{color:"#708591",fontSize:13,paddingVertical:22},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:12},metric:{flex:1,minWidth:170,backgroundColor:"#FFFFFF",
    borderRadius:15,borderWidth:1,borderColor:"#E1EAED",padding:17,gap:4},
  metricIcon:{width:43,height:43,borderRadius:12,justifyContent:"center",alignItems:"center",marginBottom:13},
  metricValue:{fontSize:22,fontWeight:"800",color:"#092C4C"},
  metricLabel:{color:"#122A42",fontSize:12,fontWeight:"800"},metricSub:{fontSize:10,color:"#7188A2"},
  progressSummary:{backgroundColor:"#F0FAF7",borderRadius:13,paddingVertical:18,
    paddingHorizontal:9,flexDirection:"row",justifyContent:"space-around",gap:7},
  progressMetric:{alignItems:"center",flex:1,gap:5},progressNumber:{fontSize:20,fontWeight:"800",color:"#008774"},
  mutedSmall:{textAlign:"center",color:"#7890A0",fontSize:10},
  progressRow:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#E7ECEE"},
  progressIcon:{width:42,height:42,borderRadius:11,backgroundColor:"#E8F7F3",justifyContent:"center",alignItems:"center"},
  progressBody:{flex:1,minWidth:0,gap:4},verifiedNote:{fontSize:11,fontWeight:"700",color:"#008774"},
  statusTag:{fontSize:9,color:"#50778B",fontWeight:"800",padding:7,backgroundColor:"#EEF4F7",borderRadius:12,overflow:"hidden"},
  statusIssued:{backgroundColor:"#DCF7E7",color:"#137447"},
  certificate:{flexDirection:"row",alignItems:"flex-start",gap:14,padding:15,borderWidth:1,
    borderColor:"#E3EAF0",borderRadius:13,backgroundColor:"#FBFCFF"},
  certificateIcon:{width:46,height:46,borderRadius:10,backgroundColor:"#EDF0FF",justifyContent:"center",alignItems:"center"},
  certificateBody:{flex:1,minWidth:0,gap:8},certificateMeta:{flexDirection:"row",gap:30,flexWrap:"wrap",marginTop:8},
  certificateRecordId:{color:"#6C8793",fontSize:11},
  viewCertificateButton:{alignSelf:"flex-start",marginTop:7,paddingVertical:10,paddingHorizontal:14,
    backgroundColor:"#ECF7F1",borderRadius:9,borderWidth:1,borderColor:"#BADDD0",flexDirection:"row",alignItems:"center",gap:9},
  viewCertificateText:{fontSize:12,fontWeight:"800",color:"#006D56"},
  paperOverlay:{flex:1,backgroundColor:"rgba(10,28,32,0.66)",padding:16,justifyContent:"center",alignItems:"center"},
  paperDialog:{width:"100%",maxWidth:740,maxHeight:"94%",backgroundColor:"#FFFFFF",borderRadius:14,overflow:"hidden"},
  paperHeader:{paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#E5EEE9",flexDirection:"row",alignItems:"center",gap:12},
  paperHeaderTitle:{fontSize:16,fontWeight:"800",color:"#163E38"},
  paperHeaderSub:{fontSize:11,color:"#607E7B",marginTop:3},
  closePaper:{width:37,height:37,backgroundColor:"#F0F5F3",borderRadius:10,alignItems:"center",justifyContent:"center"},
  paperScroll:{padding:18,paddingBottom:32},
  notice:{flexDirection:"row",gap:9,alignItems:"flex-start",backgroundColor:"#EFF5F3",borderRadius:10,padding:13},
  noticeText:{flex:1,color:"#69818C",fontSize:11,lineHeight:18},
  feedback:{padding:35,alignItems:"center",gap:13,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0E9E7",borderRadius:14},
  muted:{textAlign:"center",color:"#678292",fontSize:13,lineHeight:20},
  returnButton:{backgroundColor:green,borderRadius:9,padding:12,marginTop:5},returnText:{color:"white",fontWeight:"800",fontSize:12},
});
