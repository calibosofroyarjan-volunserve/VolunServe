import {evaluateLighting} from "./camera-metrics.mjs";
import {assessCameraSample} from "./device-quality.mjs";
// VolunServe STAGING. Camera QA runs locally. Never transmits media or telemetry.
if(location.hostname!=="volunserve-identity-test-staging.onrender.com")throw Error("Staging-only device QA");
const section=document.createElement("section");
section.className="card wide";
section.innerHTML='<h2>4. Test your camera (no upload)</h2><p class="muted">Run this on a laptop and on a phone to check camera permission, actual resolution, frame rate and lighting. No photo, video or device identifier is stored or sent anywhere.</p><div class="actions"><button type="button" id="qaSelfie">Test front/selfie camera</button><button type="button" id="qaRear" class="alt">Test rear/ID camera</button><button type="button" id="qaCopy" class="alt" disabled>Copy diagnostic result</button></div><video id="qaPreview" muted autoplay playsinline style="display:none;width:100%;max-height:260px;object-fit:contain;margin-top:14px;border-radius:12px;background:#092821"></video><div class="result" id="qaResult" role="status">Camera diagnostics have not been run. This does not test face-match accuracy or anti-spoofing.</div>';
document.querySelector(".grid").append(section);
const $=id=>document.getElementById(id);
const video=$("qaPreview");let active=false,stopStream=null,latest=null;
async function measureFrames(vid){
 if(typeof vid.requestVideoFrameCallback==="function"){
   return await new Promise(resolve=>{
     let n=0,first=null,finished=false;let timer=null;
     const end=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve(first===null?null:n*1000/Math.max(100,performance.now()-first))};
     timer=setTimeout(end,2350);
     const next=now=>{if(finished)return;if(first===null)first=now;n++;if(now-first>=1750){end();return;}vid.requestVideoFrameCallback(next)};
     vid.requestVideoFrameCallback(next);
   });
 }
 return await new Promise(resolve=>{
   let n=0,first=performance.now(),last=vid.currentTime,done=false,handle;
   const finish=()=>{if(done)return;done=true;cancelAnimationFrame(handle);resolve(n*1000/Math.max(100,performance.now()-first))};
   const next=()=>{if(done)return;if(vid.currentTime!==last){n++;last=vid.currentTime}if(performance.now()-first>=1800)finish();else handle=requestAnimationFrame(next)};
   handle=requestAnimationFrame(next);setTimeout(finish,2300);
 });
}
function halt(){
 if(stopStream){stopStream.getTracks().forEach(t=>t.stop());stopStream=null}
 video.pause();video.srcObject=null;video.style.display="none";
}
function busy(on){active=on;$("qaSelfie").disabled=on;$("qaRear").disabled=on;$("qaCopy").disabled=on||!latest}
async function run(mode){
 if(active)return;
 busy(true);latest=null;$("qaResult").textContent="Checking camera locally; allow permission in the browser. No images are uploaded.";
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error("Browser has no camera API. Use a secure HTTPS browser.");
  const constraints={audio:false,video:{facingMode:{ideal:mode==="rear"?"environment":"user"},width:{ideal:1280},height:{ideal:720}}};
  try{stopStream=await navigator.mediaDevices.getUserMedia(constraints)}
  catch(err){if(["NotFoundError","OverconstrainedError"].includes(err.name))stopStream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});else throw err}
  video.srcObject=stopStream;video.style.display="block";await video.play();
  const width=video.videoWidth,height=video.videoHeight;
  const fps=await measureFrames(video);
  const sample=document.createElement("canvas");sample.width=120;sample.height=90;
  const ctx=sample.getContext("2d",{willReadFrequently:true});let lighting=null;
  if(ctx&&video.readyState>=2){try{ctx.drawImage(video,0,0,120,90);lighting=evaluateLighting(ctx.getImageData(0,0,120,90).data)}catch{}}
  const report=assessCameraSample({width,height,fps,lighting});
  latest={cameraRequested:mode,resolution:report.resolution,observedFps:report.observedFps,lighting:report.lighting,check:report.status,warnings:report.warnings,limitations:report.note};
  $("qaResult").textContent=JSON.stringify(latest,null,2);
 }catch(err){latest=null;$("qaResult").textContent="Camera check unavailable: "+String(err?.name||err?.message||err).slice(0,200)}
 finally{halt();busy(false)}
}
$("qaSelfie").addEventListener("click",()=>void run("selfie"));
$("qaRear").addEventListener("click",()=>void run("rear"));
$("qaCopy").addEventListener("click",()=>{
 if(!latest)return;
 const value=JSON.stringify(latest,null,2);
 if(navigator.clipboard?.writeText)void navigator.clipboard.writeText(value).then(()=>$("qaResult").textContent=value+"\n\nCopied diagnostic result.").catch(()=>$("qaResult").textContent=value+"\n\nCopy unavailable in this browser.");
 else $("qaResult").textContent=value+"\n\nClipboard API unavailable; select and copy the text.";
});
document.addEventListener("visibilitychange",()=>{if(document.hidden)halt()});
window.addEventListener("pagehide",halt);
