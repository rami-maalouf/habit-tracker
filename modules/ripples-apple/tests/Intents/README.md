# native automation contract tests

Run from the repository root:

```sh
swift test --package-path modules/ripples-apple --filter IntentExecutorTests
```

The SwiftPM test target runs the real executor against SQLite on macOS. It reads `src/core/automations/fixtures/intent-contract.json` directly, without copying or changing it. It asks Bun to load the authoritative TypeScript migrations and their checksums to initialize each test store. The native schema gate must match those checksums; production intents refuse an unknown or uninitialized store and never migrate, create, or reset it.

The tests cover all shared cases plus transaction rollback, separate-connection receipt replay, HLC/outbox/projection updates, amount and Unicode note validation, shifted dates and daylight-saving behavior, history ordering, confirmed-removal races, and the SDK 57 widget timeline format.

The iOS wrappers can also be checked without signing:

```sh
swiftc -typecheck -target arm64-apple-ios18.6 \
  -sdk /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk \
  modules/ripples-apple/ios/Intents/Core/*.swift \
  modules/ripples-apple/ios/Intents/RipplesAppIntents.swift
```

## integration contract

- The app target includes `RipplesAppIntentsPackage` through an app-level `AppIntentsPackage`, and declares one `AppShortcutsProvider` using the three public intent types.
- `RipplesAppGroupIdentifier` identifies the existing `ripples.db` container. `ExpoWidgetsAppGroupIdentifier` identifies the widget timeline suite.
- After a successful mutation, the native publisher reads committed `widget_board_rows`, writes the existing Expo widget's serialized timeline props, then requests a timeline reload. It does not replace the layout or enable widget in-place actions.
- Each invocation owns a fresh command UUID. Re-execution of that instance passes the same UUID to the receipt-aware executor. App Intents exposes no durable system request token for reconstructing an invocation after process death; intentional repeats are never deduplicated by their values or time.
- App Intents does not expose a reliable Siri-versus-Shortcuts source identifier on the minimum supported OS. Both wrappers use the contract's `shortcut` automation source; the executor also accepts an explicitly supplied `siri` source.
- Signed-device Shortcuts execution, Siri invocation, permission/lock behavior, metadata discovery, and visible widget refresh remain required device evidence.
