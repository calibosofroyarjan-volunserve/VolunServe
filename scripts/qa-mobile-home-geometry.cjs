"use strict";
/**
 * QA-only browser geometry harness with synthetic member names, no login.
 * Extracts the REAL React Native Web styles from current source instead of
 * hand-creating CSS. Never used by production app runtime.
 */
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const ts=require("typescript");
const React=require("react");
const ReactDOMServer=require("react-dom/server");
const {AppRegistry,View,Text}=require("react-native-web");
const assert=require("node:assert/strict");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const home=read("components/home/Home.web.tsx");
const online=read("components/home/CommunityOnline.tsx");
const calendar=read("components/home/CommunityCalendar.tsx");
assert(home.includes("{narrow ? ("),"mobile Home needs dedicated render branch");
assert(home.includes("<View style={styles.communityPhoneStack}>"));
assert(home.includes("<View style={styles.communityPhoneSection}>"));
assert(online.includes("dashboard&&compact?styles.dashboardMemberMobile"),"independent mobile cards");
assert(online.includes("dashboard&&compact?styles.dashboardIdentityMobile"),"independent mobile identities");
assert(online.includes('member.isSelf?<Text style={styles.youLabel}> (You)</Text>'));
assert(online.includes("nestedScrollEnabled showsVerticalScrollIndicator"));
assert(online.includes("const displayed=filtered;"));
assert(calendar.includes("eventDates.has(date)"));
function getStyles(file,keys){
  const src=read(file);
  const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let obj=null;
  const walk=node=>{
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==="styles"&&
       node.initializer&&ts.isCallExpression(node.initializer)&&
       node.initializer.arguments[0]&&ts.isObjectLiteralExpression(node.initializer.arguments[0]))
      obj=node.initializer.arguments[0];
    ts.forEachChild(node,walk);
  };
  walk(ast);
  assert(obj,"Missing StyleSheet.create for "+file);
  const out={};
  for(const key of keys){
    const prop=obj.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)===key);
    assert(prop,"Missing "+key+" in "+file);
    const expr=prop.initializer.getText(ast);
    out[key]=new Function("GREEN","StyleSheet","return ("+expr+");")("#0B8068",{absoluteFillObject:{}});
  }
  return out;
}
const H=getStyles("components/home/Home.web.tsx",["communityPhoneStack","communityPhoneSection","emergencyPanel"]);
const M=getStyles("components/home/CommunityOnline.tsx",[
  "panel","dashboardMobilePanel","memberScroll","dashboardMemberScroll",
  "dashboardMobileMemberScroll","memberScrollInner","dashboardGridMobile",
  "dashboardMemberMobile","dashboardIdentityMobile","dashboardNameMobileText",
  "dashboardBadgeMobileText","dashboardPresenceText"]);
const C=getStyles("components/home/CommunityCalendar.tsx",[
  "panel","dashboardMobilePanel","monthHeader","days","dayCell",
  "dashboardDayCell","dashboardMobileDayCell","dayButton","dashboardMobileDayButton"]);
