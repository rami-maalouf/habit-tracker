struct AlternateIconConfiguration {
  private static let expectedNames: Set<String> = ["midnight", "paper"]
  let registeredNames: Set<String>

  init(infoDictionary: [String: Any], isPad: Bool) {
    let defaultIcons = infoDictionary["CFBundleIcons"] as? [String: Any]
    let icons = isPad
      ? (infoDictionary["CFBundleIcons~ipad"] as? [String: Any] ?? defaultIcons)
      : defaultIcons
    let alternateIcons = icons?["CFBundleAlternateIcons"] as? [String: Any]

    registeredNames = Set(Self.expectedNames.filter { name in
      guard let definition = alternateIcons?[name] as? [String: Any] else {
        return false
      }
      let assetName = definition["CFBundleIconName"] as? String
      let iconFiles = definition["CFBundleIconFiles"] as? [String]
      return assetName?.isEmpty == false || iconFiles?.contains(where: { !$0.isEmpty }) == true
    })
  }

  func supportsAlternateIcons(platformAllows: Bool) -> Bool {
    platformAllows && registeredNames == Self.expectedNames
  }

  func allows(_ name: String?, platformAllows: Bool) -> Bool {
    guard supportsAlternateIcons(platformAllows: platformAllows) else {
      return false
    }
    return name.map { registeredNames.contains($0) } ?? true
  }
}
