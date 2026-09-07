import CloudKit
import Foundation
import XCTest
@testable import RipplesCloudKit

private final class FakeAccountBinding: CloudKitAccountBindingChecking, @unchecked Sendable {
  private let lock = NSLock()
  private var bound: String?
  func require(provider: String, accountDigest: String) throws {
    lock.lock()
    defer { lock.unlock() }
    if let bound, bound != accountDigest { throw CloudKitFailure.unavailable }
    bound = accountDigest
  }
}

private actor FakeCloudKitClient: CloudKitClient {
  nonisolated let binding = FakeAccountBinding()
  var digest = CloudKitAccountBinding.digest(recordName: "synthetic-user-a")
  var switchDuringRead = false
  var switchDuringChanges = false
  enum SaveMode: Sendable {
    case normal
    case conflict(CKRecord)
    case alwaysConflict
    case offlineOnce(String)
    case loseResponseOnce
  }
  var account: CKAccountStatus = .available
  var store: [CKRecord.ID: CKRecord] = [:]
  var savedNames: [String] = []
  var saveBatchSizes: [Int] = []
  var fetchBatchSizes: [Int] = []
  var zones: Set<CKRecordZone.ID> = []
  var changesRequests = 0
  var mode: SaveMode = .normal
  var limit = 200
  var expireFirstPage = false
  var page = CloudKitChangedRecords(records: [], token: nil, more: false, hardDeletedRecordCount: 0)

  func configure(account: CKAccountStatus = .available, mode: SaveMode = .normal, limit: Int = 200) {
    self.account = account
    self.mode = mode
    self.limit = limit
  }
  func setPage(_ page: CloudKitChangedRecords, expireFirst: Bool = false) {
    self.page = page
    expireFirstPage = expireFirst
  }
  func accountStatus() async throws -> CKAccountStatus { account }
  func accountDigest() async throws -> String { digest }
  func switchAccount(duringRead: Bool = false) {
    if duringRead { switchDuringRead = true }
    else { digest = CloudKitAccountBinding.digest(recordName: "synthetic-user-b") }
  }
  func switchAccountDuringChanges() { switchDuringChanges = true }
  func ensureZone(_ zoneID: CKRecordZone.ID) async throws { zones.insert(zoneID) }
  func fetchRecords(_ ids: [CKRecord.ID]) async throws -> [CKRecord.ID: Result<CKRecord, Error>] {
    fetchBatchSizes.append(ids.count)
    if switchDuringRead { switchAccount() }
    if ids.count > limit { throw CKError(.limitExceeded) }
    return Dictionary(uniqueKeysWithValues: ids.map { id in
      (id, store[id].map { .success($0.copy() as! CKRecord) } ?? .failure(CKError(.unknownItem)))
    })
  }
  func saveRecords(_ records: [CKRecord]) async throws -> [CKRecord.ID: Result<CKRecord, Error>] {
    saveBatchSizes.append(records.count)
    if records.count > limit { throw CKError(.limitExceeded) }
    if case .conflict(let winner) = mode {
      store[winner.recordID] = winner
      mode = .normal
      return Dictionary(uniqueKeysWithValues: records.map { ($0.recordID, .failure(CKError(.serverRecordChanged))) })
    }
    if case .alwaysConflict = mode {
      return Dictionary(uniqueKeysWithValues: records.map { ($0.recordID, .failure(CKError(.serverRecordChanged))) })
    }
    var results: [CKRecord.ID: Result<CKRecord, Error>] = [:]
    for record in records {
      if case .offlineOnce(let id) = mode, id == record.recordID.recordName {
        mode = .normal
        results[record.recordID] = .failure(CKError(.networkFailure))
      } else {
        store[record.recordID] = record.copy() as? CKRecord
        savedNames.append(record.recordID.recordName)
        results[record.recordID] = .success(record)
      }
    }
    if case .loseResponseOnce = mode {
      mode = .normal
      throw CKError(.serverResponseLost)
    }
    return results
  }
  func fetchChanges(_ zoneID: CKRecordZone.ID, token: CKServerChangeToken?) async throws -> CloudKitChangedRecords {
    changesRequests += 1
    if switchDuringChanges { switchAccount() }
    if expireFirstPage {
      expireFirstPage = false
      throw CKError(.changeTokenExpired)
    }
    return page
  }
}

private func transport(_ client: FakeCloudKitClient) -> CloudKitTransport {
  CloudKitTransport(client: client, containerIdentifier: "iCloud.studio.orbitlabs.habittracker", accountBinding: client.binding)
}

private func renamed(_ record: CloudKitWireRecord, _ id: String) -> CloudKitWireRecord {
  var fields = record.fields
  fields["id"] = .string(id)
  return CloudKitWireRecord(schemaVersion: record.schemaVersion, entityType: record.entityType,
    entityId: id, mutationStamp: record.mutationStamp, deleted: record.deleted, fields: fields)
}

