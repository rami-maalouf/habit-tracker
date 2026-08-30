# Spec: Ripples Product

Spec id: ripples-product

Capability map: CAPABILITY-MAP.md

Prerequisite: SPEC-native-foundation.md

Covered module ids: tracking-core, boards, board-configuration, check-in-history, analytics, widgets, reminders, journal, settings, data-export, cloud-sync, automations, android-readiness

Status: Phase 1 complete - awaiting human approval for Fable 5 handoff

Date: 2026-08-30

## Resolved assumptions and decisions

1. Ripples is governed by exactly two implementation specifications: SPEC-native-foundation.md and this document. No additional per-module specification is required.
2. SPEC-native-foundation.md is implemented first. This document owns the complete remaining product and is implemented in the dependency order defined here.
3. Fable 5 remains the architect, implementation author, integration owner, planning owner, and commit owner. GPT-5.6 Sol remains the independent verifier. This specification session does not implement application code.
4. The release is iOS-first. It includes the complete iOS app, iOS Home Screen widgets, local reminders, private iCloud sync, App Intents for Shortcuts and Siri, and alternate app icons.
5. Android work in this specification proves platform-neutral core contracts and defines Compose, notification, App Actions, and Glance adapter seams. It does not ship an Android product UI.
6. SQLite in an iOS App Group is the sole local source of truth. Screens, widgets, reminders, analytics, export, sync, and automations use the same command, query, or projection contracts.
7. The private files under design/ripples-screenshots inform product and visual acceptance but remain ignored by Git. They are references, not assets to ship.
8. The reference screens establish the dark-mode visual direction. The native foundation remains authoritative for light mode, Dynamic Type, VoiceOver, Reduced Motion, Increase Contrast, safe areas, materials, and minimum touch targets.
9. Cloud sync and automations are delivered after the complete local visual product, but they are part of this specification and do not require later product specs.
10. The dependencies, iOS App Group, CloudKit container, Expo widget extension, and one local Expo native module described here are approved in principle. Exact SDK-compatible package versions are resolved during implementation.
11. Existing tasks/plan.md and tasks/todo.md belong to the Fable 5 handoff. This specification does not overwrite them. Fable 5 may expand or replace those planning artifacts after both specifications are approved.
12. The implementation decisions below intentionally resolve behavior that cannot be recovered from screenshots. A later implementation may not silently substitute a different product rule.

## Objective

Build Ripples as a private, local-first habit and activity tracker in which a person creates visual boards, records one or more check-ins, understands patterns without judgment, and can reach the same data through the app, widgets, reminders, iCloud, Shortcuts, and Siri.

The product should feel calm and immediate. A check-in must take one tap when the board's defaults are sufficient. Deeper entry, notes, history, and analytics remain available without turning the home screen into a dashboard.

### User outcomes

- Create, configure, reorder, archive, restore, and permanently delete boards.
- Record repeated check-ins quickly or enter their date, time, amount, and note manually.
- Read a seven-day strip, one-year heatmap, history, journal, streak, consistency, timeline, weekday, month, and year-comparison views.
- Schedule local reminders by weekday and wall-clock time.
- Use all supported iOS Home Screen widget sizes and check in from a widget.
- Export a complete offline snapshot through the native share sheet.
- Keep private data synchronized through the user's iCloud private database.
- Create, remove, and query check-ins through Shortcuts and Siri.
- Use the app in light or dark appearance, with assistive technologies and large text.
- Preserve a platform-neutral product core so a later Android UI can use Compose, Glance, Android notifications, and App Actions without rewriting domain behavior.

### In scope

- Every module listed in Covered module ids
- All product routes and native sheets shown by the private references
- Local persistence, migrations, typed commands, queries, and projections
- Deterministic calendar, check-in, analytics, archive, deletion, export, and sync semantics
- Local notification permissions and schedules
- iOS widgets and interactive widget actions
- Private CloudKit sync
- iOS App Intents, Shortcuts, and Siri
- Alternate app icons
- Android-safe exports and adapter contracts
- Unit, component, integration, migration, contract, visual, accessibility, device, and cross-feature acceptance

### Out of scope

- A shipping Android UI or Android store release
- Web product support
- Accounts, passwords, a custom backend, team sharing, or public social features
- Remote push notifications
- Import or restore from an export file
- Attachments, rich text, standalone journal entries, search, or tags
- Goals, scheduled habit frequencies, skipped days, rest days, penalties, scores shared between users, or gamification
- Apple Watch, watchOS complications, Live Activities, Lock Screen accessory widgets, macOS, iPad-specific navigation, or visionOS
- Subscription, purchase, onboarding paywall, telemetry, advertising, or growth analytics
- Automatic migration from another habit-tracking app
- Store submission and marketing production

## Product truth and domain invariants

### Source of truth

- The normalized SQLite database is the only local source of truth.
- The database is created in group.com.ramimaalouf.habittracker from its first production migration so the app and widget extension use one stable location.
- React state, widget timelines, scheduled notification identifiers, export files, CloudKit records, and App Intent entities are views or adapters. None becomes a second product database.
- Widgets read only a dedicated materialized widget projection stored in the shared database. They do not issue ad hoc queries against normalized tables.
- Every product mutation enters through a named command. UI event handlers and platform adapters do not write SQL directly.
- Every command validates inputs before beginning an exclusive transaction and returns a typed result.
- Retried commands with the same idempotency key produce one mutation and the original result.
- All user input in SQL uses bound parameters or prepared statements. Raw exec operations are limited to reviewed static migrations and PRAGMA statements.
- WAL and foreign keys are enabled. Multi-record writes use exclusive transactions so unrelated asynchronous queries cannot join the transaction.

### Identifiers and time

- BoardId, CheckInId, ReminderId, CommandId, and DeviceId are distinct branded UUIDv4 strings generated through expo-crypto.
- Persisted instants use UTC epoch milliseconds.
- A logical date is an ISO Gregorian calendar date in YYYY-MM-DD form.
- Week order is fixed to ISO Monday through Sunday across the app, reminders, analytics, exports, widgets, and tests. Locale changes formatting, not the underlying order.
- Every board owns a startOfDayMinute from 0 through 720 inclusive in 30-minute increments. Zero means midnight and 720 means noon.
- For an automatic check-in, logical time is the current local time in the current device time zone minus startOfDayMinute. Its resulting calendar date is stored permanently.
- Existing logical dates never change because the device later changes time zone, locale, daylight-saving offset, or the board's start-of-day setting.
- A timed check-in stores occurredAtUtc, timeZoneId, and offsetMinutes. An untimed check-in stores those fields as null and keeps only its explicit logical date.
- Manual entry cannot select a logical date after today under the selected board's current logical-day rule.
- Daylight-saving gaps resolve to the next valid local time. A repeated local time records the exact offset selected by the system picker. Tests cover both directions.

### Check-in semantics

- A board accepts zero or more check-ins per logical date.
- Each quick-check-in press creates one new check-in. It is not a daily on/off toggle.
- A non-amount board stores amount as null. Each check-in contributes one to all count-based visualizations and analytics.
- An amount board requires a finite amount greater than zero and no greater than 1,000,000,000, with no more than three decimal places.
- An amount board has an optional trimmed unit label of at most 20 characters and a quickAmount that follows the same numeric rules. New amount boards default quickAmount to 1.
- Quick check-in uses quickAmount when amount tracking is enabled.
- Turning amount tracking off retains historical amounts and the saved amount configuration. New check-ins store null until the setting is enabled again.
- Tracking exact time is off by default. Turning it off retains historical times but new check-ins are untimed.
- One check-in has at most one plain-text note. The note is trimmed, nullable, and limited to 10,000 Unicode code points. Empty text is stored as null.
- A successful quick action produces one success haptic and an accessible five-second Undo action. Undo removes only the check-in created by that action.
- Two intentional presses use different idempotency keys and create two records. A transport, widget, sync, or automation retry reuses one key and cannot duplicate a record.

