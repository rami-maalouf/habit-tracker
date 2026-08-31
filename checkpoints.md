# Checkpoints

## Ripples product (SPEC-ripples-product.md) - stage checkpoints

### P1 - tracking core

1. Task id: P1 (tracking-core). Acceptance: shared SQLite source of truth with migrations, commands, queries, projections, HLC, receipts, outbox; approved dependencies installed via Expo Install; core coverage at 100 percent on all four metrics; real-engine tests.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/core/**` (domain, calendar, analytics, persistence, sync), `src/platform/database/**` (expo-sqlite adapter, app group path selection, composition root), `tests/product/**` (132-test suite over `node:sqlite`), `jest.config.js` (core 100 percent thresholds, reviewed type-only and adapter exclusions), `package.json` (focused scripts, product dependencies), `tasks/plan-product.md`.
4. Tests and static checks: 132/132; global coverage 99.67/99.55/98.72/100; `./src/core/` at 100/100/100/100; lint, typecheck, `bunx expo-doctor` 21/21, `git diff --check` all pass. Migration suite runs against a real SQL engine (`node:sqlite`) implementing the same port as `expo-sqlite`.
5. GPT-5.6 Sol review: fail on first pass with a deep findings list (DST wall-clock rule, amount-config retention, descendant outbox tombstones, gap-bridged streaks, seven-day thresholds, heatmap window edges, archived-board edit guards, void receipt replay, user_version placement, per-connection foreign keys, read-transaction snapshots, branded command ids, lint boundary). All items remediated with dedicated regression tests (142 tests, core back at 100 on all four metrics); focused re-reviews passed, including the dedicated-write-connection foreign-key design and per-period outbox rows.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), tests type: relaunch, root route visible (await 40 ms), log registry 0 entries. Product UI lands in P2; the core has no visible surface yet.
7. Notable in-spec decisions: `node:sqlite` (built into Node, no new dependency) provides the real-engine test database; the app group directory resolves through `Paths.appleSharedContainers` and falls back to the default location until the widget entitlement lands (P7); board-summary consistency uses a rolling 30-day window (the spec fixes the formula but not the summary-card window); `dismissMetricsEducation` added as a companion command for the settings-owned dismissal list.
8. Commit and push: `825d2cc`, pushed to `origin/main`.

### P2+P3 - boards, configuration, and history vertical slice

1. Task id: P2+P3 (one vertical slice). Acceptance: Boards home (cards, seven-day strips, quick check-in with 5s undo, accessible reorder), Board Detail (heatmap, summary metrics, education card, archived read-only state with restore/delete), create/edit sheets with live preview and shared draft, options screen, grouped check-in history, add/edit check-in sheets, settings sheet with archived boards, recovery states for invalid and missing ids.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/features/{boards,board-configuration,check-in-history,product-store,settings,ui}/**`, routes under `src/app/` (`index`, `boards/*`, `settings/*`, `_layout` form-sheet registration with detents), `src/platform/database/product-core.ts` (failed opens no longer cached), `src/testing/**` (render helpers, product-core mock over `node:sqlite`, `@expo/ui` datetime mock), `tests/product/features/**` (six suites), `jest.config.js`.
4. Tests and static checks: 234/234 tests at closure; the feature bucket clears the 90 gate on all four metrics after the core carve-out; `./src/core/` still 100/100/100/100; lint, typecheck, `git diff --check` pass; `bun run validate` exit 0 before every push.
5. GPT-5.6 Sol review: six escalating rounds, each fail remediated with regression tests before the next.
   - Round 1 (2 blockers, 8 majors, 2 minors): draft sessions owner-keyed (react `useId`) with route-id authority on save; check-in time stored as wall-clock time-of-day recombined with the selected date (historical default noon); board/check-in url mismatch rejected; archived boards reachable and history rows read-only when archived; form-sheet registration with detents plus `usePreventRemove` dirty guards; quick-pending as a set with surfaced undo failures; 44x44 pressables; heatmap dot/ring non-color markers; platform core stops caching failed opens; education gated on `metricsEnabled`; barrel imports; assertions strengthened (history, widget projection, outbox asserted after ui actions).
   - Round 2 (1 blocker, 4 majors, 2 minors): options routes validate their board segment against the live session; `endDraft` owner-scoped; picker's exact instant preserved for same-date saves (repeated dst hour); archived boards locked out of edit and check-in forms; failed opens close their connections; remaining barrel gaps; min-target enforcement made un-shrinkable.
   - Round 3 (1 major, 2 minors): archived boards never seed a draft session; the dst test uses the real november fall-back; barrel import in tests.
   - Round 4 (2 majors): a live edit that archives mid-session releases its session and converges to the lockout; shifted-day instants accepted by logical date, recombining onto the next calendar day inside the shift window.
   - Round 5 (2 majors): a spring-forward gap falls back to the logical day's start-of-day wall clock; note-only edits omit the occurrence so the stored instant, zone, and offset survive device zone changes.
   - Round 6 (1 blocker, 10 majors, 1 minor; scope widened to full stage conformance): amounts-off edits omit rather than overwrite amount configuration (retention regression the round-one fix had introduced); failed record loads surface instead of loading forever; date picker capped at the logical today; blank amounts rejected explicitly; detail quick action gains the five-second undo; failed detail queries render a retryable error and never misrender education; start-of-day gains a real draggable slider (`@expo/ui/community/slider` after the universal `Host matchContents` slider collapsed to a zero-length track on device); `/settings/archived` exists as its own route with retryable errors; check-in history pages by limit with whole-day trimming and true month totals for the 100,000-record requirement. Two reviewed deferrals: older heatmap-year navigation belongs to the analytics stage (the reference hosts year tabs in analytics), and the form preview reuses the shared symbol/strip/color renderers rather than the full board card (the reference preview shows no heatmap).
   - Rounds 7-9 (bounded confirmations of the round-six remediation): round 7 found the pagination boundary cases (a complete boundary day was discarded, an oversized day undercounted, no exhaustion guard); round 8 found the trimmed-boundary page stopping pagination prematurely and a weak exhaustion assertion; both remediated (overflow-row day comparison, oversized days completed via a per-day query, `hasMore` computed against true totals inside the snapshot, call-count exhaustion proof). Round 9: PASS with no findings. Stage 3 closed.
   - Independent self-review sweep (three parallel reviewers plus a device dark-mode sweep) fixed nine further defects: missing navigation dark theme (invisible sheet titles and light header pills in dark mode), palette row clipping at 44-point widths, heatmap scroll snapping on every re-render, silent reorder failures, unguarded detail quick double-tap, swallowed dismiss failures, heatmap window end-bound (core), future-year masking in year comparison (core), create-sheet reseed race, check-in conflict dead-end (keyed remount with parent-level notice), misleading untimed time picker, deep-link dead ends, and double submits during in-flight saves.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), interactive type:
   - dev build rebuilt (`expo run:ios`) because `expo-crypto`/`@expo/ui`/`react-native-svg` postdated the T7 binary; the stale binary's `ExpoCrypto` errors disappeared after rebuild.
   - walkthrough against `design/ripples-screenshots/`: home empty state -> Create Board sheet (live preview, palette, tint toggle, amounts section, reminder placeholder, options row) -> Options sheet (track time, start-of-day stepper stepping 12:00 AM -> 12:30 AM, metrics toggle, added Back control) -> save -> home card (tinted capsule, symbol, strip, quick circle) -> quick check-in (today bar filled, undo bar) -> detail (Mon-Sun heatmap with today cell, education card, Analytics/Check-Ins/Journal bar, quick button) -> Check-Ins sheet (`August` / `Aug 30` labels matching the reference after the month/day formatting fix) -> Add Check-in sheet (board pill, date row, note) -> settings sheet (Archived Boards section).
   - three same-day check-ins render the high-intensity ring marker on today's heatmap cell (non-color signal verified on device).
   - two real bugs found on device and fixed with tests: month header formatted a UTC instant in the host zone (showed `July 2026` for `2026-08`; now formatted in UTC with reference-matching labels), and the options sheet had no back affordance (added a header Back control).
   - `debugger-log-registry` after rebuild and walkthrough: 0 entries.
   - dark-mode sweep across home, detail, history, create sheet, options, and settings after the navigation-theme fix; the dirty-sheet discard guard and the draggable start-of-day slider verified live on device; blank sheet bodies observed twice reproduced only on hot-refreshed module state and never on a clean bundle (dev-only fast-refresh artifact, retested clean each time).
7. Notable in-spec decisions: reorder uses accessible Up/Down controls behind an Edit mode (drag handles land with a later polish pass); heatmap cells before board creation stay transparent per the eligibility rule; `defaultIncludeHiddenElements` stays on in Jest because the mocked screen stack leaves background sheets aria-hidden (on-device visibility is Argent's evidence, and visibility-critical assertions run directly after navigation).
8. Commits and pushes (incremental, one per unit, per direction): slice landed as 11 commits (`2fa5cb5`..`1a1e48c` plus `7770186`, `cdb95de`), followed by single-fix commits from the review rounds and self-review sweep (`f9734ca`, `d352713`, `50c5ce8`, `0ef01a2`, `cbf1a5d`, `8e56ce7`, `d8d5007`, `26abd95`, `67a3649`, `eda0590`, `9e36570`, `edebc02`, `2b8c4b1`, `c9a25c4`, `485e0dc`, `691fa67`, `58e7593`, `e8eb0ca`, `c8a03ce`, `b7c545b`), all pushed to `origin/main`.

# Checkpoints: native-foundation

Active module: `native-foundation`. Spec: `SPEC-native-foundation.md`. Plan: `tasks/plan.md`.

Evidence images live under `.artifacts/` or system temp paths and stay out of Git.

### P4 - analytics and journal

1. Task id: P4. Acceptance: analytics sheet (timeline chart, weekday distribution, year comparison, consistency, streak rows), journal timeline, svg chart primitives, honest empty/error/unavailable states, logical-year bounds.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/features/analytics/**`, `src/features/journal/**`, svg chart primitives, `src/core` queries (`earliestCheckInDate`, consistency band classification, streak window anchoring), routes `boards/[boardId]/{analytics,journal}`, `src/testing/react-native-svg.mock.tsx`, analytics and journal test suites.
4. Tests and static checks: full suite green at every push; core stayed 100/100/100/100; feature bucket over the 90 gate; lint, typecheck, `git diff --check` pass.
5. GPT-5.6 Sol review: fail on first pass with 11 findings; all remediated with regression tests (raw-percent consistency bands per spec line 130 (`765546f`), streak rows anchored to the window end (`2cb672c`), logical-year bounds and future-month masking with honest unavailable/empty/prior-year cards (`fd7cbba`, `b265f4d`), journal row accessibility label carrying the note (`458a2eb`), foreground query refresh (`b5a638a`)). The bounded confirmation rerun hung in the sandbox at 70 minutes, was killed, and its tighter rerun completed with the remediation standing.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`): analytics sheet walkthrough against the reference screenshots (timeline, weekdays, comparison, consistency, streaks), journal timeline with notes, log registry clean.
7. Notable in-spec decisions: rounding is presentation-only across analytics; months before the first check-in render as unavailable rather than zero.
8. Commits and pushes: `1d3b2a2`..`b5a638a` plus the remediation fixes above, one commit per unit, all pushed to `origin/main`.

### P5 partial - settings, export, and two-source import

1. Task id: P5-partial (settings + data transfer, user-directed). Acceptance: reference-matching settings sheet groups; export to a shareable versioned json file; import from this app's own export and from a real Ripples csv; notifications permission screen; explicit interim screens for icloud/app-icon/timeline; archived boards route retained.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/core/export/{serialize,import-parsers}.ts`, `importSnapshot` in `src/core/domain/commands.ts`, `src/platform/data-transfer/**` (File/Paths/Sharing/pickFileAsync, stale export cleanup), `src/features/settings/**` (settings screen groups, import screen states, notifications, release links), `tests/product/domain/import-export.test.ts`, `tests/product/features/settings-flows.test.tsx`, mocks for data transfer and notifications.
4. Tests and static checks: 290/290 at closure; core 100/100/100/100; lint and typecheck clean; `bun run validate` exit 0 before every push.
5. GPT-5.6 Sol review: fail on first pass with 14 findings. Remediated 13 with regression tests (`a8b4dca`, `42357b5`): raw tombstone-aware id existence checks so restores never abort on deleted records; restored periods sanitized (shape, order, overlap, open-last) with fallback to a derived lifetime period; per-record fail-soft own-export parsing; imported amounts through `validateAmount`; same-day future instants clamped to now; strict rfc-4180 quoting errors; full required csv column set; explicit error for unreadable non-empty archive dates; preserved order keys folded into the order-key high-water mark; forbidden-key leak scan over the serialized json; tombstone/amount/clamp regression tests; missing-link notice moved above the scroll; singular/plural import counts. One accepted deferral: production release links stay null validated behind `releaseLink()` because the real urls are missing release inputs (recorded). Bounded confirmation rerun: 10 findings FIXED, 4 PARTIAL, 3 NEW minors; every partial and new item remediated with regression tests in `8d576f2` (malformed period entries survive as invalid sentinels so the whole list is distrusted, preserved order keys outside the base-36 alphabet regenerate instead of poisoning the generator, a clamped future instant recomputes its offset in the record's own zone, a tombstoned check-in id on a live board skips through the raw existence check, and the notice-placement test asserts render order).
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`): full device round trip - export shared to Files, then imported back ("Added 0 ... Skipped 2 boards and 9 check-ins"); the real user-provided Ripples csv parsed in tests to 8 boards and 27 check-ins with unit and eligibility spot-checks (personal file kept out of the repo; a synthesized fixture is committed).
7. Notable in-spec decisions: `File.pickFileAsync` replaced `expo-document-picker` (no native rebuild); export excludes tombstones, receipts, outbox, and device identifiers by construction and by test.
8. Commits and pushes: `a7845b0`, `4522e56`, `530e9c7`, `b3b5969`, `7edb9ff`, `6cb5d4d`, `a8b4dca`, `42357b5`, all pushed to `origin/main`.

### P5 - reminders and notifications

1. Task id: P5 (reminders). Acceptance: reminder entity commands with just-in-time permission, weekday/time/message editor per screenshot 6, board form integration (saved boards and unsaved drafts), replace-before-cancel native scheduling with capacity validation, reconciler on cold start/foreground/archive/restore/permission change, notification tap deep links, Settings > Notifications with authorization/count/errors, reminders in export and import.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/core/domain/reminder-commands.ts` (create/update/setEnabled/delete/reconcile), `src/core/domain/ports.ts` (ReminderScheduler port), `src/core/persistence/repositories/reminders.ts`, reminder queries and notification overview in `queries.ts`, export/import extension (`serialize.ts`, `import-parsers.ts`, `importSnapshot`), `src/platform/notifications/` (expo-notifications weekly triggers, tap plumbing), `src/features/reminders/` (editor sheet, weekday helpers), board form reminder rows and draft commits, notifications settings screen, provider reconcile and deep-link wiring, notifications platform mock, reminders test suites.
4. Tests and static checks: 341/341; core 100/100/100/100; feature bucket over the 90 gate; lint, typecheck clean; `bun run validate` exit 0 before every push.
5. Notable findings and decisions: P1's archive/delete paths deleted `reminder_schedule` rows before anything could cancel the native requests they identified - both now keep the rows so the reconciler cancels through stored identifiers (orphan cleanup covers board deletes). A denied first save preserves the validated reminder disabled with scheduleState `denied` per the spec and never re-prompts. Permission prompts run before the exclusive transaction. Reconcile state changes never enter the outbox (device-local). The `ui` barrel's require cycle (index -> recovery -> index) was split into `primitives.tsx`.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), interactive type: edit board -> Add reminder opens the native half sheet (weekday chips M-S, time pill 9:00 AM, message placeholder "Check in to morning pages", repeat footnote); deselected Sat/Sun; save triggered the real iOS notification permission dialog (just-in-time), Allow scheduled the reminder; the edit sheet shows the row "9:00 AM / Mon, Tue, Wed, Thu, Fri" with an enabled switch (row layout stacked after a cramped first render); Settings > Notifications reports "Allowed" and "Enabled reminders: 1" with no schedule errors. Log registry: two stale fast-refresh reference errors from mid-session edits (absent after the clean reload) and upstream RNS/AnimatedValue warnings; the authored require-cycle warning was fixed.
7. Deferred within stage: significant-time-change reconcile trigger relies on cold-start/foreground reruns until a native listener lands with the widgets stage; DST repeated-hour behavior is delegated to the platform per spec.
8. Commits and pushes: `a699560`, `4aa8308`, `8d576f2`, `2eb81b6`, `4313d04`, all pushed to `origin/main`. GPT-5.6 Sol review of this stage: pending (bounded run follows this checkpoint).

### P7 - iOS Home Screen widgets

1. Task id: P7 (widgets). Acceptance: expo-widgets extension over the App Group database, all four home screen families with per-family row budgets, symbol + truncated title + full accessibility title + seven-day strip + quick action per row, title deep-link to Board Detail, timeline entries covering the next logical-day boundary with a stale accessibility hint, empty state deep-linking to Create Board, widget reads only `widget_board_rows`.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `app.json` (expo-widgets plugin with the App Group, four supported families, App Group entitlement), `src/features/widgets/widget-props.ts` (projection mapping, per-family limits, next-boundary calculation), `src/platform/widgets/ripples-boards-widget.tsx` (the widget layout), `src/platform/widgets/index.ts` (timeline refresh, interaction listener), `src/platform/database/index.ts` (legacy database relocation into the shared container, busy timeout), provider wiring (refresh on every store change, day-boundary timer), `src/testing/widgets-platform.mock.ts`, `tests/product/features/widgets-slice.test.tsx`.
4. Tests and static checks: full suite green at every push; core 100 on all four metrics; lint and typecheck clean; iOS and Android exports succeed.
5. Notable findings and decisions, all found on device:
   - `createWidget` crashed with `ReferenceError: Can't find variable WIDGET_ROW_LIMITS`: the `'widget'` function runs inside the extension's own sandbox, so every constant and helper it uses must live in the function body. The layout is now self-contained (`617c793`).
   - The interactive-button quick check-in is **not** achievable through expo-widgets in this SDK: its App Intent performs inside the extension process (`openAppWhenRun: NO`, verified in the device log) and posts its interaction event to that process's own `NotificationCenter`, so the app never observes the press. Per the spec's rule for an action that cannot safely execute, the quick action deep-links to Add Check-In instead of silently doing nothing; writing in place needs the native executor. The app-side listener remains as the contract half (`5512a11`).
   - A row-level `accessibilityLabel` collapsed the whole row into one ambiguous element (`describe` showed the title link and quick action both reading "morning pages"). Each control now carries its own label and the strip reports "N of the last 7 days checked in".
   - Migration 2 hit `database is locked` when two app instances contended for the shared database; both connections now set `busy_timeout` (`5abb396`).
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`): widget added from the gallery in both small (1 row) and medium (2 rows) families; the home screen widget renders real App Group data (pink `morning pages`, green `Pray`) with correct strips; `describe` confirms three distinct labels per row; the quick action deep-links to Add Check-In for the right board and its save landed on the new logical date; the title link opens Board Detail; the App Group container holds `ripples.db` and the projection refreshed across the midnight boundary (`strip_end_date` advanced to 2026-08-31).
7. Deferred within stage: the in-place widget write awaits the local native executor (same native module as App Intents); recorded above with the device evidence for why.
8. Commits and pushes: `3217da2`, `617c793`, `5512a11`, `5abb396`, `0d81260`, all pushed to `origin/main`.

### P8 - private sync, automations, and android readiness

1. Task id: P8. Acceptance: provider-neutral sync records and transport port; one sync pass (zone, outbox upload, paged fetch, reconcile); HLC observation and lexicographic conflict resolution; tombstones that strip user content; change tokens persisted only with their records; idempotent upload; bounded jittered retry; the six status values with no raw provider detail; Settings > iCloud Sync with the pre-enable explanation; the three automation intents over one shared JSON fixture suite; android-safe stubs and an architecture note.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/core/sync/{transport,records,engine}.ts`, sync helpers in `src/core/persistence/repositories/support.ts`, migration 2 (`settings_mutation_stamp`), `getSyncSummary` in `queries.ts`, `src/core/automations/contract.ts` and `fixtures/intent-contract.json`, `src/platform/sync/index.ts`, `src/platform/android/adapters.ts`, `src/features/settings/icloud-screen.tsx`, `docs/android-readiness.md`, `tests/product/domain/{sync,automations,android-readiness}.test.ts`, `tests/product/helpers/fake-transport.ts`.
4. Tests and static checks: 413/413; core 100/100/100/100; feature bucket over the 90 gate; lint and typecheck clean; iOS and Android production exports both succeed.
5. Notable decisions: reminders ship their rule and enabled state but never `scheduleState`/`lastScheduleError` (device-local); activity periods travel as `boardId|startDate` because their local integer ids never leave the device; the settings singleton syncs only `metricsEducationDismissed` under the stable id `app-settings` and gained its own mutation stamp in migration 2; a tombstone's stripped value is whatever its column accepts (empty string for the `NOT NULL` board columns, null elsewhere) so a replica inserting a tombstone it never saw still satisfies the local constraints; the fixture's board ids are stable handles resolved per executor, not literal row ids.
6. Argent evidence: Settings > iCloud Sync verified on device - toggle off with Status `Off`, real queue depth (24 waiting), `Last sync Never`, the pre-enable alert naming the user's own private iCloud account, and after Turn On the honest `Needs Attention` status with the queue intact and a manual Sync Now.
7. Explicitly not in this release, with reasons: the CloudKit transport itself (`src/platform/sync` throws a typed `unavailable`) needs a local native module and a container entitlement on a signed Apple Developer build, so the spec's two-device sandbox convergence check is a missing release input; the native AppIntents executor (and with it the widget's in-place write) needs that same local Swift module; order-key compaction and the 90-day local tombstone purge are the spec's optional ("may") clauses and are not implemented; Android ships no Kotlin by design.
8. Commits and pushes: `8311e61`, `3845164`, `5abb396`, `77ddbbb`, `8ea45df`, `97fbebd`, `fb9304c`, plus the migration-ordering fix, all pushed to `origin/main`.
9. GPT-5.6 Sol review: fail on first pass with 3 blockers, 12 majors, 1 minor. The three blockers are the native gaps this environment cannot close (no CloudKit transport module, no signed Apple team, no AppIntents executor); the declarative half of the entitlements blocker was fixed by adding the iCloud container, CloudKit service, and ubiquity-kvstore entitlements to `app.json`. Every major and the minor were remediated with regression tests:
   - tombstones now strip user preferences as well as content (amounts, tracking flags, times, day shift, metrics, reminder rules), keeping only structural linkage and timestamps, with each column's stripped value chosen to satisfy its local NOT NULL constraint.
   - `SyncRecord.deleted` is authoritative when applying: a stripped tombstone whose timestamp was lost still dies (dated by the applying device), and a live record can never inherit a stale `deleted_at`.
   - the iCloud screen honors `retryAfterMs` with its own timer, and turning sync off bumps a generation token so an in-flight pass's result is dropped and no retry is armed.
   - the automation intents moved their resolution inside the command envelope: `createCheckIn` now reports the logical date it recorded, and a new `removeLatestCheckIn` command resolves its target inside the receipt, so a retry that crosses midnight replays the original outcome instead of picking a different record.
   - preflight read failures return an actionable `DomainResult` instead of rejecting, and Get Today's Check-Ins fails `not_found` for an archived, deleted, or unknown board rather than answering with an empty success.
   - the widget and sync platform entry points became `index.ios.ts` with android-safe `index.ts` fallbacks, so no android-resolved file evaluates expo-widgets or SwiftUI; a new test scans every production entry point (not just the stubs) for genuinely ios-only imports.
   - the fake transport now resolves writes the way a converging server must (greater stamp wins) and records refused stale uploads, so a client that uploads stale data is caught instead of masked.
   - migration 4 stamps and enqueues an existing metrics dismissal so upgraded data reaches first sync; the earlier ordering mistake taught its own lesson - renumbering an already-applied migration tripped the checksum guard on the dev device, and the fix was to keep applied history intact and add the new work as a later version.
   The orphan-dependent stall Sol flagged had already been fixed before the review finished (`8ea45df`): unapplicable records wait in `sync_deferred` and drain after each page.
10. Scale budgets: a new `tests/product/domain/scale.test.ts` seeds 100,000 check-ins and 1,000 boards and asserts the spec's shapes - history pages in whole days without materializing every row, analytics compute from aggregates, and the home projection reads one grouped query instead of one per board (an N+1 removed while writing the test).
11. Confirmation rounds and closure. Round 2 (13 items): 11 FIXED, 2 PARTIAL, 3 NEW - remediated by releasing the busy state on a failed disable, widening the readiness scan to `.android` files, adding a genuinely in-flight disable test, and fixing the shared `settle()` helper so timer advancement gets its own awaited act (the act warning appeared in every router test, not just the sync ones; it is now zero across all 440). Round 3 (5 items): 4 FIXED, 1 PARTIAL, 1 NEW - a failed disable cleared `busy` but left the status label reading `Syncing…` beside a live Sync Now; the status now resets too, proven by a test that breaks only the write path so the screen's own reads still work, and the in-flight test now asserts the engine's `retry_state` is unchanged after 900 seconds. Round 4: **PASS**, both items FIXED, no new findings. Stage closed at 440 tests, zero act warnings, core 100 on all four metrics, `expo-doctor` 21/21, and both production exports succeeding.
12. Honest read on where the defects clustered: every Sol finding in this stage landed in the sync and automation layer - the part built without a device to exercise it. The widget and reminder work, which was driven on the simulator throughout, survived review. That is also the argument for leaving the three native blockers explicitly unconnected rather than claiming they work.

### UI corrections - user-reported (2026-08-30)

1. Scope: board detail presents as a pushed screen (user correction of the earlier bottom-sheet request); the add/edit check-in sheet takes half the screen; the date picker no longer clips; check-in history uses a real native swiftui list with swipe-to-delete; glyph buttons centered; the habit-screen plus opens the Add Check-in sheet; heatmap cells colored by count.
2. Author: Fable 5. Device-verified end to end on the simulator.
3. Key findings: the native-stack `formSheet` presentation never paints its react content in this stack at any detent (react tree mounted, pixels and accessibility empty, clean bundle) - replaced by `@expo/ui/community/bottom-sheet` (native swiftui sheet, detents 50/100 percent, pan-to-close with a dirty-guard reopen) hosted in a `transparentModal` route; swiftui list rows use `HStack` + `contentShape` + `onTapGesture` because a swiftui `Button` tints the row and its plain style hit-tests only the label.
4. Tests: history-list fallback suite added (android path), swipe-delete and paging covered through the swift-ui mock; 290/290 with thresholds met.
5. Commits: `8aa5cc3` (superseded by the push correction), `9dd9dd1`, `05dcba8`, `b0a51ab`, `1d582d3`, `81c7559`, `2bbbb72`, `dfe5e3a`, `2ec9f92`, all pushed to `origin/main`.

## Open items at the end of the product build

Everything below is blocked on inputs or capabilities this environment does
not have. Nothing here is a silent omission: each has a visible, honest
state in the app and a test that pins that state.

### One local Swift native module (the spec's approved single module)

Four features share this dependency. The spec assigns all of them to it, and
none can be built or verified without a signed Apple Developer team:

1. **CloudKit sync transport.** The engine, provider-neutral records,
   conflict resolution, tombstones, deferral, retry, and status are built and
   tested against a deterministic fake (`tests/product/helpers/fake-transport.ts`).
   `src/platform/sync/index.ios.ts` throws a typed `unavailable`, so
   Settings > iCloud Sync reports `Needs Attention` and keeps every change
   queued. The spec's two-device convergence check needs signed builds.
2. **App Intents executor (Shortcuts and Siri).** The TypeScript executor and
   the shared JSON fixture suite are complete
   (`src/core/automations/`); the Swift executor must pass the same fixtures.
3. **Widget in-place quick check-in.** Proven on device to be impossible
   through expo-widgets alone: the button's intent performs in the extension
   process and its event never reaches the app. The widget deep-links to Add
   Check-In, which is the spec's rule for an action that cannot safely run.
4. **Alternate app icons.** `UIApplication.setAlternateIconName` belongs to
   this module. Settings > App Icon shows the three previews and says
   selection arrives with a native update.

### Missing release inputs

- Apple Developer team (blocks the module, the CloudKit container, and every
  signed-build check).
- Product and legal URLs: feedback, App Store review, more products, privacy
  policy, terms of use. `releaseLink()` validates them and the settings sheet
  shows an explicit missing-link notice above the fold.
- Alternate icon assets for Midnight and Paper.

### Deliberate non-implementations

- Order-key compaction after reconciliation and the 90-day local tombstone
  purge: both are the spec's optional ("may") clauses.
- Android ships no Kotlin by design - interfaces, android-safe stubs,
  contract fixtures, and `docs/android-readiness.md` only.

## Approvals log

- 2026-08-30: human approved the spec (recorded in spec).
- 2026-08-30: human ran the privileged Xcode license/first-launch step and said "Let's run it", approving plan execution.
- 2026-08-30: human approved the simulator equivalent for success criterion 3: iPhone 17 Pro on iOS 27.0 replaces iPhone 16 Pro on iOS 26.6. No iOS 26.6 runtime or iPhone 16 Pro device exists on this machine (installed runtimes: iOS 26.5, iOS 27.0).
- 2026-08-30: human approved three T2 dev-dependency deviations: `ajv@^6` (Bun hoisting fix for expo lint), `eslint@^9` plus `eslint-config-expo` (required by the approved lint script; eslint 10 breaks eslint-plugin-react), and `@testing-library/react-native` pinned to the v13 line (v14 async render is incompatible with expo-router 57 testing library).
- 2026-08-30: human approved the seven T7 captures as the visual baselines (light/dark top and bottom, forced fallback, AXXL interaction, increase-contrast plus reduce-motion). Replacement requires new human approval.
- 2026-08-30: human selected "product spec only" governance. `SPEC-ripples-product.md` (authored by a GPT-5.6 Sol session) specifies all modules after `native-foundation`. Thirteen per-module spec drafts produced the same day were discarded before commit. `CAPABILITY-MAP.md` updated to record the two-spec structure.

## T1 - simulator toolchain repair and argent preflight

1. Task id: T1. Acceptance: preflight commands succeed; Argent lists and boots the target; UDID recorded; equivalent approved if iOS 26.6 absent.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `checkpoints.md` (new), `tasks/plan.md` (new), `tasks/todo.md` (new, T1 items updated).
4. Tests and static checks: none applicable (no application code). Toolchain evidence:
   - `xcode-select -p` -> `/Applications/Xcode.app/Contents/Developer`
   - `xcodebuild -version` -> Xcode 26.6 (17F113)
   - root cause of the recorded preflight failure: stale xcrun cache plus an unaccepted license; human accepted the license, Fable 5 ran `xcrun --kill-cache`
   - `xcodebuild -license check` exit 0; `xcodebuild -checkFirstLaunchStatus` exit 0
   - `xcrun --find simctl` -> `/Applications/Xcode.app/Contents/Developer/usr/bin/simctl`, exit 0
5. GPT-5.6 Sol review: fail on first pass (field 6 lacked structural and runtime-log entries; booted-state check blocked by verifier sandbox). Remediated, then pass on re-review (codex sessions 01a05130 and follow-up, 2026-08-30). Unresolved risks: none.
6. Argent evidence:
   - `list-devices` returned 30 iOS simulators plus 2 Android AVDs
   - selected target: iPhone 17 Pro, iOS 27.0, UDID `93EEF062-B4DC-4989-AF77-CF47EE2A9816`
   - `boot-device` -> `booted: true`
   - full-resolution screenshot 1206x2622 px at 3x scale = 402x874 pt, matching the spec viewport exactly
   - interaction performed: device boot and baseline screenshot only
   - structural result: not applicable - the app is not installed in T1; first launch and describe happen in T2
   - runtime-log result: not applicable - no app process ran in T1; the debugger log registry gate starts in T2
   - `xcrun simctl list devices booted` confirms the target is Booted (metadata check outside the verifier sandbox)
7. Deviations: simulator target replaced per Approvals log (human approved 2026-08-30).
8. Commit and push: `34a9874`, pushed to `origin/main`.

## T2 - dependencies, test harness, and repository hygiene

1. Task id: T2. Acceptance: approved dependencies installed via Expo Install; scripts added; jest harness green; lint, typecheck, coverage, doctor, diff-check pass; Argent smoke evidence.
2. Author: Fable 5. Delegated agents: none (spec drafting delegation this session was for the discarded per-module drafts, outside this task).
3. Files changed: `package.json`, `bun.lock`, `jest.config.js`, `tsconfig.json`, `.gitignore`, `eslint.config.js` (generated by `expo lint`), `app.json` (expo-image config plugin added by Expo Install), `src/testing/render.tsx`, `src/testing/expo-router-matchers.d.ts`, `tests/native-foundation/harness.test.tsx`, starter files `app/+not-found.tsx`, `components/EditScreenInfo.tsx`, `components/ExternalLink.tsx`, `components/useClientOnlyValue.web.ts` (minimal lint/type fixes; files are removed in T3).
4. Tests and static checks: TDD red recorded (module-not-found, then assertion failures), then green. `bun run validate` passes with 100 percent coverage on authored code. `bunx expo-doctor` 21/21. `git diff --check` clean.
5. GPT-5.6 Sol review: fail on first pass (ajv approval unrecorded; eslint and eslint-config-expo missing from package.json). Remediated: human approved the dependency deviations, eslint ^9 and eslint-config-expo pinned in package.json. Pass on re-review. Environmental notes from the verifier sandbox (watchman state dir, exp.host network) were confirmed non-issues in the author environment.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`):
   - `bunx expo run:ios` built, installed, and opened `com.ramimaalouf.habittracker` through the dev client (Build Succeeded, 0 errors). CocoaPods needs `LANG=en_US.UTF-8` on this host.
   - interaction performed: dismissed the first-run dev menu (Continue, then Close) with coordinates from `describe` discovery.
   - structural result: `describe` exposes the starter root route (Tab One title, tab bar, screen text) - the JS bundle loads from Metro.
   - runtime-log result: `debugger-log-registry` connected, 0 entries, no warnings or errors.
7. Deviations and notable decisions:
   - `@testing-library/react-native` pinned to the v13 line (13.3.3). v14 makes `render` async, which expo-router 57.0.17's testing library calls synchronously; v14 is therefore not "compatible current" for SDK 57.
   - `ajv@^6` added as a direct dev dependency: Bun hoists `ajv@8` (from expo-mcp's MCP SDK) and resolves ESLint's `ajv@^6` requirement to it, crashing `expo lint`. The direct dependency restores a v6 root resolution; the MCP SDK keeps its nested v8.
   - `tsconfig.json` gains `types: ["jest", "node"]` (TypeScript 6 does not auto-include @types) and `src/testing/expo-router-matchers.d.ts` declares the router matcher types expo-router ships empty.
   - The dev client build (`expo run:ios`) moved earlier than the plan's T7 slot so T2 through T6 can produce Argent evidence; T7 still owns full device validation.
   - Starter files received minimal real fixes (no rule silencing) to keep the commit green; they are deleted in T3.
8. Commit and push: `7bc374d`, pushed to `origin/main`.

## T3 - route migration to src/app and starter removal

1. Task id: T3. Acceptance: `/` renders stack title `Ripples` and selectable `Native foundation ready` with automatic inset adjustment; `+not-found` recovers; starter removed with no dead imports, routes, assets, or dependencies; alias `@/*` -> `./src/*`; `ios.deploymentTarget` 18.6.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/app/{_layout,index,+not-found}.tsx` (new), `tests/native-foundation/routes.test.tsx` (new), `tsconfig.json` (alias), `jest.config.js` (moduleNameMapper, `standard-navigation` transform allowlist), `app.json` (deploymentTarget, removed expo-font/expo-status-bar/expo-web-browser plugins), `package.json` and `bun.lock` (removed expo-font, expo-web-browser, expo-symbols, expo-status-bar); deleted `app/`, `components/`, `constants/`, `assets/fonts/`.
4. Tests and static checks: TDD red recorded, then green (4/4). `bun run validate` passes at 100 percent coverage. `bunx expo-doctor` 21/21. `git diff --check` clean. Typed routes regenerate from `src/app` (Metro restart required; log confirms "Using src/app as the root directory for Expo Router").
5. GPT-5.6 Sol review: fail on first pass (recovery test did not press the link; inset not asserted). Remediated with a behavioral recovery test and inset assertion; pass on re-review.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`):
   - before: `describe` of `/` shows `Ripples` title group and `Native foundation ready` static text.
   - navigation: `open-url habittracker://this-route-does-not-exist` deep-links to `Not found`; `describe` shows the recovery link; tapping it (discovery coordinates) lands on `/` with no stale back entry after the `replace` fix.
   - back behavior: in the pushed variant the header exposed the native `Ripples` back button (`id=BackButton`).
   - runtime-log result: `debugger-log-registry` connected, 0 entries.
   - final screenshot captured after recovery.
7. Deviations from the reference: none. Notable in-spec decisions: `+not-found` recovery uses `replace` so the unmatched route does not stay on the stack; Jest asserts the stack title and inset behavior through props because the native header and scroll insets render natively, with the on-device result covered by the Argent evidence above. The recovery test presses the link and asserts the pathname returns to `/`.
8. Commit and push: `04e3d99`, pushed to `origin/main`.

## T4 - semantic theme tokens

1. Task id: T4. Acceptance: one theme entry point at `src/theme/index.ts`; semantic colors with web-safe fallbacks; brand accent boundary; 4-point spacing; Dynamic Type ramp on the system font; continuous radius tokens; boxShadow-only shadows; motion tokens with reduced-motion policy; token invariants tested.
2. Author: Fable 5. Delegated agents: none (drafting delegation was considered and not needed).
3. Files changed: `src/theme/{colors,spacing,typography,radius,shadows,motion,index}.ts` (new), `tests/native-foundation/theme.test.ts` (new), `eslint.config.js` (no-restricted-imports guard so non-theme code imports `@/theme` only).
4. Tests and static checks: TDD red recorded (unresolved `@/theme`), then green. 16/16 tests, 100 percent coverage on all four metrics, lint and typecheck pass. Contrast invariants asserted in tests: label on background and grouped background, onAccent on accent, and onDestructive on destructive all meet 4.5:1 in both schemes.
5. GPT-5.6 Sol review: fail on first pass (shared hex literals not hoisted; ban-word grep matched comments). Both were prompt-literal findings, remediated cosmetically; pass on re-review.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), tests type: app relaunched, root route visible (`Native foundation ready` await succeeded in 96 ms), `debugger-log-registry` connected with 0 entries.
7. Deviations from the reference: none. Notable in-spec decisions: destructive light fallback uses `#d70015` (system red accessible variant) so onDestructive white meets 4.5:1; brand accent pair (`#2563eb` light, `#7cb3ff` dark) chosen to pass 4.5:1 against its on-accent colors.
8. Commit and push: `8548511`, pushed to `origin/main`.

## T5 - foundation components

1. Task id: T5. Acceptance: AppText, Icon mapping boundary, adaptive-material with platform files and identical geometry across branches, accessibility helpers, component tests by role and name, iOS-only imports isolated, no invisible surface on missing capability.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/components/foundation/{app-text,icon,material-geometry,adaptive-material-opaque,adaptive-material,adaptive-material.ios,adaptive-material.android}.tsx|ts` (new), `src/foundation/accessibility/index.ts` (new), `src/theme/colors.ts` and `index.ts` (normalizeScheme helper), `tests/native-foundation/components.test.tsx` (new).
4. Tests and static checks: TDD red recorded, then green. 31/31 tests; coverage 100/96/100/100 (all four at or above 90). Lint, typecheck, `git diff --check` pass.
5. GPT-5.6 Sol review: fail on first pass (icon queried by label instead of role plus name). Remediated with getByRole('image', { name }); pass on re-review. Recorded risk from review: resolver-level proof that an unsuffixed import resolves android-safely arrives with the Android export in T8.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), tests type: relaunch, root route visible (await 88 ms), log registry connected with 0 entries. Components render on-screen first in T6; their native verification happens there and in T7.
7. Deviations from the reference: none. Notable in-spec decisions: `expo-glass-effect` availability probe wrapped in try/catch degrading to blur; shared `adaptive-material-opaque` base keeps neutral and android boundaries identical; Icon uses `expo-image` `sf:` sources on iOS and accessible glyph text elsewhere; decorative icons are hidden from assistive technology.
8. Commit and push: `279091c`, pushed to `origin/main`.

## T8 - exports, coverage gate, and module closure

1. Task id: T8. Acceptance: iOS and Android exports succeed; final native build with the approved configuration installs and launches; every command gate passes; repository hygiene holds; all 22 success criteria confirmed.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `checkpoints.md`, `tasks/todo.md` (closure records only; no product code).
4. Tests and static checks: `bun run validate` 39/39 with coverage 97.19/93.54/93.18/100; `bunx expo-doctor` 21/21; `git diff --check` clean; `bunx expo export --platform ios` and `--platform android` both succeeded (`dist-validation/`, ignored); the Android bundle resolved with no iOS-only module failure, closing the T5 resolver-level risk; final `bunx expo run:ios --device <approved UDID>` built and installed with `ios.deploymentTarget` 18.6 (Build Succeeded, exit 0).
5. GPT-5.6 Sol review: fail on first pass (closure bookkeeping: missing T6/T7 hashes, unchecked todo items, self-hash paradox). All records remediated; pass on re-review, with the two-commit closure protocol confirmed sound.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), tests type: rebuilt client launched, root route described (`Ripples`, `Native foundation ready`), `debugger-log-registry` connected with 0 entries.
7. Deviations from the reference: none.
8. Commit and push: closure commit `9f54e9d` (`chore: close native-foundation module validation`), recorded here by the follow-up docs commit; both pushed together to `origin/main`.

### Success criteria closure (all 22 true)

1. `CAPABILITY-MAP.md` identifies `native-foundation`; the spec stays scoped to it.
2. `xcrun --find simctl` succeeds; Argent listed and booted the target (T1).
3. Human-approved equivalent simulator: iPhone 17 Pro, iOS 27.0, 402x874 pt verified (T1).
4. App installs and launches through the dev client with `com.ramimaalouf.habittracker` (T2, re-proven T8).
5. Routes load from `src/app`; `/` always resolves; `+not-found` recovers behaviorally (T3).
6. Starter removed with no dead imports, routes, assets, or dependencies (T3).
7. `/` renders stack title `Ripples`, selectable `Native foundation ready`, automatic insets, nothing else (T3).
8. `/foundation-preview` renders the seven ordered sections and every labeled fixture from deterministic data (T6).
9. Production-mode router test redirects `/foundation-preview` to `/` with no fixture rendered (T6).
10. `@expo/ui` controls render in a native Host with contract labels and changing values on iOS; Android-safe Host composition passes under mocks and the Android export resolves cleanly (T6, T8).
11. Glass runtime reports and renders `liquid glass`; `material=fallback` reports and renders `blur` with identical geometry (T6, T7).
12. Light and dark full-resolution captures show every section with no clipping, overlap, missing material, or unsafe insets; custom contrast pairs meet 4.5:1 by token tests (T7).
13. At font scale 3.143 every section stays reachable and operable with no clipping after the line-height refinement (T7).
14. `describe` exposes the title, five labeled controls, enabled/disabled/selected/value states, and the 0 -> 1 action count (T6, T7).
15. Reduce Motion keeps state changes immediate; no authored decorative animation exists; reduced-motion policy unit-tested (T4, T7).
16. `expo run:ios`, the iOS export, and the Android export all succeed (T8).
17. All command gates pass with coverage at or above 90 on all four metrics (T8).
18. Debugger log registry shows no authored warning, error, or unhandled rejection at any checkpoint; no upstream warning needed approval.
19. The screenshot diff contains only explained regions; baseline creation carries recorded human approval (T7).
20. Every task has a Fable 5 checkpoint, an independent GPT-5.6 Sol pass, and Argent evidence.
21. Isolated lowercase conventional commits, no signatures or co-authors, pushed to `origin/main` after gates: `34a9874`, `7bc374d`, `04e3d99`, `8548511`, `279091c`, `41de0c3`, `fa1e443`, plus the T8 closure commit.
22. `git ls-files` contains no private screenshot, `.artifacts/`, `dist-validation/`, or generated `ios/`/`android/` entry (app icon assets are public app resources).

## T7 - development client build and full device validation

1. Task id: T7. Acceptance: full light and dark captures of the preview, forced-fallback comparison, Dynamic Type at an accessibility size, Reduce Motion and Increase Contrast via the Settings app, clean runtime logs, screenshot-diff harness, human-approved baselines.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/components/foundation/app-text.tsx`, `src/theme/typography.ts` (lineHeightFor policy), `src/theme/index.ts`, `tests/native-foundation/theme.test.ts`, `tests/native-foundation/components.test.tsx`, `checkpoints.md`.
4. Tests and static checks: 39/39 tests, coverage 97.2/93.5/93.2/100, lint, typecheck, `git diff --check` pass after the refinement.
5. GPT-5.6 Sol review: pass on first pass (refinement code sound, tests and gates green, checkpoint chain internally consistent, baselines present and gitignored; on-device pixels rest on the recorded evidence).
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`):
   - light and dark full-resolution captures of the top and bottom preview regions; forced fallback capture (`Material: blur`, `Material mode: fallback forced`) with identical surface geometry to the glass capture.
   - visible refinement iteration 1: dark capture exposed text with no semantic color (invisible on black). Fixed AppText to carry `semanticColor('label')`; re-captured both appearances.
   - visible refinement iteration 2: at `accessibility-extra-extra-large`, fixed token line heights clipped glyphs and broke wrapping. Introduced `lineHeightFor` (token rhythm at scale 1, platform line height when scaled); re-validated: all sections reachable by scrolling at font scale 3.143, no clipping or overlap, `Primary action` tapped at AXXL and `Action count` reached 1.
   - Reduce Motion enabled through the Settings app (discovery-driven taps only); preview reports `Reduce motion: on`; state changes stayed immediate; Increase Contrast enabled the same way with a visual checkpoint capture; both settings restored and `Reduce motion: off` re-verified.
   - `debugger-log-registry`: 0 entries at every checkpoint. One reconnect was needed after the host network changed mid-session (dev server IP moved); the dev client reattached through the launcher, which is environmental, not authored-code behavior.
   - screenshot-diff harness: current vs the light-bottom candidate returned 0.46 percent mismatch in two explained regions (header back-button state differs by navigation entry; text antialiasing on one label). No unexplained region.
   - appearance and content size restored (light, large) after the checkpoint.
7. Deviations from the reference: none. Approved baselines (human approval 2026-08-30, see Approvals log): `.artifacts/argent/native-foundation/{light-top,light-bottom,dark-top,dark-bottom,light-fallback,axxl-interaction,increase-contrast-reduce-motion}.png`. Baseline images stay ignored by Git.
8. Commit and push: `fa1e443`, pushed to `origin/main`.

## T6 - foundation preview route

1. Task id: T6. Acceptance: `/foundation-preview` renders the seven ordered contract sections with labeled fixtures from deterministic data; `material=fallback` forces the fallback branch; `Action count` increments through the haptic path; production mode redirects to `/`; coverage stays at or above 90.
2. Author: Fable 5. Delegated agents: none.
3. Files changed: `src/app/(dev)/foundation-preview.tsx`, `src/foundation/validation/*` (fixtures, section wrapper, seven section components, screen), `src/foundation/haptics/index.ts`, `src/foundation/accessibility/use-reduced-motion.ts`, `src/testing/expo-ui.mock.tsx`, `jest.config.js` (mock mapping, testing-infrastructure coverage exclusion), `tests/native-foundation/foundation-preview.test.tsx`, `e2e/argent/native-foundation/foundation-preview-flow.md`.
4. Tests and static checks: TDD red recorded (6 failing), then green. 37/37 tests; coverage 97.1/93.1/93.0/100. Lint, typecheck, `git diff --check` pass.
5. GPT-5.6 Sol review: fail on first pass (tests under-asserted the contract), fail on second and third focused passes (role-name association, unrecorded risk). Remediated each: exhaustive token and role assertions, testID-pinned slider/picker pairing, risks recorded. Final pass on re-review.
6. Argent evidence (target `93EEF062-B4DC-4989-AF77-CF47EE2A9816`), interactive type:
   - `open-url habittracker://foundation-preview` renders the preview; `describe` exposes the title, `Material: liquid glass` (real glass on iOS 27), buttons `Primary action` and `Disabled action`, switch `Habit enabled` value 1 and `Disabled switch` value 0, slider group at 50 percent with `Intensity` label, picker button `Daily` with `Frequency` label, `Note` field, `Action count: 0`, and all four status lines.
   - tapped `Primary action` at discovery coordinates; `await-ui-element` confirmed `Action count: 1` (haptic path exercised on-device).
   - `debugger-log-registry`: 0 entries.
   - screenshots auto-captured with each interaction; full-resolution baselines happen in T7.
7. Deviations from the reference: none. Notable in-spec decisions: `@expo/ui` receives a reviewed behavior-focused Jest mock (`src/testing/expo-ui.mock.tsx`) because jest-expo ships none and the real package needs the native ObservableState runtime; test infrastructure under `src/testing/` is excluded from coverage as a reviewed exclusion; the accessibility section labels the forced-fallback state `Material mode:` so material status text stays unique per section. Accepted risks from review: the universal `@expo/ui` Slider and Picker expose no accessible-name prop, so their name association is the adjacent text label pinned by real testID props in tests and confirmed by the Argent describe evidence; Jest mocks cannot prove native Host rendering or the native accessibility tree, which rest on the Argent evidence in field 6 and the T7 device validation.
8. Commit and push: `41de0c3`, pushed to `origin/main`.
