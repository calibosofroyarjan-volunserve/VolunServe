import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword, deleteUser, getAuth, sendEmailVerification,
  signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SJDM_BARANGAYS } from "../constants/sjdmBarangays";
import { firebaseConfig } from "../lib/firebase";
import { uploadLguProofFiles, validateLguProofFile } from "../lib/lguProofDocuments";

// Fail closed until production Storage Rules, bucket CORS and privacy review are complete.
const LGU_PRIVATE_PROOFS_ENABLED = process.env.EXPO_PUBLIC_LGU_PRIVATE_PROOFS_ENABLED === "true";

const emptyForm = {
  fullName:"",email:"",password:"",lguOffice:"",lguPosition:"",
  appointmentReference:"",barangay:"",
};
type StaffField = keyof typeof emptyForm;

/**
 * LGU staff accounts are always unprivileged applicants until an independent
 * Super Admin review grants access. Documents are NEVER public download URLs.
 */
export default function LguStaffApplication() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [employeeId, setEmployeeId] = useState<File | null>(null);
  const [supportingDocument, setSupportingDocument] = useState<File | null>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [busy,setBusy]=useState(false);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState("");
  const [pendingCreated,setPendingCreated]=useState(false);
  const update=(key:StaffField,value:string)=>setForm(old=>({...old,[key]:value}));

  const selectFile = (kind:"employee-id"|"supporting-document") => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file=event.target.files?.[0] ?? null;
    if (kind==="employee-id") setEmployeeId(file);
    else setSupportingDocument(file);
    setError("");
  };

  const withApplicantAuth = async (resume:boolean) => {
    const app=initializeApp(firebaseConfig,"lgu-proof-application-"+Date.now()+"-"+Math.floor(Math.random()*100000));
    const candidateAuth=getAuth(app);
    const candidateDb=getFirestore(app);
    const candidateStorage=getStorage(app);
    const email=form.email.trim().toLowerCase();
    let newUser:Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"]|null=null;
    let createdProfile=false;
    try {
      if (resume) {
        newUser=(await signInWithEmailAndPassword(candidateAuth,email,form.password)).user;
        const existing=await getDoc(doc(candidateDb,"users",newUser.uid));
        if (!existing.exists() || existing.data().role!=="applicant" || existing.data().status!=="pending_review") {
          throw new Error("Only existing pending LGU applicants may resume proof uploads.");
        }
      } else {
        newUser=(await createUserWithEmailAndPassword(candidateAuth,email,form.password)).user;
        const fullName=form.fullName.trim().replace(/\s+/g," ");
        await setDoc(doc(candidateDb,"users",newUser.uid),{
          uid:newUser.uid,email,fullName,age:0,phoneNumber:"",
          role:"applicant",status:"pending_review",residentAccess:false,volunteerAccess:false,
          region:"Region III – Central Luzon",province:"Bulacan",city:"City of San Jose del Monte",
          barangay:form.barangay,lguOffice:form.lguOffice.trim(),lguPosition:form.lguPosition.trim(),
          appointmentReference:form.appointmentReference.trim(),createdAt:serverTimestamp(),
        });
        createdProfile=true;
        setPendingCreated(true);
      }
      // Uploads require an authenticated pending applicant; rules never allow public write.
      await uploadLguProofFiles(candidateStorage,newUser.uid,employeeId!,supportingDocument!);
      // Verification email is an account safeguard; it does not substitute for
      // independent LGU employment and authorization confirmation.
      if (!resume && newUser && !newUser.emailVerified) {
        await sendEmailVerification(newUser).catch(()=>undefined);
      }
      setForm(emptyForm);
      setEmployeeId(null);
      setSupportingDocument(null);
      setPrivacyAgreed(false);
      setSuccess(true);
      setPendingCreated(false);
    } catch (err:any) {
      if (!resume && newUser && !createdProfile) {
        await deleteUser(newUser).catch(()=>undefined);
      }
      if (createdProfile) {
        setError("Your application account was created, but the document upload was not completed. Keep your credentials and choose Resume Proof Upload below. No Admin access was granted.");
      } else if (err?.code==="auth/email-already-in-use") {
        setError("This email is already registered. If you previously applied, use Resume Proof Upload with your existing credentials.");
      } else {
        setError(err?.message || "We could not submit the documents. Your Admin access remains disabled.");
      }
    } finally {
      await signOut(candidateAuth).catch(()=>undefined);
      await deleteApp(app).catch(()=>undefined);
    }
  };

  const submit=async()=>{
    if(busy)return;
    setError("");
    if (!LGU_PRIVATE_PROOFS_ENABLED) {
      setError("Secure LGU proof uploads are not enabled. Do not submit personal documents in this preview.");
      return;
    }
    if (Platform.OS!=="web") {
      setError("For secure LGU document upload, open https://volunserve.com/admin-request in a browser.");
      return;
    }
    const email=form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      form.password.length<12 || !/[A-Z]/.test(form.password) ||
      !/[a-z]/.test(form.password)||!/[0-9]/.test(form.password)||
      !/[^a-zA-Z0-9]/.test(form.password)) {
      setError("Enter your official work email and a 12+ character password with uppercase, lowercase, number and symbol.");
      return;
    }
    if (!resuming && (
      form.fullName.trim().length<5 || form.fullName.trim().length>160 ||
      form.lguOffice.trim().length<3 || form.lguOffice.trim().length>160 ||
      form.lguPosition.trim().length<3 || form.lguPosition.trim().length>120 ||
      form.appointmentReference.trim().length<5 || form.appointmentReference.trim().length>160 ||
      !SJDM_BARANGAYS.includes(form.barangay)
    )) {
      setError("Complete all official LGU staff details and choose an SJDM barangay.");
      return;
    }
    if (!employeeId || !supportingDocument) {
      setError("Upload your LGU employee ID and exactly one supporting document.");
      return;
    }
    if (!privacyAgreed) {
      setError("Confirm the privacy notice before sending these private credentials.");
      return;
    }
    try {
      await Promise.all([validateLguProofFile(employeeId),validateLguProofFile(supportingDocument)]);
    } catch (e:any) {
      setError(e?.message||"Please choose valid JPG, PNG or PDF documents under 5 MB each.");
      return;
    }
    setBusy(true);
    try { await withApplicantAuth(resuming || pendingCreated); }
    finally { setBusy(false); }
  };

  const fields: [StaffField,string,string,boolean][] = [
    ["fullName","Full legal name","As shown on your LGU employee ID",false],
    ["email","Official work email","name@example.gov.ph",false],
    ["lguOffice","LGU office / department","City department or office",false],
    ["lguPosition","Position / designation","As stated in your appointment",false],
    ["appointmentReference","Appointment reference","Non-sensitive memo/appointment reference",false],
    ["password","Create a password","12+ characters with mixed characters",true],
  ];
  const required = resuming ? fields.filter(field=>field[0]==="email"||field[0]==="password") : fields;
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==="ios"?"padding":undefined}>
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.panel}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={28} color="#087D60"/>
          <View style={{flex:1}}>
            <Text style={styles.kicker}>VOLUNSERVE · LGU STAFF</Text>
            <Text style={styles.title}>LGU Staff Verification Application</Text>
            <Text style={styles.requestSubtitle}>Submit credentials · Super Admin reviews · Approved staff only</Text>
          </View>
        </View>
        {success ? <>
          <Text style={styles.success}>Your LGU documents have been received for review. Your account remains PENDING with no Admin privileges. The Super Admin must independently verify your employment and authorization with an official LGU source. Check your inbox for a verification email.</Text>
          <TouchableOpacity style={styles.submit} onPress={()=>router.replace("/login")}>
            <Text style={styles.submitText}>Return to VolunServe Login</Text>
          </TouchableOpacity>
        </> : <>
          <Text style={styles.notice}>Submit your LGU employee ID and ONE official supporting document. The Super Admin reviews these proofs and independently checks your LGU employment before approval. No AI face scan or National ID is required.</Text>
          {!LGU_PRIVATE_PROOFS_ENABLED && <Text accessibilityRole="alert" style={styles.previewWarning}>Preview only — private Storage uploads are not active. Do not submit real IDs or documents here.</Text>}
          <TouchableOpacity onPress={()=>{setResuming(v=>!v);setError("");}} style={styles.resumeRow} disabled={busy}>
            <Text style={styles.resumeText}>{resuming||pendingCreated?"New LGU application":"Already applied? Resume Proof Upload"}</Text>
          </TouchableOpacity>
          {required.map(([key,label,hint,secret])=><View key={key} style={styles.field}>
            <Text style={styles.label}>{label} <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} placeholder={hint} placeholderTextColor="#8CA89A"
              value={form[key]} onChangeText={v=>update(key,v)} editable={!busy}
              nativeID={"lgu-staff-"+key} autoComplete={key==="email"?"email":secret?"new-password":"off"}
              importantForAutofill={key==="appointmentReference"?"no":"auto"}
              autoCapitalize={key==="email"||key==="appointmentReference"?"none":"sentences"}
              autoCorrect={false} secureTextEntry={secret}
              keyboardType={key==="email"?"email-address":"default"}/>
          </View>)}
          {!resuming&&!pendingCreated&&<View style={styles.field}>
            <Text style={styles.label}>Assigned barangay (San Jose del Monte) <Text style={styles.required}>*</Text></Text>
            <ScrollView style={styles.barangays} nestedScrollEnabled>
              {SJDM_BARANGAYS.map(name=><TouchableOpacity key={name} accessibilityRole="radio"
                accessibilityState={{checked:form.barangay===name}}
                onPress={()=>update("barangay",name)} style={[styles.option,form.barangay===name&&styles.selected]}>
                <Text style={{color:form.barangay===name?"#FFFFFF":"#245644",fontSize:12}}>{name}</Text>
              </TouchableOpacity>)}
            </ScrollView>
            {!!form.barangay&&<Text style={styles.selection}>Selected: {form.barangay}</Text>}
          </View>}
          <View style={styles.proofs}>
            <Text style={styles.proofsHeading}>Proof of LGU Employment</Text>
            <Text style={styles.proofsHint}>Required: LGU Employee ID + ONE Certificate of Employment, Appointment Order or official LGU authorization letter. JPG, PNG or PDF · up to 5 MB each.</Text>
            {([
              {key:"employee-id",label:"LGU Employee ID",file:employeeId},
              {key:"supporting-document",label:"Supporting official document",file:supportingDocument},
            ] as const).map(entry=><View key={entry.key} style={styles.field}>
              <Text style={styles.label}>{entry.label} <Text style={styles.required}>*</Text></Text>
              {Platform.OS==="web" ? React.createElement("input" as any,{
                type:"file",accept:".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf",
                disabled:busy,"aria-label":"Upload "+entry.label,
                onChange:selectFile(entry.key),style:{
                  width:"100%",padding:"12px",border:"1px solid #D6E6DD",
                  borderRadius:"10px",background:"#FAFCFA",color:"#173B2E"
                }
              }) : <Text style={styles.proofsHint}>Please upload through the VolunServe website.</Text>}
              {!!entry.file&&<Text style={styles.selection}>Selected: {entry.file.name} ({(entry.file.size/1024/1024).toFixed(2)} MB)</Text>}
            </View>)}
            <TouchableOpacity style={styles.privacyRow} accessibilityRole="checkbox"
              accessibilityState={{checked:privacyAgreed}} onPress={()=>setPrivacyAgreed(v=>!v)} disabled={busy}>
              <Ionicons name={privacyAgreed?"checkbox":"square-outline"} size={22} color="#087D60"/>
              <Text style={styles.privacyText}>I consent to providing these limited documents for LGU staff verification. Only authorized Super Admin reviewers may inspect them. Do not upload a National ID, full payroll records or passwords.</Text>
            </TouchableOpacity>
          </View>
          {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <TouchableOpacity accessibilityRole="button" style={[styles.submit,(busy||!LGU_PRIVATE_PROOFS_ENABLED)&&{opacity:.5}]}
            disabled={busy||!LGU_PRIVATE_PROOFS_ENABLED} onPress={()=>void submit()}>
            {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={styles.submitText}>{resuming||pendingCreated?"Complete Proof Upload":"Submit for Super Admin Verification"}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>router.replace("/login")} style={{alignItems:"center",padding:12}}>
            <Text style={{color:"#087D60",fontWeight:"700"}}>Back to VolunServe Login</Text>
          </TouchableOpacity>
        </>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:"#F3F8F5"},screen:{padding:18,minHeight:"100%",justifyContent:"center",alignItems:"center"},
 panel:{width:"100%",maxWidth:590,backgroundColor:"#FFFFFF",borderColor:"#DCE9E2",borderWidth:1,
   borderRadius:18,padding:25,gap:8},header:{flexDirection:"row",alignItems:"center",gap:13,marginBottom:13},
 kicker:{fontSize:10,fontWeight:"800",color:"#087D60",letterSpacing:1.4},
 title:{fontSize:23,fontWeight:"900",color:"#153B31"},
 requestSubtitle:{fontSize:12,color:"#527767",fontWeight:"600",marginTop:4},
 notice:{fontSize:12,lineHeight:19,color:"#57776A",backgroundColor:"#EDF8F1",
   borderRadius:11,padding:14,marginBottom:9},
 field:{gap:6,marginBottom:6},label:{fontSize:12,fontWeight:"800",color:"#2D5747"},required:{color:"#DC2626",fontWeight:"900"},
 input:{borderWidth:1,borderColor:"#D6E6DD",backgroundColor:"#FAFCFA",borderRadius:10,
   paddingHorizontal:13,minHeight:45,color:"#173B2E"},
 barangays:{maxHeight:142,borderWidth:1,borderColor:"#D6E6DD",borderRadius:10},
 option:{paddingVertical:10,paddingHorizontal:13,borderBottomWidth:1,borderBottomColor:"#EAF3ED"},
 selected:{backgroundColor:"#087D60"},selection:{color:"#087D60",fontSize:11},
 error:{fontSize:12,color:"#AD2733",backgroundColor:"#FFF3F1",borderRadius:9,padding:11},
 success:{color:"#185C47",fontSize:13,lineHeight:22,padding:17,backgroundColor:"#E7F8ED",borderRadius:12},
 submit:{backgroundColor:"#087D60",borderRadius:10,alignItems:"center",justifyContent:"center",
   paddingVertical:14,minHeight:49,marginTop:10},
 submitText:{color:"#FFFFFF",fontSize:13,fontWeight:"800"},
 proofs:{borderWidth:1,borderColor:"#DCE9E2",borderRadius:13,padding:15,gap:12,
   backgroundColor:"#F7FBF8",marginTop:10},
 previewWarning:{fontSize:12,lineHeight:19,fontWeight:"800",color:"#9E3B2C",backgroundColor:"#FFF3EE",padding:12,borderRadius:10},
 proofsHeading:{fontSize:15,fontWeight:"900",color:"#153B31"},
 proofsHint:{fontSize:12,color:"#597A69",lineHeight:18},
 privacyRow:{flexDirection:"row",alignItems:"flex-start",gap:10,marginTop:8,padding:7},
 privacyText:{flex:1,color:"#416855",fontSize:12,lineHeight:19},
 resumeRow:{alignSelf:"flex-start",paddingVertical:6,paddingHorizontal:2},
 resumeText:{fontWeight:"700",fontSize:12,color:"#087D60"}
});
