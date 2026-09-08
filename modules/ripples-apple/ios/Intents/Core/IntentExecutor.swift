import Foundation

final class IntentExecutor {
  let database: IntentDatabase
  let now: () -> Double
  let zone: () -> String
  let uuid: () -> String

  // native code never migrates. the fixture test compares these checksums
  // with the authoritative typescript migrations before executing cases.
  static let schemaVersion = 5
  static let migrationChecksums = [1: "c459cef6", 2: "34363ca0", 3: "bac085e2", 4: "dcbb9394", 5: "633f8fb7"]

  init(database: IntentDatabase, now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 },
       zone: @escaping () -> String = { TimeZone.current.identifier },
       uuid: @escaping () -> String = { UUID().uuidString.lowercased() }) {
    self.database = database
    self.now = now
    self.zone = zone
    self.uuid = uuid
  }

  func listBoards(identifiers: [String]? = nil) -> IntentOutcome<[IntentBoard]> {
    let requested = identifiers.map(Set.init)
    return read {
      try self.activeBoards().filter { requested?.contains($0.id) ?? true }
        .map { IntentBoard(boardId: $0.id, title: $0.title) }
    }
  }

  func activeBoard(id: String) throws -> IntentBoardRecord {
    try read {
      guard let board = try self.board(id: id) else { throw IntentFailure.notFound }
      guard !board.archived else { throw IntentFailure.archived }
      return board
    }.get()
  }

  // wrappers replay before resolving entities, optional dates, or confirmation.
  // the write transaction repeats this lookup to cover concurrent invocations.
  func replay<Value: Codable & Sendable>(commandId: String, as type: Value.Type) throws -> IntentOutcome<Value>? {
    try read { try self.storedOutcome(commandId) as IntentOutcome<Value>? }.get()
  }

  func checkIn(_ input: IntentCheckInInput) -> IntentOutcome<IntentCreatedCheckIn> {
    // javascript trim includes the byte-order mark and uses unicode code
    // points, not grapheme clusters, for its 10,000-character limit.
    let whitespace = CharacterSet(charactersIn: "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}")
    let trimmed = input.note?.trimmingCharacters(in: whitespace)
    let note = trimmed?.isEmpty == true ? nil : trimmed
    if let note, note.unicodeScalars.count > 10_000 {
      return .failure(IntentFailure(code: "validation", message: "Notes are limited to 10,000 characters.", field: "note"))
    }
    guard ["shortcut", "siri"].contains(input.source) else {
      return .failure(IntentFailure(code: "validation", message: "Choose a supported automation source.", field: "source"))
    }
    return command(input.commandId) { clock, instant, zone in
      guard let board = try self.board(id: input.boardId) else { return .failure(.notFound) }
      guard !board.archived else { return .failure(.archived) }
      let today = try IntentCalendar.logicalDate(utcMs: instant, zone: zone, startMinute: board.startOfDayMinute)
      var amount: Double?
      // the automation contract ignores an amount on non-amount boards.
      if board.tracksAmount {
        let candidate = input.amount ?? board.quickAmount
        guard candidate.isFinite, candidate > 0 else {
          return .failure(IntentFailure(code: "validation", message: "Enter an amount greater than zero.", field: "amount"))
        }
        guard candidate <= 1_000_000_000 else {
          return .failure(IntentFailure(code: "validation", message: "The amount is too large.", field: "amount"))
        }
        guard abs(candidate * 1000 - (candidate * 1000).rounded()) <= 1e-6 else {
          return .failure(IntentFailure(code: "validation", message: "Amounts use at most three decimal places.", field: "amount"))
        }
        amount = candidate
      }
      let occurredAt = board.tracksTime ? input.occurredAtUtc ?? instant : nil
      if let occurredAt, !occurredAt.isFinite || abs(occurredAt) > 8_640_000_000_000_000 {
        return .failure(IntentFailure(code: "validation", message: "Choose a valid time.", field: "occurredAtUtc"))
      }
      let date: String
      if let explicit = input.logicalDate {
        date = explicit
      } else if let occurredAt {
        date = try IntentCalendar.logicalDate(utcMs: occurredAt, zone: zone, startMinute: board.startOfDayMinute)
      } else {
        date = today
      }
      guard IntentCalendar.isValidDate(date) else {
        return .failure(IntentFailure(code: "validation", message: "Dates use the YYYY-MM-DD form.", field: "logicalDate"))
      }
      guard date <= today else {
        return .failure(IntentFailure(code: "validation", message: "Future dates cannot receive check-ins.", field: "logicalDate"))
      }
      let offset = try occurredAt.map { date -> Double in
        Double(try IntentCalendar.calendar(zone: zone).timeZone.secondsFromGMT(for: Date(timeIntervalSince1970: date / 1000))) / 60
      }
      let stamp = clock.advance(now: Int64(instant))
      let id = self.uuid()
      try self.database.run("""
        INSERT INTO check_ins (id, board_id, logical_date, occurred_at_utc, time_zone_id,
          offset_minutes, amount, note, source, idempotency_key, created_at, updated_at, mutation_stamp, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """, [.text(id), .text(board.id), .text(date), .number(occurredAt),
              .string(board.tracksTime ? zone : nil), .number(offset), .number(amount), .string(note),
              .text(input.source), .text(input.commandId), .integer(Int64(instant)), .integer(Int64(instant)), .text(stamp)])
      try self.appendOutbox(id: id, stamp: stamp, instant: instant)
      try self.rebuildWidgets(instant: instant, zone: zone)
      return .success(IntentCreatedCheckIn(checkInId: id, logicalDate: date))
    }
  }

  func removalCandidate(boardId: String, logicalDate: String?) -> IntentOutcome<IntentRemovalCandidate> {
    read {
      guard let board = try self.board(id: boardId) else { throw IntentFailure.notFound }
      guard !board.archived else { throw IntentFailure.archived }
      let date = try logicalDate ?? IntentCalendar.logicalDate(utcMs: self.now(), zone: self.zone(), startMinute: board.startOfDayMinute)
      guard let id = try self.latestCheckIn(boardId: boardId, date: date) else { throw IntentFailure.noCheckIn }
      return IntentRemovalCandidate(checkInId: id, boardTitle: board.title, logicalDate: date)
    }
  }

  func removeLatest(commandId: String, boardId: String, logicalDate: String? = nil,
                    expectedCheckInId: String? = nil) -> IntentOutcome<IntentRemovedCheckIn> {
    command(commandId) { clock, instant, zone in
      guard let board = try self.board(id: boardId) else { return .failure(.notFound) }
      guard !board.archived else { return .failure(.archived) }
      let date = try logicalDate ?? IntentCalendar.logicalDate(utcMs: instant, zone: zone, startMinute: board.startOfDayMinute)
      guard let id = try self.latestCheckIn(boardId: boardId, date: date) else { return .failure(.noCheckIn) }
      if let expectedCheckInId, id != expectedCheckInId {
        return .failure(IntentFailure(code: "conflict", message: "The latest check-in changed. Run the shortcut again to review it."))
      }
      let stamp = clock.advance(now: Int64(instant))
      try self.database.run("UPDATE check_ins SET deleted_at = ?, updated_at = ?, mutation_stamp = ? WHERE id = ?",
                            [.integer(Int64(instant)), .integer(Int64(instant)), .text(stamp), .text(id)])
      try self.appendOutbox(id: id, stamp: stamp, instant: instant)
      try self.rebuildWidgets(instant: instant, zone: zone)
      return .success(IntentRemovedCheckIn(removedCheckInId: id, logicalDate: date))
    }
  }

  func today(boardId: String? = nil) -> IntentOutcome<IntentTodayCheckIns> {
    read {
      let active = try self.activeBoards()
      let scoped = active.filter { boardId == nil || $0.id == boardId }
      if boardId != nil && scoped.isEmpty { throw IntentFailure.notFound }
      let instant = self.now(), zone = self.zone()
      let boards = try scoped.map { board -> IntentTodayCount in
        let date = try IntentCalendar.logicalDate(utcMs: instant, zone: zone, startMinute: board.startOfDayMinute)
        let count = try self.database.rows("SELECT COUNT(*) AS count FROM check_ins WHERE board_id = ? AND logical_date = ? AND deleted_at IS NULL", [.text(board.id), .text(date)]).first?["count"]?.number ?? 0
        return IntentTodayCount(title: board.title, count: Int(count))
      }
      return IntentTodayCheckIns(boards: boards, total: boards.reduce(0) { $0 + $1.count })
    }
  }

  func widgetTimeline() -> IntentOutcome<IntentWidgetTimeline> {
    read {
      let rows = try self.database.rows("SELECT * FROM widget_board_rows ORDER BY position LIMIT 12")
      let values = try rows.map { row -> IntentWidgetRow in
        guard let id = row["board_id"]?.string, let title = row["title"]?.string,
              let symbol = row["symbol"]?.string, let accent = row["accent_hex"]?.string,
              let strip = row["strip"]?.string,
              let data = strip.data(using: .utf8) else { throw IntentStorageError.unavailable }
        return IntentWidgetRow(boardId: id, title: title, symbol: symbol, accentHex: accent,
                               strip: try JSONDecoder().decode([Int].self, from: data))
      }
      return try IntentWidgetTimeline(rows: values, instant: self.now(), zone: self.zone())
    }
  }

  private func command<Value: Codable & Sendable>(_ commandId: String,
      work: (inout IntentHybridClock, Double, String) throws -> IntentOutcome<Value>) -> IntentOutcome<Value> {
    guard commandId.range(of: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", options: .regularExpression) != nil else {
      return .failure(IntentFailure(code: "validation", message: "Command ids must be uuids.", field: "commandId"))
    }
    do {
      return try database.transaction(exclusive: true) {
        try validateSchema()
        if let receipt: IntentOutcome<Value> = try storedOutcome(commandId) { return receipt }
        guard let settings = try database.rows("SELECT device_id, hlc_wall_time, hlc_counter FROM app_settings WHERE id = 1").first,
              let deviceId = settings["device_id"]?.string,
              let wall = settings["hlc_wall_time"]?.number,
              let counter = settings["hlc_counter"]?.number,
              let wallTime = Int64(exactly: wall), let counterValue = Int64(exactly: counter),
              wallTime >= 0, counterValue >= 0, counterValue < 9_007_199_254_740_991 else { throw IntentFailure.unavailable }
        var clock = IntentHybridClock(wallTime: wallTime, counter: counterValue, deviceId: deviceId)
        let instant = floor(now())
        guard Int64(exactly: instant) != nil else { throw IntentFailure.database }
        let outcome = try work(&clock, instant, zone())
        try database.run("UPDATE app_settings SET hlc_wall_time = ?, hlc_counter = ? WHERE id = 1", [.integer(clock.wallTime), .integer(clock.counter)])
        let encoded = try JSONEncoder().encode(outcome)
        try database.run("INSERT INTO command_receipts (command_id, outcome, created_at) VALUES (?, ?, ?)",
                         [.text(commandId), .text(String(decoding: encoded, as: UTF8.self)), .integer(Int64(instant))])
        return outcome
      }
    } catch let error as IntentFailure { return .failure(error) }
      catch { return .failure(.database) }
  }

  private func read<Value: Codable & Sendable>(_ work: () throws -> Value) -> IntentOutcome<Value> {
    do {
      return try database.transaction(exclusive: false) {
        try validateSchema()
        return .success(try work())
      }
    } catch let error as IntentFailure { return .failure(error) }
      catch { return .failure(.database) }
  }

  private func storedOutcome<Value: Codable & Sendable>(_ commandId: String) throws -> IntentOutcome<Value>? {
    guard let receipt = try database.rows("SELECT outcome FROM command_receipts WHERE command_id = ?", [.text(commandId)]).first?["outcome"]?.string else { return nil }
    return try JSONDecoder().decode(IntentOutcome<Value>.self, from: Data(receipt.utf8))
  }

  private func validateSchema() throws {
    guard try database.rows("PRAGMA user_version").first?["user_version"]?.number == Double(Self.schemaVersion) else { throw IntentFailure.migration }
    let applied = try database.rows("SELECT version, checksum FROM schema_migrations ORDER BY version")
    guard applied.count == Self.migrationChecksums.count else { throw IntentFailure.migration }
    for row in applied {
      guard let version = row["version"]?.number, let checksum = row["checksum"]?.string,
            Self.migrationChecksums[Int(version)] == checksum else { throw IntentFailure.migration }
    }
  }

  private func activeBoards() throws -> [IntentBoardRecord] {
    try database.rows("SELECT * FROM boards WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY order_key, id").map(Self.decodeBoard)
  }

  private func board(id: String) throws -> IntentBoardRecord? {
    try database.rows("SELECT * FROM boards WHERE id = ? AND deleted_at IS NULL", [.text(id)]).first.map(Self.decodeBoard)
  }

  private static func decodeBoard(_ row: [String: IntentSQLValue]) throws -> IntentBoardRecord {
    guard let id = row["id"]?.string, let title = row["title"]?.string, let symbol = row["symbol"]?.string,
          let accent = row["accent_hex"]?.string, let quickAmount = row["quick_amount"]?.number,
          let start = row["start_of_day_minute"]?.number else { throw IntentStorageError.unavailable }
    return IntentBoardRecord(id: id, title: title, symbol: symbol, accentHex: accent,
      tracksAmount: row["tracks_amount"]?.number == 1, quickAmount: quickAmount,
      tracksTime: row["tracks_time"]?.number == 1, startOfDayMinute: Int(start),
      archived: row["archived_at"] != .null)
  }

  private func latestCheckIn(boardId: String, date: String) throws -> String? {
    try database.rows("""
      SELECT id FROM check_ins WHERE board_id = ? AND logical_date = ? AND deleted_at IS NULL
      ORDER BY CASE WHEN occurred_at_utc IS NULL THEN 1 ELSE 0 END, occurred_at_utc DESC, created_at DESC, id LIMIT 1
      """, [.text(boardId), .text(date)]).first?["id"]?.string
  }

  private func appendOutbox(id: String, stamp: String, instant: Double) throws {
    try database.run("INSERT INTO mutation_outbox (entity_type, entity_id, mutation_stamp, created_at) VALUES ('check_in', ?, ?, ?)",
                      [.text(id), .text(stamp), .integer(Int64(instant))])
  }

  private func rebuildWidgets(instant: Double, zone: String) throws {
    let boards = try activeBoards()
    try database.run("DELETE FROM widget_board_rows")
    for (position, board) in boards.enumerated() {
      let today = try IntentCalendar.logicalDate(utcMs: instant, zone: zone, startMinute: board.startOfDayMinute)
      let start = try IntentCalendar.addingDays(-6, to: today)
      let counts = try database.rows("""
        SELECT logical_date, COUNT(*) AS count FROM check_ins
        WHERE board_id = ? AND deleted_at IS NULL AND logical_date BETWEEN ? AND ? GROUP BY logical_date
        """, [.text(board.id), .text(start), .text(today)])
      let byDate = Dictionary(uniqueKeysWithValues: counts.map { ($0["logical_date"]!.string!, Int($0["count"]!.number!)) })
      let strip = try (0..<7).map { byDate[try IntentCalendar.addingDays($0 - 6, to: today)] ?? 0 }
      let encoded = String(decoding: try JSONEncoder().encode(strip), as: UTF8.self)
      try database.run("""
        INSERT INTO widget_board_rows (board_id, position, title, symbol, accent_hex, strip, strip_end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [.text(board.id), .integer(Int64(position)), .text(board.title), .text(board.symbol), .text(board.accentHex), .text(encoded), .text(today)])
    }
  }
}
