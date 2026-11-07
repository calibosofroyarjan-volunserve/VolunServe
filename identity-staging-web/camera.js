import {evaluateLighting,assessFaceBoxes,frameDifference} from "./camera-metrics.mjs";
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
 const summary=document.createElement("summary");summary.textContent="Camera unavailable? Choose a test image instead";
 fallback.append(summary);label.before(fallback);fallback.append(label);
 const card=document.createElement("div");card.className="scan-card";card.dataset.stage=stage;
 card.innerHTML='<div class="scan-main"><span class="scan-symbol" aria-hidden="true">▣</span><img class="scan-thumb hidden" alt="Captured test image preview"><div><div class="scan-title"></div><div class="scan-sub" aria-live="polite">Not captured yet</div></div></div><div class="scan-actions"><button type="button" class="scan-open">Open camera</button><button type="button" class="alt scan-clear hidden">Retake</button></div>';
 card.querySelector(".scan-title").textContent=TYPES[stage].label;
 card.querySelector(".scan-open").addEventListener("click",()=>start(stage));
 card.querySelector(".scan-clear").addEventListener("click",()=>clear(stage));
 cards.append(card);
 input.addEventListener("change",()=>preview(stage,input.files?.[0]||null));
}
const privacy=document.createElement("p");privacy.className="muted";
privacy.textContent="Captured images stay in this browser until you explicitly run staging verification. Live guidance does not prove ID authenticity or selfie liveness.";
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
  card.querySelector(".scan-sub").textContent="Captured — "+Math.round(file.size/1024)+" KB";
  card.querySelector(".scan-open").textContent="Scan again";card.querySelector(".scan-clear").classList.remove("hidden");
 }else{
  delete previews[stage];const img=card.querySelector("img");img.removeAttribute("src");img.classList.add("hidden");
  card.querySelector(".scan-symbol").classList.remove("hidden");card.querySelector(".scan-sub").textContent="Not captured yet";
  card.querySelector(".scan-open").textContent="Open camera";card.querySelector(".scan-clear").classList.add("hidden");
 }
}
const modal=document.createElement("dialog");modal.id="scanModal";
modal.innerHTML='<div class="scan-modal-head"><h3 id="scanTitle">Live camera</h3><button type="button" class="alt" id="scanClose">✕ Close</button></div><div class="cam-view"><video id="scanVideo" autoplay playsinline muted></video><canvas id="scanOverlay"></canvas><div id="scanGuide" class="frame-guide"></div></div><div class="scan-modal-body"><div id="scanStatus" class="cam-status" role="status">Starting...</div><div class="cam-note" id="scanNote"></div><label class="check" style="margin:12px 0"><input type="checkbox" id="scanAuto" checked><span>Auto-capture centered selfie when stable (experimental). Retake is always available.</span></label><div class="scan-controls"><button type="button" id="scanCapture">Capture now</button><button type="button" class="alt" id="scanCancel">Cancel</button></div></div>';
document.body.append(modal);
const video=$("scanVideo"),canvas=$("scanOverlay"),ctx=canvas.getContext("2d");
let stream=null,timer=null,mode=null,session=0,stable=0,previous=null,detector=null,detectorLoading=null,detectorUnavailable=false,capturing=false;
const meter=document.createElement("canvas");meter.width=120;meter.height=90;
const meterCtx=meter.getContext("2d",{willReadFrequently:true});
function status(s){$("scanStatus").textContent=s}
function stop(){
 session++;if(timer!==null){clearInterval(timer);timer=null}
 if(stream){for(const t of stream.getTracks())t.stop();stream=null}
 video.pause();video.srcObject=null;mode=null;stable=0;previous=null;capturing=false;
 if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);
 if(modal.open)modal.close();
}
async function faceDetector(){
 if(detector)return detector;if(detectorUnavailable)throw Error("Unavailable");
 if(!detectorLoading)detectorLoading=(async()=>{
  const pkg=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs");
  const vision=await pkg.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm");
  return pkg.FaceDetector.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",delegate:"CPU"},runningMode:"VIDEO",minDetectionConfidence:0.65});
 })();
 try{detector=await detectorLoading;return detector}catch(e){detectorUnavailable=true;throw e}finally{detectorLoading=null}
}
async function start(stage){
 if(!navigator.mediaDevices?.getUserMedia){alert("Camera requires HTTPS and supported browser. Use the image fallback.");return}
 stop();mode=stage;const current=++session;capturing=false;
 $("scanTitle").textContent=TYPES[stage].label;
 $("scanGuide").classList.toggle("face",stage==="selfie");
 video.classList.toggle("mirror",stage==="selfie");canvas.classList.toggle("mirror",stage==="selfie");
 $("scanAuto").closest("label").classList.toggle("hidden",stage!=="selfie");
 $("scanAuto").checked=true;
 $("scanNote").textContent=stage==="selfie"?"Center one face. Face boxes are local guidance only, NOT liveness detection.":"Keep the full ID in the green guide. Document presence and authenticity are NOT detected here.";
 $("scanCapture").disabled=true;status("Requesting camera permission...");
 try{
  modal.showModal();
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:TYPES[stage].facing},width:{ideal:1280},height:{ideal:960}}})}
  catch(e){if(["OverconstrainedError","NotFoundError"].includes(e?.name))stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});else throw e}
  if(current!==session){stream?.getTracks().forEach(t=>t.stop());return}
  video.srcObject=stream;await video.play();if(current!==session)return;
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  $("scanCapture").disabled=false;status("Camera ready — adjust lighting.");
  if(stage==="selfie"){
   status("Loading local face detector...");
   try{await faceDetector()}catch{status("Live face detector unavailable. Manual camera capture remains possible; server still checks the photo.")}
  }
  if(current!==session)return;
  timer=setInterval(()=>check(current),240);
 }catch(e){if(current===session){status("Camera unavailable: "+String(e?.name||e?.message||"camera error")+". Allow access or use test-image fallback.");$("scanCapture").disabled=true}}
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
      const faces=detector.detectForVideo(video,performance.now())?.detections||[];
      drawFaces(faces);const check=assessFaceBoxes(faces,video.videoWidth,video.videoHeight);
      good=check.acceptable&&steady;
      message=!check.acceptable?check.message:steady?"One centered face detected — hold still.":"One face detected — stop moving.";
    }else{drawFaces([]);message="Live detection unavailable; use Capture now. Server face comparison still applies."}
  }else{
    drawFaces([]);message=steady?"Hold ID fully in view, then tap Capture now.":"Keep the ID steady inside the guide.";
  }
  status(message);stable=good?stable+1:0;
  if(mode==="selfie"&&detector&&$("scanAuto").checked&&stable>=9){$("scanAuto").checked=false;void capture()}
 }catch{stable=0;status("Live tracking interrupted. Try Capture now, or use image fallback.")}
}
async function capture(){
 if(!mode||!stream||video.readyState<2||capturing)return;
 capturing=true;const stage=mode;const current=session;$("scanCapture").disabled=true;
 const pic=document.createElement("canvas");const factor=Math.min(1,1400/video.videoWidth);
 pic.width=Math.round(video.videoWidth*factor);pic.height=Math.round(video.videoHeight*factor);
 pic.getContext("2d").drawImage(video,0,0,pic.width,pic.height);
 const blob=await new Promise(resolve=>pic.toBlob(resolve,"image/jpeg",0.88));
 if(current!==session)return;
 if(!blob||typeof DataTransfer==="undefined"){status("Could not save camera capture; use test-image fallback.");$("scanCapture").disabled=false;capturing=false;return}
 const file=new File([blob],"staging-"+stage+"-"+Date.now()+".jpg",{type:"image/jpeg"});
 const dt=new DataTransfer();dt.items.add(file);
 $(stage).files=dt.files;$(stage).dispatchEvent(new Event("change",{bubbles:true}));stop();
}
$("scanCapture").addEventListener("click",()=>void capture());$("scanClose").addEventListener("click",stop);
$("scanCancel").addEventListener("click",stop);modal.addEventListener("cancel",e=>{e.preventDefault();stop()});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&stream)stop()});
window.addEventListener("pagehide",stop);
$("logout").addEventListener("click",()=>{stop();for(const s of Object.keys(TYPES))clear(s)});
