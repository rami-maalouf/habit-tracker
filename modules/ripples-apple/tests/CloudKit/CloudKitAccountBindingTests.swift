import Foundation
import SQLite3
import XCTest
@testable import RipplesCloudKit

final class CloudKitAccountBindingTests: XCTestCase {
  private let provider = "iCloud.studio.orbitlabs.habittracker"

  private func store(schema: Bool = true) throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".db")
    var handle: OpaquePointer?
    XCTAssertEqual(sqlite3_open(url.path, &handle), SQLITE_OK)
    defer { sqlite3_close(handle) }
    if schema {
      XCTAssertEqual(sqlite3_exec(handle, "CREATE TABLE sync_account_bindings (provider TEXT PRIMARY KEY, account_digest TEXT NOT NULL)", nil, nil, nil), SQLITE_OK)
    }
    addTeardownBlock { try? FileManager.default.removeItem(at: url) }
    return url
  }

  func testFirstBindingPersistsAndAnotherConnectionCannotReplaceIt() throws {
    let path = try store().path
    let first = CloudKitAccountBinding(databasePath: path)
    let digest = CloudKitAccountBinding.digest(recordName: "synthetic-user-a")
    try first.require(provider: provider, accountDigest: digest)
    let reopened = CloudKitAccountBinding(databasePath: path)
    try reopened.require(provider: provider, accountDigest: digest)
    XCTAssertThrowsError(try reopened.require(provider: provider,
      accountDigest: CloudKitAccountBinding.digest(recordName: "synthetic-user-b"))) { error in
      XCTAssertEqual(CloudKitFailure.map(error), .unavailable)
    }
    try reopened.require(provider: provider, accountDigest: digest)
  }

  func testBindingsAreContainerScopedAndOnlyStoreAnOpaqueDigest() throws {
    let path = try store().path
    let binding = CloudKitAccountBinding(databasePath: path)
    let digest = CloudKitAccountBinding.digest(recordName: "synthetic-user-a")
    XCTAssertEqual(digest.count, 64)
    XCTAssertFalse(digest.contains("synthetic"))
    try binding.require(provider: provider, accountDigest: digest)
    try binding.require(provider: "iCloud.other.app", accountDigest: CloudKitAccountBinding.digest(recordName: "synthetic-user-b"))
    let content = try Data(contentsOf: URL(fileURLWithPath: path))
    XCTAssertNil(content.range(of: Data("synthetic-user-a".utf8)))
    XCTAssertNil(content.range(of: Data("synthetic-user-b".utf8)))
  }

  func testConcurrentFirstBindingsChooseOneAccountWithoutReplacingIt() async throws {
    let binding = CloudKitAccountBinding(databasePath: try store().path)
    let provider = provider
    let winners = await withTaskGroup(of: String?.self, returning: [String].self) { group in
      for name in ["synthetic-user-a", "synthetic-user-b"] {
        group.addTask {
          let digest = CloudKitAccountBinding.digest(recordName: name)
          do {
            try binding.require(provider: provider, accountDigest: digest)
            return digest
          } catch { return nil }
        }
      }
      var winners: [String] = []
      for await result in group { if let result { winners.append(result) } }
      return winners
    }
    XCTAssertEqual(winners.count, 1)
    try binding.require(provider: provider, accountDigest: XCTUnwrap(winners.first))
  }

  func testMissingStoreAndUnmigratedSchemaFailClosedWithoutCreatingAnything() throws {
    let missing = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".db")
    for path in [missing.path, try store(schema: false).path] {
      XCTAssertThrowsError(try CloudKitAccountBinding(databasePath: path).require(provider: provider,
        accountDigest: CloudKitAccountBinding.digest(recordName: "synthetic-user-a"))) { error in
        XCTAssertEqual(CloudKitFailure.map(error), .unavailable)
        XCTAssertFalse(CloudKitFailure.map(error).message.contains(path))
      }
    }
    XCTAssertFalse(FileManager.default.fileExists(atPath: missing.path))
  }
}
