"use strict";
/** Source-derived React Native Web browser geometry test: no Firebase/login/writes. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const ts=require("typescript"),React=require("react"),DOM=require("react-dom/server");
const {AppRegistry,View,Text}=require("react-native-web");
const source=fs.readFileSync(path.join(__dirname,"../components/home/Home.web.tsx"),"utf8");
assert(source.includes("narrow ? styles.mobileHomeCard : styles.panel"),"Mobile Home must avoid desktop flex card");
assert(!source.includes("mobilePanel: { flex: 0"),"No zero flex on mobile Home");
assert((source.match(/narrow \? styles\.mobileHomeCard : styles\.panel/g)||[]).length===2,
 "Both Activity and Announcements must use independently sized mobile cards");
const ast=ts.createSourceFile("Home.web.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let obj;
const visit=n=>{
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==="styles"&&
    n.initializer&&ts.isCallExpression(n.initializer)&&
    ts.isObjectLiteralExpression(n.initializer.arguments[0]))obj=n.initializer.arguments[0];
 ts.forEachChild(n,visit);
};
visit(ast);assert(obj,"missing StyleSheet");
function style(k){
 const p=obj.properties.find(x=>ts.isPropertyAssignment(x)&&x.name.getText(ast)===k);
 assert(p,"Missing "+k);
 return new Function("StyleSheet","return ("+p.initializer.getText(ast)+")")({absoluteFillObject:{}});
}
const keys=["mainGrid","mainGridCompact","panel","mobileHomeCard","mobilePanel",
"activityRow","mobileActivityRow","activityCopy","activityTitle","activitySubtitle",
"updateRow","updateCopy","updateTitle","updateMessage","updateDateMobile",
"communityPhoneStack","communityPhoneSection","emergencyPanel"];
const S=Object.fromEntries(keys.map(x=>[x,style(x)]));
assert(!("flex" in S.mobileHomeCard),"Mobile Home card inherited flex; invalid");
assert(!("flex" in S.mobilePanel),"No flex basis override allowed");
const el=(component,props,...children)=>React.createElement(component,props,...children);
const t=(text,style={})=>el(Text,{style},text);
function fixture(w){
 const activities=Array.from({length:3},(_,n)=>
  el(View,{key:n,style:[S.activityRow,S.mobileActivityRow]},
   el(View,{style:{width:38,height:38,borderRadius:19,backgroundColor:"#d8eee7"}}),
   el(View,{style:S.activityCopy},
     t(["Volunteer Assignment Status","Volunteer Progress","Certificates"][n],S.activityTitle),
     t(["No active tasks","Review your verified contributions","View your issued volunteer certificates"][n],S.activitySubtitle),
     t(["Cancelled","View progress","View certificates"][n],{fontSize:11,marginTop:8}))));
 const notices=Array.from({length:3},(_,n)=>
  el(View,{key:n,style:S.updateRow},
   el(View,{style:{width:38,height:38,borderRadius:19,backgroundColor:"#e5eefa"}}),
   el(View,{style:S.updateCopy},
     t(["Verified Donation Campaign","Volunteer Schedule Update","Public Service Advisory"][n],S.updateTitle),
     t("Please review official community services and announcements.",S.updateMessage),
     t("22 Nov 2026",S.updateDateMobile))));
 const a=el(View,{testID:"activity-"+w,style:S.mobileHomeCard},
   t("Your Current Activity",{fontWeight:"700",fontSize:18}),...activities);
 const b=el(View,{testID:"announcements-"+w,style:S.mobileHomeCard},
   t("Announcements",{fontWeight:"700",fontSize:18}),...notices);
 const c=el(View,{testID:"calendar-"+w,style:{backgroundColor:"white",padding:13,minHeight:200,borderRadius:17}},
   t("Community Calendar",{fontWeight:"700",fontSize:18}),
   t("November 2026", {marginTop:20}));
 const members=el(View,{style:{backgroundColor:"white",padding:13,minHeight:190,borderRadius:17}},
   t("Community Members",{fontWeight:"700",fontSize:18}),t("List of approved residents",{marginTop:20}));
 return el(View,{testID:"page-"+w,style:{width:w,paddingHorizontal:11,backgroundColor:"#eef8fd"}},
   el(View,{testID:"grid-"+w,style:[S.mainGrid,S.mainGridCompact]},a,b),
   el(View,{testID:"stack-"+w,style:S.communityPhoneStack},
     el(View,{style:S.communityPhoneSection},members),
     el(View,{style:S.communityPhoneSection},c)),
   el(View,{testID:"contacts-"+w,style:[S.emergencyPanel,S.mobilePanel]},
     t("Emergency Contacts",{fontWeight:"700",fontSize:18})));
}
const widths=[320,360,390,430];
const Component=()=>el(View,{style:{alignItems:"flex-start",padding:12}},...widths.map(w=>el(View,{key:w},
  t("Fixture "+w,{fontSize:18}),fixture(w))));
AppRegistry.registerComponent("MobileHomePanelTest",()=>Component);
const app=AppRegistry.getApplication("MobileHomePanelTest");
const markup=DOM.renderToStaticMarkup(app.element);
const css=DOM.renderToStaticMarkup(app.getStyleElement());
const browserCheck=function(){
 const errors=[];
 const rect=id=>document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect();
 for(const w of [320,360,390,430]){
  const page=rect("page-"+w),activity=rect("activity-"+w),ann=rect("announcements-"+w),
        calendar=rect("calendar-"+w),contacts=rect("contacts-"+w);
  if(activity.height<230)errors.push(w+" activity zero-height "+activity.height);
  if(ann.height<220)errors.push(w+" announcements zero-height "+ann.height);
  if(ann.top<activity.bottom-1)errors.push(w+" Announcements overlaps Activity");
  if(calendar.top<ann.bottom-1)errors.push(w+" Calendar overlaps Announcements");
  const gap=calendar.top-ann.bottom;
  if(gap<0||gap>300)errors.push(w+" Calendar gap "+gap+"px");
  if(contacts.top<calendar.bottom-1)errors.push(w+" Emergency overlaps Calendar");
  const lastGap=contacts.top-calendar.bottom;
  if(lastGap<0||lastGap>90)errors.push(w+" Emergency blank gap "+lastGap+"px");
  if(activity.right>page.right+2||ann.right>page.right+2)errors.push(w+" cards overflow mobile width");
 }
 document.getElementById("qa-result").textContent=errors.length?"FAIL "+errors.join(" | "):"PASS responsive Activity/Announcements panels geometry 320/360/390/430";
};
fs.writeFileSync("/tmp/volunserve-home-panels-qa.html",
 '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#eef8fd;font-family:Arial,sans-serif}</style>'+css+'</head><body>'+markup+
 '<pre id="qa-result">PENDING</pre><script>('+browserCheck.toString()+')();</script></body></html>');
console.log("READY real-style Home card geometry test");
