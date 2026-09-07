import ExpoModulesCore
import Foundation

enum CloudKitExpoBridge {
  private static func transport() throws -> CloudKitTransport {
    guard let identifier = Bundle.main.object(forInfoDictionaryKey: "RipplesCloudKitContainerIdentifier") as? String,
      identifier.range(of: "^iCloud\\.[A-Za-z0-9.-]+$", options: .regularExpression) != nil,
      let group = Bundle.main.object(forInfoDictionaryKey: "RipplesAppGroupIdentifier") as? String,
      let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw CloudKitFailure.unavailable
    }
    return CloudKitTransport(client: CloudKitOperations(containerIdentifier: identifier), containerIdentifier: identifier,
      accountBinding: CloudKitAccountBinding(databasePath: directory.appendingPathComponent("ripples.db").path))
  }

  static func available(_ promise: Promise) {
    Task {
      let value = try? transport()
      promise.resolve(await value?.available() ?? false)
    }
  }

  static func ensureZone(_ promise: Promise) {
    Task {
      do {
        try await transport().ensureZone()
        promise.resolve()
      } catch { promise.reject(CloudKitTransportException(CloudKitFailure.map(error))) }
    }
  }

  static func upload(_ recordsJSON: String, promise: Promise) {
    Task {
      do {
        let records = try JSONDecoder().decode([CloudKitWireRecord].self, from: Data(recordsJSON.utf8))
        try await transport().upload(records)
        promise.resolve()
      } catch { promise.reject(CloudKitTransportException(CloudKitFailure.map(error))) }
    }
  }

  static func fetchChanges(_ token: String?, promise: Promise) {
    Task {
      do {
        let page = try await transport().fetchChanges(token)
        let data = try JSONEncoder().encode(page)
        guard let json = String(data: data, encoding: .utf8) else { throw CloudKitFailure.failure }
        promise.resolve(json)
      } catch { promise.reject(CloudKitTransportException(CloudKitFailure.map(error))) }
    }
  }
}

private final class CloudKitTransportException: GenericException<CloudKitFailure>, @unchecked Sendable {
  override var code: String { param.rawValue }
  override var reason: String { param.message }
  override var debugDescription: String { reason }
}
