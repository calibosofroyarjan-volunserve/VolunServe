# VolunServe official emblem -> square launcher, adaptive, favicon and splash PNGs.
# Windows PowerShell 5.1+; uses the built-in System.Drawing library.
# Run from the project root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-brand-icons.ps1
#
# This uses the actual source emblem (assets/images/logo.png).
# Do not use the placeholder "V/A" assets when publishing a mobile app.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$images = Join-Path $root "assets\images"
$logoPath = Join-Path $images "logo.png"

if (-not (Test-Path $logoPath)) {
  throw "Missing official VolunServe logo: $logoPath"
}

$logo = [System.Drawing.Image]::FromFile($logoPath)

function Write-BrandedPng {
  param(
    [Parameter(Mandatory = $true)][string] $FileName,
    [Parameter(Mandatory = $true)][int] $Size,
    [Parameter(Mandatory = $true)][double] $FillRatio,
    [bool] $WhiteBackground = $false,
    [bool] $Monochrome = $false
  )

  $image = [System.Drawing.Bitmap]::new(
    $Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($image)
  $attributes = $null

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($WhiteBackground) {
      $graphics.Clear([System.Drawing.Color]::White)
    } else {
      $graphics.Clear([System.Drawing.Color]::Transparent)
    }

    $maxPixels = $Size * $FillRatio
    $factor = [Math]::Min($maxPixels / $logo.Width, $maxPixels / $logo.Height)
    $w = [int][Math]::Round($logo.Width * $factor)
    $h = [int][Math]::Round($logo.Height * $factor)
    $x = [int][Math]::Floor(($Size - $w) / 2)
    $y = [int][Math]::Floor(($Size - $h) / 2)
    $dest = [System.Drawing.Rectangle]::new($x, $y, $w, $h)

    if ($Monochrome) {
      # Android 13+ themed icon: retain only the emblem alpha mask.
      $matrix = [System.Drawing.Imaging.ColorMatrix]::new()
      $matrix.Matrix00 = 0
      $matrix.Matrix11 = 0
      $matrix.Matrix22 = 0
      $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
      $attributes.SetColorMatrix($matrix)
      $graphics.DrawImage(
        $logo, $dest, 0, 0, $logo.Width, $logo.Height,
        [System.Drawing.GraphicsUnit]::Pixel, $attributes
      )
    } else {
      $graphics.DrawImage($logo, $dest)
    }

    $out = Join-Path $images $FileName
    $image.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host ("Created {0} ({1}x{1})" -f $FileName, $Size)
  } finally {
    if ($null -ne $attributes) { $attributes.Dispose() }
    $graphics.Dispose()
    $image.Dispose()
  }
}

try {
  # Browser fallback PNG. app.json also points to the high-res original emblem.
  Write-BrandedPng -FileName "favicon.png" -Size 96 -FillRatio 0.94

  # Square opaque launcher icon. Android legacy and iOS use this asset.
  Write-BrandedPng -FileName "icon.png" -Size 1024 -FillRatio 0.80 -WhiteBackground $true

  # Android adaptive icon's foreground stays within the central safe zone.
  Write-BrandedPng -FileName "android-icon-foreground.png" -Size 1024 -FillRatio 0.60
  Write-BrandedPng -FileName "android-icon-monochrome.png" -Size 1024 -FillRatio 0.60 -Monochrome $true

  # Splash screen logo uses the same official emblem.
  Write-BrandedPng -FileName "splash-icon.png" -Size 1024 -FillRatio 0.55
  Write-Host "Brand assets ready. Commit these PNGs before EAS APK/iOS builds."
} finally {
  $logo.Dispose()
}
