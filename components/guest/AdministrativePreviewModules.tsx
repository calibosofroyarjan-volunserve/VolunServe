import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import {
  Pressable, StyleSheet, Text, View, useWindowDimensions,
} from "react-native";
import { liveUi as ui } from "../../constants/volunserveLiveUi";

type Icon = React.ComponentProps<typeof Ionicons>["name"];
type Role = "admin" | "superadmin";
export type PreviewAdminModule = {
  key: string; label: string; icon: Icon; description: string;
  queue: readonly [string, string, string][];
};

export const ADMIN_PREVIEW_MODULES: readonly PreviewAdminModule[] = [
  {key:"command-center",label:"Command Center",icon:"grid-outline",
   description:"See operational overview, review queues and response priorities.",
   queue:[["Pending identity review","Resident verification request","For review"],["Open assistance request","Supporting documents pending","Pending"],["Active emergency report","Location and evidence review","Assigned"]]},
  {key:"identity-reviews",label:"Resident Identity Reviews",icon:"shield-checkmark-outline",
   description:"Review resident ID and selfie evidence before manual approval.",
   queue:[["Example verification request","ID and selfie match","Pending"],["Document quality review","Image and identity evidence","For review"],["Decision history","Approve or reject with recorded reason","Review"]]},
  {key:"lgu-attendance",label:"LGU Operations",icon:"people-outline",
   description:"Review authorized personnel activity and operational summaries.",
   queue:[["Personnel overview","Authorized accounts only","Private"],["Activity records","History and accountability","Protected"],["Operational status","Live statuses unavailable in preview","Sample"]]},
  {key:"admin-cases",label:"Emergency Reports",icon:"alert-circle-outline",
   description:"Check reports, location, evidence and volunteer assignments.",
   queue:[["Flood incident · sample","SJDM incident with attached media","For review"],["Assignment preview","Volunteer accepts or declines invitation","Pending"],["Field report closure","Review arrival, contributions and outcomes","To verify"]]},
  {key:"assistance-requests",label:"Assistance Requests",icon:"hand-left-outline",
   description:"Review applications, documents and approval decisions.",
   queue:[["Example assistance form","Resident request and evidence","For review"],["Receipt checklist","Supporting documents required","Incomplete"],["Decision","Approve or reject with recorded reason","Pending"]]},
  {key:"community-events",label:"Community Events",icon:"calendar-outline",
   description:"Publish community events and review eligible participants.",
   queue:[["Community clean-up · example","Event venue and schedule","Draft"],["Volunteer roster","Participant invitations and approval","Sample"],["Event publishing","SJDM venue and internal map","Review"]]},
  {key:"community-attendance",label:"Event Attendance",icon:"checkmark-done-outline",
   description:"Review time-in/out submissions and verified service hours.",
   queue:[["Attendance period","Check-in and check-out records","Sample"],["Verified hours","Validated attendance totals","Pending"],["Certificate eligibility","Requires completed verified participation","Protected"]]},
  {key:"certificates",label:"Certificates",icon:"ribbon-outline",
   description:"Review certificate eligibility and generated PDF records.",
   queue:[["Example service record","Attendance and approved hours","Sample"],["Certificate PDF","Issued after verification","Private"],["History","Authorized issue and access records","Protected"]]},
  {key:"donor-monitoring",label:"Donation Management",icon:"heart-outline",
   description:"Monitor approved campaigns, donations and fund releases.",
   queue:[["Example relief fundraiser","Illustrative progress only","Sample"],["Donor receipts","Protected payment records","Private"],["Fund release","Admin review, transfer and acknowledgment","Locked"]]},
  {key:"create-announcement",label:"Announcements",icon:"megaphone-outline",
   description:"Compose official notices and preview resident/volunteer delivery.",
   queue:[["Public service advisory","Example announcement only","Draft"],["Audience review","Resident and Volunteer audiences","Preview"],["Publish confirmation","No live notifications are sent here","Disabled"]]},
];

