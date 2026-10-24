# VolunServe logo in the website tab and future mobile apps

The official VolunServe emblem already lives at `assets/images/logo.png`.

## Website favicon
`app.json` now points `expo.web.favicon` to the official emblem, instead of the blue Expo placeholder. No separate icon generation is required for the website.

Update the production build on a machine with the project installed:

```powershell
git status
git pull origin main
$env:NODE_OPTIONS="--max-old-space-size=3072"
npx expo export --platform web --clear --max-workers 1
Test-Path .\dist\index.html
npx --yes firebase-tools@latest deploy --only hosting --project volunserve-3aa5b
```

Only deploy if the export succeeded and the test returned True. This affects the **live** Firebase Hosting site (`volunserve.com`), not just a preview channel. Try a private window if the favicon stays cached.

## APK / Android / iOS application icons
Do **not** ship the original blue Expo placeholder icons.

On Windows, from the project root, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-brand-icons.ps1
```

The script uses the official emblem to replace:
- `assets/images/icon.png`: 1024×1024 square icon, white background; used as the base launcher/iOS icon
- `assets/images/android-icon-foreground.png`: square image with the emblem in the Android adaptive safe zone
- `assets/images/android-icon-monochrome.png`: matching themed icon mask on supported Android devices
- `assets/images/splash-icon.png`: splash-screen artwork
- `assets/images/favicon.png`: additional square favicon asset

The original `logo.png` is not changed.

**Commit and push the generated PNG assets before producing an EAS build** so cloud builds also receive the correct images:

```powershell
git add assets/images/favicon.png assets/images/icon.png assets/images/android-icon-foreground.png assets/images/android-icon-monochrome.png assets/images/splash-icon.png
git commit -m "assets: apply VolunServe official logo icons"
git push origin main
```

Use a branch and PR instead if your team's workflow requires review. The icon only changes in a **newly built/installed APK or published store update**; existing installed builds do not change merely because the website favicon was updated.

Test a real Android home-screen icon (including themed icons) before publication. App store listing artwork is a separate upload to the publishing console.

The PowerShell generator uses System.Drawing, which is part of Windows PowerShell. It is **not** executed automatically on cloud build machines; generated PNGs must be committed first.
