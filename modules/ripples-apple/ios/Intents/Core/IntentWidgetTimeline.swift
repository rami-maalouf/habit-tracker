import Foundation

struct IntentWidgetRow: Codable, Equatable, Sendable {
  let boardId: String
  let title: String
  let symbol: String
  let accentHex: String
  let strip: [Int]
}

struct IntentWidgetProps: Codable, Equatable, Sendable {
  let rows: [IntentWidgetRow]
  let stale: Bool
}

struct IntentWidgetEntry: Codable, Equatable, Sendable {
  let timestamp: Int64
  let props: IntentWidgetProps
}

struct IntentWidgetTimeline: Codable, Sendable {
  let entries: [IntentWidgetEntry]

  init(rows: [IntentWidgetRow], instant: Double, zone: String) throws {
    let calendar = try IntentCalendar.calendar(zone: zone)
    let components = calendar.dateComponents([.hour, .minute, .second], from: Date(timeIntervalSince1970: instant / 1000))
    let elapsed = ((components.hour! * 60 + components.minute!) * 60 + components.second!) * 1000
    // matches nextWidgetRefreshUtc in widget-props.ts, including its stale marker
    let boundary = instant + Double(86_400_000 - elapsed) + 1000
    entries = [
      IntentWidgetEntry(timestamp: Int64(instant), props: IntentWidgetProps(rows: Array(rows.prefix(12)), stale: false)),
      IntentWidgetEntry(timestamp: Int64(boundary), props: IntentWidgetProps(rows: Array(rows.prefix(12)), stale: true)),
    ]
  }
}
