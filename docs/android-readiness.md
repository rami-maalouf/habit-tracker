# Android readiness

This release is iOS-first. Android ships **no Kotlin**: what exists here is the
shared contract surface, Android-safe stubs, and the fixture suite a future
Kotlin implementation has to satisfy. A later Android implementation may
replace only adapters and presentation - it may not fork product semantics.

## What is already portable

Everything under `src/core/` imports no iOS-only API. A test enforces it
(`tests/product/domain/android-readiness.test.ts`): the shared domain,
persistence contracts, calendar policy, analytics formulas, export schema,
notification model, widget projection, sync record model, and automation
command types are all free of `expo-notifications`, `expo-widgets`,
`@expo/ui`, `expo-sqlite`, `expo-file-system`, `react-native`, and any
CloudKit / WidgetKit / AppIntents reference.

Platform behavior enters only through ports:

| Port | iOS adapter | Android plan |
| --- | --- | --- |
| `ReminderScheduler` (`src/core/domain/ports.ts`) | `src/platform/notifications` (expo-notifications weekly triggers) | `AndroidReminderAdapter`: notification permission, channels, `AlarmManager`, reschedule on boot |
| Widget projection (`widget_board_rows`) | `src/platform/widgets` (expo-widgets timeline) | Android Glance AppWidget reading the same projection |
| `SyncTransport` (`src/core/sync/transport.ts`) | `src/platform/sync` (CloudKit, pending a signed build) | out of scope for this release |
| Automation contract (`src/core/automations/contract.ts`) | future iOS AppIntents executor | `shortcuts.xml` capabilities with deep-link or activity fulfillment |

## Android-safe stubs

`src/platform/android/adapters.ts` provides an explicit unavailable
implementation for each iOS-only adapter, so importing a route on Android
never evaluates iOS code:

- `androidReminderAdapter` reports `denied` authorization and zero capacity;
  `schedule` throws, and `cancel` is a deliberate no-op so the reminder
  reconciler stays quiet instead of erroring.
- `androidWidgetAdapter` accepts the same `WidgetRowProps` Glance would
  render; its quick action throws rather than recording a partial row.
- `androidAutomationAdapter` declares one capability id per shared command.
- `androidSyncTransport` throws a typed `SyncTransportError('unavailable')`.

Every stub carries a `readiness` field naming its planned implementation.

## The shared fixture suite

`src/core/automations/fixtures/intent-contract.json` is the single source of
truth for the three intents this release exposes (Check In, Remove Latest
Check-In, Get Today's Check-Ins). It is consumed verbatim by
`tests/product/domain/automations.test.ts` today, and is what the future iOS
AppIntents executor and Android App Actions executor must also pass.

Board ids in the fixture are **stable handles**, not literal row ids: each
executor seeds its own store and resolves handles to whatever ids that store
produced. The fixture pins the behavior that matters - default logical date,
`quickAmount` fallback, archived and unknown board rejection, future-date
rejection, latest-record selection, receipt replay recording exactly once,
and the rule that spoken results never carry note text.

## Explicitly not in this release

No Kotlin source, no generated `android/` edits, no Android widget receivers,
no `shortcuts.xml`, no emulator QA, and no shipping Android UI. The future UI
maps to Compose-native surfaces and Material semantic colors through the
foundation's Android component policy.
