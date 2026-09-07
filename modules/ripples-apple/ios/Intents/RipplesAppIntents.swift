#if os(iOS)
import AppIntents
import Foundation
import WidgetKit

public struct RipplesAppIntentsPackage: AppIntentsPackage {}

public struct RipplesBoardEntity: AppEntity {
  public static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Board")
  public static var defaultQuery = RipplesBoardQuery()
  public let id: String
  public let title: String

  public var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }

  public init(id: String, title: String) { self.id = id; self.title = title }
}

public struct RipplesBoardQuery: EntityStringQuery {
  public init() {}

  public func suggestedEntities() async throws -> [RipplesBoardEntity] {
    try RipplesIntentRuntime.open().listBoards().get().map { RipplesBoardEntity(id: $0.boardId, title: $0.title) }
  }

  public func entities(for identifiers: [String]) async throws -> [RipplesBoardEntity] {
    let active = try await suggestedEntities()
    let requested = Set(identifiers)
    let matches = active.filter { requested.contains($0.id) }
    guard matches.count == requested.count else { throw IntentFailure.notFound }
    return matches
  }

  public func entities(matching string: String) async throws -> [RipplesBoardEntity] {
    try await suggestedEntities().filter { $0.title.localizedCaseInsensitiveContains(string) }
  }
}

public struct RipplesCheckInIntent: AppIntent {
  public static var title: LocalizedStringResource = "Check In"
  public static var description = IntentDescription("Record a check-in on an active Ripples board.")

  @Parameter(title: "Board") public var board: RipplesBoardEntity
  @Parameter(title: "Date", kind: .date) public var date: DateComponents?
  @Parameter(title: "Time", kind: .time) public var time: DateComponents?
  @Parameter(title: "Amount") public var amount: Double?
  @Parameter(title: "Note") public var note: String?

  // a new invocation gets a new uuid; retrying this invocation reuses it.
  // app intents has no durable, cross-process execution token to persist.
  private let commandId = UUID().uuidString.lowercased()
  public init() {}

  public static var parameterSummary: some ParameterSummary {
    Summary("Check in to \(\.$board)") { \.$date; \.$time; \.$amount; \.$note }
  }

  @MainActor public func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let executor = try RipplesIntentRuntime.open()
    if let receipt = try executor.replay(commandId: commandId, as: IntentCreatedCheckIn.self) {
      let result = try receipt.get()
      RipplesIntentRuntime.publishWidgets(executor)
      let text = String(localized: "Checked in to \(board.title) for \(result.logicalDate).")
      return .result(value: text, dialog: "\(text)")
    }
    let record = try executor.activeBoard(id: board.id)
    let logicalDate = try RipplesIntentRuntime.logicalDate(date)
    var occurredAt: Double?
    if record.tracksTime, let time {
      guard let hour = time.hour, let minute = time.minute, (0...23).contains(hour), (0...59).contains(minute) else {
        throw IntentFailure(code: "validation", message: "Choose a valid local time.", field: "occurredAtUtc")
      }
      let date = try logicalDate ?? IntentCalendar.logicalDate(utcMs: executor.now(), zone: executor.zone(), startMinute: record.startOfDayMinute)
      occurredAt = try IntentCalendar.occurredAt(logicalDate: date, hour: hour, minute: minute,
        startMinute: record.startOfDayMinute, zone: executor.zone())
    }
    let result = try executor.checkIn(IntentCheckInInput(commandId: commandId, boardId: board.id,
      logicalDate: logicalDate, occurredAtUtc: occurredAt, amount: amount, note: note)).get()
    RipplesIntentRuntime.publishWidgets(executor)
    let text = String(localized: "Checked in to \(record.title) for \(result.logicalDate).")
    return .result(value: text, dialog: "\(text)")
  }
}

public struct RipplesRemoveLatestCheckInIntent: AppIntent {
  public static var title: LocalizedStringResource = "Remove Latest Check-In"
  public static var description = IntentDescription("Confirm and remove the latest check-in from an active Ripples board.")

