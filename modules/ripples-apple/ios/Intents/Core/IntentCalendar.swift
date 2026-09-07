import Foundation

enum IntentCalendar {
  static func calendar(zone: String) throws -> Calendar {
    guard let timeZone = TimeZone(identifier: zone) else { throw IntentFailure.database }
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = Locale(identifier: "en_US_POSIX")
    calendar.timeZone = timeZone
    return calendar
  }

  static func logicalDate(utcMs: Double, zone: String, startMinute: Int) throws -> String {
    let calendar = try calendar(zone: zone)
    let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: Date(timeIntervalSince1970: utcMs / 1000))
    guard let year = components.year, let month = components.month, let day = components.day,
          let hour = components.hour, let minute = components.minute else { throw IntentFailure.database }
    let date = String(format: "%04d-%02d-%02d", year, month, day)
    return hour * 60 + minute < startMinute ? try addingDays(-1, to: date) : date
  }

  static func isValidDate(_ value: String) -> Bool {
    guard value.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { return false }
    let parts = value.split(separator: "-").compactMap { Int($0) }
    let year = parts[0], month = parts[1], day = parts[2]
    guard (1...12).contains(month), day > 0 else { return false }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    let lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day <= lengths[month - 1]
  }

  static func addingDays(_ count: Int, to date: String) throws -> String {
    let parts = date.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { throw IntentFailure.database }
    let calendar = try calendar(zone: "UTC")
    guard let start = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
          let result = calendar.date(byAdding: .day, value: count, to: start) else { throw IntentFailure.database }
    let components = calendar.dateComponents([.year, .month, .day], from: result)
    return String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
  }

  // date and time intent parameters are wall-clock components. a time
  // before the shift belongs to the next calendar day of a logical date.
  static func occurredAt(logicalDate: String, hour: Int, minute: Int, startMinute: Int, zone: String) throws -> Double {
    let actualDate = hour * 60 + minute < startMinute ? try addingDays(1, to: logicalDate) : logicalDate
    let parts = actualDate.split(separator: "-").compactMap { Int($0) }
    let calendar = try calendar(zone: zone)
    guard let midnight = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
          let result = calendar.nextDate(after: midnight.addingTimeInterval(-1), matching: DateComponents(hour: hour, minute: minute), matchingPolicy: .nextTimePreservingSmallerComponents, repeatedTimePolicy: .first, direction: .forward) else {
      throw IntentFailure(code: "validation", message: "Choose a valid local time.", field: "occurredAtUtc")
    }
    return result.timeIntervalSince1970 * 1000
  }
}
