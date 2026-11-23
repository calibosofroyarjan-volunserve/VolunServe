/**
 * Authenticated Render alternative to Firebase Cloud Functions.
 * OFF by default until QA and exact env flags; no secrets or polling.
 */
import {auth} from "./firebase";

export const RENDER_EMERGENCY_ORIGIN="render_resident_created_all_volunteers";
const server=(process.env.EXPO_PUBLIC_VOLUNSERVE_BACKEND_URL||
  "https://volunserve.onrender.com").replace(/\/+$/,"");

export const renderEmergencyEnabled=()=>
  process.env.EXPO_PUBLIC_RENDER_EMERGENCY_AUTO_ENABLED==="true";

type APIResult={
  ok?:boolean;
  status?:string;
  reason?:string|null;
  offered?:number;
  newlyCreated?:number;
  message?:string;
};
async function renderEmergencyPost(
  endpoint:"report-submitted"|"respond",
  body:Record<string,string>
):Promise<APIResult>{
  if(!renderEmergencyEnabled())
    throw Error("Render emergency invitations are not enabled for this release.");
  const user=auth.currentUser;
  if(!user)throw Error("Sign in again to continue.");
  const token=await user.getIdToken();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(server+"/api/emergency-auto/"+endpoint,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+token
      },
      body:JSON.stringify(body),
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({})) as APIResult;
    if(!response.ok||data.ok!==true)
      throw Error(data.reason||data.message||"Render auto-invite HTTP "+response.status);
    return data;
  }finally{clearTimeout(timeout);}
}
export async function requestRenderEmergencyAuto(caseId:string){
  return renderEmergencyPost("report-submitted",{caseId});
}
export async function respondRenderEmergencyAuto(
  caseId:string,decision:"accepted"|"declined"
){
  return renderEmergencyPost("respond",{caseId,decision});
}
