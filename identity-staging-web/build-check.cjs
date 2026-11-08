"use strict";
const fs=require("node:fs");
const html=fs.readFileSync("identity-staging-web/index.html","utf8");
for(const required of ["volunserve-auth-staging","volunserve-backend-staging.onrender.com","/api/identity/engine-health","idBackDocument","signInWithEmailAndPassword"]){
 if(!html.includes(required))throw Error("Missing staging integration: "+required);
}
for(const id of ['national_id','drivers_license','passport','umid']){
 if(!html.includes('<option value="'+id+'">'))throw Error("Missing explicit government ID choice: "+id);
}
if(html.includes('<option value="other_government_id">')||html.includes('<option value="school_id">')){
 throw Error("Unsupported generic or school ID found in selected ID choices");
}
for(const forbidden of ["https://volunserve.onrender.com","volunserve-3aa5b","https://volunserve-identity-ai.onrender.com","https://volunserve.com"]){
 if(html.includes(forbidden))throw Error("Production endpoint in staging page: "+forbidden);
}
for(const f of ["identity-staging-web/camera.js","identity-staging-web/camera-metrics.mjs"]){
 if(!fs.existsSync(f))throw Error("Missing live camera module: "+f);
}
if(!html.includes('<script type="module" src="./camera.js"></script>'))throw Error("Staging camera module not loaded.");
const camera=fs.readFileSync("identity-staging-web/camera.js","utf8");
if(/scanCapture|scanAuto|Capture now/.test(camera))throw Error("Manual shutter must be absent from staging camera");
for(const key of ["getUserMedia","detectForVideo","capture","showModal","MediaPipe".toLowerCase(),"assessDocumentFrame","mode===\"selfie\"?9:13"]){
 if(!camera.toLowerCase().includes(key.toLowerCase()))throw Error("Camera path missing: "+key);
}
for(const forbidden of ["https://volunserve.onrender.com","volunserve-3aa5b","https://volunserve-identity-ai.onrender.com","https://volunserve.com"]){
 if(camera.includes(forbidden))throw Error("Production connection found in camera module: "+forbidden);
}
const {execFileSync}=require("node:child_process");
execFileSync(process.execPath,["--check","--input-type=module"],{input:camera,stdio:["pipe","inherit","inherit"]});
execFileSync(process.execPath,["--test","identity-staging-web/test-camera-metrics.mjs"],{stdio:"inherit"});
console.log("Staging-only camera and identity integration checks passed.");
