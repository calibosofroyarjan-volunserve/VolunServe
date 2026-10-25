import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { auth } from "../../lib/firebase";
import type { ReconciliationCampaign, ReconciliationDonation } from "./FundReconciliationPanel";

const ROOT = "https://volunserve.onrender.com/api/admin/donations/fund-releases";
type Release = {
  id: string; campaignId: string; campaignTitle: string; recipientUid: string;
  status: string; amount: number; eligibleTestAmount: number; approvedGoal: number;
  reviewerUid: string; authorizerUid?: string; method?: string;
  walletLast4?: string; simulationReference?: string; reviewNote?: string;
  decisionReason?: string; acknowledgmentNote?: string;
  reviewedAt?: string; authorizedAt?: string; simulatedAt?: string;
  acknowledgedAt?: string; audit?: {stage:string;actorUid:string;at?:string}[];
};
const php = (n: number) => "₱" + Number(n||0).toLocaleString("en-PH",{
  minimumFractionDigits:2, maximumFractionDigits:2,
});
const showStatus = (s:string) => ({
  reviewed:"Awaiting independent approval",
  authorized:"Authorized · Ready for demo release",
  rejected:"Rejected",
  simulated_sent:"Demo release recorded · Awaiting Resident",
  acknowledged_demo:"Resident acknowledged demo",
  disputed:"Resident disputed demo",
}[s] || s);
const isVerified = (d:ReconciliationDonation) =>
  d.paymentProvider==="paymongo" && d.paymongoLivemode===false &&
  d.status==="received" && d.paymentStatus==="paid" &&
  // Do not trust a frontend figure to authorize release; backend revalidates.
  Number(d.actualAmountReceived)>0;

