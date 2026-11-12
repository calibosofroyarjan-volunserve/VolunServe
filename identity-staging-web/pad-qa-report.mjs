// Staging-only manual real-device observations. No PII, media or telemetry.
export const QA_CASES = Object.freeze([
  {id:"selfie_camera", title:"Front/selfie camera opens", expected:"Local camera diagnostic starts, captures FPS/lighting and stops cleanly."},
  {id:"rear_camera", title:"Rear/ID camera opens", expected:"Rear-camera diagnostic starts or reports the unavailable camera clearly."},
  {id:"genuine_challenge", title:"Live consenting person", expected:"One real person can complete the guided challenge and capture a new photo."},
  {id:"multiple_faces", title:"Multiple people in frame", expected:"The face challenge refuses capture or requests exactly one face."},
  {id:"print_attack", title:"Printed photograph", expected:"Printed photo must not be mistaken for verified human liveness; record if the challenge accepts it."},
  {id:"screen_replay", title:"Photo/video on another screen", expected:"Record whether screen replay can complete the challenge; never equate movement with PAD."},
  {id:"lighting_failure", title:"Very dim / backlit camera", expected:"Requests better lighting or clearer capture, never an automatic identity approval."},
  {id:"permission_denied", title:"Camera permission refused", expected:"Friendly permission error, no identity submission or upload."},
  {id:"face_match_pair", title:"Same-person vs different-person face matching", expected:"Requires isolated staging backend and consented identity images; evaluate real false matches. Leave Not tested if staging is not ready."},
  {id:"admin_review_gate", title:"No automatic Verified Resident approval", expected:"A good similarity result remains pending independent authorized Admin review."}
]);
export const QA_VALUES = Object.freeze(["not_tested","pass","fail","inconclusive"]);

export function buildDeviceQaReport({device="unspecified",observations={}}={}) {
  const allowedDevices=["android_chrome","android_edge","windows_edge","other"];
  const sanitizedDevice=allowedDevices.includes(device)?device:"unspecified";
  const entries=QA_CASES.map(item=>{
    const status=QA_VALUES.includes(observations?.[item.id])?observations[item.id]:"not_tested";
    return {id:item.id,status};
  });
  const counts=Object.fromEntries(QA_VALUES.map(v=>[v,entries.filter(x=>x.status===v).length]));
  const spoofCases=entries.filter(x=>x.id==="print_attack"||x.id==="screen_replay");
  return {
    reportType:"volunserve_face_device_manual_qa_v1",
    privacy:"local_only_no_media_no_identifiers",
    source:"staging_camera_lab_not_production",
    device:sanitizedDevice,
    observations:entries,
    counts,
    observedSpoofAcceptance:spoofCases.some(x=>x.status==="fail"),
    faceMatchAccuracyValidated:false,
    independentPadValidated:false,
    issuerAuthenticityValidated:false,
    autoApprovalAuthorized:false,
    assurance:"NOT_CERTIFIED_manual_Admin_review_required",
    note:"Human observations only. A passing camera or movement challenge is NOT proof of presentation-attack detection. Do not upload IDs or selfies in this report."
  };
}