### Completion and analytics semantics

- A completed logical day has at least one non-deleted check-in, regardless of amount.
- Heatmap intensity represents check-in count, not amount: zero is empty, one is low, two is medium, and three or more is high.
- Today is outlined. Future dates are unavailable and never counted as missed.
- Current streak counts consecutive completed logical days ending today when today is complete, otherwise ending yesterday so an unfinished current day does not break the streak early.
- Longest streak is the maximum consecutive completed-day run over the board's complete history.
- Consistency for a period is completed eligible days divided by elapsed eligible days, multiplied by 100. Every calendar day inside a board activity period is eligible. Dates before creation, inside an archived gap, after deletion, and in the future are excluded.
- Consistency bands are Low below 40 percent, Average from 40 through 74 percent, and High from 75 through 100 percent.
- The current week is Monday through the current logical day. The current month is the calendar month containing the current logical day.
- Weekday analytics use the rolling 365 logical days ending today. Workdays are Monday through Friday and weekends are Saturday and Sunday.
- Year comparison uses calendar months for the selected year and the immediately preceding year. Missing periods are zero, future months in the selected current year are unavailable, and leap day belongs to February.
- Count labels display integers. Percentages round half away from zero to the nearest whole percent. Raw values remain unrounded until presentation.
- Streak is available after the first completed day. Consistency and weekday analysis require seven elapsed eligible days. Year comparison renders the selected year immediately and explains when no prior-year data exists.
- Disabling performance metrics hides metrics cards and analytics entry points without deleting check-ins or derived data. Seven-day strips and heatmaps remain available.

### Archive and deletion

- Archiving a board sets archivedAt and keeps all product data.
- Creating a board opens its first activity period. Archiving closes the current period after the current logical date. Restoring opens a new period on the current logical date. Same-day close and reopen operations merge into one period.
- Closed activity periods break streaks. Archived gaps render unavailable rather than missed and never enter a consistency denominator.
- Archived boards are excluded from the active home, new check-in pickers, active widget projection, automation entity results, analytics entry points, and active reminder scheduling.
- Archived boards remain readable from Settings > Archived Boards and remain included in export and iCloud sync.
- Restoring a board clears archivedAt, places it at the end of active order, returns it to projections, and reschedules reminders whose enabled flag was preserved.
- Deleting a board is a user-visible permanent action with a destructive confirmation that states how many check-ins, notes, and reminders are affected.
- A confirmed board delete tombstones the board, its activity periods, check-ins, and reminders in one exclusive transaction, removes them from all user-facing projections, cancels notification schedules, and reloads widgets.
- Check-in deletion also creates a tombstone and immediately updates history, journal, analytics, heatmaps, widgets, export, and sync.
- Tombstones remain locally until their stripped remote tombstones are confirmed. Confirmed local tombstones may be purged after 90 days; remote tombstones remain so an old offline device cannot resurrect deleted data.
- Exports omit tombstones and internal sync metadata.
- There is no user-visible recently deleted area and no restore after the confirmation completes.

## Data model

### Board

| Field | Contract |
| --- | --- |
| id | Branded BoardId, stable UUIDv4 |
| title | Trimmed, 1 through 80 Unicode code points |
| symbol | Allowlisted SF Symbol semantic name with a platform fallback |
| accentHex | Uppercase #RRGGBB |
| usesTintedBackground | Boolean |
| tracksAmount | Boolean |
| amountUnit | Nullable trimmed string, maximum 20 code points |
| quickAmount | Positive number with at most three decimal places |
| tracksTime | Boolean |
| startOfDayMinute | 0 through 720 in 30-minute increments |
| metricsEnabled | Boolean, default true |
| orderKey | Stable sortable text key with BoardId as tie-breaker |
| archivedAt | Nullable UTC epoch milliseconds |
| createdAt, updatedAt | UTC epoch milliseconds |
| mutationStamp | Hybrid logical clock stamp |
| deletedAt | Nullable tombstone instant |

The initial color palette is Graphite #8E8E93, White #F2F2F7, Green #78D98B, Purple #8F82FF, Pink #E58BA6, Blue #70A7FF, and a custom color picker. The renderer derives accessible foreground and fill variants instead of trusting the raw accent to provide contrast.

The symbol row opens a searchable picker over this exact initial allowlist:

- calendar, star.fill, carrot.fill, bed.double.fill, iphone.slash, play.rectangle.fill, pills.fill, and checkmark.circle.fill
- figure.walk, figure.run, bicycle, dumbbell.fill, heart.fill, brain.head.profile, leaf.fill, drop.fill, and flame.fill
- book.fill, pencil, paintbrush.fill, music.note, cup.and.saucer.fill, fork.knife, takeoutbag.and.cup.and.straw.fill, and moon.stars.fill
- sun.max.fill, alarm.fill, timer, desktopcomputer, phone.fill, person.2.fill, and pawprint.fill

The allowlist is versioned product data. Unsupported symbol names use a deterministic circle fallback and fail development validation.

### CheckIn

| Field | Contract |
| --- | --- |
| id | Branded CheckInId, stable UUIDv4 |
| boardId | Required live or archived BoardId |
| logicalDate | Stored YYYY-MM-DD |
| occurredAtUtc | Nullable exact instant |
| timeZoneId | Nullable IANA time-zone id |
| offsetMinutes | Nullable signed offset for the selected instant |
| amount | Nullable validated amount |
| note | Nullable plain text, maximum 10,000 code points |
| source | app, widget, shortcut, siri, or sync |
| idempotencyKey | Unique CommandId |
| createdAt, updatedAt | UTC epoch milliseconds |
| mutationStamp | Hybrid logical clock stamp |
| deletedAt | Nullable tombstone instant |

### Reminder

| Field | Contract |
| --- | --- |
| id | Branded ReminderId, stable UUIDv4 |
| boardId | Required BoardId |
| weekdaysMask | Nonzero seven-bit ISO Monday-through-Sunday mask |
| minuteOfDay | 0 through 1439 |
| message | Nullable trimmed string, maximum 180 code points |
| enabled | Boolean |
| nativeIdentifiers | Adapter-owned list of scheduled identifiers |
| scheduleState | idle, pending, scheduled, denied, or error |
| lastScheduleError | Nullable typed adapter code, never a raw secret |
| createdAt, updatedAt | UTC epoch milliseconds |
| mutationStamp | Hybrid logical clock stamp |
| deletedAt | Nullable tombstone instant |

A board can own multiple reminders. The scheduler validates the native pending-request capacity before saving a schedule. The UI never silently drops selected weekdays to fit a platform limit.

### AppSettings

One singleton record contains:

- schema and app-settings revision
- selectedIcon: default, midnight, or paper
- iCloudSyncEnabled, default false
- metricsEducationDismissed board ids
- support and legal configuration revision
- deviceId and hybrid logical clock state
- last successful sync metadata

Notification authorization is read from the operating system and is not copied into AppSettings as authoritative state.

### Supporting tables

