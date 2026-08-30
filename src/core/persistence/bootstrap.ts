import type { DeviceId } from '../domain/ids';
import type { IdGenerator } from '../domain/ports';
import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';
import type { SqlDatabase } from './database';
import { migrateDatabase } from './migrations';
import { getSettings, insertSettings } from './repositories/support';
import { latestSchemaVersion } from './schema';

// migrate, then guarantee the singleton settings and sync-state rows exist.
// a migration failure never creates a replacement database.
export async function initializeProductDatabase(
  db: SqlDatabase,
  ids: IdGenerator,
): Promise<DomainResult<void>> {
  const migrated = await migrateDatabase(db);
  if (!migrated.ok) {
    return migrated;
  }
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      const settings = await getSettings(tx);
      if (!settings) {
        await insertSettings(tx, {
          deviceId: ids.uuid() as DeviceId,
          schemaRevision: latestSchemaVersion,
        });
        await tx.runAsync('INSERT INTO sync_state (id) VALUES (1)');
      }
    });
    return ok(undefined);
  } catch (cause) {
    return err(
      'database',
      `The database could not be initialized: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
