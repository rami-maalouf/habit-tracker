import { requireOptionalNativeModule } from 'expo';

import { toSyncRecord } from '../../../src/core/sync/records';
import type { SyncRecord } from '../../../src/core/sync/transport';
import fixtures from '../tests/CloudKit/sync-records.json';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

type Adapter = typeof import('../../../src/platform/sync/index.ios');
const records = fixtures as unknown as SyncRecord[];

function loadAdapter(native: object | null): Adapter {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  let adapter: Adapter;
  jest.isolateModules(() => {
    adapter = jest.requireActual<Adapter>('../../../src/platform/sync/index.ios');
  });
  return adapter!;
}

function native() {
  return {
    cloudKitAvailable: jest.fn().mockResolvedValue(true),
    cloudKitEnsureZone: jest.fn().mockResolvedValue(undefined),
    cloudKitUpload: jest.fn().mockResolvedValue(undefined),
    cloudKitFetchChanges: jest.fn().mockResolvedValue(JSON.stringify({ records, nextToken: 'opaque', more: false })),
  };
}

describe('cloudkit transport bridge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shares fixtures that match the typescript record mapping, including all tombstones', () => {
    expect(records).toHaveLength(9);
    for (const record of records) {
      expect(toSyncRecord(record.entityType, record.entityId, record.mutationStamp, record.fields)).toEqual(record);
    }
  });

  it.each([null, {}, { cloudKitAvailable: jest.fn().mockResolvedValue(true) }])(
    'keeps older binaries unavailable: %p', async (module) => {
      const adapter = loadAdapter(module);
      await expect(adapter.cloudKitAvailable()).resolves.toBe(false);
      await expect(adapter.cloudKitTransport.ensureZone()).rejects.toMatchObject({ code: 'unavailable' });
      await expect(adapter.cloudKitTransport.upload(records)).rejects.toMatchObject({ code: 'unavailable' });
      await expect(adapter.cloudKitTransport.fetchChanges(null)).rejects.toMatchObject({ code: 'unavailable' });
    },
  );

  it('checks runtime availability without caching account state', async () => {
    const module = native();
    const adapter = loadAdapter(module);
    await expect(adapter.cloudKitAvailable()).resolves.toBe(true);
    module.cloudKitAvailable.mockResolvedValue(false);
    await expect(adapter.cloudKitAvailable()).resolves.toBe(false);
    module.cloudKitAvailable.mockRejectedValue(new Error('private account details'));
    await expect(adapter.cloudKitAvailable()).resolves.toBe(false);
  });

  it('forwards uploads and opaque page tokens through the unchanged port', async () => {
    const module = native();
    const { cloudKitTransport } = loadAdapter(module);
    await cloudKitTransport.ensureZone();
    await cloudKitTransport.upload(records);
    expect(JSON.parse(module.cloudKitUpload.mock.calls[0][0])).toEqual(records);
    await expect(cloudKitTransport.fetchChanges('previous')).resolves.toEqual({ records, nextToken: 'opaque', more: false });
    expect(module.cloudKitFetchChanges).toHaveBeenCalledWith('previous');
  });

  it.each(['offline', 'signed_out', 'unavailable', 'failure', 'unknown']) (
    'sanitizes the native failure %s', async (code) => {
      const module = native();
      module.cloudKitEnsureZone.mockRejectedValue({ code, message: 'private cloudkit record and account data' });
      const adapter = loadAdapter(module);
      const error = await adapter.cloudKitTransport.ensureZone().catch((cause) => cause);
      expect(error).toMatchObject({ code: code === 'unknown' ? 'failure' : code });
      expect(error.message).not.toMatch(/private|record and account/);
    },
  );

  it.each([
    'not-json', 'null', '{}',
    JSON.stringify({ records: [], nextToken: null, more: true }),
    JSON.stringify({ records: [], nextToken: 'previous', more: true }),
    JSON.stringify({ records: [{ ...records[0], fields: { note: {} } }], nextToken: 'next', more: false }),
  ])('rejects malformed pages without returning a token: %s', async (response) => {
    const module = native();
    module.cloudKitFetchChanges.mockResolvedValue(response);
    await expect(loadAdapter(module).cloudKitTransport.fetchChanges('previous')).rejects.toMatchObject({ code: 'failure' });
  });
});
