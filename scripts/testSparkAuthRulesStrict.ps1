# VolunServe Spark Firestore pre-release gate (Windows PowerShell 5.1+).
# Runs ONLY against the local demo-volunserve Firestore emulator.
# Native stderr must not become a terminating NativeCommandError in PS 5.1.
# A "PASS" denial caused by an evaluator expression cap is NOT production-ready.
$ErrorActionPreference = "Stop"
$project = "demo-volunserve"
$logPath = Join-Path (Get-Location) "firestore-auth-test-output.log"

Write-Host "Running Firebase Rules tests against $project..." -ForegroundColor Cyan

# PowerShell 5.1 promotes stderr from npx/node to an ErrorRecord when
# redirected with *>&1 and ErrorActionPreference=Stop. A benign Node.js
# deprecation warning (such as DEP0040 punycode) then aborts the wrapper
# before the emulator test result is read. Let cmd.exe collect both streams
# into a logfile; the actual exit code and critical diagnostics stay checked.
$command = 'npx firebase-tools emulators:exec --only firestore --project demo-volunserve "node scripts/testSparkAuthRules.cjs" > "firestore-auth-test-output.log" 2>&1'
& cmd.exe /d /c $command
$testExit = $LASTEXITCODE

if (-not (Test-Path $logPath)) {
  throw "BLOCK RELEASE: No test output log was generated."
}
$fullLog = Get-Content -Path $logPath -Raw
Write-Host $fullLog

if ($testExit -ne 0) {
  throw "BLOCK RELEASE: Firebase security test failed (exit $testExit). See $logPath"
}
if ($fullLog -match "(?i)maximum of 1000 expressions to evaluate has been reached") {
  throw "BLOCK RELEASE: Firestore Rules exceeded the 1,000-expression evaluation limit, even though deny-assertions may say PASS. See $logPath"
}
if ($fullLog -notmatch "14/14 authentication security rules checks passed") {
  throw "BLOCK RELEASE: Missing 14/14 positive-and-negative test confirmation. See $logPath"
}
Write-Host "Release gate passed: 14 tests, no expression-limit diagnostics." -ForegroundColor Green