- schema_migrations records every applied migration and checksum.
- board_activity_periods stores BoardId, inclusive start date, nullable inclusive end date, mutation stamp, and tombstone state.
- reminder_schedule stores one native identifier per reminder weekday.
- widget_board_rows stores the complete ordered widget projection.
- mutation_outbox records unsynchronized entity changes.
- sync_state stores CloudKit tokens, zone state, retry state, and last success.
- command_receipts stores idempotency keys and serialized command outcomes.

Migrations use PRAGMA user_version plus schema_migrations. Each version runs exactly once inside an exclusive transaction, is checksum-tested, and can open fixtures from every previously released schema.

## Public domain interfaces

The product core exposes commands and queries through narrow interfaces. Feature screens depend on these interfaces, not on SQLite, Expo modules, CloudKit, or notification APIs.

~~~ts
type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type BoardId = Brand<string, 'BoardId'>;
export type CheckInId = Brand<string, 'CheckInId'>;
export type CommandId = Brand<string, 'CommandId'>;
export type LogicalDate = Brand<string, 'LogicalDate'>;

export type DomainErrorCode =
  | 'validation'
  | 'not_found'
  | 'archived'
  | 'conflict'
  | 'permission_denied'
  | 'capacity'
  | 'unavailable'
  | 'database'
  | 'migration'
  | 'export'
  | 'sync'
  | 'platform';

export type DomainResult<Value> =
  | { ok: true; value: Value }
  | {
      ok: false;
      error: {
        code: DomainErrorCode;
        message: string;
        field?: string;
        retryable: boolean;
      };
    };

export interface CheckInCommands {
  create(input: {
    commandId: CommandId;
    boardId: BoardId;
    logicalDate?: LogicalDate;
    occurredAtUtc?: number;
    amount?: number;
    note?: string;
    source: 'app' | 'widget' | 'shortcut' | 'siri';
  }): Promise<DomainResult<{ checkInId: CheckInId }>>;

  update(input: {
    commandId: CommandId;
    checkInId: CheckInId;
    expectedMutationStamp: string;
    logicalDate: LogicalDate;
    occurredAtUtc?: number;
    amount?: number;
    note?: string;
  }): Promise<DomainResult<{ mutationStamp: string }>>;

  remove(input: {
    commandId: CommandId;
    checkInId: CheckInId;
    expectedMutationStamp?: string;
  }): Promise<DomainResult<void>>;
}
~~~

### Required commands

- createBoard
- updateBoard
- reorderBoard
- archiveBoard
- restoreBoard
- deleteBoard
- createCheckIn
- updateCheckIn
- removeCheckIn
- undoCreatedCheckIn
- createReminder
- updateReminder
- setReminderEnabled
- deleteReminder
- reconcileReminderSchedules
- setSelectedIcon
- setICloudSyncEnabled
- exportSnapshot
- reconcileCloudChanges

### Required queries

- listActiveBoards
- listArchivedBoards
- getBoard
- getHomeBoardProjection
- getSevenDayStrip
- getBoardHeatmap
- getGroupedCheckInHistory
- getJournalTimeline
- getBoardSummary
- getTimelineAnalytics
- getWeekdayAnalytics
- getYearComparison
- getConsistencyAnalytics
- getStreakAnalytics
- listBoardReminders
- getNotificationStatus
- getWidgetProjection
- getExportSnapshot
- getSyncStatus
- listAutomationBoards
- getAutomationCheckIns

### Shared ports

- Clock supplies the current instant.
- CalendarPolicy resolves logical dates and day boundaries.
- IdGenerator creates branded UUIDs.
- Database executes migrations, exclusive transactions, repositories, and consistent snapshots.
- NotificationAdapter requests permission and schedules, cancels, inspects, and reconciles local notifications.
- WidgetAdapter reloads timelines and exposes widget-action results.
- SyncAdapter fetches and saves provider-neutral records and server tokens.
- AutomationAdapter maps App Intent parameters and results to the approved command contract.
- AlternateIconAdapter reports support and changes the selected icon.
- ShareAdapter presents a local export file.
- ProductLinks supplies validated release URLs.

All ports have deterministic fakes. Platform errors are translated once at the adapter boundary.

## Product requirements by capability

### Boards home

- The root route is the Boards home shown by design/ripples-screenshots/1-home.png.
- The native stack title is Boards. A leading overflow control opens Settings and a trailing add control opens Create Board.
- Active boards render in deterministic order in a virtualized list.
- Each board card shows its symbol, title, accessible full title, derived tint, seven logical days ending today, and a circular quick-check-in action.
- Visible truncation uses one line and an ellipsis. VoiceOver reads the complete title.
- A successful quick check-in updates the card, heatmap, metrics, history, widget projection, sync outbox, and Undo state from one committed transaction.
- While a quick command is pending, only that board's action is disabled. A failure restores the previous presentation and exposes a retryable message.
- Empty state copy explains boards in one sentence and offers Create Board as the primary action.
- Loading never displays fake fixture data. Migration and database failures show a recovery surface and never create a replacement database.
- Board reordering is available from an Edit Boards mode. Move Up and Move Down actions are always available to assistive technology even if a drag interaction is added.

### Board detail

- Selecting a board opens /boards/[boardId].
- The header provides Back and Edit. The body shows the title, rolling heatmap, metrics education or metrics cards, and the reference bottom actions for Analytics, Check-Ins, Journal, and Add Check-In.
- The heatmap shows the rolling 365 logical days ending today in ISO Monday-through-Sunday rows. Horizontal navigation exposes older years without loading all history at once.
- Every cell has a text alternative containing date and check-in count. Color is not the only state signal.
- Board summary includes Current Streak, Longest Streak, Consistency, Current Month, Current Week, and a compact daily-count chart.
- The metrics education card is shown until seven eligible days exist or the person dismisses it. It includes the reference action Look at example boards, which opens a local, read-only explanation rather than creating fixture data.
- If metricsEnabled is false, metrics cards and Analytics are replaced by an explanation and Enable Metrics action.
- Archived detail is read-only except for Restore and Delete Board.
- Missing or deleted board ids show a recovery route back to Boards.

### Board creation and configuration

- Create Board and Edit Board use native form-sheet presentation and the visual structure in screenshots 3 through 5.
- The top controls cancel without mutation and save only after all visible errors are resolved.
- A live preview uses the same board-card and heatmap renderers as saved data.
- Required controls are Symbol, Name, Color, Tinted Background, Track Amounts, Add Reminder, and Options.
- Enabling Track Amounts reveals Unit and Quick Check-In Amount. Unit is optional; quick amount is required.
- Options contains Track Check-In Time, Start of Day Shift, and Track Performance Metrics.
- Start of Day Shift presents a native time value and a slider from 12:00 AM through 12:00 PM in 30-minute steps. It explains that check-ins before the chosen time belong to the previous logical day.
- Saving a new board places it last in active order.
- Editing a board uses optimistic concurrency through expectedMutationStamp. A stale edit reloads the current record and asks the user to review changes.
- Add Reminder opens the reminder editor without discarding unsaved board values. For a new board, the board and reminder are committed together only after both validate.
- Archive Board is unavailable for unsaved boards and requires confirmation.
- Delete Board is destructive, names dependent record counts, and follows the tombstone policy.
- No limit on board count is imposed by product logic. Lists must remain responsive with at least 1,000 boards in automated performance fixtures.

### Check-in history and entry

