import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import React from "react";
import {
  ActivityIndicator, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { auth, db, usingFirebaseEmulators } from "../../lib/firebase";

type PrivacyRequest={
  uid:string;
  status:string;
  requestedAt?:{toMillis?:()=>number};
};
const PAGE_SIZE=5;
const eligible=(status:string)=>status==="requested"||status==="purge_failed";
/** Embedded in the existing Super Admin staff workspace; no redundant page. */
export default function LguStaffPrivacyRequestsPanel(){
  const [items,setItems]=React.useState<PrivacyRequest[]>([]);
  const [error,setError]=React.useState("");
  const [loading,setLoading]=React.useState(true);
  const [page,setPage]=React.useState(1);
  const [selected,setSelected]=React.useState("");
  const [confirmed,setConfirmed]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [notice,setNotice]=React.useState("");
  React.useEffect(()=>{
    const unsubscribe=onSnapshot(collection(db,"lguApplicantPrivacyRequests"),snapshot=>{
      const rows=snapshot.docs.map(s=>s.data() as PrivacyRequest)
        .filter(r=>typeof r.uid==="string"&&r.uid.length>=8)
        .sort((a,b)=>(b.requestedAt?.toMillis?.()||0)-(a.requestedAt?.toMillis?.()||0));
      setItems(rows);setLoading(false);setError("");
    },()=>{
      setLoading(false);
      setError("Unable to load restricted privacy requests. Verify your Super Admin access.");
    });
    return unsubscribe;
  },[]);
  const count=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  const current=Math.min(page,count);
  const rows=items.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE);
  const purge=async(uid:string)=>{
    if(busy||uid!==selected||!confirmed||!eligible(items.find(x=>x.uid===uid)?.status||""))return;
    setBusy(true);setNotice("");
    try{
      const configured=process.env.EXPO_PUBLIC_LGU_FACE_SCREEN_API_URL?.trim();
      if(usingFirebaseEmulators&&!configured)
        throw Error("Local emulator mode requires a local test-only backend.");
      const base=(configured||process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.trim()||
        "https://volunserve.onrender.com")
        .replace(/\/api\/identity\/(verify|status|engine-health)\/?$/,"")
        .replace(/\/+$/,"");
      const local=/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
      if(usingFirebaseEmulators?!local:!/^https:\/\//.test(base))
        throw Error("A restricted backend is required. Emulator data must stay local.");
      const reviewer=auth.currentUser;
      if(!reviewer)throw Error("Super Admin session expired.");
      const response=await fetch(base+"/api/lgu-staff/privacy/purge-evidence",{
        method:"POST",
        headers:{"Authorization":"Bearer "+await reviewer.getIdToken(),
          "Content-Type":"application/json"},
        body:JSON.stringify({applicantUid:uid,confirmation:"PURGE_LGU_EVIDENCE"}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok!==true)
        throw Error(response.status===503
          ?"Sensitive-evidence purge is currently disabled by the protected backend."
          :"Erasure was not completed. Inspect private backend and audit status.");
      setNotice("Restricted evidence purge completed and recorded. Applicant account/profile remains.");
      setSelected("");setConfirmed(false);
    }catch(e:any){
      setNotice(String(e?.message||"Private evidence operation was not completed."));
    }finally{setBusy(false);}
  };
  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#08775D"/>
        <Text style={styles.title}>Staff privacy and evidence-erasure requests</Text>
      </View>
      <Text style={styles.info}>Programmer Super Admin only. Withdrawal prevents Admin promotion. Destructive evidence deletion requires an applicant request, explicit reviewer confirmation and a separately enabled server-side release gate. No Auth account/profile deletion.</Text>
      {loading&&<ActivityIndicator color="#08775D"/>}
      {!!error&&<Text style={styles.warning}>{error}</Text>}
      {!loading&&items.length===0&&<Text style={styles.info}>No applicant privacy requests.</Text>}
      {rows.map(item=><View style={styles.card} key={item.uid}>
        <Text style={styles.uid}>Applicant: {item.uid}</Text>
        <Text style={styles.status}>Status: {item.status.replaceAll("_"," ")}</Text>
        {eligible(item.status)&&<TouchableOpacity accessibilityRole="button"
          style={styles.secondary}
          disabled={busy}
          onPress={()=>{setSelected(item.uid===selected?"":item.uid);setConfirmed(false);setNotice("");}}>
          <Text style={styles.secondaryLabel}>{selected===item.uid?"Cancel erasure review":"Review controlled evidence purge"}</Text>
        </TouchableOpacity>}
        {selected===item.uid&&eligible(item.status)&&<View style={styles.confirmBox}>
          <Text style={styles.warning}>Permanent operation: remove government ID photos, selfie, LGU proof, and AI/OCR screening records. Confirm independent privacy authorization and approved retention policy before continuing.</Text>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:confirmed}}
            onPress={()=>setConfirmed(x=>!x)} style={styles.checkRow}>
            <Ionicons name={confirmed?"checkbox":"square-outline"} color="#08775D" size={22}/>
            <Text style={styles.info}>I confirm this applicant's valid withdrawal and authorization for restricted evidence erasure.</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={!confirmed||busy}
            onPress={()=>void purge(item.uid)}
            style={[styles.danger,(!confirmed||busy)&&{opacity:0.45}]}>
            {busy?<ActivityIndicator color="#FFFFFF"/>:
              <Text style={styles.dangerLabel}>Purge private evidence (server approved only)</Text>}
          </TouchableOpacity>
        </View>}
      </View>)}
      {items.length>PAGE_SIZE&&<View style={styles.pagination}>
        <TouchableOpacity accessibilityRole="button" disabled={current<=1}
          onPress={()=>setPage(v=>Math.max(1,v-1))}><Text style={styles.secondaryLabel}>Previous</Text></TouchableOpacity>
        <Text style={styles.info}>Page {current} / {count} · 5 per page</Text>
        <TouchableOpacity accessibilityRole="button" disabled={current>=count}
          onPress={()=>setPage(v=>Math.min(count,v+1))}><Text style={styles.secondaryLabel}>Next</Text></TouchableOpacity>
      </View>}
      {!!notice&&<Text accessibilityRole="alert" style={styles.info}>{notice}</Text>}
    </View>
  );
}
const styles=StyleSheet.create({
  panel:{borderWidth:1,borderColor:"#CCE5D5",backgroundColor:"#F1F9F4",
    borderRadius:14,padding:15,gap:10,marginBottom:16},
  headingRow:{flexDirection:"row",gap:8,alignItems:"center"},
  title:{flex:1,fontWeight:"900",fontSize:15,color:"#164A37"},
  info:{fontSize:12,lineHeight:18,color:"#496F5E",flexShrink:1},
  warning:{fontSize:12,lineHeight:18,color:"#8F4427"},
  card:{backgroundColor:"#FFFFFF",borderRadius:10,padding:12,
    borderWidth:1,borderColor:"#D4E7DA",gap:7},
  uid:{fontSize:12,fontWeight:"700",color:"#21513E"},
  status:{fontSize:11,color:"#466C5C",textTransform:"capitalize"},
  secondary:{padding:9,borderRadius:9,borderColor:"#B7DAC6",borderWidth:1,
    alignItems:"center",backgroundColor:"#E7F6EC"},
  secondaryLabel:{color:"#08775D",fontWeight:"800",fontSize:12},
  confirmBox:{backgroundColor:"#FFF9F0",padding:10,borderRadius:9,gap:10},
  checkRow:{flexDirection:"row",alignItems:"center",gap:9},
  danger:{padding:11,borderRadius:9,backgroundColor:"#9C3D2A",alignItems:"center"},
  dangerLabel:{fontWeight:"800",fontSize:12,color:"#FFFFFF",textAlign:"center"},
  pagination:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",
    flexWrap:"wrap",gap:8},
});
