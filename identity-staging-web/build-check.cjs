"use strict";
const fs=require("node:fs");
const html=fs.readFileSync("identity-staging-web/index.html","utf8");
for(const required of ["volunserve-auth-staging","volunserve-backend-staging.onrender.com","/api/identity/engine-health","idBackDocument","signInWithEmailAndPassword"]){
 if(!html.includes(required))throw Error("Missing staging integration: "+required);
}
for(const forbidden of ["https://volunserve.onrender.com","volunserve-3aa5b","https://volunserve-identity-ai.onrender.com","https://volunserve.com"]){
 if(html.includes(forbidden))throw Error("Production endpoint in staging page: "+forbidden);
}
console.log("Staging-only identity website checks passed.");
