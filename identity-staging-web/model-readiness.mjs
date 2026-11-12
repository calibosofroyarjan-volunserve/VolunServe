// Read-only model-status formatting for the isolated VolunServe QA lab.
// A loaded model is NOT independently validated PAD, nor Resident approval.
// No network, media, persistent storage, timestamps or personal data.
export function summarizeAiReadiness(value) {
 const d=value && typeof value==="object"?value:{};
 return {
   coreEngineReady:d.ready===true,
   provider:d.provider==="volunserve-custom-ai"?"volunserve-custom-ai":"unconfirmed",
   documentOcrReady:d.documentOcrReady===true,
   profileComparisonReady:d.profileComparisonReady===true,
   documentPrecheckReady:d.documentPrecheckReady===true,
   miniFasNetModelLoaded:d.passivePadShadow?.modelLoaded===true,
   miniFasNetShadowEnabled:d.passivePadShadow?.shadowEnabled===true,
   yuNetModelLoaded:d.faceDetectorShadow?.modelLoaded===true,
   // Do not take trust/security claims from an unvalidated AI service.
   independentLivenessPadValidated:false,
   realDeviceAccuracyMeasured:false,
   idAuthenticityVerified:false,
   biometricMediaSubmissionsEnabled:false,
   automaticVerifiedResidentApproval:false,
   note:"Experimental model loading != proven anti-spoofing. ID/selfie uploads remain blocked. Readiness uses no camera or identity attempt."
 };
}
