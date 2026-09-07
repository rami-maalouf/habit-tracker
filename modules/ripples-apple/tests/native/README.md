# Native configuration checks

Run the pure Swift icon-registration checks on a Mac with Xcode command-line tools:

```sh
swiftc modules/ripples-apple/ios/AlternateIconConfiguration.swift modules/ripples-apple/tests/native/AlternateIconConfigurationTests.swift -o /tmp/ripples-alternate-icon-configuration-tests
/tmp/ripples-alternate-icon-configuration-tests
```

These checks exercise missing/malformed registration, platform permission, known
icon names, asset-catalog references, and iPad inventory selection. They do not
replace native build or device checks of UIApplication icon switching.

## SQLite linkage

After Expo prebuild and CocoaPods installation, build the actual iOS pod and
check its unresolved symbols:

```sh
xcodebuild -project ios/Pods/Pods.xcodeproj -target RipplesApple -configuration Debug -sdk iphonesimulator -arch arm64 CODE_SIGNING_ALLOWED=NO build
bun run test:native:linkage
```

Pass a different `libRipplesApple.a` path as an argument when the build output is
elsewhere. The check requires the ExpoSQLite dependency and Expo-prefixed SQLite
symbols, and rejects system SQLite references. It is a post-build check: the
macOS SwiftPM contract tests intentionally use system SQLite and cannot establish
which library the iOS app links. Device WAL concurrency and integrity checks remain
required after changing database integration.
