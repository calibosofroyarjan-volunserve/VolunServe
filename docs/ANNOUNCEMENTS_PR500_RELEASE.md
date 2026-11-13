# Scoped PR #500 production release

This controller is a separate protected release-policy change. It does not merge
the application backlog on `live-protected` into the deployed website. The
operator's authorization is to restore Announcements using PR #500, preserve
other modules and existing records, verify authorized roles, and roll back on
regression.

The site checkout is pinned to `5b7f769d3db8a906309f962930306a4c863a026c`, whose
base is the verified live revision
`2cd63d318ecb6b0dfc52706308e05d0b5806d874`. Only four announcement frontend
files and the announcement rules block affect production. The three added CI,
test, and surgical-rule script files are not part of Hosting `dist`.

The active production Rules source was independently read on 2026-11-14 Manila
time. Its SHA-256 is
`c0357e65000588269c92ef98e67d422eb19f1d3d889aab4f3a2d650924649296` and its
rollback ruleset is
`projects/volunserve-3aa5b/rulesets/03825bc1-ed46-4c94-84fc-bc0c3aab5de0`.
The controller rechecks this source and the live marker, fails closed on drift,
and retains all unrelated active Rules bytes.

## Protected process

Merge this controller through the existing protected PR process. It changes no
application files, existing workflows, branch restrictions, IAM grants, or
environment branch policies. It shares the existing production Hosting
concurrency group. It can publish only on manual dispatch from `live-protected`
through the existing `production` environment; it refuses stale controllers.

First run `release-announcements-pr500.yml` with `mode=inspect`. This validates
the pinned source, TypeScript, emulator access tests, the environment credential,
publisher IAM, active Hosting/Rules references, and Firebase's production Rules
compiler. An empty compiler test suite performs no production data operations.
Inspect never creates a version, ruleset, release, user, or announcement.

The pre-existing signup reconciliation workflow also reports unrelated Identity
blocking hooks and Storage release conditions. Those modules are outside this
release and its old checks are preserved. The inherited Profile/Certificates
sidebar test failure on the exact-live snapshot is also outside this change.

## Authorized role verification

Before `mode=release`, provide three authorized test-account Firebase ID tokens
in the `production` environment secret
`VOLUNSERVE_ANNOUNCEMENTS_QA_SESSIONS`. Do not paste tokens into a PR, issue, chat,
log, repository file, or repository-level secret. The JSON shape is:

```json
{"admin":{"idToken":"<authorized session>"},"resident":{"idToken":"<authorized session>"},"volunteer":{"idToken":"<authorized session>"}}
```

Use distinct, verified, approved test accounts. Each token needs at least ten
minutes remaining validity when the protected preflight starts. The controller
checks profiles through the corresponding user tokens before publishing and
does not impersonate existing users or create accounts.

After publishing, the role check creates one uniquely named temporary QA
announcement as the authorized Admin. Both Resident and Volunteer must read it
and all historical community-wide announcements. The Admin then removes only
that temporary record with an update-time precondition; hashes verify existing
announcements remain unchanged. These are real production Firestore requests
under user Security Rules, not service-account permission bypass. Browser UI
interaction is not exercised by this API check; a browser walkthrough can be
performed in addition.

## Release and rollback

`mode=release` builds only the pinned site, stages its Hosting preview with a
one-day expiry, verifies its fingerprint, and stages the announcement-only
ruleset. It rechecks both live resource references immediately before writing.
It selects the new ruleset, publishes that exact staged Hosting version, checks
the live marker and public routes, then runs the authorized three-role check.

On regression or a lost response after a write, it restores the previous Hosting
version first and then the previous ruleset. Recovery refuses to overwrite an
independent concurrent release and records the need for operator recovery.
Unit tests exercise successful publish, failed feed verification, a lost Rules
response, and concurrent-release preservation.

Credential-free release state and both resource references are retained in the
workflow artifact `announcements-pr500-release-<run-id>`. No backend, Functions,
indexes, Storage rules, unrelated Firestore scopes, or existing records are
modified. No safeguard is disabled and no alternate credential source is used.

API contracts: [Hosting releases](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases/create),
[Rules compilation](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test),
[user-token Firestore requests](https://firebase.google.com/docs/firestore/use-rest-api).
