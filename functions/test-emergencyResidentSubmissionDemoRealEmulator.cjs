"use strict";
/**
 * REAL Firebase Auth + Firestore Rules + Functions Emulator test:
 * signed-in Resident SDK submits a normal report (NO Admin approval);
 * ALL eligible Volunteers receive task + notification; secure Accept/Decline;
 * Admin can see statuses; 40+ volunteers use paginated delivery.
 *
 * Refuses real credentials or projects.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth:adminAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {initializeApp:appClient,deleteApp:deleteClient}=require("firebase/app");
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require("firebase/auth");
const {getFirestore:clientDb,connectFirestoreEmulator,
  doc,setDoc,collection,query,where,getDocs,getDoc,
  serverTimestamp}=require("firebase/firestore");
const {getFunctions,connectFunctionsEmulator,httpsCallable}=require("firebase/functions");

const PROJECT="demo-volunserve-simple-invites";
if(process.env.GCLOUD_PROJECT!==PROJECT||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
   process.env.FUNCTIONS_EMULATOR!=="true"||
   process.env.VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED!=="true"||
   process.env.VOLUNSERVE_RESIDENT_SUBMISSION_DEMO_ENABLED!=="true"||
   process.env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID!==PROJECT||
   process.env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED==="true"||
   process.env.VOLUNSERVE_RESIDENT_DEMO_STAGING_APPROVED==="true"||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
 throw Error("Only isolated fiction-only Firebase EMULATOR project allowed");

const app=initializeApp({projectId:PROJECT},"resident_submission_demo");
const db=getFirestore(app),auth=adminAuth(app);
const PASSWORD="FakeEmulatorOnly!29x";
const RESIDENT="qa_fictional_resident";
const ADMIN="qa_fictional_admin";
const VOLUNTEERS=["qa_fictional_vol_a","qa_fictional_vol_b","qa_fictional_vol_c"];
const CASE_A="QA_RESIDENT_SUBMISSION_DEMO_1";
const CASE_B="QA_RESIDENT_SUBMISSION_DEMO_OVER40";
const email=uid=>uid+"@example.invalid";
const ref=(col,id)=>db.collection(col).doc(id);
const clients=[];
async function makeClient(uid){
 const name="client_"+uid+"_"+clients.length;
 const client=appClient({apiKey:"emulator-key",projectId:PROJECT,authDomain:PROJECT+".firebaseapp.com"},name);
 clients.push(client);
 const session=getAuth(client);
 connectAuthEmulator(session,"http://127.0.0.1:9099",{disableWarnings:true});
 if(uid){
  const credentials=await signInWithEmailAndPassword(session,email(uid),PASSWORD);
  assert.equal(credentials.user.uid,uid);
 }
 const store=clientDb(client);
 connectFirestoreEmulator(store,"127.0.0.1",8080);
 const fns=getFunctions(client,"us-central1");
 connectFunctionsEmulator(fns,"127.0.0.1",5001);
 return {store,decide:httpsCallable(fns,"respondToAutoVolunteerInvitation")};
}
function volunteer(uid,overrides={}){
 return {uid,role:"volunteer",activeMode:"volunteer",status:"approved",
  volunteerAccess:true,volunteerStatus:"approved",
  identityVerified:true,fullName:"FICTIONAL "+uid,...overrides};
}
async function seed(){
 for(const uid of [RESIDENT,ADMIN,...VOLUNTEERS]){
  await auth.createUser({uid,email:email(uid),password:PASSWORD,emailVerified:true});
 }
 const batch=db.batch();
 batch.set(ref("users",RESIDENT),{uid:RESIDENT,role:"resident",
  status:"approved",residentAccess:true,activeMode:"resident"});
 batch.set(ref("users",ADMIN),{uid:ADMIN,role:"admin",status:"approved",adminStatus:"active"});
 for(const uid of VOLUNTEERS){
  batch.set(ref("users",uid),volunteer(uid));
  batch.set(ref("volunteerApplications",uid),{uid,status:"approved"});
 }
 // Ineligible must receive nothing even if an application exists.
 batch.set(ref("users","qa_pending_vol"),volunteer("qa_pending_vol",{volunteerStatus:"pending"}));
 batch.set(ref("volunteerApplications","qa_pending_vol"),{uid:"qa_pending_vol",status:"approved"});
 await batch.commit();
}
function reportPayload(){
 return {
  reporterUid:RESIDENT,reporterName:"FICTIONAL QA Resident",
  reporterEmail:email(RESIDENT),reporterBarangay:"Bagong Buhay I",
  reporterAddress:"FICTIONAL QA Address",contactNumber:"09170000001",
  emergencyContact:"09170000002",reporterProfilePictureUrl:"",
  source:"resident_emergency_assistance",requestKind:"emergency_assistance",
  title:"TEST ONLY - Fictional Resident Emergency Report",
  category:"Medical",severity:"low",status:"reported",
  verificationStatus:"pending_verification",evidenceReviewStatus:"pending_review",
  location:"FAKE Bulacan test location",latitude:14.817,longitude:121.06,
  gpsAccuracyMeters:5,locationCapturedAt:serverTimestamp(),
  details:"FICTIONAL testing case. There is no actual emergency.",
  affectedPeople:1,assistanceTypes:["First Aid"],requiredSkills:["First Aid"],
  neededGoods:["Water"],needsNote:"TEST ONLY",needs:"TEST ONLY - fictional response",
  attachments:[{type:"image",url:"https://example.invalid/fake.jpg"}],
  photoEvidenceCount:1,videoEvidenceCount:0,verification:{},
  residentConfirmationAccepted:true,residentConfirmationAt:serverTimestamp(),
  privacyScope:"admin_and_assigned_responder",requiredVolunteers:0,
  assignedVolunteersCount:0,assignedVolunteerIds:[],adminNote:"",
  validatedAt:null,validatedBy:null,assignedAt:null,resolvedAt:null,closedAt:null,
  createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
 };
}
async function poll(predicate,description,timeout=90000){
 const until=Date.now()+timeout;
 while(Date.now()<until){
  const result=await predicate();
  if(result)return result;
  await new Promise(resolve=>setTimeout(resolve,400));
 }
 throw Error("Timed out waiting for "+description);
}
async function offers(caseId){
 return (await db.collection("responseAssignments").where("caseId","==",caseId).get())
  .docs.filter(d=>d.data().offerMode==="automatic_resident_submission_demo");
}
test("Resident Auth SDK SUBMIT creates offers and notifications WITHOUT Admin action",async()=>{
 await seed();
 const resident=await makeClient(RESIDENT);
 await setDoc(doc(resident.store,"disasterCases",CASE_A),reportPayload());
 // Creation, not Admin validation, must start the event.
 await poll(async()=>{
  const s=await ref("emergencyAutoDispatchBatches",CASE_A).get();
  return s.exists&&s.data().status==="waiting"&&s.data().volunteerCount===3;
 },"Resident submission -> 3 automatic offers");
 const rows=await offers(CASE_A);
 assert.deepEqual(rows.map(d=>d.data().volunteerId).sort(),[...VOLUNTEERS].sort());
 const caseSnap=await ref("disasterCases",CASE_A).get();
 assert.equal(caseSnap.data().status,"assigned");
 assert.equal(caseSnap.data().autoVolunteerDispatch.origin,"automatic_resident_submission_demo");
 assert.equal(caseSnap.data().verificationStatus,"pending_verification",
  "No Admin approval was requested for this fictional demo");
 assert.equal((await ref("responseAssignments",CASE_A+"_qa_pending_vol").get()).exists,false);
 for(const uid of VOLUNTEERS){
  const n=await ref("notifications","auto_response_"+CASE_A+"_"+uid).get();
  assert.equal(n.data().userId,uid);
  const volunteerClient=await makeClient(uid);
  const ownTasks=await getDocs(query(collection(volunteerClient.store,"responseAssignments"),
    where("volunteerId","==",uid)));
  assert.equal(ownTasks.docs.filter(d=>d.id===CASE_A+"_"+uid).length,1);
  const ownNotes=await getDocs(query(collection(volunteerClient.store,"notifications"),
    where("userId","==",uid)));
  assert.ok(ownNotes.docs.some(d=>d.id==="auto_response_"+CASE_A+"_"+uid),
    "Same invitation appears in Notifications and Volunteer Tasks");
  const details=await getDoc(doc(volunteerClient.store,"disasterCases",CASE_A));
  assert.equal(details.exists(),true,"Invited Volunteer can read fictional case details");
 }
});
test("Volunteer Accept / Decline persists in SAME Firestore records; Admin monitors",async()=>{
 const volunteerClients=await Promise.all(VOLUNTEERS.map(makeClient));
 const decisions=["accepted","accepted","declined"];
 for(let i=0;i<3;i++){
  const result=await volunteerClients[i].decide({caseId:CASE_A,decision:decisions[i]});
  assert.equal(result.data.status,decisions[i]);
 }
 const statuses=(await offers(CASE_A)).map(s=>s.data().status).sort();
 assert.deepEqual(statuses,["accepted","accepted","declined"]);
 const admin=await makeClient(ADMIN);
 const adminCases=await getDocs(query(collection(admin.store,"disasterCases")));
 assert.ok(adminCases.docs.some(d=>d.id===CASE_A),"Admin can see report");
 const adminTasks=await getDocs(query(collection(admin.store,"responseAssignments")));
 assert.deepEqual(adminTasks.docs.filter(d=>d.data().caseId===CASE_A).map(d=>d.data().status).sort(),
  ["accepted","accepted","declined"]);
 assert.equal((await ref("responderLocks",VOLUNTEERS[0]).get()).exists,true);
 assert.equal((await ref("responderLocks",VOLUNTEERS[1]).get()).exists,true);
 assert.equal((await ref("responderLocks",VOLUNTEERS[2]).get()).exists,false);
});
test("Paginated Resident submission reaches ALL 43+ available fictional Volunteers, not a 40 limit",async()=>{
 const batch=db.batch();
 const extra=Array.from({length:43},(_,i)=>"qa_over40_"+String(i).padStart(3,"0"));
 for(const uid of extra){
  batch.set(ref("users",uid),volunteer(uid));
  batch.set(ref("volunteerApplications",uid),{uid,status:"approved"});
 }
 await batch.commit();
 const resident=await makeClient(RESIDENT);
 await setDoc(doc(resident.store,"disasterCases",CASE_B),reportPayload());
 await poll(async()=>{
  const s=await ref("emergencyAutoDispatchBatches",CASE_B).get();
  return s.exists&&s.data().status==="waiting"&&s.data().volunteerCount>=43;
 },"all eligible >40 volunteers",180000);
 const list=await offers(CASE_B);
 const recipients=new Set(list.map(x=>x.data().volunteerId));
 for(const uid of extra)assert.ok(recipients.has(uid),"Missing fictional Volunteer "+uid);
 assert.ok(recipients.size>=43,"All 43 must be invited");
 const count=await db.collection("notifications")
  .where("caseId","==",CASE_B).get();
 assert.ok(count.size>=43,"Notification inbox must reach each eligible Volunteer");
});
test.after(async()=>{
 await Promise.all(clients.map(deleteClient));
 await deleteApp(app);
});
