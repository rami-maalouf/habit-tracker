# Plan: Ripples Product (Phase 2 under SPEC-ripples-product.md)

Owner: Fable 5. Verifier: GPT-5.6 Sol. Evidence: Argent on the approved simulator (iPhone 17 Pro, iOS 27.0, UDID 93EEF062-B4DC-4989-AF77-CF47EE2A9816).

One implementation plan per the spec's own sequence. Each stage is one gated task: red tests, implementation, full validation, Sol verification, Argent checkpoint, isolated commit, push.

## Stages

- P1 `tracking-core`: approved dependencies (expo-sqlite, expo-notifications, expo-file-system, expo-sharing, expo-crypto, expo-localization, expo-application, react-native-svg), `src/core` (domain, calendar, analytics formulas, persistence, sync primitives, export serialization), `src/platform/database`, migrations v1, repositories, commands, queries, widget projection table, HLC, deterministic fixtures. Migration and repository tests run against a real SQL engine in Jest through `node:sqlite` implementing the same abstract Database port that `expo-sqlite` implements on device.
- P2 `boards` vertical slice: Boards home (virtualized cards, seven-day strips, quick check-in with undo), Board Detail (heatmap, summary, education card), routes and recovery states.
- P3 `board-configuration` and `check-in-history`: create/edit sheets with live preview, options screen, archive/restore/delete flows, grouped history, add/edit check-in sheets.
- P4 `analytics` and `journal`: five analytics sections with react-native-svg charts plus text summaries; board-scoped journal.
- P5 `reminders` and `settings`: reminder editor, notification adapter and reconciler, settings sheet, archived boards, notifications status.
- P6 `data-export` and alternate icons: versioned JSON export through the share sheet; icon picker with adapter (native adapter arrives with the local module; until then the unavailable state is explicit).
- P7 `widgets`: expo-widgets target, App Group database relocation, projection-driven families, quick action (native executor lands with the local module where the toolchain allows).
- P8 platform seams and closure: sync engine over the outbox with a deterministic fake adapter (CloudKit native gated on signed-team input), automation command layer with contract fixtures (AppIntents native gated the same way), android-readiness stubs and doc, exports, full validation, criteria sweep.

## Standing constraints

- Local-first: no network dependency for any local feature.
- Every mutation through named commands with idempotency receipts, exclusive transactions, outbox rows, and projection refresh.
- Logical dates immutable once stored; startOfDayMinute 0..720 in 30-minute steps.
- ISO Monday weeks everywhere.
- Coverage: 90 percent global; 100 percent branch for domain commands, calendar, analytics formulas, migrations, export serialization, sync reconciliation.

## Release inputs currently missing (development proceeds with explicit states)

Apple Developer team (CloudKit, signed widgets/Siri device checks), release URLs, App Store id, icon artwork approval. Recorded per the spec's Required human-supplied release inputs section.
