// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "RipplesAppleNativeTests",
  platforms: [.macOS(.v13), .iOS("18.6")],
  targets: [
    .target(name: "RipplesIntentCore", path: "ios/Intents/Core", linkerSettings: [.linkedLibrary("sqlite3")]),
    .testTarget(name: "RipplesIntentCoreTests", dependencies: ["RipplesIntentCore"], path: "tests/Intents", exclude: ["README.md"]),
    .target(
      name: "RipplesCloudKit", path: "ios",
      exclude: ["Intents", "AlternateIconAdapter.swift", "AlternateIconConfiguration.swift", "CloudKitExpoBridge.swift", "RipplesAppleModule.swift", "RipplesApple.podspec"],
      sources: ["CloudKitErrors.swift", "CloudKitRecordMapping.swift", "CloudKitToken.swift", "CloudKitTransport.swift", "CloudKitOperations.swift", "CloudKitAccountBinding.swift"],
      linkerSettings: [.linkedFramework("CloudKit"), .linkedLibrary("sqlite3")]
    ),
    .testTarget(name: "RipplesCloudKitTests", dependencies: ["RipplesCloudKit"], path: "tests/CloudKit", resources: [.copy("sync-records.json")]),
  ],
  swiftLanguageVersions: [.v5]
)
