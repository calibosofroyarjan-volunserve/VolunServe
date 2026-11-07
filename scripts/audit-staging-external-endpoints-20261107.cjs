"use strict";
// Read-only staging network review. Inventory hardcoded URLs and direct remote calls
// throughout public app screens; any findings require manual verification.
const fs=require("node:fs"),path=require("node:path");
const dirs=["app","lib","components"];
const issues=[];
function walk(dir) {
 if(!fs.existsSync(dir)) return;
 for(const d of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,d.name);
  if(d.isDirectory()) walk(p);
  else if(/\.(ts|tsx|js|jsx)$/.test(d.name)){
    const source=fs.readFileSync(p,"utf8");
    source.split("\n").forEach((line,i)=>{
     if(/volunserve\.onrender\.com|volunserve(-3aa5b)?\.com|volunserve-3aa5b|api\.cloudinary\.com|api\.paymongo\.com|EXPO_PUBLIC_.*URL|\bfetch\s*\(/i.test(line)) {
       issues.push({file:p.replaceAll(path.sep,"/"),line:i+1,text:line.trim().slice(0,200)});
     }
    });
  }
 }
}
dirs.forEach(walk);
const known=["app/(tabs)/donation.tsx","app/(tabs)/resident.tsx","app/(admin)/assistance-requests.tsx","app/(admin)/donation-list.tsx","lib/identityVerification.ts"];
const unresolved = issues.filter(x=>
 x.text.includes("volunserve.onrender.com") &&
 x.file!=="lib/stagingBackendSafety.ts" &&
 !x.text.includes("volunserve.onrender.com\\/api\\/assistance\\/evidence")
);
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync("reports/staging-external-endpoints.json",JSON.stringify({issues,unresolved},null,2));
const md=[
"# VolunServe — staging external endpoint source audit",
"",
"Static source inventory only. This report is not a runtime network security guarantee.",
"All detected outbound calls need staging-only accounts, test data and request tracing before a real hosted staging preview.",
"",
"## Possible direct production Render references",
"",
...(!unresolved.length?["No unresolved literal Render backend URLs in app/lib/components were found."]:unresolved.map(x=>`- \`${x.file}:${x.line}\` — \`${x.text.replaceAll("`","'")}` `)),
"",
"## All external call / URL candidates",
"",
...issues.map(x=>`- \`${x.file}:${x.line}\` — \`${x.text.replaceAll("`","'")}` `),
"",
"Do not deploy this code until separate Firebase, Render, identity AI, Cloudinary and payment-sandbox routing is verified."
].join("\n");
fs.writeFileSync("reports/staging-external-endpoints.md",md);
console.log("STAGING URL CANDIDATES",issues.length,"UNRESOLVED PROD RENDER REFERENCES",unresolved.length);
console.log(unresolved.slice(0,40).map(x=>x.file+":"+x.line+" "+x.text).join("\n"));
for(const f of known) if(!fs.readFileSync(f,"utf8").includes("getSafeVolunServeBackendBaseUrl"))
 throw Error("Staging backend routing missing in "+f);
console.log("PASS: audited five known backend call sites; other candidates are in the downloadable report.");
