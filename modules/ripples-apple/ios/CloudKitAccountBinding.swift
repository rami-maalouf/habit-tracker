import CryptoKit
import Foundation
import SQLite3

protocol CloudKitAccountBindingChecking: Sendable {
  func require(provider: String, accountDigest: String) throws
}

// local account metadata lives in the existing product database. native code
// never creates the store or table, resets a binding, or stores an account id.
struct CloudKitAccountBinding: CloudKitAccountBindingChecking {
  let databasePath: String

  static func digest(recordName: String) -> String {
    SHA256.hash(data: Data(recordName.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  func require(provider: String, accountDigest: String) throws {
    guard !provider.isEmpty,
      accountDigest.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
      throw CloudKitFailure.unavailable
    }
    var handle: OpaquePointer?
    guard sqlite3_open_v2(databasePath, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
      let database = handle else {
      if let handle { sqlite3_close(handle) }
      throw CloudKitFailure.unavailable
    }
    defer { sqlite3_close(database) }
    sqlite3_busy_timeout(database, 5000)
    guard sqlite3_exec(database, "BEGIN EXCLUSIVE", nil, nil, nil) == SQLITE_OK else {
      throw CloudKitFailure.unavailable
    }
    do {
      let stored = try read(database, provider: provider)
      if let stored {
        guard stored == accountDigest else { throw CloudKitFailure.unavailable }
      } else {
        try insert(database, provider: provider, accountDigest: accountDigest)
      }
      guard sqlite3_exec(database, "COMMIT", nil, nil, nil) == SQLITE_OK else {
        throw CloudKitFailure.unavailable
      }
    } catch {
      sqlite3_exec(database, "ROLLBACK", nil, nil, nil)
      throw CloudKitFailure.unavailable
    }
  }

  private func statement(_ database: OpaquePointer, _ sql: String, _ values: [String]) throws -> OpaquePointer {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      if let statement { sqlite3_finalize(statement) }
      throw CloudKitFailure.unavailable
    }
    let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    for (index, value) in values.enumerated() {
      guard sqlite3_bind_text(statement, Int32(index + 1), value, Int32(value.utf8.count), transient) == SQLITE_OK else {
        sqlite3_finalize(statement)
        throw CloudKitFailure.unavailable
      }
    }
    return statement
  }

  private func read(_ database: OpaquePointer, provider: String) throws -> String? {
    let query = try statement(database, "SELECT account_digest FROM sync_account_bindings WHERE provider = ?", [provider])
    defer { sqlite3_finalize(query) }
    let status = sqlite3_step(query)
    if status == SQLITE_DONE { return nil }
    guard status == SQLITE_ROW, sqlite3_column_type(query, 0) == SQLITE_TEXT,
      let bytes = sqlite3_column_text(query, 0) else { throw CloudKitFailure.unavailable }
    let digest = String(decoding: UnsafeBufferPointer(start: bytes, count: Int(sqlite3_column_bytes(query, 0))), as: UTF8.self)
    guard sqlite3_step(query) == SQLITE_DONE else { throw CloudKitFailure.unavailable }
    return digest
  }

  private func insert(_ database: OpaquePointer, provider: String, accountDigest: String) throws {
    let query = try statement(database,
      "INSERT INTO sync_account_bindings (provider, account_digest) VALUES (?, ?)", [provider, accountDigest])
    defer { sqlite3_finalize(query) }
    guard sqlite3_step(query) == SQLITE_DONE else { throw CloudKitFailure.unavailable }
  }
}
