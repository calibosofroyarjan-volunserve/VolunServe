// QA-ONLY local visual fixture. Fictional data. No Auth, Firestore, or production writes.
// Do not merge this route or its named component exports into the application.
import React from "react";
import { ScrollView, View, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  MockQueueRow, MockStatusTab, RequestReviewHeader, ReviewTabButton,
  CaseReviewTab, DecisionTab, createPrivateReviewDraft
} from "../(admin)/assistance-requests";

const noop = () => {};
const dateValue = (date:string) => ({ toDate: () => new Date(date) });
const hospital:any = {
  id:"case-2026-0199",requestId:"WwPGeoVLw4eumKMB0igk",
  title:"Hospital Bills",requesterUid:"fixture-resident-01",
  requesterName:"Caliboso, Marilyn",contactNumber:"+639123452123",
  requesterBarangay:"Minuyan",requesterAddress:"Narra, City of San Jose del Monte, Bulacan",
  category:"medical_health",categoryLabel:"Medical / Health",
  estimatedAmount:45000,status:"under_review",verificationStatus:"under_review",
  currentSituation:"Currently confined and receiving medical care",
  description:"Let's come together to help Marilyn with her hospital bills and ongoing medical care.",
  documents:[{label:"Medical certificate"},{label:"Hospital bill"}],
  createdAt:dateValue("2026-11-20T03:01:00+08:00")
};
const rows:any[] = [
  {...hospital,id:"case-hospital",status:"verified",verificationStatus:"verified",supportDecision:"pending"},
  {...hospital,id:"case-home",requestId:"CASE-2026-0199",title:"Home Repair Support",requesterName:"Ramon Cruz",
    category:"disaster_recovery",categoryLabel:"Housing",estimatedAmount:30000,
    status:"verified",supportDecision:"internal_support",createdAt:dateValue("2026-10-28T10:14:00+08:00")},
  {...hospital,id:"case-school",requestId:"CASE-2026-0169",title:"Educational Assistance",
    category:"other_community_assistance",categoryLabel:"Education",requesterName:"Liza Dela Cruz",
    estimatedAmount:15000,status:"pending",createdAt:dateValue("2026-10-26T16:42:00+08:00")},
  {...hospital,id:"case-food",title:"Food Support",requestId:"CASE-2026-0104",
    category:"elderly_assistance",categoryLabel:"Food",requesterName:"Joel Reyes",
    estimatedAmount:5000,status:"pending",createdAt:dateValue("2026-10-24T11:02:00+08:00")},
  {...hospital,id:"case-disaster",title:"Disaster Relief Support",requestId:"CASE-2026-0143",
    category:"disaster_recovery",categoryLabel:"Disaster Relief",requesterName:"Anna Villanueva",
    estimatedAmount:20000,status:"assistance_provided",createdAt:dateValue("2026-10-20T09:25:00+08:00")}
];
const draft = createPrivateReviewDraft(hospital,{
  documentConsistencyStatus:"consistent",duplicateCheckStatus:"clear",
  beneficiaryCheckStatus:"confirmed",residencyVerificationStatus:"verified",
  residencyVerificationMethod:"profile_address",
  facilityVerificationRequired:true,facilityVerificationStatus:"confirmed",
  facilityName:"Sample Medical Center",facilityVerificationMethod:"official_record",
  costVerificationRequired:true,costVerificationStatus:"confirmed",verifiedGrossCost:45000,
  confirmedExistingAssistanceAmount:0,verifiedUncoveredAmount:45000,
  riskFlags:[]
});
const approved:any = {...hospital,id:"case-approved",status:"verified",verificationStatus:"verified",supportDecision:"donation_support",remainingAmount:45000};
const record:any = { verifiedUncoveredAmount:45000 };

