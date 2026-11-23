# Send an official Firebase email verification message to the SAME
# authenticated isolated staging Admin account. Does not mark email verified,
# alter any account, read any Firestore content, or touch production.
# Account owner must click the emailed verification link.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ApiKey = "AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM"
$Email = "calibosofroyarjan@gmail.com"
$Project = "volunserve-volunteer-staging"
function FailSafe([string]$Reason) {
  throw ("STAGING EMAIL CHECK: " + $Reason)
}
function SafeFirebaseCode($Problem) {
  try {
    $body = [string]$Problem.ErrorDetails.Message
    if ($body) {
      $code = [string](($body | ConvertFrom-Json).error.message)
      if ($code -match '^[A-Z0-9_:-]{3,80}$') { return $code }
    }
  } catch {}
  return "REQUEST_FAILED"
}
Write-Host "FICTIONAL STAGING ADMIN EMAIL VERIFICATION ONLY" -ForegroundColor Cyan
Write-Host "Target Firebase project: $Project"
Write-Host "Verification will be sent only to $Email after valid staging password authentication."
$secure = Read-Host "Staging Admin password (hidden)" -AsSecureString
$ptr = [IntPtr]::Zero
$password = $null
$loginJson = $null
try {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $loginJson = @{ email=$Email; password=$password; returnSecureToken=$true } | ConvertTo-Json -Compress
  $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey"
  try {
    $session = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $loginJson -TimeoutSec 40
  } catch {
    $code = SafeFirebaseCode $_
    FailSafe "Admin password sign-in failed ($code). Use Forgot password in the STAGING site if the password is unknown. No verification email sent."
  }
} finally {
  $password = $null
  $loginJson = $null
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $secure.Dispose()
}
if (-not $session.idToken -or -not $session.localId -or ([string]$session.email).ToLowerInvariant() -ne $Email) {
  FailSafe "Staging Auth identity did not match the exact expected Admin email. No email sent."
}
Write-Host "PASS: Staging Admin email/password authentication" -ForegroundColor Green
$checkBody = @{ idToken=$session.idToken } | ConvertTo-Json -Compress
try {
  $accountResponse = Invoke-RestMethod -Method Post -Uri ("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+$ApiKey) -ContentType "application/json" -Body $checkBody -TimeoutSec 40
} catch {
  FailSafe ("Cannot verify staging Auth session: " + (SafeFirebaseCode $_))
}
$found = @($accountResponse.users) | Select-Object -First 1
if (-not $found -or ([string]$found.localId) -ne ([string]$session.localId) -or ([string]$found.email).ToLowerInvariant() -ne $Email) {
  FailSafe "Authenticated email/UID lookup mismatch; no verification email sent."
}
if ($found.emailVerified -eq $true) {
  Write-Host "ALREADY VERIFIED: Staging Admin emailVerified=true. No email needed." -ForegroundColor Green
  exit 0
}
$verifyJson = @{ requestType="VERIFY_EMAIL"; idToken=$session.idToken } | ConvertTo-Json -Compress
try {
  $sent = Invoke-RestMethod -Method Post -Uri ("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key="+$ApiKey) -ContentType "application/json" -Body $verifyJson -TimeoutSec 40
} catch {
  FailSafe ("Firebase could not request the verification email: " + (SafeFirebaseCode $_))
}
if (([string]$sent.email).ToLowerInvariant() -ne $Email) {
  FailSafe "Verification request did not confirm the expected email. Check Firebase Auth settings."
}
Write-Host "SUCCESS: Firebase requested an official email verification message for the staging Admin." -ForegroundColor Green
Write-Host "NEXT: Open your Gmail inbox/spam, click Verify email, then refresh the staging login page."
Write-Host "No account role, password, Firestore Rules, or production configuration changed."
