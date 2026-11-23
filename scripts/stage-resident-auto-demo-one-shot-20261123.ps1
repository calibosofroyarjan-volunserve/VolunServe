# SINGLE COMMAND, ISOLATED STAGING ONLY. Never uses prod Firebase.
# Example:
# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stage-resident-auto-demo-one-shot-20261123.ps1 -KeyFile "C:\Users\Acer\Downloads\volunserve-volunteer-staging-f4f41925d93e.json" -Apply
param(
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$project = "volunserve-volunteer-staging"
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
$keyPath=[IO.Path]::GetFullPath($KeyFile)
if(!(Test-Path -LiteralPath $keyPath -PathType Leaf)) {
  throw "STAGING BLOCKED: staging JSON missing"
}
$credential=Get-Content -LiteralPath $keyPath -Raw | ConvertFrom-Json
if($credential.type -ne "service_account" -or
   $credential.project_id -cne $project -or
   $credential.client_email -notlike "*@volunserve-volunteer-staging.iam.gserviceaccount.com") {
   throw "STAGING BLOCKED: exact isolated staging Firebase credential required"
}
if(!(Test-Path ".\functions\emergencyResidentSubmissionDemo.js") -or
   !(Test-Path ".\scripts\qa-stage-resident-demo-own-notification-task-rules-20261123.cjs") -or
   !(Test-Path ".\scripts\deploy-resident-auto-demo-firebase-staging-20261123.ps1")) {
  throw "STAGING BLOCKED: wrong GitHub branch; fetch qa/resident-submission-auto-invite-demo-20261123"
}
Write-Host "PASS: exact isolated staging Firebase target, no production"
if(!$Apply) {
  Write-Host "READ ONLY: rerun with -Apply to install, release staging-only read rules, and deploy two demo Functions"
  exit 0
}
if(!(Test-Path ".\backend\node_modules\firebase-admin")) {
  & npm.cmd ci --prefix backend --ignore-scripts --no-audit --no-fund
  if($LASTEXITCODE -ne 0){ throw "STAGING BLOCKED: backend dependencies unavailable" }
}
if(!(Test-Path ".\node_modules\.bin\firebase.cmd")) {
  & npm.cmd ci --ignore-scripts --no-audit --no-fund
  if($LASTEXITCODE -ne 0){ throw "STAGING BLOCKED: root Firebase CLI dependencies unavailable" }
}
Write-Host "STEP 1/2: additive STAGING Firestore own read grants (never production)"
& node.exe ".\scripts\qa-stage-resident-demo-own-notification-task-rules-20261123.cjs" --key-file $keyPath --apply
if($LASTEXITCODE -ne 0){ throw "STAGING STOPPED: Firestore staging Rules release failed; no Functions deploy" }
Write-Host "STEP 2/2: deploy only fictional Resident-created offer trigger + secured callable to STAGING"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-resident-auto-demo-firebase-staging-20261123.ps1" -KeyFile $keyPath -Apply
if($LASTEXITCODE -ne 0){ throw "STAGING STOPPED: Firebase Functions stage deploy failed (check IAM/Billing CLI error)" }
Write-Host "PASS: isolated staging own-read Rules and two Firebase demo Functions deployed"
Write-Host "Only low-severity TEST ONLY - fictional Resident submissions can auto-invite."
Write-Host "Production volunserve.com unchanged."
