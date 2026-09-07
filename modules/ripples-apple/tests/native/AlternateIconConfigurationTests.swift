@main
struct AlternateIconConfigurationTests {
  static func main() {
    missingRegistrationIsUnsupported()
    partiallyRegisteredIconsAreUnsupported()
    registeredNamesControlSelection()
    platformPermissionIsRequired()
    malformedAndUnknownEntriesAreIgnored()
    assetCatalogNamesAreSupported()
    ipadUsesItsOwnInventory()
    print("7 alternate icon configuration tests passed")
  }

  private static func configuration(
    _ alternates: [String: Any],
    isPad: Bool = false
  ) -> AlternateIconConfiguration {
    AlternateIconConfiguration(
      infoDictionary: ["CFBundleIcons": ["CFBundleAlternateIcons": alternates]],
      isPad: isPad
    )
  }

  private static func missingRegistrationIsUnsupported() {
    let value = AlternateIconConfiguration(infoDictionary: [:], isPad: false)
    precondition(!value.supportsAlternateIcons(platformAllows: true))
    precondition(!value.allows(nil, platformAllows: true))
    precondition(!value.allows("midnight", platformAllows: true))
  }

  private static func registeredNamesControlSelection() {
    let value = configuration([
      "midnight": ["CFBundleIconFiles": ["Midnight60x60"]],
      "paper": ["CFBundleIconFiles": ["Paper60x60"]]
    ])
    precondition(value.registeredNames == ["midnight", "paper"])
    precondition(value.supportsAlternateIcons(platformAllows: true))
    precondition(value.allows("midnight", platformAllows: true))
    precondition(value.allows(nil, platformAllows: true))
    precondition(value.allows("paper", platformAllows: true))
    precondition(!value.allows("unknown", platformAllows: true))
  }

  private static func partiallyRegisteredIconsAreUnsupported() {
    for name in ["midnight", "paper"] {
      for isPad in [false, true] {
        let value = configuration([name: ["CFBundleIconName": name]], isPad: isPad)
        precondition(value.registeredNames == [name])
        precondition(!value.supportsAlternateIcons(platformAllows: true))
        precondition(!value.allows(name, platformAllows: true))
        precondition(!value.allows(nil, platformAllows: true))
      }
    }
  }

  private static func platformPermissionIsRequired() {
    let value = configuration([
      "midnight": ["CFBundleIconFiles": ["Midnight60x60"]],
      "paper": ["CFBundleIconFiles": ["Paper60x60"]]
    ])
    precondition(!value.supportsAlternateIcons(platformAllows: false))
    precondition(!value.allows("paper", platformAllows: false))
    precondition(!value.allows(nil, platformAllows: false))
  }

  private static func malformedAndUnknownEntriesAreIgnored() {
    let value = configuration([
      "midnight": ["CFBundleIconFiles": [""]],
      "paper": ["CFBundleIconName": ""],
      "unapproved": ["CFBundleIconFiles": ["Other60x60"]]
    ])
    precondition(value.registeredNames.isEmpty)
    precondition(!value.supportsAlternateIcons(platformAllows: true))
    precondition(!configuration(["midnight": "wrong type"]).supportsAlternateIcons(platformAllows: true))
  }

  private static func assetCatalogNamesAreSupported() {
    let value = configuration([
      "midnight": ["CFBundleIconName": "Midnight"],
      "paper": ["CFBundleIconName": "Paper"]
    ])
    precondition(value.registeredNames == ["midnight", "paper"])
    precondition(value.allows("midnight", platformAllows: true))
    precondition(value.allows("paper", platformAllows: true))
  }

  private static func ipadUsesItsOwnInventory() {
    let completeIcons = [
      "midnight": ["CFBundleIconName": "Midnight"],
      "paper": ["CFBundleIconName": "Paper"]
    ]
    var info: [String: Any] = [
      "CFBundleIcons": ["CFBundleAlternateIcons": completeIcons],
      "CFBundleIcons~ipad": ["CFBundleAlternateIcons": ["paper": ["CFBundleIconName": "Paper"]]]
    ]
    let phone = AlternateIconConfiguration(infoDictionary: info, isPad: false)
    let pad = AlternateIconConfiguration(infoDictionary: info, isPad: true)
    precondition(phone.registeredNames == ["midnight", "paper"])
    precondition(phone.supportsAlternateIcons(platformAllows: true))
    precondition(pad.registeredNames == ["paper"])
    precondition(!pad.supportsAlternateIcons(platformAllows: true))
    precondition(!pad.allows("midnight", platformAllows: true))
    info["CFBundleIcons~ipad"] = ["CFBundleAlternateIcons": completeIcons]
    let completePad = AlternateIconConfiguration(infoDictionary: info, isPad: true)
    precondition(completePad.supportsAlternateIcons(platformAllows: true))
    precondition(completePad.allows("midnight", platformAllows: true))
    precondition(completePad.allows("paper", platformAllows: true))
    precondition(!completePad.allows("unknown", platformAllows: true))
    let fallback = configuration(completeIcons, isPad: true)
    precondition(fallback.supportsAlternateIcons(platformAllows: true))
  }
}
