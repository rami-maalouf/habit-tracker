# Capability Map: Ripples Rebuild

Status: Approved  
Approved: 2026-08-30

This initiative contains independently testable capabilities, so each module below will receive its own gated Specify -> Plan -> Tasks -> Implement cycle. Module ids are stable once this map is approved.

| Module id | Responsibility | Depends on |
| --- | --- | --- |
| `native-foundation` | Expo Router shell, native presentation policy, design tokens, accessibility conventions, seeded visual fixture, and Argent validation harness | none |
| `tracking-core` | Board and check-in domain records, logical dates, SQLite source of truth, transactions, migrations, commands, queries, and projection boundaries | none |
| `boards` | Boards home, board detail, seven-day strips, heatmap, quick check-ins, empty states, and core navigation | `native-foundation`, `tracking-core` |
| `board-configuration` | Create, edit, preview, symbols, colors, amount settings, time options, metric preferences, ordering, archive, restore, and delete policy | `boards` |
| `check-in-history` | Grouped check-in history, manual entry, amounts, dates, times, editing, and deletion | `boards` |
| `analytics` | Streak, consistency, timeline, current-month, weekday, year-comparison, and insufficient-data views | `boards` |
| `widgets` | Platform-neutral widget projection and action contract plus all iOS WidgetKit families and interactive quick check-ins | `boards` |
| `reminders` | Reminder editor, weekday and time rules, notification permission, local scheduling, rescheduling, disable, and delete behavior | `board-configuration` |
| `journal` | Chronological note timeline and note creation or editing through check-ins | `check-in-history` |
| `settings` | Grouped settings, notification status, support and legal links, alternate app icons, version information, and archived-board entry point | `native-foundation`, `reminders` |
| `data-export` | Complete offline export of boards, check-ins, notes, reminders, and settings through the native share sheet | `tracking-core`, `reminders`, `journal`, `settings` |
| `cloud-sync` | Private iCloud synchronization, deterministic conflict handling, reconciliation, and a provider-neutral sync boundary | `board-configuration`, `reminders`, `check-in-history`, `journal`, `settings` |
| `automations` | iOS Shortcuts and Siri commands for creating, removing, and querying check-ins through shared domain commands | `board-configuration`, `check-in-history` |
| `android-readiness` | Verify the shared core is platform-neutral and define Compose, Android notification, App Actions, and Glance adapter seams without shipping the Android UI in the iOS-first release | `board-configuration`, `reminders`, `check-in-history`, `journal`, `analytics`, `settings`, `data-export`, `widgets` |

## Dependency rules

- `native-foundation` owns the route, theme, native-surface, accessibility, and visual-validation contracts consumed by feature UI.
- `tracking-core` owns the data, command, query, calendar, transaction, and projection contracts consumed by every data-backed capability.
- A provider module defines its outgoing interface in its own spec. Consumers do not redefine it.
- No module may import a downstream module, create a second source of truth, or add a reverse dependency.
- Private screenshots inform module acceptance criteria but remain ignored by Git.

## Build order

1. Foundation in sequence: `native-foundation` -> `tracking-core`
2. Primary vertical slice: `boards`
3. Independent board capabilities in parallel: `board-configuration`, `check-in-history`, `analytics`, `widgets`
4. Dependent interactions in parallel: `reminders`, `journal`
5. Ownership and portability: `settings` -> `data-export` -> `android-readiness`
6. Product parity extensions in parallel: `cloud-sync`, `automations`

`native-foundation` runs first because every later implementation task requires an operational iOS simulator, an Argent checkpoint, and an independent verification pass. Both foundation modules must be implemented before `boards` begins.

## Execution protocol

- Fable 5 is the primary architect, code author, integration owner, and commit owner.
- GPT-5.6 Sol independently verifies every completed task against its approved spec and acceptance criteria.
- Argent must interact with the simulator after every task. Pixel-changing tasks also require a full-resolution screenshot comparison.
- A verifier cannot be the author of the same task. Separate agent instances must be used when the same model family fills both roles.
- Fable 5 may delegate bounded work to GPT-5.6 Sol, Sonnet, Opus 5, or Haiku 4.5. Every delegation declares file ownership, acceptance criteria, and the prohibition against reverting concurrent work.
- Fable 5 reviews and integrates all delegated output. Subagent completion is not task completion.
- A feature is committed with a lowercase conventional commit and pushed only after tests, independent review, and Argent validation pass.

## Approved Phase 0 decisions

1. The module boundaries and dependency directions in this map are approved.
2. `cloud-sync` and `automations` remain post-visual-release extensions.
3. `android-readiness` covers architecture and adapter verification, not a shipping Android UI in the iOS-first release.
4. `native-foundation` is the first module, followed by `tracking-core`.

Approval of this map authorizes Phase 1 for `native-foundation` only. It does not authorize specs for later modules, package changes, or application code.