- Check-Ins opens as a native scrolling sheet matching screenshots 10 and 11.
- History is grouped by month and logical date, newest first. Month and date count badges contain non-deleted records.
- Rows show symbol, full accessible board title, amount and unit when present, exact local time when tracked, note indicator, and completion state.
- Stable ordering within one date is occurredAtUtc descending when present, then createdAt descending, then CheckInId.
- The add control opens Add Check-In with board, Date, conditional Time, conditional Amount and Unit, and Note.
- From board detail the board is fixed. A future global entry point may select an active board, but it is not required here.
- Date defaults to the board's current logical date. Time defaults to now for today and noon in the selected time zone for a historical date.
- Amount defaults to quickAmount.
- Selecting a row opens Edit Check-In with the same fields and a Delete Check-In action.
- Edit preserves CheckInId, source, and createdAt while changing updatedAt and mutationStamp.
- Delete requires a destructive confirmation and offers no post-confirmation restore.
- Histories use SectionList or another genuinely virtualized list. A native list that eagerly creates every React row is prohibited.

### Analytics

- Analytics opens as a native scrolling sheet with a persistent title and drag indicator.
- It reproduces the content hierarchy in screenshots 7 through 9: Timeline, Weekdays, Year Comparison, Consistency, and Streaks.
- Timeline selects a year and plots total monthly check-in counts.
- Weekdays displays rolling-365-day workday and weekend percentages plus Monday-through-Sunday counts and prior-period direction.
- Direction compares the latest 182 elapsed days with the preceding 183 elapsed days. Equal values show a neutral indicator.
- Year Comparison displays the selected year's monthly counts against the previous year with a clear legend.
- Consistency displays the prior 12 calendar months and the approved Low, Average, and High bands.
- Streaks displays streak spans over the prior 12 months and labels the all-time longest streak.
- Charts are rendered with react-native-svg and semantic theme tokens. No general charting package is added.
- Every chart is followed by a selectable text summary containing the same values and is navigable as one accessible image with a concise label.
- Charts never rely on gesture-only tooltips. Optional selection must also work through accessible controls.
- Empty and insufficient-data cards explain the threshold and preserve layout without invented data.
- Analytics recompute after create, edit, delete, archive, restore, sync, widget, and automation mutations.

### Reminders and notifications

- Add Reminder uses the bottom-sheet structure in screenshot 6.
- Weekday chips are ordered Monday through Sunday. At least one is required.
- Time uses the native time picker. Message is optional; the default body is Check in to [board title].
- Saving the first enabled reminder is the just-in-time point for notification permission.
- If permission is denied, the validated reminder is preserved disabled with scheduleState denied. The UI explains how to open system settings and does not repeatedly prompt.
- If permission is granted, each selected weekday receives one repeating local calendar schedule at the chosen wall-clock time.
- Wall-clock time remains the same after a time-zone change. The reconciler reruns on cold start, foreground, significant time change, permission change, board archive or restore, and reminder mutation.
- During daylight-saving transitions, the platform's next valid occurrence is accepted and a repeated time fires once.
- Editing a reminder validates capacity and schedules replacements before obsolete identifiers are cancelled. If replacement fails, newly created requests are cancelled and the previous schedule remains.
- Disabling preserves weekday, time, and message but cancels future requests.
- Deleting tombstones the reminder and cancels requests.
- Archiving suspends schedules without clearing enabled. Restore reschedules them.
- Notification taps deep-link to the relevant board and Add Check-In sheet.
- The app uses local notifications only. No push token is requested and no notification data leaves the device.
- Settings > Notifications shows current authorization, enabled reminder count, schedule errors, and an Open Settings action when needed.

### Journal

- Journal is board-scoped and opens from Board Detail.
- It is a reverse-chronological, virtualized timeline of check-ins whose note is non-null.
- Each item shows logical date, exact time when tracked, amount when present, and selectable note text.
- Selecting an item opens Edit Check-In. Journal does not create a separate note entity.
- Adding a note happens through Add Check-In or Edit Check-In.
- Clearing a note removes the row from Journal but not the check-in.
- Archived boards retain a read-only journal.
- Empty state offers Add Check-In when the board is active.

### Settings and archived boards

- Settings uses the grouped native sheet structure in screenshot 12.
- The first row is Notifications.
- A Data section adds iCloud Sync and Archived Boards without displacing the reference groups.
- Support and Feedback contains Request Feature or Report Issue and Rate Ripples in App Store.
- More Products by Us is a separate row.
- Utilities contains Export Data and App Icon.
- App Information contains Timeline, Privacy Policy, Terms of Use, and Version [version] ([build]).
- Timeline is a release-notes destination. It is not the board Journal.
- Version and build come from expo-application.
- Rate Ripples opens the configured App Store review URL. It does not call an in-app review prompt directly from the button.
- Product links are validated HTTPS values from release configuration. A development build shows an explicit Missing release link message. Production validation fails if any required URL or App Store id is absent.
- App Icon offers Default, Midnight, and Paper previews. Selection uses the approved native alternate-icon adapter and persists only after the platform confirms success.
- Archived Boards lists archived records newest first and allows Read, Restore, or Delete.
- External-link failures remain on Settings and show a recoverable message.
- No reset-all-data action is part of this release.

### Offline data export

- Export Data generates one UTF-8 JSON file named ripples-export-YYYY-MM-DDTHH-mm-ssZ.json in the cache directory and presents it through the native share sheet.
- The top-level format is ripples.export with exportVersion 1, databaseSchemaVersion, appVersion, buildVersion, exportedAtUtc, locale, timeZone, boards, checkIns, reminders, and settings.
- Export uses one read transaction so references and counts form a consistent snapshot while the app remains usable.
- Active and archived boards are included with their activity periods. Deleted records, tombstones, native notification identifiers, command receipts, device ids, CloudKit tokens, mutation outbox rows, and internal error text are excluded.
- Reminder rules and enabled state are included even when permission is denied. Notes and historical amount or time values are included.
- The confirmation explains that the file can contain private notes.
- Generation works offline. Cancelling the share sheet is success with no product mutation.
- Temporary files are deleted after successful handoff or on the next launch cleanup.
- Import is not implemented.

### iOS Home Screen widgets

- expo-widgets supplies the widget target and TypeScript/Expo UI layout. It requires the development client and a new native build.
- The extension bundle id uses com.ramimaalouf.habittracker.ExpoWidgetsTarget unless Expo's generated target requires the equivalent documented casing.
- The App Group is group.com.ramimaalouf.habittracker.
- Supported Home Screen families are systemSmall, systemMedium, systemLarge, and systemExtraLarge where the OS exposes them. Lock Screen accessory families and Live Activities are excluded.
- Small shows one active board. Medium shows up to three. Large shows up to seven and matches screenshot 13. Extra Large shows up to twelve in two balanced columns.
- Boards follow active home order. There is no per-widget board configuration in this release.
- Each row shows symbol, truncated visual title, full accessibility title, seven-day strip, and quick-check-in action.
- Tapping the title deep-links to Board Detail. The quick action creates a check-in without opening the app when the platform permits.
- Interactive actions use an App Intent in the local native module. The native executor implements the same QuickCheckInCommand contract, database transaction, validation fixtures, idempotency receipt, widget projection update, and sync outbox behavior as the application executor.
- If the native action cannot safely execute, it returns an actionable failure and deep-links to Add Check-In. It never records an unvalidated partial row.
- A successful action reloads the widget timeline and shows the changed seven-day strip.
- The widget reads widget_board_rows only. All app, sync, and native action writes refresh that projection transactionally.
- Timeline entries cover the next logical-day boundary. WidgetKit controls exact refresh timing, so stale data keeps the last valid snapshot and an accessibility label indicates that the app should be opened to refresh.
- Empty state says Open Ripples to create your first board and deep-links to Create Board.
- Archived or deleted boards disappear on the next reload.

