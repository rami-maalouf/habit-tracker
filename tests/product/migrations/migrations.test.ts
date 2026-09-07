import { createBoard, deleteBoard, setICloudSyncEnabled } from '@/core/domain/commands';
import { getExportSnapshot } from '@/core/export/serialize';
import { migrateDatabase, migrationChecksum } from '@/core/persistence/migrations';
import { latestSchemaVersion, migrations } from '@/core/persistence/schema';

import { createTestHarness, NodeSqlDatabase } from '../helpers/test-db';

describe('migrations', () => {
  it('migrates a clean database to the latest schema', async () => {
    const db = new NodeSqlDatabase();
    const result = await migrateDatabase(db);
    expect(result).toEqual({ ok: true, value: latestSchemaVersion });
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(latestSchemaVersion);
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((table) => table.name);
    for (const required of [
      'boards',
      'check_ins',
      'reminders',
      'board_activity_periods',
      'reminder_schedule',
      'widget_board_rows',
      'app_settings',
      'mutation_outbox',
      'sync_state',
      'sync_account_bindings',
      'command_receipts',
      'schema_migrations',
    ]) {
      expect(names).toContain(required);
    }
    await db.closeAsync();
  });

  it('reruns as a no-op', async () => {
    const db = new NodeSqlDatabase();
    await migrateDatabase(db);
    const again = await migrateDatabase(db);
    expect(again.ok).toBe(true);
    const applied = await db.getAllAsync('SELECT version FROM schema_migrations');
    expect(applied).toHaveLength(migrations.length);
    await db.closeAsync();
  });

  it('fails hard and visibly on a checksum mismatch', async () => {
    const db = new NodeSqlDatabase();
    await migrateDatabase(db);
    await db.runAsync('UPDATE schema_migrations SET checksum = ? WHERE version = 1', ['bad']);
    const result = await migrateDatabase(db);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('migration');
    }
    await db.closeAsync();
  });

  it('enables foreign keys and wal', async () => {
    // wal needs a file-backed database; memory databases report 'memory'
    const os = require('node:os') as typeof import('node:os');
    const path = require('node:path') as typeof import('node:path');
    const fs = require('node:fs') as typeof import('node:fs');
    const location = path.join(os.tmpdir(), `ripples-wal-${process.pid}-${Date.now()}.db`);
    const db = new NodeSqlDatabase(location);
    await migrateDatabase(db);
    const fk = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(fk?.foreign_keys).toBe(1);
    const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(journal?.journal_mode).toBe('wal');
    await db.closeAsync();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${location}${suffix}`, { force: true });
    }
  });

  it('handles hostile input through bound parameters', async () => {
    const { db } = await createTestHarness();
    const hostile = `'; DROP TABLE boards; --`;
    await db.runAsync(
      `INSERT INTO boards (id, title, symbol, accent_hex, uses_tinted_background, tracks_amount,
        amount_unit, quick_amount, tracks_time, start_of_day_minute, metrics_enabled, order_key,
        archived_at, created_at, updated_at, mutation_stamp, deleted_at)
       VALUES (?, ?, 'calendar', '#8E8E93', 0, 0, NULL, 1, 0, 0, 1, 'i', NULL, 0, 0, 's', NULL)`,
      ['00000000-0000-4000-8000-00000000dead', hostile],
    );
    const row = await db.getFirstAsync<{ title: string }>(
      'SELECT title FROM boards WHERE id = ?',
      ['00000000-0000-4000-8000-00000000dead'],
    );
    expect(row?.title).toBe(hostile);
    const stillThere = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'boards'",
    );
    expect(stillThere?.name).toBe('boards');
    await db.closeAsync();
  });

  it('rolls back a failed exclusive transaction with no partial rows', async () => {
    const { db } = await createTestHarness();
    await expect(
      db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          `INSERT INTO boards (id, title, symbol, accent_hex, uses_tinted_background, tracks_amount,
            amount_unit, quick_amount, tracks_time, start_of_day_minute, metrics_enabled, order_key,
            archived_at, created_at, updated_at, mutation_stamp, deleted_at)
           VALUES ('b-1', 'partial', 'calendar', '#8E8E93', 0, 0, NULL, 1, 0, 0, 1, 'i', NULL, 0, 0, 's', NULL)`,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const row = await db.getFirstAsync("SELECT id FROM boards WHERE id = 'b-1'");
    expect(row).toBeNull();
    await db.closeAsync();
  });

  it('checksums are content-stable', () => {
    const checksum = migrationChecksum(migrations[0]);
    expect(checksum).toBe(migrationChecksum(migrations[0]));
    expect(checksum).toHaveLength(8);
  });
});

