import ExpoModulesCore
import UIKit

public class RipplesAppleModule: Module {
  private var significantTimeChangeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("RipplesApple")

    AsyncFunction("supportsAlternateIcons") { () -> Bool in
      AlternateIconAdapter.supportsAlternateIcons()
    }.runOnQueue(.main)

    AsyncFunction("setAlternateIcon") { (name: String?, promise: Promise) in
      AlternateIconAdapter.setAlternateIcon(name, promise: promise)
    }.runOnQueue(.main)

    Events("onSignificantTimeChange")

    OnStartObserving("onSignificantTimeChange") {
      self.startObservingSignificantTimeChanges()
    }

    OnStopObserving("onSignificantTimeChange") {
      self.stopObservingSignificantTimeChanges()
    }

    OnDestroy {
      self.stopObservingSignificantTimeChanges()
    }

    OnAppContextDestroys {
      self.stopObservingSignificantTimeChanges()
    }
  }

  private func startObservingSignificantTimeChanges() {
    guard significantTimeChangeObserver == nil else {
      return
    }

    significantTimeChangeObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.significantTimeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.sendEvent("onSignificantTimeChange")
    }
  }

  private func stopObservingSignificantTimeChanges() {
    guard let observer = significantTimeChangeObserver else {
      return
    }

    NotificationCenter.default.removeObserver(observer)
    significantTimeChangeObserver = nil
  }
}
