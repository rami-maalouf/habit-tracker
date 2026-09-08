import Foundation

struct IntentFailure: Error, Codable, LocalizedError, CustomLocalizedStringResourceConvertible, Equatable, Sendable {
  let code: String
  let message: String
  var field: String? = nil
  var retryable = false

  init(code: String, message: String, field: String? = nil, retryable: Bool = false) {
    self.code = code
    self.message = message
    self.field = field
    self.retryable = retryable
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    code = try values.decode(String.self, forKey: .code)
    message = try values.decode(String.self, forKey: .message)
    field = try values.decodeIfPresent(String.self, forKey: .field)
    retryable = try values.decodeIfPresent(Bool.self, forKey: .retryable) ?? false
  }

  var errorDescription: String? { message }
  var localizedStringResource: LocalizedStringResource { "\(message)" }

  static let unavailable = IntentFailure(code: "unavailable", message: "Open Ripples once to prepare your boards, then try again.", retryable: true)
  static let database = IntentFailure(code: "database", message: "Your boards could not be accessed. Try again after opening Ripples.", retryable: true)
  static let migration = IntentFailure(code: "migration", message: "Open the latest version of Ripples to update your database, then try again.", retryable: true)
  static let notFound = IntentFailure(code: "not_found", message: "That board is not available. Choose an active board in Ripples.")
  static let archived = IntentFailure(code: "archived", message: "That board is archived. Restore it in Ripples before changing check-ins.")
  static let noCheckIn = IntentFailure(code: "not_found", message: "There is no check-in to remove for that day.")
}

struct IntentOutcome<Value: Codable & Sendable>: Codable, Sendable {
  let ok: Bool
  let value: Value?
  let error: IntentFailure?

  static func success(_ value: Value) -> Self { Self(ok: true, value: value, error: nil) }
  static func failure(_ error: IntentFailure) -> Self { Self(ok: false, value: nil, error: error) }

  func get() throws -> Value {
    guard ok, let value else { throw error ?? IntentFailure.database }
    return value
  }
}

struct IntentBoard: Codable, Equatable, Sendable {
  let boardId: String
  let title: String
}

struct IntentBoardRecord: Codable, Sendable {
  let id: String
  let title: String
  let symbol: String
  let accentHex: String
  let tracksAmount: Bool
  let quickAmount: Double
  let tracksTime: Bool
  let startOfDayMinute: Int
  let archived: Bool
}

struct IntentCheckInInput: Sendable {
  let commandId: String
  let boardId: String
  var logicalDate: String? = nil
  var occurredAtUtc: Double? = nil
  var amount: Double? = nil
  var note: String? = nil
  var source = "shortcut"
}

struct IntentCreatedCheckIn: Codable, Equatable, Sendable {
  let checkInId: String
  let logicalDate: String
}

struct IntentRemovedCheckIn: Codable, Equatable, Sendable {
  let removedCheckInId: String
  let logicalDate: String
}

struct IntentTodayCount: Codable, Equatable, Sendable {
  let title: String
  let count: Int
}

struct IntentTodayCheckIns: Codable, Equatable, Sendable {
  let boards: [IntentTodayCount]
  let total: Int
}

struct IntentRemovalCandidate: Codable, Sendable {
  let checkInId: String
  let boardTitle: String
  let logicalDate: String
}

struct IntentHybridClock {
  var wallTime: Int64
  var counter: Int64
  let deviceId: String

  mutating func advance(now: Int64) -> String {
    if now > wallTime { wallTime = now; counter = 0 } else { counter += 1 }
    return Self.pad(String(wallTime), to: 14) + "-" + Self.pad(String(counter, radix: 36), to: 5) + "-" + deviceId
  }

  private static func pad(_ value: String, to width: Int) -> String {
    String(repeating: "0", count: max(0, width - value.count)) + value
  }
}
