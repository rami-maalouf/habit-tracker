import CloudKit
import Foundation
import XCTest
@testable import RipplesCloudKit

func cloudKitFixtures() throws -> [CloudKitWireRecord] {
  let url = try XCTUnwrap(Bundle.module.url(forResource: "sync-records", withExtension: "json"))
  return try JSONDecoder().decode([CloudKitWireRecord].self, from: Data(contentsOf: url))
}

let testZone = CKRecordZone.ID(zoneName: "habit-tracker", ownerName: CKCurrentUserDefaultName)

final class CloudKitMappingTests: XCTestCase {
  func testSharedFixtureRoundTripsThroughCloudKitRecords() throws {
    let fixtures = try cloudKitFixtures()
    XCTAssertEqual(fixtures.count, 9)
    for fixture in fixtures {
      let record = try CloudKitRecordMapping.toRecord(fixture, zoneID: testZone)
      XCTAssertEqual(record.recordType, fixture.entityType)
      XCTAssertEqual(record.recordID.recordName, fixture.entityId)
      XCTAssertEqual(try CloudKitRecordMapping.fromRecord(record), fixture)
    }
  }

  func testTombstoneClearsPreviouslyStoredContentAndUnknownKeys() throws {
    let fixtures = try cloudKitFixtures()
    let live = try CloudKitRecordMapping.toRecord(fixtures[2], zoneID: testZone)
    live["unexpected_private_field"] = "synthetic secret" as NSString
    let deleted = try CloudKitRecordMapping.toRecord(fixtures[3], zoneID: testZone, existing: live)
    XCTAssertNil(deleted["note"])
    XCTAssertNil(deleted["amount"])
    XCTAssertNil(deleted["unexpected_private_field"])
    XCTAssertNotNil(live["note"])
    XCTAssertEqual(try CloudKitRecordMapping.fromRecord(deleted), fixtures[3])
  }

  func testTombstoneCannotCarryUnsanitizedUserContent() throws {
    var tombstone = try cloudKitFixtures()[3]
    tombstone.fields["note"] = .string("synthetic private note")
    tombstone.fields["amount"] = .number(42)
    tombstone.fields["source"] = .string("siri")
    tombstone.fields["idempotency_key"] = .string("synthetic-command-to-erase")
    let record = try CloudKitRecordMapping.toRecord(tombstone, zoneID: testZone)
    XCTAssertNil(record["note"])
    XCTAssertNil(record["amount"])
    XCTAssertEqual(record["board_id"] as? String, tombstone.fields["board_id"]?.string)
    XCTAssertEqual(record["source"] as? String, "sync")
    XCTAssertEqual(record["idempotency_key"] as? String, tombstone.entityId)
    XCTAssertFalse(String(describing: record).contains("synthetic-command-to-erase"))
  }

  func testUnknownFieldsAndInvalidStructureFailBeforeWriting() throws {
    var fixture = try cloudKitFixtures()[0]
    fixture.fields["device_id"] = .string("not-for-sync")
    XCTAssertThrowsError(try CloudKitRecordMapping.toRecord(fixture, zoneID: testZone))
    fixture = try cloudKitFixtures()[0]
    fixture.fields["id"] = .string("another-entity")
    XCTAssertThrowsError(try CloudKitRecordMapping.toRecord(fixture, zoneID: testZone))
    fixture = try cloudKitFixtures()[0]
    fixture.fields["quick_amount"] = .number(.infinity)
    XCTAssertThrowsError(try CloudKitRecordMapping.toRecord(fixture, zoneID: testZone))
  }

  func testMalformedServerRecordsDoNotBecomePages() throws {
    let record = try CloudKitRecordMapping.toRecord(cloudKitFixtures()[0], zoneID: testZone)
    record["schema_version"] = NSNumber(value: 2)
    XCTAssertThrowsError(try CloudKitRecordMapping.fromRecord(record))
    record["schema_version"] = NSNumber(value: 1)
    record["mutation_stamp"] = "not-a-stamp" as NSString
    XCTAssertThrowsError(try CloudKitRecordMapping.fromRecord(record))
  }

