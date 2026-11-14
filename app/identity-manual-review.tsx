import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  requestInPersonIdentityReview,
  type IdentityDocumentType,
} from "../lib/identityVerification";

const TYPES: {value:IdentityDocumentType;label:string}[] = [
  {value:"national_id",label:"Philippine National ID"},
  {value:"drivers_license",label:"Driver's License"},
  {value:"passport",label:"Philippine Passport"},
  {value:"umid",label:"UMID"},
  {value:"prc_id",label:"PRC ID"},
];

export default function InPersonIdentityReview() {
  const router=useRouter();
  const [idType,setIdType]=useState<IdentityDocumentType>("national_id");
  const [consent,setConsent]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const submit=async()=>{
    if(submitting||success) return;
    setError("");
    try {
      setSubmitting(true);
      const result=await requestInPersonIdentityReview({idType,consent});
      if(result.status!=="pending") throw new Error("Review was not created.");
      setSuccess(result.message ||
        "Your identity is pending an independent, in-person LGU document review.");
    }catch(e:any){
      setError(e?.message||"Could not request LGU review. Try again.");
    }finally{setSubmitting(false)}
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page}>
      <TouchableOpacity onPress={()=>router.back()} style={styles.back} accessibilityRole="button">
        <Ionicons name="arrow-back" size={19} color="#334155"/>
        <Text style={styles.backText}>Back to Identity Verification</Text>
      </TouchableOpacity>
      <View style={styles.card}>
        <Ionicons name="shield-checkmark-outline" size={36} color="#047857"/>
        <Text style={styles.eyebrow}>STAGING • VOLUNSERVE</Text>
        <Text style={styles.heading}>Request In-Person LGU Identity Review</Text>
        <Text style={styles.body}>
          Use this fallback when the ID/selfie upload or face matching is unavailable.
          No government ID photo, selfie, face template or AI liveness data will be
          uploaded by this request. The Resident will remain NOT VERIFIED until
          an authorized LGU Admin completes an independent in-person inspection.
        </Text>
        {success ? (
          <View style={styles.success}>
            <Ionicons name="time-outline" size={28} color="#047857"/>
            <Text style={styles.strong}>Manual Review Requested</Text>
            <Text style={styles.body}>{success}</Text>
            <TouchableOpacity style={styles.button} onPress={()=>router.replace("/identity-verification" as any)}>
              <Text style={styles.buttonText}>View Identity Status</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Original government ID to present to LGU</Text>
            {TYPES.map(item=>(
              <TouchableOpacity
                key={item.value} onPress={()=>setIdType(item.value)}
                accessibilityRole="radio"
                accessibilityState={{selected:idType===item.value}}
                style={[styles.choice,idType===item.value&&styles.choiceActive]}>
                <Ionicons name={idType===item.value?"radio-button-on":"radio-button-off"}
                  size={20} color={idType===item.value?"#047857":"#64748B"}/>
                <Text style={styles.choiceText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.consent} onPress={()=>setConsent(v=>!v)}
              accessibilityRole="checkbox" accessibilityState={{checked:consent}}>
              <Ionicons name={consent?"checkbox-outline":"square-outline"} size={23} color="#047857"/>
              <Text style={styles.body}>
                I consent to storing my selected ID category and request status
                for authorized LGU review. I understand that I must personally
                present my original ID; this request does NOT verify my identity.
              </Text>
            </TouchableOpacity>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.button,(!consent||submitting)&&styles.disabled]}
              disabled={!consent||submitting} onPress={()=>void submit()}
              accessibilityRole="button">
              {submitting?<ActivityIndicator color="#FFFFFF"/>:
                <Text style={styles.buttonText}>Request In-Person Review (No Upload)</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F3F7F5"},
  page:{padding:20,paddingBottom:46,alignItems:"center"},
  back:{alignSelf:"flex-start",flexDirection:"row",gap:7,alignItems:"center",paddingVertical:12},
  backText:{fontSize:13,color:"#334155",fontWeight:"600"},
  card:{width:"100%",maxWidth:680,backgroundColor:"#FFFFFF",borderRadius:18,
    padding:24,gap:13,borderColor:"#DCE9E3",borderWidth:1},
  eyebrow:{fontSize:11,color:"#047857",fontWeight:"700",letterSpacing:1},
  heading:{fontSize:24,fontWeight:"800",color:"#0F172A"},
  body:{fontSize:14,color:"#475569",lineHeight:22,flexShrink:1},
  label:{fontSize:14,fontWeight:"700",color:"#0F172A",marginTop:9},
  choice:{borderColor:"#CBD5E1",borderWidth:1,borderRadius:9,padding:13,
    flexDirection:"row",alignItems:"center",gap:10},
  choiceActive:{borderColor:"#059669",backgroundColor:"#ECFDF5"},
  choiceText:{fontSize:15,fontWeight:"600",color:"#1E293B"},
  consent:{flexDirection:"row",alignItems:"flex-start",gap:10,marginVertical:10},
  button:{backgroundColor:"#047857",borderRadius:10,paddingVertical:15,
    paddingHorizontal:12,alignItems:"center",marginTop:5},
  buttonText:{color:"#FFFFFF",fontSize:14,fontWeight:"700",textAlign:"center"},
  disabled:{opacity:0.5},
  error:{fontSize:13,color:"#B91C1C",fontWeight:"600"},
  success:{gap:12,paddingTop:12},
  strong:{color:"#065F46",fontWeight:"800",fontSize:20},
});
