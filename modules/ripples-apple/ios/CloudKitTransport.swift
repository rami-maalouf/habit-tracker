import CloudKit
import Foundation

struct CloudKitChangedRecords: Sendable {
  let records: [CKRecord]
  let token: CKServerChangeToken?
  let more: Bool
  let hardDeletedRecordCount: Int
}

protocol CloudKitClient: Sendable {
  func accountStatus() async throws -> CKAccountStatus
  func accountDigest() async throws -> String
  func ensureZone(_ zoneID: CKRecordZone.ID) async throws
  func fetchRecords(_ ids: [CKRecord.ID]) async throws -> [CKRecord.ID: Result<CKRecord, Error>]
  func saveRecords(_ records: [CKRecord]) async throws -> [CKRecord.ID: Result<CKRecord, Error>]
  func fetchChanges(_ zoneID: CKRecordZone.ID, token: CKServerChangeToken?) async throws -> CloudKitChangedRecords
}

struct CloudKitTransport: Sendable {
  static let zoneName = "habit-tracker"
  static let batchLimit = 200
  static let conflictAttempts = 5
  let client: any CloudKitClient
  let containerIdentifier: String
  let accountBinding: any CloudKitAccountBindingChecking

  private var zoneID: CKRecordZone.ID {
    CKRecordZone.ID(zoneName: Self.zoneName, ownerName: CKCurrentUserDefaultName)
  }

  func available() async -> Bool {
    do {
      switch try await client.accountStatus() {
      case .available, .noAccount, .restricted: return true
      case .couldNotDetermine, .temporarilyUnavailable: return false
      @unknown default: return false
      }
    } catch { return false }
  }

  @discardableResult private func requireAccount() async throws -> String {
    if let failure = CloudKitFailure.accountFailure(try await client.accountStatus()) { throw failure }
    let digest = try await client.accountDigest()
    try accountBinding.require(provider: containerIdentifier, accountDigest: digest)
    return digest
  }

  func ensureZone() async throws {
    try await requireAccount()
    try await client.ensureZone(zoneID)
  }

  func upload(_ records: [CloudKitWireRecord]) async throws {
    // validate the full input before writing any record, then coalesce outbox
    // entries that represent successive mutations of the same entity.
    var latest: [String: CloudKitWireRecord] = [:]
    for input in records {
      let record = try CloudKitRecordMapping.normalized(input)
      if let previous = latest[record.entityId] {
        guard previous.entityType == record.entityType else { throw CloudKitFailure.failure }
        if previous.mutationStamp >= record.mutationStamp { continue }
      }
      latest[record.entityId] = record
    }
    try await requireAccount()
    guard !latest.isEmpty else { return }
    let pending = latest.values.sorted { $0.entityId < $1.entityId }
    for start in stride(from: 0, to: pending.count, by: Self.batchLimit) {
      try await uploadChunk(Array(pending[start..<min(start + Self.batchLimit, pending.count)]))
    }
  }

  private func uploadChunk(_ records: [CloudKitWireRecord]) async throws {
    do {
      var pending = records
      for _ in 0..<Self.conflictAttempts {
        pending = try await uploadAttempt(pending)
        if pending.isEmpty { return }
      }
      // the js engine owns subsequent retries and their jitter.
      throw CloudKitFailure.failure
    } catch {
      if records.count > 1 && cloudKitErrorHasCode(error, .limitExceeded) {
        let middle = records.count / 2
        try await uploadChunk(Array(records[..<middle]))
        try await uploadChunk(Array(records[middle...]))
      } else { throw error }
    }
  }

  private func uploadAttempt(_ records: [CloudKitWireRecord]) async throws -> [CloudKitWireRecord] {
    let ids = records.map { CKRecord.ID(recordName: $0.entityId, zoneID: zoneID) }
    try await requireAccount()
    let fetched = try await client.fetchRecords(ids)
    var candidates: [(CloudKitWireRecord, CKRecord)] = []
    for (input, id) in zip(records, ids) {
      guard let result = fetched[id] else { throw CloudKitFailure.failure }
      let existing: CKRecord?
      switch result {
      case .success(let server):
        let remote = try CloudKitRecordMapping.fromRecord(server)
        guard remote.entityType == input.entityType else { throw CloudKitFailure.failure }
        // equal stamps are already acknowledged. newer remote values win,
        // including tombstones, so an old offline mutation cannot overwrite them.
        if remote.mutationStamp >= input.mutationStamp { continue }
        existing = server
      case .failure(let error):
        guard cloudKitErrorHasCode(error, .unknownItem) else { throw error }
        existing = nil
      }
      candidates.append((input, try CloudKitRecordMapping.toRecord(input, zoneID: zoneID, existing: existing)))
    }
    guard !candidates.isEmpty else { return [] }
    // recheck after the read and before every conditional write so an account
    // switch during a multi-batch upload cannot redirect the next mutation.
    try await requireAccount()
    let results = try await client.saveRecords(candidates.map(\.1))
    var retry: [CloudKitWireRecord] = []
    for (input, record) in candidates {
      guard let result = results[record.recordID] else { throw CloudKitFailure.failure }
      switch result {
      case .success: break
      case .failure(let error):
        if cloudKitErrorHasCode(error, .serverRecordChanged) || cloudKitErrorHasCode(error, .unknownItem) {
          retry.append(input)
        } else { throw error }
      }
    }
    return retry
  }

  func fetchChanges(_ token: String?) async throws -> CloudKitWirePage {
    let digest = try await requireAccount()
    let tokens = CloudKitToken(containerIdentifier: containerIdentifier, zoneName: Self.zoneName, accountDigest: digest)
    let page: CloudKitChangedRecords
    do {
      page = try await client.fetchChanges(zoneID, token: tokens.decode(token))
    } catch {
      guard token != nil && cloudKitErrorHasCode(error, .changeTokenExpired) else { throw error }
      // tombstones remain in the zone, so a complete rescan is safe. no token
      // is persisted until the returned page is committed by the js engine.
      try await requireAccount()
      page = try await client.fetchChanges(zoneID, token: nil)
    }
    try await requireAccount()
    // all product deletes are stamped tombstone records. a hard deletion lacks
    // the stamp and linkage needed for a safe mutation, so do not advance.
    guard page.hardDeletedRecordCount == 0, !page.more || page.token != nil else { throw CloudKitFailure.failure }
    let records = try page.records.map(CloudKitRecordMapping.fromRecord)
    return CloudKitWirePage(records: records, nextToken: try tokens.encode(page.token), more: page.more)
  }
}
