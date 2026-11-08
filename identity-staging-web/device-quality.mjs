// Local browser QA heuristics, NOT biometric accuracy evidence.
// No images, video, device identifiers, or user data leave this module.
export function assessCameraSample({width,height,fps,lighting,interrupted=false}={}){
 const warnings=[];
 const w=Number(width),h=Number(height),f=Number(fps);
 if(interrupted)warnings.push("Camera feed interrupted.");
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0){
   warnings.push("Camera resolution could not be read.");
 }else if(w<640||h<480){
   warnings.push("Camera resolution is below the suggested 640x480; document text and faces may be harder to read.");
 }
 if(!Number.isFinite(f)||f<=0){
   warnings.push("Frame rate could not be measured.");
 }else if(f<10){
   warnings.push("Low observed camera frame rate; live tracking may be choppy.");
 }
 if(lighting?.acceptable===false){
   warnings.push("Lighting/contrast needs improvement. Avoid glare and very dark rooms.");
 }else if(!lighting){
   warnings.push("Lighting sample was unavailable.");
 }
 return {
   status:warnings.length?"needs_review":"camera_basic_checks_passed",
   resolution: Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?Math.round(w)+"x"+Math.round(h):"unavailable",
   observedFps:Number.isFinite(f)&&f>0?Math.round(f*10)/10:null,
   lighting:lighting?.acceptable===true?"adequate_for_local_guidance":"unverified_or_poor",
   warnings,
   note:"These are local camera performance checks only. They cannot validate face-match accuracy, document authenticity, or liveness."
 };
}
