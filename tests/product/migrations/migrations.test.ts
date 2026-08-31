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
