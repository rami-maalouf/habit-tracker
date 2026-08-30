import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';
import type { SqlDatabase } from './database';
import type { Migration } from './schema';
import { migrations } from './schema';

// deterministic content hash so a rewritten released migration fails loudly
export function migrationChecksum(migration: Migration): string {
  const content = `${migration.version}:${migration.name}:${migration.statements.join(';')}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

type MigrationRow = { version: number; checksum: string };

export async function migrateDatabase(db: SqlDatabase): Promise<DomainResult<number>> {
  try {
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )`,
    );
    const applied = await db.getAllAsync<MigrationRow>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const appliedByVersion = new Map(applied.map((row) => [row.version, row.checksum]));
    for (const migration of migrations) {
      const checksum = migrationChecksum(migration);
      const existing = appliedByVersion.get(migration.version);
      if (existing !== undefined) {
        if (existing !== checksum) {
          return err(
            'migration',
            `Migration ${migration.version} does not match its recorded checksum.`,
          );
        }
        continue;
      }
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const statement of migration.statements) {
          await tx.runAsync(statement);
        }
        await tx.runAsync(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
          [migration.version, migration.name, checksum, Date.now()],
        );
        // static reviewed pragma inside the same transaction so a crash
        // cannot split the version marker from the applied migration
        await tx.runAsync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    return ok(migrations[migrations.length - 1].version);
  } catch (cause) {
    return err('migration', `Database migration failed: ${describe(cause)}`);
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
