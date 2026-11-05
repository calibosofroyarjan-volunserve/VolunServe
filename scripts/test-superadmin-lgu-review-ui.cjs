"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const a=fs.readFileSync("app/admin-request.tsx","utf8");
const s=fs.readFileSync("app/(superadmin)/admin-accounts.tsx","utf8");
const r=fs.readFileSync("firestore.rules","utf8");
assert(a.includes('required:{color:"#DC2626"')&&a.includes('<Text style={styles.required}>*</Text>'),"All LGU mandatory form labels must use red asterisks");
assert(a.includes('Assigned barangay (San Jose del Monte) <Text style={styles.required}>*</Text>'),"Barangay must also be marked required");
assert(a.includes('key==="appointmentReference"?"no":"auto"'),"Appointment reference must not autofill user passwords");
for(const marker of [
 'Pending LGU Admin Applications',
 'View Credentials',
 'Review & Approve',
 'Reject',
 'action === "reject"',
 'actionType === "reject"',
 'rejectedReason: rejectReason.trim()',
 'reviewedAt: serverTimestamp()',
 'reviewedBy: verified.current.uid',
 'lgu_admin_application_rejected',
 'status: "rejected"',
 'rejectedReason.size() >= 10'
]) {
 assert((s+r).includes(marker),"LGU review or security requirement absent: "+marker);
}
assert(s.includes("credentialsConfirmed && identityMatched && lguEmploymentConfirmed"),"Approval requires independent manual review");
assert(s.includes("hasFreshLguCredentialReview")||r.includes("hasFreshLguCredentialReview"),"Approval must require fresh server-side review");
assert(s.includes('batch.set(doc(collection(db, "adminLogs"))'),"Admin decision must write audit record");
assert(r.includes("hasFreshLguCredentialReview()"),"Staff approval requires a same-batch verified review; emulator tests verify LGU Admin is denied");
assert(r.includes("&& request.resource.data.role == 'applicant'")&&r.includes("&& request.resource.data.status == 'rejected'"),"Rejection must never grant Admin permissions");
assert(!a.includes('getDownloadURL('),"No public LGU credentials allowed");
console.log("PASS: red asterisks, clean pending applications, reviewed approval, reasoned rejection and strict permissions.");
