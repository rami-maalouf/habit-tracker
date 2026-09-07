import AppIntents
internal import RipplesApple

struct RipplesApplicationIntents: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] { [RipplesAppIntentsPackage.self] }
}

struct RipplesApplicationShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RipplesCheckInIntent(), phrases: ["Check in with \(.applicationName)"],
      shortTitle: "Check In", systemImageName: "checkmark.circle"
    )
    AppShortcut(
      intent: RipplesRemoveLatestCheckInIntent(), phrases: ["Remove my latest check-in in \(.applicationName)"],
      shortTitle: "Remove Latest Check-In", systemImageName: "minus.circle"
    )
    AppShortcut(
      intent: RipplesTodayCheckInsIntent(), phrases: ["Show today's check-ins in \(.applicationName)"],
      shortTitle: "Today's Check-Ins", systemImageName: "list.bullet"
    )
  }
}
