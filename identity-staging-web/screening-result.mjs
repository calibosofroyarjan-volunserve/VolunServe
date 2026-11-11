// Show truthful, privacy-safe UI verdicts from the server's document screening.
// Local camera auto-capture is never document authentication.
export function documentVerdict(result){
 const screening=result?.documentScreening;
 const status=screening?.status;
 const allowed=new Set(["national_id","drivers_license","passport","umid","prc_id"]);
 const idMatches=allowed.has(screening?.declaredIdType) &&
   screening.declaredIdType===screening.detectedIdType;
 if(status==="unsupported")return {
  kind:"rejected",heading:"AUTO REJECTED — Unsupported ID",
  description:"School, student, employee, or other unsupported ID detected. Only the five government IDs in the selector can be reviewed."
 };
 if(status==="mismatch"||status==="text_consistent_unverified"&&!idMatches)return {
  kind:"rejected",heading:"AUTO REJECTED — Wrong ID type",
  description:"The scanned ID does not match the government ID you selected. Choose the correct ID type and scan again."
 };
 if(status==="inconclusive"||!status||status==="text_consistent_unverified"&&!idMatches)return {
  kind:"retry",heading:"NOT ACCEPTED — ID not recognized",
  description:"OCR could not confirm the selected government ID. Retake a clear photo and retry. No automatic verification was granted."
 };
 if(status==="text_consistent_unverified" && idMatches){
  if(result?.decision==="failed")return {
   kind:"retry",heading:"Face verification failed — Retry",
   description:"The selected government ID type was recognized, but the identity comparison failed. This ID has not been authenticated."
  };
  return {kind:"review",heading:"ID type recognized — Admin review required",
   description:"The document matches the selected category by OCR text only. Authenticity and liveness are unverified; no Verified Resident access is granted automatically."};
 }
 return {kind:"retry",heading:"NOT ACCEPTED — Verification incomplete",
  description:"The identity check was inconclusive. No Verified Resident access has been granted."};
}
