# VolunServe Spark Firestore pre-release gate (PowerShell / Windows).
# Runs ONLY against the local demo-volunserve Firestore emulator.
# A "PASS" denial caused by an evaluator expression cap is NOT production-ready.
$ErrorActionPreference = "Stop"
$project = "demo-volunserve"
$logPath = Join-Path (Get-Location) "firestore-auth-test-output.log"

Write-Host "Running Firebase Rules tests against $project..." -ForegroundColor Cyan
& npx firebase-tools emulators:exec --only firestore --project $project "node scripts/testSparkAuthRules.cjs" *>&1 |
  Tee-Object -FilePath $logPath

$testExit = $LASTEXITCODE
if ($testExit -ne 0) {
  throw "Firebase security test failed (exit $testExit). See $logPath"
}

$fullLog = Get-Content -Path $logPath -Raw
if ($fullLog -match "(?i)maximum of 1000 expressions to evaluate has been reached") {
  throw "BLOCK RELEASE: Firestore Rules exceeded the 1,000-expression evaluation limit, even though deny-assertions may say PASS. See $logPath"
}
if ($fullLog -notmatch "10/10 authentication security rules checks passed") {
  throw "BLOCK RELEASE: Missing 10/10 positive-and-negative test confirmation. See $logPath"
}
Write-Host "Release gate passed: 10 tests, no expression-limit diagnostics." -ForegroundColor Green
