// Staging client-side active face challenge. Security notice:
// A browser-only expression challenge is NOT presentation-attack detection (PAD).
// It can be fooled by sufficiently capable video replay or client tampering.
// Only assists a consenting user in capturing responsive live-camera frames.
export const ACTIONS=Object.freeze({
 blink:"Blink twice",
 smile:"Smile, then relax",
 open_mouth:"Open your mouth, then close it"
});
export function generateChallenge(random=()=>Math.random()){
 const actions=Object.keys(ACTIONS);
 const first=actions[Math.floor(Math.max(0,Math.min(.99999,random()))*actions.length)];
 const rest=actions.filter(x=>x!==first);
 const second=rest[Math.floor(Math.max(0,Math.min(.99999,random()))*rest.length)];
 return [first,second];
}
export function faceSignals(result){
 const faces=result?.faceLandmarks||[];
 if(faces.length!==1)return {oneFace:false,blink:false,smile:false,openMouth:false};
 const categories=result?.faceBlendshapes?.[0]?.categories||[];
 const scores=Object.fromEntries(categories.map(x=>[x.categoryName,Number(x.score)||0]));
 return {
  oneFace:true,
  blink:Math.min(scores.eyeBlinkLeft||0,scores.eyeBlinkRight||0)>.57,
  smile:Math.min(scores.mouthSmileLeft||0,scores.mouthSmileRight||0)>.50,
  openMouth:(scores.jawOpen||0)>.55
 };
}
export function createChallengeState(steps,now=Date.now()){
 return {steps:[...steps],step:0,phase:"waiting_for_action",blinkCount:0,holding:0,completed:false,startedAt:now,stepStartedAt:now};
}
export function advanceChallenge(state,signals,now=Date.now()){
 const current={...state};
 if(current.completed)return current;
 if(!signals?.oneFace){current.holding=0;return current}
 const elapsed=now-current.stepStartedAt;
 if(now-current.startedAt>40000||elapsed>26000){
   return {...current,expired:true,completed:false};
 }
 const type=current.steps[current.step];
 const active=type==="blink"?signals.blink:type==="smile"?signals.smile:signals.openMouth;
 if(current.phase==="waiting_for_action"){
   current.holding=active?current.holding+1:0;
   if(current.holding>=(type==="blink"?1:2)){current.phase="waiting_for_release";current.holding=0}
 }else if(current.phase==="waiting_for_release"){
   current.holding=!active?current.holding+1:0;
   if(current.holding>=2){
     if(type==="blink"&&current.blinkCount<1){
       current.blinkCount++;current.phase="waiting_for_action";current.holding=0;
     }else{
       current.step++;current.blinkCount=0;current.holding=0;
       current.stepStartedAt=now;current.phase="waiting_for_action";
       current.completed=current.step>=current.steps.length;
     }
   }
 }
 return current;
}