### Private iCloud sync

- Cloud sync is implemented with Apple's CloudKit private database. No custom backend or public database is introduced.
- The container id is iCloud.com.ramimaalouf.habittracker unless the Apple Developer account requires an approved equivalent.
- Sync is off by default and is enabled from Settings after explaining that data is stored in the user's private iCloud account.
- Local use never depends on network or iCloud availability.
- The first enable creates a custom private zone, uploads the local outbox, fetches remote changes, and reconciles both directions.
- Boards, board activity periods, check-ins, reminders, and metrics-education dismissal state are separate provider-neutral records. Selected icon, sync-enabled state, native schedule identifiers, widget rows, command receipts, device id, and product-link configuration never sync.
- Each record carries schema version, entity id, field data, tombstone state, and a hybrid logical clock mutation stamp containing wall time, logical counter, and device id. Board activity periods sync as first-class records.
- The local clock observes every remote stamp. Conflict comparison is lexicographic by wall time, logical counter, then device id.
- Concurrent edits to different records merge naturally. Concurrent edits to the same record use the greatest mutation stamp for the complete record. Notes are whole-field values and are not character-merged.
- Stable ids and idempotency receipts prevent duplicate check-ins. A create and delete conflict resolves through the later mutation stamp, including tombstones.
- Board order uses orderKey with BoardId tie-breaking. After reconciliation, order may be compacted in one explicit local mutation without changing visible order.
- CloudKit change tokens are persisted only after all fetched records commit locally.
- Upload is idempotent. Retry uses bounded exponential backoff with jitter and does not block local commands.
- Sync status is Idle, Syncing, Up to Date, Offline, Signed Out, or Needs Attention. Raw CloudKit errors and account data are never shown or logged.
- Signing out or disabling sync suspends network work and retains the complete local database. Re-enabling reconciles again.
- A remote tombstone strips user content and remains in CloudKit indefinitely so a device returning after a long offline period cannot resurrect deleted data. A local tombstone may be purged 90 days after its remote tombstone is confirmed.
- Destructive reset of CloudKit or local data is not included.
- The SyncAdapter has a deterministic in-memory fake for conflict, retry, token, tombstone, and out-of-order delivery tests.
- Completion requires a signed Apple build and a two-device or two-simulator sandbox check showing create, edit, archive, delete, offline mutation, reconnection, and conflict convergence.

### Shortcuts and Siri

- Apple's AppIntents framework is implemented in the local iOS native module. Expo SDK 57 has no complete JavaScript-only App Intents layer.
- The release exposes exactly three intents: Check In, Remove Latest Check-In, and Get Today's Check-Ins.
- Check In accepts Board, optional Date, optional Time, optional Amount, and optional Note. Date defaults to the board's current logical date. Omitted amount uses quickAmount.
- Remove Latest Check-In accepts Board and optional Date, identifies the latest record using the history ordering rule, asks for confirmation, and returns Not Found without mutation when none exists.
- Get Today's Check-Ins accepts an optional Board and returns counts plus board names for the current logical date.
- Board is an AppEntity backed by active boards only and sorted by active order. Archived or deleted boards fail with an actionable result.
- Intents use the same shared database, idempotency, validation, mutation stamp, widget projection, and sync outbox contracts as the app.
- The native intent executor and TypeScript executor pass one shared JSON contract-fixture suite.
- Intent results are concise, localizable, and never expose notes unless the user explicitly asked for a query that includes them. This release's query does not include note text.
- English intent titles, parameter labels, and result copy ship first. The code is localization-ready and contains no string-built SQL or board ids in spoken copy.
- Shortcuts can run without opening the main app when the system allows. A database, account, or migration problem returns an error and does not silently open or reset the app.

### Android readiness

- Shared domain, persistence contracts, calendar policy, analytics formulas, export schema, notification model, widget projection, sync record model, and automation command types import no iOS-only API.
- Android production JavaScript and asset export succeeds.
- Platform entry points resolve Android-safe implementations or explicit unavailable adapters. Importing a route on Android must not evaluate CloudKit, WidgetKit, AppIntents, SwiftUI, or UIKit code.
- The future UI mapping uses Compose-native surfaces and Material semantic colors through the foundation's Android component policy.
- AndroidReminderAdapter maps the same reminder model to Android notification permission, channels, alarms, and rescheduling without changing core records.
- Android Glance consumes the same widget projection and command contract. Glance is Kotlin-native and remains a future native implementation, not an Expo widget fallback.
- Android App Actions maps shortcuts.xml capabilities and deep-link or activity fulfillment to shared commands. It remains a future native implementation.
- This release includes interface definitions, Android-safe stubs, contract fixtures, and an architecture note. It does not add Kotlin source, generated android/ edits, Android widget receivers, shortcuts.xml, emulator QA, or a shipping Android UI.
- A later Android implementation may replace only adapters and presentation. It may not fork product semantics.

## Navigation and presentation

### Required routes

~~~text
/
/boards/new
/boards/[boardId]
/boards/[boardId]/edit
/boards/[boardId]/options
/boards/[boardId]/analytics
/boards/[boardId]/check-ins
/boards/[boardId]/check-ins/new
/boards/[boardId]/check-ins/[checkInId]
/boards/[boardId]/journal
/boards/[boardId]/reminders/new
/boards/[boardId]/reminders/[reminderId]
/settings
/settings/notifications
/settings/archived
/settings/icons
/settings/sync
/settings/export
~~~

- Expo Router owns every navigation transition and deep link.
- Analytics, Check-Ins, Add Check-In, Journal, Settings, reminder editing, and other reference overlays use native stack formSheet presentation where supported.
- Routes parse and validate branded ids before calling queries.
- Invalid ids, missing entities, migration failures, and unavailable platform features have explicit recovery states.
- Native sheets preserve drag indicators, scrolling, detents, keyboard avoidance, and dismissal confirmation when unsaved changes exist.
- The system Back gesture and VoiceOver escape gesture remain functional.
- Quick actions never depend on navigation to complete.

## Visual reference contract

| Reference | Required implementation evidence |
| --- | --- |
| 1-home.png | Boards header, ordered tinted cards, seven-day strips, truncation, quick actions |
| 2-habit-main-page.png | Board detail, rolling heatmap, metrics education, summary cards, bottom actions |
| 3-edit-button-clicked.png | Edit preview, symbol, name, palette, tint, amount toggle, reminder entry |
| 4-scrolled-down.png | Options entry, archive, delete, scroll behavior |
| 5-options-clicked.png | exact-time toggle, start-of-day shift, metrics toggle |
| 6-add-reminder-clicked.png | weekday chips, time, custom message, native sheet actions |
| 7 through 9 analytics | analytics hierarchy, scrolling header, charts, empty and sparse data |
| 10-check-in-bottom-sheet.png | grouped virtualized history and count badges |
| 11-create-new-checkin.png | add sheet, fixed board, date, note, conditional fields |
| 12-settings-bottom-sheet.png | grouped settings, links, utilities, app information, footer |
| 13-widgets.png | large List widget, seven board rows, strips, quick actions |

- Reference status-bar time, battery, fixture date, and Dynamic Island contents are not parity targets.
- The implementation uses deterministic seed data reproducing the seven reference board names and August 2026 activity only in development and visual tests.
- Seed data is never inserted into a normal user's database.
- Dark-mode geometry, grouping, hierarchy, corner language, tinting, materials, and information density should match the references.
- Light mode derives from the native foundation and receives its own approved baseline.
- Exact pixel values are finalized through full-resolution simulator comparison after structural behavior is correct.

