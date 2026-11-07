import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Image, Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View, type DimensionValue,
} from "react-native";
import VolunServeButton from "../ui/VolunServeButton";
import VolunServeField from "../ui/VolunServeField";
import { liveUi as ui } from "../../constants/volunserveLiveUi";

/**
 * This is the REAL EXPO WEB UI review surface using the shared components
 * used by production role portals. It is SAMPLE DATA ONLY: no Firebase,
 * credentials, payments, or backend hooks.
 */
type Role = "resident" | "volunteer" | "admin" | "superadmin";
type Icon = React.ComponentProps<typeof Ionicons>["name"];
type Module = { key: string; name: string; icon: Icon; description: string };
const modules: Record<Role, Module[]> = {
  resident: [
    { key: "home", name: "Home", icon: "home-outline", description: "Your community at a glance" },
    { key: "emergency", name: "Emergency Reports", icon: "alert-circle-outline", description: "Report incidents within SJDM" },
    { key: "assistance", name: "Request Assistance", icon: "hand-left-outline", description: "Assistance request and status" },
    { key: "events", name: "Community Events", icon: "calendar-outline", description: "Upcoming community activities" },
    { key: "donations", name: "Donations", icon: "heart-outline", description: "Support community needs" },
    { key: "updates", name: "Community Updates", icon: "megaphone-outline", description: "Official announcements" },
    { key: "profile", name: "My Profile", icon: "person-outline", description: "Account and identity" },
  ],
  volunteer: [
    { key: "home", name: "Home", icon: "home-outline", description: "Your volunteer overview" },
    { key: "tasks", name: "Emergency Tasks", icon: "hand-left-outline", description: "View assigned emergency tasks" },
    { key: "events", name: "Community Events", icon: "calendar-outline", description: "Events and volunteering" },
    { key: "attendance", name: "Event Attendance", icon: "time-outline", description: "Time-in and time-out records" },
    { key: "certificates", name: "My Certificates", icon: "ribbon-outline", description: "Your verified service records" },
    { key: "updates", name: "Notifications", icon: "notifications-outline", description: "Your updates" },
    { key: "profile", name: "My Profile", icon: "person-outline", description: "Volunteer identity and profile" },
  ],
  admin: [
    { key: "home", name: "Command Center", icon: "home-outline", description: "Overview of community activity" },
    { key: "identity", name: "Resident Identity Reviews", icon: "shield-checkmark-outline", description: "Resident verification queue" },
    { key: "operations", name: "LGU Operations", icon: "time-outline", description: "Administrative operations" },
    { key: "emergency", name: "Emergency Reports", icon: "alert-circle-outline", description: "Incoming emergency reports" },
    { key: "assistance", name: "Assistance Requests", icon: "hand-left-outline", description: "Review resident requests" },
    { key: "events", name: "Community Events", icon: "calendar-outline", description: "Manage community activities" },
    { key: "attendance", name: "Event Attendance", icon: "checkmark-done-outline", description: "Verified attendance" },
    { key: "certificates", name: "Certificates", icon: "ribbon-outline", description: "Certificate records" },
    { key: "donations", name: "Donation Management", icon: "heart-outline", description: "Review donation activity" },
    { key: "announcements", name: "Announcements", icon: "megaphone-outline", description: "Community advisory posts" },
  ],
  superadmin: [
    { key: "home", name: "System Overview", icon: "grid-outline", description: "System-wide operations" },
    { key: "accounts", name: "Admin Accounts", icon: "people-outline", description: "Review administrator access" },
    { key: "audit", name: "Admin Activity & Audit Logs", icon: "time-outline", description: "Read-only activity trail" },
    { key: "records", name: "System Records", icon: "albums-outline", description: "System-wide record summaries" },
    { key: "settings", name: "System Settings", icon: "settings-outline", description: "Application configuration" },
    { key: "profile", name: "My Profile", icon: "person-outline", description: "Super Admin details" },
  ],
};
const roleNames: Record<Role, string> = {
  resident: "Resident", volunteer: "Volunteer", admin: "Admin", superadmin: "Super Admin",
};
const roleIcons: Record<Role, Icon> = {
  resident: "person-outline", volunteer: "hand-left-outline",
  admin: "business-outline", superadmin: "shield-checkmark-outline",
};
const allRoles: Role[] = ["resident", "volunteer", "admin", "superadmin"];
const sampleRows = [
  { title: "Community activity review", person: "Sample User 01", status: "Pending", date: "Nov 7, 2026" },
  { title: "Barangay support activity", person: "Sample User 02", status: "Approved", date: "Nov 6, 2026" },
  { title: "Local event registration", person: "Sample User 03", status: "In Review", date: "Nov 5, 2026" },
  { title: "Volunteer attendance record", person: "Sample User 04", status: "Completed", date: "Nov 4, 2026" },
  { title: "Community information update", person: "Sample User 05", status: "Approved", date: "Nov 3, 2026" },
  { title: "Resident support follow-up", person: "Sample User 06", status: "Pending", date: "Nov 2, 2026" },
  { title: "Community project planning", person: "Sample User 07", status: "In Review", date: "Nov 1, 2026" },
];
/** Different fictional records make each actual module design easier to review. */
const moduleTitles: Record<string, string[]> = {
  emergency: ["Flood warning — Barangay Muzon","Road obstruction — Sapang Palay","Safety concern — Gaya-Gaya",
    "Drainage inspection — Minuyan","Rainfall report — San Rafael"],
  assistance: ["Food assistance request — Sample Household","Shelter supply inquiry — Sample Household",
    "Relief package request — Sample Household","Assistance status follow-up","Community needs assessment"],
  events: ["Barangay Cleanup Drive","Basic First Aid Orientation","Community Preparedness Seminar",
    "Public Volunteer Orientation","Local Environmental Activity"],
  donations: ["Community Relief Fund","Family Assistance Campaign","Preparedness Supplies",
    "Flood-Affected Area Support","Emergency Supply Distribution"],
  tasks: ["Debris clearing assignment","Relief goods distribution","Evacuation center support",
    "Barangay emergency preparedness","Incident verification follow-up"],
  identity: ["National ID and selfie review","Resident registration check","Identity evidence clarification",
    "Verification decision queue","Manual document review"],
  operations: ["Admin staff duty log","LGU office review session","Admin shift attendance","Staff duty record","Office operations update"],
  attendance: ["Event time-in verification","Event time-out verification","Service hours review",
    "Volunteer attendance confirmation","Event presence record"],
  certificates: ["Service hours certificate","Community volunteer certificate",
    "Event participation certificate","Attendance-based certificate","Certificate verification record"],
  updates: ["Public weather advisory","Community safety announcement","Preparedness information",
    "Scheduled activity notice","Barangay community update"],
  announcements: ["Public advisory draft","Community events notice","Emergency preparedness post",
    "Administrative announcement","Resident information update"],
  accounts: ["Admin access application","Pending staff account","Role permission review",
    "Staff approval record","Account access request"],
  audit: ["Admin permission change","Resident review action","Announcement published",
    "Volunteer assignment recorded","Settings update logged"],
  records: ["Resident record summary","Emergency reports overview","Volunteer records report",
    "Donation audit summary","Community events dataset"],
  settings: ["Authentication policy setting","Notification preference setting","Record retention setting",
    "System configuration history","Access control setting"],
  profile: ["Profile information summary","Identity status","Contact information",
    "Activity history","Account security"],
};
const bars = [36, 64, 46, 77, 57, 89, 68];
function IconTile({ name, strong = false }: {name: Icon; strong?: boolean}) {
  return <View style={[s.iconTile, strong && s.iconTileStrong]}><Ionicons name={name} size={19} color={ui.color.primary} /></View>;
}
function SmallLabel({ children }: {children: React.ReactNode}) {
  return <Text style={s.eyebrow}>{children}</Text>;
}
function Surface({ title, subtitle, icon, children }: {
  title: string; subtitle?: string; icon: Icon; children: React.ReactNode;
}) {
  return <View style={s.surface}>
    <View style={s.surfaceHeading}>
      <IconTile name={icon} />
      <View style={{flex:1,minWidth:0}}>
        <Text style={s.surfaceTitle}>{title}</Text>
        {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
      </View>
    </View>
    {children}
  </View>;
}
function Metric({ value, label, icon, width }: { value: string; label: string; icon: Icon; width: DimensionValue }) {
  return <View style={[s.metric,{width}]}>
    <IconTile name={icon}/>
    <Text style={s.metricValue}>{value}</Text>
    <Text style={s.metricLabel}>{label}</Text>
  </View>;
}
function Status({ value }: { value: string }) {
  const approved=value==="Approved"||value==="Completed";
  const pending=value==="Pending";
  return <View style={[s.status,approved?s.statusApproved:pending?s.statusPending:s.statusReview]}>
    <Text style={[s.statusText,approved?s.textApproved:pending?s.textPending:s.textReview]}>{value}</Text>
  </View>;
}
export default function DesignReviewWorkspace() {
  const {width}=useWindowDimensions();
  const mobile=width<800;
  const small=width<440;
  const [role,setRole]=useState<Role>("resident");
  const [page,setPage]=useState("home");
  const [menuOpen,setMenuOpen]=useState(false);
  const [notice,setNotice]=useState("");
  const [search,setSearch]=useState("");
  const [pageNumber,setPageNumber]=useState(1);
  const [formTitle,setFormTitle]=useState("");
  const [formMessage,setFormMessage]=useState("");
  const [formError,setFormError]=useState("");
  const [dialog,setDialog]=useState(false);
  const [filter,setFilter]=useState<"All"|"Pending"|"Approved">("All");
  const [showInfo,setShowInfo]=useState(false);
  const [sort,setSort]=useState(false);
  const entries=modules[role];
  const selected=entries.find(x=>x.key===page)||entries[0];
  const navTo=(key:string)=>{
    setPage(key);setMenuOpen(false);setNotice("");setSearch("");setPageNumber(1);
    setFormError("");setFormTitle("");setFormMessage("");setDialog(false);
  };
  const pickRole=(r:Role)=>{setRole(r);navTo("home")};
  const gridWidth: DimensionValue=mobile? "100%" : "31.5%";
  const rowLabels=moduleTitles[selected.key] || moduleTitles.updates;
  const moduleRows=sampleRows.map((record,i)=>({...record,title:rowLabels[i%rowLabels.length]}));
  const isReadOnlyModule=(role==="superadmin" && ["audit","records"].includes(selected.key)) ||
    (role==="resident" && selected.key==="events") ||
    selected.key==="certificates";
  const actionLabel=selected.key==="announcements"?"Preview announcement form" :
    selected.key==="settings"?"Preview settings form" :
    selected.key==="emergency"&&role==="resident"?"Preview report form" :
    selected.key==="assistance"&&role==="resident"?"Preview assistance form" :
    isReadOnlyModule?"View sample details":"Try sample action";
  const filtered=moduleRows.filter(x=>
    (filter==="All"||x.status===filter) &&
    (x.title+" "+x.person).toLowerCase().includes(search.toLowerCase())
  );
  const ordered=sort?[...filtered].reverse():filtered;
  const pageCount=Math.max(1,Math.ceil(ordered.length/5));
  const visible=ordered.slice((Math.min(pageNumber,pageCount)-1)*5,Math.min(pageNumber,pageCount)*5);
  const sendSample=()=>{
    if(formTitle.trim().length<3){setFormError("Enter at least 3 characters for a sample title.");return}
    if(formMessage.trim().length<10){setFormError("Enter at least 10 characters for a sample message.");return}
    setFormError("");
    setNotice("Preview only: sample form validated. No real record was created.");
    setDialog(false);
    setFormTitle("");setFormMessage("");
  };
  const sidebar = <View style={s.sidebar}>
    <View style={s.brandRow}>
      <Image source={require("../../assets/images/logo.png")} style={s.brandLogo}/>
      <View style={{flex:1,minWidth:0}}>
        <Text style={s.brandName}>VolunServe</Text>
        <Text style={s.brandSub}>CITY OF SAN JOSE DEL MONTE</Text>
      </View>
      {mobile ? <Pressable accessibilityRole="button" accessibilityLabel="Close navigation" style={s.closeButton} onPress={()=>setMenuOpen(false)}>
        <Ionicons name="close" size={23} color={ui.color.white}/>
      </Pressable>:null}
    </View>
    <Text style={s.sidebarCaption}>{roleNames[role].toUpperCase()} WORKSPACE</Text>
    <ScrollView style={{flex:1}} contentContainerStyle={s.navContent} showsVerticalScrollIndicator={false}>
      {entries.map(item=><Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.name}
        accessibilityState={{selected:selected.key===item.key}} onPress={()=>navTo(item.key)}
        style={({pressed})=>[s.navItem,selected.key===item.key&&s.navSelected,pressed&&s.pressed]}>
        <Ionicons name={item.icon} color={selected.key===item.key?"#FFFFFF":"#C9E6DA"} size={19}/>
        <Text numberOfLines={2} style={[s.navText,selected.key===item.key&&s.navTextSelected]}>{item.name}</Text>
        {selected.key===item.key?<View style={s.activeStripe}/>:null}
      </Pressable>)}
    </ScrollView>
    <View style={s.sidebarFooter}>
      <Text style={s.sidebarFooterTitle}>Design review mode</Text>
      <Text style={s.sidebarFooterText}>All content is fictional. No account or database is connected.</Text>
    </View>
  </View>;
  return <View style={s.root}>
    {!mobile?<View style={s.sidebarSlot}>{sidebar}</View>:null}
    <View style={s.main}>
      <View style={s.toolbar}>
        {mobile?<Pressable style={s.toolbarIcon} accessibilityRole="button" accessibilityLabel="Open sidebar"
          onPress={()=>setMenuOpen(true)}><Ionicons name="menu" size={23} color={ui.color.text}/></Pressable>:null}
        <View style={s.toolbarTitle}>
          <Text numberOfLines={1} style={s.toolbarBrand}>VolunServe <Text style={{color:ui.color.secondary,fontWeight:"500"}}>· Design review</Text></Text>
          {!small?<Text style={s.toolbarSub}>Desktop and mobile · All four roles</Text>:null}
        </View>
        {!small?<View style={s.readonlyBadge}><Ionicons name="eye-outline" color={ui.color.primary} size={14}/><Text style={s.readonlyText}>SAMPLE UI</Text></View>:null}
        <Pressable accessibilityRole="button" accessibilityLabel="Preview notifications" onPress={()=>setShowInfo(x=>!x)} style={s.toolbarIcon}>
          <Ionicons name="notifications-outline" size={20} color={ui.color.text}/>
        </Pressable>
      </View>
      {showInfo?<View style={s.notification}>
        <Text style={s.notificationTitle}>Preview notifications</Text>
        <Text style={s.muted}>Sample only — no real alerts, emails or pushes.</Text>
        <VolunServeButton label="Close" variant="ghost" onPress={()=>setShowInfo(false)}/>
      </View>:null}
      <ScrollView style={{flex:1}} contentContainerStyle={[s.content,small&&s.contentSmall]} keyboardShouldPersistTaps="handled">
        <View style={s.previewBanner}>
          <Ionicons name="shield-checkmark-outline" size={18} color={ui.color.primary}/>
          <Text style={s.previewBannerText}>Interactive visual review — sample data, no sign-in, no production writes</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.roleScroll}
          contentContainerStyle={s.roleChoices}>
          {allRoles.map(r=><Pressable key={r} accessibilityRole="button" accessibilityLabel={"View "+roleNames[r]+" design"}
            accessibilityState={{selected:r===role}} onPress={()=>pickRole(r)}
            style={[s.roleChoice,r===role&&s.roleChoiceSelected]}>
            <Ionicons name={roleIcons[r]} size={17} color={r===role?ui.color.white:ui.color.secondary}/>
            <Text style={[s.roleChoiceText,r===role&&s.roleChoiceTextSelected]}>{roleNames[r]}</Text>
          </Pressable>)}
        </ScrollView>
        <View style={s.pageHeader}>
          <View style={s.pageTitleBlock}>
            <SmallLabel>{roleNames[role].toUpperCase()} PORTAL · {selected.key==="home"?"OVERVIEW":"MODULE"}</SmallLabel>
            <Text style={[s.pageTitle,small&&s.pageTitleSmall]}>{selected.name}</Text>
            <Text style={s.pageDescription}>{selected.description}</Text>
          </View>
          {!mobile?<View style={s.headerActions}>
            <VolunServeButton icon="grid-outline" variant="secondary" label="Dashboard" onPress={()=>navTo("home")}/>
            <VolunServeButton icon="eye-outline" label="View module list" onPress={()=>setMenuOpen(true)}/>
          </View>:null}
        </View>
        {notice?<View style={s.feedback} accessibilityRole="alert">
          <Ionicons name="checkmark-circle-outline" color={ui.color.primary} size={21}/>
          <Text style={s.feedbackText}>{notice}</Text>
          <Pressable onPress={()=>setNotice("")} accessibilityRole="button" accessibilityLabel="Dismiss message">
            <Ionicons name="close" color={ui.color.secondary} size={20}/>
          </Pressable>
        </View>:null}
        <View style={s.metricRow}>
          <Metric width={gridWidth} icon="layers-outline" value={role==="admin"?"24":role==="superadmin"?"08":"06"} label="Sample records"/>
          <Metric width={gridWidth} icon="time-outline" value={role==="volunteer"?"03":"04"} label="Pending items"/>
          <Metric width={gridWidth} icon="checkmark-circle-outline" value="12" label="Completed actions"/>
        </View>
        {selected.key==="home"?<>
          <View style={[s.twoColumns,mobile&&s.stacked]}>
            <View style={s.flexPanel}>
              <Surface title="Activity overview" subtitle="Illustrative weekly volume" icon="stats-chart-outline">
                <View style={s.chart}>
                  {bars.map((h,i)=><View key={i} style={s.chartCol}>
                    <View style={[s.chartBar,{height:(h+"%") as DimensionValue}]}/>
                    <Text style={s.chartLabel}>{["M","T","W","T","F","S","S"][i]}</Text>
                  </View>)}
                </View>
                <Text style={s.micro}>Example chart only · Not production analytics</Text>
              </Surface>
            </View>
            <View style={s.flexPanel}>
              <Surface title="Quick access" subtitle="Common modules for this workspace" icon="apps-outline">
                {entries.filter(x=>x.key!=="home").slice(0,4).map(item=><Pressable key={item.key} accessibilityRole="button"
                  style={({pressed})=>[s.listItem,pressed&&s.pressed]} onPress={()=>navTo(item.key)}>
                  <IconTile name={item.icon}/>
                  <View style={{flex:1,minWidth:0}}><Text style={s.itemTitle}>{item.name}</Text><Text style={s.muted} numberOfLines={1}>{item.description}</Text></View>
                  <Ionicons name="chevron-forward" size={17} color={ui.color.secondary}/>
                </Pressable>)}
              </Surface>
            </View>
          </View>
          <Surface title="Recent activity" subtitle="Representative list and action hierarchy" icon="document-text-outline">
            {sampleRows.slice(0,3).map((x,i)=><View key={i} style={s.listItem}>
              <IconTile name="document-text-outline"/>
              <View style={{flex:1,minWidth:0}}><Text style={s.itemTitle}>{x.title}</Text><Text style={s.muted}>{x.date}</Text></View>
              <Status value={x.status}/>
            </View>)}
          </Surface>
        </>:<>
          <View style={s.moduleActions}>
            <VolunServeButton icon={isReadOnlyModule?"eye-outline":"add-outline"} label={actionLabel}
              onPress={()=>{if(isReadOnlyModule)setNotice("Sample details only. This module does not create records in the preview."); else setDialog(true);}}/>
            <VolunServeButton icon="refresh-outline" label="Reset demo" variant="secondary"
              onPress={()=>{setSearch("");setFilter("All");setPageNumber(1);setSort(false);setNotice("Sample filters were reset.")}}/>
          </View>
          <Surface title={selected.name+" records"} subtitle="Fictional five-row listing with filtering, sorting and preview interactions" icon={selected.icon}>
            <View style={s.filterArea}>
              <TextInput accessible accessibilityLabel="Search sample records"
                placeholder="Search sample records..." placeholderTextColor="#789083"
                value={search} onChangeText={x=>{setSearch(x);setPageNumber(1)}}
                style={s.search}/>
              <View style={s.filterChips}>
                {(["All","Pending","Approved"] as const).map(v=><Pressable key={v}
                  onPress={()=>{setFilter(v);setPageNumber(1)}} accessibilityRole="button" accessibilityLabel={"Filter "+v}
                  accessibilityState={{selected:filter===v}} style={[s.filterChip,filter===v&&s.filterChipActive]}>
                  <Text style={[s.filterChipText,filter===v&&s.filterChipTextActive]}>{v}</Text>
                </Pressable>)}
              </View>
              <VolunServeButton label="Sort" icon="swap-vertical-outline" variant="ghost" onPress={()=>setSort(x=>!x)}/>
            </View>
            <View style={s.listHeader}>
              <Text style={s.tableHeading}>RECORD / PERSON</Text>
              {!small?<Text style={s.tableHeading}>STATUS</Text>:null}
            </View>
            {visible.length?visible.map((x,i)=><Pressable key={x.person+":"+x.title} accessible accessibilityRole="button"
              accessibilityLabel={"Open sample "+x.title} onPress={()=>setNotice("Preview detail: "+x.title+" — no real data changed.")}
              style={({pressed})=>[s.tableRow,pressed&&s.pressed]}>
              <IconTile name="document-text-outline"/>
              <View style={{flex:1,minWidth:0}}>
                <Text style={s.itemTitle} numberOfLines={1}>{x.title}</Text>
                <Text style={s.muted} numberOfLines={1}>{x.person+" · "+x.date}</Text>
                {small?<View style={{alignSelf:"flex-start",marginTop:6}}><Status value={x.status}/></View>:null}
              </View>
              {!small?<Status value={x.status}/>:null}
              <Ionicons name="chevron-forward" color={ui.color.secondary} size={18}/>
            </Pressable>):<View style={s.empty}>
              <Ionicons name="search-outline" size={24} color={ui.color.secondary}/>
              <Text style={s.muted}>No sample records match your filters.</Text>
            </View>}
            <View style={s.pagination}>
              <Text style={s.muted}>{ordered.length} sample records · Page {Math.min(pageNumber,pageCount)} of {pageCount}</Text>
              <View style={s.pageButtons}>
                <VolunServeButton variant="secondary" label="Previous" disabled={pageNumber<=1}
                  onPress={()=>setPageNumber(Math.max(1,pageNumber-1))}/>
                <VolunServeButton variant="secondary" label="Next" disabled={pageNumber>=pageCount}
                  onPress={()=>setPageNumber(Math.min(pageCount,pageNumber+1))}/>
              </View>
            </View>
          </Surface>
        </>}
        <View style={s.footer}><Text style={s.footerText}>VolunServe · Web & mobile UI review · Fictional data only</Text>
          <Pressable accessibilityRole="button" onPress={()=>router.replace("/public/preview")}>
            <Text style={s.footerLink}>Back to Guest Preview</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
    {mobile&&menuOpen?<View style={s.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={s.scrim} onPress={()=>setMenuOpen(false)}/>
      <View style={s.drawer}>{sidebar}</View>
    </View>:null}
    {!mobile&&menuOpen?<View style={s.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close module selector" style={s.scrim} onPress={()=>setMenuOpen(false)}/>
      <View style={s.drawer}>{sidebar}</View>
    </View>:null}
    {dialog?<View style={s.dialogOverlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close sample form" style={s.dialogScrim} onPress={()=>setDialog(false)}/>
      <View style={[s.dialogCard,small&&s.dialogCardSmall]}>
        <View style={s.dialogHeading}>
          <View style={{flex:1,minWidth:0}}>
            <SmallLabel>{roleNames[role].toUpperCase()} · SAMPLE FORM</SmallLabel>
            <Text style={s.dialogTitle}>{selected.name}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close sample form"
            style={s.toolbarIcon} onPress={()=>setDialog(false)}><Ionicons name="close" size={22} color={ui.color.text}/></Pressable>
        </View>
        <Text style={[s.muted,{marginBottom:15}]}>Try form validation without creating any real records.</Text>
        <VolunServeField label="Sample title" required value={formTitle} onChangeText={x=>{setFormTitle(x);setFormError("")}}
          placeholder="Enter a short title" error={formError.includes("title")?formError:null}/>
        <VolunServeField label="Sample message" required value={formMessage} multiline
          onChangeText={x=>{setFormMessage(x);setFormError("")}} placeholder="Describe the sample request"
          error={formError.includes("message")?formError:null}/>
        <View style={s.dialogActions}>
          <VolunServeButton variant="secondary" label="Cancel" onPress={()=>setDialog(false)}/>
          <VolunServeButton label="Validate sample" icon="checkmark-outline" onPress={sendSample}/>
        </View>
      </View>
    </View>:null}
  </View>;
}

const s=StyleSheet.create({
  root:{flex:1,flexDirection:"row",backgroundColor:ui.color.canvas,minHeight:0},
  sidebarSlot:{width:260,height:"100%",flexShrink:0},
  sidebar:{flex:1,backgroundColor:ui.color.sidebar,minHeight:0},
  brandRow:{flexDirection:"row",alignItems:"center",gap:11,paddingHorizontal:17,paddingVertical:20,borderBottomWidth:1,borderColor:"rgba(255,255,255,0.12)"},
  brandLogo:{width:42,height:42,borderRadius:21},
  brandName:{color:ui.color.white,fontSize:19,fontWeight:"700"},
  brandSub:{color:"#BBD6C9",fontSize:9,fontWeight:"600",marginTop:4,letterSpacing:0.35},
  sidebarCaption:{color:"#C6E3D3",fontSize:11,fontWeight:"700",letterSpacing:1,paddingHorizontal:22,marginTop:22,marginBottom:12},
  navContent:{gap:3,paddingHorizontal:12,paddingBottom:20},
  navItem:{minHeight:46,flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:13,borderRadius:ui.radius.control,position:"relative"},
  navSelected:{backgroundColor:ui.color.sidebarActive},
  navText:{flex:1,color:"#D7E9E0",fontSize:13,fontWeight:"600"},
  navTextSelected:{color:ui.color.white,fontWeight:"700"},
  activeStripe:{width:3,height:23,backgroundColor:"#9AE7BB",borderRadius:2},
  pressed:{opacity:0.8},
  sidebarFooter:{borderTopWidth:1,borderColor:"rgba(255,255,255,0.12)",padding:18,gap:6},
  sidebarFooterTitle:{fontSize:12,color:ui.color.white,fontWeight:"700"},
  sidebarFooterText:{fontSize:11,lineHeight:17,color:"#C7DED2"},
  main:{flex:1,minWidth:0},
  toolbar:{minHeight:70,borderBottomWidth:1,borderColor:ui.color.border,backgroundColor:ui.color.surface,
    paddingHorizontal:20,flexDirection:"row",alignItems:"center",gap:12},
  toolbarTitle:{flex:1,minWidth:0},
  toolbarBrand:{fontSize:16,fontWeight:"700",color:ui.color.text},
  toolbarSub:{fontSize:11,color:ui.color.secondary,marginTop:3},
  toolbarIcon:{height:44,width:44,borderRadius:ui.radius.control,borderWidth:1,borderColor:ui.color.border,
    alignItems:"center",justifyContent:"center",backgroundColor:ui.color.surface},
  readonlyBadge:{flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:11,paddingVertical:9,
    backgroundColor:ui.color.primarySoft,borderRadius:8},
  readonlyText:{fontSize:10,color:ui.color.primary,fontWeight:"700"},
  content:{padding:22,paddingBottom:36,gap:18},
  contentSmall:{padding:12,gap:14},
  previewBanner:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:ui.color.primarySoft,
    borderRadius:ui.radius.control,paddingHorizontal:13,paddingVertical:12},
  previewBannerText:{flex:1,fontSize:12,lineHeight:19,color:ui.color.text,fontWeight:"600"},
  roleScroll:{flexGrow:0},
  roleChoices:{gap:8,paddingVertical:1},
  roleChoice:{minHeight:44,flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:15,
    borderWidth:1,borderColor:ui.color.border,backgroundColor:ui.color.surface,borderRadius:ui.radius.control},
  roleChoiceSelected:{backgroundColor:ui.color.primary,borderColor:ui.color.primary},
  roleChoiceText:{fontSize:13,color:ui.color.secondary,fontWeight:"600"},
  roleChoiceTextSelected:{color:ui.color.white,fontWeight:"700"},
  pageHeader:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",gap:16},
  pageTitleBlock:{flex:1,minWidth:0,gap:5},
  eyebrow:{fontSize:11,lineHeight:16,color:ui.color.primary,fontWeight:"700",letterSpacing:0.6},
  pageTitle:{color:ui.color.text,fontSize:28,lineHeight:36,fontWeight:"700"},
  pageTitleSmall:{fontSize:22,lineHeight:29},
  pageDescription:{fontSize:13,lineHeight:20,color:ui.color.secondary},
  headerActions:{flexDirection:"row",gap:8,alignItems:"center"},
  feedback:{padding:13,borderRadius:ui.radius.control,backgroundColor:ui.color.primarySoft,
    flexDirection:"row",alignItems:"center",gap:10},
  feedbackText:{flex:1,fontSize:13,color:ui.color.text,lineHeight:19},
  metricRow:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",rowGap:10},
  metric:{backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,
    borderRadius:ui.radius.card,padding:17,minHeight:133,gap:8,minWidth:0},
  metricValue:{fontSize:25,color:ui.color.text,fontWeight:"700",lineHeight:31},
  metricLabel:{fontSize:12,color:ui.color.secondary,fontWeight:"600"},
  iconTile:{width:38,height:38,borderRadius:10,backgroundColor:ui.color.primarySoft,
    alignItems:"center",justifyContent:"center"},
  iconTileStrong:{width:42,height:42},
  twoColumns:{flexDirection:"row",alignItems:"stretch",gap:14},
  stacked:{flexDirection:"column"},
  flexPanel:{flex:1,minWidth:0},
  surface:{backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,
    borderRadius:ui.radius.card,padding:17,gap:14,minWidth:0},
  surfaceHeading:{flexDirection:"row",alignItems:"center",gap:11},
  surfaceTitle:{fontSize:17,lineHeight:24,color:ui.color.text,fontWeight:"700"},
  muted:{fontSize:12,lineHeight:19,color:ui.color.secondary},
  chart:{flexDirection:"row",height:160,alignItems:"flex-end",justifyContent:"space-around",
    borderBottomWidth:1,borderColor:ui.color.border,paddingTop:15},
  chartCol:{width:30,height:"100%",alignItems:"center",justifyContent:"flex-end",gap:5},
  chartBar:{width:23,borderTopLeftRadius:6,borderTopRightRadius:6,backgroundColor:ui.color.primary,minHeight:8},
  chartLabel:{fontSize:10,color:ui.color.secondary,fontWeight:"600"},
  micro:{fontSize:11,lineHeight:17,color:ui.color.secondary},
  listItem:{minHeight:66,flexDirection:"row",alignItems:"center",gap:10,paddingVertical:9,
    borderTopWidth:1,borderColor:ui.color.border},
  itemTitle:{fontSize:13,lineHeight:19,color:ui.color.text,fontWeight:"600"},
  status:{paddingHorizontal:10,paddingVertical:7,borderRadius:7},
  statusApproved:{backgroundColor:"#E4F5E9"},
  statusPending:{backgroundColor:"#FFF3E3"},
  statusReview:{backgroundColor:"#EAF0FA"},
  statusText:{fontSize:11,fontWeight:"700"},
  textApproved:{color:"#20724C"},
  textPending:{color:"#915A1B"},
  textReview:{color:"#37669A"},
  moduleActions:{flexDirection:"row",gap:8,flexWrap:"wrap"},
  filterArea:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8},
  search:{flexGrow:1,flexShrink:1,minWidth:160,minHeight:44,borderWidth:1,borderColor:ui.color.border,
    borderRadius:ui.radius.control,paddingHorizontal:13,backgroundColor:ui.color.surface,
    fontSize:14,color:ui.color.text},
  filterChips:{flexDirection:"row",alignItems:"center",gap:4},
  filterChip:{minHeight:44,paddingHorizontal:12,alignItems:"center",justifyContent:"center",borderRadius:8},
  filterChipActive:{backgroundColor:ui.color.primarySoft},
  filterChipText:{fontSize:12,color:ui.color.secondary,fontWeight:"600"},
  filterChipTextActive:{color:ui.color.primary,fontWeight:"700"},
  listHeader:{paddingVertical:10,borderTopWidth:1,borderColor:ui.color.border,
    flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  tableHeading:{fontSize:10,letterSpacing:0.6,color:ui.color.secondary,fontWeight:"700"},
  tableRow:{minHeight:67,borderTopWidth:1,borderColor:ui.color.border,
    paddingVertical:10,flexDirection:"row",gap:10,alignItems:"center"},
  empty:{paddingVertical:30,justifyContent:"center",alignItems:"center",gap:10},
  pagination:{borderTopWidth:1,borderColor:ui.color.border,paddingTop:13,
    flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10},
  pageButtons:{flexDirection:"row",gap:7},
  footer:{paddingTop:16,borderTopWidth:1,borderColor:ui.color.border,
    flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap"},
  footerText:{fontSize:11,color:ui.color.secondary,lineHeight:17},
  footerLink:{fontSize:12,fontWeight:"700",color:ui.color.primary},
  overlay:{position:"absolute",top:0,bottom:0,left:0,right:0,flexDirection:"row"},
  scrim:{flex:1,backgroundColor:"rgba(9,26,20,0.55)"},
  drawer:{position:"absolute",top:0,left:0,bottom:0,width:268,maxWidth:"85%"},
  closeButton:{width:40,height:40,alignItems:"center",justifyContent:"center"},
  notification:{position:"absolute",right:18,top:65,width:260,zIndex:20,
    borderRadius:ui.radius.card,borderWidth:1,borderColor:ui.color.border,
    backgroundColor:ui.color.surface,padding:16,gap:9},
  notificationTitle:{fontSize:14,fontWeight:"700",color:ui.color.text},
  dialogOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0,justifyContent:"center",
    alignItems:"center",padding:14,zIndex:50},
  dialogScrim:{position:"absolute",top:0,bottom:0,left:0,right:0,backgroundColor:"rgba(5,24,18,0.65)"},
  dialogCard:{width:"100%",maxWidth:520,borderRadius:ui.radius.card,borderWidth:1,borderColor:ui.color.border,
    backgroundColor:ui.color.surface,padding:24,maxHeight:"94%"},
  dialogCardSmall:{padding:16},
  dialogHeading:{flexDirection:"row",alignItems:"center",marginBottom:14},
  dialogTitle:{fontSize:20,lineHeight:28,fontWeight:"700",color:ui.color.text},
  dialogActions:{flexDirection:"row",justifyContent:"flex-end",gap:8,flexWrap:"wrap",marginTop:3},
});
