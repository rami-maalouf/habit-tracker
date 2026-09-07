# Native configuration checks

Run the pure Swift icon-registration checks on a Mac with Xcode command-line tools:

```sh
swiftc modules/ripples-apple/ios/AlternateIconConfiguration.swift modules/ripples-apple/tests/native/AlternateIconConfigurationTests.swift -o /tmp/ripples-alternate-icon-configuration-tests
/tmp/ripples-alternate-icon-configuration-tests
```

These checks exercise missing/malformed registration, platform permission, known
icon names, asset-catalog references, and iPad inventory selection. They do not
replace native build or device checks of UIApplication icon switching.
