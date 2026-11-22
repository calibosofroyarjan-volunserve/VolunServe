"""Guard the local-only, fictional Admin walkthrough from real-account actions."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "app/public/local-admin-review-demo.web.tsx"
NATIVE = ROOT / "app/public/local-admin-review-demo.tsx"
ROOT_LAYOUT = ROOT / "app/_layout.tsx"
ADMIN_ROUTE = ROOT / "app/(admin)/identity-reviews.tsx"
ADMIN_BACKEND = ROOT / "backend/server.js"

class LocalAdminReviewDefenseTests(unittest.TestCase):
    def test_web_demo_is_localhost_development_only(self):
        body = WEB.read_text(encoding="utf-8")
        self.assertIn("__DEV__", body)
        self.assertIn('window.location.hostname === "localhost"', body)
        self.assertIn('window.location.hostname === "127.0.0.1"', body)
        self.assertIn("SIMULATED ADMIN WORKFLOW", body)
        self.assertIn("No Resident account was changed", body)

    def test_simulation_does_not_call_live_admin_or_firebase(self):
        text = WEB.read_text(encoding="utf-8")
        for forbidden in (
            "fetch(", "axios.", "setDoc(", "updateDoc(", "uploadBytes(",
            "getIdToken(", "signInWithEmailAndPassword(", "firebase/auth",
            "firebase/firestore", "volunserve.onrender.com",
            "admin/identity/reviews/:uid/decision",
            "localStorage.", "sessionStorage.", "navigator.sendBeacon",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, text)

    def test_approval_requires_independent_checks_and_two_step_confirmation(self):
        body = WEB.read_text(encoding="utf-8")
        self.assertIn('const NATIONAL_METHOD = "psa_national_id_qr_check"', body)
        self.assertIn("inspected && personChecked &&", body)
        self.assertIn("attested && notes.trim().length >= 25", body)
        self.assertIn("const confirm = () =>", body)
        self.assertIn('notes.trim().length < 5', body)
        self.assertIn('setConfirmation(action)', body)
        self.assertIn('setDecision(next)', body)
        self.assertIn('adminReviewStatusBucket({', body)
        self.assertIn("Local OCR data is NOT", body)

    def test_existing_real_admin_gate_and_auth_remain_unchanged(self):
        auth = ROOT_LAYOUT.read_text(encoding="utf-8")
        admin = ADMIN_ROUTE.read_text(encoding="utf-8")
        backend = ADMIN_BACKEND.read_text(encoding="utf-8")
        self.assertIn('router.replace("/login")', auth)
        self.assertNotIn("local-admin-review-demo", auth)
        self.assertIn("requireOperationalAdmin", backend)
        self.assertIn('"/api/admin/identity/reviews/:uid/decision"', backend)
        self.assertIn("identityVerified: true", backend)
        self.assertIn('identityVerified: false', backend)
        self.assertIn('reviewBucket(selected) !== "pending"', admin)

    def test_mobile_page_is_inert(self):
        body = NATIVE.read_text(encoding="utf-8")
        self.assertNotIn("fetch(", body)
        self.assertNotIn("Verify (Demo)", body)
        self.assertNotIn("setDecision", body)

if __name__ == "__main__":
    unittest.main()
