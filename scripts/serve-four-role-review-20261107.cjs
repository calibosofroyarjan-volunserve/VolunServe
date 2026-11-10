"use strict";
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const dist=path.resolve(process.env.VS_PREVIEW_DIST||"dist");
const mime={
  ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",
  ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
  ".svg":"image/svg+xml",".webp":"image/webp",".ico":"image/x-icon",
  ".woff":"font/woff",".woff2":"font/woff2",".ttf":"font/ttf",
  ".mp4":"video/mp4",
};
const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url||"/","http://localhost").pathname);}
  catch{res.writeHead(400).end();return}
  if(pathname.includes("..")||pathname.includes("\\")||req.method!=="GET"){
    res.writeHead(403).end();return;
  }
  const base=pathname==="/"?"/index.html":pathname;
  const attempts=[base,base+".html",base+"/index.html","/index.html"];
  let file=null;
  for(const attempt of attempts){
    const candidate=path.resolve(dist,"."+attempt);
    if(!candidate.startsWith(dist+path.sep))continue;
    try{if(fs.statSync(candidate).isFile()){file=candidate;break;}}catch{}
  }
  if(!file){res.writeHead(404).end("Not found");return}
  res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","cache-control":"no-store"});
  fs.createReadStream(file).pipe(res);
});
server.listen(8765,"127.0.0.1",()=>console.log("READY isolated static Expo review at 127.0.0.1:8765"));