const el=(type,props,...children)=>React.createElement(type,props,...children);
function fixture(w){
  const row=n=>el(View,{style:M.dashboardMemberMobile,testID:"member-"+w+"-"+n,key:n},
    el(View,{style:M.dashboardIdentityMobile},
      el(View,{style:{width:40,height:40,borderRadius:20,backgroundColor:"#24765F",alignItems:"center",justifyContent:"center"}},
        el(Text,{style:{color:"#fff"}},String.fromCharCode(65+n%26))),
      el(View,{style:{flexGrow:1,flexShrink:1,minWidth:0}},
        el(Text,{style:M.dashboardNameMobileText},n===0?"Current Resident (You)":"Community Volunteer "+n),
        el(Text,{style:M.dashboardBadgeMobileText},n%3===0?"Verified Resident":"Volunteer"),
        el(Text,{style:M.dashboardPresenceText},n%4===0?"Online now":"Offline"))));
  const rows=Array.from({length:12},(_,i)=>row(i));
  const member=el(View,{testID:"members-"+w,style:[M.panel,M.dashboardMobilePanel]},
    el(Text,{style:{fontWeight:"700",fontSize:18}},"Community Members"),
    el(View,{testID:"member-scroll-"+w,style:[M.memberScroll,M.dashboardMemberScroll,M.dashboardMobileMemberScroll,{overflow:"auto"}]},
      el(View,{style:[M.memberScrollInner,M.dashboardGridMobile]},...rows)));
  const dates=Array.from({length:35},(_,n)=>
    el(View,{key:n,style:[C.dayCell,C.dashboardDayCell,C.dashboardMobileDayCell]},
      el(View,{style:[C.dayButton,C.dashboardMobileDayButton]},
        el(Text,null,String(n%30+1)))));
  const cal=el(View,{testID:"calendar-"+w,style:[C.panel,C.dashboardMobilePanel]},
    el(Text,{style:{fontWeight:"700",fontSize:18}},"Community Calendar"),
    el(View,{style:C.monthHeader},el(Text,null,"November 2026")),
    el(View,{style:C.days},...dates));
  const contacts=el(View,{testID:"contacts-"+w,style:[H.emergencyPanel,{padding:16}]},el(Text,null,"Emergency Contacts"));
  return el(View,{testID:"root-"+w,style:{width:w,backgroundColor:"#ECF7FD",padding:10,marginBottom:18}},
    el(View,{testID:"stack-"+w,style:H.communityPhoneStack},
      el(View,{style:H.communityPhoneSection},member),
      el(View,{style:H.communityPhoneSection},cal)),
    contacts);
}
const widths=[320,360,390,430];
const Main=()=>el(View,{style:{alignItems:"flex-start",padding:12}},...widths.map(w=>
  el(View,{key:w},el(Text,null,"Viewport fixture "+w),fixture(w))));
AppRegistry.registerComponent("HomeMobileFixture",()=>Main);
const {element,getStyleElement}=AppRegistry.getApplication("HomeMobileFixture");
const body=ReactDOMServer.renderToStaticMarkup(element);
const css=ReactDOMServer.renderToStaticMarkup(getStyleElement());
function browserCheck(){
 const widths=[320,360,390,430], errors=[];
 const rect=id=>document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect();
 for(const w of widths){
   const root=rect("root-"+w), mem=rect("members-"+w), cal=rect("calendar-"+w), contacts=rect("contacts-"+w);
   if(mem.height<150||mem.height>780)errors.push(w+": members panel unreasonable height "+mem.height);
   if(cal.height<220||cal.height>780)errors.push(w+": calendar panel unreasonable height "+cal.height);
   if(cal.top<mem.bottom-2)errors.push(w+": calendar overlaps members");
   const gap=contacts.top-cal.bottom;
   if(gap<0||gap>90)errors.push(w+": blank/overlap before contacts gap="+gap);
   if(mem.right>root.right+2||cal.right>root.right+2)errors.push(w+": panel overflows page");
   const scroll=document.querySelector('[data-testid="member-scroll-'+w+'"]');
   if(scroll.clientHeight>365)errors.push(w+": member scroll not bounded");
   if(scroll.scrollHeight<=scroll.clientHeight)errors.push(w+": directory must scroll");
   for(let i=0;i<12;i++){
     const row=rect("member-"+w+"-"+i);
     if(row.width<w-65)errors.push(w+": avatar row too narrow "+row.width);
     if(row.right>mem.right+2)errors.push(w+": row overflows panel");
   }
 }
 document.getElementById("qa-result").textContent=errors.length?"FAIL "+errors.join(" | "):"PASS mobile browser geometry at 320/360/390/430";
}
const checks="("+browserCheck.toString()+")();";
const target=path.join(os.tmpdir(),"volunserve-mobile-layout-geometry.html");
fs.writeFileSync(target,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#eef8fd;font-family:Arial,sans-serif}</style>'+css+'</head><body>'+body+'<pre id="qa-result">PENDING</pre><script>'+checks+'</script></body></html>');
console.log("READY browser geometry fixture: "+target);
