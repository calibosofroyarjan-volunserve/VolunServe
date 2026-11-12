import {QA_CASES,QA_VALUES,buildDeviceQaReport} from "./pad-qa-report.mjs";
// Strictly local staging observations. Never send camera frames, images or telemetry.
if(location.hostname!=="volunserve-identity-test-staging.onrender.com")throw Error("STAGING_ONLY_QA");
const section=document.createElement("section");
section.className="card wide";
section.setAttribute("aria-label","Real device face challenge and replay QA");
section.innerHTML='<h2>5. Real-device face & replay QA</h2>'
 +'<p class="muted">Run on the actual phone/browser. Use camera diagnostics above and the live face challenge. These are manual observations, not PAD certification. <strong>Do not submit real ID/selfie media to this report.</strong></p>'
 +'<p class="muted">For printed photos or screen replay, record whether the local challenge was fooled. If it accepted a spoof, select <strong>Fail</strong>. Use only images with permission, and do not press Verify or send files to an unverified staging backend.</p>'
 +'<label for="padQaDevice">Test device/browser</label><select id="padQaDevice">'
 +'<option value="unspecified">Choose device</option>'
 +'<option value="android_chrome">Android Chrome</option>'
 +'<option value="android_edge">Android Edge</option>'
 +'<option value="windows_edge">Windows Edge</option>'
 +'<option value="other">Other browser</option></select>'
 +'<div id="padQaCases" class="stack" style="margin-top:14px"></div>'
 +'<div class="actions" style="margin-top:14px">'
 +'<button type="button" id="padQaCopy">Copy privacy-safe QA summary</button>'
 +'<button type="button" id="padQaReset" class="alt">Reset observations</button></div>'
 +'<pre id="padQaSummary" role="status" style="white-space:pre-wrap;word-break:break-word;background:#f3f8f5;padding:14px;border-radius:10px;font-size:12px;max-height:340px;overflow:auto">No observations recorded yet.</pre>'
 +'<p class="muted">Passing these manual checks still does not validate false-match rates, official ID authenticity, or independent presentation-attack detection. Authorized Admin review remains required.</p>';
const root=document.querySelector(".grid");
if(!root)throw Error("Staging QA layout unavailable");
root.append(section);
const cases=section.querySelector("#padQaCases");
const statuses=[
  ["not_tested","Not tested"],
  ["pass","Pass — expected safe behavior"],
  ["fail","Fail — unexpected or spoof accepted"],
  ["inconclusive","Inconclusive"]
];
for(const item of QA_CASES){
  const wrapper=document.createElement("div");
  wrapper.style.cssText="border:1px solid #dfeae3;border-radius:10px;padding:12px;background:#fff";
  const label=document.createElement("label");
  const title=document.createElement("strong");title.textContent=item.title;
  const desc=document.createElement("small");desc.textContent=item.expected;
  desc.style.cssText="display:block;color:#5a756b;font-weight:400;line-height:1.5;margin:5px 0 9px";
  const select=document.createElement("select");
  select.dataset.qaCase=item.id;
  select.setAttribute("aria-label",item.title+" result");
  for(const [value,name] of statuses){
    const option=document.createElement("option");option.value=value;option.textContent=name;select.append(option);
  }
  select.addEventListener("change",refresh);
  label.append(title,desc,select);wrapper.append(label);cases.append(wrapper);
}
function report(){
  const observations={};
  for(const select of cases.querySelectorAll("select[data-qa-case]")){
    const status=select.value;
    observations[select.dataset.qaCase]=QA_VALUES.includes(status)?status:"not_tested";
  }
  return buildDeviceQaReport({
    device:section.querySelector("#padQaDevice").value,
    observations
  });
}
function refresh(){
  const data=report();
  const {pass,fail,inconclusive,not_tested}=data.counts;
  section.querySelector("#padQaSummary").textContent=
    "Camera/face QA: "+pass+" pass, "+fail+" fail, "+inconclusive+" inconclusive, "+not_tested+" not tested.\n"
    +(data.observedSpoofAcceptance?"WARNING: Possible spoof acceptance observed.\n":"")
    +"PAD and face-match accuracy are NOT validated.\n\n"
    +JSON.stringify(data,null,2);
}
section.querySelector("#padQaDevice").addEventListener("change",refresh);
section.querySelector("#padQaReset").addEventListener("click",()=>{
  for(const select of cases.querySelectorAll("select"))select.value="not_tested";
  section.querySelector("#padQaDevice").value="unspecified";
  refresh();
});
section.querySelector("#padQaCopy").addEventListener("click",async()=>{
  const value=JSON.stringify(report(),null,2);
  try{
    if(!navigator.clipboard?.writeText)throw Error("clipboard_unavailable");
    await navigator.clipboard.writeText(value);
    section.querySelector("#padQaSummary").textContent="Copied privacy-safe QA report. No images or identifying information included.\n\n"+value;
  }catch{
    section.querySelector("#padQaSummary").textContent="Copy unavailable in this browser. Select and copy this text manually:\n\n"+value;
  }
});
refresh();
