import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { auth } from "../../lib/firebase";
import SandboxPayoutForm from "./SandboxPayoutForm";
import type { ReconciliationCampaign } from "./FundReconciliationPanel";

const ROOT = "https://volunserve.onrender.com/api/admin/donations/fund-releases";
type Release = {
  id: string; campaignId: string; campaignTitle: string; recipientUid: string;
  status: string; amount: number; eligibleTestAmount: number; approvedGoal: number;
  reviewerUid: string; authorizerUid?: string; method?: string;
  walletLast4?: string; simulationReference?: string; reviewNote?: string;
  decisionReason?: string; acknowledgmentNote?: string;
  releaseProcessor?: string; deliveryStatus?: string;
  assistanceRequestId?: string;
  reviewedAt?: string; authorizedAt?: string; simulatedAt?: string;
  acknowledgedAt?: string; audit?: {stage:string;actorUid:string;at?:string}[];
};
const php = (n: number) => "₱" + Number(n||0).toLocaleString("en-PH",{
  minimumFractionDigits:2, maximumFractionDigits:2,
});
const showStatus = (s:string) => ({
  reviewed:"Awaiting LGU Admin decision",
  authorized:"Approved · Ready to prepare release",
  rejected:"Review rejected",
  simulated_sent:"Test release recorded · Awaiting Resident",
  acknowledged_demo:"Resident confirmed release record",
  disputed:"Resident raised an issue",
}[s] || s);
type FundingSummary = {
  campaignId:string;approvedGoal:number;recordedFunding:number;
  providerVerifiedTestAmount:number;manualLegacyAmount:number;eligibleAmount:number;
  providerVerifiedCount:number;pendingCount:number;otherCount:number;
  ready:boolean;reason:string;
};
const statusDetail = (reason:string) => ({
  ready:"Goal funded by verified PayMongo test payments.",
  manual_records_only:"This campaign has manual/legacy donations, not webhook-confirmed PayMongo test payments.",
  no_verified_provider_payment:"No webhook-confirmed PayMongo test payments are linked to this campaign.",
  provider_payments_below_goal:"Verified test payments have not yet reached this campaign's approved goal.",
  recorded_funding_below_goal:"Recorded campaign funding is below the approved goal. Reconcile payment records.",
  assistance_link_not_verified:"The linked Assistance Request does not match the verified LGU records.",
  requester_identity_not_verified:"The requesting Resident must complete identity verification.",
  approved_goal_missing:"An approved funding goal is required.",
}[reason] || "Reconciliation requires LGU review.");

