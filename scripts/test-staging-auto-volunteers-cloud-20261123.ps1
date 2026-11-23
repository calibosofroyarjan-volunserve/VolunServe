# VolunServe isolated FICTIONAL staging - terminal Cloud Auth E2E.
# Default mode is READ-ONLY. No production Firestore/Render, no resets.
# Do not paste passwords, ID tokens, or real personal data in chat.
param(
  [ValidateSet(0,1,2,3)]
  [int]$VolunteerSlot = 0,
  [switch]$AllowFictionalWrites,
  [switch]$DemoOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Fast final-defense demonstration (LOCAL FICTIONAL DATA).
# It executes the actual staging batch invitation/Accept/Decline module
# against the audited transactional in-memory test harness, and DOES NOT
# sign into cloud Firebase or create real notifications or assignments.
if ($DemoOnly) {
  $testPath = Join-Path $PSScriptRoot "..\\backend\\test-stagingAllVolunteerDefense.cjs"
  if (-not (Test-Path -LiteralPath $testPath)) {
    throw "Missing local fictional test harness. Re-fetch staging branch."
  }
  Write-Host "AUTOMATIC VOLUNTEER: LOCAL FICTIONAL DEFENSE DEMO" -ForegroundColor Cyan
  Write-Host "Admin validates -> 3 independent invites -> 2 Accept, 1 Decline -> No duplicates" -ForegroundColor Cyan
  Write-Host "Testing real staging backend logic with IN-MEMORY FICTIONAL Firestore only." -ForegroundColor Yellow
  node --test $testPath
  if ($LASTEXITCODE -ne 0) {
    throw "Automatic invitation defense demo tests FAILED."
  }
  Write-Host "SUCCESS: Local fictional automatic invitation flow demonstrated (not cloud/live)." -ForegroundColor Green
  return
}

$Base = "https://volunserve-emergency-match-staging-free.onrender.com"
$Project = "volunserve-volunteer-staging"
# This is the PUBLIC browser Firebase API key already present in the
# staging Admin/Volunteer HTML; NOT a service account credential.
$PublicFirebaseWebApiKey = "AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM"
$FixedCase = "STAGING_E2E_002"
$FixedVolunteerEmail = @{
  1 = "staging002.qa.volunteer1@example.com"
  2 = "staging002.qa.volunteer2@example.com"
  3 = "staging002.qa.volunteer3@example.com"
}
function Fail([string]$Message) { throw "STAGING BLOCKED: $Message" }
function CloudGet([string]$Path, [string]$Token = "") {
  if (-not $Path.StartsWith("/api/") -and $Path -ne "/health") {
    Fail "This script only calls specific staging API paths."
  }
  $headers = @{"Cache-Control" = "no-store"}
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  return Invoke-RestMethod -Uri ($Base + $Path) -Method Get -Headers $headers -TimeoutSec 45
}
function CloudPost([string]$Path, [string]$Token, [hashtable]$Body) {
  if (-not $AllowFictionalWrites) { Fail "POST is disabled; pass -AllowFictionalWrites." }
  if (-not $Token) { Fail "Staging Firebase sign-in is required." }
  $allowlisted = @(
    "/api/admin/emergency-auto/e2e-002/create",
    "/api/admin/emergency-auto/e2e-002/validate",
    "/api/staging/volunteer/e2e-002/bulk-respond"
  )
  if ($Path -notin $allowlisted) { Fail "Forbidden staging mutation path." }
  if ($Body.ContainsKey("caseId") -and $Body.caseId -ne $FixedCase) {
    Fail "Only the fixed fictional staging case may be changed."
  }
  return Invoke-RestMethod -Uri ($Base + $Path) -Method Post -Headers @{
    "Authorization" = "Bearer $Token"
    "Cache-Control" = "no-store"
  } -Body ($Body | ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 60
}
function GetStagingToken([string]$Role, [string]$DefaultEmail = "") {
  $emailPrompt = if ($DefaultEmail) {"$Role email [$DefaultEmail]"} else {"$Role email (staging ONLY)"}
  $email = Read-Host $emailPrompt
  if (-not $email -and $DefaultEmail) { $email = $DefaultEmail }
  if (-not $email -or $email -notmatch '^[^@\s]+@[^@\s]+$') {
    Fail "A valid isolated staging Firebase email is required."
  }
  $secure = Read-Host "$Role password (hidden; never share)" -AsSecureString
  $pointer = [IntPtr]::Zero
  $plaintext = $null
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $plaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $payload = @{
      email = $email
      password = $plaintext
      returnSecureToken = $true
    } | ConvertTo-Json -Compress
    $authUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$PublicFirebaseWebApiKey"
    $response = Invoke-RestMethod -Method Post -Uri $authUrl -Body $payload -ContentType "application/json" -TimeoutSec 45
    if (-not $response.idToken -or -not $response.localId) { Fail "Staging Firebase Auth did not return a valid session." }
    Write-Host "$Role Firebase Auth: PASS (UID hidden; token not printed)" -ForegroundColor Green
    return $response.idToken
  } finally {
    $plaintext = $null
    $payload = $null
    if ($pointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $secure.Dispose()
  }
}
function ConfirmFictionalAction([string]$Prompt, [string]$Expected) {
  Write-Host $Prompt -ForegroundColor Yellow
  return (Read-Host "Type $Expected to proceed") -ceq $Expected
}
Write-Host "VolunServe - ISOLATED STAGING CLOUD E2E (no-barangay)" -ForegroundColor Cyan
Write-Host "Fixed fictional case: $FixedCase | Production is NEVER targeted."
if (-not $AllowFictionalWrites) {
  Write-Host "READ-ONLY MODE: No accounts, tasks, notifications or Firestore records will be changed." -ForegroundColor Cyan
}
$health = CloudGet "/health"
# Render Free may initially say 'checking' while its Firestore probe warms.
# Always recheck project isolation and enablement before any Auth or writes.
for ($attempt = 0; $attempt -lt 20 -and
    $health.stagingFirestoreReadStatus -eq "checking"; $attempt++) {
  Start-Sleep -Seconds 2
  $health = CloudGet "/health"
}
if ($health.service -ne "volunserve-emergency-matching-staging" -or
    $health.stagingServiceAccountMatches -ne $true -or
    $health.stagingFirestoreReadStatus -ne "verified" -or
    $health.matchingEnabled -ne $true -or
    $health.officialEmergencyDispatch -ne $false) {
  Fail "Staging health/project isolation is not verified. No login or writes attempted."
}
Write-Host "Render staging and isolated Firebase connection: PASS" -ForegroundColor Green
$adminToken = GetStagingToken "Admin"
$preflight = CloudGet "/api/admin/emergency-auto/e2e-002/preflight" $adminToken
Write-Host ("Fictional report: " + [string]$preflight.status)
$batch = CloudGet "/api/admin/emergency-auto/e2e-002/bulk-status" $adminToken
Write-Host ("Initial automatic invitation batch: " + [string]$batch.status)
Write-Host ("Offers: {0} | Accepted: {1} | Declined: {2} | Pending: {3}" -f $batch.offered,$batch.accepted,$batch.declined,$batch.pending)
if ($AllowFictionalWrites -and $batch.status -eq "not_started") {
  if ($preflight.status -in @("not_created","reported","ready")) {
    $yes = ConfirmFictionalAction "OPTIONAL: create/validate the FIXED fictional 002 report. Existing accepted tasks will never be reset." "FICTIONAL-002"
    if ($yes) {
      if ($preflight.status -eq "not_created") {
        $created = CloudPost "/api/admin/emergency-auto/e2e-002/create" $adminToken @{
          caseId=$FixedCase;confirmFictionalTest=$true
        }
        Write-Host ("Fictional create result: " + [string]$created.status)
        if ($created.status -notin @("created","already_exists")) { Fail "Fictional case creation did not succeed." }
      }
      $validation = CloudPost "/api/admin/emergency-auto/e2e-002/validate" $adminToken @{
        caseId=$FixedCase;confirmFictionalTest=$true
      }
      Write-Host ("Admin validation: " + [string]$validation.status)
      if ($null -ne $validation.automaticOffers) {
        Write-Host ("AUTOMATIC invitation fanout: " + [string]$validation.automaticOffers.status)
        if ($null -ne $validation.automaticOffers.offered) {
          Write-Host ("Volunteers invited: " + [string]$validation.automaticOffers.offered)
        }
      }
    }
  } else {
    Write-Host "No write: current case is not a safe newly reported fictional test case." -ForegroundColor Yellow
  }
}
$batch = CloudGet "/api/admin/emergency-auto/e2e-002/bulk-status" $adminToken
Write-Host ("Batch NOW: {0}; offered {1}; accepted {2}; declined {3}; pending {4}" -f $batch.status,$batch.offered,$batch.accepted,$batch.declined,$batch.pending) -ForegroundColor Cyan
if ($batch.status -ne "not_started") {
  try {
    $verified = CloudGet "/api/admin/emergency-auto/e2e-002/bulk-verify-acceptance" $adminToken
    Write-Host ("Independent acceptance verifier: " + [string]$verified.status)
  } catch {
    Write-Host "Independent verifier not yet conclusive; current accepted-task state preserved." -ForegroundColor Yellow
  }
}
if ($VolunteerSlot -ne 0) {
  $volunteerToken = GetStagingToken ("Volunteer " + $VolunteerSlot) $FixedVolunteerEmail[$VolunteerSlot]
  $task = CloudGet "/api/staging/volunteer/e2e-002/bulk-task" $volunteerToken
  Write-Host ("Volunteer {0} invitation: {1}; canRespond={2}" -f $VolunteerSlot,$task.status,$task.canRespond) -ForegroundColor Cyan
  if ($AllowFictionalWrites -and $task.status -eq "offered" -and $task.canRespond -eq $true) {
    $choice = Read-Host "Optional: type ACCEPT or DECLINE to decide YOUR OWN fictional offer, or Enter to skip"
    $choice = $choice.Trim().ToUpperInvariant()
    if ($choice -in @("ACCEPT","DECLINE")) {
      $confirm = ConfirmFictionalAction "This changes only YOUR OWN fixed fictional staging invitation." ("$choice-002")
      if ($confirm) {
        $decision = if ($choice -eq "ACCEPT") { "accepted" } else { "declined" }
        $outcome = CloudPost "/api/staging/volunteer/e2e-002/bulk-respond" $volunteerToken @{
          caseId=$FixedCase;decision=$decision
        }
        Write-Host ("Authenticated Volunteer decision: " + [string]$outcome.status) -ForegroundColor Green
      }
    }
  } else {
    Write-Host "No Volunteer write attempted. Existing accepted, declined or expired offers are protected."
  }
  $finalTask = CloudGet "/api/staging/volunteer/e2e-002/bulk-task" $volunteerToken
  Write-Host ("Final Volunteer task status: " + [string]$finalTask.status)
}
$finalBatch = CloudGet "/api/admin/emergency-auto/e2e-002/bulk-status" $adminToken
Write-Host ("FINAL: offers={0}, accepted={1}, declined={2}, pending={3}" -f $finalBatch.offered,$finalBatch.accepted,$finalBatch.declined,$finalBatch.pending) -ForegroundColor Green
Write-Host "RESULT: Authenticated cloud staging API checked. This does NOT deploy or prove the NEW Firebase Functions PR #831 is live." -ForegroundColor Yellow
