#!/usr/bin/env node
"use strict";
/**
 * Execute in the staging runtime only, e.g.
 *   node scripts/check-staging-isolation.cjs
 *
 * Prints ONLY constant check names and booleans; never logs account IDs,
 * environment values, credentials, tokens, or connection strings.
 */
const {assessFullStagingEnvironment} = require("../stagingFirebaseIsolation");
const result = assessFullStagingEnvironment(process.env);
for (const check of result.checks) {
  process.stdout.write((check.passed ? "PASS " : "BLOCKED ") + check.code + "\n");
}
process.stdout.write(result.safeToUseFullStaging
  ? "PASS: FULL_STAGING_ONLY; no network request or database access performed.\n"
  : "BLOCKED: staging isolation is not proven; do not upload any IDs or enable verification.\n");
if (!result.safeToUseFullStaging) process.exitCode = 1;