## Tech stack

### Existing prerequisite stack

SPEC-native-foundation.md remains authoritative for Expo 57, Expo Router, React Native, TypeScript, Bun, native UI, materials, theme, accessibility, testing, development client, and Argent.

### Approved product dependencies

Versions are references from SDK 57 documentation. Expo Install resolves the exact compatible versions.

| Package or platform | SDK 57 reference | Purpose |
| --- | --- | --- |
| expo-sqlite | ~57.0.2 | Shared persistent database, migrations, prepared statements, exclusive transactions |
| expo-notifications | ~57.0.15 | Local permissions, schedules, cancellation, and reconciliation |
| expo-file-system | Expo-resolved SDK 57 | App Group path, export files, and cleanup |
| expo-sharing | ~57.0.16 | Native export share sheet |
| expo-crypto | ~57.0.2 | UUIDv4 ids |
| expo-localization | ~57.0.1 | Locale, calendar, time-zone, and clock-format inputs |
| expo-application | ~57.0.2 | Version and build information |
| expo-widgets | ~57.0.15 | iOS widget extension and Expo UI widget layouts |
| react-native-svg | 15.15.4 | Accessible bespoke charts |
| expo-web-browser | existing SDK 57 dependency | Validated support and legal destinations |
| expo-linking | existing SDK 57 dependency | Deep links from notifications, widgets, and platform actions |
| expo-symbols | existing SDK 57 dependency | SF Symbol rendering in app surfaces |
| CloudKit | Apple SDK | Private iCloud record synchronization |
| AppIntents and WidgetKit | Apple SDK | Shortcuts, Siri, and interactive widget actions |

expo-store-review is intentionally not required. The visible Rate Ripples action opens the configured App Store review destination because Apple advises against invoking the in-app review prompt directly from a button.

No ORM, state management framework, charting framework, date library, bottom-sheet package, networking client, or cloud backend SDK is approved. Typed repositories and built-in Intl date formatting are sufficient.

### Native extension boundary

- modules/ripples-apple is the only approved custom local Expo module.
- It owns CloudKit, AppIntents, alternate icon calls, native command execution used outside the React Native process, and the config plugin changes those capabilities require.
- expo-widgets owns widget layout and widget target generation.
- The local module may share Swift support code with the generated widget extension through its config plugin, but generated ios/ files remain uncommitted.
- All native command behavior is tested against versioned JSON contract fixtures also consumed by TypeScript tests.
- Direct native code is limited to capabilities that cannot execute safely in JavaScript because the app process is absent.

## Setup and commands

### Product dependency installation after plan approval

~~~bash
bunx expo install expo-sqlite expo-notifications expo-file-system expo-sharing
bunx expo install expo-crypto expo-localization expo-application expo-widgets react-native-svg
bunx create-expo-module@latest --local modules/ripples-apple
~~~

The local-module scaffold command is run only in the approved implementation task. Fable 5 reviews generated files before they enter source control.

### Development and validation

~~~bash
bun install
bun run start
bunx expo start --dev-client --clear
bunx expo run:ios --device "iPhone 16 Pro"
bunx expo export --platform ios --output-dir dist-validation/ios
bunx expo export --platform android --output-dir dist-validation/android
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run validate
bunx expo-doctor
git diff --check
~~~

### Required focused scripts

~~~json
{
  "scripts": {
    "test:domain": "jest --runInBand tests/product/domain",
    "test:migrations": "jest --runInBand tests/product/migrations",
    "test:contracts": "jest --runInBand tests/product/contracts",
    "test:features": "jest --runInBand tests/product/features",
    "test:sync": "jest --runInBand tests/product/sync"
  }
}
~~~

Foundation scripts remain unchanged. Product scripts supplement rather than replace bun run validate.

### Native configuration

- app.json configures expo-sqlite, expo-notifications, expo-localization, expo-widgets, the App Group entitlement, iCloud and CloudKit entitlements, the CloudKit container, alternate icon assets, and the local module config plugin.
- Generated ios/ and android/ directories remain ignored. CNG or Expo prebuild regenerates native projects.
- Every entitlement or extension change requires a new development build.
- CloudKit capability validation requires an Apple Developer team and a signed build.
- Support URLs, legal URLs, release-notes URL, more-products URL, feedback URL, and App Store id are release configuration, not hardcoded inside components.

## Project structure

~~~text
src/
  app/
    _layout.tsx
    index.tsx
    boards/
      new.tsx
      [boardId]/
        index.tsx
        edit.tsx
        options.tsx
        analytics.tsx
        check-ins/
          index.tsx
          new.tsx
          [checkInId].tsx
        journal.tsx
        reminders/
          new.tsx
          [reminderId].tsx
    settings/
      index.tsx
      notifications.tsx
      archived.tsx
      icons.tsx
      sync.tsx
      export.tsx
  core/
    domain/
      ids.ts
      result.ts
      entities.ts
      validation.ts
      commands.ts
      queries.ts
      ports.ts
    calendar/
      logical-date.ts
      periods.ts
    analytics/
      streaks.ts
      consistency.ts
      timeline.ts
      weekdays.ts
      year-comparison.ts
    persistence/
      database.ts
      schema.ts
      migrations/
      repositories/
      projections/
    sync/
      records.ts
      hybrid-clock.ts
      reconcile.ts
    export/
      schema.ts
      serialize.ts
  features/
    boards/
    board-configuration/
    check-in-history/
    analytics/
    reminders/
    journal/
    settings/
    data-export/
  platform/
    database/
    notifications/
    widgets/
    sync/
    automations/
    alternate-icons/
    product-links/
  widgets/
    list-widget.tsx
    projections.ts
    deep-links.ts
  testing/
    fixtures/
      reference-august-2026.ts
    contract-fixtures/
modules/
  ripples-apple/
    ios/
    plugin/
tests/
  product/
    domain/
    migrations/
    contracts/
    features/
    sync/
    integration/
e2e/
  argent/
    product/
docs/
  architecture/
    android-readiness.md
~~~

### Structure rules

- src/app contains route composition only.
- src/core has no React, React Native, Expo Router, Expo module, UIKit, SwiftUI, Android, or Compose imports. Its persistence directory depends on an abstract database interface.
- src/features owns feature presentation and view-model composition.
- src/platform is the TypeScript adapter boundary. platform/database is the only TypeScript location that imports expo-sqlite.
- modules/ripples-apple is isolated native implementation, not a location for React views or duplicated product state.
- Cross-feature imports go through core interfaces or a feature's explicit public index.
- Feature components never import another feature's private files.
- SQL migrations are append-only after release and never rewritten.
- Product exportVersion and database schema version advance independently.

## Code style

- File names use kebab-case. React components and types use PascalCase. Functions, hooks, fields, and values use camelCase.
- Route files use default exports because Expo Router requires them. All other authored modules prefer named exports.
- Comments are lowercase and explain a non-obvious constraint or decision instead of narrating the code.
- Strict TypeScript remains enabled. Domain and adapter boundaries declare explicit input and return types.
- any, unchecked type assertions, non-null assertions, and disabled lint rules require a narrow documented reason.
- Branded ids, LogicalDate, UTC instants, local wall-clock minutes, and mutation stamps are not interchangeable string or number aliases.
- Expected domain, permission, capacity, sync, and platform failures use DomainResult. Exceptions are reserved for programmer errors and infrastructure failures that cannot be represented safely.
- Switches over entities, commands, error codes, widget families, sync states, and intent types are exhaustive.
- SQL lives in migrations or repositories. Components, hooks, routes, widgets, and native intent parameter mapping contain no SQL strings.
- Analytics functions are pure. Formatting, localization, colors, labels, and chart geometry remain outside formula modules.
- Platform-specific imports stay in platform-specific files or the approved native module.
- Public feature indexes expose only the contracts another feature is allowed to consume.
- User-visible strings are centralized by feature and localization-ready. Error logs use safe codes and never interpolate user records.
- Tests assert behavior and accessible output. Snapshot-only coverage does not satisfy a requirement.

