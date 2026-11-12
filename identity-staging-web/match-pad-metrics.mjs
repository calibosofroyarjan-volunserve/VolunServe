// Privacy-safe, local-only 1:1 face-comparison and challenge-observation metrics.
// Aggregate numbers only. NOT a biometric validation, PAD test or issuer proof.
export const DEFAULT_MATCH_THRESHOLD = 0.78;
export const CANDIDATE_THRESHOLDS = Object.freeze([0.65,0.70,0.75,0.78,0.80,0.85,0.90]);
const MAX_TRIALS = 2000;
const Z = 1.959963984540054;

export function parseScoreList(source) {
  if (typeof source !== "string") throw Error("Expected numeric scores only.");
  const input=source.trim();
  if (!input) return [];
  const tokens=input.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length > MAX_TRIALS) throw Error("Too many scores. Use at most 2,000 trials per group.");
  return tokens.map(token=>{
    // No names, emails, filenames, biometric image data or arbitrary text.
    if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)$/.test(token)){
      throw Error("Enter similarity numbers from 0 to 1 only; no names or identifiers.");
    }
    const score=Number(token);
    if (!Number.isFinite(score) || score<0 || score>1) throw Error("Invalid similarity score.");
    return score;
  });
}

export function wilsonInterval(successes, total) {
  if (!Number.isSafeInteger(total) || total<0 || !Number.isSafeInteger(successes) ||
      successes<0 || successes>total) throw Error("Invalid trial counts.");
  if (total===0) return null;
  const p=successes/total;
  const z2=Z*Z;
  const denominator=1+z2/total;
  const center=(p+z2/(2*total))/denominator;
  const margin=Z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/denominator;
  return {lower:Math.max(0,center-margin),upper:Math.min(1,center+margin)};
}
function rate(count,total) {
  return {
    events:count,
    trials:total,
    rate:total>0?count/total:null,
    wilson95:total>0?wilsonInterval(count,total):null
  };
}
function validateScores(values,label) {
  if (!Array.isArray(values)||values.length>MAX_TRIALS ||
      values.some(x=>typeof x!=="number"||!Number.isFinite(x)||x<0||x>1)) {
    throw Error("Invalid "+label+" scores (0..1, max 2000).");
  }
}
function countFor(value,label) {
  const number=Number(value);
  if (!Number.isSafeInteger(number)||number<0||number>10000) {
    throw Error(label+" must be a whole number from 0 to 10,000.");
  }
  return number;
}
export function calculateMatchPadMetrics({
  genuineScores=[],
  impostorScores=[],
  threshold=DEFAULT_MATCH_THRESHOLD,
  printAttempts=0,
  printAccepted=0,
  screenAttempts=0,
  screenAccepted=0
}={}) {
  validateScores(genuineScores,"genuine");
  validateScores(impostorScores,"impostor");
  if (typeof threshold!=="number"||!Number.isFinite(threshold)||threshold<=0||threshold>1){
    throw Error("Threshold must be above zero and at most 1.");
  }
  const pa=countFor(printAttempts,"Printed-photo attempts");
  const pc=countFor(printAccepted,"Printed-photo challenge accepted");
  const sa=countFor(screenAttempts,"Screen replay attempts");
  const sc=countFor(screenAccepted,"Screen replay challenge accepted");
  if(pc>pa||sc>sa) throw Error("Accepted spoof attempts cannot exceed attempts.");
  const summary=(t)=>{
    const falseNonMatches=genuineScores.filter(score=>score<t).length;
    const falseMatches=impostorScores.filter(score=>score>=t).length;
    return {
      threshold:t,
      falseMatch:rate(falseMatches,impostorScores.length),
      falseNonMatch:rate(falseNonMatches,genuineScores.length)
    };
  };
  const selected=summary(threshold);
  const spoof={printedPhoto:rate(pc,pa),screenReplay:rate(sc,sa)};
  const hasMatching=genuineScores.length>0&&impostorScores.length>0;
  const hasAttackData=pa>0||sa>0;
  return {
    schema:"volunserve_identity_local_metrics_v1",
    privacy:"AGGREGATE_ONLY_no_images_no_names_no_userIDs_no_pair_scores",
    source:"manual_unverified_consent_required",
    threshold,
    ...selected,
    thresholdComparison:CANDIDATE_THRESHOLDS.map(summary),
    challengeAcceptanceObserved:spoof,
    attackAcceptanceObserved: pc>0||sc>0,
    pairedMatchingMeasurementsPresent:hasMatching,
    challengeObservationsPresent:hasAttackData,
    realDeviceMatchAccuracyValidated:false,
    independentPadValidated:false,
    issuerAuthenticityValidated:false,
    autoVerificationAllowed:false,
    finalApproval:"AUTHORIZED_ADMIN_ONLY",
    note:"Descriptive aggregates only. FMR=impostor scores >= threshold; FNMR=genuine scores below threshold. Wilson 95% bounds assume independent trials; repeated people/photos violate that assumption. Printed/screen challenge acceptance is NOT certified ISO/IEC 30107-3 IAPAR. No changes to deployed thresholds."
  };
}
