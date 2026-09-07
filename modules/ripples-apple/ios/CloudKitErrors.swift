import CloudKit
import Foundation

enum CloudKitFailure: String, Error, Sendable {
  case offline
  case signedOut = "signed_out"
  case unavailable
  case failure

  var message: String {
    switch self {
    case .offline: return "iCloud sync will try again when the connection returns."
    case .signedOut: return "Sign in to iCloud in Settings to sync your data."
    case .unavailable: return "iCloud sync is unavailable in this build or account."
    case .failure: return "iCloud sync could not finish. Try again."
    }
  }

  static func accountFailure(_ status: CKAccountStatus) -> CloudKitFailure? {
    switch status {
    case .available: return nil
    case .noAccount, .restricted: return .signedOut
    case .couldNotDetermine, .temporarilyUnavailable: return .unavailable
    @unknown default: return .unavailable
    }
  }

  static func map(_ error: Error) -> CloudKitFailure {
    if let failure = error as? CloudKitFailure { return failure }
    guard let error = error as? CKError else { return .failure }
    switch error.code {
    case .networkUnavailable, .networkFailure: return .offline
    case .notAuthenticated, .managedAccountRestricted: return .signedOut
    case .missingEntitlement, .badContainer, .badDatabase, .accountTemporarilyUnavailable:
      return .unavailable
    case .partialFailure:
      let failures = error.partialErrorsByItemID?.values.map(Self.map) ?? []
      if failures.contains(.unavailable) { return .unavailable }
      if failures.contains(.signedOut) { return .signedOut }
      if failures.contains(.offline) { return .offline }
      return .failure
    default: return .failure
    }
  }
}

func cloudKitErrorHasCode(_ error: Error, _ code: CKError.Code) -> Bool {
  guard let error = error as? CKError else { return false }
  if error.code == code { return true }
  return error.code == .partialFailure &&
    (error.partialErrorsByItemID?.values.contains { cloudKitErrorHasCode($0, code) } ?? false)
}
