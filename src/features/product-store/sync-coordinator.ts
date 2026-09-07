import { getSyncSummary } from '@/core/domain/queries';
import { runSync, type SyncStatus } from '@/core/sync/engine';
import { SyncTransportError, type SyncTransport } from '@/core/sync/transport';
import type { ProductCore } from '@/platform/database/product-core';

export type SyncSnapshot = { status: SyncStatus; busy: boolean; error: string | null };
export const INITIAL_SYNC: SyncSnapshot = { status: 'idle', busy: false, error: null };

// one app-lifetime runner owns serialization and retry. query refresh after a
// sync is separate from a local mutation trigger, preventing a refresh loop.
export class SyncCoordinator {
  private active: Promise<void> | null = null;
  private pending = false;
  private disposed = false;
  private paused = false;
  private generation = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly core: ProductCore,
    private readonly transport: SyncTransport,
    private readonly publish: (state: SyncSnapshot) => void,
    private readonly refreshQueries: () => void,
  ) {}

  request(): Promise<void> {
    if (this.disposed || this.paused) return Promise.resolve();
    this.clearRetry();
    this.pending = true;
    if (this.active === null) {
      this.active = this.drain().finally(() => {
        this.active = null;
        if (this.pending) return this.request();
      });
    }
    return this.active;
  }

  pause(): void {
    this.paused = true;
    this.generation += 1;
    this.pending = false;
    this.clearRetry();
    if (!this.disposed) this.publish(INITIAL_SYNC);
  }

  resume(): void {
    this.paused = false;
    void this.request();
  }

  dispose(): void {
    this.disposed = true;
    this.pause();
  }

  private clearRetry(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  private guardedTransport(generation: number): SyncTransport {
    const guard = () => {
      if (this.disposed || generation !== this.generation) {
        throw new SyncTransportError('unavailable', 'Sync was paused.');
      }
    };
    const run = async <T>(operation: () => Promise<T>): Promise<T> => {
      guard();
      const result = await operation();
      // a fetch that finishes after disabling sync must not apply its page.
      guard();
      return result;
    };
    return {
      ensureZone: () => run(() => this.transport.ensureZone()),
      upload: (records) => run(() => this.transport.upload(records)),
      fetchChanges: (token) => run(() => this.transport.fetchChanges(token)),
    };
  }

  private async drain(): Promise<void> {
    while (this.pending && !this.disposed && !this.paused) {
      this.pending = false;
      const generation = this.generation;
      try {
        const summary = await getSyncSummary(this.core);
        if (this.disposed || generation !== this.generation) continue;
        if (!summary.ok) throw new Error('sync settings unavailable');
        if (!summary.value.enabled) {
          this.publish(INITIAL_SYNC);
          continue;
        }
        this.publish({ status: 'syncing', busy: true, error: null });
        const result = await runSync({
          ...this.core, transport: this.guardedTransport(generation), random: Math.random,
          shouldContinue: () => !this.disposed && !this.paused && generation === this.generation,
        });
        if (this.disposed || generation !== this.generation) continue;
        if (!result.ok) throw new Error('sync unavailable');
        this.publish({ status: result.value.status, busy: false, error: null });
        this.refreshQueries();
        if (result.value.retryAfterMs !== null && !this.pending) {
          this.retry = setTimeout(() => { void this.request(); }, result.value.retryAfterMs);
        }
      } catch {
        if (!this.disposed && generation === this.generation) {
          this.publish({ status: 'needs_attention', busy: false, error: 'Sync could not finish. Try again.' });
        }
      }
    }
  }
}
