"use strict";
// Isolated mobile GPS QA only. No Firebase SDK, credentials, real users or external writes.
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {validateLocation}=require("../backend/communityAttendanceGeofence");
const html=fs.readFileSync(path.join(__dirname,"index.html"));
function send(res,status,body,type="application/json"){
 res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Permissions-Policy":"geolocation=(self)"});
 res.end(type==="application/json"?JSON.stringify(body):body);
}
http.createServer(async(req,res)=>{
 if(req.method==="GET"&&req.url==="/health")return send(res,200,{ok:true,mode:"synthetic-device-qa",firebaseConnected:false,productionWrites:false});
 if(req.method==="GET"&&req.url==="/")return send(res,200,html,"text/html; charset=utf-8");
 if(req.method!=="POST"||req.url!=="/api/qa/location")return send(res,404,{ok:false});
 try{
 let body="";for await(const chunk of req){body+=chunk;if(body.length>4096)return send(res,413,{ok:false,message:"Request too large"});}
 const data=JSON.parse(body);
 if(!["check-in","check-out"].includes(data.action))return send(res,400,{ok:false,message:"Invalid action"});
 const evidence=validateLocation({coordinates:data.venue},data.location);
 return send(res,200,{ok:true,mode:"synthetic-device-qa",...evidence});
 }catch(e){return send(res,e.statusCode||400,{ok:false,code:e.code||"invalid_request",message:e.code?e.message:"Invalid test request."});}
}).listen(Number(process.env.PORT)||10000,"0.0.0.0");
