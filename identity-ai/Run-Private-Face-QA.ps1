# Local-only Windows PowerShell runner for consenting adult test face pairs.
# Requires Docker Desktop running with Linux containers.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$PrivateFolder
)
$ErrorActionPreference = "Stop"
try {
  $folder = (Resolve-Path -LiteralPath $PrivateFolder -ErrorAction Stop).Path
  $repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
  $folderFull = [System.IO.Path]::GetFullPath($folder)
  $repoFull = $repo.TrimEnd([char[]]@('\','/'))
  if ($folderFull.Equals($repoFull, [System.StringComparison]::OrdinalIgnoreCase) -or
      $folderFull.StartsWith($repoFull + [System.IO.Path]::DirectorySeparatorChar,
                             [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "PRIVATE_IMAGE_FOLDER_CANNOT_BE_INSIDE_REPOSITORY"
  }
  $manifest = Join-Path $folderFull "pairs.jsonl"
  if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw "MISSING_PAIRS_JSONL_IN_PRIVATE_FOLDER"
  }
  & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "DOCKER_LINUX_ENGINE_UNAVAILABLE" }
  Write-Host "Building VolunServe QA image from source code only. No photos in build context."
  & docker build --quiet --tag "volunserve-face-qa:local" $PSScriptRoot | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "LOCAL_DOCKER_BUILD_FAILED" }
  Write-Host "Running with networking disabled and private photos mounted read-only."
  $mount = "type=bind,source=$folderFull,target=/private-eval,readonly"
  & docker run --rm --network none --read-only --tmpfs "/tmp:rw,nosuid,nodev,size=64m" --mount $mount "volunserve-face-qa:local" python qa_offline_match.py /private-eval/pairs.jsonl
  if ($LASTEXITCODE -ne 0) { throw "LOCAL_EVALUATION_DID_NOT_COMPLETE" }
  Write-Host "This report is aggregate-only. Delete the raw photos under the consent plan."
} catch {
  Write-Error "Private face QA did not complete. Check Docker and the private manifest; no images were uploaded."
  exit 1
}
