import ExpoModulesCore
import UIKit

enum AlternateIconAdapter {
  private static var configuration: AlternateIconConfiguration {
    AlternateIconConfiguration(
      infoDictionary: Bundle.main.infoDictionary ?? [:],
      isPad: UIDevice.current.userInterfaceIdiom == .pad
    )
  }

  static func supportsAlternateIcons() -> Bool {
    configuration.supportsAlternateIcons(platformAllows: UIApplication.shared.supportsAlternateIcons)
  }

  static func setAlternateIcon(_ name: String?, promise: Promise) {
    let application = UIApplication.shared
    guard configuration.allows(name, platformAllows: application.supportsAlternateIcons) else {
      promise.reject(AlternateIconUnsupportedException())
      return
    }
    guard application.alternateIconName != name else {
      promise.resolve()
      return
    }

    application.setAlternateIconName(name) { error in
      if error != nil {
        promise.reject(AlternateIconChangeFailedException())
      } else {
        promise.resolve()
      }
    }
  }
}

private final class AlternateIconUnsupportedException: Exception, @unchecked Sendable {
  override var code: String {
    "ERR_ALTERNATE_ICON_UNSUPPORTED"
  }

  override var reason: String {
    "Alternate app icons are unavailable on this device."
  }

  override var debugDescription: String { reason }
}

private final class AlternateIconChangeFailedException: Exception, @unchecked Sendable {
  override var code: String {
    "ERR_ALTERNATE_ICON_CHANGE_FAILED"
  }

  override var reason: String {
    "The app icon could not be changed. Try again."
  }

  override var debugDescription: String { reason }
}