final class CloudKitTransportTests: XCTestCase {
  func testAccountSwitchRefusesZoneUploadAndFetchBeforeCloudOperations() async throws {
    let client = FakeCloudKitClient()
    try await transport(client).upload([])
    await client.switchAccount()
    for operation in 0..<4 {
      do {
        switch operation {
        case 0: try await transport(client).ensureZone()
        case 1: try await transport(client).upload([cloudKitFixtures()[0]])
        case 2: try await transport(client).upload([])
        default: _ = try await transport(client).fetchChanges(nil)
        }
        XCTFail("expected account mismatch")
      } catch { XCTAssertEqual(CloudKitFailure.map(error), .unavailable) }
    }
    let zones = await client.zones
    let fetches = await client.fetchBatchSizes
    let saves = await client.savedNames
    let pages = await client.changesRequests
    XCTAssertTrue(zones.isEmpty)
    XCTAssertTrue(fetches.isEmpty)
    XCTAssertTrue(saves.isEmpty)
    XCTAssertEqual(pages, 0)
  }

  func testAccountSwitchAfterReadCannotRedirectTheConditionalSave() async throws {
    let client = FakeCloudKitClient()
    await client.switchAccount(duringRead: true)
    do {
      try await transport(client).upload([cloudKitFixtures()[0]])
      XCTFail("expected account mismatch")
    } catch { XCTAssertEqual(CloudKitFailure.map(error), .unavailable) }
    let saves = await client.savedNames
    XCTAssertTrue(saves.isEmpty)
  }

  func testAccountSwitchDuringFetchCannotReturnAnotherAccountsRecordsOrToken() async throws {
    let client = FakeCloudKitClient()
    let record = try CloudKitRecordMapping.toRecord(cloudKitFixtures()[0], zoneID: testZone)
    await client.setPage(CloudKitChangedRecords(records: [record], token: nil, more: false, hardDeletedRecordCount: 0))
    await client.switchAccountDuringChanges()
    do {
      _ = try await transport(client).fetchChanges(nil)
      XCTFail("expected account mismatch")
    } catch { XCTAssertEqual(CloudKitFailure.map(error), .unavailable) }
  }

  func testZoneAndUploadsAreIdempotent() async throws {
    let client = FakeCloudKitClient()
    let transport = transport(client)
    let record = try cloudKitFixtures()[0]
    try await transport.ensureZone()
    try await transport.ensureZone()
    try await transport.upload([record])
    try await transport.upload([record])
    let zones = await client.zones
    let saved = await client.savedNames
    XCTAssertEqual(zones.count, 1)
    XCTAssertEqual(saved, [record.entityId])
  }

  func testOutOfOrderDuplicateMutationsCannotResurrectATombstone() async throws {
    let client = FakeCloudKitClient()
    let fixtures = try cloudKitFixtures()
    try await transport(client).upload([fixtures[1], fixtures[0]])
    try await transport(client).upload([fixtures[0]])
    let stored = await client.store.values.map { $0 }
    XCTAssertEqual(stored.count, 1)
    XCTAssertEqual(try CloudKitRecordMapping.fromRecord(stored[0]), fixtures[1])
    let saved = await client.savedNames
    XCTAssertEqual(saved.count, 1)
  }

  func testConcurrentNewerTombstoneWinsAfterConditionalSaveConflict() async throws {
    let fixtures = try cloudKitFixtures()
    let client = FakeCloudKitClient()
    let winner = try CloudKitRecordMapping.toRecord(fixtures[1], zoneID: testZone)
    await client.configure(mode: .conflict(winner))
    try await transport(client).upload([fixtures[0]])
    let stored = await client.store[winner.recordID]
    XCTAssertEqual(try CloudKitRecordMapping.fromRecord(XCTUnwrap(stored)), fixtures[1])
    let saves = await client.saveBatchSizes
    XCTAssertEqual(saves.count, 1)
  }

  func testNewerLocalMutationRetriesAgainstLatestServerChangeTag() async throws {
    let fixtures = try cloudKitFixtures()
    let client = FakeCloudKitClient()
    let older = try CloudKitRecordMapping.toRecord(fixtures[0], zoneID: testZone)
    await client.configure(mode: .conflict(older))
    try await transport(client).upload([fixtures[1]])
    let stored = await client.store[older.recordID]
    XCTAssertEqual(try CloudKitRecordMapping.fromRecord(XCTUnwrap(stored)), fixtures[1])
    let saves = await client.saveBatchSizes
    XCTAssertEqual(saves.count, 2)
  }