function Topbar() {
  return <View style={{height:53,backgroundColor:"#FFFFFF",borderBottomWidth:1,borderBottomColor:"#E1E9E9",
    flexDirection:"row",alignItems:"center",justifyContent:"flex-end",paddingHorizontal:24,gap:10}}>
    <View style={{width:31,height:31,borderRadius:16,backgroundColor:"#07874B",alignItems:"center",justifyContent:"center"}}>
      <Text style={{color:"#FFFFFF",fontWeight:"900",fontSize:10}}>DB</Text>
    </View>
    <View style={{gap:1}}>
      <Text style={{fontWeight:"800",fontSize:11,color:"#0F172A"}}>Devin Booker</Text>
      <Text style={{fontSize:9,color:"#475569"}}>LGU Admin · My Profile</Text>
    </View>
    <Ionicons name="chevron-forward" size={13} color="#475569"/>
  </View>;
}
function Sidebar() {
  const nav=[
    ["grid-outline","Command Center"],["people-outline","People & Verification"],
    ["alert-circle-outline","Emergency & Assistance"],["warning-outline","Emergency Reports"],
    ["hand-left-outline","Assistance Requests"],["calendar-outline","Events & Volunteering"],
    ["heart-outline","Donations & Funds"],["megaphone-outline","Announcements"]
  ] as const;
  return <View style={{width:216,backgroundColor:"#005238",paddingVertical:15,paddingHorizontal:14}}>
    <View style={{flexDirection:"row",alignItems:"center",gap:9,marginBottom:27}}>
      <Image source={require("../../assets/images/logo.png")} style={{width:34,height:34,borderRadius:18}}/>
      <View><Text style={{fontSize:15,color:"#FFFFFF",fontWeight:"900"}}>VolunServe</Text>
      <Text style={{fontSize:9,color:"#E0F7E7",fontWeight:"700"}}>LGU ADMINISTRATION</Text></View>
    </View>
    <Text style={{fontSize:10,color:"#CEE3D9",marginBottom:15,fontWeight:"800"}}>LGU WORKSPACE</Text>
    {nav.map(([icon,label],i)=><View key={label}
      style={{backgroundColor:i===4?"#138A5D":"transparent",paddingVertical:10,paddingHorizontal:9,
        borderRadius:7,flexDirection:"row",alignItems:"center",gap:9}}>
      <Ionicons name={icon} color="#EBFFF3" size={16}/>
      <Text style={{fontSize:11,color:"#F2FFF8",fontWeight:i===4?"800":"600",flex:1}}>{label}</Text>
    </View>)}
    <View style={{flex:1}}/>
    <View style={{height:1,backgroundColor:"#3B8E71",marginBottom:14}}/>
    <Text style={{color:"#FFFFFF",fontSize:11,paddingVertical:10}}>◉  My Profile</Text>
    <Text style={{color:"#FFE8E8",fontSize:11,paddingVertical:7}}>↪  Log Out</Text>
  </View>;
}
function Frame({children}: {children:React.ReactNode}) {
  return <View style={{width:960,height:630,margin:14,flexDirection:"row",borderRadius:13,overflow:"hidden",
    backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#86D8B0",
    shadowColor:"#004C32",shadowOpacity:0.15,shadowRadius:12,shadowOffset:{width:0,height:7}}}>
    <Sidebar/><View style={{flex:1,minWidth:0,backgroundColor:"#FFFFFF"}}>
      <Topbar/><ScrollView style={{flex:1}} contentContainerStyle={{padding:15,paddingBottom:24}}>
        {children}
      </ScrollView>
    </View>
  </View>;
}
function Tabs({active="case"}:{active?:"case"|"decision"}) {
  return <View style={{flexDirection:"row",gap:7,flexWrap:"wrap",marginTop:12,marginBottom:14,
    borderWidth:1,borderColor:"#E2E8F0",borderRadius:8,padding:6}}>
    <ReviewTabButton label="Request Details" icon="document-text-outline" active={active==="case"} onPress={noop}/>
    <ReviewTabButton label="Documents (2)" icon="images-outline" active={false} onPress={noop}/>
    <ReviewTabButton label="Resident Info" icon="person-outline" active={false} onPress={noop}/>
    <ReviewTabButton label="Review & Decision" icon="shield-checkmark-outline" active={active==="decision"} onPress={noop}/>
  </View>;
}
function Back() {
  return <View style={{flexDirection:"row",alignItems:"center",gap:7,marginBottom:10}}>
    <Ionicons name="arrow-back" color="#1D4ED8" size={16}/>
    <Text style={{color:"#1D4ED8",fontSize:12,fontWeight:"800"}}>Back to Assistance Requests</Text>
  </View>;
}
function SectionTitle({label,description,icon}: {label:string;description?:string;icon:any}){
  return <View style={{flexDirection:"row",alignItems:"center",gap:12,marginBottom:12}}>
    <Ionicons name={icon} size={27} color="#007F42"/>
    <View style={{flex:1,gap:4}}>
      <Text style={{fontSize:23,fontWeight:"900",color:"#101827"}}>{label}</Text>
      {description&&<Text style={{fontSize:12,color:"#64748B"}}>{description}</Text>}
    </View>
  </View>;
}
const reviewProps:any={
  reviewDraft:draft,reviewRecord:record,reviewLoading:false,
  residentIdentityVerified:true,adminNote:"",setAdminNote:noop,
  rejectionReason:"",setRejectionReason:noop,
  supportDecision:"pending",setSupportDecision:noop,
  remainingAmount:"45000",setRemainingAmount:noop,
  locationType:"lgu_office",setLocationType:noop,
  locationName:"Social Welfare Office",setLocationName:noop,
  locationAddress:"City Hall, San Jose del Monte, Bulacan",setLocationAddress:noop,
  locationNotes:"",setLocationNotes:noop,savingAction:"",
  onReviewChange:noop,allChecksComplete:true,
  onSaveVerificationDraft:noop,onStartReview:noop,
  onRequestMoreInfo:noop,onVerify:noop,onReject:noop,
  onSaveResourceAssessment:noop,onMarkAssistanceProvided:noop,
  onSaveLocation:noop,onClearLocation:noop,onContinueDonation:noop,
  donationSubmitting:false
};
export default function AssistanceVisualQaOnly(){
  return <ScrollView style={{flex:1,backgroundColor:"#EAF8F0"}}>
    <View style={{alignItems:"center",paddingTop:10,paddingBottom:18}}>
      <Text style={{color:"#0F513A",fontWeight:"800",fontSize:13}}>
        QA VISUAL FIXTURE · Fictional data · No production login or writes · NOT a live release
      </Text>
      <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",maxWidth:2040}}>
        <Frame>
          <SectionTitle label="Assistance Requests" description="Review resident requests for support." icon="clipboard-outline"/>
          <View style={{flexDirection:"row",gap:7,marginBottom:12,flexWrap:"wrap"}}>
            <MockStatusTab label="All Requests" count={23} active={true} onPress={noop}/>
            <MockStatusTab label="For Review" count={8} active={false} onPress={noop}/>
            <MockStatusTab label="Approved" count={6} active={false} onPress={noop}/>
            <MockStatusTab label="Rejected" count={2} active={false} onPress={noop}/>
            <MockStatusTab label="Completed" count={7} active={false} onPress={noop}/>
          </View>
          <View style={{flexDirection:"row",gap:10,marginBottom:13}}>
            <View style={{flex:1,borderWidth:1,borderColor:"#D5E3E0",borderRadius:8,padding:11,flexDirection:"row",gap:8}}>
              <Ionicons name="search-outline" size={16} color="#64748B"/>
              <Text style={{color:"#64748B",fontSize:11}}>Search request, resident, or category...</Text>
            </View>
            <View style={{borderWidth:1,borderColor:"#D5E3E0",borderRadius:8,padding:10,flexDirection:"row",gap:5}}>
              <Ionicons name="filter-outline" color="#047857" size={16}/>
              <Text style={{color:"#047857",fontWeight:"800",fontSize:11}}>Filter</Text>
            </View>
          </View>
          <View style={{flexDirection:"row",backgroundColor:"#F1F7F4",paddingHorizontal:15,paddingVertical:13,gap:11}}>
            {([["REQUEST CASE",3],["RESIDENT",2],["CATEGORY",1.6],["REQUESTED AMOUNT",1.2],["STATUS",1.2],["SUBMITTED",1.2]] as const)
              .map(([label,flex])=><Text key={label} style={{flex,minWidth:0,color:"#49665B",fontSize:9,fontWeight:"800"}}>{label}</Text>)}
          </View>
          {rows.map(row=><MockQueueRow key={row.id} request={row} onPress={noop}/>)}
          <Text style={{fontSize:10,color:"#64748B",padding:12}}>1–5 of 23 requests · 5 per page</Text>
        </Frame>
        <Frame>
          <Back/><RequestReviewHeader request={hospital}/><Tabs/>
          <CaseReviewTab request={hospital} relatedRequestCount={0} sameBeneficiaryCount={0}
            residentIdentityVerified={true}/>
        </Frame>
        <Frame>
          <Back/><RequestReviewHeader request={hospital}/><Tabs active="decision"/>
          <DecisionTab {...reviewProps} request={hospital}/>
        </Frame>
        <Frame>
          <Back/><RequestReviewHeader request={approved} showApprovedBadge={true}/>
          <SectionTitle label="Choose Assistance"
            description="This request has been approved. Choose how to provide the support."
            icon="layers-outline"/>
          <DecisionTab {...reviewProps} request={approved} supportDecision="donation_support"/>
        </Frame>
      </View>
    </View>
  </ScrollView>;
}
