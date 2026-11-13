/**
 * Isolated VolunServe STAGING research only: browser-side OpenCV SFace ONNX.
 * No identity decision, no PAD/liveness, no image/embedding uploads or storage.
 *
 * Reference: OpenCV FaceRecognizerSF alignCrop + feature (112x112 RGB float,
 * scale=1, mean=0), using a five-landmark similarity transform.
 * This MediaPipe-to-OpenCV landmark mapping has NOT been independently
 * calibrated on physical IDs or verified against OpenCV outputs.
 */
export const SFACE_SHA256 = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79";
const MODEL_URL = "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx";
const VISION_JS = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";
const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const ORT_JS = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/esm/ort.min.js";
const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
const TARGET = [[38.2946, 51.6963], [73.5318, 51.5014],
                [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
const SIZE = 112;
const valid = Number.isFinite;

export function fiveFacePoints(landmarks, width, height) {
  if (!Array.isArray(landmarks) || landmarks.length < 292 ||
      !valid(width) || !valid(height) || width < 120 || height < 120)
    return null;
  const xy = i => {
    const x = landmarks[i]?.x, y = landmarks[i]?.y;
    return valid(x) && valid(y) && x >= -0.05 && x <= 1.05 &&
      y >= -0.05 && y <= 1.05 ? [x * width, y * height] : null;
  };
  // Viewer-left eye, viewer-right eye, nose, viewer-left and right mouth corners.
  const a = xy(33), b = xy(133), c = xy(362), d = xy(263),
        nose = xy(1), ml = xy(61), mr = xy(291);
  if (![a,b,c,d,nose,ml,mr].every(Boolean)) return null;
  const avg = (p,q) => [(p[0] + q[0])/2, (p[1] + q[1])/2];
  const points = [avg(a,b), avg(c,d), nose, ml, mr];
  if (points[0][0] >= points[1][0] ||
      points[3][0] >= points[4][0] ||
      points[1][0] - points[0][0] < 4 ||
      points[4][0] - points[3][0] < 4)
    return null;
  return points;
}

/** Least-squares, no-reflection 2D similarity fit, source -> 112px target. */
export function sfaceSimilarityMatrix(points) {
  if (!Array.isArray(points) || points.length !== 5 ||
      points.some(p => !Array.isArray(p) || p.length !== 2 ||
                       !valid(p[0]) || !valid(p[1]))) return null;
  const mean = data => [
    data.reduce((s,p) => s+p[0],0)/5,
    data.reduce((s,p) => s+p[1],0)/5
  ];
  const [mx,my] = mean(points), [tx0,ty0] = mean(TARGET);
  let den=0, dot=0, cross=0, residual=0;
  for (let i=0; i<5; i++) {
    const x=points[i][0]-mx, y=points[i][1]-my;
    const u=TARGET[i][0]-tx0, v=TARGET[i][1]-ty0;
    den+=x*x+y*y; dot+=x*u+y*v; cross+=x*v-y*u;
  }
  if (!valid(den) || den < 1) return null;
  const a=dot/den, b=cross/den, tx=tx0-a*mx+b*my, ty=ty0-b*mx-a*my;
  const scale=Math.hypot(a,b);
  if (!valid(scale) || scale < 0.03 || scale > 25) return null;
  for (let i=0; i<5; i++) {
    const dx=a*points[i][0]-b*points[i][1]+tx-TARGET[i][0];
    const dy=b*points[i][0]+a*points[i][1]+ty-TARGET[i][1];
    residual+=dx*dx+dy*dy;
  }
  if (!valid(residual) || residual/5 > 225) return null;
  return {a,b,tx,ty,meanSquaredError:residual/5};
}

/** Image data -> OpenCV SFace input, NCHW RGB float32 raw 0..255. */
export function rgbTensorData(imageData) {
  const rgba=imageData?.data;
  if (!rgba || rgba.length !== SIZE*SIZE*4) return null;
  const planes=new Float32Array(3*SIZE*SIZE);
  for (let i=0;i<SIZE*SIZE;i++) {
    const j=i*4;
    planes[i]=rgba[j];
    planes[SIZE*SIZE+i]=rgba[j+1];
    planes[2*SIZE*SIZE+i]=rgba[j+2];
  }
  return planes;
}

export function cosineResearchOnly(a,b) {
  if (!a || !b || a.length !== b.length ||
      a.length < 8 || a.length > 4096) return null;
  let dot=0,na=0,nb=0;
  for(let i=0;i<a.length;i++) {
    const x=a[i],y=b[i];
    if (!valid(x) || !valid(y)) return null;
    dot+=x*y;na+=x*x;nb+=y*y;
  }
  const denom=Math.sqrt(na)*Math.sqrt(nb);
  if (!valid(denom) || denom < 1e-8) return null;
  const score=dot/denom;
  return valid(score) && score>=-1.00001 && score<=1.00001 ?
    Math.max(-1,Math.min(1,score)) : null;
}

export function researchResult(reason, cosine=null) {
  const output={
    status:cosine === null ? "inconclusive" : "similarity_observed_unvalidated",
    identityDecisionUse:"none", independentFaceMatchValidated:false,
    independentPadValidated:false, antiSpoofStatus:"NOT TESTED",
    reason: String(reason || "unknown").replace(/[^a-z0-9_]/gi,"").slice(0,64)
  };
  if (cosine !== null && valid(cosine) && cosine>=-1 && cosine<=1)
    output.cosineSimilarity = Number(cosine.toFixed(4));
  return output;
}
async function imageFromBlob(url, active) {
  if (!active()) throw new Error("cancelled");
  const image=new Image();
  image.src=url;
  try {
    await image.decode();
    if (!active()) throw new Error("cancelled");
    return image;
  } catch (e) {
    image.removeAttribute("src");
    throw e;
  }
}
function alignedImageData(image,points) {
  const m=sfaceSimilarityMatrix(points);
  if (!m) return null;
  const canvas=document.createElement("canvas");
  canvas.width=SIZE;canvas.height=SIZE;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if (!ctx) return null;
  ctx.setTransform(m.a,m.b,-m.b,m.a,m.tx,m.ty);
  ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,SIZE,SIZE);
  canvas.width=canvas.height=0;
  return rgbTensorData(pixels);
}
async function validModelBytes(active) {
  const response=await fetch(MODEL_URL, {mode:"cors", cache:"no-store", credentials:"omit"});
  if (!response.ok || !active()) throw new Error("model_unavailable");
  const buffer=await response.arrayBuffer();
  if (buffer.byteLength < 30*1024*1024 || buffer.byteLength > 45*1024*1024)
    throw new Error("model_invalid");
  const digest=await crypto.subtle.digest("SHA-256",buffer);
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  if (hex!==SFACE_SHA256 || !active()) throw new Error("model_invalid");
  return new Uint8Array(buffer);
}
/**
 * Opt-in research ONLY. All image decoding and inference is local; network
 * fetches download public model runtime/weights (no ID/selfie in requests).
 * Do not compare to a threshold or use for account/Admin decisions.
 */
export async function runSFaceResearch(idUrl,selfieUrl,{active,progress=()=>{}}) {
  if (typeof active!=="function" || !active() ||
      !idUrl?.startsWith("blob:") || !selfieUrl?.startsWith("blob:"))
    return researchResult("consent_or_frames_missing");
  let landmarker=null,session=null, model=null;
  let embeddingA=null,embeddingB=null;
  try {
    progress("Downloading public landmark/SFace models and WebAssembly code only.");
    const vision=await import(VISION_JS);
    if(!active())return researchResult("cancelled");
    const files=await vision.FilesetResolver.forVisionTasks(VISION_WASM);
    landmarker=await vision.FaceLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:LANDMARKER_MODEL, delegate:"CPU"},
      runningMode:"IMAGE",numFaces:2
    });
    if(!active())return researchResult("cancelled");
    model=await validModelBytes(active);
    progress("Public SFace model checksum verified. Running local research.");
    const ort=await import(ORT_JS);
    if(!active())return researchResult("cancelled");
    ort.env.wasm.wasmPaths=ORT_WASM;
    ort.env.wasm.numThreads=1;
    session=await ort.InferenceSession.create(model,{
      executionProviders:["wasm"],graphOptimizationLevel:"all"
    });
    if (!active())return researchResult("cancelled");
    const embeddings=[];
    for (const [idx,url] of [[0,idUrl],[1,selfieUrl]]) {
      const image=await imageFromBlob(url,active);
      try {
        const out=landmarker.detect(image);
        if (!active())return researchResult("cancelled");
        if (out?.faceLandmarks?.length !== 1)
          return researchResult(idx===0?"id_face_count_invalid":"selfie_face_count_invalid");
        const points=fiveFacePoints(out.faceLandmarks[0],image.naturalWidth,image.naturalHeight);
        const tensorData=points && alignedImageData(image,points);
        if (!tensorData)return researchResult(idx===0?"id_alignment_invalid":"selfie_alignment_invalid");
        const inputName=session.inputNames?.[0];
        const outputName=session.outputNames?.[0];
        if (!inputName || !outputName) return researchResult("model_interface_invalid");
        const values=await session.run({[inputName]:new ort.Tensor("float32",tensorData,[1,3,112,112])});
        tensorData.fill(0);
        if(!active())return researchResult("cancelled");
        const features=values[outputName]?.data;
        if(!features || features.length<8 || features.length>4096)
          return researchResult(idx===0?"id_embedding_invalid":"selfie_embedding_invalid");
        embeddings.push(Float32Array.from(features));
        if(idx===0)embeddingA=embeddings[0];else embeddingB=embeddings[1];
      } finally {
        image.removeAttribute("src");
      }
    }
    const cosine=cosineResearchOnly(embeddings[0],embeddings[1]);
    return cosine===null?researchResult("embedding_invalid"):researchResult("numeric_score_research_only",cosine);
  } catch {
    return researchResult("runtime_or_model_unavailable");
  } finally {
    if(embeddingA)embeddingA.fill(0);
    if(embeddingB)embeddingB.fill(0);
    try {await session?.release();}catch{}
    try {landmarker?.close();}catch{}
    if(model)model.fill(0);
  }
}
