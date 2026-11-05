import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { storage } from "../../lib/firebase";
import {
  getLguProofState, showLguProofFile, type LguProofKind,
} from "../../lib/lguProofDocuments";

type Props = { uid: string; onComplete?: (bothPresent:boolean)=>void };

/** Sensitive files are fetched with an authenticated Super Admin session, not public URLs. */
export default function LguApplicantProofReview({uid,onComplete}:Props) {
  const [status,setStatus] = useState<"loading"|"ready"|"missing"|"error">("loading");
  const [present,setPresent] = useState({employeeId:false,supporting:false});
  const [viewError,setViewError]=useState("");
  const [refreshKey,setRefreshKey]=useState(0);
  const [opening,setOpening]=useState<LguProofKind|null>(null);

  useEffect(()=>{
    let cancelled=false;
    onComplete?.(false);
    setStatus("loading");
    setViewError("");
    void getLguProofState(storage,uid).then(value=>{
      if(cancelled)return;
      setPresent(value);
      const ready=value.employeeId && value.supporting;
      setStatus(ready?"ready":"missing");
      onComplete?.(ready);
    }).catch(()=>{
      if(cancelled)return;
      setStatus("error");
      onComplete?.(false);
    });
    return ()=>{cancelled=true;};
    // onComplete is a notification, not a dependency that should restart the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[uid,refreshKey]);

  const open=async (kind:LguProofKind)=>{
    if (Platform.OS!=="web") {
      setViewError("Open credentials in the secured Super Admin web dashboard.");
      return;
    }
    setOpening(kind);
    setViewError("");
    try { await showLguProofFile(storage,uid,kind); }
    catch (e:any) {
      setViewError("Could not open this protected document. Check permissions and browser CORS settings.");
    }
    finally {setOpening(null);}
  };

  const entries=[
    {kind:"employee-id" as const,label:"LGU Employee ID",exists:present.employeeId},
    {kind:"supporting-document" as const,label:"Official supporting document",exists:present.supporting},
  ];
  return <View style={styles.panel}>
    <View style={styles.top}>
      <Ionicons name="documents-outline" color="#087D60" size={19}/>
      <Text style={styles.heading}>Submitted LGU Proof Documents</Text>
    </View>
    <Text style={styles.hint}>Private credentials; accessible only to the applicant and approved Super Admin reviewers. Do not share or copy document links.</Text>
    {status==="loading" ? <ActivityIndicator color="#087D60"/> : entries.map(entry=>
      <View key={entry.kind} style={styles.documentRow}>
        <Ionicons name={entry.exists?"checkmark-circle":"alert-circle-outline"} color={entry.exists?"#087D60":"#98612B"} size={19}/>
        <Text style={styles.documentLabel}>{entry.label}</Text>
        {entry.exists ? <TouchableOpacity accessibilityRole="button"
          accessibilityLabel={"View protected "+entry.label} disabled={opening!==null}
          style={styles.button} onPress={()=>void open(entry.kind)}>
          <Text style={styles.buttonText}>{opening===entry.kind?"Opening...":"View Proof"}</Text>
        </TouchableOpacity> : <Text style={styles.missing}>Missing</Text>}
      </View>
    )}
    {status==="ready"&&<Text style={styles.success}>Both documents are uploaded. You must still independently verify LGU employment and authority.</Text>}
    {status==="missing"&&<Text style={styles.warning}>Request the missing proof before approving this applicant.</Text>}
    {status==="error"&&<Text style={styles.warning}>Could not confirm documents; approval must remain disabled until verified.</Text>}
    {!!viewError&&<Text accessibilityRole="alert" style={styles.warning}>{viewError}</Text>}
    <TouchableOpacity accessibilityRole="button" onPress={()=>setRefreshKey(n=>n+1)} style={styles.refresh}>
      <Ionicons name="refresh-outline" size={14} color="#087D60"/>
      <Text style={styles.refreshText}>Refresh document status</Text>
    </TouchableOpacity>
  </View>;
}
const styles=StyleSheet.create({
  panel:{padding:14,borderColor:"#CFE4D9",borderWidth:1,borderRadius:12,backgroundColor:"#F7FBF9",gap:10,marginVertical:10},
  top:{flexDirection:"row",alignItems:"center",gap:8},
  heading:{fontSize:13,fontWeight:"900",color:"#164B3C"},
  hint:{fontSize:11,color:"#5F786B",lineHeight:17},
  documentRow:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:7},
  documentLabel:{fontSize:12,color:"#1F4938",fontWeight:"700",flex:1},
  button:{paddingHorizontal:11,paddingVertical:8,backgroundColor:"#087D60",borderRadius:8},
  buttonText:{color:"#FFFFFF",fontSize:11,fontWeight:"800"},
  missing:{fontSize:11,color:"#A86B2A",fontWeight:"800"},
  success:{fontSize:11,color:"#087D60",lineHeight:17},
  warning:{fontSize:11,color:"#9B5320",lineHeight:17},
  refresh:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:5,paddingVertical:6},
  refreshText:{color:"#087D60",fontWeight:"700",fontSize:11}
});
