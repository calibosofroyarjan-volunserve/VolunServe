import Ionicons from "@expo/vector-icons/Ionicons";
import React, {useEffect,useState} from "react";
import {ActivityIndicator,StyleSheet,Text,View} from "react-native";
import {auth} from "../../lib/firebase";
import ResidentWalletSetup from "./ResidentWalletSetup";
import ResidentReleaseAcknowledgment from "./ResidentReleaseAcknowledgment";

const API="https://volunserve.onrender.com/api/funds/my-campaigns/";

/**
 * Mount the assistance wallet inside the Resident's own published campaign.
 * The backend verifies original Assistance Request ownership and identity.
 * Donors never receive beneficiary wallet settings and use normal PayMongo.
 */
export default function CampaignBeneficiaryWallet({
  campaignId,enabled,children,
}:{
  campaignId:string;enabled:boolean;children:React.ReactNode;
}){
  const [eligible,setEligible]=useState(false);
  const [checking,setChecking]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    if(!enabled||!campaignId){
      setEligible(false);setChecking(false);setMessage("");
      return;
    }
    let active=true;
    setEligible(false);
    setMessage("");
    setChecking(true);
    void (async()=>{
      try{
        const token=await auth.currentUser?.getIdToken();
        if(!token)throw new Error("Sign in to view your assistance campaign.");
        const response=await fetch(API+encodeURIComponent(campaignId)+"/wallet-eligibility",{
          headers:{Authorization:"Bearer "+token},
        });
        const json=await response.json().catch(()=>null);
        if(!response.ok||!json?.ok)throw new Error(
          json?.message||"Could not check the linked requesting Resident.");
        if(active)setEligible(json.eligible===true);
      }catch(error:any){
        if(active)setMessage(error?.message||"Unable to verify your assistance campaign.");
      }finally{if(active)setChecking(false);}
    })();
    return ()=>{active=false;};
  },[campaignId,enabled]);
  if(!enabled)return <>{children}</>;
  if(checking)return <View style={s.loading}>
    <ActivityIndicator color="#087F63" size="small"/>
    <Text style={s.info}>Checking campaign ownership…</Text>
  </View>;
  if(!eligible)return <>{children}{!!message&&<Text style={s.info}>{message}</Text>}</>;
  return <View style={s.container}>
    <View style={s.heading}>
      <View style={s.icon}>
        <Ionicons name="shield-checkmark-outline" size={21} color="#078668"/>
      </View>
      <View style={s.headingText}>
        <Text style={s.title}>My published assistance campaign</Text>
        <Text style={s.subtitle}>
          Your private payout destination and release notices are linked to this approved request.
        </Text>
      </View>
    </View>
    <ResidentWalletSetup enabled/>
    <ResidentReleaseAcknowledgment enabled campaignId={campaignId}/>
    <Text style={s.note}>
      Donors pay through VolunServe checkout. This test-only wallet alias is for the LGU release record, not for collecting donations.
    </Text>
  </View>;
}
const s=StyleSheet.create({
  container:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D8EAE2",
    borderRadius:16,padding:14,gap:12,marginTop:15},
  heading:{flexDirection:"row",gap:11,alignItems:"center"},
  icon:{width:39,height:39,borderRadius:11,backgroundColor:"#E6F8EE",
    alignItems:"center",justifyContent:"center"},
  headingText:{flex:1,gap:4},
  title:{fontSize:15,fontFamily:"DonationInterBold",color:"#174D3B"},
  subtitle:{fontSize:11,fontFamily:"DonationInterRegular",lineHeight:17,color:"#63877A"},
  note:{fontSize:10,fontFamily:"DonationInterRegular",lineHeight:16,color:"#668276"},
  loading:{flexDirection:"row",alignItems:"center",padding:14,gap:9},
  info:{fontSize:11,color:"#738B83"},
});
