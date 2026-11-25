"use strict";

const {selectedIdRecognized} = require("./selectedIdPolicy");

/**
 * Automatic PHOTO/face screening only (NOT government identity approval).
 * Server consumes normalized internal AI screening and AI face decision.
 * Never use this result to set identityVerified or identityStatus="verified".
 */
function assessIdentityClarityScreening({screening,rawDecision,faceOnly=false}={}) {
  const decision=(status,reason)=>Object.freeze({status,reason});
  if(faceOnly) return decision("manual_review","original_face_only_lacks_id_quality");
  if(!screening || typeof screening!=="object") {
    return decision("manual_review","quality_unconfirmed");
  }
  if(screening.status==="unsupported" ||
     (Array.isArray(screening.warningCodes) &&
      screening.warningCodes.includes("school_id_not_supported"))) {
    return decision("rescan_required","unsupported_document");
  }
  if(screening.status==="mismatch") {
    return decision("rescan_required","id_unrecognized_or_inconsistent");
  }
  const warnings=Array.isArray(screening.warningCodes)?screening.warningCodes:[];
  if(screening.imageQualityStatus==="low" ||
     warnings.includes("low_document_image_quality")) {
    return decision("manual_review","blurry_id");
  }
  if(screening.imageQualityStatus!=="adequate") {
    return decision("manual_review","quality_unconfirmed");
  }
  if(warnings.length) {
    return decision("manual_review","document_warnings");
  }
  if(!selectedIdRecognized(screening)) {
    return decision("manual_review","id_unrecognized_or_inconsistent");
  }
  if(screening.profileNameCheck!=="possible_match" ||
     screening.profileBirthDateCheck!=="possible_match") {
    return decision("manual_review","profile_consistency_unconfirmed");
  }
  if(rawDecision==="failed") return decision("manual_review","face_mismatch");
  if(rawDecision!=="verified") return decision("manual_review","face_uncertain");
  return decision("auto_passed","clear_id_and_face_match");
}
module.exports={assessIdentityClarityScreening};
