"""Static regression: account-free OCR demo must not relax authentication."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
PREVIEW = ROOT / "app/public/local-national-id-demo.web.tsx"
FALLBACK = ROOT / "app/public/local-national-id-demo.tsx"
COMPONENT = ROOT / "components/identity/StagingNationalIdLocalLab.web.tsx"
AUTH = ROOT / "app/_layout.tsx"
PUBLIC_AUTH = ROOT / "app/public/_layout.tsx"

class LocalAccountFreePreviewTests(unittest.TestCase):
    def test_preview_guard_is_dev_localhost_only(self):
        source = PREVIEW.read_text(encoding="utf-8")
        self.assertIn("__DEV__", source)
        self.assertIn('window.location.hostname === "localhost"', source)
        self.assertIn('window.location.hostname === "127.0.0.1"', source)
        self.assertIn("localDevelopmentOnly()", source)
        self.assertIn("showAdminReviewLink={false}", source)
        self.assertIn("not to Firebase or Render", source)

    def test_native_fallback_does_not_launch_ocr(self):
        source = FALLBACK.read_text(encoding="utf-8")
        self.assertNotIn("StagingNationalIdLocalLab", source)
        self.assertNotIn("fetch(", source)
        self.assertNotIn("router.", source)

    def test_public_guard_still_requires_no_account_creation(self):
        source = PUBLIC_AUTH.read_text(encoding="utf-8")
        self.assertIn("auth.currentUser", source)
        self.assertIn("return <Stack", source)
        self.assertNotIn("createUserWithEmailAndPassword", source)
        self.assertNotIn("signInAnonymously", source)
        root = AUTH.read_text(encoding="utf-8")
        self.assertIn('router.replace("/login")', root)
        self.assertIn('rootSegment === "public"', root)
        self.assertNotIn("local-national-id-demo", root)

    def test_preview_cannot_write_resident_or_admin_changes(self):
        source = PREVIEW.read_text(encoding="utf-8")
        for forbidden in (
            "setDoc(", "updateDoc(", "uploadBytes(", "signInAnonymously(",
            "createUserWithEmailAndPassword(", "/api/identity/", "/identity-manual-review",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, source)

    def test_existing_panel_still_has_admin_path_only_outside_demo(self):
        source = COMPONENT.read_text(encoding="utf-8")
        self.assertIn("showAdminReviewLink = true", source)
        self.assertIn("{showAdminReviewLink ? <TouchableOpacity", source)
        self.assertIn('router.push("/identity-manual-review"', source)

if __name__ == "__main__":
    unittest.main()
