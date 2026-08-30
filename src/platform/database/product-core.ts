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
  const initialized = await initializeProductDatabase(db, deviceIds);
  if (!initialized.ok) {
    // a failed migration never creates a replacement database
    return initialized;
  }
  return ok({ db, clock: deviceClock, ids: deviceIds });
}

// one shared product core per process; a migration failure is remembered so
// the recovery surface stays visible instead of retrying into a broken store
export function getProductCore(): Promise<DomainResult<ProductCore>> {
  if (corePromise === null) {
    corePromise = open().catch((cause) => {
      corePromise = null;
      throw cause;
    });
  }
  return corePromise;
}

export function newCommandId(): CommandId {
  return Crypto.randomUUID() as CommandId;
}
