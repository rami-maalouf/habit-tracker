import * as Crypto from 'expo-crypto';

import type { CommandDeps } from '@/core/domain/commands';
import type { CommandId } from '@/core/domain/ids';
import type { Clock, IdGenerator } from '@/core/domain/ports';
import type { QueryDeps } from '@/core/domain/queries';
import type { DomainResult } from '@/core/domain/result';
import { ok } from '@/core/domain/result';
import { initializeProductDatabase } from '@/core/persistence/bootstrap';
import type { SqlDatabase } from '@/core/persistence/database';

import { openProductSqlDatabase } from './index';

export type ProductCore = CommandDeps & QueryDeps;

const deviceClock: Clock = {
  nowUtcMs: () => Date.now(),
  timeZoneId: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const deviceIds: IdGenerator = {
  uuid: () => Crypto.randomUUID(),
};

let corePromise: Promise<DomainResult<ProductCore>> | null = null;

async function open(): Promise<DomainResult<ProductCore>> {
  const db: SqlDatabase = await openProductSqlDatabase();
  try {
    const initialized = await initializeProductDatabase(db, deviceIds);
    if (!initialized.ok) {
      // a failed migration never creates a replacement database, and the
      // opened connections must not leak across retries
      await db.closeAsync().catch(() => undefined);
      return initialized;
    }
    return ok({ db, clock: deviceClock, ids: deviceIds });
  } catch (cause) {
    await db.closeAsync().catch(() => undefined);
    throw cause;
  }
}

// one shared product core per process; only a successful open is cached so
// the recovery surface's retry re-attempts a failed open instead of
// replaying the remembered failure (the database itself is never replaced)
export function getProductCore(): Promise<DomainResult<ProductCore>> {
  if (corePromise === null) {
    corePromise = open().then(
      (result) => {
        if (!result.ok) {
          corePromise = null;
        }
        return result;
      },
      (cause) => {
        corePromise = null;
        throw cause;
      },
    );
  }
  return corePromise;
}

export function newCommandId(): CommandId {
  return Crypto.randomUUID() as CommandId;
}