## Testing strategy

### Test-driven implementation

Every implementation task follows the native foundation's red, green, refactor, independent review, Argent checkpoint, commit, and push protocol. A task is not complete because its isolated unit tests pass.

### Domain and calendar tests

- Every validator boundary and typed error
- Multiple check-ins on one day
- Quick amount defaults and amount limits
- Note length and normalization
- Logical dates around midnight and noon shifts
- Both daylight-saving transitions
- Device time-zone changes
- Future-date rejection
- ISO week and month/year boundaries
- Current and longest streak definitions
- Consistency bands and denominators
- Leap year and year comparison
- Heatmap intensity and future cells
- Idempotent retries and distinct intentional presses
- Archive, restore, tombstone, and purge eligibility

### Migration and persistence tests

- Clean database to latest schema
- Every released schema fixture to latest
- Migration rerun is a no-op
- Checksum mismatch is a hard, visible failure
- Foreign keys and WAL are enabled
- Prepared statements handle hostile input
- Exclusive transaction rollback leaves no partial board, check-in, reminder, projection, outbox, or receipt
- Read snapshot remains internally consistent during concurrent writes
- Corrupt and unsupported records fail without creating a new database
- Shared App Group path selection has explicit iOS and Android-safe behavior

### Feature and accessibility tests

- Every route's empty, loading, content, validation, permission, unavailable, and failure states
- Complete accessible names and states for icon-only controls
- Full board titles despite visual truncation
- Minimum 44-point controls
- Dynamic Type composition without fixed text heights
- Reduced Motion behavior
- Chart text equivalents
- Virtualized board, history, and journal lists
- Unsaved sheet dismissal confirmation
- Keyboard and focus behavior
- Deep-link validation and recovery

### Adapter contract tests

- Notification schedule, reschedule, disable, delete, archive, restore, capacity, denied, and reconciliation
- Widget projection ordering, family limits, empty state, stale state, deep link, quick action, and reload
- TypeScript and Swift quick-command executors against identical JSON fixtures
- Cloud sync retry, duplicate delivery, token persistence, HLC ordering, conflict, tombstone, signed-out, and offline cases
- Alternate icon supported, unsupported, success, and rollback
- Product-link validation and missing release configuration
- Android unavailable adapters never import or evaluate iOS code

### Export tests

- Stable exportVersion 1 schema
- One internally consistent snapshot
- Active and archived records included
- Tombstones, secrets, device ids, native schedule ids, and sync metadata excluded
- Notes, historical amounts, historical times, reminder rules, locale, and time zone preserved
- Offline generation, share cancellation, failure cleanup, and next-launch cleanup

### End-to-end scenarios

1. Launch an empty database, create a board, and see the home card.
2. Configure amount, time, day shift, metrics, color, symbol, tint, and multiple reminders.
3. Quick check in twice, undo the second, and verify every projection.
4. Add a historical timed amount check-in with a note, edit it, and verify History, Journal, Analytics, widget, and export.
5. Cross the board's shifted midnight and verify the logical date.
6. Deny notifications, preserve the reminder, grant through Settings, reconcile, edit, disable, and delete.
7. Archive a board, verify active surfaces and schedules, read it from Archived Boards, restore it, then permanently delete it.
8. Exercise all analytics sections with deterministic sparse and full fixtures.
9. Render all four Home Screen widget families and perform a native quick action.
10. Export offline, inspect the JSON contract, cancel sharing, and repeat.
11. Enable iCloud on two signed targets, mutate offline on both, reconnect, and verify deterministic convergence.
12. Run all three App Intents through Shortcuts and at least Check In and Get Today's Check-Ins through Siri.
13. Change alternate icons and relaunch.
14. Run light, dark, 200 percent Dynamic Type, VoiceOver, Reduce Motion, and Increase Contrast checkpoints.
15. Complete iOS and Android production JavaScript and asset exports with no platform-boundary failure.

### Coverage and performance

- Authored product logic maintains at least 90 percent lines, statements, functions, and branches.
- Domain commands, calendar logic, analytics formulas, migrations, export serialization, and sync reconciliation maintain 100 percent branch coverage.
- Coverage exclusions are limited to generated code, static route declarations, and platform code proven through native tests.
- Home with 1,000 boards and history with 100,000 check-ins remains virtualized and does not synchronously materialize every row.
- A quick check-in commits and visibly updates the home card within 250 milliseconds at the 95th percentile on the primary simulator with 100,000 stored check-ins.
- Analytics computation for one board with 100,000 check-ins completes within 500 milliseconds at the 95th percentile or uses an incrementally maintained projection with equivalent correctness.
- Startup does not wait for CloudKit, notification reconciliation, or widget reload before rendering local boards.

### Argent and native evidence

- The exact Argent checkpoint protocol in SPEC-native-foundation.md applies after every task.
- Visible tasks require a structural describe result, runtime-log review, full-resolution screenshot, and approved diff.
- Interaction uses discovery before every tap and never derives coordinates from screenshots.
- Saved regression flows cover the fifteen end-to-end scenarios where Argent supports the target.
- iOS widgets, notification delivery, App Intents, Siri, alternate icons, and CloudKit receive native evidence in addition to Jest mocks.
- A signed physical-device check is required before declaring iCloud, Siri, and production widget behavior complete. Simulator evidence remains required for deterministic regression.

## Implementation sequence for Fable 5 planning

This sequence is one implementation plan under this specification, not a request for more specs.

1. Finish and verify SPEC-native-foundation.md.
2. Build tracking core, App Group database location, schema, migrations, repositories, calendar policy, commands, queries, and deterministic fixtures.
3. Deliver the primary local vertical slice: Boards home, Board Detail, configuration, quick check-in, manual entry, and history.
4. Add analytics and Journal on the stable local command/query layer.
5. Add reminders, notification permission, reconciliation, and Settings.
6. Add export and alternate icons.
7. Add expo-widgets, all approved Home Screen families, the native quick-command executor, and widget regression coverage.
8. Freeze local visual parity and accessibility against approved light and dark baselines.
9. Add CloudKit sync and prove two-target convergence.
10. Add App Intents, Shortcuts, and Siri.
11. Complete Android-safe adapters, exports, contract fixtures, and android-readiness.md.
12. Run the full cross-feature, accessibility, performance, native, independent-review, and artifact-leak gates.

Stages 3 and 4 may use bounded parallel delegation after tracking core interfaces are stable. Stages 7, 9, and 10 may share native support code but retain independent tests and checkpoints. Fable 5 remains integration owner.

## Boundaries

### Always do

- Treat both specifications and CAPABILITY-MAP.md as the complete product contract.
- Preserve the approved domain rules even when a platform API suggests a shortcut.
- Keep SQLite local-first and usable with no account, network, CloudKit, widget, or notification permission.
- Bind every user SQL value and use exclusive write transactions.
- Update normalized data, materialized projections, command receipts, and sync outbox atomically.
- Use SDK 57 versioned Expo documentation and current Apple or Android primary documentation before implementation.
- Use Expo Install through Bun.
- Use CNG and config plugins for entitlements and targets.
- Keep generated native projects ignored.
- Preserve accessible text equivalents for every visual metric.
- Require independent verification and Argent evidence before every commit.
- Keep private design references and captured artifacts untracked.

