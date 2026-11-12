import {parseScoreList,calculateMatchPadMetrics,DEFAULT_MATCH_THRESHOLD} from "./match-pad-metrics.mjs";

// Browser-only calculations: no fetch, uploads, cookies, storage or telemetry.
if(location.hostname!=="volunserve-identity-test-staging.onrender.com"){
  throw Error("STAGING_ONLY_MATCH_PAD_QA");
}
const section=document.createElement("section");
section.className="card wide";
section.setAttribute("aria-label","Face match and challenge acceptance metrics");
section.innerHTML = '<h2>6. Face-match accuracy & spoof challenge observations</h2>'
  +'<p class="muted">This calculator uses manually entered <strong>similarity scores only</strong> from a consented, isolated evaluation. No names, photos, IDs, account information or files. These data are NOT automatically verified; do not use production residents or real government ID photos in this staging tool.</p>'
  +'<p class="muted"><strong>Basic Resident → application → AI screening → pending → independent Admin decision → Verified Resident.</strong> A high score never gives automatic verified access.</p>'
  +'<div class="stack">'
  +'<label for="qaGenuine">Same-person (genuine) similarity scores, 0 to 1, separated by commas or lines</label>'
  +'<textarea id="qaGenuine" rows="3" spellcheck="false" autocomplete="off" placeholder="Leave blank until consented staging comparison scores exist"></textarea>'
  +'<label for="qaImpostor">Different-person (impostor) similarity scores, 0 to 1</label>'
  +'<textarea id="qaImpostor" rows="3" spellcheck="false" autocomplete="off" placeholder="No names, photos, filenames or account identifiers"></textarea>'
  +'<label for="qaThreshold">Face similarity threshold (report only; live setting is unchanged)</label>'
  +'<input id="qaThreshold" type="number" min="0.01" max="1" step="0.01" value="0.78" autocomplete="off">'
  +'<p class="muted">Count a spoof as accepted only if the client-side face challenge completes. This measures <em>observed challenge acceptance</em>, not validated anti-spoofing/PAD or certified IAPAR.</p>'
  +'<div class="grid">'
  +'<label for="qaPrintTrials">Printed-photo challenges attempted<input id="qaPrintTrials" type="number" min="0" max="10000" step="1" value="0"></label>'
  +'<label for="qaPrintAccepted">Printed-photo challenges accepted<input id="qaPrintAccepted" type="number" min="0" max="10000" step="1" value="0"></label>'
  +'<label for="qaScreenTrials">Screen/video replay attempts<input id="qaScreenTrials" type="number" min="0" max="10000" step="1" value="0"></label>'
  +'<label for="qaScreenAccepted">Screen/video replay challenges accepted<input id="qaScreenAccepted" type="number" min="0" max="10000" step="1" value="0"></label>'
  +'</div>'
  +'</div>'
  +'<div class="actions" style="margin-top:14px">'
  +'<button id="qaCalculate" type="button">Calculate local error rates</button>'
  +'<button id="qaCopyAggregate" class="alt" type="button" disabled>Copy aggregate-only results</button>'
  +'<button id="qaClearMetrics" class="alt" type="button">Clear all values</button></div>'
  +'<pre id="qaMetricsOutput" role="status" style="white-space:pre-wrap;word-break:break-word;background:#f3f8f5;padding:14px;border-radius:10px;font-size:12px;max-height:380px;overflow:auto">No measured face-match trials. Results are NOT validated.</pre>'
  +'<p class="muted">95% Wilson intervals assume independent samples. Repeated captures from the same person are correlated. Printed/screen challenge results cannot substitute for an independent ISO/IEC 30107-3 PAD evaluation. No automatic production threshold changes.</p>';
const root=document.querySelector(".grid");
if(!root)throw Error("Staging evaluation container unavailable");
root.append(section);
const el=id=>section.querySelector("#"+id);
let latest=null;
function calculate(){
  latest=null;
  el("qaCopyAggregate").disabled=true;
  try {
    const genuineScores=parseScoreList(el("qaGenuine").value);
    const impostorScores=parseScoreList(el("qaImpostor").value);
    const result=calculateMatchPadMetrics({
      genuineScores,impostorScores,
      threshold:Number(el("qaThreshold").value),
      printAttempts:Number(el("qaPrintTrials").value),
      printAccepted:Number(el("qaPrintAccepted").value),
      screenAttempts:Number(el("qaScreenTrials").value),
      screenAccepted:Number(el("qaScreenAccepted").value)
    });
    latest=result;
    el("qaCopyAggregate").disabled=false;
    const percentages=(item)=>item.rate===null?"NOT MEASURED":
      (100*item.rate).toFixed(2)+"% ("+item.events+"/"+item.trials+")";
    el("qaMetricsOutput").textContent=
      "Same-person false non-match rate (FNMR): "+percentages(result.falseNonMatch)+"\n"+
      "Different-person false match rate (FMR): "+percentages(result.falseMatch)+"\n"+
      "Printed-photo challenge acceptance: "+percentages(result.challengeAcceptanceObserved.printedPhoto)+"\n"+
      "Screen/video challenge acceptance: "+percentages(result.challengeAcceptanceObserved.screenReplay)+"\n"+
      (result.attackAcceptanceObserved?"WARNING: A spoof may have passed the camera challenge.\n":"")+
      "VERIFICATION STATUS: NOT CERTIFIED — Admin-only final approval.\n\n"+
      JSON.stringify(result,null,2);
  }catch(error){
    el("qaMetricsOutput").textContent="No metrics calculated: "+String(error?.message||"Invalid input").slice(0,240);
  }
}
el("qaCalculate").addEventListener("click",calculate);
el("qaCopyAggregate").addEventListener("click",async()=>{
 if(!latest)return;
 const text=JSON.stringify(latest,null,2);
 try{
  if(!navigator.clipboard?.writeText)throw Error("clipboard unavailable");
  await navigator.clipboard.writeText(text);
  el("qaMetricsOutput").textContent="Aggregate-only results copied. No raw scores or personal media included.\n\n"+text;
 }catch{
  el("qaMetricsOutput").textContent="Copy unavailable. Select the aggregate result below manually:\n\n"+text;
 }
});
function clearAll(){
 for(const id of ["qaGenuine","qaImpostor"])el(id).value="";
 for(const id of ["qaPrintTrials","qaPrintAccepted","qaScreenTrials","qaScreenAccepted"])el(id).value="0";
 el("qaThreshold").value=String(DEFAULT_MATCH_THRESHOLD);
 latest=null;
 el("qaCopyAggregate").disabled=true;
 el("qaMetricsOutput").textContent="No measured face-match trials. Results are NOT validated.";
}
el("qaClearMetrics").addEventListener("click",clearAll);
window.addEventListener("pagehide",clearAll);