  func testConflictRetriesAreBounded() async throws {
    let client = FakeCloudKitClient()
    await client.configure(mode: .alwaysConflict)
    do {
      try await transport(client).upload([cloudKitFixtures()[0]])
      XCTFail("expected a bounded retry failure")
    } catch { XCTAssertEqual(CloudKitFailure.map(error), .failure) }
    let saves = await client.saveBatchSizes
    XCTAssertEqual(saves.count, CloudKitTransport.conflictAttempts)
  }

  func testLostServerResponseDoesNotRepeatAMutation() async throws {
    let client = FakeCloudKitClient()
    let record = try cloudKitFixtures()[0]
    await client.configure(mode: .loseResponseOnce)
    do {
      try await transport(client).upload([record])
      XCTFail("expected lost response")
    } catch { XCTAssertTrue(cloudKitErrorHasCode(error, .serverResponseLost)) }
    try await transport(client).upload([record])
    let saved = await client.savedNames
    XCTAssertEqual(saved, [record.entityId])
  }

  func testPartialFailureRetainsSuccessfulRecordsDuringRetry() async throws {
    let client = FakeCloudKitClient()
    let first = try cloudKitFixtures()[0]
    let second = renamed(first, "00000000-0000-4000-8000-000000000002")
    await client.configure(mode: .offlineOnce(second.entityId))
    do {
      try await transport(client).upload([first, second])
      XCTFail("expected offline failure")
    } catch { XCTAssertEqual(CloudKitFailure.map(error), .offline) }
    try await transport(client).upload([first, second])
    let saved = await client.savedNames
    XCTAssertEqual(saved, [first.entityId, second.entityId])
  }

  func testServerBatchLimitsSplitWithoutDroppingRecords() async throws {
    let client = FakeCloudKitClient()
    await client.configure(limit: 1)
    let first = try cloudKitFixtures()[0]
    try await transport(client).upload([first, renamed(first, "second")])
    let saved = await client.savedNames
    let sizes = await client.fetchBatchSizes
    XCTAssertEqual(saved.count, 2)
    XCTAssertEqual(sizes, [2, 1, 1])
  }

  func testLargeUploadUsesAtMostTwoHundredRecordsPerOperation() async throws {
    let client = FakeCloudKitClient()
    let sample = try cloudKitFixtures()[0]
    try await transport(client).upload((0..<201).map { renamed(sample, "board-\($0)") })
    let sizes = await client.saveBatchSizes
    let count = await client.savedNames.count
    XCTAssertEqual(sizes, [200, 1])
    XCTAssertEqual(count, 201)
  }

  func testInvalidInputDoesNotPartiallyUpload() async throws {
    let client = FakeCloudKitClient()
    let sample = try cloudKitFixtures()[0]
    var bad = renamed(sample, "second")
    bad.fields["device_id"] = .string("local-only")
    do {
      try await transport(client).upload([sample, bad])
      XCTFail("expected validation failure")
    } catch { XCTAssertEqual(CloudKitFailure.map(error), .failure) }
    let saved = await client.savedNames
    XCTAssertTrue(saved.isEmpty)
  }

  func testSignedOutAccountIsDeterminateButCannotMutate() async throws {
    let client = FakeCloudKitClient()
    await client.configure(account: .noAccount)
    let available = await transport(client).available()
    XCTAssertTrue(available)
    do {
      try await transport(client).ensureZone()
      XCTFail("expected signed out")
    } catch { XCTAssertEqual(CloudKitFailure.map(error), .signedOut) }
    await client.configure(account: .couldNotDetermine)
    let unavailable = await transport(client).available()
    XCTAssertFalse(unavailable)
  }

  func testExpiredTokenRescansRetainedTombstones() async throws {
    let client = FakeCloudKitClient()
    let fixture = try cloudKitFixtures()[1]
    let record = try CloudKitRecordMapping.toRecord(fixture, zoneID: testZone)
    await client.setPage(CloudKitChangedRecords(records: [record], token: nil, more: false,
      hardDeletedRecordCount: 0), expireFirst: true)
    let page = try await transport(client).fetchChanges("expired-opaque-token")
    XCTAssertEqual(page.records, [fixture])
    let count = await client.changesRequests
    XCTAssertEqual(count, 2)
  }

  func testHardDeletesAndIncompletePagesNeverReturnAToken() async throws {
    let client = FakeCloudKitClient()
    for page in [
      CloudKitChangedRecords(records: [], token: nil, more: false, hardDeletedRecordCount: 1),
      CloudKitChangedRecords(records: [], token: nil, more: true, hardDeletedRecordCount: 0)
    ] {
      await client.setPage(page)
      do {
        _ = try await transport(client).fetchChanges(nil)
        XCTFail("expected unsafe page rejection")
      } catch { XCTAssertEqual(CloudKitFailure.map(error), .failure) }
    }
  }
}
