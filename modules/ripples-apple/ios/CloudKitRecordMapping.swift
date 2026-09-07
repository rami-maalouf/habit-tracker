import CloudKit
import Foundation

enum CloudKitFieldValue: Codable, Equatable, Sendable {
  case string(String)
  case number(Double)
  case null

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer()
    if value.decodeNil() { self = .null }
    else if let string = try? value.decode(String.self) { self = .string(string) }
    else if let number = try? value.decode(Double.self), number.isFinite { self = .number(number) }
    else { throw CloudKitFailure.failure }
  }

  func encode(to encoder: Encoder) throws {
    var value = encoder.singleValueContainer()
    switch self {
    case .string(let string): try value.encode(string)
    case .number(let number): try value.encode(number)
    case .null: try value.encodeNil()
    }
  }

  var string: String? {
    if case .string(let value) = self { return value }
    return nil
  }
}

struct CloudKitWireRecord: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let entityType: String
  let entityId: String
  let mutationStamp: String
  let deleted: Bool
  var fields: [String: CloudKitFieldValue]
}

struct CloudKitWirePage: Codable, Sendable {
  let records: [CloudKitWireRecord]
  let nextToken: String?
  let more: Bool

  enum CodingKeys: String, CodingKey { case records, nextToken, more }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(records, forKey: .records)
    try values.encode(nextToken, forKey: .nextToken)
    try values.encode(more, forKey: .more)
  }
}

enum CloudKitRecordMapping {
  static let columns: [String: [String]] = [
    "board": ["id", "title", "symbol", "accent_hex", "uses_tinted_background", "tracks_amount",
      "amount_unit", "quick_amount", "tracks_time", "start_of_day_minute", "metrics_enabled",
      "order_key", "archived_at", "created_at", "updated_at", "deleted_at"],
    "check_in": ["id", "board_id", "logical_date", "occurred_at_utc", "time_zone_id", "offset_minutes",
      "amount", "note", "source", "idempotency_key", "created_at", "updated_at", "deleted_at"],
    "reminder": ["id", "board_id", "weekdays_mask", "minute_of_day", "message", "enabled",
      "created_at", "updated_at", "deleted_at"],
    "activity_period": ["board_id", "start_date", "end_date", "deleted_at"],
    "settings": ["metrics_education_dismissed"]
  ]

  // these empty values match records.ts and preserve sqlite's required columns.
  private static let tombstoneValues: [String: [String: CloudKitFieldValue]] = [
    "board": ["title": .string(""), "symbol": .string(""), "accent_hex": .string(""),
      "amount_unit": .null, "quick_amount": .number(0), "uses_tinted_background": .number(0),
      "tracks_amount": .number(0), "tracks_time": .number(0), "start_of_day_minute": .number(0),
      "metrics_enabled": .number(0), "archived_at": .null],
    "check_in": ["note": .null, "amount": .null, "logical_date": .string(""),
      "occurred_at_utc": .null, "time_zone_id": .null, "offset_minutes": .null],
    "reminder": ["message": .null, "weekdays_mask": .number(0), "minute_of_day": .number(0),
      "enabled": .number(0)],
    "activity_period": ["end_date": .null],
    "settings": [:]
  ]

  static func normalized(_ input: CloudKitWireRecord) throws -> CloudKitWireRecord {
    guard input.schemaVersion == 1, let keys = columns[input.entityType],
      Set(input.fields.keys) == Set(keys),
      !input.entityId.isEmpty, input.entityId.utf8.count <= 255,
      input.mutationStamp.range(of: "^[0-9]{14}-[0-9a-z]{5}-[A-Za-z0-9_-]+$",
        options: .regularExpression) != nil else { throw CloudKitFailure.failure }
    for value in input.fields.values {
      if case .number(let number) = value, !number.isFinite { throw CloudKitFailure.failure }
    }
    switch input.entityType {
    case "settings":
      guard input.entityId == "app-settings", !input.deleted else { throw CloudKitFailure.failure }
    case "activity_period":
      guard let boardId = input.fields["board_id"]?.string,
        let startDate = input.fields["start_date"]?.string,
        input.entityId == "\(boardId)|\(startDate)" else { throw CloudKitFailure.failure }
    default:
      guard input.fields["id"]?.string == input.entityId else { throw CloudKitFailure.failure }
    }
    var output = input
    if input.deleted {
      for (key, value) in tombstoneValues[input.entityType] ?? [:] { output.fields[key] = value }
      if input.entityType == "check_in" {
        output.fields["source"] = .string("sync")
        output.fields["idempotency_key"] = .string(input.entityId)
      }
    }
    return output
  }

  static func toRecord(_ input: CloudKitWireRecord, zoneID: CKRecordZone.ID, existing: CKRecord? = nil) throws -> CKRecord {
    let input = try normalized(input)
    let id = CKRecord.ID(recordName: input.entityId, zoneID: zoneID)
    if let existing, existing.recordID != id || existing.recordType != input.entityType {
      throw CloudKitFailure.failure
    }
    let record = existing?.copy() as? CKRecord ?? CKRecord(recordType: input.entityType, recordID: id)
    // conditional saves preserve the fetched change tag; clearing every old key
    // ensures a tombstone also erases previously stored user content.
    for key in record.allKeys() { record[key] = nil }
    record["schema_version"] = NSNumber(value: input.schemaVersion)
    record["mutation_stamp"] = input.mutationStamp as NSString
    record["deleted"] = NSNumber(value: input.deleted)
    for (key, value) in input.fields {
      switch value {
      case .string(let string): record[key] = string as NSString
      case .number(let number): record[key] = NSNumber(value: number)
      case .null: record[key] = nil
      }
    }
    return record
  }

  static func fromRecord(_ record: CKRecord) throws -> CloudKitWireRecord {
    guard let keys = columns[record.recordType],
      let version = record["schema_version"] as? NSNumber, version.doubleValue == 1,
      let stamp = record["mutation_stamp"] as? String,
      let deleted = record["deleted"] as? NSNumber,
      deleted.doubleValue == 0 || deleted.doubleValue == 1 else { throw CloudKitFailure.failure }
    var fields: [String: CloudKitFieldValue] = [:]
    for key in keys {
      switch record[key] {
      case nil: fields[key] = .null
      case let value as String: fields[key] = .string(value)
      case let value as NSNumber where value.doubleValue.isFinite: fields[key] = .number(value.doubleValue)
      default: throw CloudKitFailure.failure
      }
    }
    return try normalized(CloudKitWireRecord(schemaVersion: 1, entityType: record.recordType,
      entityId: record.recordID.recordName, mutationStamp: stamp, deleted: deleted.boolValue, fields: fields))
  }
}
