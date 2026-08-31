import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { getLocales } from 'expo-localization';
import * as Sharing from 'expo-sharing';

import type { ExportMeta } from '@/core/export/serialize';
import { latestSchemaVersion } from '@/core/persistence/schema';
import type { DomainResult } from '@/core/domain/result';
import { err, ok } from '@/core/domain/result';

// device-side file plumbing for export and import; all product decisions
// stay in the core - this module only moves bytes

export function getExportMeta(): ExportMeta {
  return {
    databaseSchemaVersion: latestSchemaVersion,
    appVersion: Application.nativeApplicationVersion ?? 'development',
    buildVersion: Application.nativeBuildVersion ?? 'development',
    locale: getLocales()[0]?.languageTag ?? 'en-US',
  };
}

// writes the export into the cache directory and hands it to the native
// share sheet; a cancelled share is success and the temp file is removed
export async function saveAndShareExport(
  contents: string,
  fileName: string,
): Promise<DomainResult<void>> {
  const file = new File(Paths.cache, fileName);
  try {
    file.write(contents);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: fileName,
      UTI: 'public.json',
    });
    return ok(undefined);
  } catch (cause) {
    return err(
      'database',
      `The export could not be shared: ${cause instanceof Error ? cause.message : String(cause)}`,
      { retryable: true },
    );
  } finally {
    try {
      if (file.exists) {
        file.delete();
      }
    } catch {
      // launch cleanup removes anything a failed delete leaves behind
    }
  }
}

export type PickedImportFile = {
  name: string;
  contents: string;
};

// the system file picker; null means the person cancelled
export async function pickImportFile(): Promise<DomainResult<PickedImportFile | null>> {
  try {
    const picked = await File.pickFileAsync();
    if (picked.canceled || picked.result === null) {
      return ok(null);
    }
    const contents = await picked.result.text();
    return ok({ name: picked.result.name, contents });
  } catch (cause) {
    return err(
      'database',
      `The file could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
      { retryable: true },
    );
  }
}

// next-launch cleanup for export files a previous session left in cache
export function cleanupStaleExports(): void {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && /^ripples-export-.*\.json$/.test(entry.name)) {
        entry.delete();
      }
    }
  } catch {
    // cache cleanup is best effort
  }
}
