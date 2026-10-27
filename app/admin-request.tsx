import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth, sendEmailVerification, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { connectStorageEmulator, getMetadata, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SJDM_BARANGAYS } from "../constants/sjdmBarangays";
import { firebaseConfig, usingFirebaseEmulators } from "../lib/firebase";
import { EvidenceSlot, LGU_APPLICATION_NOTICE, LGU_ID_TYPES, LGU_STAFF_STEPS, LguIdType, lguIdRequiresBack, validLguApplication } from "../lib/lguStaffApplicationPolicy";

type FormFields = {
  fullName: string; email: string; password: string; lguOffice: string;
  lguPosition: string; appointmentReference: string; barangay: string;
};
type PhotoMap = Partial<Record<EvidenceSlot, ImagePicker.ImagePickerAsset>>;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMG_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
const renderSteps = LGU_STAFF_STEPS;
// Fail closed in production until approved biometric/privacy release gating.
// Emulator demo uses synthetic documents; staging may explicitly opt in.
const emulatorRequested = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";
const privateEvidenceIntakeEnabled = usingFirebaseEmulators ||
  (!emulatorRequested &&
    process.env.EXPO_PUBLIC_LGU_STAFF_PRIVATE_EVIDENCE_ENABLED === "true");
// Native emulator support has NOT been configured by lib/firebase.ts. Never
// let an Android simulator silently submit test government IDs to production.