export const SUPERADMIN_PREVIEW_MODULES: readonly PreviewAdminModule[] = [
  {key:"overview",label:"System Overview",icon:"grid-outline",
   description:"Review platform status and governance without changing live data.",
   queue:[["User roles","Resident, Volunteer, Admin and Super Admin","Sample"],["Pending approvals","Identity and staff approval queues","Protected"],["System health","Production metrics are not accessed","Read-only"]]},
  {key:"admin-accounts",label:"Admin Accounts",icon:"people-outline",
   description:"View the administrative account lifecycle and role controls.",
   queue:[["LGU Admin applicant","Approval request with official reference","For review"],["Role assignment","Super Admin-only authorization","Protected"],["Account status","Suspend or reactivate with audit trail","Locked"]]},
  {key:"admin-logs",label:"Admin Activity & Audit Logs",icon:"time-outline",
   description:"Inspect accountable administrative changes.",
   queue:[["Access history","Who viewed or changed protected records","Private"],["Recorded action","Actor, timestamp and module","Sample"],["Export / filter","Security review and evidence history","Protected"]]},
  {key:"all-records",label:"System Records",icon:"albums-outline",
   description:"Read-only overview of system records and audit coverage.",
   queue:[["Resident records","Masked personal information","Private"],["Operational records","Emergency, events and assistance","Sample"],["Donation records","Financial records access restricted","Protected"]]},
  {key:"system-settings",label:"System Settings",icon:"settings-outline",
   description:"Preview configuration, policy toggles and system settings.",
   queue:[["Public contact information","City hotlines and emergency services","Review"],["System configuration","Settings require Super Admin approval","Locked"],["Audit history","Track configuration changes","Protected"]]},
];