### Ask first

- Change a product rule, formula, data field, validation limit, deletion policy, conflict policy, export schema, widget family, or intent inventory in this specification.
- Add or replace a runtime dependency not listed here or in SPEC-native-foundation.md.
- Introduce an ORM, date library, charting library, state-management framework, backend, analytics service, or account system.
- Change the bundle id, App Group, CloudKit container, widget extension id, minimum iOS version, signing team, or store linkage.
- Add a second custom native module or move product behavior out of the approved module boundary.
- Add Android product UI, native Android implementation, web support, import, watchOS, Lock Screen widgets, or Live Activities.
- Change required release URLs or app-icon inventory after human delivery.
- Replace an approved visual baseline.

### Never do

- Create another product specification to defer a decision already owned here.
- Create a second local product store in AsyncStorage, React context, widget defaults, CloudKit, or platform code.
- Let widgets, notifications, sync, or automations bypass validation and idempotency.
- Recompute stored logical dates after settings, locale, time-zone, or daylight-saving changes.
- Merge note text character by character or invent nondeterministic sync conflict behavior.
- Hard-delete an unsynchronized tombstone.
- Request push tokens or send personal data to a custom server.
- Log note contents, exported JSON, CloudKit records, notification messages, identifiers, or product-link secrets.
- Commit generated ios/ or android/ directories, private screenshots, export files, artifacts, credentials, or signing material.
- Use a screenshot as a source of tap coordinates.
- Weaken tests, coverage, accessibility, or visual baselines to make a gate pass.
- Add agent signatures or co-author lines to commits.

## Success criteria

The Ripples product is complete only when all criteria below are true.

### Core and data

1. The shared App Group SQLite database is the sole local source of truth and opens across app and widget targets.
2. Clean and prior-schema migrations pass, are atomic, checksum-protected, and recover visibly from failure.
3. All commands return typed results, validate inputs, bind SQL parameters, use exclusive transactions, and support idempotent retry.
4. Logical dates pass midnight, shifted-day, daylight-saving, time-zone-change, leap-day, week, month, and year fixtures.
5. Multiple check-ins per logical day, amount, time, note, archive, restore, deletion, tombstone, purge, ordering, and concurrency rules match this spec.
6. Every projection updates from one committed mutation with no alternate store.

### Local product

7. Boards home, Board Detail, Create and Edit Board, Options, reminders, Check-Ins, Add and Edit Check-In, Analytics, Journal, Settings, Archived Boards, Icons, Sync, and Export routes are complete.
8. The private reference hierarchy and information density are reproduced in dark mode, with approved light-mode counterparts.
9. Quick check-in, Undo, manual entry, edit, delete, reorder, archive, restore, and permanent delete work end to end.
10. Heatmap, seven-day strip, summaries, timeline, weekdays, year comparison, consistency, and streaks match the approved formulas.
11. Lists remain genuinely virtualized at the performance fixture sizes.
12. Every empty, sparse, loading, validation, database, permission, platform-unavailable, and retryable failure state is intentional and accessible.

### Platform capabilities

13. Local reminders preserve weekday and wall-clock behavior, handle permission and capacity, reconcile without duplicates, and deep-link correctly.
14. Export produces the exact versioned JSON snapshot offline, excludes private internals, and safely handles share cancellation and cleanup.
15. Default, Midnight, and Paper alternate icons change and persist through the native adapter.
16. Small, Medium, Large, and Extra Large Home Screen widgets render approved projections and accessibility labels.
17. Widget quick actions create exactly one valid check-in, update the projection, reload the timeline, and never require the main app when native execution succeeds.
18. CloudKit private sync converges across two signed targets for create, edit, archive, delete, offline, retry, duplicate, and conflict cases without blocking local work.
19. Check In, Remove Latest Check-In, and Get Today's Check-Ins work in Shortcuts; Check In and Get Today's Check-Ins work through Siri on a signed device.
20. Android export, Android-safe resolution, shared contract fixtures, unavailable adapters, and docs/architecture/android-readiness.md pass without shipping Android UI.

### Quality and release gates

21. Light, dark, at least 200 percent Dynamic Type, VoiceOver, Reduce Motion, Increase Contrast, safe-area, keyboard, and minimum-target checks pass.
22. Every chart has an equivalent selectable text summary and no required gesture-only information.
23. Domain, calendar, analytics, migrations, export, and sync reconciliation meet their coverage thresholds.
24. The fifteen end-to-end scenarios pass with recorded evidence on supported targets.
25. Quick-check-in and analytics performance budgets pass on the primary simulator.
26. The runtime log registry contains no authored warning, error, unhandled rejection, database corruption, or leaked private data.
27. bun run lint, bun run typecheck, all focused tests, bun run test, bun run test:coverage, bun run validate, bunx expo-doctor, iOS export, Android export, and git diff --check pass.
28. Every completed task has its Fable 5 checkpoint, independent GPT-5.6 Sol pass, required Argent evidence, isolated lowercase conventional commit, and verified push.
29. Production release configuration contains valid HTTPS support, feedback, legal, release-notes, more-products, and App Store destinations.
30. git ls-files contains no private reference, Argent artifact, generated native project, export file, credential, or signing asset.

## Required human-supplied release inputs

These values are deployment inputs, not unresolved product behavior:

- Apple Developer team with App Group, CloudKit, widget, App Intents, and alternate-icon signing access
- Valid feedback, privacy, terms, release-notes, and more-products HTTPS URLs
- Final App Store id and review URL
- Human approval of Default, Midnight, and Paper icon artwork
- Human approval of the first light and dark full-resolution baselines
- A signed physical iPhone for the final iCloud, widget, Shortcut, and Siri checkpoint

Development may proceed with explicit missing-input states. Production completion cannot be declared until the inputs exist.

## Documentation sources

- Expo SDK 57 SQLite: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/
- Expo SDK 57 Notifications: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- Expo SDK 57 Sharing: https://docs.expo.dev/versions/v57.0.0/sdk/sharing/
- Expo SDK 57 Widgets: https://docs.expo.dev/versions/v57.0.0/sdk/widgets/
- Expo SDK 57 Crypto: https://docs.expo.dev/versions/v57.0.0/sdk/crypto/
- Expo SDK 57 Localization: https://docs.expo.dev/versions/v57.0.0/sdk/localization/
- Expo SDK 57 Application: https://docs.expo.dev/versions/v57.0.0/sdk/application/
- Expo SDK 57 react-native-svg: https://docs.expo.dev/versions/v57.0.0/sdk/svg/
- Apple App Groups: https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.application-groups
- Apple CloudKit: https://developer.apple.com/documentation/cloudkit
- Apple App Intents: https://developer.apple.com/documentation/appintents
- Apple interactive widgets: https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities
- Apple alternate app icons: https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons
- Android Glance: https://developer.android.com/develop/ui/compose/glance
- Android App Actions: https://developer.android.com/develop/devices/assistant/overview

## Open questions

None. The two-spec boundary, iOS-first release, local-first source of truth, product semantics, analytics definitions, native extension boundaries, CloudKit policy, widget families, automation inventory, export schema, and Android-readiness boundary are fixed by this document.

Approval of this document authorizes Fable 5 to create or update one implementation plan and task list covering the remaining product. It does not authorize this GPT-5.6 Sol specification session to install packages, edit application code, or implement any task.
