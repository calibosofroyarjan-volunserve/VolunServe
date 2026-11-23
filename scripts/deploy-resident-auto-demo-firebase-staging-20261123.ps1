# ONLY isolated Firebase staging. Auth, Firestore and Functions EMULATOR E2E
# already tested in GitHub Actions. This deploys ONLY two new demo Functions.
# No production Firebase project or Render/hosting is touched.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-resident-auto-demo-firebase-staging-20261123.ps1 -KeyFile "C:\path\staging.json" -Apply
param(
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$project = "volunserve-volunteer-staging"
$repoRoot = Split-Path $PSScriptRoot -Parent
$keyPath = [IO.Path]::GetFullPath($KeyFile)
if (!(Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw "STAGING BLOCKED: service-account JSON not found" }
$key = Get-Content -LiteralPath $keyPath -Raw | ConvertFrom-Json
if ($key.type -ne "service_account" -or $key.project_id -cne $project -or
    $key.client_email -notlike "*@volunserve-volunteer-staging.iam.gserviceaccount.com" -or
    -not ([string]$key.private_key).Contains("BEGIN PRIVATE KEY")) {
  throw "STAGING BLOCKED: exact isolated Firebase staging service account required"
}
Set-Location $repoRoot
$source = Get-Content .\functions\emergencyResidentSubmissionDemo.js -Raw
$main = Get-Content .\functions\index.js -Raw
$decide = Get-Content .\functions\emergencySimpleAutoInvite.js -Raw
if (-not $source.Contains('project==="volunserve-volunteer-staging"') -or
    -not $source.Contains('data.title.startsWith("TEST ONLY - ")') -or
    -not $source.Contains('project==="demo-volunserve-simple-invites"') -or
    -not $main.Contains('exports.autoInviteFictionalResidentSubmittedVolunteers') -or
    -not $main.Contains('exports.respondToAutoVolunteerInvitation') -or
    -not $decide.Contains('automatic_resident_submission_demo')) {
  throw "STAGING BLOCKED: expected OFF-by-default demo Functions code missing"
}
node --check .\functions\index.js
if ($LASTEXITCODE -ne 0) { throw "STAGING BLOCKED: invalid Functions index" }
node --check .\functions\emergencyResidentSubmissionDemo.js
if ($LASTEXITCODE -ne 0) { throw "STAGING BLOCKED: invalid demo trigger" }
node --test .\functions\test-emergencyResidentSubmissionDemoGates.cjs
if ($LASTEXITCODE -ne 0) { throw "STAGING BLOCKED: production-deny gate tests failed" }
Write-Host "PASS: safe isolated stage, TEST ONLY guard, production deny gate"
if (-not $Apply) {
  Write-Host "READ ONLY: add -Apply to deploy only two staging demo Functions"
  exit 0
}
$flags = @(
  "VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED=true",
  "VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID=volunserve-volunteer-staging",
  "VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED=false",
  "VOLUNSERVE_RESIDENT_SUBMISSION_DEMO_ENABLED=true",
  "VOLUNSERVE_RESIDENT_DEMO_STAGING_APPROVED=true"
)
$flagsFile=Join-Path $repoRoot "functions\.env.volunserve-volunteer-staging"
if (Test-Path -LiteralPath $flagsFile) {
  $old = @(Get-Content -LiteralPath $flagsFile | Where-Object { $_.Trim() -ne "" -and -not $_.Trim().StartsWith("#") })
  $new = @($flags)
  if (@(Compare-Object $old $new).Length -ne 0) {
    throw "STAGING BLOCKED: staging Functions environment flags file differs; refusing overwrite"
  }
} else {
  [IO.File]::WriteAllText($flagsFile,($flags -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
}
$firebaseCli=Join-Path $repoRoot "node_modules\.bin\firebase.cmd"
if (!(Test-Path -LiteralPath $firebaseCli)) {
  throw "STAGING BLOCKED: Firebase CLI missing. Run npm ci in this worktree, then repeat."
}
$oldCred = [Environment]::GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS","Process")
$oldProj = [Environment]::GetEnvironmentVariable("GCLOUD_PROJECT","Process")
try {
  $env:GOOGLE_APPLICATION_CREDENTIALS=$keyPath
  $env:GCLOUD_PROJECT=$project
  Write-Host "DEPLOYING DEMO-ONLY Functions to isolated Firebase $project (not live)"
  & $firebaseCli deploy --project $project --only "functions:autoInviteFictionalResidentSubmittedVolunteers,functions:respondToAutoVolunteerInvitation" --non-interactive
  if ($LASTEXITCODE -ne 0) { throw "STAGING DEPLOY FAILED. See Firebase CLI error (project/billing/IAM)." }
  Write-Host "PASS: two staging demo Firebase Functions deployed. No production change."
} finally {
  [Environment]::SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS",$oldCred,"Process")
  [Environment]::SetEnvironmentVariable("GCLOUD_PROJECT",$oldProj,"Process")
}
