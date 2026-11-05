"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const file="app/(tabs)/notifications.tsx";
const source=fs.readFileSync(file,"utf8");
const a=source.indexOf("const routes = {");
const b=source.indexOf("export default function NotificationsScreen()",a);
assert(a>=0 && b>a,"Destination mapping helper not found");
const transpiled=ts.transpileModule(source.slice(a,b),{
  compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None,jsx:ts.JsxEmit.ReactJSX}
}).outputText;
const {categoryOf,destinationFor}=vm.runInNewContext(
  transpiled+"\n({categoryOf,destinationFor});",
  {Date,Number,String,RegExp,Math}
);
const item=(type,title,extra={})=>({type,title,message:"VolunServe has updated your record.",...extra});
const expects=[
  [item("emergency","New VolunServe Volunteer invitation"),true,"/(tabs)/volunteer","Emergency"],
  [item("emergency","Emergency report validated"),false,"/(tabs)/my-cases","Emergency"],
  [item("account","Confirm LGU arrival",{caseId:"case-123"}),false,"/(tabs)/my-cases","Account"],
  [item("emergency","Responder is on the way"),false,"/(tabs)/disaster-response","Emergency"],
  [item("certificate_issued","Volunteer certificate issued",{certificateId:"cert-1"}),true,"/(tabs)/certificate","Events"],
  [item("certificate_issued","Volunteer certificate issued",{certificateId:"cert-1"}),false,"/(tabs)/profile","Events"],
  [item("community_event","Community event attendance confirmed",{eventId:"evt-1"}),false,"/(tabs)/community-events","Events"],
  [item("donation_receipt","Donation receipt issued"),false,"/(tabs)/donation-history","Donations"],
  [item("donation","Donation campaign update",{campaignId:"abc"}),false,"/(tabs)/donation","Donations"],
  [item("public_advisory","Barangay notice issued",{announcementId:"abc"}),false,"/(tabs)/announcements","Announcements"],
  [item("volunteer_contribution_verified","Verified contribution recorded",{assignmentId:"a"}),true,"/(tabs)/volunteer-impact","Emergency"],
  [item("account","Account verification approved"),false,"/(tabs)/profile","Account"],
  [item("","General VolunServe update"),false,"/(tabs)","Account"],
];
for(const [itemData,volunteer,route,category] of expects){
  const dest=destinationFor(itemData,volunteer);
  assert.equal(dest.href,route,"Wrong route for "+itemData.title);
  assert.equal(categoryOf(itemData),category,"Wrong category for "+itemData.title);
  assert(dest.label.startsWith("Open")||dest.label.startsWith("View"),"Unreadable action: "+dest.label);
}
for(const important of [
  'onPress={()=>openNotification(item)}',
  'router.push(destination.href)',
  'if (!item.read) void markAsRead([item.id]);',
  'where("userId", "==", uid)',
  'item.userId === uid',
  'Promise.allSettled',
  'accessibilityLabel="Search notifications"',
  'FILTERS.map(option',
  'setRetryKey(k => k + 1)',
  'PAGE_SIZE = 5',
  'Enable phone alerts',
  'read: true',
]){
  assert(source.includes(important),"Missing Notifications functionality: "+important);
}
assert(!source.includes("router.push(item."),"Notification data cannot create arbitrary destinations");
const protectedModules=["app/(superadmin)/","app/login","app/signup"];
for(const pathname of protectedModules)assert(!file.startsWith(pathname),"Only resident/volunteer Notification UI may change");
console.log("PASS: "+expects.length+" legacy and current notification destinations; filters, search, private read updates, accessibility and push controls.");
