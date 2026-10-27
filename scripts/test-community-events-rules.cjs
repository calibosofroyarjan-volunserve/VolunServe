/**
 * Run locally against Firestore Emulator only:
 *
 *   npx firebase-tools emulators:exec --only firestore --project demo-volunserve "node scripts/test-community-events-rules.cjs"
 *
 * Uses synthetic profiles and data. Never contacts production Firestore.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: Firestore Emulator is not running. Use the command in the file header.");
  process.exit(1);
}

const projectId = "demo-volunserve";
const residentUid = "resident-test-uid";
const volunteerUid = "volunteer-test-uid";
const adminUid = "admin-test-uid";
const superAdminUid = "superadmin-test-uid";
const otherUid = "other-test-uid";
const eventId = "proposed-community-event-test";
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name, fn, denied = false) {
  try {
    if (denied) {
      await assertFails(fn());
    } else {
      await assertSucceeds(fn());
    }
    passed++;
    console.log("PASS " + name);
    return true;
  } catch (error) {
    failed++;
    console.error("FAIL " + name + ": " + (error?.message || error));
    return false;
  }
}

function skip(name) {
  skipped++;
  console.log("SKIP " + name + " (dependency failed)");
}

function residentProfile(uid) {
  return {
    uid, role: "resident", status: "approved",
    residentAccess: true, activeMode: "resident",
    volunteerAccess: false, volunteerStatus: "not_applied",
    fullName: "Example Resident",
  };
}

function volunteerProfile(uid) {
  return {
    ...residentProfile(uid),
    activeMode: "volunteer", volunteerAccess: true,
    volunteerStatus: "approved", fullName: "Example Volunteer",
  };
}

function proposalPayload() {
  // Mirrors app/(tabs)/community-events.tsx submitProposal.
  return {
    title: "Community Cleanup Drive",
    description: "Collect litter and improve community public spaces together.",
    volunteerTasks: "Clean pathways and segregate recyclables.",
    lookingFor: "General Volunteer",
    requiredRoles: ["General Volunteer"],
    requiredSkills: ["Teamwork"],
    qualificationNotes: "",
    whatToBring: "Gloves and reusable drinking water",
    photoUrls: [],
    videoUrl: "",
    category: "Clean-up Drive",
    barangay: "Bagong Buhay III",
    location: "Public Plaza",
    date: "2026-11-15",
    time: "08:00",
    capacity: 20,
    proposedBy: residentUid,
    proposerName: "Example Resident",
    status: "pending",
    adminNote: "",
    createdAt: stamp(),
    updatedAt: stamp(),
  };
}

async function main() {
  const rulesPath = path.resolve(__dirname, "..", "firestore.rules");
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync(rulesPath, "utf8")},
  });
  try {
    await env.clearFirestore();

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc("users/" + residentUid).set(residentProfile(residentUid));
      await db.doc("users/" + volunteerUid).set(volunteerProfile(volunteerUid));
      await db.doc("users/" + adminUid).set({
        uid: adminUid, role: "admin", status: "approved",
        activeMode: "resident", fullName: "Example Admin",
      });
      await db.doc("users/" + otherUid).set(residentProfile(otherUid));
      await db.doc("users/" + superAdminUid).set({uid:superAdminUid,role:"superadmin",status:"approved",fullName:"System Programmer"});
    });

    const resident = env.authenticatedContext(residentUid).firestore();
    const volunteer = env.authenticatedContext(volunteerUid).firestore();
    const admin = env.authenticatedContext(adminUid).firestore();
    const superAdmin = env.authenticatedContext(superAdminUid).firestore();
    const other = env.authenticatedContext(otherUid).firestore();
    const anonymous = env.unauthenticatedContext().firestore();

    const proposalRef = resident.doc("communityEventProposals/" + eventId);
    const publishedRef = admin.doc("communityEvents/" + eventId);
    const partRef = volunteer.doc("communityEventParticipants/" + eventId + "_" + volunteerUid);

    await check("Unauthenticated users cannot create proposals", () =>
      anonymous.doc("communityEventProposals/anonymous-proposal").set(proposalPayload()), true);
    await check("A resident cannot impersonate another proposer", () =>
      other.doc("communityEventProposals/forged-proposal").set(proposalPayload()), true);
    await check("Invalid proposal title is rejected", () =>
      resident.doc("communityEventProposals/bad-title").set({
        ...proposalPayload(), title: "No",
      }), true);

    const submitted = await check("VERIFIED RESIDENT SUBMITS VALID PROPOSAL", () =>
      proposalRef.set(proposalPayload()));

    if (submitted) {
      await check("Resident can read own proposal", () => proposalRef.get());
      await check("Different resident cannot read private proposal", () =>
        other.doc("communityEventProposals/" + eventId).get(), true);

      const published = await check("ADMIN APPROVES AND PUBLISHES ATOMICALLY", () =>
        admin.runTransaction(async (tx) => {
          const p = admin.doc("communityEventProposals/" + eventId);
          const e = admin.doc("communityEvents/" + eventId);
          const pSnap = await tx.get(p);
          const eSnap = await tx.get(e);
          if (!pSnap.exists || eSnap.exists) {
            throw new Error("Invalid seeded transaction state");
          }
          const data = pSnap.data();
          tx.set(e, {
            title: data.title,
            description: data.description,
            volunteerTasks: data.volunteerTasks,
            lookingFor: data.lookingFor,
            requiredRoles: data.requiredRoles,
            requiredSkills: data.requiredSkills,
            qualificationNotes: data.qualificationNotes,
            whatToBring: data.whatToBring,
            photoUrls: data.photoUrls,
            videoUrl: data.videoUrl,
            coverImageUrl: data.coverPhotoUrl || "",
            category: data.category,
            barangay: data.barangay,
            location: data.location,
            date: data.date,
            time: data.time,
            capacity: data.capacity,
            participantsCount: 0,
            status: "upcoming",
            publicationStatus: "published",
            sourceProposalId: eventId,
            proposedBy: data.proposedBy,
            proposerName: data.proposerName,
            approvedBy: adminUid,
            approvedAt: stamp(),
            createdAt: stamp(),
            updatedAt: stamp(),
          });
          tx.update(p, {
            status: "approved",
            adminNote: "Approved and published as an official Community Event.",
            publishedEventId: eventId,
            reviewedBy: adminUid,
            reviewedAt: stamp(),
            updatedAt: stamp(),
          });
        }));

      if (published) {
        await check("Programmer Super Admin cannot start operational Community Events", () =>
          superAdmin.doc("communityEvents/" + eventId).update({ status: "active", updatedAt: stamp() }), true);
        await check("Verified volunteer reads published event", () =>
          volunteer.doc("communityEvents/" + eventId).get());

        const joined = await check("VOLUNTEER JOINS AND UPDATES CAPACITY", () =>
          volunteer.runTransaction(async (tx) => {
            const e = volunteer.doc("communityEvents/" + eventId);
            const p = partRef;
            const event = await tx.get(e);
            const previous = await tx.get(p);
            if (previous.exists) throw new Error("Already joined");
            tx.set(p, {
              eventId,
              uid: volunteerUid,
              fullName: "Example Volunteer",
              status: "joined",
              joinedAt: stamp(),
              declinedAt: null,
              checkedInAt: null,
              checkedOutAt: null,
              attendanceVerified: false,
              attendanceVerifiedAt: null,
              updatedAt: stamp(),
            });
            tx.update(e, {
              participantsCount: Number(event.data().participantsCount) + 1,
              updatedAt: stamp(),
            });
          }));

        await check("Proposer is blocked from joining own event", () =>
          resident.doc("communityEventParticipants/" + eventId + "_" + residentUid)
            .set({
              eventId, uid: residentUid, status: "joined",
              fullName: "Example Resident", joinedAt: stamp(),
              declinedAt: null, checkedInAt: null,
              checkedOutAt: null, attendanceVerified: false,
              attendanceVerifiedAt: null, updatedAt: stamp(),
            }), true);

        if (joined) {
          const started = await check("ADMIN STARTS EVENT", () =>
            publishedRef.update({status: "active", updatedAt: stamp()}));
          if (started) {
            const inOK = await check("VOLUNTEER SELF TIME-IN", () =>
              partRef.update({checkedInAt: stamp(), updatedAt: stamp()}));
            if (inOK) {
              await check("Volunteer cannot self-verify attendance", () =>
                partRef.update({
                  attendanceVerified: true,
                  attendanceVerifiedAt: stamp(),
                  attendanceVerifiedBy: volunteerUid,
                  updatedAt: stamp(),
                }), true);
              const outOK = await check("VOLUNTEER SELF TIME-OUT", () =>
                partRef.update({checkedOutAt: stamp(), updatedAt: stamp()}));
              if (outOK) {
                await check("ADMIN VERIFIES ATTENDANCE", () =>
                  admin.doc("communityEventParticipants/" + eventId + "_" + volunteerUid)
                    .update({
                      attendanceVerified: true,
                      attendanceVerifiedAt: stamp(),
                      attendanceVerifiedBy: adminUid,
                      updatedAt: stamp(),
                    }));
                await check("ADMIN MARKS EVENT COMPLETED", () =>
                  publishedRef.update({
                    status: "completed", completedAt: stamp(),
                    completedBy: adminUid, updatedAt: stamp(),
                  }));
              } else skip("Admin verification and event completion");
            } else skip("Volunteer Time Out + Admin verification");
          } else skip("Volunteer Time In/Out + verification");
        } else skip("Volunteer attendance and event completion");
      } else skip("Admin publish and Volunteer workflow");
    } else skip("Resident read, Admin publish and Volunteer workflow");

    console.log("\nCommunity Events rule tests: " + passed +
      " passed, " + failed + " failed, " + skipped + " skipped.");
    if (failed) {
      console.error("Rules coverage: http://127.0.0.1:8080/emulator/v1/projects/" +
        projectId + ":ruleCoverage.html");
      process.exitCode = 1;
    }
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error("Rules test infrastructure failure:", error?.message || error);
  process.exitCode = 1;
});
