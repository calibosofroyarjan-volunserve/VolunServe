import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { getBlob, getMetadata, ref as storageRef, getStorage } from "firebase/storage";
import React from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db, usingFirebaseEmulators } from "../../lib/firebase";
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
  const [decodedImages,setDecodedImages]=React.useState<string[]>([]);
  const [previewUid,setPreviewUid]=React.useState("");
  const [screenBusy,setScreenBusy]=React.useState(false);
  const [screenMessage,setScreenMessage]=React.useState("");
  const [screenStatus,setScreenStatus]=React.useState("");
  const [ocrBusy,setOcrBusy]=React.useState(false);
  const [ocrMessage,setOcrMessage]=React.useState("");
  const [ocrStatus,setOcrStatus]=React.useState("");
  React.useEffect(()=>{
    let cancelled=false;
    let objectUrls: string[]=[];
    setLoading(true);setError("");setInfo(null);setImages([]);
    setDecodedImages([]);setPreviewUid("");
    setScreenBusy(false);setScreenMessage("");setScreenStatus("");
    setOcrBusy(false);setOcrMessage("");setOcrStatus("");
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
          !["image/jpeg","image/png","image/webp"].includes(meta.contentType||"") ||
          meta.customMetadata?.purpose!=="lgu_staff_manual_review" ||
          meta.customMetadata?.idType!==item.idType) {
          throw new Error("Unsupported or oversized evidence file.");
        }
        if (Platform.OS!=="web" || typeof URL==="undefined") {
          throw new Error("Open the Super Admin review in the secure web dashboard to inspect ID and facial evidence.");
        }
        const file=await getBlob(reference);
        if (cancelled) return; // Never create a sensitive blob URL after unmount.
        const url=URL.createObjectURL(file);
        objectUrls.push(url);
        entry.localUrl=url;
      }));
      if(cancelled)return;
      if(!entries.every(entry=>!!entry.localUrl)) {
        throw new Error("Private ID/face preview was not available. Review is blocked.");
      }
      setInfo(item);setImages(entries);setPreviewUid(uid);setLoading(false);
      // Do not unlock reviewer confirmation before the browser actually
      // decodes EVERY private image; object URL creation alone is insufficient.
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
  const previewsDecoded=previewUid===uid && !loading && !error && !!info &&
    images.length>0 && images.every(item=>decodedImages.includes(item.path));
  React.useEffect(()=>{
    onReady(previewsDecoded);
  },[previewsDecoded,uid]); // Parent uses a stable state setter.

  const runSimilarityScreen=async()=>{
    if(!info||!uid||screenBusy||!previewsDecoded)return;
    setScreenBusy(true);setScreenMessage("");setScreenStatus("");
    try {
      // Emulator test accounts MUST NEVER be forwarded to production Render.
      const configured=process.env.EXPO_PUBLIC_LGU_FACE_SCREEN_API_URL?.trim();
      if(usingFirebaseEmulators&&!configured)
        throw new Error("Configure a local test-only screening backend for emulator QA.");
      if(Platform.OS!=="web")
        throw new Error("Run private facial review inside the authorized Super Admin web workspace.");
      const user=auth.currentUser;
      if(!user)throw new Error("Your Super Admin session has expired.");
      const base=(configured||
        process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.trim()||
        "https://volunserve.onrender.com")
        .replace(/\/api\/identity\/(verify|status|engine-health)\/?$/,"")
        .replace(/\/+$/,"");
      // Never forward emulator Auth tokens or synthetic applicant UID to
      // HTTPS production hosts, even if a developer misconfigures the URL.
      const localEndpoint=/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
      if(usingFirebaseEmulators ? !localEndpoint : !/^https:\/\//.test(base))
        throw new Error("The private screening service must use a secure backend address.");
      const response=await fetch(base+"/api/lgu-staff/face-screen",{
        method:"POST",
        headers:{"Authorization":"Bearer "+await user.getIdToken(),
          "Content-Type":"application/json"},
        body:JSON.stringify({applicantUid:uid}),
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(body.message||
        "Secure face-similarity screening is unavailable. Use manual review."));
      const signal=body.faceSimilaritySignal==="similarity_signal_present"
        ?"Photo comparison completed. Review the applicant and original ID before deciding."
        :"Photo comparison needs additional manual identity review.";
      setScreenStatus(String(body.faceSimilaritySignal||"inconclusive_manual_review"));
      setScreenMessage(signal+" Live presence, government ID authenticity and LGU appointment remain unverified.");
    }catch(e:any){
      setScreenStatus("manual_review_required");
      setScreenMessage(String(e?.message||"Face screening could not be completed."));
    }finally{setScreenBusy(false);}
  };
  const runOcrScreen=async()=>{
    if(!info||!uid||ocrBusy||!previewsDecoded)return;
    setOcrBusy(true);setOcrMessage("");setOcrStatus("");
    try {
      // Never send emulator applicant tokens or ID paths to real Render.
      const configured=process.env.EXPO_PUBLIC_LGU_FACE_SCREEN_API_URL?.trim();
      if(usingFirebaseEmulators&&!configured)
        throw new Error("Set up a local test-only backend for private document OCR QA.");
      if(Platform.OS!=="web")
        throw new Error("Open the authorized Super Admin web dashboard to review ID documents.");
      const user=auth.currentUser;
      if(!user)throw new Error("Your Super Admin session has expired.");
      const base=(configured||
        process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.trim()||
        "https://volunserve.onrender.com")
        .replace(/\/api\/identity\/(verify|status|engine-health)\/?$/,"")
        .replace(/\/+$/,"");
      // Never forward emulator Auth tokens or synthetic applicant UID to
      // HTTPS production hosts, even if a developer misconfigures the URL.
      const localEndpoint=/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
      if(usingFirebaseEmulators ? !localEndpoint : !/^https:\/\//.test(base))
        throw new Error("Document OCR requires a secure backend URL.");
      const response=await fetch(base+"/api/lgu-staff/document-screen",{
        method:"POST",
        headers:{"Authorization":"Bearer "+await user.getIdToken(),
          "Content-Type":"application/json"},
        body:JSON.stringify({applicantUid:uid}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(result.message||
        "Government ID OCR is unavailable; review the document manually."));
      const signal=String(result.documentTypeSignal||"document_type_inconclusive");
      const labels:Record<string,string>={
        declared_type_text_consistent:"OCR text appears consistent with the selected ID category.",
        declared_type_text_mismatch:"OCR indicates a different ID category. Manual review required.",
        unsupported_document_suspected:"OCR suggests an unsupported school/company or employee ID.",
        document_type_inconclusive:"OCR could not reliably classify the document type.",
        ocr_unavailable_or_unreadable:"OCR could not process the document clearly.",
      };
      setOcrStatus(signal);
      setOcrMessage((labels[signal]||"Document requires manual classification.")+
        " This is NOT issuer authentication or proof that the ID is genuine.");
    }catch(e:any){
      setOcrStatus("manual_review_required");
      setOcrMessage(String(e?.message||"Document OCR screening was unavailable."));
    }finally{setOcrBusy(false);}
  };
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons name="document-lock-outline" color="#126F54" size={19}/>
        <Text style={styles.heading}>Private identity and LGU documents</Text>
      </View>
      <Text style={styles.note}>Restricted to Super Admin. Inspect government ID front/back (as applicable), portrait versus selfie and redacted staff proof. OCR and facial comparison are optional reviewer checks; active liveness is NOT available.</Text>
      {loading&&<ActivityIndicator color="#0A7A5C"/>}
      {!!error&&<Text style={styles.error}>{error}</Text>}
      {info&&<Text style={styles.label}>ID selected: {info.idType.replaceAll("_"," ")} · Status: awaiting independent manual review</Text>}
      <View style={styles.grid}>
        {images.map((item)=>(
          <View key={item.label} style={styles.photoCard}>
            <Text style={styles.label}>{item.label}</Text>
            {item.localUrl ? <Image source={{uri:item.localUrl}} resizeMode="contain" style={styles.photo}
              onLoad={()=>setDecodedImages(old=>old.includes(item.path)?old:[...old,item.path])}
              onError={()=>{
                setError("A protected ID or staff evidence image could not be displayed. Review and promotion are blocked.");
                setDecodedImages([]);
                onReady(false);
              }}/> :
              <Text style={styles.note}>Verified private object. Preview requires secure web reviewer mode.</Text>}
          </View>
        ))}
      </View>
      {!loading&&!error&&!previewsDecoded&&<Text style={styles.note}>
        Private evidence is loading into the secure reviewer view. Approval remains locked until all document photos display successfully.
      </Text>}
      <Text style={styles.warning}>File presence or successful preview is not government ID authentication, liveness or proof of LGU employment. Confirm independently before checking all approval fields.</Text>
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel="Run private OCR document type consistency screening"
        disabled={ocrBusy||!previewsDecoded}
        onPress={()=>void runOcrScreen()}
        style={[styles.screenButton,(ocrBusy||loading||!!error||!info)&&{opacity:0.5}]}>
        {ocrBusy?<ActivityIndicator color="#FFFFFF"/>:
          <Text style={styles.screenButtonText}>Run private government ID OCR (review only)</Text>}
      </TouchableOpacity>
      {!!ocrMessage&&<View style={styles.signalBox}>
        <Text style={styles.signalLabel}>{ocrStatus==="declared_type_text_consistent"?"Informational OCR signal":"Document review required"}</Text>
        <Text style={styles.note}>{ocrMessage}</Text>
      </View>}
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel="Run optional Super Admin AI-assisted face similarity screening"
        disabled={screenBusy||!previewsDecoded}
        onPress={()=>void runSimilarityScreen()}
        style={[styles.screenButton,(screenBusy||loading||!!error||!info)&&{opacity:0.5}]}>
        {screenBusy?<ActivityIndicator color="#FFFFFF"/>:
          <Text style={styles.screenButtonText}>Check ID portrait and face photo</Text>}
      </TouchableOpacity>
      {!!screenMessage&&<View style={styles.signalBox}>
        <Text style={styles.signalLabel}>{screenStatus==="similarity_signal_present"?"Photo comparison complete · Review required":"Additional review required"}</Text>
        <Text style={styles.note}>{screenMessage}</Text>
      </View>}
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
  screenButton:{backgroundColor:"#08775D",padding:13,borderRadius:10,alignItems:"center",justifyContent:"center",minHeight:47},
  screenButtonText:{fontSize:12,color:"#FFFFFF",fontWeight:"800",textAlign:"center"},
  signalBox:{padding:12,borderRadius:10,backgroundColor:"#EDF8F1",gap:6},
  signalLabel:{fontSize:12,fontWeight:"800",color:"#205D44"},
});
