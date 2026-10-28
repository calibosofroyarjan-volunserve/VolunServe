import React from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import {
  getAuth, setPersistence, browserSessionPersistence, connectAuthEmulator,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "firebase/auth";
import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider } from "@aws-amplify/ui-react";
import "./style.css";

// Firebase Web public identifiers are not service-account secrets.
// Backend separately enforces verified-email, applicant role, consent,
// private release approval, session ownership, and zero automatic grants.
const LOCAL=import.meta.env.VITE_USE_FIREBASE_EMULATORS==="true" &&
  ["localhost","127.0.0.1"].includes(location.hostname);
const config=LOCAL ? {
  apiKey:"demo-volunserve-key",authDomain:"demo-volunserve.firebaseapp.com",
  projectId:"demo-volunserve",appId:"demo-volunserve-local-web",
} : {
  apiKey:"AIzaSyAPPi-UxUxyMvoNeaBLUOPOls63dEDLUmI",
  authDomain:"volunserve-3aa5b.firebaseapp.com",
  projectId:"volunserve-3aa5b",
  appId:"1:233201250762:web:c50ff914c6107b1f68df33",
};
const auth=getAuth(initializeApp(config,"volunserve-lgu-live-web"));
if(LOCAL){
  connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
}
async function post(url,body={}){
  const user=auth.currentUser;
  if(!user)throw new Error("Sign in with your existing LGU applicant account.");
  const token=await user.getIdToken(true);
  const response=await fetch(url,{
    method:"POST",cache:"no-store",credentials:"omit",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
    body:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true){
    const common={
      verified_email_required:"Verify your applicant email, then sign in again.",
      active_liveness_not_configured:"Live camera verification is not enabled yet. Your application remains pending.",
      biometric_intake_not_released:"Private identity collection is awaiting security approval.",
      applicant_review_unavailable:"This account has no eligible pending LGU application.",
      liveness_session_in_progress:"A previous session is still active. Resume or try again later.",
      liveness_session_already_issued:"A liveness session is already active. Try again after expiry.",
      manual_review_required:"Your submission needs independent Super Admin review.",
      stream_role_not_configured:"Secure camera streaming is not configured yet.",
      liveness_provider_unavailable:"The secure liveness provider is temporarily unavailable.",
      stream_credentials_unavailable:"The secure video connection could not be authorized.",
      liveness_session_expired:"Your verification session expired. Please restart.",
    };
    throw new Error(common[data.error]||"Secure verification could not continue. Please try again later.");
  }
  return data;
}
const theme={
  name:"volunserve-liveness",
  tokens:{colors:{brand:{primary:{
    10:"#004D39",20:"#006D51",40:"#08775D",60:"#0E9972",80:"#6DC5A0",90:"#CBEFDC",100:"#E9F8EF"
  }}}},
};
function App(){
  const [user,setUser]=React.useState(null);
  const [email,setEmail]=React.useState("");
  const [password,setPassword]=React.useState("");
  const [session,setSession]=React.useState(null);
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState("");
  const [problem,setProblem]=React.useState(false);
  const [finished,setFinished]=React.useState(false);
  React.useEffect(()=>onAuthStateChanged(auth,setUser),[]);
  const begin=async()=>{
    setBusy(true);setProblem(false);setMessage("");
    try{
      const u=auth.currentUser;
      if(!u)throw Error("Sign in to your original applicant account.");
      await u.reload();
      if(!u.emailVerified)throw Error("Verify your email first, then return to continue.");
      const data=await post("/api/lgu-staff/liveness/start");
      if(!/^[a-z]{2}-[a-z]+-\d$/.test(data.region||"")||
        !/^[A-Za-z0-9-]{20,100}$/.test(data.sessionId||"")){
        throw Error("Secure camera session was not available.");
      }
      setSession({id:data.sessionId,region:data.region});
      setFinished(false);
      setMessage("Follow the camera instructions. Keep your face inside the guide.");
    }catch(e){setProblem(true);setMessage(e.message||"Camera verification unavailable.");}
    finally{setBusy(false);}
  };
  const signIn=async(event)=>{
    event.preventDefault();setBusy(true);setProblem(false);setMessage("");
    try{
      await setPersistence(auth,browserSessionPersistence);
      const creds=await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);
      setPassword("");
      if(!creds.user.emailVerified){
        await signOut(auth);
        throw Error("Verify your email address before starting face verification.");
      }
      setMessage("Signed in securely. Start the camera check when ready.");
    }catch(e){setProblem(true);setMessage(e?.message?.includes("Verify")
      ?e.message:"Unable to sign in. Check your applicant credentials and email verification.");}
    finally{setBusy(false);setPassword("");}
  };
  const credentialProvider=React.useCallback(async()=>{
    if(!session)throw Error("No active camera session.");
    const result=await post("/api/lgu-staff/liveness/credentials",{sessionId:session.id});
    const c=result.credentials||{};
    if(!c.accessKeyId||!c.secretAccessKey||!c.sessionToken||!c.expiration)
      throw Error("Temporary AWS streaming credentials were unavailable.");
    // Do not store AWS keys in local/session storage or display them.
    return {accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey,
      sessionToken:c.sessionToken,expiration:new Date(c.expiration)};
  },[session?.id]);
  const checkResult=async()=>{
    if(!session)return;
    setBusy(true);setProblem(false);
    try{
      const data=await post("/api/lgu-staff/liveness/result",{sessionId:session.id});
      if(data.status==="checking_live_presence"){
        setMessage("Your camera recording is being processed. Select Check status to continue.");
      }else{
        setFinished(true);setSession(null);
        setMessage(data.status==="live_presence_checked"
          ?"Camera presence check completed. Your government ID and LGU appointment still require independent Super Admin review."
          :"Additional identity review is required. No Admin privileges were granted.");
      }
    }catch(e){setProblem(true);setMessage(e.message||"Verification needs manual review.");}
    finally{setBusy(false);}
  };
  const logout=async()=>{setSession(null);setFinished(false);setMessage("");await signOut(auth);};
  return <main className="shell"><div className="card">
    <div className="eyebrow">VOLUNSERVE · PROTECTED IDENTITY</div>
    <h1>Secure face verification</h1>
    <p className="explain">A private camera challenge for LGU staff applicants. No match percentages or biometric scores are displayed. Approval is decided separately by the programmer Super Admin.</p>
    <div className="steps"><span className="on"/><span className={user?"on":""}/><span className={session||finished?"on":""}/></div>
    {!user?<form onSubmit={signIn}>
      <h2>Applicant sign in</h2>
      <p className="subtle">Use the account created in your LGU application. Verify your email first.</p>
      <label htmlFor="email">Applicant email</label>
      <input id="email" autoComplete="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
      <label htmlFor="password">Password</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="primary" disabled={busy} type="submit">{busy?"Authenticating…":"Continue securely"}</button>
    </form>:<>
      <p className="subtle">Signed in as {user.email} <button className="secondary" onClick={logout}>Sign out</button></p>
      {session&&!finished?<ThemeProvider theme={theme}>
        <div className="camera">
          <FaceLivenessDetectorCore
            sessionId={session.id}
            region={session.region}
            config={{credentialProvider}}
            onAnalysisComplete={checkResult}
            onUserCancel={()=>{setSession(null);setMessage("Camera check canceled. Your application is still pending.");}}
            onError={()=>{setProblem(true);setSession(null);setMessage("Camera access or liveness check failed. No identity approval was recorded.");}}
          />
        </div>
        <button className="secondary" disabled={busy} onClick={checkResult}>Check status</button>
      </ThemeProvider>:!finished?
        <section><h2>Ready to start?</h2>
          <p className="subtle">Use a supported mobile or desktop browser with a working front camera. Follow the movement and lighting prompts. Never use a printed photo or a replayed recording.</p>
          <button className="primary" disabled={busy} onClick={begin}>{busy?"Connecting…":"Start secure camera check"}</button>
        </section>:<section><h2>Application remains under review</h2>
          <p className="subtle">A live-presence check cannot authenticate your government-issued ID or confirm LGU employment by itself.</p>
        </section>}
    </>}
    {message&&<div className={problem?"result error":"result"} role="status">{message}</div>}
    <p className="foot">Only the official AWS liveness detector performs a video challenge. This page does not grant LGU Admin access. If camera verification is unavailable, your application must be independently reviewed in person. Sensitive production intake stays disabled until authorized.</p>
  </div></main>;
}
createRoot(document.getElementById("root")).render(<App/>);
