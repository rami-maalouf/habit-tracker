import Foundation
import XCTest
@testable import RipplesIntentCore

final class IntentExecutorTests: XCTestCase {
  private static var root: URL {
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { url.deleteLastPathComponent() }
    return url
  }

  private func fixture() throws -> [String: Any] {
    // this is the exact fixture consumed by the typescript test suite.
    let data = try Data(contentsOf: Self.root.appendingPathComponent("src/core/automations/fixtures/intent-contract.json"))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  private func migrations() throws -> [[String: Any]] {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["bun", "-e", "import { migrations } from './src/core/persistence/schema.ts'; import { migrationChecksum } from './src/core/persistence/migrations.ts'; console.log(JSON.stringify(migrations.map(m=>({...m,checksum:migrationChecksum(m)}))))"]
    process.currentDirectoryURL = Self.root
    let pipe = Pipe()
    process.standardOutput = pipe
    try process.run()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    XCTAssertEqual(process.terminationStatus, 0)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
  }

  private final class Harness {
    let database: IntentDatabase
    var instant: Double
    var timeZone: String
    var counter = 0
    lazy var executor = IntentExecutor(database: database, now: { self.instant }, zone: { self.timeZone }, uuid: { self.id() })

    init(seed: [String: Any], migrations: [[String: Any]], path: String = ":memory:") throws {
      database = try IntentDatabase(path: path, createForTesting: true)
      instant = seed["nowUtcMs"] as! Double
      timeZone = seed["timeZoneId"] as! String
      try database.run("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)")
      for migration in migrations {
        for statement in migration["statements"] as! [String] { try database.run(statement) }
        let version = migration["version"] as! Int
        try database.run("INSERT INTO schema_migrations VALUES (?, ?, ?, 0)", [.integer(Int64(version)), .text(migration["name"] as! String), .text(migration["checksum"] as! String)])
      }
      let version = migrations.last!["version"] as! Int
      try database.run("PRAGMA user_version = \(version)")
      try database.run("INSERT INTO app_settings (id, schema_revision, device_id) VALUES (1, ?, '00000000-0000-4000-8000-00000000d001')", [.integer(Int64(version))])
      let boards = seed["boards"] as! [[String: Any]]
      for (index, board) in boards.enumerated() {
        let archived = board["archived"] as! Bool
        let id = board["id"] as! String
        let title = board["title"] as! String
        let date = try IntentCalendar.logicalDate(utcMs: instant, zone: timeZone, startMinute: board["startOfDayMinute"] as! Int)
        try database.run("""
          INSERT INTO boards (id, title, symbol, accent_hex, uses_tinted_background, tracks_amount,
            amount_unit, quick_amount, tracks_time, start_of_day_minute, metrics_enabled, order_key,
            archived_at, created_at, updated_at, mutation_stamp, deleted_at)
          VALUES (?, ?, 'star.fill', '#70A7FF', 1, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'seed', NULL)
          """, [.text(id), .text(title), .integer(board["tracksAmount"] as! Bool ? 1 : 0),
                 .string(board["amountUnit"] as? String), .real(board["quickAmount"] as! Double),
                 .integer(board["tracksTime"] as! Bool ? 1 : 0), .integer(Int64(board["startOfDayMinute"] as! Int)),
                 .text(String(index)), archived ? .integer(Int64(instant)) : .null,
                 .integer(Int64(instant)), .integer(Int64(instant))])
        try database.run("INSERT INTO board_activity_periods (board_id, start_date, end_date, mutation_stamp) VALUES (?, ?, ?, 'seed')", [.text(id), .text(date), archived ? .text(date) : .null])
        if !archived {
          try database.run("INSERT INTO widget_board_rows VALUES (?, ?, ?, 'star.fill', '#70A7FF', '[0,0,0,0,0,0,0]', ?)", [.text(id), .integer(Int64(index)), .text(title), .text(date)])
        }
      }
    }

    func id() -> String {
      counter += 1
      return String(format: "00000000-0000-4000-8000-%012d", counter)
    }

    func run(_ intent: String, _ input: [String: Any], commandId: String? = nil) throws -> [String: Any] {
      let id = commandId ?? self.id()
      let encoded: Data
      switch intent {
      case "listBoards": encoded = try JSONEncoder().encode(executor.listBoards())
      case "checkIn": encoded = try JSONEncoder().encode(executor.checkIn(IntentCheckInInput(
        commandId: id, boardId: input["boardId"] as! String, logicalDate: input["logicalDate"] as? String,
        occurredAtUtc: input["occurredAtUtc"] as? Double, amount: input["amount"] as? Double, note: input["note"] as? String)))
      case "removeLatest": encoded = try JSONEncoder().encode(executor.removeLatest(commandId: id, boardId: input["boardId"] as! String, logicalDate: input["logicalDate"] as? String))
      default: encoded = try JSONEncoder().encode(executor.today(boardId: input["boardId"] as? String))
      }
      return try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
    }
  }

  private func harness() throws -> Harness {
    let source = try fixture()
    return try Harness(seed: source["seed"] as! [String: Any], migrations: migrations())
  }

  func testSharedFixtureVerbatim() throws {
    let source = try fixture()
    XCTAssertEqual(source["contractVersion"] as? Int, 1)
    let schema = try migrations()
    for entry in source["cases"] as! [[String: Any]] {
      let name = entry["name"] as! String
      let harness = try Harness(seed: source["seed"] as! [String: Any], migrations: schema)
      for step in entry["given"] as? [[String: Any]] ?? [] {
        XCTAssertEqual(try harness.run(step["intent"] as! String, step["input"] as! [String: Any])["ok"] as? Bool, true, name)
      }
      let intent = entry["intent"] as! String, input = entry["input"] as! [String: Any]
      let expected = entry["expect"] as! [String: Any]
      let commandId = harness.id()
      let result = try harness.run(intent, input, commandId: commandId)
      if input["replayCommandId"] as? Bool == true {
        XCTAssertTrue(NSDictionary(dictionary: result).isEqual(to: try harness.run(intent, input, commandId: commandId)), name)
      }
      XCTAssertEqual(result["ok"] as? Bool, expected["ok"] as? Bool, name)
      if expected["ok"] as? Bool == false {
        XCTAssertEqual((result["error"] as? [String: Any])?["code"] as? String, expected["code"] as? String, name)
        continue
      }
      if intent == "listBoards" {
        XCTAssertEqual((result["value"] as! [[String: Any]]).map { $0["title"] as! String }, expected["boards"] as! [String], name)
        continue
      }
      let value = result["value"] as! [String: Any]
      if let date = expected["logicalDate"] as? String { XCTAssertEqual(value["logicalDate"] as? String, date, name) }
      if let amount = expected["amount"] as? Double {
        XCTAssertEqual(try harness.database.rows("SELECT amount FROM check_ins WHERE id = ?", [.text(value["checkInId"] as! String)]).first?["amount"]?.number, amount, name)
      }
      if let boards = expected["boards"] as? [[String: Any]] {
        XCTAssertTrue(NSArray(array: value["boards"] as! [[String: Any]]).isEqual(to: boards), name)
      }
      if let total = expected["total"] as? Int { XCTAssertEqual(value["total"] as? Int, total, name) }
      if let count = expected["recordedCount"] as? Int {
        XCTAssertEqual(try harness.database.rows("SELECT COUNT(*) AS count FROM check_ins WHERE deleted_at IS NULL").first?["count"]?.number, Double(count), name)
      }
      if let remaining = expected["remainingToday"] as? Int {
        XCTAssertEqual(try harness.executor.today(boardId: input["boardId"] as? String).get().total, remaining, name)
      }
      if expected["excludesNoteText"] as? Bool == true {
        XCTAssertFalse(String(describing: result).contains("private thought"), name)
        XCTAssertFalse(String(describing: result).contains("note"), name)
      }
    }
  }

  func testNativeSchemaGateMatchesAuthoritativeMigrations() throws {
    let source = try migrations()
    let checksums = Dictionary(uniqueKeysWithValues: source.map { ($0["version"] as! Int, $0["checksum"] as! String) })
    XCTAssertEqual(IntentExecutor.migrationChecksums, checksums)
  }

  func testAppIntentFailuresExposeTheirSanitizedLocalizedMessages() throws {
    let failures = [IntentFailure.unavailable, .database, .migration, .notFound, .archived, .noCheckIn,
      IntentFailure(code: "validation", message: "Choose a valid date.", field: "logicalDate")]
    for failure in failures {
      let error: any Error = failure
      let localized = try XCTUnwrap(error as? any CustomLocalizedStringResourceConvertible)
      XCTAssertEqual(String(localized: localized.localizedStringResource), failure.message)
    }
  }

  func testEntityResolutionOmitsMissingArchivedAndDeletedBoardsInActiveOrder() throws {
    let harness = try harness()
    let first = "00000000-0000-4000-8000-00000000a001"
    let second = "00000000-0000-4000-8000-00000000a002"
    let archived = "00000000-0000-4000-8000-00000000a003"
    let missing = "00000000-0000-4000-8000-00000000a099"
    let resolved = try harness.executor.listBoards(identifiers: [second, missing, archived, first, second]).get()
    XCTAssertEqual(resolved.map(\.boardId), [first, second])
    XCTAssertEqual(try harness.executor.listBoards(identifiers: []).get(), [])
    XCTAssertEqual(try harness.executor.listBoards(identifiers: [missing, archived]).get(), [])
    try harness.database.run("UPDATE boards SET deleted_at = 1 WHERE id = ?", [.text(second)])
    XCTAssertEqual(try harness.executor.listBoards(identifiers: [second]).get(), [])
    XCTAssertEqual(try harness.database.rows("SELECT COUNT(*) AS count FROM command_receipts").first?["count"]?.number, 0)
    XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: archived)).error, .archived)
    XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: second)).error, .notFound)
    XCTAssertEqual(try harness.database.rows("SELECT COUNT(*) AS count FROM check_ins").first?["count"]?.number, 0)
    XCTAssertEqual(try harness.database.rows("SELECT COUNT(*) AS count FROM mutation_outbox").first?["count"]?.number, 0)
  }

  func testReplaysTypeScriptFailureReceiptWithOptionalRetryableOmitted() throws {
    let harness = try harness()
    let commandId = harness.id()
    let receipt = #"{"ok":false,"error":{"code":"validation","message":"Amount must be positive.","field":"amount"}}"#
    try harness.database.run("INSERT INTO command_receipts VALUES (?, ?, 0)", [.text(commandId), .text(receipt)])
    let result = harness.executor.checkIn(IntentCheckInInput(commandId: commandId, boardId: "00000000-0000-4000-8000-00000000a001"))
    XCTAssertEqual(result.error, IntentFailure(code: "validation", message: "Amount must be positive.", field: "amount"))
    XCTAssertEqual(try harness.database.rows("SELECT * FROM check_ins").count, 0)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM mutation_outbox").count, 0)
  }

  func testWrapperReplayPrecedesEntityResolutionAndRemovalConfirmation() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a001"
    let createId = harness.id()
    XCTAssertNil(try harness.executor.replay(commandId: createId, as: IntentCreatedCheckIn.self))
    let created = try harness.executor.checkIn(IntentCheckInInput(commandId: createId, boardId: board)).get()
    let removeId = harness.id()
    let removed = try harness.executor.removeLatest(commandId: removeId, boardId: board).get()
    XCTAssertEqual(harness.executor.removalCandidate(boardId: board, logicalDate: nil).error, .noCheckIn)
    XCTAssertEqual(try harness.executor.replay(commandId: removeId, as: IntentRemovedCheckIn.self)?.get(), removed)
    try harness.database.run("UPDATE boards SET archived_at = 1 WHERE id = ?", [.text(board)])
    XCTAssertThrowsError(try harness.executor.activeBoard(id: board))
    XCTAssertEqual(try harness.executor.replay(commandId: createId, as: IntentCreatedCheckIn.self)?.get(), created)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM command_receipts").count, 2)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM mutation_outbox").count, 2)
  }

  func testMutationTransactionUpdatesReceiptClockOutboxAndProjection() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a001"
    let id = harness.id()
    let result = try harness.executor.checkIn(IntentCheckInInput(commandId: id, boardId: board, note: "  thought  ")).get()
    let row = try XCTUnwrap(harness.database.rows("SELECT * FROM check_ins WHERE id = ?", [.text(result.checkInId)]).first)
    XCTAssertEqual(row["note"]?.string, "thought")
    XCTAssertEqual(row["idempotency_key"]?.string, id)
    XCTAssertEqual(row["mutation_stamp"]?.string, "01788105600000-00000-00000000-0000-4000-8000-00000000d001")
    XCTAssertEqual(try harness.database.rows("SELECT * FROM mutation_outbox").count, 1)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM command_receipts").count, 1)
    XCTAssertEqual(try harness.database.rows("SELECT strip FROM widget_board_rows WHERE board_id = ?", [.text(board)]).first?["strip"]?.string, "[0,0,0,0,0,0,1]")
    harness.instant += 86_400_000
    XCTAssertEqual(try harness.executor.checkIn(IntentCheckInInput(commandId: id, boardId: board)).get(), result)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM mutation_outbox").count, 1)
  }

  func testStorageFailureRollsBackEveryMutationAndCanRetrySameCommand() throws {
    let harness = try harness()
    try harness.database.run("CREATE TRIGGER fail_outbox BEFORE INSERT ON mutation_outbox BEGIN SELECT RAISE(ABORT, 'private database details'); END")
    let input = IntentCheckInInput(commandId: harness.id(), boardId: "00000000-0000-4000-8000-00000000a001")
    let result = harness.executor.checkIn(input)
    XCTAssertEqual(result.error, .database)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM check_ins").count, 0)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM command_receipts").count, 0)
    XCTAssertEqual(try harness.database.rows("SELECT hlc_wall_time FROM app_settings").first?["hlc_wall_time"]?.number, 0)
    XCTAssertEqual(try harness.database.rows("SELECT strip FROM widget_board_rows").first?["strip"]?.string, "[0,0,0,0,0,0,0]")
    try harness.database.run("DROP TRIGGER fail_outbox")
    XCTAssertTrue(harness.executor.checkIn(input).ok)
  }

  func testAmountNoteAndDateValidationNeverInsertPartialRows() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a002"
    for amount in [0, -1, Double.nan, Double.infinity, 1_000_000_001, 1.0001] {
      XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board, amount: amount)).error?.code, "validation")
    }
    for date in ["2026-02-30", "2026-13-01", "2026-9-01", "2027-01-01"] {
      XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board, logicalDate: date)).error?.code, "validation")
    }
    let family = "e\u{0301}"
    XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board, note: String(repeating: family, count: 5001))).error?.field, "note")
    XCTAssertEqual(try harness.database.rows("SELECT * FROM check_ins").count, 0)
    XCTAssertTrue(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board, amount: 1.125)).ok)
  }

  func testShiftedDateAndDSTOffsetAreStoredAtTheEventInstant() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a001"
    try harness.database.run("UPDATE boards SET tracks_time = 1, start_of_day_minute = 240 WHERE id = ?", [.text(board)])
    let instant = ISO8601DateFormatter().date(from: "2026-03-08T07:30:00Z")!.timeIntervalSince1970 * 1000
    let created = try harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board, occurredAtUtc: instant)).get()
    XCTAssertEqual(created.logicalDate, "2026-03-07")
    let row = try XCTUnwrap(harness.database.rows("SELECT * FROM check_ins WHERE id = ?", [.text(created.checkInId)]).first)
    XCTAssertEqual(row["offset_minutes"]?.number, -240)
    XCTAssertEqual(row["time_zone_id"]?.string, "America/New_York")
    XCTAssertEqual(row["occurred_at_utc"]?.number, instant)
  }

  func testRemovalConfirmsCandidateAndUsesHistoryOrderThenReplaysReceipt() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a001"
    let first = try harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board)).get()
    let candidate = try harness.executor.removalCandidate(boardId: board, logicalDate: nil).get()
    harness.instant += 1000
    let newest = try harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board)).get()
    XCTAssertEqual(harness.executor.removeLatest(commandId: harness.id(), boardId: board, expectedCheckInId: candidate.checkInId).error?.code, "conflict")
    let commandId = harness.id()
    let removed = try harness.executor.removeLatest(commandId: commandId, boardId: board, expectedCheckInId: newest.checkInId).get()
    XCTAssertEqual(removed.removedCheckInId, newest.checkInId)
    XCTAssertEqual(try harness.executor.removeLatest(commandId: commandId, boardId: board).get(), removed)
    XCTAssertEqual(try harness.executor.removalCandidate(boardId: board, logicalDate: nil).get().checkInId, first.checkInId)
  }

  func testUnknownSchemaAndChecksumRefuseMutationWithoutResettingTheStore() throws {
    let harness = try harness()
    try harness.database.run("PRAGMA user_version = 99")
    XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: "00000000-0000-4000-8000-00000000a001")).error, .migration)
    try harness.database.run("PRAGMA user_version = \(IntentExecutor.schemaVersion)")
    try harness.database.run("UPDATE schema_migrations SET checksum = 'changed' WHERE version = 1")
    XCTAssertEqual(harness.executor.listBoards().error, .migration)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM boards").count, 3)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM check_ins").count, 0)
  }

  func testWidgetTimelineUsesCommittedProjectionAndExpoSerializationShape() throws {
    let harness = try harness()
    XCTAssertTrue(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: "00000000-0000-4000-8000-00000000a001", note: "private text")).ok)
    let timeline = try harness.executor.widgetTimeline().get()
    XCTAssertEqual(timeline.entries.count, 2)
    XCTAssertEqual(timeline.entries[0].props.rows[0].strip, [0, 0, 0, 0, 0, 0, 1])
    XCTAssertFalse(timeline.entries[0].props.stale)
    XCTAssertTrue(timeline.entries[1].props.stale)
    XCTAssertGreaterThan(timeline.entries[1].timestamp, timeline.entries[0].timestamp)
    let data = try JSONEncoder().encode(timeline.entries)
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
    XCTAssertEqual(Set(json[0].keys), ["timestamp", "props"])
    XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("private text"))
  }

  func testSecondSQLiteConnectionReplaysTheSameReceiptWithoutDuplicatingOutbox() throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".db")
    defer { try? FileManager.default.removeItem(at: url) }
    let source = try fixture()
    let harness = try Harness(seed: source["seed"] as! [String: Any], migrations: migrations(), path: url.path)
    let second = IntentExecutor(database: try IntentDatabase(path: url.path), now: { harness.instant + 86_400_000 }, zone: { harness.timeZone })
    let input = IntentCheckInInput(commandId: harness.id(), boardId: "00000000-0000-4000-8000-00000000a001")
    let first = try harness.executor.checkIn(input).get()
    XCTAssertEqual(try second.checkIn(input).get(), first)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM mutation_outbox").count, 1)
    XCTAssertEqual(try harness.database.rows("SELECT * FROM check_ins").count, 1)
  }

  func testHistoryOrderingPrefersTimedRowsThenAscendingIdForTies() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a001"
    let first = try harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board)).get()
    let second = try harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board)).get()
    XCTAssertEqual(try harness.executor.removalCandidate(boardId: board, logicalDate: nil).get().checkInId, first.checkInId)
    try harness.database.run("UPDATE check_ins SET occurred_at_utc = ? WHERE id = ?", [.real(harness.instant - 1000), .text(second.checkInId)])
    XCTAssertEqual(try harness.executor.removalCandidate(boardId: board, logicalDate: nil).get().checkInId, second.checkInId)
    try harness.database.run("UPDATE check_ins SET occurred_at_utc = ? WHERE id = ?", [.real(harness.instant), .text(first.checkInId)])
    XCTAssertEqual(try harness.executor.removalCandidate(boardId: board, logicalDate: nil).get().checkInId, first.checkInId)
  }

  func testMissingStoreIsNeverCreatedAndNativeErrorsDoNotExposePaths() throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".db")
    XCTAssertThrowsError(try IntentDatabase(path: url.path)) { error in
      XCTAssertEqual(error as? IntentFailure, .unavailable)
      XCTAssertFalse(error.localizedDescription.contains(url.path))
    }
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
  }

  func testUnicodeNoteRoundTripsNullBytesAndTrimsTheSameWhitespaceAsJavaScript() throws {
    let harness = try harness()
    let note = "\u{FEFF}\u{00A0}hello\0world\u{00A0}"
    let created = try harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: "00000000-0000-4000-8000-00000000a001", note: note)).get()
    XCTAssertEqual(try harness.database.rows("SELECT note FROM check_ins WHERE id = ?", [.text(created.checkInId)]).first?["note"]?.string, "hello\0world")
  }

  func testArchivedDeletedAndMissingBoardsAreExcludedWithoutExposingNotes() throws {
    let harness = try harness()
    let board = "00000000-0000-4000-8000-00000000a001"
    try harness.database.run("UPDATE boards SET deleted_at = 1 WHERE id = ?", [.text(board)])
    XCTAssertEqual(try harness.executor.listBoards().get().map(\.title), ["water"])
    XCTAssertEqual(harness.executor.today(boardId: board).error?.code, "not_found")
    XCTAssertEqual(harness.executor.checkIn(IntentCheckInInput(commandId: harness.id(), boardId: board)).error?.code, "not_found")
  }

  func testCalendarWallTimeMappingAcrossDSTAndShiftedDates() throws {
    let gap = try IntentCalendar.occurredAt(logicalDate: "2026-03-07", hour: 2, minute: 30, startMinute: 240, zone: "America/New_York")
    XCTAssertEqual(ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: gap / 1000)), "2026-03-08T07:30:00Z")
    let repeatTime = try IntentCalendar.occurredAt(logicalDate: "2026-11-01", hour: 1, minute: 30, startMinute: 0, zone: "America/New_York")
    XCTAssertEqual(ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: repeatTime / 1000)), "2026-11-01T05:30:00Z")
  }
}