  func testTokenCodecRejectsMalformedAndDifferentContainerTokens() throws {
    let codec = CloudKitToken(containerIdentifier: "iCloud.studio.orbitlabs.habittracker", zoneName: "habit-tracker",
      accountDigest: CloudKitAccountBinding.digest(recordName: "synthetic-user-a"))
    XCTAssertNil(codec.decode(nil))
    XCTAssertNil(codec.decode("not-base64"))
    XCTAssertNil(codec.decode(Data("{}".utf8).base64EncodedString()))
    let other = try JSONSerialization.data(withJSONObject: [
      "version": 1, "containerIdentifier": "iCloud.other.app", "zoneName": "habit-tracker", "archive": ""
    ])
    XCTAssertNil(codec.decode(other.base64EncodedString()))
    XCTAssertNil(try codec.encode(nil))
  }

  func testVersionTwoTokenEnvelopeRoundTripsOnlyWithinItsAccountContainerAndZone() throws {
    let digest = CloudKitAccountBinding.digest(recordName: "synthetic-user-a")
    let codec = CloudKitToken(containerIdentifier: "iCloud.studio.orbitlabs.habittracker",
      zoneName: "habit-tracker", accountDigest: digest)
    let archive = Data("opaque-server-token-archive".utf8)
    let token = try codec.encodeArchive(archive)
    XCTAssertEqual(codec.decodeArchive(token), archive)
    for other in [
      CloudKitToken(containerIdentifier: codec.containerIdentifier, zoneName: codec.zoneName,
        accountDigest: CloudKitAccountBinding.digest(recordName: "synthetic-user-b")),
      CloudKitToken(containerIdentifier: "iCloud.other.app", zoneName: codec.zoneName, accountDigest: digest),
      CloudKitToken(containerIdentifier: codec.containerIdentifier, zoneName: "other-zone", accountDigest: digest)
    ] {
      XCTAssertNil(other.decodeArchive(token))
    }
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(Data(base64Encoded: token))) as? [String: Any])
    XCTAssertEqual(json["version"] as? Int, 2)
    XCTAssertEqual(json["accountDigest"] as? String, digest)
    XCTAssertFalse(String(describing: json).contains("synthetic-user-a"))
  }

  func testPageExplicitlyEncodesANullToken() throws {
    let page = CloudKitWirePage(records: [], nextToken: nil, more: false)
    let data = try JSONEncoder().encode(page)
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    XCTAssertTrue(json["nextToken"] is NSNull)
  }
}

final class CloudKitErrorTests: XCTestCase {
  func testAccountStatusesMapWithoutAccountData() {
    XCTAssertNil(CloudKitFailure.accountFailure(.available))
    XCTAssertEqual(CloudKitFailure.accountFailure(.noAccount), .signedOut)
    XCTAssertEqual(CloudKitFailure.accountFailure(.restricted), .signedOut)
    XCTAssertEqual(CloudKitFailure.accountFailure(.couldNotDetermine), .unavailable)
    XCTAssertEqual(CloudKitFailure.accountFailure(.temporarilyUnavailable), .unavailable)
  }

  func testCloudKitErrorCodesAreSafe() {
    let cases: [(CKError.Code, CloudKitFailure)] = [
      (.networkUnavailable, .offline), (.networkFailure, .offline),
      (.notAuthenticated, .signedOut), (.managedAccountRestricted, .signedOut),
      (.missingEntitlement, .unavailable), (.badContainer, .unavailable),
      (.badDatabase, .unavailable), (.accountTemporarilyUnavailable, .unavailable),
      (.quotaExceeded, .failure), (.internalError, .failure), (.serverResponseLost, .failure)
    ]
    for (code, expected) in cases {
      let error = CKError(code, userInfo: [NSLocalizedDescriptionKey: "synthetic private account detail"])
      XCTAssertEqual(CloudKitFailure.map(error), expected)
      XCTAssertFalse(CloudKitFailure.map(error).message.contains("private"))
    }
    XCTAssertEqual(CloudKitFailure.map(CloudKitFailure.offline), .offline)
    XCTAssertEqual(CloudKitFailure.map(NSError(domain: "private", code: 9)), .failure)
  }

  func testPartialFailuresRetainTheActionableCode() {
    let error = CKError(.partialFailure, userInfo: [CKPartialErrorsByItemIDKey: [
      CKRecord.ID(recordName: "a"): CKError(.networkFailure),
      CKRecord.ID(recordName: "b"): CKError(.notAuthenticated)
    ]])
    XCTAssertEqual(CloudKitFailure.map(error), .signedOut)
    XCTAssertTrue(cloudKitErrorHasCode(error, .networkFailure))
    XCTAssertFalse(cloudKitErrorHasCode(error, .limitExceeded))
  }
}
