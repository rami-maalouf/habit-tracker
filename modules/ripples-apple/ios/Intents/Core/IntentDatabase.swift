import Foundation
#if os(iOS)
import ExpoSQLite
#elseif os(macOS)
import SQLite3
#endif

enum IntentSQLValue: Equatable {
  case null, text(String), integer(Int64), real(Double)
  static func string(_ value: String?) -> Self { value.map(Self.text) ?? .null }
  static func number(_ value: Double?) -> Self { value.map(Self.real) ?? .null }
  var string: String? { if case .text(let value) = self { return value }; return nil }
  var number: Double? {
    switch self { case .integer(let value): return Double(value); case .real(let value): return value; default: return nil }
  }
}

enum IntentStorageError: Error { case unavailable }

// a connection belongs to one invocation. sqlite serializes transactions
// across the app and intents; no second product store is created here.
final class IntentDatabase {
  private var handle: OpaquePointer?

  init(path: String, createForTesting: Bool = false) throws {
    let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX | (createForTesting ? SQLITE_OPEN_CREATE : 0)
    guard exsqlite3_open_v2(path, &handle, flags, nil) == SQLITE_OK else {
      if let handle { exsqlite3_close(handle) }
      handle = nil
      throw IntentFailure.unavailable
    }
    exsqlite3_busy_timeout(handle, 5000)
    try run("PRAGMA foreign_keys = ON")
  }

  deinit { exsqlite3_close(handle) }

  func transaction<Value>(exclusive: Bool, _ work: () throws -> Value) throws -> Value {
    try run(exclusive ? "BEGIN EXCLUSIVE" : "BEGIN")
    do {
      let result = try work()
      try run("COMMIT")
      return result
    } catch {
      _ = try? run("ROLLBACK")
      throw error
    }
  }

  @discardableResult func run(_ sql: String, _ values: [IntentSQLValue] = []) throws -> Int {
    let statement = try prepare(sql, values)
    defer { exsqlite3_finalize(statement) }
    let status = exsqlite3_step(statement)
    guard status == SQLITE_DONE || status == SQLITE_ROW else { throw IntentStorageError.unavailable }
    return Int(exsqlite3_changes(handle))
  }

  func rows(_ sql: String, _ values: [IntentSQLValue] = []) throws -> [[String: IntentSQLValue]] {
    let statement = try prepare(sql, values)
    defer { exsqlite3_finalize(statement) }
    var output: [[String: IntentSQLValue]] = []
    while true {
      let status = exsqlite3_step(statement)
      if status == SQLITE_DONE { return output }
      guard status == SQLITE_ROW else { throw IntentStorageError.unavailable }
      var row: [String: IntentSQLValue] = [:]
      for index in 0..<exsqlite3_column_count(statement) {
        guard let namePointer = exsqlite3_column_name(statement, index) else { throw IntentStorageError.unavailable }
        let name = String(cString: namePointer)
        switch exsqlite3_column_type(statement, index) {
        case SQLITE_INTEGER: row[name] = .integer(exsqlite3_column_int64(statement, index))
        case SQLITE_FLOAT: row[name] = .real(exsqlite3_column_double(statement, index))
        case SQLITE_TEXT:
          let bytes = UnsafeBufferPointer(start: exsqlite3_column_text(statement, index), count: Int(exsqlite3_column_bytes(statement, index)))
          row[name] = .text(String(decoding: bytes, as: UTF8.self))
        case SQLITE_NULL: row[name] = .null
        default: throw IntentStorageError.unavailable
        }
      }
      output.append(row)
    }
  }

  private func prepare(_ sql: String, _ values: [IntentSQLValue]) throws -> OpaquePointer {
    var statement: OpaquePointer?
    guard exsqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw IntentStorageError.unavailable
    }
    let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    for (index, value) in values.enumerated() {
      let position = Int32(index + 1)
      let status: Int32
      switch value {
      case .null: status = exsqlite3_bind_null(statement, position)
      case .text(let text): status = exsqlite3_bind_text(statement, position, text, Int32(text.utf8.count), transient)
      case .integer(let number): status = exsqlite3_bind_int64(statement, position, number)
      case .real(let number): status = exsqlite3_bind_double(statement, position, number)
      }
      if status != SQLITE_OK { exsqlite3_finalize(statement); throw IntentStorageError.unavailable }
    }
    return statement
  }
}