const COLOR = ui.color;
function DemoButton({label,onPress,secondary=false,disabled=false}:{
  label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityState={{disabled}} style={({pressed})=>[
        styles.action,secondary&&styles.secondaryAction,disabled&&styles.disabled,
        pressed&&!disabled&&styles.pressed
      ]}>
    <Text style={[styles.actionText,secondary&&styles.secondaryActionText]}>{label}</Text>
  </Pressable>;
}

export default function AdministrativePreviewModules({
  role,module,onNavigate,
}:{
  role:Role;module:string;onNavigate:(module:string)=>void;
}) {
  const {width}=useWindowDimensions();
  const compact=width<760;
  const options=role==="admin"?ADMIN_PREVIEW_MODULES:SUPERADMIN_PREVIEW_MODULES;
  const active=options.find(x=>x.key===module)||options[0];
  const [filter,setFilter]=useState("All");
  const [selected,setSelected]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [page,setPage]=useState(1);
  const available=active.queue.filter(item=>
    filter==="All"||item[2]===filter
  );
  const statuses=["All",...new Set(active.queue.map(x=>x[2]))];
  const first=Math.min(available.length,Math.max(0,(page-1)*5));
  const visible=available.slice(first,first+5);
  return <View style={styles.wrapper}>
    <View style={[styles.header,compact&&styles.headerCompact]}>
      <View style={styles.headerIcon}><Ionicons name={active.icon} size={24} color={COLOR.primary}/></View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{role==="admin"?"LGU ADMIN PORTAL":"SUPER ADMIN PORTAL"} · SAMPLE DESIGN</Text>
        <Text style={[styles.heading,compact&&styles.headingCompact]}>{active.label}</Text>
        <Text style={styles.description}>{active.description}</Text>
      </View>
      {!compact&&<View style={styles.readonly}><Ionicons name="eye-outline" size={15} color={COLOR.primary}/><Text style={styles.readonlyText}>Read only</Text></View>}
    </View>

    <View style={[styles.summaryRow,compact&&styles.stack]}>
      {([
        ["Modules",String(options.length),"layers-outline"],
        ["Example records",String(active.queue.length),"document-text-outline"],
        ["Live writes","Disabled","shield-checkmark-outline"],
      ] as const).map(([label,value,icon])=>
        <View style={styles.stat} key={label}>
          <View style={styles.statIcon}><Ionicons name={icon} size={21} color={COLOR.primary}/></View>
          <View style={styles.statCopy}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>
        </View>)}
    </View>

    <View style={[styles.columns,compact&&styles.stack]}>
      <View style={[styles.card,{flex:1.55}]}>
        <View style={styles.cardHeading}>
          <View style={{flex:1,minWidth:0}}>
            <Text style={styles.cardTitle}>Workflow and records</Text>
            <Text style={styles.cardSub}>Fictional examples. Select a row to inspect the layout.</Text>
          </View>
          <View style={styles.smallPill}><Text style={styles.smallPillText}>5 per page</Text></View>
        </View>
        <View style={styles.filters}>
          {statuses.map(status=><Pressable key={status} accessibilityRole="button"
            accessibilityState={{selected:filter===status}} onPress={()=>{setFilter(status);setPage(1);setSelected(null);}}
            style={[styles.filter,filter===status&&styles.filterActive]}>
            <Text style={[styles.filterText,filter===status&&styles.filterTextActive]}>{status}</Text>
          </Pressable>)}
        </View>
        {visible.length===0?
          <View style={styles.empty}><Ionicons name="file-tray-outline" color={COLOR.secondary} size={31}/><Text style={styles.emptyText}>No sample records match this filter.</Text></View>
          :visible.map((item,i)=><Pressable key={item[0]}
            accessibilityRole="button" accessibilityLabel={"Inspect sample "+item[0]}
            onPress={()=>{setSelected(item[0]);setNotice(null);}} style={({pressed})=>[
              styles.record,selected===item[0]&&styles.recordSelected,pressed&&styles.pressed
            ]}>
            <View style={styles.recordIcon}><Ionicons name="document-text-outline" size={19} color={COLOR.primary}/></View>
            <View style={styles.recordCopy}><Text style={styles.recordTitle}>{item[0]}</Text><Text style={styles.recordSub}>{item[1]}</Text></View>
            <View style={styles.recordRight}><Text style={styles.status}>{item[2]}</Text><Ionicons name="chevron-forward" color={COLOR.secondary} size={17}/></View>
          </Pressable>)}
        <View style={styles.pagination}>
          <Text style={styles.pageText}>{available.length?first+1:0}–{Math.min(first+5,available.length)} of {available.length} examples</Text>
          <DemoButton label="Previous" secondary disabled={page===1} onPress={()=>setPage(v=>Math.max(1,v-1))}/>
          <DemoButton label="Next" secondary disabled={page*5>=available.length} onPress={()=>setPage(v=>v+1)}/>
        </View>
      </View>
      <View style={[styles.card,{flex:1}]}>
        <View style={styles.cardHeading}>
          <View style={{flex:1,minWidth:0}}>
            <Text style={styles.cardTitle}>{selected?"Record preview":"Module actions"}</Text>
            <Text style={styles.cardSub}>Same controls and type hierarchy on desktop and mobile.</Text>
          </View>
        </View>
        {selected&&<View style={styles.selectedBox}>
          <Text style={styles.selectedEyebrow}>SELECTED SAMPLE</Text>
          <Text style={styles.recordTitle}>{selected}</Text>
          <Text style={styles.recordSub}>No resident information, credentials or actual files are loaded.</Text>
        </View>}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Action description</Text>
          <View style={styles.fieldValue}>
            <Text style={styles.fieldValueText}>{selected||"Select a sample record from the list"}</Text>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Review status</Text>
          <View style={styles.fieldValue}><Text style={styles.fieldValueText}>Read-only design demonstration</Text></View>
        </View>
        <DemoButton label="Preview confirmation" onPress={()=>setNotice("Example only: no approval, publishing or database update was performed.")}/>
        <DemoButton label="Clear selection" secondary onPress={()=>{setSelected(null);setNotice("Selection cleared. No records were changed.");}}/>
        {notice&&<View style={styles.notice}><Ionicons name="information-circle-outline" size={19} color={COLOR.primary}/><Text style={styles.noticeText}>{notice}</Text></View>}
      </View>
    </View>
    <View style={styles.safety}><Ionicons name="shield-checkmark-outline" size={21} color={COLOR.primary}/>
      <View style={{flex:1,minWidth:0}}><Text style={styles.safetyTitle}>Safe design review · {role==="admin"?"Admin":"Super Admin"}</Text>
        <Text style={styles.safetyDesc}>Buttons demonstrate selection and messaging only. No Firebase Auth, production records, approvals, payments or notifications are touched.</Text>
      </View>
    </View>
    <Text style={styles.footer}>VOLUNSERVE DESIGN PREVIEW · No real accounts or live production operations</Text>
  </View>;
}

const styles=StyleSheet.create({
 wrapper:{width:"100%",gap:16,paddingBottom:20},
 header:{backgroundColor:COLOR.surface,borderWidth:1,borderColor:COLOR.border,borderRadius:ui.radius.card,padding:22,flexDirection:"row",gap:15,alignItems:"flex-start"},
 headerCompact:{padding:16,gap:11},
 headerIcon:{width:46,height:46,backgroundColor:COLOR.primarySoft,borderRadius:ui.radius.control,alignItems:"center",justifyContent:"center"},
 headerCopy:{flex:1,minWidth:0,gap:6},
 eyebrow:{fontSize:11,lineHeight:16,fontWeight:"700",color:COLOR.primary,letterSpacing:.65},
 heading:{fontSize:ui.type.page.fontSize,lineHeight:ui.type.page.lineHeight,fontWeight:"700",color:COLOR.text},
 headingCompact:{fontSize:21,lineHeight:28},
 description:{fontSize:14,lineHeight:21,color:COLOR.secondary},
 readonly:{flexDirection:"row",alignItems:"center",gap:7,backgroundColor:COLOR.primarySoft,padding:9,borderRadius:ui.radius.control},
 readonlyText:{fontWeight:"700",fontSize:12,color:COLOR.primary},
 summaryRow:{flexDirection:"row",gap:12},
 stack:{flexDirection:"column"},
 stat:{flex:1,minWidth:0,minHeight:90,backgroundColor:COLOR.surface,borderWidth:1,borderColor:COLOR.border,borderRadius:ui.radius.card,padding:15,flexDirection:"row",alignItems:"center",gap:11},
 statIcon:{width:40,height:40,alignItems:"center",justifyContent:"center",backgroundColor:COLOR.primarySoft,borderRadius:ui.radius.control},
 statCopy:{flex:1,gap:4},statLabel:{fontSize:12,color:COLOR.secondary,fontWeight:"500"},
 statValue:{fontSize:18,lineHeight:25,color:COLOR.text,fontWeight:"700"},
 columns:{flexDirection:"row",gap:14,alignItems:"flex-start"},
 card:{minWidth:0,width:"100%",backgroundColor:COLOR.surface,borderRadius:ui.radius.card,borderWidth:1,borderColor:COLOR.border,padding:18,gap:15},
 cardHeading:{flexDirection:"row",alignItems:"center",gap:10},
 cardTitle:{fontSize:ui.type.card.fontSize,lineHeight:23,fontWeight:"700",color:COLOR.text},
 cardSub:{fontSize:12,lineHeight:18,color:COLOR.secondary,marginTop:4},
 smallPill:{backgroundColor:COLOR.primarySoft,borderRadius:8,paddingHorizontal:9,paddingVertical:7},
 smallPillText:{fontSize:11,color:COLOR.primary,fontWeight:"600"},
 filters:{flexDirection:"row",flexWrap:"wrap",gap:7},
 filter:{minHeight:ui.minTap,borderWidth:1,borderColor:COLOR.border,backgroundColor:COLOR.surface,paddingHorizontal:13,paddingVertical:10,borderRadius:ui.radius.control,justifyContent:"center"},
 filterActive:{backgroundColor:COLOR.primary,borderColor:COLOR.primary},
 filterText:{fontSize:12,fontWeight:"600",color:COLOR.secondary},filterTextActive:{color:COLOR.white},
 record:{minHeight:74,flexDirection:"row",gap:11,alignItems:"center",borderBottomWidth:1,borderColor:COLOR.border,paddingVertical:10},
 recordSelected:{backgroundColor:COLOR.primarySoft,borderRadius:8,paddingHorizontal:6},
 recordIcon:{width:40,height:40,borderRadius:ui.radius.control,alignItems:"center",justifyContent:"center",backgroundColor:COLOR.primarySoft},
 recordCopy:{flex:1,minWidth:0,gap:4},recordTitle:{fontSize:13,fontWeight:"700",color:COLOR.text,lineHeight:20},
 recordSub:{fontSize:12,color:COLOR.secondary,lineHeight:18},
 recordRight:{gap:8,alignItems:"flex-end",flexDirection:"row"},
 status:{fontSize:11,fontWeight:"600",color:COLOR.primary,backgroundColor:COLOR.primarySoft,padding:7,borderRadius:7,overflow:"hidden"},
 pagination:{flexDirection:"row",justifyContent:"flex-end",gap:8,alignItems:"center",flexWrap:"wrap"},
 pageText:{fontSize:12,color:COLOR.secondary,marginRight:"auto"},
 action:{minHeight:ui.minTap,backgroundColor:COLOR.primary,paddingHorizontal:15,paddingVertical:10,borderRadius:ui.radius.control,alignItems:"center",justifyContent:"center"},
 actionText:{fontSize:13,lineHeight:19,fontWeight:"700",color:COLOR.white,textAlign:"center"},
 secondaryAction:{backgroundColor:COLOR.primarySoft,borderWidth:1,borderColor:COLOR.border},
 secondaryActionText:{color:COLOR.primary},
 disabled:{opacity:.45},pressed:{opacity:.78},
 empty:{minHeight:130,gap:12,alignItems:"center",justifyContent:"center"},
 emptyText:{fontSize:13,color:COLOR.secondary},
 selectedBox:{gap:7,padding:14,borderRadius:ui.radius.control,backgroundColor:COLOR.primarySoft},
 selectedEyebrow:{fontSize:10,fontWeight:"700",color:COLOR.primary,letterSpacing:.5},
 field:{gap:7},fieldLabel:{fontSize:ui.type.label.fontSize,fontWeight:"600",color:COLOR.text},
 fieldValue:{minHeight:ui.minTap,padding:12,borderWidth:1,borderColor:COLOR.border,backgroundColor:COLOR.mutedSurface,borderRadius:ui.radius.control,justifyContent:"center"},
 fieldValueText:{fontSize:13,lineHeight:20,color:COLOR.secondary},
 notice:{flexDirection:"row",gap:9,alignItems:"flex-start",backgroundColor:COLOR.primarySoft,padding:13,borderRadius:ui.radius.control},
 noticeText:{flex:1,fontSize:12,lineHeight:19,color:COLOR.text},
 safety:{borderWidth:1,borderColor:COLOR.border,borderRadius:ui.radius.card,backgroundColor:COLOR.primarySoft,padding:17,flexDirection:"row",alignItems:"flex-start",gap:12},
 safetyTitle:{fontSize:13,fontWeight:"700",color:COLOR.primary},
 safetyDesc:{fontSize:12,lineHeight:18,color:COLOR.secondary,marginTop:4},
 footer:{fontSize:11,color:COLOR.secondary,marginTop:4},
});