export default function FundReleaseControls({campaigns,donations,ready,mode}:{
  campaigns:ReconciliationCampaign[];
  donations:ReconciliationDonation[];
  ready:boolean;
  mode:"admin"|"superadmin";
}) {
  const [rows,setRows] = useState<Release[]>([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [selectedId,setSelectedId] = useState("");
  const [inputAmount,setInputAmount] = useState("");
  const [reviewNote,setReviewNote] = useState("");
  const [decisionNote,setDecisionNote] = useState("");
  const [method,setMethod] = useState<"gcash"|"maya">("gcash");
  const [walletLast4,setWalletLast4] = useState("");
  const eligibleCampaigns = useMemo(()=>campaigns.filter(c =>
    !!c.sourceAssistanceRequestId && Number(c.monetaryGoal||0)>0),[campaigns]);
  const selection = eligibleCampaigns.find(c=>c.id===selectedId) || null;
  const record = rows.find(a=>a.campaignId===selectedId) || null;
  const verified = useMemo(()=>selection ? donations
    .filter(d=>d.campaignId===selection.id && (!d.donationType || d.donationType==="monetary") && isVerified(d))
    .reduce((sum,d)=>sum+Number(d.actualAmountReceived||0),0) : 0,
  [selection,donations]);
  // One-time release is eligible only after the entire approved monetary
  // goal is met by provider-verified Sandbox donations, not legacy records.
  const maxReview = selection &&
    Number(selection.monetaryGoal||0)>0 &&
    Number(selection.verifiedAmountReceived||0)>=Number(selection.monetaryGoal||0) &&
    verified>=Number(selection.monetaryGoal||0)
      ? Number(selection.monetaryGoal||0) : 0;
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
    } catch (e:any) {setError(e?.message||"Unable to load fund records.");}
    finally {setLoading(false);}
  },[request]);
  useEffect(()=>{if(ready)void reload();},[ready,reload]);
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
  const pick=(id:string)=>{
    setSelectedId(id);
    const c=eligibleCampaigns.find(x=>x.id===id);
    const eligible = donations.filter(d=>d.campaignId===id && isVerified(d))
      .reduce((sum,d)=>sum+Number(d.actualAmountReceived||0),0);
    const goal=Number(c?.monetaryGoal||0);
    const complete=goal>0 && Number(c?.verifiedAmountReceived||0)>=goal && eligible>=goal;
    setInputAmount(String((complete?goal:0).toFixed(2)));
    setError("");setNotice("");
  };
  return <View style={ss.panel}>
    <View style={ss.top}>
      <View style={ss.flex}>
        <Text style={ss.head}>Fund release records</Text>
        <Text style={ss.muted}>
          Review verified test donations, record independent authorization, and simulate a release.
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>void reload()}
        style={ss.subtle} disabled={busy||loading}>
        {loading?<ActivityIndicator size="small" color="#087A60"/>:
          <Ionicons name="refresh-outline" size={17} color="#087A60"/>}
        <Text style={ss.subtleText}>Refresh</Text>
      </Pressable>
    </View>
    <View style={ss.notice}>
      <Ionicons name="flask-outline" size={17} color="#16745C"/>
      <Text style={ss.noticeText}>
        PayMongo test payments only. This process records a simulation; no real GCash/Maya payment or LGU bank settlement takes place.
      </Text>
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
          return <Pressable key={c.id} onPress={()=>pick(c.id)}
            accessibilityRole="button" accessibilityState={{selected:selectedId===c.id}}
            style={[ss.campaign,selectedId===c.id&&ss.campaignActive]}>
            <View style={ss.flex}>
              <Text style={ss.campaignTitle}>{c.title||"Donation campaign"}</Text>
              <Text style={ss.muted}>{existing ? showStatus(existing.status) : "Ready for LGU review"}</Text>
              <Text style={ss.small}>{existing ? "Review amount: "+php(existing.amount):
                "Recorded campaign funding: "+php(Number(c.verifiedAmountReceived||0))}</Text>
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
          <Text style={ss.small}>Approved goal: {php(Number(selection.monetaryGoal||0))}</Text>
          <Text style={ss.small}>Provider-confirmed test payments: {php(verified)}</Text>
          {record?<View style={ss.infoBlock}>
            <Text style={ss.statusText}>{showStatus(record.status)}</Text>
            <Text style={ss.small}>Reviewed amount: {php(record.amount)}</Text>
            <Text style={ss.small}>Reviewer UID: {record.reviewerUid||"—"}</Text>
            {!!record.authorizerUid&&<Text style={ss.small}>
              Authorizer UID: {record.authorizerUid}
            </Text>}
            {!!record.method&&<Text style={ss.small}>
              {record.method.toUpperCase()} · TEST wallet ending {record.walletLast4}
            </Text>}
            {!!record.simulationReference&&<Text style={ss.small}>
              Reference: {record.simulationReference}
            </Text>}
            {!!record.acknowledgmentNote&&<Text style={ss.small}>
              Resident response: {record.acknowledgmentNote}
            </Text>}
            <Text style={ss.muted}>All actions are recorded as a simulated audit trail.</Text>
          </View>:<Text style={ss.muted}>
            No review recorded for this campaign yet. The system will validate amounts and the verified requester's account.
          </Text>}
          {!record&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>Review amount (PHP)</Text>
            <TextInput accessibilityLabel="Fund review amount" keyboardType="decimal-pad"
              style={ss.input} value={inputAmount} onChangeText={setInputAmount}
              placeholder="0.00"/>
            <Text style={ss.small}>{maxReview>0
              ? "Eligible verified test amount: "+php(maxReview)
              : "Waiting for the full approved goal to be reached through verified PayMongo test payments."}</Text>
            <Text style={ss.fieldLabel}>Evidence review notes</Text>
            <TextInput accessibilityLabel="Evidence review notes" multiline
              style={[ss.input,ss.textarea]} value={reviewNote} onChangeText={setReviewNote}
              placeholder="Describe the confirmed donation receipts and verified assistance evidence."/>
            <Pressable accessibilityRole="button" disabled={busy||maxReview<=0}
              style={[ss.primary,(busy||maxReview<=0)&&ss.disabled]}
              onPress={()=>void action("/review",{
                campaignId:selection.id,amount:Number(inputAmount),reviewNote,
              },"Fund review submitted for independent approval.")}>
              <Ionicons name="shield-checkmark-outline" color="#FFFFFF" size={17}/>
              <Text style={ss.primaryText}>Submit fund review</Text>
            </Pressable>
          </View>}
          {record?.status==="reviewed"&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>Independent authorization</Text>
            {mode==="superadmin"&&auth.currentUser?.uid!==record.reviewerUid?<>
              <TextInput style={[ss.input,ss.textarea]}
                accessibilityLabel="Decision note" multiline
                placeholder="Reason (required if rejecting)" value={decisionNote}
                onChangeText={setDecisionNote}/>
              <View style={ss.actionRow}>
                <Pressable style={ss.primary} disabled={busy}
                  accessibilityRole="button" onPress={()=>void action(
                    "/"+selection.id+"/authorize",{decision:"approve",reason:decisionNote},
                    "Simulated release approved.")}>
                  <Text style={ss.primaryText}>Authorize</Text>
                </Pressable>
                <Pressable style={ss.secondary} disabled={busy}
                  accessibilityRole="button" onPress={()=>void action(
                    "/"+selection.id+"/authorize",{decision:"reject",reason:decisionNote},
                    "Review rejected.")}>
                  <Text style={ss.secondaryText}>Reject</Text>
                </Pressable>
              </View>
            </>:<Text style={ss.muted}>
              A different approved Super Admin must review and authorize this request.
            </Text>}
          </View>}
          {record?.status==="authorized"&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>Simulated payout channel</Text>
            <View style={ss.actionRow}>
              {(["gcash","maya"] as const).map(x=><Pressable key={x}
                accessibilityRole="button" accessibilityState={{selected:method===x}}
                style={[ss.secondary,method===x&&ss.picked]} onPress={()=>setMethod(x)}>
                <Text style={ss.secondaryText}>{x==="gcash"?"GCash":"Maya"} (demo)</Text>
              </Pressable>)}
            </View>
            <Text style={ss.fieldLabel}>Last 4 digits of TEST wallet only</Text>
            <TextInput accessibilityLabel="Last 4 digits of test wallet" keyboardType="number-pad"
              maxLength={4} value={walletLast4} onChangeText={setWalletLast4}
              placeholder="0000" style={ss.input}/>
            <Text style={ss.muted}>Do not enter real wallet numbers. No transfer will be performed.</Text>
            <Pressable style={[ss.primary,busy&&ss.disabled]} disabled={busy}
              accessibilityRole="button" onPress={()=>void action(
                "/"+selection.id+"/simulate",{method,walletLast4},
                "Simulated release recorded. The verified requester can now acknowledge it.")}>
              <Text style={ss.primaryText}>Record simulated release</Text>
            </Pressable>
          </View>}
          {!!record?.audit?.length&&<View style={ss.actionBlock}>
            <Text style={ss.fieldLabel}>Audit history</Text>
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
