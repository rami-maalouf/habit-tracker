// jest replacement for the platform data-transfer module: tests set the
// next picked file and observe shared exports without native modules
import type { ExportMeta } from '@/core/export/serialize';
import type { DomainResult } from '@/core/domain/result';
import { err, ok } from '@/core/domain/result';

type Picked = { name: string; contents: string };

export const dataTransferMock = {
  nextPick: null as Picked | 'cancel' | 'error' | null,
  sharedFiles: [] as { fileName: string; contents: string }[],
  shareOutcome: 'ok' as 'ok' | 'error',
  cleanups: 0,
};

export function resetDataTransferMock(): void {
  dataTransferMock.nextPick = null;
  dataTransferMock.sharedFiles = [];
  dataTransferMock.shareOutcome = 'ok';
  dataTransferMock.cleanups = 0;
}

export function getExportMeta(): ExportMeta {
  return {
    databaseSchemaVersion: 1,
    appVersion: 'test',
    buildVersion: 'test',
    locale: 'en-US',
  };
}

export async function saveAndShareExport(
  contents: string,
  fileName: string,
): Promise<DomainResult<void>> {
  if (dataTransferMock.shareOutcome === 'error') {
    return err('database', 'The export could not be shared: disk full', { retryable: true });
  }
  dataTransferMock.sharedFiles.push({ fileName, contents });
  return ok(undefined);
}

export type PickedImportFile = Picked;

export async function pickImportFile(): Promise<DomainResult<Picked | null>> {
  const next = dataTransferMock.nextPick;
  dataTransferMock.nextPick = null;
  if (next === 'error') {
    return err('database', 'The file could not be read.', { retryable: true });
  }
  if (next === 'cancel' || next === null) {
    return ok(null);
  }
  return ok(next);
}

export function cleanupStaleExports(): void {
  dataTransferMock.cleanups += 1;
}
