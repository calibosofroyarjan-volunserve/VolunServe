import {evaluateLighting,assessFaceBoxes,frameDifference,assessDocumentFrame} from "./camera-metrics.mjs";
import {ACTIONS,generateChallenge,faceSignals,createChallengeState,advanceChallenge} from "./face-challenge.mjs";
import {cameraErrorMessage,videoInputList,cameraConstraints} from "./camera-device.mjs";
// Staging-only live camera guidance. Camera tracking != liveness or ID authentication.
const $=id=>document.getElementById(id);
if(location.hostname!=="volunserve-identity-test-staging.onrender.com")throw Error("Staging-only camera guard");
const TYPES={front:{label:"Scan ID front",facing:"environment"},back:{label:"Scan ID back",facing:"environment"},selfie:{label:"Live face scan",facing:"user"}};
const css=document.createElement("style");
css.textContent='.scan-card{border:1px solid #d3e5dc;border-radius:14px;padding:15px;display:flex;justify-content:space-between;align-items:center;gap:12px;background:#f9fcfa;flex-wrap:wrap}.scan-main{display:flex;align-items:center;gap:12px;min-width:0}.scan-thumb{width:68px;height:54px;object-fit:cover;border-radius:9px;border:1px solid #c5dcd0}.scan-symbol{display:grid;place-items:center;width:54px;height:54px;border-radius:12px;background:#e0f1e8;color:#12674f;font-size:25px}.scan-title{font-weight:800;font-size:13px;color:#183f33}.scan-sub{font-size:11px;color:#648173;margin-top:4px}.scan-actions{display:flex;gap:8px;flex-wrap:wrap}.upload-backup{font-size:12px;color:#59796b}.upload-backup summary{cursor:pointer;padding:8px}.upload-backup input{margin-top:7px;display:block}#scanModal{width:min(95vw,580px);max-height:95vh;border:0;padding:0;border-radius:20px;box-shadow:0 18px 80px #071c1980;background:#fff;color:#123e32}#scanModal::backdrop{background:#071b16ba}#scanModal .scan-modal-head{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px}#scanModal h3{font-size:18px;margin:0}#scanModal .cam-view{background:#071b16;position:relative;overflow:hidden;aspect-ratio:4/3}#scanVideo{width:100%;height:100%;object-fit:contain;display:block}#scanOverlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#scanModal .frame-guide{position:absolute;inset:15% 9%;border:3px solid #64dbac;border-radius:15px;pointer-events:none}#scanModal .frame-guide.face{inset:15% 27%;border-radius:48%}#scanModal .mirror{transform:scaleX(-1)}#scanModal .scan-modal-body{padding:16px 20px}#scanModal .cam-note{font-size:12px;color:#61796d;line-height:1.5}#scanModal .cam-status{font-size:13px;font-weight:750;background:#edf8f2;color:#195a49;border-radius:10px;padding:12px;min-height:44px;margin:10px 0}#scanModal .scan-controls{display:flex;gap:9px;justify-content:space-between;flex-wrap:wrap}.scan-card button:focus-visible,#scanModal button:focus-visible{outline:3px solid #f6c353;outline-offset:2px}';
document.head.append(css);
const cards=document.createElement("div");cards.className="stack";cards.id="cameraStageCards";
$("type").closest("label").after(cards);
const previews={};
for(const stage of ["front","back","selfie"]){
 const input=$(stage),label=input.closest("label");
 input.required=false; // JS file() validation handles empty uploads, not invisible required inputs.
 const fallback=document.createElement("details");fallback.className="upload-backup";
 const summary=document.createElement("summary");summary.textContent=stage==="selfie"?"QA-only: preview a test face image (never sent for verification)":"Camera unavailable? Choose a test image instead";
 fallback.append(summary);label.before(fallback);fallback.append(label);
 const card=document.createElement("div");card.className="scan-card";card.dataset.stage=stage;
 card.innerHTML='<div class="scan-main"><span class="scan-symbol" aria-hidden="true">▣</span><img class="scan-thumb hidden" alt="Captured test image preview"><div><div class="scan-title"></div><div class="scan-sub" aria-live="polite">Not captured yet</div></div></div><div class="scan-actions"><button type="button" class="scan-open">Open camera</button><button type="button" class="alt scan-clear hidden">Retake</button></div>';
 card.querySelector(".scan-title").textContent=TYPES[stage].label;
 card.querySelector(".scan-open").addEventListener("click",()=>start(stage));
 card.querySelector(".scan-clear").addEventListener("click",()=>clear(stage));
 cards.append(card);
 input.addEventListener("change",()=>{
  const selected=input.files?.[0]||null;
  if(stage==="selfie")input.value=""; // Never attach a test image to identity form data.
  preview(stage,selected);
 });
}
const privacy=document.createElement("p");privacy.className="muted";
privacy.textContent="This staging lab is QA-only: selfie captures are browser previews and NEVER populate the verification form. A recorded video passed the facial challenge during testing. Independent PAD has NOT been validated; staging ID/selfie uploads remain blocked.";
cards.after(privacy);
function syncType(){const passport=$("type").value==="passport";cards.querySelector('[data-stage="back"]').classList.toggle("hidden",passport);if(passport)clear("back")}
$("type").addEventListener("change",syncType);syncType();
function clear(stage){$(stage).value="";preview(stage,null)}
function preview(stage,file){
 const card=cards.querySelector('[data-stage="'+stage+'"]');
 if(previews[stage])URL.revokeObjectURL(previews[stage]);
 if(file){
  previews[stage]=URL.createObjectURL(file);
  const img=card.querySelector("img");img.src=previews[stage];img.classList.remove("hidden");
  card.querySelector(".scan-symbol").classList.add("hidden");
  card.querySelector(".scan-sub").textContent=stage==="selfie"?"UNVERIFIED QA preview — no liveness/PAD; cannot be used for identity approval":"Photo captured — ID not yet validated ("+Math.round(file.size/1024)+" KB)";
  card.querySelector(".scan-open").textContent="Scan again";card.querySelector(".scan-clear").classList.remove("hidden");
 }else{
  delete previews[stage];const img=card.querySelector("img");img.removeAttribute("src");img.classList.add("hidden");
  card.querySelector(".scan-symbol").classList.remove("hidden");card.querySelector(".scan-sub").textContent="Not captured yet";
  card.querySelector(".scan-open").textContent="Open camera";card.querySelector(".scan-clear").classList.add("hidden");
 }
}
const modal=document.createElement("dialog");modal.id="scanModal";
modal.innerHTML='<div class="scan-modal-head"><h3 id="scanTitle">Live camera</h3><button type="button" class="alt" id="scanClose">✕ Close</button></div><div class="cam-view"><video id="scanVideo" autoplay playsinline muted></video><canvas id="scanOverlay"></canvas><div id="scanGuide" class="frame-guide"></div></div><div class="scan-modal-body"><div id="scanStatus" class="cam-status" role="status">Starting...</div><div class="cam-note" id="scanNote"></div><p class="cam-note">Automatic capture is for local QA only. Browser facial challenges can accept replay videos; captured face images are NOT eligible for identity verification. ID/selfie uploads are disabled.</p><div class="scan-controls"><button type="button" class="alt" id="scanCancel">Cancel</button></div></div>';
document.body.append(modal);
const sourceRow=document.createElement("label");
sourceRow.className="cam-note";
sourceRow.textContent="Camera source (choose a device, or leave Automatic)";
const sourceSelect=document.createElement("select");
sourceSelect.id="scanCameraSource";
const sourceHint=document.createElement("p");
sourceHint.className="cam-note";
sourceHint.id="scanDeviceHint";
sourceHint.textContent="If no camera appears, check the Windows Camera app or use a phone.";
sourceRow.append(sourceSelect);
modal.querySelector(".scan-modal-body").prepend(sourceHint);
modal.querySelector(".scan-modal-body").prepend(sourceRow);
let chosenDeviceId="",lastDiscovered=null;
function option(value,label){
 const element=document.createElement("option");element.value=value;element.textContent=label;return element;
}
async function refreshCameras(){
 if(!navigator.mediaDevices?.enumerateDevices)return null;
 try{
  const inputs=videoInputList(await navigator.mediaDevices.enumerateDevices());
  lastDiscovered=inputs.length;
  sourceSelect.replaceChildren(option("","Automatic (browser default)"),...inputs.filter(v=>v.id).map(v=>option(v.id,v.name)));
  if(inputs.some(v=>v.id===chosenDeviceId))sourceSelect.value=chosenDeviceId;
  else{chosenDeviceId="";sourceSelect.value="";}
  sourceHint.textContent=inputs.length
    ? inputs.length+" camera(s) listed. If your camera does not start, try Automatic or choose a specific device."
    : "No video input is currently listed. Check Windows Camera, a connected USB webcam, or try your phone.";
  return inputs.length;
 }catch{
  sourceHint.textContent="Browser could not enumerate cameras. You can still try Automatic.";
  return null;
 }
}
sourceSelect.addEventListener("change",()=>{
 chosenDeviceId=sourceSelect.value;
 if(mode && modal.open)void start(mode);
});
const video=$("scanVideo"),canvas=$("scanOverlay"),ctx=canvas.getContext("2d");
let stream=null,timer=null,mode=null,session=0,stable=0,previous=null,detector=null,detectorLoading=null,detectorUnavailable=false,capturing=false,challenge=null;
const meter=document.createElement("canvas");meter.width=120;meter.height=90;
const meterCtx=meter.getContext("2d",{willReadFrequently:true});
function status(s){$("scanStatus").textContent=s}
function stop(){
 session++;if(timer!==null){clearInterval(timer);timer=null}
 if(stream){for(const t of stream.getTracks())t.stop();stream=null}
 video.pause();video.srcObject=null;mode=null;stable=0;previous=null;capturing=false;challenge=null;
 if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);
 if(modal.open)modal.close();
}
async function faceDetector(){
 if(detector)return detector;if(detectorUnavailable)throw Error("Unavailable");
 if(!detectorLoading)detectorLoading=(async()=>{
  const pkg=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs");
  const vision=await pkg.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm");
  return pkg.FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",delegate:"CPU"},runningMode:"VIDEO",numFaces:2,minFaceDetectionConfidence:0.6,outputFaceBlendshapes:true});
 })();
 try{detector=await detectorLoading;return detector}catch(e){detectorUnavailable=true;throw e}finally{detectorLoading=null}
}
async function start(stage){
 if(!navigator.mediaDevices?.getUserMedia){alert("Camera requires HTTPS and supported browser. Use the image fallback.");return}
 stop();mode=stage;const current=++session;capturing=false;
 const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
 challenge=stage==="selfie"?createChallengeState(generateChallenge(random)):null;
 $("scanTitle").textContent=TYPES[stage].label;
 $("scanGuide").classList.toggle("face",stage==="selfie");
 video.classList.toggle("mirror",stage==="selfie");canvas.classList.toggle("mirror",stage==="selfie");
 $("scanNote").textContent=stage==="selfie"?"QA-ONLY preview: center one face and follow two random prompts. Screen replay has passed this browser-only challenge; it is NOT PAD and cannot verify identity.":"Align all four edges of the ID against a contrasting background. Auto-capture uses approximate rectangle, lighting and stillness only, NOT government-ID identification or authenticity.";
 status("Requesting camera permission...");
 try{
  modal.showModal();
  await refreshCameras();
  if(current!==session)return;
  let opened=null;
  try{opened=await navigator.mediaDevices.getUserMedia(cameraConstraints(stage,chosenDeviceId))}
  catch(e){
   if(["OverconstrainedError","NotFoundError"].includes(e?.name)){
    // Retry with the browser default if a requested facing mode or
    // selected camera is unavailable. No device can be created by code.
    opened=await navigator.mediaDevices.getUserMedia({audio:false,video:true});
   }else throw e;
  }
  if(current!==session){opened?.getTracks().forEach(t=>t.stop());return}
  stream=opened;
  video.srcObject=stream;await video.play();if(current!==session)return;
  await refreshCameras();
  if(current!==session)return;
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  status("Camera ready — align one face or a card-like rectangle.");
  if(stage==="selfie"){
   status("Loading face landmark and facial-expression model...");
   try{await faceDetector()}catch{status("Live face detector unavailable. Automatic selfie capture cannot proceed; close and use the test-image fallback.")}
  }
  if(current!==session)return;
  timer=setInterval(()=>check(current),stage==="selfie"?120:240);
 }catch(e){if(current===session){const found=await refreshCameras();if(current!==session)return;status(cameraErrorMessage(e,found??lastDiscovered));}}
}
function drawFaces(faces){
 if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineWidth=Math.max(3,canvas.width/350);ctx.strokeStyle="#58f0ae";
 for(const face of faces){const b=face.boundingBox;if(b)ctx.strokeRect(b.originX,b.originY,b.width,b.height)}
}
function check(current){
 if(current!==session||!mode||video.readyState<2||!meterCtx||capturing)return;
 try{
  meterCtx.drawImage(video,0,0,meter.width,meter.height);
  const pixels=meterCtx.getImageData(0,0,meter.width,meter.height).data;
  const light=evaluateLighting(pixels),motion=frameDifference(pixels,previous);
  previous=new Uint8ClampedArray(pixels);
  const steady=motion<9.5;let good=false;let message="";
  if(!light.acceptable)message=light.brightness<58?"Too dark; move into brighter light.":light.brightness>215?"Too bright; avoid glare.":"Low contrast; improve lighting.";
  else if(mode==="selfie"){
    if(detector){
      const detected=detector.detectForVideo(video,performance.now());
      const allLandmarks=detected?.faceLandmarks||[];
      const boxes=allLandmarks.map(points=>{
        const xs=points.map(p=>p.x*video.videoWidth),ys=points.map(p=>p.y*video.videoHeight);
        const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
        return {boundingBox:{originX:minX,originY:minY,width:maxX-minX,height:maxY-minY}};
      });
      drawFaces(boxes);
      const face=assessFaceBoxes(boxes,video.videoWidth,video.videoHeight);
      if(!face.acceptable){good=false;message=face.message}
      else if(!challenge){message="Preparing facial-expression challenge..."}
      else if(challenge.expired){message="Challenge expired. Close and reopen the face camera to retry."}
      else if(!challenge.completed){
        challenge=advanceChallenge(challenge,faceSignals(detected),Date.now());
        message=challenge.expired?"Challenge expired. Close and reopen to retry.":challenge.completed
          ?"Facial movement challenge complete (local-only). Hold still for capture."
          :"Step "+(challenge.step+1)+"/"+challenge.steps.length+": "+ACTIONS[challenge.steps[challenge.step]]
             +(challenge.phase==="waiting_for_release"?" — now relax":"");
        good=false;
      }else{
        good=steady;
        message=steady?"Face centered, challenge complete. Hold still for capture.":"Challenge complete. Keep your face centered and still.";
      }
    }else{drawFaces([]);message="Live face tracking unavailable; auto capture disabled. Close and use test-image fallback (not liveness checked)."}
  }else{
    drawFaces([]);
    const card=assessDocumentFrame(pixels,meter.width,meter.height);
    good=card.acceptable&&steady;
    message=!card.acceptable?card.message:steady
      ?"Card-like edges found. Hold still — automatic capture in "+Math.max(1,Math.ceil((13-stable)*.24))+"s."
      :"Card-like edges found. Keep the ID steady.";
  }
  status(message);stable=good?stable+1:0;
  if(stable>=(mode==="selfie"?9:13)&&(mode!=="selfie"||detector)&&(mode!=="selfie"||challenge?.completed)){void capture()}
 }catch{stable=0;status("Live tracking interrupted. Hold still, or close and use image fallback.")}
}
async function capture(){
 if(!mode||!stream||video.readyState<2||capturing)return;
 capturing=true;const stage=mode;const current=session;status(stage==="selfie"?"Capturing an UNVERIFIED local QA preview — never an identity selfie.":"Capturing a local ID-camera preview — document authenticity not checked.");
 const pic=document.createElement("canvas");const factor=Math.min(1,1400/video.videoWidth);
 pic.width=Math.round(video.videoWidth*factor);pic.height=Math.round(video.videoHeight*factor);
 pic.getContext("2d").drawImage(video,0,0,pic.width,pic.height);
 const blob=await new Promise(resolve=>pic.toBlob(resolve,"image/jpeg",0.88));
 if(current!==session)return;
 if(!blob){status("Could not make local QA preview.");capturing=false;return}
 if(stage==="selfie"){
   // SECURITY BOUNDARY: the browser expression challenge accepted a prerecorded
   // screen replay. Never turn its captured image into a verification-form file.
   // Local QA preview is allowed; independent server-side PAD is still required.
   $("selfie").value="";
   preview("selfie",blob);
   const card=document.querySelector('[data-stage="selfie"] .scan-sub');
   if(card)card.textContent="UNVERIFIED QA ONLY — replay video may pass; not a valid identity selfie";
   stop();
   return;
 }
 if(typeof DataTransfer==="undefined"){status("Could not save local ID preview.");capturing=false;return}
 const file=new File([blob],"staging-"+stage+"-"+Date.now()+".jpg",{type:"image/jpeg"});
 const dt=new DataTransfer();dt.items.add(file);
 $(stage).files=dt.files;$(stage).dispatchEvent(new Event("change",{bubbles:true}));
 stop();
}
$("scanClose").addEventListener("click",stop);
$("scanCancel").addEventListener("click",stop);modal.addEventListener("cancel",e=>{e.preventDefault();stop()});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&stream)stop()});
window.addEventListener("pagehide",stop);
$("logout").addEventListener("click",()=>{stop();for(const s of Object.keys(TYPES))clear(s)});
