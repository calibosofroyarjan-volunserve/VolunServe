"use strict";
const t=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");
const owner=read("app/(tabs)/profile.tsx");
const shared=read("app/(tabs)/community-event-profile.tsx");
const gallery=read("components/profile/IssuedCertificateGallery.tsx");
const cert=read("app/(tabs)/certificate.tsx");
t("Volunteer profile has exactly three visible tabs, preserving resident reports separately",()=>{
 a(owner.includes('currentMode !== "volunteer" ? [{key:"activity"'),"Volunteer Activity tab should be merged, resident reports preserved");
 a(shared.includes('type Tab = "info" | "progress" | "certificates"'));
 a(shared.includes('{key:"certificates",label:"Certificates"}'));
 a(!shared.includes('tab==="activity"'));
 a(owner.includes('<VolunteerImpact embedded />'));
 a(owner.includes('Verified Volunteer Activity'));
 a(shared.includes('profile.activity.length===0'));
});
t("Own profile retains existing editor and private fields",()=>{
 a(owner.includes("onPress={openProfileEditor}"));
 a(owner.includes("<IdentityAccessCard"));
 for(const word of ["Personal Details","Contact Information","Volunteer Status","setSelectedIssuedCertificate","onAuthChange"]){
  a(owner.includes(word),word);
 }
});
t("Gallery uses true issued records and original certificate artwork only",()=>{
 a(cert.includes("export function CertificateMiniPreview"));
 a(cert.includes("export function CertificatePaper"));
 a(gallery.includes("CertificateMiniPreview"));
 a(gallery.includes('toLowerCase() === "issued"'));
 a(gallery.includes("onView(record)"));
 a(owner.includes("<IssuedCertificateGallery"));
 a(shared.includes("<IssuedCertificateGallery"));
 a(owner.includes("<CertificatePaper"));
 a(shared.includes("<CertificatePaper"));
 a(!gallery.includes("mockCertificate"));
});
t("Public profile stays read only and continues using authenticated backend",()=>{
 a(shared.includes("getIdToken()"));
 a(shared.includes("Authorization:"));
 for(const forbidden of ["updateUserProfile(", "getDoc(", "onSnapshot(", "doc(db","Edit Profile"]){
  a(!shared.includes(forbidden),forbidden);
 }
});
