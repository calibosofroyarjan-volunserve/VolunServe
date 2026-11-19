import { firebaseConfig } from "./firebase";

/**
 * NO DEPLOY review candidate. Approval-driven automatic invitation handoff.
 * Production website behavior is UNCHANGED until a separately approved
 * build sets the exact public review flag. The server independently requires
 * approved Admin, a verified case and three private release gates.
 */
const BACKEND="https://volunserve.onrender.com";
export const AUTOMATIC_VOLUNTEER_APPROVAL_BRIDGE_ENABLED =
  process.env.EXPO_PUBLIC_VOLUNSERVE_AUTO_INVITES_REVIEWED === "yes" &&
  process.env.EXPO_PUBLIC_VOLUNSERVE_ENV !== "staging" &&
  process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET !== "staging" &&
  firebaseConfig.projectId === "volunserve-3aa5b";

type FirebaseTokenUser={getIdToken:()=>Promise<string>};
type InviteResult={
  enabled:boolean;
  status:"offered"|"already_started"|"blocked"|"disabled"|"unavailable";
  offered:number;
  reason:string;
};
const blocked=(reason:string,enabled:boolean):InviteResult=>({
  enabled,status:enabled?"blocked":"disabled",offered:0,reason
});
export async function requestAutomaticVolunteersAfterApproval({
  caseId,user
}:{
  caseId:string;user:FirebaseTokenUser
}):Promise<InviteResult>{
  if(!AUTOMATIC_VOLUNTEER_APPROVAL_BRIDGE_ENABLED)
    return blocked("feature_not_released",false);
  if(typeof caseId!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(caseId))
    return blocked("invalid_case_id",true);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const token=await user.getIdToken();
    if(typeof token!=="string"||!token)return blocked("sign_in_required",true);
    const response=await fetch(
      BACKEND+"/api/admin/emergency-auto/offer-after-validation",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer "+token
        },
        body:JSON.stringify({caseId}),
        signal:controller.signal
      }
    );
    const json=await response.json().catch(()=>null);
    if(response.ok&&json?.ok===true&&
       (json.status==="offered"||json.status==="already_started")&&
       Number.isSafeInteger(json.offered)&&json.offered>0)
      return {enabled:true,status:json.status,
        offered:json.offered,reason:"server_confirmed"};
    return blocked(
      String(json?.reason||json?.error||"server_did_not_confirm")
        .slice(0,100),true
    );
  }catch{
    return {enabled:true,status:"unavailable",offered:0,
      reason:"invitation_confirmation_unavailable"};
  }finally{clearTimeout(timeout);}
}
