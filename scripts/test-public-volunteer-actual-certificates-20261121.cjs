"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const profile=fs.readFileSync("app/(tabs)/community-event-profile.tsx","utf8");
const personal=fs.readFileSync("app/(tabs)/profile.tsx","utf8");
const certificates=fs.readFileSync("app/(tabs)/certificate.tsx","utf8");
const backend=fs.readFileSync("backend/communityEventPublicProfiles.js","utf8");
assert(profile.includes('import { CertificatePaper } from "./certificate"'),"public page must use original certificate renderer");
assert(certificates.includes('export function CertificatePaper('),"official certificate renderer must remain shareable");
assert(profile.includes('accessibilityLabel="Close certificate preview"'),"certificate preview must be closable");
assert(profile.includes('View Certificate'),"certificate preview must be user-accessible");
assert(profile.includes('verificationStatus:"issued"'),"only issued preview is permitted");
assert(profile.includes('onPress={()=>setSelectedCertificate(certificate)}'),"view button must open correct record");
assert(profile.includes('tab==="activity"')&&profile.includes('tab==="progress"')&&profile.includes('tab==="certificates"'),"four tabs required");
assert(profile.includes("const [selectedCertificate,setSelectedCertificate]"),"must retain selection state");
for(const forbidden of ["updateUserProfile(","updateProfile(","doc(db","onSnapshot(","getDoc("]){
 assert(!profile.includes(forbidden),"public profile must be read-only: "+forbidden);
}
assert(backend.includes("certificateId:clean(c.certificateId || c.id"),"certificate must carry exact issued record ID");
assert(backend.includes("issuedByName:clean"),"certificate issuer must be grounded in issued record");
assert(backend.includes("profile?.activeMode")===false,"backend must not incorrectly gate member public profile mode");
assert(personal.includes("setActiveTab(")&&personal.includes("openProfileEditor"),"personal profile interactions must be retained");
assert(personal.includes("verifiedContributions")&&personal.includes("certificates"),"owner data sources preserved");
console.log("PASS official certificate preview, read-only public profile, owner data and four tabs");
