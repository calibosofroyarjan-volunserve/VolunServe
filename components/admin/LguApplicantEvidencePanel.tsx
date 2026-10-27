import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { getBlob, getMetadata, ref as storageRef, getStorage } from "firebase/storage";
import React from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from "react-native";
import { db } from "../../lib/firebase";
import { isSupportedLguIdType, lguIdRequiresBack } from "../../lib/lguStaffApplicationPolicy";

type EvidenceInfo = {
  idType: string; front: string; back: string; selfie: string; lguProof: string;
  reviewStatus: string; aiStatus: string; officialOfficeStatus: string;
};
type ImageEvidence = { label: string; path: string; localUrl?: string };
/**
 * Authorized Super Admin-only private evidence viewer.
 * No token-bearing public download URLs: getBlob reads authenticated Storage,
 * then revocable browser-local object URLs are displayed only in this modal.
 * Presence of media NEVER means that government ID is genuine or face matches.
 */
export default function LguApplicantEvidencePanel({
  uid,onReady,
}: {uid: string; onReady: (ok: boolean) => void}) {
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState("");
  const [info,setInfo]=React.useState<EvidenceInfo|null>(null);
  const [images,setImages]=React.useState<ImageEvidence[]>([]);
  React.useEffect(()=>{
    let cancelled=false;
    let objectUrls: string[]=[];
    setLoading(true);setError("");setInfo(null);setImages([]);
    onReady(false);
    const load=async()=>{
      if (!uid) throw new Error("No staff applicant selected.");
      const snapshot=await getDoc(doc(db,"lguApplicantEvidence",uid));
      if(!snapshot.exists()) throw new Error("Staff identity and official proof submission is missing. Do not promote.");
      const item=snapshot.data() as EvidenceInfo;
      if (!isSupportedLguIdType(item.idType) ||
          item.reviewStatus!=="pending_manual_review" ||
          item.aiStatus!=="not_run" ||
          item.officialOfficeStatus!=="unconfirmed") {
        throw new Error("Applicant evidence has an unexpected status. Reconcile before any promotion.");
      }
      const entries: ImageEvidence[]=[
        {label:item.idType==="ph_passport"?"Passport identity page":"Government ID front",path:item.front},
        ...(lguIdRequiresBack(item.idType) ? [{label:"Government ID back",path:item.back}] : []),
        {label:"Camera selfie (unverified)",path:item.selfie},
        {label:"LGU appointment proof",path:item.lguProof},
      ];
      const allValid=entries.every(e=>
        typeof e.path==="string" &&
        new RegExp("^lguStaffEvidence/"+uid+"/(front|back|selfie|lgu_proof)[.](jpg|png|webp)$").test(e.path));
      if(!allValid)throw new Error("One or more protected evidence paths were invalid.");
      const storage=getStorage();
      await Promise.all(entries.map(async (entry)=>{
        const reference=storageRef(storage,entry.path);
        const meta=await getMetadata(reference); // Actual object must exist.
        if(meta.size<1024||meta.size>4*1024*1024||
          !["image/jpeg","image/png","image/webp"].includes(meta.contentType||"")) {
          throw new Error("Unsupported or oversized evidence file.");
        }
        if (Platform.OS==="web" && typeof URL!=="undefined") {
          const file=await getBlob(reference);
          const url=URL.createObjectURL(file);
          objectUrls.push(url);
          entry.localUrl=url;
        }
      }));
      if(cancelled)return;
      setInfo(item);setImages(entries);setLoading(false);
      onReady(true); // Evidence exists. Separate HUMAN identity + LGU review remains required.
    };
    load().catch(e=>{
      if(cancelled)return;
      setLoading(false);setError(String(e?.message||"Unable to open restricted evidence."));
      onReady(false);
    });
    return ()=>{
      cancelled=true;
      for(const url of objectUrls) URL.revokeObjectURL(url);
    };
    // onReady is an event receiver. Do not redo private fetches on its identity change.
  },[uid]);
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons name="document-lock-outline" color="#126F54" size={19}/>
        <Text style={styles.heading}>Private identity and LGU documents</Text>
      </View>
      <Text style={styles.note}>Restricted to Super Admin. Inspect government ID front/back (as applicable), portrait versus selfie and redacted staff proof. AI OCR, face matching and liveness have NOT run.</Text>
      {loading&&<ActivityIndicator color="#0A7A5C"/>}
      {!!error&&<Text style={styles.error}>{error}</Text>}
      {info&&<Text style={styles.label}>ID selected: {info.idType.replaceAll("_"," ")} · Status: awaiting independent manual review</Text>}
      <View style={styles.grid}>
        {images.map((item)=>(
          <View key={item.label} style={styles.photoCard}>
            <Text style={styles.label}>{item.label}</Text>
            {item.localUrl ? <Image source={{uri:item.localUrl}} resizeMode="contain" style={styles.photo}/> :
              <Text style={styles.note}>Verified private object. Preview requires secure web reviewer mode.</Text>}
          </View>
        ))}
      </View>
      <Text style={styles.warning}>File presence is not government ID authentication, liveness or proof of LGU employment. Confirm independently before checking all approval fields.</Text>
    </View>
  );
}
const styles=StyleSheet.create({
  section:{backgroundColor:"#F0FAF4",borderRadius:12,borderWidth:1,borderColor:"#D4E9DC",
    padding:12,gap:10},
  titleRow:{flexDirection:"row",alignItems:"center",gap:8},
  heading:{color:"#174B3A",fontSize:14,fontWeight:"900"},
  note:{color:"#4C7561",fontSize:11,lineHeight:17},
  warning:{color:"#895D21",fontSize:11,lineHeight:17,backgroundColor:"#FFF8E8",
    borderRadius:9,padding:10},
  error:{color:"#B83135",fontSize:12,backgroundColor:"#FFF0ED",padding:10,borderRadius:9},
  label:{color:"#235B44",fontWeight:"700",fontSize:11},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:8},
  photoCard:{width:"48%",minWidth:130,backgroundColor:"#FFFFFF",
    borderRadius:10,borderWidth:1,borderColor:"#D1E5D9",padding:8,gap:7},
  photo:{width:"100%",height:118,backgroundColor:"#E7EEE8",borderRadius:7},
});
