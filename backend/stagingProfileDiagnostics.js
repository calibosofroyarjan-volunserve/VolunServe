"use strict";

/**
 * Classify a Firestore server failure without logging tokens, user details,
 * error.message, service account information, document paths, or stack traces.
 * Intentionally allowlist only coarse gRPC statuses. Staging only.
 */
function classifyStagingFirestoreFailure(error) {
  const code = error && error.code;
  const numeric = {
    3:"INVALID_ARGUMENT",
    4:"DEADLINE_EXCEEDED",
    5:"NOT_FOUND",
    7:"PERMISSION_DENIED",
    8:"RESOURCE_EXHAUSTED",
    9:"FAILED_PRECONDITION",
    13:"INTERNAL",
    14:"UNAVAILABLE",
    16:"UNAUTHENTICATED",
  };
  if (typeof code === "number" && Number.isInteger(code))
    return numeric[code] || "OTHER";
  if (typeof code !== "string") return "OTHER";
  // No arbitrary string from remote error is ever printed.
  const normal = code.trim().toUpperCase().replace(/-/g, "_");
  return Object.values(numeric).includes(normal) ? normal : "OTHER";
}
module.exports = {classifyStagingFirestoreFailure};
