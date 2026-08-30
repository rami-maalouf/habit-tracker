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
