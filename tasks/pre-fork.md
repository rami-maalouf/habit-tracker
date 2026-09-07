# Ripples pre-fork completion

Requested 2026-09-07. Governing documents: `SPEC-ripples-product.md`,
`SPEC-native-foundation.md`, `CAPABILITY-MAP.md`, and `checkpoints.md`.

## Execution checklist

- [x] 3.6: restore focused contract/sync test commands without weakening coverage.
- [x] 3.5: close the independent GPT-5.6 Sol reminder review and remediate findings.
- [x] 3.7: document approved import, Timeline, and release-link placement.
- [x] 3.4: add the deterministic August 2026 fixture and an explicit development-only,
      empty-database seed action, with validation, idempotency, and release guards.
- [ ] 3.1: implement CloudKit in the single local native module; prove signed convergence.
- [ ] 3.2: implement exactly three Swift App Intents using the shared fixture contract.
- [x] 3.3: implement alternate icons, install approved artwork, and verify simulator persistence.
- [ ] 3.8: validate, review, remove tracked private artifacts, push clean main, record closure,
      and tag `ripples-v1-fork-point` only after remaining work is complete or explicitly deferred.

## Approved decisions and remaining device inputs

- Team `3V2UU7RRK9` was discovered from the local signing certificate and verified
  against existing provisioning profiles. EAS restored the existing Apple login
  through the Keychain and created the authorized identifiers, group, CloudKit
  container, and two ad hoc profiles. The initial Xcode sign-in obstacle is resolved
  for EAS builds. No new credentials are needed from the user.
- Approved namespace: `studio.orbitlabs.habittracker`, app group
  `group.studio.orbitlabs.habittracker`, container `iCloud.studio.orbitlabs.habittracker`,
  widget extension `studio.orbitlabs.habittracker.ExpoWidgetsTarget`.
- The iPhone 16 Pro and iPad Air 4 are connected and registered for the app and
  widget signing profiles. The user enabled iCloud Sync on the iPhone. Physical
  acceptance is in progress; account/environment convergence is not yet proven.
- Zone name approved by the user: `habit-tracker`.
- Direct CloudKit operations and the Swift intent executor are approved and implemented.
- Approved CloudKit correction: conditional saves must preserve the greater
  mutation stamp. The existing fake rejects stale uploads, but `.allKeys` overwrites the server
  before the engine fetches changes. Fetch the current record, compare stamps, then use
  `ifServerRecordUnchanged` so a concurrent write cannot invalidate that comparison.
- Product spec corrections are approved: import, retained Timeline route, release-links path.
- Concurrent UI changes and their user authorization are recorded by the other
  session in `SPEC-ripples-product.md` and `tasks/ui-polish-checkpoint.md` (`2481feb`).
- The user delegated the artwork choices in a cartoon, glossy plastic direction.
  Default, Midnight, and Paper now share the same droplet character, with real previews
  and compiled alternate-icon asset sets. Simulator switching and relaunch persistence passed.
- Readable demo labels were approved for incomplete reference titles. The fixture has
  seven boards and 75 deterministic August check-ins; it never alters the clock or auto-seeds.
- Feedback, review, more-products, privacy, and terms destinations are explicitly deferred.
  Existing unavailable-link messages remain; no URLs or legal text were invented.

## Review findings to close

The independent GPT-5.6 Sol P5 review requested changes on 2026-09-07:

1. Repair native reminder requests missing despite retained SQLite schedule rows.
2. Translate permission failures into retryable domain results and recover the editor.
3. Validate all new-board reminder drafts and commit the board and reminders atomically.
4. Replace schedules when board title, time, message, or other request metadata changes.
5. Subscribe to significant-time changes through the native module.

All five were implemented and independently approved by GPT-5.6 Sol. Full isolated
validation passed: 484 tests, 35 suites, core coverage 100 percent on all metrics,
lint/typecheck clean. Simulator acceptance covered invalid/corrected reminder drafts;
the native module and one registered listener were observed. Actual OS significant-time
delivery remains a manual device check. See `checkpoints.md` for evidence and limits.

The three tracked private screenshots have been removed from Git and kept locally;
ignore rules now cover private evidence and export bundles. This does not close 3.8.

The widget quick action remains a deep link to Add Check-In. No in-place widget write,
fork-only product features, or additional native module beyond RipplesApple is part of this work.

