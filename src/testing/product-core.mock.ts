// jest replacement for the platform product core: the same domain stack over
// node:sqlite so route tests exercise real commands, queries, and migrations
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import type { CommandId } from '@/core/domain/ids';
import type { DomainResult } from '@/core/domain/result';
import { ok } from '@/core/domain/result';
import { initializeProductDatabase } from '@/core/persistence/bootstrap';
import type { SqlDatabase, SqlExecutor, SqlParams } from '@/core/persistence/database';

type ProductCore = {
  db: SqlDatabase;
  clock: { nowUtcMs(): number; timeZoneId(): string };
  ids: { uuid(): string };
};

class MockSqlDatabase implements SqlDatabase {
  private readonly db = new DatabaseSync(':memory:');

  // one connection: all transactions serialize through this queue
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<Value>(run: () => Promise<Value>): Promise<Value> {
    const chained = this.queue.then(run, run);
    this.queue = chained.catch(() => undefined);
    return chained;
  }

  async runAsync(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async getAllAsync<Row>(sql: string, params: SqlParams = []): Promise<Row[]> {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  async getFirstAsync<Row>(sql: string, params: SqlParams = []): Promise<Row | null> {
    return (this.db.prepare(sql).get(...params) as Row | undefined) ?? null;
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  withExclusiveTransactionAsync<Value>(
    work: (tx: SqlExecutor) => Promise<Value>,
  ): Promise<Value> {
    return this.enqueue(async () => {
      this.db.exec('BEGIN EXCLUSIVE');
      try {
        const value = await work(this);
        this.db.exec('COMMIT');
        return value;
      } catch (cause) {
        this.db.exec('ROLLBACK');
        throw cause;
      }
    });
  }

  withTransactionAsync<Value>(work: (tx: SqlExecutor) => Promise<Value>): Promise<Value> {
    return this.enqueue(async () => {
      this.db.exec('BEGIN');
      try {
        const value = await work(this);
        this.db.exec('COMMIT');
        return value;
      } catch (cause) {
        this.db.exec('ROLLBACK');
        throw cause;
      }
    });
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

// tests can pin the clock through these mutable values
export const mockClock = {
  utcMs: Date.UTC(2026, 7, 30, 16, 0),
  zone: 'America/New_York',
};

let corePromise: Promise<DomainResult<ProductCore>> | null = null;

async function open(): Promise<DomainResult<ProductCore>> {
  const db = new MockSqlDatabase();
  const ids = { uuid: () => randomUUID() };
  const initialized = await initializeProductDatabase(db, ids);
  if (!initialized.ok) {
    return initialized;
  }
  return ok({
    db,
    clock: { nowUtcMs: () => mockClock.utcMs, timeZoneId: () => mockClock.zone },
    ids,
  });
}

export function getProductCore(): Promise<DomainResult<ProductCore>> {
  if (corePromise === null) {
    corePromise = open();
  }
  return corePromise;
}

export function newCommandId(): CommandId {
  return randomUUID() as CommandId;
}

// each test file starts from a fresh in-memory database
export function resetProductCoreForTests(): void {
  corePromise = null;
  mockClock.utcMs = Date.UTC(2026, 7, 30, 16, 0);
  mockClock.zone = 'America/New_York';
}
