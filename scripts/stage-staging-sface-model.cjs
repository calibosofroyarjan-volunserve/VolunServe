"use strict";
/**
 * STAGING STATIC BUILD ONLY. Download only the official Apache-2.0 OpenCV
 * SFace model and license, verify SHA256 before publishing on the same origin.
 * This moves public model delivery to the static site; NO personal media.
 *
 * The calling release guard checks exact Render service, branch, and host.
 * Do not invoke from production or from any identity verification endpoint.
 */
const {createHash}=require("node:crypto");
const {mkdir,writeFile,rename,rm}=require("node:fs/promises");
const {join}=require("node:path");

const MODEL_SHA256="0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79";
const MODEL_SOURCES=[
 "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
 "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx",
 // Official upstream Git LFS media endpoint (no Hugging Face/Xet redirects).
 "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
 "https://github.com/opencv/opencv_zoo/raw/refs/heads/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
];
const LICENSE_SOURCES=[
 "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/LICENSE",
 "https://huggingface.co/opencv/face_recognition_sface/resolve/main/LICENSE",
];
const MODEL_FILE="staging-sface-2021dec.onnx";
const LICENSE_FILE="staging-sface-2021dec-LICENSE.txt";
const MODEL_MIN=30*1024*1024;
const MODEL_MAX=45*1024*1024;

async function fetchBounded(url,maxBytes){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),150000);
 try{
  const response=await fetch(url,{
   signal:controller.signal,redirect:"follow",
   headers:{"accept":"application/octet-stream"},
  });
  if(!response.ok || !response.body) throw Error("source_unavailable");
  const sizeHeader=Number(response.headers.get("content-length")||0);
  if(sizeHeader>maxBytes)throw Error("source_oversize");
  const chunks=[];let total=0;
  for await(const part of response.body){
   const bytes=Buffer.from(part);
   total+=bytes.length;
   if(total>maxBytes){controller.abort();throw Error("source_oversize");}
   chunks.push(bytes);
  }
  return Buffer.concat(chunks,total);
 }finally{clearTimeout(timeout);}
}
async function fetchPinnedSFace(){
 for(let i=0;i<MODEL_SOURCES.length;i++){
  try{
   const bytes=await fetchBounded(MODEL_SOURCES[i],MODEL_MAX);
   if(bytes.length<MODEL_MIN)continue;
   const actual=createHash("sha256").update(bytes).digest("hex");
   if(actual===MODEL_SHA256)return bytes;
  }catch{/* Try the next official OpenCV source. */}
  console.warn("STAGING SFace: official model source "+(i+1)+" unavailable or checksum invalid");
 }
 throw Error("pinned_sface_download_or_integrity_failed");
}
async function fetchApacheLicense(){
 for(const url of LICENSE_SOURCES){
  try{
   const bytes=await fetchBounded(url,30*1024);
   const license=bytes.toString("utf8");
   if(license.length>9000 && license.startsWith("Apache License") &&
      license.includes("Version 2.0") && license.includes("END OF TERMS AND CONDITIONS"))
     return license;
  }catch{/* Try next official publisher license. */}
 }
 throw Error("official_sface_license_unavailable");
}
async function stagePinnedSFaceStaticAssets(){
 const [model,license]=await Promise.all([fetchPinnedSFace(),fetchApacheLicense()]);
 const dir=join(process.cwd(),"public");
 await mkdir(dir,{recursive:true});
 const modelPath=join(dir,MODEL_FILE);
 const tmp=modelPath+".tmp";
 try{
  await writeFile(tmp,model);
  await rename(tmp,modelPath);
  await writeFile(join(dir,LICENSE_FILE),license,"utf8");
 }catch(error){
  await rm(tmp,{force:true}).catch(()=>{});
  await rm(modelPath,{force:true}).catch(()=>{});
  throw error;
 }
 console.log("STAGING SFace: official Apache-2.0 model and license bundled as static assets; SHA256 verified ("+MODEL_SHA256+").");
 return {modelFile:MODEL_FILE,licenseFile:LICENSE_FILE,sha256:MODEL_SHA256};
}
module.exports={fetchPinnedSFace,stagePinnedSFaceStaticAssets,MODEL_SHA256,MODEL_FILE};