export default function LguStaffApplication() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 610;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormFields>({
    fullName:"", email:"", password:"", lguOffice:"", lguPosition:"",
    appointmentReference:"", barangay:"",
  });
  const [idType, setIdType] = useState<LguIdType>("ph_national_id");
  const [images, setImages] = useState<PhotoMap>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const update = (key:keyof FormFields, value:string) => setForm(old=>({...old,[key]:value}));

  const capture = async (slot: EvidenceSlot, live = false) => {
    setError("");
    try {
      if (live) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setError("Allow camera permission to capture a live selfie."); return; }
      }
      const result = live
        ? await ImagePicker.launchCameraAsync({ mediaTypes:["images"], allowsEditing:false, quality:0.8, cameraType:ImagePicker.CameraType.front })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes:["images"], allowsEditing:false, quality:0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        setError("Image must be 4 MB or smaller. Retake or compress it."); return;
      }
      if (asset.mimeType && !Object.keys(IMG_TYPES).includes(asset.mimeType)) {
        setError("Only JPG, PNG or WebP images are allowed."); return;
      }
      setImages(old=>({...old,[slot]:asset}));
    } catch {
      setError("Unable to open the camera or image picker on this device.");
    }
  };

  const stepValid = () => {
    if (step===0) return validLguApplication(form,SJDM_BARANGAYS);
    if (step===1) return !!images.front && (!lguIdRequiresBack(idType) || !!images.back);
    if (step===2) return !!images.selfie;
    if (step===3) return !!images.lgu_proof;
    return consent && !!images.front && !!images.selfie && !!images.lgu_proof &&
      (!lguIdRequiresBack(idType)||!!images.back);
  };
  const next = () => {
    setError("");
    if (!stepValid()) {
      setError(step===0
        ? "Complete all staff details, official department, barangay and a strong 12+ character password."
        : step===1 ? "Provide required government ID image(s). School and company IDs are not accepted."
        : step===2 ? "Capture a fresh selfie using the camera."
        : step===3 ? "Provide a redacted image of your LGU appointment or employment proof."
        : "Review the information and agree to the identity processing notice.");
      return;
    }
    setStep(value=>Math.min(4,value+1));
  };

  const uploadPrivateImage = async (
    storage: ReturnType<typeof getStorage>, uid:string, slot: EvidenceSlot,
    asset: ImagePicker.ImagePickerAsset,
  ): Promise<string> => {
    const result = await fetch(asset.uri);
    if (!result.ok) throw new Error("Unable to read your selected image.");
    const blob = await result.blob();
    if (blob.size < 1024 || blob.size > MAX_IMAGE_BYTES) {
      throw new Error("Evidence images must be 1 KB–4 MB.");
    }
    const mime = blob.type || asset.mimeType || "";
    const extension = IMG_TYPES[mime];
    if (!extension) throw new Error("Only real JPG, PNG or WebP images are accepted.");
    // Storage is create-only. After a network interruption, recover original
    // private evidence rather than overwriting immutable submitted files.
    for (const ext of ["jpg","png","webp"]) {
      const priorPath="lguStaffEvidence/"+uid+"/"+slot+"."+ext;
      try {
        const meta=await getMetadata(storageRef(storage,priorPath));
        const expectedMime=ext==="jpg"?"image/jpeg":"image/"+ext;
        if(meta.contentType!==expectedMime || meta.size<1024 || meta.size>MAX_IMAGE_BYTES ||
          meta.customMetadata?.purpose!=="lgu_staff_manual_review") {
          throw new Error("Previously uploaded evidence needs secure staff review.");
        }
        return priorPath;
      } catch(e:any) {
        if(e?.code!=="storage/object-not-found") throw e;
      }
    }
    const path = "lguStaffEvidence/" + uid + "/" + slot + "." + extension;
    await uploadBytes(storageRef(storage,path),blob,{contentType:mime,customMetadata:{purpose:"lgu_staff_manual_review"}});
    return path; // Private object path only; never a public URL.
  };

  const submit = async () => {
    if (busy || step!==4 || !stepValid()) return;
    if (!privateEvidenceIntakeEnabled) {
      setError(emulatorRequested && !usingFirebaseEmulators
        ? "Local emulator mode is supported only in a localhost web browser. Mobile test devices must never upload synthetic IDs to the production Firebase project."
        : "LGU government ID and selfie intake is not yet enabled for production. Privacy controls and biometric QA must be approved before processing real documents.");
      return;
    }
    setBusy(true);setError("");
    const app = initializeApp(firebaseConfig,"lgu-application-"+Date.now());
    const candidateAuth=getAuth(app), candidateDb=getFirestore(app), storage=getStorage(app);
    if (usingFirebaseEmulators) {
      connectAuthEmulator(candidateAuth,"http://127.0.0.1:9099",{disableWarnings:true});
      connectFirestoreEmulator(candidateDb,"127.0.0.1",8080);
      connectStorageEmulator(storage,"127.0.0.1",9199); // private local evidence only
    }
    let user:Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"]|null=null;
    let newlyCreated=false;
    let profileCreated=false;
    try {
      const email=form.email.trim().toLowerCase();
      try {
        user=(await createUserWithEmailAndPassword(candidateAuth,email,form.password)).user;
        newlyCreated=true;
      } catch(e:any) {
        if(e?.code!=="auth/email-already-in-use") throw e;
        // Only the existing signed-in applicant may resume an interrupted submission.
        user=(await signInWithEmailAndPassword(candidateAuth,email,form.password)).user;
      }
      const uid=user.uid;
      if(newlyCreated) {
        await setDoc(doc(candidateDb,"users",uid),{
          uid,email,fullName:form.fullName.trim().replace(/\s+/g," "),
          age:0,phoneNumber:"",role:"applicant",status:"pending_review",
          residentAccess:false,volunteerAccess:false,region:"Region III – Central Luzon",
          province:"Bulacan",city:"City of San Jose del Monte",barangay:form.barangay,
          lguOffice:form.lguOffice.trim(),lguPosition:form.lguPosition.trim(),
          appointmentReference:form.appointmentReference.trim(),createdAt:serverTimestamp(),
        });
      } else {
        const existing=await getDoc(doc(candidateDb,"users",uid));
        const profile=existing.data();
        if(!existing.exists() || profile?.role!=="applicant" || profile?.status!=="pending_review" ||
          profile.email!==email ||
          profile.fullName?.trim()!==form.fullName.trim().replace(/\s+/g," ") ||
          profile.lguOffice?.trim()!==form.lguOffice.trim() ||
          profile.appointmentReference?.trim()!==form.appointmentReference.trim()) {
          throw new Error("The account is not an eligible pending LGU application or the saved details do not match. No existing profile was changed.");
        }
        const evidence=await getDoc(doc(candidateDb,"lguApplicantEvidence",uid));
        if(evidence.exists()) {
          setSuccess(true); // Existing protected submission; never rewrite it.
          return;
        }
      }
      profileCreated=true;
      const front = await uploadPrivateImage(storage,uid,"front",images.front!);
      const back = lguIdRequiresBack(idType)
        ? await uploadPrivateImage(storage,uid,"back",images.back!) : "";
      const selfie = await uploadPrivateImage(storage,uid,"selfie",images.selfie!);
      const lguProof = await uploadPrivateImage(storage,uid,"lgu_proof",images.lgu_proof!);
      await setDoc(doc(candidateDb,"lguApplicantEvidence",uid),{
        uid,idType,front,back,selfie,lguProof,
        reviewStatus:"pending_manual_review",
        aiStatus:"not_run",officialOfficeStatus:"unconfirmed",
        consentVersion:"lgu-intake-v1",createdAt:serverTimestamp(),
      });
      void sendEmailVerification(user).catch(()=>undefined);
      setSuccess(true);
    } catch(e:any) {
      // Never delete a pre-existing account after a failed recovery attempt.
      if(user && newlyCreated && !profileCreated) await deleteUser(user).catch(()=>undefined);
      setError(profileCreated
        ? "Submission interrupted. No Admin access was granted. Reopen this form with the same staff details and password to resume securely. Previously uploaded private files remain locked. Never send IDs through chat or email."
        : String(e?.message || "Unable to create or resume this LGU staff application."));
    } finally {
      await signOut(candidateAuth).catch(()=>undefined);
      await deleteApp(app).catch(()=>undefined);
      setBusy(false);
    }
  };

  const photo = (slot: EvidenceSlot, heading:string, explanation:string, live=false) => (
    <View style={styles.photoCard}>
      <View style={styles.photoCopy}>
        <Text style={styles.photoTitle}>{heading}</Text>
        <Text style={styles.help}>{explanation}</Text>
      </View>
      {images[slot] ? (
        <Image source={{uri:images[slot]!.uri}} resizeMode="contain" style={styles.preview}/>
      ) : (
        <View style={styles.placeholder}><Ionicons name={live?"camera-outline":"image-outline"} size={24} color="#417967"/></View>
      )}
      <TouchableOpacity accessibilityRole="button" disabled={busy}
        onPress={()=>void capture(slot,live)} style={styles.photoButton}>
        <Ionicons name={live?"camera-outline":"cloud-upload-outline"} size={17} color="#07725C"/>
        <Text style={styles.photoButtonLabel}>{images[slot]?"Replace image":live?"Capture live selfie":"Choose image"}</Text>
      </TouchableOpacity>
    </View>
  );

  const field = (key:keyof FormFields,title:string,hint:string,options?:{secret?:boolean;email?:boolean;off?:boolean}) => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{title}</Text>
      <TextInput value={form[key]} onChangeText={value=>update(key,value)} editable={!busy}
        placeholder={hint} placeholderTextColor="#92AB9E" style={styles.input}
        autoCorrect={false} secureTextEntry={options?.secret}
        autoCapitalize={options?.email?"none":options?.secret||options?.off?"none":"words"}
        keyboardType={options?.email?"email-address":"default"}
        autoComplete={options?.off?"off":options?.email?"email":options?.secret?"new-password":"off"}
        importantForAutofill={options?.off?"no":"auto"}/>
    </View>
  );
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==="ios"?"padding":undefined}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={[styles.panel,narrow&&styles.panelSmall]}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><Ionicons name="shield-checkmark" color="#FFFFFF" size={23}/></View>
            <View style={{flex:1}}>
              <Text style={styles.kicker}>VOLUNSERVE · LGU STAFF APPLICATION</Text>
              <Text style={styles.title}>Request LGU Admin Access</Text>
              <Text style={styles.help}>Guided application · Government-issued ID only · Manual verification</Text>
              {!privateEvidenceIntakeEnabled&&<Text style={styles.notice}>
                Protected government ID submission is disabled on this release. This form is available for preview only; real sensitive documents cannot be submitted until the privacy and identity-service release gates pass.
              </Text>}
            </View>
          </View>
          {success ? (
            <View style={styles.success}>
              <Ionicons name="checkmark-circle" color="#068360" size={37}/>
              <Text style={styles.successTitle}>Application received</Text>
              <Text style={styles.help}>Your staff profile and private evidence were submitted. This is NOT an AI verification or Admin approval. Super Admin will manually review your identity and confirm employment directly with the LGU office before making a decision.</Text>
              <TouchableOpacity style={styles.submit} onPress={()=>router.replace("/admin-login")}>
                <Text style={styles.submitLabel}>Return to Administration Login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.progressRow}>
                {renderSteps.map((name,index)=>(
                  <TouchableOpacity key={name} disabled={busy||index>step}
                    onPress={()=>{setError("");setStep(index);}}
                    style={[styles.progressDot,index===step&&styles.progressDotActive,index<step&&styles.progressDotDone]}>
                    <Text style={[styles.progressText,index<=step&&styles.progressTextActive]}>{index+1}</Text>
                    {!narrow&&<Text style={[styles.progressName,index<=step&&styles.progressTextActive]} numberOfLines={2}>{name}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.stepCount}>STEP {step+1} OF 5 · {renderSteps[step].toUpperCase()}</Text>
              {step===0&&(
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Official staff information</Text>
                  <Text style={styles.help}>Use your real LGU appointment information. No Admin privileges are created by registration.</Text>
                  {field("fullName","Full legal name","As shown on your government ID")}
                  {field("email","Official work email","name@example.gov.ph",{email:true})}
                  <View style={[styles.grid,narrow&&styles.column]}>
                    <View style={{flex:1}}>{field("lguOffice","LGU department","Official department")}</View>
                    <View style={{flex:1}}>{field("lguPosition","Position / designation","As stated in appointment")}</View>
                  </View>
                  {field("appointmentReference","Appointment memo reference (not an ID number)","Official reference code only",{off:true})}
                  {field("password","Create password","12+ chars, uppercase, lowercase, digit and symbol",{secret:true})}
                  <Text style={styles.label}>Assigned SJDM barangay</Text>
                  <ScrollView nestedScrollEnabled style={styles.barangayList}>
                    {SJDM_BARANGAYS.map(name=>(
                      <TouchableOpacity key={name} accessibilityRole="radio" accessibilityState={{checked:form.barangay===name}}
                        onPress={()=>update("barangay",name)} style={[styles.barangay,form.barangay===name&&styles.barangaySelected]}>
                        <Text style={{color:form.barangay===name?"#FFFFFF":"#1F5747",fontSize:12}}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {!!form.barangay&&<Text style={styles.help}>Selected: {form.barangay}</Text>}
                </View>
              )}
              {step===1&&(
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Government-issued identification</Text>
                  <Text style={styles.help}>School IDs, company IDs and other unsupported cards are not accepted. An uploaded image does not prove that an ID is authentic.</Text>
                  <View style={styles.idChoices}>
                    {LGU_ID_TYPES.map(item=>(
                      <TouchableOpacity key={item.value} accessibilityRole="radio" accessibilityState={{checked:idType===item.value}}
                        onPress={()=>{setIdType(item.value);setImages(old=>({...old,back:undefined}));}} style={[styles.idChoice,item.value===idType&&styles.idChoiceSelected]}>
                        <Ionicons name={item.value===idType?"radio-button-on":"radio-button-off"} size={19} color="#08775D"/>
                        <Text style={styles.choiceText}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {photo("front",idType==="ph_passport"?"Passport identity page":"Government ID front","Photograph the full document clearly; do not crop the name or portrait.")}
                  {lguIdRequiresBack(idType)&&photo("back","Government ID back","The reverse side is mandatory for the selected ID type.")}
                  <Text style={styles.notice}>Selected type is not yet automatically authenticated. OCR and document authenticity checks require an independently tested identity service; manual reviewer validation remains necessary.</Text>
                </View>
              )}
              {step===2&&(
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Live face capture</Text>
                  <Text style={styles.help}>Capture your own face with the camera, in good lighting without filters or accessories covering your face. Your selfie will be kept private for authorized review.</Text>
                  {photo("selfie","Camera selfie","Camera capture only—not a validated liveness or face-match result.",true)}
                  <Text style={styles.notice}>Face comparison and active anti-spoof checks are NOT yet connected for LGU staff. The system will route this evidence for manual checking and never mark it AI verified.</Text>
                </View>
              )}
              {step===3&&(
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>LGU employment confirmation</Text>
                  <Text style={styles.help}>Provide a photograph of an appointment memo, official employment certificate or department authorization. Redact salaries, unrelated names, government numbers and private addresses.</Text>
                  {photo("lgu_proof","Redacted LGU document","JPG, PNG or WebP image up to 4 MB. Document PDF intake requires a separately secured viewer.")}
                  <View style={styles.notice}><Text style={styles.help}>Super Admin will independently call/visit the actual issuing LGU office or arrange in-person identity confirmation using official contact details. This photograph alone does not grant Admin access.</Text></View>
                </View>
              )}
              {step===4&&(
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Review your application</Text>
                  <View style={styles.reviewBox}>
                    <Text style={styles.reviewText}>Applicant: {form.fullName.trim()}</Text>
                    <Text style={styles.reviewText}>Office: {form.lguOffice.trim()}</Text>
                    <Text style={styles.reviewText}>Designation: {form.lguPosition.trim()}</Text>
                    <Text style={styles.reviewText}>Barangay: {form.barangay}</Text>
                    <Text style={styles.reviewText}>ID type: {LGU_ID_TYPES.find(item=>item.value===idType)?.label}</Text>
                    <Text style={styles.reviewText}>Required images: ID, {lguIdRequiresBack(idType)?"back, ":""}selfie, LGU proof</Text>
                    <Text style={styles.reviewText}>AI decision: NOT RUN · Official confirmation: PENDING</Text>
                  </View>
                  <Text style={styles.notice}>{LGU_APPLICATION_NOTICE}</Text>
                  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:consent}}
                    style={styles.consentRow} onPress={()=>setConsent(v=>!v)}>
                    <Ionicons name={consent?"checkbox":"square-outline"} color="#08775D" size={24}/>
                    <Text style={styles.consentText}>I consent to confidential processing of my government ID images, facial photograph and redacted LGU employment proof for staff identity review. I understand that a separate lawful privacy notice, retention schedule and human verification are required before production operation.</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <View style={styles.actions}>
                {step>0&&<TouchableOpacity accessibilityRole="button" disabled={busy}
                  onPress={()=>{setError("");setStep(v=>v-1);}} style={styles.back}>
                  <Ionicons name="arrow-back" color="#17674D" size={16}/>
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>}
                <TouchableOpacity accessibilityRole="button" disabled={busy}
                  onPress={step===4?()=>void submit():next} style={[styles.submit,{flex:1},(busy||(step===4&&!privateEvidenceIntakeEnabled))&&{opacity:0.55}]}>
                  <LinearGradient colors={["#16A580","#006347"]} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFillObject}/>
                  {busy?<ActivityIndicator color="#FFFFFF"/>:(
                    <View style={styles.submitRow}>
                      <Text style={styles.submitLabel}>{step===4?"Submit for independent review":"Continue"}</Text>
                      <Ionicons name="arrow-forward" color="#FFFFFF" size={17}/>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity accessibilityRole="link" disabled={busy}
                onPress={()=>router.replace("/admin-login")} style={styles.returnLink}>
                <Text style={styles.returnText}>Back to LGU Admin Login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#F1FAF4"},
  screen:{alignItems:"center",justifyContent:"center",padding:20,minHeight:"100%"},
  panel:{width:"100%",maxWidth:850,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D4E8DA",
    borderRadius:24,padding:30,shadowColor:"#115D45",shadowOpacity:0.07,shadowRadius:18,elevation:4,gap:13},
  panelSmall:{padding:16,borderRadius:16},header:{flexDirection:"row",gap:14,alignItems:"center",marginBottom:10},
  headerIcon:{width:48,height:48,borderRadius:15,backgroundColor:"#087B5C",alignItems:"center",justifyContent:"center"},
  kicker:{fontSize:10,letterSpacing:1.2,color:"#078165",fontWeight:"800"},
  title:{fontSize:26,lineHeight:31,fontWeight:"900",color:"#103D30",letterSpacing:-0.5,marginVertical:4},
  help:{color:"#698377",fontSize:12,lineHeight:19},
  progressRow:{flexDirection:"row",gap:6,alignItems:"stretch",justifyContent:"space-between"},
  progressDot:{flex:1,flexDirection:"row",gap:6,alignItems:"center",justifyContent:"center",
    minHeight:46,backgroundColor:"#F1F7F3",borderWidth:1,borderColor:"#D6E8DB",
    borderRadius:12,paddingHorizontal:5},
  progressDotActive:{backgroundColor:"#08775D",borderColor:"#08775D"},
  progressDotDone:{backgroundColor:"#DCF4E8",borderColor:"#85C9AE"},
  progressText:{fontWeight:"900",color:"#497A66",fontSize:12},
  progressTextActive:{color:"#FFFFFF"},
  progressName:{fontWeight:"700",fontSize:10,color:"#497A66",flexShrink:1},
  stepCount:{fontSize:11,fontWeight:"900",color:"#078165",letterSpacing:1.1,marginTop:9},
  section:{gap:13,paddingTop:4},sectionTitle:{color:"#164637",fontSize:21,fontWeight:"800"},
  field:{gap:6},label:{color:"#295746",fontSize:12,fontWeight:"800"},
  input:{borderRadius:12,borderColor:"#D3E7DA",borderWidth:1,paddingHorizontal:13,
    minHeight:47,backgroundColor:"#FAFDFB",color:"#133C2D",fontSize:14},
  grid:{flexDirection:"row",gap:12},column:{flexDirection:"column"},
  barangayList:{maxHeight:138,borderRadius:12,borderWidth:1,borderColor:"#D3E7DA"},
  barangay:{minHeight:38,paddingHorizontal:12,justifyContent:"center"},
  barangaySelected:{backgroundColor:"#078264"},
  idChoices:{gap:8},idChoice:{borderWidth:1,borderColor:"#DBE8E0",borderRadius:11,
    padding:13,flexDirection:"row",alignItems:"center",gap:9,backgroundColor:"#FAFCFB"},
  idChoiceSelected:{backgroundColor:"#E9F8EF",borderColor:"#6BBFA2"},
  choiceText:{fontWeight:"800",color:"#255A47",fontSize:13},
  photoCard:{borderRadius:13,borderWidth:1,borderColor:"#C9E6D8",
    padding:12,backgroundColor:"#F5FBF7",gap:9},
  photoCopy:{gap:4},photoTitle:{fontSize:14,color:"#164637",fontWeight:"800"},
  preview:{width:"100%",height:135,backgroundColor:"#EBF2EC",borderRadius:9},
  placeholder:{height:76,backgroundColor:"#EAF5EC",borderRadius:9,alignItems:"center",justifyContent:"center"},
  photoButton:{minHeight:42,flexDirection:"row",alignItems:"center",justifyContent:"center",
    borderRadius:10,borderWidth:1,borderColor:"#91CEB5",gap:8,backgroundColor:"#FFFFFF"},
  photoButtonLabel:{color:"#07725C",fontSize:12,fontWeight:"800"},
  notice:{backgroundColor:"#EDF8F1",borderRadius:11,color:"#416E5C",
    fontSize:12,lineHeight:19,padding:13},
  reviewBox:{padding:14,borderWidth:1,borderColor:"#D6E7DA",backgroundColor:"#FBFDFB",borderRadius:13,gap:8},
  reviewText:{fontSize:12,color:"#264C3D"},
  consentRow:{flexDirection:"row",alignItems:"flex-start",gap:12,padding:12,borderRadius:10,
    backgroundColor:"#F4F9F5"},
  consentText:{flex:1,fontSize:12,lineHeight:19,color:"#375F4C"},
  error:{backgroundColor:"#FFF1EF",padding:13,borderRadius:11,color:"#B2362A",fontSize:12},
  actions:{flexDirection:"row",gap:10},
  back:{paddingHorizontal:17,flexDirection:"row",alignItems:"center",justifyContent:"center",
    gap:7,borderWidth:1,borderRadius:11,borderColor:"#B2D9C4",minHeight:49},
  backText:{color:"#17674D",fontWeight:"800",fontSize:13},
  submit:{minHeight:50,overflow:"hidden",borderRadius:12,backgroundColor:"#08795C",
    alignItems:"center",justifyContent:"center",paddingHorizontal:12},
  submitRow:{flexDirection:"row",gap:9,alignItems:"center",justifyContent:"center"},
  submitLabel:{fontSize:14,color:"#FFFFFF",fontWeight:"800"},
  returnLink:{alignItems:"center",paddingVertical:10},
  returnText:{fontSize:12,color:"#08775D",fontWeight:"700"},
  success:{alignItems:"center",paddingVertical:24,gap:14},
  successTitle:{fontSize:24,fontWeight:"900",color:"#164637"},
});
