import { Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import type { SqlDatabase } from '@/core/persistence/database';

export const productDatabaseName = 'ripples.db';
export const appGroupId = 'group.com.ramimaalouf.habittracker';

// the shared app group container keeps one database visible to the app and
// the widget extension; before the entitlement exists (or off ios) the
// default documents location is used
export function productDatabaseDirectory(): string | undefined {
  if (Platform.OS !== 'ios') {
    return undefined;
  }
  try {
    const container = Paths.appleSharedContainers?.[appGroupId];
    return container?.uri ?? undefined;
  } catch {
    return undefined;
  }
}

// wraps expo-sqlite behind the SqlDatabase port; this is the only typescript
// location that imports expo-sqlite. writes run on a dedicated second
// connection where foreign keys are enabled at connection level and a mutex
// keeps exclusive transactions from interleaving with other statements;
// reads use the primary connection with deferred transactions.
export async function openProductSqlDatabase(): Promise<SqlDatabase> {
  const directory = productDatabaseDirectory();
  const readDb = await SQLite.openDatabaseAsync(productDatabaseName, undefined, directory);
  const writeDb = await SQLite.openDatabaseAsync(
    productDatabaseName,
    { useNewConnection: true },
    directory,
  );
  await writeDb.execAsync('PRAGMA foreign_keys = ON');
  await readDb.execAsync('PRAGMA foreign_keys = ON');

  // serializes exclusive transactions on the write connection and read
  // transactions on the primary connection (one BEGIN at a time per
  // connection)
  let writeQueue: Promise<unknown> = Promise.resolve();
  let readQueue: Promise<unknown> = Promise.resolve();

  const writeExecutor = {
    runAsync: async (sql: string, params: (string | number | null)[] = []) => {
      const result = await writeDb.runAsync(sql, params);
      return { changes: result.changes };
    },
    getAllAsync: <Row>(sql: string, params: (string | number | null)[] = []) =>
      writeDb.getAllAsync<Row>(sql, params),
    getFirstAsync: <Row>(sql: string, params: (string | number | null)[] = []) =>
      writeDb.getFirstAsync<Row>(sql, params),
  };

  return {
    runAsync: async (sql, params = []) => {
      const result = await readDb.runAsync(sql, params);
      return { changes: result.changes };
    },
    getAllAsync: (sql, params = []) => readDb.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => readDb.getFirstAsync(sql, params),
    execAsync: (sql) => readDb.execAsync(sql),
    withExclusiveTransactionAsync: async (work) => {
      const run = async () => {
        await writeDb.execAsync('BEGIN EXCLUSIVE');
        try {
          const value = await work(writeExecutor);
          await writeDb.execAsync('COMMIT');
          return value;
        } catch (cause) {
          await writeDb.execAsync('ROLLBACK');
          throw cause;
        }
      };
      const chained = writeQueue.then(run, run);
      // keep the queue alive after failures
      writeQueue = chained.catch(() => undefined);
      return chained;
    },
    withTransactionAsync: async (work) => {
      const run = async () => {
        let value: unknown;
        await readDb.withTransactionAsync(async () => {
          value = await work({
            runAsync: async (sql, params = []) => {
              const result = await readDb.runAsync(sql, params);
              return { changes: result.changes };
            },
            getAllAsync: (sql, params = []) => readDb.getAllAsync(sql, params),
            getFirstAsync: (sql, params = []) => readDb.getFirstAsync(sql, params),
          });
        });
        return value as never;
      };
      const chained = readQueue.then(run, run);
      readQueue = chained.catch(() => undefined);
      return chained;
    },
    closeAsync: async () => {
      await writeDb.closeAsync();
      await readDb.closeAsync();
    },
  };
}
