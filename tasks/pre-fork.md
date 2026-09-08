# Ripples pre-fork completion

Requested 2026-09-07. Governing documents: `SPEC-ripples-product.md`,
`SPEC-native-foundation.md`, `CAPABILITY-MAP.md`, and `checkpoints.md`.

## Execution checklist

- [x] 3.6: restore focused contract/sync test commands without weakening coverage.
- [x] 3.5: close the independent GPT-5.6 Sol reminder review and remediate findings.
- [x] 3.7: document approved import, Timeline, and release-link placement.
- [x] 3.4: add the deterministic August fixture with an explicit development-only,
      empty-database seed action, validation, idempotency, and release guards.
- [ ] 3.1: finish signed CloudKit offline, retry, delete, and conflict convergence.
      The native transport and basic signed-device delivery are implemented and verified.
- [ ] 3.2: finish actual Shortcuts and Siri acceptance of the three native intents.
      The shared-fixture executor and discovery fix are implemented; execution is under test.
- [x] 3.3: implement alternate icons, install approved artwork, and verify native persistence.
- [ ] 3.8: complete remaining device acceptance, remove synthetic acceptance data,
      record final closure, push clean main, and tag `ripples-v1-fork-point`.

## Approved decisions

- Team `3V2UU7RRK9` was discovered locally and verified against existing signing
  material. EAS reused the existing certificate and Apple login. The connected
  iPhone 16 Pro and iPad Air 4 are registered in both app and widget profiles.
- App: `studio.orbitlabs.habittracker`.
  App group: `group.studio.orbitlabs.habittracker`.
  Container: `iCloud.studio.orbitlabs.habittracker`.
  Widget: `studio.orbitlabs.habittracker.ExpoWidgetsTarget`.
  Minimum iOS remains 18.6.
- Direct CloudKit operations, zone `habit-tracker`, and a Swift intent executor.
  Conditional saves preserve the greater mutation stamp; unconditional all-keys
  saves were rejected because a stale upload could overwrite newer server data.
- One local native module, `modules/ripples-apple`. No second product store,
  intent inventory changes, widget in-place writes, or fork-only features.
- Default, Midnight, and Paper use the approved cartoon, glossy plastic droplet
  artwork. The widget action deep-links to Add Check-In.
- Import, retained Timeline route, and the release-links location are approved.
  The obsolete out-of-scope import bullet was also removed during the closure audit.
- Readable demo labels are approved. Seven boards and 75 deterministic August
  check-ins are inserted only by the explicit guarded development action.
- Feedback, review, more-products, privacy, and terms destinations are the only
  approved deferral. Existing unavailable-link messages remain.
- Both initially booted simulators are authorized for parallel acceptance. An
  installed iOS 26.5 simulator also provides a working Shortcuts catalog after
  the iOS 27 catalog proved empty even for Apple's built-in actions.

## Verified implementation and evidence

- CloudKit includes sanitized errors, bounded upload batches, account-scoped change
  tokens, same-database account binding, and an app-lifetime sync coordinator.
- Physical testing exposed concurrent use of Expo SQLite and system SQLite against
  the same WAL database. Both native consumers now use ExpoSQLite. Independent
  GPT-5.6 Sol review and compiled-object checks passed: 28 Expo SQLite references,
  zero system SQLite references in those consumers.
- Corrected-build iPad stress acceptance passed 24 check-in commands, 12 concurrent
  native account checks, six reads, and six receipt replays. Counts, idempotency,
  widget projection, existing records, and database integrity passed. Uploads drained.
- The iPad received the phone's existing board. Further synthetic edit, check-in,
  archive, and restore commands uploaded through the normal coordinator with
  zero pending changes and intact integrity. Offline/conflict convergence is still open.
- Swift CloudKit and intent tests pass: 48 tests, including the shared JSON contract.
  Exactly three discoverable intent definitions and matching shortcuts are in the
  compiled app metadata. Removing an inappropriate app-level package dependency
  for the statically linked module restored all three actions in the real iOS 26.5
  Shortcuts catalog. A composed Today's Check-Ins action runs successfully;
  automatic tiles reported an Apple shortcut error and remain under investigation.
  Discovery alone does not close the intent checkpoint.
- Signed simulator icon acceptance passed for all three SpringBoard artworks and
  selection after relaunch. The saved flow replay passed 61 steps with zero failures.
  Default was restored. Settings status values expose native static-text traits;
  the scoped Settings navigation runtime log had no errors.
- The widget opened the correct Add Check-In screen. Cancel preserved the count;
  Save updated the widget projection. Final physical widget acceptance remains open.
- Complete JS validation passed 570 tests in 45 suites, lint/typecheck, global
  coverage 97.5/95.5/95.58/97.6, and unchanged 100 percent core gates. Expo Doctor
  passed 21/21. The latest native-registration plugin suite passes eight focused tests.
- Private evidence: `.artifacts/pre-fork/sync-acceptance/`,
  `.artifacts/pre-fork/icons-accessibility-acceptance/`, and
  `.artifacts/pre-fork/intents-widget-acceptance/`, and
  `.artifacts/pre-fork/ios265-shortcuts/`. Detailed history is in
  `checkpoints.md`; remaining steps are in `tasks/pre-fork-device-acceptance.md`.

## Signed build and current limits

Replacement Development build `cd2e117b-d048-4367-87f0-4c1931c2c486` is installed
on both physical devices. It includes the shared-SQLite correction above base
`f02c8e9`, now committed as `734f9e7`. Independent verification passed signatures,
approved identities, Development environment, both-device provisioning, icons,
and intent metadata. IPA SHA-256:
`f6652598fb0e3ae1ad51355f2f0b38f53c4d001702561d66dfa7d31fb55a4138`.

Do not use the original mixed-SQLite build or re-sign job
`3835b2da-dac0-4809-a1d9-2f4dc32908a9`, which switched CloudKit to Production.
The native registration correction will require a new native build for physical
Shortcuts/Siri acceptance.

The iPad auto-locked during offline-test preparation; its Wi-Fi was never changed.
The iPhone had a personal call in the foreground, so its UI work paused. Neither
device was reset. Pro Max's actual CloudKit attempt reported Signed Out, so it
cannot replace the second signed-in target without user account setup; sync was
restored off and no account settings changed.

The governing spec still requires a signed physical iPhone checkpoint for iCloud,
widgets, Shortcuts, and both Check In and Get Today's Check-Ins through Siri.
Simulator preference does not waive that requirement. Synthetic acceptance records
will be deleted through normal commands after convergence checks finish.

## Commits and fork gate

Relevant pushed commits include `993eeb0` (focused suites), `67a45f8` (SDK patches),
`8d85a43` (reviewed reminder fixes), `51cf494`/`9339720` (private-file hygiene),
`9a93a02` (guarded fixture), `eb2189f` (Apple capabilities), `734f9e7` (SQLite
integration), `a5db12b` (Settings accessibility), and `1f7fb51` (scope/Siri alignment).

The independent audit confirmed no tracked private screenshots, artifacts,
credentials, exports, or generated native directories, and effective ignore rules.
Keep the user's Metro 8081 running. Finish the remaining acceptance, final gates,
review, and closure record before creating or pushing `ripples-v1-fork-point`.
No fork or fork-point tag has been created.