export default function FundReleaseControls({campaigns,ready}:{
  campaigns:ReconciliationCampaign[];
  ready:boolean;
}) {
  const [rows,setRows] = useState<Release[]>([]);
  const [funding,setFunding] = useState<FundingSummary[]>([]);
  const [fundingLoaded,setFundingLoaded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [selectedId,setSelectedId] = useState("");
  const [inputAmount,setInputAmount] = useState("");
  const [reviewNote,setReviewNote] = useState("");
  const [decisionNote,setDecisionNote] = useState("");
  const eligibleCampaigns = useMemo(()=>campaigns.filter(c =>
    !!c.sourceAssistanceRequestId && Number(c.monetaryGoal||0)>0)
    .sort((a,b)=>
      Number(!!funding.find(x=>x.campaignId===b.id)?.ready)-
      Number(!!funding.find(x=>x.campaignId===a.id)?.ready)),
    [campaigns,funding]);
  const selection = eligibleCampaigns.find(c=>c.id===selectedId) || null;
  const record = rows.find(a=>a.campaignId===selectedId) || null;
  const activeFunding = funding.find(x=>x.campaignId===selectedId) || null;
  // UI cannot authorize releases from client-computed totals.
  const maxReview = fundingLoaded && activeFunding?.ready
    ? activeFunding.approvedGoal : 0;
  const request = useCallback(async(path:string,body?:Record<string,unknown>)=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error("Please sign in again.");
    const response=await fetch(ROOT+path,{
      method:body?"POST":"GET",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data?.ok)throw new Error(
      response.status===404?"Fund release backend endpoint is not deployed yet.":
      data?.message||"Unable to process the fund release request.");
    return data;
  },[]);
  const reload = useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const data=await request("");
      setRows(Array.isArray(data.releases)?data.releases:[]);
      if(!Array.isArray(data.funding))throw new Error(
        "Render is running the old reconciliation API. Update the backend before reviewing funds.");
      setFunding(data.funding);
      setFundingLoaded(true);
    } catch (e:any) {
      setFundingLoaded(false);
      setFunding([]);
      setRows([]);
      setError(e?.message||"Unable to load fund records.");
    }
    finally {setLoading(false);}
  },[request]);
  useEffect(()=>{if(ready)void reload();},[ready,reload]);
  // Keep payment operations status fresh without modifying any transaction records.
  useEffect(()=>{
    if(!ready||busy)return;
    const timer=setInterval(()=>{void reload();},60_000);
    return ()=>clearInterval(timer);
  },[ready,busy,reload]);
  useEffect(()=>{
    if(!fundingLoaded||!eligibleCampaigns.length)return;
    if(selectedId&&eligibleCampaigns.some(c=>c.id===selectedId))return;
    // Choose a truly eligible campaign before an older same-title legacy record.
    setSelectedId(eligibleCampaigns[0].id);
  },[eligibleCampaigns,fundingLoaded,selectedId]);
  useEffect(()=>{
    setInputAmount(String((maxReview>0?maxReview:0).toFixed(2)));
  },[selectedId,maxReview]);
  const action=async(path:string,body:Record<string,unknown>,success:string)=>{
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try {
      await request(path,body);
      setNotice(success);
      await reload();
    }catch(e:any){setError(e?.message||"Unable to save this action.");}
    finally{setBusy(false);}
  };
  const counters = useMemo(()=>({
    pending:rows.filter(r=>r.status==="reviewed").length,
    approved:rows.filter(r=>r.status==="authorized").length,
    awaiting:rows.filter(r=>r.status==="simulated_sent").length,
    resolved:rows.filter(r=>["acknowledged_demo","disputed","rejected"].includes(r.status)).length,
  }),[rows]);
  const stageNames=["Donations verified","LGU review","Release authorized","Test release recorded","Resident response"];
  const stageReached=(status:string,index:number)=>{
    if(index===0)return true;
    if(status==="rejected")return index===1;
    const target=({
      reviewed:1,authorized:2,simulated_sent:3,
      acknowledged_demo:4,disputed:4,
    } as Record<string,number>)[status]??0;
    return index<=target;
  };
  const pick=(id:string)=>{
    setSelectedId(id);
    const summary=funding.find(x=>x.campaignId===id);
    setInputAmount(String((summary?.ready?summary.approvedGoal:0).toFixed(2)));
    setError("");setNotice("");
  };
  return <View style={ss.panel}>
    <View style={ss.top}>
      <View style={ss.flex}>
        <Text style={ss.head}>Payment operations · Assistance releases</Text>
        <Text style={ss.muted}>
          Monitor verified campaign funding, authorize resident assistance, and track every release decision.
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>void reload()}
        style={ss.subtle} disabled={busy||loading}>
        {loading?<ActivityIndicator size="small" color="#087A60"/>:
          <Ionicons name="refresh-outline" size={17} color="#087A60"/>}
        <Text style={ss.subtleText}>Refresh</Text>
      </Pressable>
    </View>
    <View style={ss.top}>
      <View style={ss.noticeTag}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#16745C"/>
        <Text style={ss.noticeTagText}>TEST MODE · No actual wallet transfer</Text>
      </View>
      <Text style={ss.muted}>Auto-refresh every 60 seconds · LGU Admin only</Text>
    </View>
    <View style={ss.metricGrid}>
      {([
        {label:"Awaiting approval",count:counters.pending,color:"#EAF6F1"},
        {label:"Approved",count:counters.approved,color:"#EAF6F1"},
        {label:"Awaiting Resident",count:counters.awaiting,color:"#EDF7F5"},
        {label:"Closed / Issues",count:counters.resolved,color:"#F3F7F4"},
      ]).map(item=><View key={item.label} style={[ss.metric,{backgroundColor:item.color}]}>
        <Text style={ss.metricValue}>{fundingLoaded?item.count:"—"}</Text>
        <Text style={ss.metricLabel}>{item.label}</Text>
      </View>)}
    </View>
    {!!error&&<Text style={ss.error}>{error}</Text>}
    {!!notice&&<Text style={ss.success}>{notice}</Text>}
    {!eligibleCampaigns.length?<Text style={ss.muted}>
      No campaigns linked to verified Resident assistance with an approved funding goal.
    </Text>:
    <View style={ss.layout}>
      <View style={ss.list}>
        {eligibleCampaigns.map(c=>{
          const existing=rows.find(x=>x.campaignId===c.id);
          const check=funding.find(x=>x.campaignId===c.id);
          return <Pressable key={c.id} onPress={()=>pick(c.id)}
            accessibilityRole="button" accessibilityState={{selected:selectedId===c.id}}
            style={[ss.campaign,selectedId===c.id&&ss.campaignActive]}>
            <View style={ss.flex}>
              <Text style={ss.campaignTitle}>{c.title||"Donation campaign"}</Text>
              <Text style={ss.muted}>Campaign {c.id.slice(0,8)} · {existing ?
                showStatus(existing.status) : !fundingLoaded ? "Checking payments…" :
                check?.ready ? "Eligible for LGU review" : "Not yet eligible"}</Text>
              <Text style={ss.small}>{existing ? "Review amount: "+php(existing.amount) :
                "Verified donor payments: "+php(check?.providerVerifiedTestAmount||0)+
                " · Manual/legacy: "+php(check?.manualLegacyAmount||0)}</Text>
              {!!check&&!check.ready&&<Text style={ss.muted}>{statusDetail(check.reason)}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={17} color="#477C71"/>
          </Pressable>;
        })}
      </View>
      <View style={ss.details}>
        {!selection?<View style={ss.empty}>
          <Ionicons name="document-text-outline" size={30} color="#6CA895"/>
          <Text style={ss.emptyText}>Select a campaign to manage its release record.</Text>
        </View>:<>
          <Text style={ss.campaignTitle}>{selection.title}</Text>
          <Text style={ss.muted}>Campaign ID: {selection.id}</Text>
          <Text style={ss.small}>Approved goal: {php(Number(selection.monetaryGoal||0))}</Text>
          <Text style={ss.small}>Recorded campaign funding: {php(activeFunding?.recordedFunding||0)}</Text>
          <Text style={ss.small}>PayMongo-confirmed donor payments (TEST): {php(activeFunding?.providerVerifiedTestAmount||0)} ({activeFunding?.providerVerifiedCount||0} transactions)</Text>
          <Text style={ss.small}>Manual/legacy contributions: {php(activeFunding?.manualLegacyAmount||0)}</Text>
          {!!activeFunding&&!activeFunding.ready&&<View style={ss.notice}>
            <Ionicons name="information-circle-outline" size={17} color="#16745C"/>
            <Text style={ss.noticeText}>{statusDetail(activeFunding.reason)}</Text>
          </View>}
          {record&&<View style={ss.stepStrip}>
            {stageNames.map((label,index)=><View key={label}
              style={[ss.stepTile,stageReached(record.status,index)&&ss.stepTileReached]}>
              <Ionicons name={stageReached(record.status,index)?"checkmark-circle":"ellipse-outline"}
                color={stageReached(record.status,index)?"#0C896B":"#91AAA0"} size={15}/>
              <Text style={ss.stepText}>{label}</Text>
            </View>)}
          </View>}
          {record?<View style={ss.infoBlock}>
            <Text style={ss.statusText}>{showStatus(record.status)}</Text>
            <Text style={ss.small}>Reviewed amount: {php(record.amount)}</Text>
            <Text style={ss.small}>Beneficiary: linked, identity-verified requesting Resident</Text>
            <Text style={ss.small}>Processing authority: LGU Admin{record.authorizerUid?" · Approval recorded":""}</Text>
            {!!record.reviewedAt&&<Text style={ss.small}>Review filed: {new Date(record.reviewedAt).toLocaleString()}</Text>}
            {!!record.authorizedAt&&<Text style={ss.small}>Approval date: {new Date(record.authorizedAt).toLocaleString()}</Text>
            {!!record.method&&<Text style={ss.small}>
              Destination: {record.method.toUpperCase()} (TEST) ·•••• {record.walletLast4}
            </Text>}
            {!!record.method&&<Text style={ss.small}>
              Processing: VolunServe internal TEST ledger · No external wallet transfer
            </Text>}
            {!!record.simulationReference&&<Text style={ss.small}>
              Test transaction reference: {record.simulationReference}
            </Text>}
            {!!record.acknowledgmentNote&&<Text style={ss.small}>
              Resident response: {record.acknowledgmentNote}
            </Text>}
            {!!record.simulatedAt&&<Text style={ss.small}>Release entry recorded: {new Date(record.simulatedAt).toLocaleString()}</Text>}
            {record.status==="simulated_sent"&&<Text style={ss.noticeText}>
              Waiting for the verified Resident to review the release notice under Donations.
            </Text>}
            {record.status==="disputed"&&<Text style={ss.error}>
              Resident reported an issue. LGU follow-up is required; do not treat this release as resolved.
            </Text>}
            <Text style={ss.muted}>Audit trail and statuses are loaded from the secured LGU backend.</Text>
          </View>:<Text style={ss.muted}>
            No review recorded for this campaign yet. The system will validate amounts and the verified requester's account.
          </Text>}
          {!record&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>Review amount (PHP)</Text>
            <TextInput accessibilityLabel="Fund review amount" keyboardType="decimal-pad"
              style={ss.input} value={inputAmount} onChangeText={setInputAmount}
              placeholder="0.00"/>
            <Text style={ss.small}>{!fundingLoaded
              ? "Backend reconciliation unavailable. Refresh after deploying Render."
              : maxReview>0 ? "Eligible verified test amount: "+php(maxReview)
              : activeFunding ? statusDetail(activeFunding.reason) :
                "Select a campaign to check its verified funding."}</Text>
            <Text style={ss.fieldLabel}>Evidence review notes</Text>
            <TextInput accessibilityLabel="Evidence review notes" multiline
              style={[ss.input,ss.textarea]} value={reviewNote} onChangeText={setReviewNote}
              placeholder="Describe the confirmed donation receipts and verified assistance evidence."/>
            <Pressable accessibilityRole="button" disabled={busy||!fundingLoaded||maxReview<=0}
              style={[ss.primary,(busy||!fundingLoaded||maxReview<=0)&&ss.disabled]}
              onPress={()=>void action("/review",{
                campaignId:selection.id,amount:Number(inputAmount),reviewNote,
              },"Fund review saved. Review the evidence and record your Admin decision.")}>
              <Ionicons name="shield-checkmark-outline" color="#FFFFFF" size={17}/>
              <Text style={ss.primaryText}>Submit fund review</Text>
            </Pressable>
          </View>}
          {record?.status==="reviewed"&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>LGU Admin release decision</Text>
            <Text style={ss.muted}>Review the verified funding and submit an explicit decision. Each action is saved in the audit history.</Text>
              <TextInput style={[ss.input,ss.textarea]}
                accessibilityLabel="Decision note" multiline
                placeholder="Enter the reason for your decision (at least 10 characters)" value={decisionNote}
                onChangeText={setDecisionNote}/>
              <View style={ss.actionRow}>
                <Pressable style={[ss.primary,(busy||decisionNote.trim().length<10)&&ss.disabled]}
                  disabled={busy||decisionNote.trim().length<10}
                  accessibilityRole="button" onPress={()=>void action(
                    "/"+selection.id+"/authorize",{decision:"approve",reason:decisionNote},
                    "Release authorized for test processing.")}>
                  <Text style={ss.primaryText}>Authorize release</Text>
                </Pressable>
                <Pressable style={[ss.secondary,(busy||decisionNote.trim().length<10)&&ss.disabled]}
                  disabled={busy||decisionNote.trim().length<10}
                  accessibilityRole="button" onPress={()=>void action(
                    "/"+selection.id+"/authorize",{decision:"reject",reason:decisionNote},
                    "Review rejected.")}>
                  <Text style={ss.secondaryText}>Reject</Text>
                </Pressable>
              </View>

          </View>}
          {record?.status==="authorized"&&<SandboxPayoutForm key={selection.id}
            amount={record.amount} disabled={busy}
            onSubmit={details=>action("/"+selection.id+"/simulate",details,
              "TEST release recorded. The verified requesting Resident has a release notice to review.")}/>}
          {!!record?.audit?.length&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>Transaction and approval history</Text>
            {record.audit.map((row,i)=><Text key={i} style={ss.small}>
              {i+1}. {showStatus(row.stage)} · {row.at ? new Date(row.at).toLocaleString() : "Recorded"}
            </Text>)}
          </View>}
        </>}
      </View>
    </View>}
  </View>;
}

const ss=StyleSheet.create({
  panel:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCEAE4",borderRadius:14,padding:18,gap:13},
  top:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:11,flexWrap:"wrap"},
  flex:{flex:1,minWidth:0},
  head:{fontFamily:"FundInterBold",fontSize:16,color:"#24454E"},
  noticeTag:{flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:10,paddingVertical:7,
    borderRadius:8,backgroundColor:"#EAF8F0",borderWidth:1,borderColor:"#CEE9DD"},
  noticeTagText:{fontFamily:"FundInterSemiBold",fontSize:10,color:"#1C7C62"},
  metricGrid:{flexDirection:"row",flexWrap:"wrap",gap:9},
  metric:{flexGrow:1,flexBasis:130,minWidth:115,borderWidth:1,borderColor:"#E4EEE8",
    borderRadius:10,padding:12,gap:4},
  metricValue:{fontFamily:"FundInterBold",fontSize:20,color:"#155B4C"},
  metricLabel:{fontFamily:"FundInterMedium",fontSize:10.5,color:"#648B7B"},
  stepStrip:{flexDirection:"row",gap:5,flexWrap:"wrap",paddingVertical:3},
  stepTile:{flexGrow:1,flexBasis:100,backgroundColor:"#F6F8F6",borderRadius:8,
    padding:7,flexDirection:"row",gap:5,alignItems:"center"},
  stepTileReached:{backgroundColor:"#E7F7EC"},
  stepText:{flex:1,fontFamily:"FundInterMedium",fontSize:9.2,color:"#477569"},
  muted:{fontFamily:"FundInterRegular",fontSize:11,color:"#789388",lineHeight:17,marginTop:3},
  small:{fontFamily:"FundInterRegular",fontSize:11,color:"#4E7468",lineHeight:19},
  subtle:{flexDirection:"row",gap:6,alignItems:"center",padding:9,borderRadius:9,
    backgroundColor:"#F2FAF6",borderWidth:1,borderColor:"#D8EBE1"},
  subtleText:{fontFamily:"FundInterSemiBold",color:"#0A785C",fontSize:11},
  notice:{flexDirection:"row",gap:8,backgroundColor:"#F0F9F4",padding:11,borderRadius:9},
  noticeText:{flex:1,color:"#53766D",fontFamily:"FundInterRegular",fontSize:10.5,lineHeight:17},
  error:{color:"#9A3928",backgroundColor:"#FFF0E8",padding:11,borderRadius:8,fontSize:11},
  success:{color:"#0A6F52",backgroundColor:"#EAF9F0",padding:11,borderRadius:8,fontSize:11},
  layout:{flexDirection:"row",flexWrap:"wrap",gap:13,alignItems:"flex-start"},
  list:{flexGrow:1,flexBasis:275,minWidth:240,gap:7},
  details:{flexGrow:2,flexBasis:320,minWidth:255,padding:13,borderWidth:1,
    borderColor:"#E7EEE8",borderRadius:10,gap:9,backgroundColor:"#FFFFFF"},
  campaign:{flexDirection:"row",gap:10,alignItems:"center",padding:11,
    borderWidth:1,borderColor:"#E3EDE8",borderRadius:9},
  campaignActive:{borderColor:"#43A887",backgroundColor:"#F2FBF6"},
  campaignTitle:{fontFamily:"FundInterSemiBold",fontSize:12,color:"#234650"},
  empty:{gap:10,alignItems:"center",padding:30},
  emptyText:{color:"#719084",fontFamily:"FundInterRegular",fontSize:11,textAlign:"center"},
  infoBlock:{backgroundColor:"#F6FAF7",borderRadius:9,padding:12,gap:3},
  statusText:{fontFamily:"FundInterSemiBold",color:"#0A886A",fontSize:12},
  actionBlock:{paddingTop:10,borderTopWidth:1,borderTopColor:"#E9EFEB",gap:8},
  fieldLabel:{fontFamily:"FundInterSemiBold",fontSize:11,color:"#315B55"},
  input:{borderWidth:1,borderColor:"#D9E7E0",borderRadius:8,padding:10,
    color:"#284C47",fontFamily:"FundInterRegular",fontSize:12},
  textarea:{minHeight:65,textAlignVertical:"top"},
  actionRow:{flexDirection:"row",flexWrap:"wrap",gap:8},
  primary:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,
    backgroundColor:"#08795C",padding:12,borderRadius:9,alignSelf:"flex-start"},
  disabled:{opacity:0.45},
  primaryText:{fontFamily:"FundInterSemiBold",fontSize:11,color:"#FFFFFF"},
  secondary:{padding:11,borderWidth:1,borderColor:"#CDE4D8",borderRadius:9},
  secondaryText:{fontFamily:"FundInterSemiBold",fontSize:11,color:"#0D7860"},
  picked:{backgroundColor:"#E5F8ED",borderColor:"#4EAC88"},
});
