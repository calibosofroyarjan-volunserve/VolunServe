import { auth } from "./firebase";
import { identityAdminApiBaseUrl } from "./identityEnvironmentTarget";

export type CommunityMode = "resident" | "volunteer";
export type CommunityMember = {
  key: string;
  name: string;
  avatarUrl?: string;
  mode: CommunityMode;
  verified: boolean;
  badge: string;
  online: boolean;
  presencePrivate?: boolean;
  lastSeenAt: string | null;
  sharesLastSeen?: boolean;
  acceptChats: boolean;
  isSelf?: boolean;
};
export type CommunityMessage = {
  id: string;
  text: string;
  fromMe: boolean;
  sentAt: string | null;
};
export type CommunityConversation = {
  peer: CommunityMember;
  lastMessage: string;
  lastMessageAt: string | null;
  lastSenderIsMe: boolean;
};
export const philippinesTime = (value: string) =>
  new Date(value).toLocaleString("en-PH",{
    timeZone:"Asia/Manila",month:"short",day:"numeric",
    hour:"numeric",minute:"2-digit",
  });
const manilaDay = (value: Date) =>
  new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit",
  }).format(value);
export function memberLastSeen(person:CommunityMember):string {
  if(person.online)return "Online now";
  if(person.presencePrivate)return "Status private";
  if(!person.lastSeenAt)return person.sharesLastSeen?"Last seen unavailable":"Offline";
  const date=new Date(person.lastSeenAt);
  if(Number.isNaN(date.getTime()))return "Offline";
  const day=manilaDay(date),today=manilaDay(new Date());
  const time=date.toLocaleTimeString("en-PH",{
    timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit",
  });
  if(day===today)return "Last seen today, "+time;
  const yesterday=manilaDay(new Date(Date.now()-86400000));
  if(day===yesterday)return "Last seen yesterday, "+time;
  return "Last seen "+philippinesTime(person.lastSeenAt);
}
export async function communitySocialRequest<T>(
  path:string,
  method:"GET"|"POST"="GET",
  body?:object,
):Promise<T> {
  // Resolve environment before reading an ID token: an isolated staging
  // session may never contact the production messages endpoint.
  const apiUrl = identityAdminApiBaseUrl({
    runtimeEnv: process.env.EXPO_PUBLIC_VOLUNSERVE_ENV,
    firebaseTarget: process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET,
    projectId: auth.app.options.projectId,
  });
  if (!path.startsWith("/api/community/")) {
    throw new Error("Unsupported community endpoint.");
  }
  const current=auth.currentUser;
  if(!current)throw new Error("Sign in again to use Community Members.");
  const token=await current.getIdToken();
  const response=await fetch(apiUrl+path,{
    method,
    headers:{
      Authorization:"Bearer "+token,
      ...(body?{"Content-Type":"application/json"}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  let payload:any;
  try {payload=await response.json();} catch {payload={};}
  if(!response.ok||payload?.ok!==true){
    throw new Error(payload?.message||"Community service is unavailable. Please try again.");
  }
  return payload as T;
}
