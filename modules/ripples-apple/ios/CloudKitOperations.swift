import CloudKit
import Foundation

// cloudkit callbacks run serially per operation. the lock also makes captured
// result storage safe when cancellation or future callback scheduling changes.
private final class CloudKitOperationState<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Value
  init(_ value: Value) { self.value = value }
  func access<T>(_ body: (inout Value) -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body(&value)
  }
}

final class CloudKitOperations: CloudKitClient, @unchecked Sendable {
  private let container: CKContainer
  private let database: CKDatabase

  init(containerIdentifier: String) {
    container = CKContainer(identifier: containerIdentifier)
    database = container.privateCloudDatabase
  }

  func accountStatus() async throws -> CKAccountStatus {
    try await container.accountStatus()
  }

  func accountDigest() async throws -> String {
    let id = try await container.userRecordID()
    guard !id.recordName.isEmpty else { throw CloudKitFailure.unavailable }
    return CloudKitAccountBinding.digest(recordName: id.recordName)
  }

  func ensureZone(_ zoneID: CKRecordZone.ID) async throws {
    do {
      _ = try await database.recordZone(for: zoneID)
    } catch {
      guard cloudKitErrorHasCode(error, .zoneNotFound) || cloudKitErrorHasCode(error, .unknownItem) else { throw error }
      do {
        _ = try await database.save(CKRecordZone(zoneID: zoneID))
      } catch {
        // another target may have created the same zone after our first fetch.
        guard cloudKitErrorHasCode(error, .serverRecordChanged) else { throw error }
        _ = try await database.recordZone(for: zoneID)
      }
    }
  }

  private func add(_ operation: CKDatabaseOperation) {
    operation.qualityOfService = .utility
    operation.configuration.timeoutIntervalForRequest = 30
    operation.configuration.timeoutIntervalForResource = 60
    database.add(operation)
  }

  func fetchRecords(_ ids: [CKRecord.ID]) async throws -> [CKRecord.ID: Result<CKRecord, Error>] {
    try await withCheckedThrowingContinuation { continuation in
      let state = CloudKitOperationState<[CKRecord.ID: Result<CKRecord, Error>]>([:])
      let operation = CKFetchRecordsOperation(recordIDs: ids)
      operation.perRecordResultBlock = { id, result in state.access { $0[id] = result } }
      operation.fetchRecordsResultBlock = { completion in
        var results = state.access { $0 }
        if case .failure(let error) = completion {
          let partial = (error as? CKError)?.partialErrorsByItemID ?? [:]
          for id in ids where results[id] == nil { results[id] = .failure(partial[id] ?? error) }
        }
        guard results.count == ids.count else {
          continuation.resume(throwing: CloudKitFailure.failure)
          return
        }
        continuation.resume(returning: results)
      }
      add(operation)
    }
  }

  func saveRecords(_ records: [CKRecord]) async throws -> [CKRecord.ID: Result<CKRecord, Error>] {
    try await withCheckedThrowingContinuation { continuation in
      let state = CloudKitOperationState<[CKRecord.ID: Result<CKRecord, Error>]>([:])
      let operation = CKModifyRecordsOperation(recordsToSave: records, recordIDsToDelete: nil)
      operation.savePolicy = .ifServerRecordUnchanged
      operation.isAtomic = false
      operation.perRecordSaveBlock = { id, result in state.access { $0[id] = result } }
      operation.modifyRecordsResultBlock = { completion in
        var results = state.access { $0 }
        if case .failure(let error) = completion {
          let partial = (error as? CKError)?.partialErrorsByItemID ?? [:]
          for record in records where results[record.recordID] == nil {
            results[record.recordID] = .failure(partial[record.recordID] ?? error)
          }
        }
        guard results.count == records.count else {
          continuation.resume(throwing: CloudKitFailure.failure)
          return
        }
        continuation.resume(returning: results)
      }
      add(operation)
    }
  }

  private struct FetchState {
    var records: [CKRecord] = []
    var token: CKServerChangeToken?
    var more = false
    var hardDeletedRecordCount = 0
    var failure: Error?
  }

  func fetchChanges(_ zoneID: CKRecordZone.ID, token: CKServerChangeToken?) async throws -> CloudKitChangedRecords {
    try await withCheckedThrowingContinuation { continuation in
      let state = CloudKitOperationState(FetchState())
      let configuration = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
      configuration.previousServerChangeToken = token
      configuration.resultsLimit = CloudKitTransport.batchLimit
      let operation = CKFetchRecordZoneChangesOperation(recordZoneIDs: [zoneID], configurationsByRecordZoneID: [zoneID: configuration])
      operation.fetchAllChanges = false
      operation.recordWasChangedBlock = { _, result in
        state.access {
          switch result {
          case .success(let record): $0.records.append(record)
          case .failure(let error): $0.failure = $0.failure ?? error
          }
        }
      }
      operation.recordWithIDWasDeletedBlock = { _, _ in state.access { $0.hardDeletedRecordCount += 1 } }
      operation.recordZoneFetchResultBlock = { _, result in
        state.access {
          switch result {
          case .success(let result):
            $0.token = result.serverChangeToken
            $0.more = result.moreComing
          case .failure(let error): $0.failure = $0.failure ?? error
          }
        }
      }
      operation.fetchRecordZoneChangesResultBlock = { result in
        let page = state.access { $0 }
        if let error = page.failure {
          continuation.resume(throwing: error)
        } else if case .failure(let error) = result {
          continuation.resume(throwing: error)
        } else if let token = page.token {
          continuation.resume(returning: CloudKitChangedRecords(records: page.records, token: token,
            more: page.more, hardDeletedRecordCount: page.hardDeletedRecordCount))
        } else {
          continuation.resume(throwing: CloudKitFailure.failure)
        }
      }
      add(operation)
    }
  }
}
