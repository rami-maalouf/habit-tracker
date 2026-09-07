# Ripples pre-fork completion

Requested 2026-09-07. Governing documents: `SPEC-ripples-product.md`,
`SPEC-native-foundation.md`, `CAPABILITY-MAP.md`, and `checkpoints.md`.

## Execution checklist

- [x] 3.6: restore focused contract/sync test commands without weakening coverage.
- [x] 3.5: close the independent GPT-5.6 Sol reminder review and remediate findings.
- [ ] 3.7: document existing import, Timeline, and release-link placement after approval.
- [ ] 3.4: add the deterministic August 2026 fixture and an explicit development-only,
      empty-database seed action, with validation, idempotency, and release guards.
- [ ] 3.1: implement CloudKit in the single local native module; prove signed convergence.
- [ ] 3.2: implement exactly three Swift App Intents using the shared fixture contract.
- [ ] 3.3: implement alternate icons, install approved artwork, and verify persistence.
- [ ] 3.8: validate, review, remove tracked private artifacts, push clean main, record closure,
      and tag `ripples-v1-fork-point` only after remaining work is complete or explicitly deferred.

## Decisions and release inputs

- Apple developer membership exists (user confirmed); exact signing team and container
  provisioning, physical iPhone, and second signed target remain to be supplied.
- Zone name approved by the user: `habit-tracker`.
- Direct CloudKit operations and the Swift intent executor are recommended, awaiting approval.
- CloudKit draft correction awaiting approval: conditional saves must preserve the greater
  mutation stamp. The existing fake rejects stale uploads, but `.allKeys` overwrites the server
  before the engine fetches changes. Fetch the current record, compare stamps, then use
  `ifServerRecordUnchanged` so a concurrent write cannot invalidate that comparison.
- Product spec corrections awaiting approval: import, retained Timeline route, release-links path.
- Concurrent UI changes and their user authorization are recorded by the other
  session in `SPEC-ripples-product.md` and `tasks/ui-polish-checkpoint.md` (`2481feb`).
- Midnight and Paper artwork creation is authorized; generated drafts await visual approval.
- Alternate-icon adapters and the guarded settings selection path are implemented;
  registration, human artwork approval, actual switching, and relaunch evidence remain pending.
  Independent Sol review passed after partial-registration and native-error corrections.
  Final gate: 506 JS tests, seven Swift configuration checks, native build success,
  Expo Doctor 21/21, and live unsupported/rejection verification.
- Four reference titles are truncated in the private screenshots; full names were requested.
- Feedback, review, more-products, privacy, and terms destinations remain to be supplied.

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
- Existing Metro on 8081 belongs to the user. This session uses its own Metro on 8082 for
  the patched client, leaving the existing process under the user's control.
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

CloudKit, App Intents, alternate-icon asset registration, reference seeding, and spec edits
are not implemented or deferred by approval. No fork or fork-point tag has been made.