describe('cloudkit account binding migration', () => {
  it('keeps the local binding through sync toggles and board deletion without exporting or enqueuing it', async () => {
    const { db, deps, ids } = await createTestHarness();
    const binding = { provider: 'iCloud.studio.orbitlabs.habittracker', account_digest: 'private-account-digest' };
    await db.runAsync('INSERT INTO sync_account_bindings VALUES (?, ?)', [binding.provider, binding.account_digest]);
    const created = await createBoard(deps, {
      commandId: ids.nextCommandId(), title: 'test board', symbol: 'star.fill', accentHex: '#78D98B',
      usesTintedBackground: false, tracksAmount: false, tracksTime: false, startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!created.ok) throw new Error(created.error.message);
    for (const enabled of [true, false, true]) {
      expect((await setICloudSyncEnabled(deps, { commandId: ids.nextCommandId(), enabled })).ok).toBe(true);
    }
    expect((await deleteBoard(deps, { commandId: ids.nextCommandId(), boardId: created.value.boardId })).ok).toBe(true);
    expect(await db.getAllAsync('SELECT * FROM sync_account_bindings')).toEqual([binding]);
    const exported = await getExportSnapshot(deps, {
      appVersion: '1.0.0', buildVersion: '1', databaseSchemaVersion: latestSchemaVersion, locale: 'en',
    });
    expect(exported.ok).toBe(true);
    expect(JSON.stringify(exported)).not.toContain(binding.account_digest);
    expect(JSON.stringify(exported)).not.toContain('sync_account_bindings');
    const outbox = await db.getAllAsync('SELECT * FROM mutation_outbox');
    expect(JSON.stringify(outbox)).not.toContain(binding.account_digest);
    expect(JSON.stringify(outbox)).not.toContain('sync_account_bindings');
    await db.closeAsync();
  });

  it('upgrades an existing store without changing its product rows or sync cursor', async () => {
    const db = new NodeSqlDatabase();
    await db.runAsync(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL
    )`);
    for (const migration of migrations.filter((entry) => entry.version <= 4)) {
      for (const statement of migration.statements) await db.runAsync(statement);
      await db.runAsync('INSERT INTO schema_migrations VALUES (?, ?, ?, 0)', [
        migration.version, migration.name, migrationChecksum(migration),
      ]);
    }
    await db.runAsync('PRAGMA user_version = 4');
    await db.runAsync("INSERT INTO app_settings (id, schema_revision, device_id) VALUES (1, 4, 'existing-device')");
    await db.runAsync("INSERT INTO sync_state (id, change_token, zone_created) VALUES (1, 'existing-token', 1)");
    const settings = await db.getAllAsync('SELECT * FROM app_settings');
    const sync = await db.getAllAsync('SELECT * FROM sync_state');
    expect(await migrateDatabase(db)).toEqual({ ok: true, value: latestSchemaVersion });
    expect(await db.getAllAsync('SELECT * FROM app_settings')).toEqual(settings);
    expect(await db.getAllAsync('SELECT * FROM sync_state')).toEqual(sync);
    expect(await db.getAllAsync('SELECT * FROM sync_account_bindings')).toEqual([]);
    const columns = await db.getAllAsync<{ name: string; pk: number; notnull: number }>(
      'PRAGMA table_info(sync_account_bindings)',
    );
    expect(columns.map(({ name }) => name)).toEqual(['provider', 'account_digest']);
    expect(columns[0].pk).toBe(1);
    expect(columns[1].notnull).toBe(1);
    await db.runAsync('INSERT INTO sync_account_bindings VALUES (?, ?)', ['iCloud.studio.orbitlabs.habittracker', 'digest-a']);
    await expect(db.runAsync('INSERT INTO sync_account_bindings VALUES (?, ?)', [
      'iCloud.studio.orbitlabs.habittracker', 'digest-b',
    ])).rejects.toThrow();
    await migrateDatabase(db);
    expect(await db.getAllAsync('SELECT * FROM sync_account_bindings')).toEqual([
      { provider: 'iCloud.studio.orbitlabs.habittracker', account_digest: 'digest-a' },
    ]);
    expect(await db.getAllAsync('SELECT * FROM mutation_outbox')).toEqual([]);
    await db.closeAsync();
  });
});

describe('upgrade from a version-1 database', () => {
  it('stamps and enqueues an existing metrics dismissal so it reaches first sync', async () => {
    // a store that stopped at version 1 with a dismissal already recorded
    const db = new NodeSqlDatabase();
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.runAsync(
      `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
         checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)`,
    );
    const first = migrations[0];
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const statement of first.statements) {
        await tx.runAsync(statement);
      }
      await tx.runAsync(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        [first.version, first.name, migrationChecksum(first), 0],
      );
    });
    await db.runAsync(
      `INSERT INTO app_settings (id, schema_revision, device_id, metrics_education_dismissed)
       VALUES (1, 1, 'device-abc', '["00000000-0000-4000-8000-000000000001"]')`,
    );

    const migrated = await migrateDatabase(db);
    if (!migrated.ok) {
      throw new Error(migrated.error.message);
    }

    const row = await db.getFirstAsync<{ settings_mutation_stamp: string | null }>(
      'SELECT settings_mutation_stamp FROM app_settings WHERE id = 1',
    );
    // a stamp that sorts below every real one, so any other device wins
    expect(row?.settings_mutation_stamp).toBe('00000000000000-00000-device-abc');
    const outbox = await db.getAllAsync<{ entity_id: string; mutation_stamp: string }>(
      `SELECT entity_id, mutation_stamp FROM mutation_outbox WHERE entity_type = 'settings'`,
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entity_id).toBe('app-settings');
    await db.closeAsync();
  });

  it('leaves an empty dismissal list unstamped and unqueued', async () => {
    const db = new NodeSqlDatabase();
    await db.runAsync(
      `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
         checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)`,
    );
    const first = migrations[0];
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const statement of first.statements) {
        await tx.runAsync(statement);
      }
      await tx.runAsync(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        [first.version, first.name, migrationChecksum(first), 0],
      );
    });
    await db.runAsync(
      `INSERT INTO app_settings (id, schema_revision, device_id) VALUES (1, 1, 'device-xyz')`,
    );
    const migrated = await migrateDatabase(db);
    expect(migrated.ok).toBe(true);
    const row = await db.getFirstAsync<{ settings_mutation_stamp: string | null }>(
      'SELECT settings_mutation_stamp FROM app_settings WHERE id = 1',
    );
    expect(row?.settings_mutation_stamp).toBeNull();
    const outbox = await db.getAllAsync(
      `SELECT id FROM mutation_outbox WHERE entity_type = 'settings'`,
    );
    expect(outbox).toHaveLength(0);
    await db.closeAsync();
  });
});