## Validation discovered during preflight

- Both focused scripts initially exited 1 with no tests found.
- Full baseline: 440 tests; the notification-tap test emitted an unwrapped React update.
- Expo Doctor initially reported eleven outdated SDK 57 patches. Expo Install aligned them;
  a forced frozen-lockfile install removed duplicate native package copies, restoring 21/21.
- The patched native dependencies require a regenerated development client. Generated `ios/`
  is rebuilt through Expo prebuild and remains untracked.
- Existing Metro on 8081 belongs to the user. Early validation used a separate 8082
  server; the final native app connected to the same workspace on 8081. The user's
  process remains under their control. No other simulator was changed.
- Rebuilt the client including `RipplesApple`; native build passed and final Doctor is 21/21.
- Concurrent board/analytics/navigation/icon-picker work appeared during validation. Its
  edits were preserved, including shared-file hunks; the pre-fork changes were validated
  in `/tmp/ripples-prefork-validation.baZh6k` without those unrelated changes. The combined
  code was subsequently committed by the other session. Combined `bun run validate`
  passed 490 tests across 36 suites; full logs are in `.artifacts/pre-fork/`.

## Current commits

- `993eeb0`: focused contract/sync suites and unchanged HLC assertions.
- `67a45f8`: SDK 57 patch alignment.
- `8d85a43`: reviewed reminder fixes and native time-change module.
- `51cf494`, `9339720`: private evidence/export ignore rules and screenshot untracking.
- `9a93a02`: explicit development-only August fixture, guarded insert, and seed evidence.

CloudKit, App Intents, alternate-icon registration, reference seeding, and spec corrections
are implemented. Native review additionally required same-database iCloud account binding,
validated incoming records, and an app-lifetime sync coordinator. Combined validation
passes: 569 Jest tests, all core metrics at 100 percent, 48 Swift tests, 3 plugin tests,
Expo Doctor 21/21, and iOS/Android exports. Native simulator acceptance is recorded.
The icon replay passes; the full data replay remains unproven due to an Argent native
consent selector limitation, although its recorded manual walkthrough passed.

The development/internal profiles explicitly use CloudKit Development; the production
profile uses Production. Signed EAS build `6d550951-0fe7-4e16-9aee-9e68024b9ec5`
finished successfully from `eb2189f`. The downloaded IPA passed deep strict signature
verification; actual entitlements confirm Development, the approved team/group/container,
both alternate icons, and the registered iPhone. Exactly three public intents are present.
Two signed targets must still prove CloudKit convergence, and the physical iPhone must
run the three Shortcuts, Siri, widget refresh, and icon relaunch acceptance. These are
pending, not deferred to the fork. No fork or fork-point tag has been made.

Physical testing exposed concurrent access to the same WAL database through Expo's
vendored SQLite and Apple's system SQLite. A phone crash occurred in Expo's WAL-index
write while the account-binding check was inside system SQLite. Both native consumers
now use ExpoSQLite; independent review, compiled-symbol verification, and all source
gates pass. A synthetic host reproduction did not crash, so the exact fault remains
subject to verification on the corrected physical build.

EAS re-sign job `3835b2da-dac0-4809-a1d9-2f4dc32908a9` added the iPad to both
profiles but changed the app's CloudKit entitlement to Production. That artifact is
rejected for acceptance. A new full Development build must pass signature, environment,
and both-device provisioning checks before installation.

Replacement full build `cd2e117b-d048-4367-87f0-4c1931c2c486` passed those checks
independently and installed on both devices. Both app launches were then blocked by
iOS because the screens were locked. Unlocking has been requested. No corrected-build
physical acceptance or fork readiness is claimed yet; the source correction is still
uncommitted pending its physical checkpoint.

The user's temporary stop instruction was clarified: "I meant download it on my
iPad." iPad installation/use is authorized again. The verified build is already
installed; two-device acceptance can resume without reinstalling or resetting data.

Corrected-build iPad acceptance now passes the concurrent database check: 24
check-ins, 12 native account checks, six reads and six receipt replays; existing
records and database integrity are intact. The normal coordinator drained the
upload queue to zero, and the iPad received the phone's existing board. The full
two-target offline/conflict matrix remains open. Both booted simulators are now
authorized for parallel Shortcuts/widget and icon/accessibility acceptance.