  @Parameter(title: "Board") public var board: RipplesBoardEntity
  @Parameter(title: "Date", kind: .date) public var date: DateComponents?
  private let commandId = UUID().uuidString.lowercased()
  public init() {}

  public static var parameterSummary: some ParameterSummary {
    Summary("Remove the latest check-in from \(\.$board)") { \.$date }
  }

  @MainActor public func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let executor = try RipplesIntentRuntime.open()
    if let receipt = try executor.replay(commandId: commandId, as: IntentRemovedCheckIn.self) {
      let result = try receipt.get()
      RipplesIntentRuntime.publishWidgets(executor)
      let text = String(localized: "Removed the latest check-in from \(board.title) for \(result.logicalDate).")
      return .result(value: text, dialog: "\(text)")
    }
    let candidate = try executor.removalCandidate(boardId: board.id, logicalDate: RipplesIntentRuntime.logicalDate(date)).get()
    try await requestConfirmation(
      actionName: .custom(acceptLabel: "Remove", acceptAlternatives: [], denyLabel: "Cancel", denyAlternatives: [], destructive: true),
      dialog: "Remove the latest check-in from \(candidate.boardTitle) for \(candidate.logicalDate)?"
    )
    let result = try executor.removeLatest(commandId: commandId, boardId: board.id,
      logicalDate: candidate.logicalDate, expectedCheckInId: candidate.checkInId).get()
    RipplesIntentRuntime.publishWidgets(executor)
    let text = String(localized: "Removed the latest check-in from \(candidate.boardTitle) for \(result.logicalDate).")
    return .result(value: text, dialog: "\(text)")
  }
}

public struct RipplesTodayCheckInsIntent: AppIntent {
  public static var title: LocalizedStringResource = "Get Today's Check-Ins"
  public static var description = IntentDescription("Get check-in counts and board names for each board's current logical date.")

  @Parameter(title: "Board") public var board: RipplesBoardEntity?
  public init() {}

  public static var parameterSummary: some ParameterSummary {
    Summary("Get today's check-ins") { \.$board }
  }

  public func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let result = try RipplesIntentRuntime.open().today(boardId: board?.id).get()
    let lines = result.boards.map { String(localized: "\($0.title): \($0.count)") }
    let text = (lines + [String(localized: "Total: \(result.total)")]).joined(separator: "\n")
    return .result(value: text, dialog: "\(text)")
  }
}

enum RipplesIntentRuntime {
  static func open() throws -> IntentExecutor {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "RipplesAppGroupIdentifier") as? String,
          !group.isEmpty,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw IntentFailure.unavailable
    }
    return IntentExecutor(database: try IntentDatabase(path: container.appendingPathComponent("ripples.db").path))
  }

  static func logicalDate(_ components: DateComponents?) throws -> String? {
    guard let components else { return nil }
    guard let year = components.year, let month = components.month, let day = components.day else {
      throw IntentFailure(code: "validation", message: "Choose a valid date.", field: "logicalDate")
    }
    let value = String(format: "%04d-%02d-%02d", year, month, day)
    guard IntentCalendar.isValidDate(value) else {
      throw IntentFailure(code: "validation", message: "Choose a valid date.", field: "logicalDate")
    }
    return value
  }

  // sdk 57's widget reads serialized timeline props from this app-group
  // suite. update those props from committed sql before asking for reload.
  static func publishWidgets(_ executor: IntentExecutor) {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String,
          let defaults = UserDefaults(suiteName: group),
          defaults.string(forKey: "__expo_widgets_RipplesBoards_layout") != nil,
          let timeline = try? executor.widgetTimeline().get(),
          let data = try? JSONEncoder().encode(timeline.entries),
          let entries = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
    defaults.set(entries, forKey: "__expo_widgets_RipplesBoards_timeline")
    WidgetCenter.shared.reloadTimelines(ofKind: "RipplesBoards")
  }
}
#endif
