import CloudKit
import Foundation

struct CloudKitToken {
  let containerIdentifier: String
  let zoneName: String
  let accountDigest: String

  private struct Envelope: Codable {
    let version: Int
    let containerIdentifier: String
    let zoneName: String
    let accountDigest: String
    let archive: Data
  }

  func encode(_ token: CKServerChangeToken?) throws -> String? {
    guard let token else { return nil }
    let archive = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    return try encodeArchive(archive)
  }

  // the envelope can be tested independently of server-created token objects.
  func encodeArchive(_ archive: Data) throws -> String {
    let envelope = Envelope(version: 2, containerIdentifier: containerIdentifier, zoneName: zoneName,
      accountDigest: accountDigest, archive: archive)
    return try JSONEncoder().encode(envelope).base64EncodedString()
  }

  func decode(_ token: String?) -> CKServerChangeToken? {
    guard let archive = decodeArchive(token) else { return nil }
    return try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: archive)
  }

  func decodeArchive(_ token: String?) -> Data? {
    guard let token, token.utf8.count <= 1_048_576,
      let data = Data(base64Encoded: token),
      let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
      envelope.version == 2, envelope.containerIdentifier == containerIdentifier,
      envelope.zoneName == zoneName, envelope.accountDigest == accountDigest else { return nil }
    return envelope.archive
  }
}
