# Fixed fictional Volunteer 2 staging login read-only diagnostic.
# Asks for password locally and prints only safe auth/profile statuses.
# Does NOT modify Firebase, user account, permissions, or production.
Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
$Project="volunserve-volunteer-staging"
$Email="staging002.qa.volunteer2@example.com"
$UID="staging002_qa_volunteer_02"
$ApiKey="AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM"
function StopSafe([string]$Message) { throw "STAGING DIAGNOSTIC: $Message" }
function GetSafeFirebaseError($ErrorObject) {
  try {
    $message=[string]$ErrorObject.ErrorDetails.Message
    if ($message) {
      $code=[string](($message | ConvertFrom-Json).error.message)
      if ($code -match '^[A-Z_]{3,64}$') { return $code }
    }
  } catch {}
  return "REQUEST_FAILED"
}
Write-Host "Checking fixed FICTIONAL Volunteer 2 against isolated Firebase staging only" -ForegroundColor Cyan
$secure=Read-Host "Volunteer 2 test password (hidden)" -AsSecureString
$pointer=[IntPtr]::Zero
$password=$null
$payload=$null
try {
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $payload=@{email=$Email;password=$password;returnSecureToken=$true}|ConvertTo-Json -Compress
  $signInUrl="https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey"
  try {
    $session=Invoke-RestMethod -Method Post -Uri $signInUrl -Body $payload -ContentType "application/json" -TimeoutSec 40
  } catch {
    $code=GetSafeFirebaseError $_
    StopSafe "Firebase Auth SIGN-IN FAILED ($code). Check Volunteer 2 test password. Nothing was changed."
  }
} finally {
  $password=$null
  $payload=$null
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  $secure.Dispose()
}
if($session.localId -ne $UID -or !$session.idToken) {
  StopSafe "Firebase session not owned by exact fictional Volunteer 2 fixture."
}
Write-Host "PASS 1/3: Firebase staging email/password authentication OK" -ForegroundColor Green
$headers=@{Authorization=("Bearer "+$session.idToken)}
try {
  $lookup=Invoke-RestMethod -Method Post -Uri ("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+$ApiKey) -Body (@{idToken=$session.idToken}|ConvertTo-Json -Compress) -ContentType "application/json" -TimeoutSec 40
} catch {
  StopSafe ("Firebase Auth user lookup FAILED ("+(GetSafeFirebaseError $_)+")")
}
$account=@($lookup.users)|Select-Object -First 1
if(!$account -or $account.localId -ne $UID) {StopSafe "Unexpected Firebase Auth UID"}
if($account.emailVerified -ne $true) {StopSafe "Email verification still FALSE in Firebase Auth"}
Write-Host "PASS 2/3: Firebase staging emailVerified=true" -ForegroundColor Green
$documentUrl="https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents/users/$UID"
try {
  $profile=Invoke-RestMethod -Method Get -Uri $documentUrl -Headers $headers -TimeoutSec 40
} catch {
  $responseCode="READ_FAILED"
  try {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $responseCode=[string][int]$_.Exception.Response.StatusCode
    }
  } catch {}
  StopSafe ("Firebase Auth succeeded but Firestore profile READ FAILED (HTTP "+$responseCode+"). Check staging Firestore Rules.")
}
if($profile.name -notlike "*/users/$UID") {StopSafe "Wrong user profile document"}
$fields=$profile.fields
if($fields.testOnly.booleanValue -ne $true -or
   $fields.testFixture.stringValue -ne "STAGING_E2E_002" -or
   [int]$fields.testFixtureSlot.integerValue -ne 2) {
  StopSafe "Profile is not the exact fictional Volunteer 2 fixture"
}
$mode=[string]$fields.activeMode.stringValue
$status=[string]$fields.status.stringValue
$role=[string]$fields.role.stringValue
Write-Host ("Profile: role={0}, status={1}, activeMode={2}" -f $role,$status,$mode) -ForegroundColor Cyan
if($mode -ne "volunteer" -or $status -ne "approved" -or $role -ne "volunteer") {
  StopSafe "Volunteer dashboard profile fields not ready"
}
Write-Host "PASS 3/3: Authorized staging Firestore profile read + Volunteer route" -ForegroundColor Green
Write-Host "RESULT: All cloud login requirements PASS. If website remains at /login, investigate browser-only error / stale web session." -ForegroundColor Yellow
