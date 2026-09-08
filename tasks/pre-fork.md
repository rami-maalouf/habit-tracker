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
      Signed delivery, an iPad offline write, and an edit/edit conflict have passed.
- [x] 3.2: accept Shortcuts and Siri coverage of the three native intents.
      All three Shortcuts actions passed on the iPad; both required Siri actions
      passed on the iPhone. Rami accepted this evidence in place of repeating
      Shortcuts on the iPhone; a separate iPhone Shortcuts pass is not claimed.
- [x] 3.3: implement alternate icons, install approved artwork, and verify native persistence.
- [ ] 3.8: complete remaining device acceptance, remove synthetic acceptance data,
      record final closure, push clean main, and tag `ripples-v1-fork-point`.

## Approved decisions

- After the signed-device results, Rami accepted the iPad Shortcuts evidence
  together with the iPhone Siri passes and said, "we're good, we're done."
  Testing is stopped. The remaining widget, offline/deletion, and cleanup work
  was not completed; those items and fork closure are not marked passed.
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
  zero pending changes and intact integrity. A real Wi-Fi-off iPad check-in queued
  locally and converged after reconnecting. A newer online phone edit also survived
  a conflicting offline iPad edit; the iPad converged to the greater phone stamp,
  with 29 check-ins, no pending changes, and passing integrity. Full two-target
  offline and edit/delete trials remain open.
- Swift CloudKit and intent tests pass: 50 tests, including the shared JSON contract.
  Exactly three discoverable intent definitions and matching shortcuts are in the
  compiled app metadata. Removing an inappropriate app-level package dependency
  for the statically linked module restored all three actions in the real iOS 26.5
  Shortcuts catalog. A composed Today's Check-Ins action runs successfully;
  automatic tiles and composed Check In reported a simulator shortcut error.
  Verified entity-lookup and sanitized-error API contract fixes landed in source.
  On the current signed iPad, all three automatic actions subsequently executed:
  Today returned counts, Check In reported the correct logical date, and Remove
  passed both cancellation and confirmation. The signed iPhone also ran both
  required Siri actions. Its Check In created one row, one receipt, and the
  matching widget projection; the confirmed iPad removal restored the count to 29.
- Real hosted iOS wrapper and framework-resolution diagnostics passed, including
  selected Board, one check-in on first invocation, and replay without duplication.
  A validated boundary trace places the actual Remove Latest failure before
  identifier lookup and execution. A required-Board read-only Today control fails
  after Board selection with the same generic error. Diagnostic changes are restored;
  the product contract remains unchanged. Apple's unchanged iOS sample reproduced
  the automatic-shortcut error on the same simulator. Its composed entity action
  was not run, so that separate Ripples failure remains unexplained. Further
  exploratory simulator testing stopped at the user's request to hurry. A bounded
  simulator Siri invocation produced no observed result.
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

The current signed acceptance candidate is Development build
`38d0eac8-e9e1-408d-ac10-80522f35632c`, from clean source `589cc4f`.
Independent verification passed archive integrity, deep signatures, exact approved
identities and two-device provisioning, Development environment, icons, minimum
iOS 18.6, and exact intent metadata with Today Board optional. IPA SHA-256:
`8797b076d9ab3fa7c98438032fa25ad0a4ca3378fefbab530dbe4230ddadf38c`.
It is installed and launched on both registered physical devices. Both use the
same Development CloudKit environment and have demonstrated matching synthetic
records with drained queues and passing database integrity.

Do not use the original mixed-SQLite build or re-sign job
`3835b2da-dac0-4809-a1d9-2f4dc32908a9`, which switched CloudKit to Production.
The current candidate contains the native registration and API-contract corrections.

The user unlocked both devices and testing resumed. The iPad's real Wi-Fi-off
trials restored connectivity and foreground state. The phone's latest Xcode
transport is wireless; a direct USB connection was requested before its full
radio-off trial so the local restoration test retains its control connection.
Neither device was reset. Pro Max's actual CloudKit attempt reported Signed Out, so it
cannot replace the second signed-in target without user account setup; sync was
restored off and no account settings changed.

The governing spec still requires a signed physical iPhone checkpoint for iCloud,
widgets, Shortcuts, and both Check In and Get Today's Check-Ins through Siri.
Both required iPhone Siri actions now have independently reviewed physical evidence.
Simulator preference does not waive that requirement. Synthetic acceptance records
will be deleted through normal commands after convergence checks finish.
The iPhone locked again before the widget-gallery run; that test never executed
and added no widget. Resume with the phone directly connected by USB and unlocked.
Prepared phone Shortcuts, widget, and radio-off runners are retained in ignored
artifacts. Check the synthetic board's current logical date before resuming.

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
