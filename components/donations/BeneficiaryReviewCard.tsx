import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import WalletBrandLogo from "./WalletBrandLogo";

export type VerifiedBeneficiary = {
  displayName:string; barangay?:string; photoUrl?:string;
  verified:boolean; verifiedLabel:string;
  requestNumber:string; assistanceTitle:string;
  assistanceCategory?:string; campaignId:string; payeeRole:string;
  wallet?:{configured:boolean;method?:"gcash"|"maya";walletLast4?:string;testOnly:true};
};
export default function BeneficiaryReviewCard({person}:{
  person:VerifiedBeneficiary;
}) {
  const [imageError,setImageError]=useState(false);
  const initials=person.displayName.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  return <View style={s.card}>
    <View style={s.heading}>
      <View style={s.headCopy}>
        <Text style={s.eyebrow}>VERIFIED REQUESTING RESIDENT</Text>
        <Text style={s.title}>Assistance beneficiary</Text>
      </View>
      <View style={s.status}>
        <Ionicons name="shield-checkmark-outline" color="#0B805D" size={16}/>
        <Text style={s.statusText}>Identity verified</Text>
      </View>
    </View>
    <View style={s.profile}>
      <View style={s.avatar}>
        {!!person.photoUrl&&!imageError?<Image
          source={{uri:person.photoUrl}}
          style={s.photo} resizeMode="cover"
          onError={()=>setImageError(true)}
          accessibilityLabel="Resident profile photo"/>:
          <Text style={s.initials}>{initials||"R"}</Text>}
      </View>
      <View style={s.userInfo}>
        <Text style={s.name}>{person.displayName}</Text>
        <Text style={s.detail}>Barangay: {person.barangay||"Not specified in profile"}</Text>
        <Text style={s.detail}>Recipient linked to approved Assistance Request</Text>
      </View>
    </View>
    <View style={s.request}>
      <View style={s.row}><Text style={s.key}>Assistance Request ID</Text><Text style={s.val}>{person.requestNumber}</Text></View>
      <View style={s.row}><Text style={s.key}>Approved purpose</Text><Text style={s.val}>{person.assistanceTitle}</Text></View>
      {!!person.assistanceCategory&&<View style={s.row}>
        <Text style={s.key}>Category</Text><Text style={s.val}>{person.assistanceCategory}</Text>
      </View>}
    </View>
    <View style={s.walletSection}>
      <Text style={s.walletTitle}>Resident-owned wallet destination</Text>
      {person.wallet?.configured&&person.wallet.method?
        <View style={s.walletRow}>
          <WalletBrandLogo brand={person.wallet.method} width={82} height={26}/>
          <View style={s.walletDetails}>
            <Text style={s.walletAlias}>Fictional alias •••• {person.wallet.walletLast4}</Text>
            <Text style={s.walletCaption}>Saved by this verified Resident for internal testing</Text>
          </View>
          <Ionicons name="lock-closed-outline" color="#168362" size={17}/>
        </View>:
        <View style={s.missingWallet}>
          <Ionicons name="alert-circle-outline" color="#9D632C" size={18}/>
          <Text style={s.missingWalletText}>
            Resident wallet not configured. The Resident must select a test wallet in Donations before LGU release.
          </Text>
        </View>}
    </View>
    <View style={s.footer}>
      <Ionicons name="lock-closed-outline" color="#637F74" size={15}/>
      <Text style={s.footerText}>
        Recipient verified from the original assistance request. Private ID documents and full wallet numbers are not displayed.
      </Text>
    </View>
  </View>;
}
const s=StyleSheet.create({
  card:{borderRadius:13,borderWidth:1,borderColor:"#DCEAE4",padding:15,gap:14,
    backgroundColor:"#FCFEFC"},
  heading:{flexDirection:"row",alignItems:"center",gap:10,flexWrap:"wrap"},
  headCopy:{flex:1,minWidth:170,gap:4},
  eyebrow:{fontSize:9,fontWeight:"700",color:"#168063",letterSpacing:1},
  title:{fontSize:16,fontWeight:"700",color:"#194B41"},
  status:{flexDirection:"row",alignItems:"center",gap:5,
    backgroundColor:"#EAF9F1",borderRadius:20,paddingHorizontal:10,paddingVertical:8},
  statusText:{fontSize:10,fontWeight:"700",color:"#0B805D"},
  profile:{flexDirection:"row",gap:13,alignItems:"center"},
  avatar:{width:62,height:62,borderRadius:31,backgroundColor:"#DDF3E8",
    alignItems:"center",justifyContent:"center",overflow:"hidden"},
  photo:{width:62,height:62},
  initials:{fontSize:22,fontWeight:"700",color:"#1C8060"},
  userInfo:{flex:1,gap:3},
  name:{fontSize:15,fontWeight:"700",color:"#244A42"},
  detail:{fontSize:11,color:"#638475",lineHeight:16},
  request:{backgroundColor:"#F1F8F4",borderRadius:10,padding:11,gap:9},
  row:{flexDirection:"row",gap:10,justifyContent:"space-between",flexWrap:"wrap"},
  key:{fontSize:11,color:"#6B8379"},
  val:{fontSize:11,fontWeight:"600",color:"#214D43",flexShrink:1,textAlign:"right"},
  walletSection:{backgroundColor:"#F5FAF7",borderRadius:11,padding:12,gap:9},
  walletTitle:{fontWeight:"700",fontSize:11,color:"#2B5D50"},
  walletRow:{flexDirection:"row",flexWrap:"wrap",gap:11,alignItems:"center"},
  walletDetails:{flex:1,minWidth:140,gap:4},
  walletAlias:{fontSize:11,fontWeight:"700",color:"#275847"},
  walletCaption:{fontSize:10,color:"#6B8A7B"},
  missingWallet:{flexDirection:"row",gap:9,alignItems:"center"},
  missingWalletText:{flex:1,fontSize:11,lineHeight:17,color:"#9D632C"},
  footer:{flexDirection:"row",alignItems:"flex-start",gap:7},
  footerText:{flex:1,fontSize:10,color:"#658278",lineHeight:16},
});
