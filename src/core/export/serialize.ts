import { listActiveBoards, listArchivedBoards } from '../persistence/repositories/boards';
import { listBoardCheckIns } from '../persistence/repositories/check-ins';
import { getSettings, listBoardPeriods } from '../persistence/repositories/support';
import type { QueryDeps } from '../domain/queries';
import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';

// the offline export snapshot: spec format ripples.export, version 1.
// tombstones, receipts, outbox rows, device ids, and internal error text
// never enter the file.

export type ExportBoard = {
  id: string;
  title: string;
  symbol: string;
  accentHex: string;
  usesTintedBackground: boolean;
  tracksAmount: boolean;
  amountUnit: string | null;
  quickAmount: number;
  tracksTime: boolean;
  startOfDayMinute: number;
  metricsEnabled: boolean;
  orderKey: string;
  createdAtUtc: number;
  archivedAtUtc: number | null;
  periods: { startDate: string; endDate: string | null }[];
};

export type ExportCheckIn = {
  id: string;
  boardId: string;
  logicalDate: string;
  occurredAtUtc: number | null;
  timeZoneId: string | null;
  offsetMinutes: number | null;
  amount: number | null;
  note: string | null;
  source: string;
  createdAtUtc: number;
};

export type ExportSnapshot = {
  format: 'ripples.export';
  exportVersion: 1;
  databaseSchemaVersion: number;
  appVersion: string;
  buildVersion: string;
  exportedAtUtc: number;
  locale: string;
  timeZone: string;
  boards: ExportBoard[];
  checkIns: ExportCheckIn[];
  // reminders arrive with the reminders stage; the key is stable now so
  // version 1 files stay forward-readable
  reminders: never[];
  settings: { metricsEducationDismissed: string[] };
};

export type ExportMeta = {
  databaseSchemaVersion: number;
  appVersion: string;
  buildVersion: string;
  locale: string;
};

// one read transaction keeps boards, periods, and check-ins a consistent
// snapshot while the app stays usable
export function getExportSnapshot(
  deps: QueryDeps,
  meta: ExportMeta,
): Promise<DomainResult<ExportSnapshot>> {
  return (async () => {
    try {
      const snapshot = await deps.db.withTransactionAsync(async (tx) => {
        const boards = [...(await listActiveBoards(tx)), ...(await listArchivedBoards(tx))];
        const exportBoards: ExportBoard[] = [];
        const exportCheckIns: ExportCheckIn[] = [];
        for (const board of boards) {
          const periods = await listBoardPeriods(tx, board.id);
          exportBoards.push({
            id: board.id,
            title: board.title,
            symbol: board.symbol,
            accentHex: board.accentHex,
            usesTintedBackground: board.usesTintedBackground,
            tracksAmount: board.tracksAmount,
            amountUnit: board.amountUnit,
            quickAmount: board.quickAmount,
            tracksTime: board.tracksTime,
            startOfDayMinute: board.startOfDayMinute,
            metricsEnabled: board.metricsEnabled,
            orderKey: board.orderKey,
            createdAtUtc: board.createdAt,
            archivedAtUtc: board.archivedAt,
            periods: periods.map((period) => ({
              startDate: period.startDate,
              endDate: period.endDate,
            })),
          });
          const checkIns = await listBoardCheckIns(tx, board.id);
          for (const checkIn of checkIns) {
            exportCheckIns.push({
              id: checkIn.id,
              boardId: checkIn.boardId,
              logicalDate: checkIn.logicalDate,
              occurredAtUtc: checkIn.occurredAtUtc,
              timeZoneId: checkIn.timeZoneId,
              offsetMinutes: checkIn.offsetMinutes,
              amount: checkIn.amount,
              note: checkIn.note,
              source: checkIn.source,
              createdAtUtc: checkIn.createdAt,
            });
          }
        }
        const settings = await getSettings(tx);
        return {
          format: 'ripples.export' as const,
          exportVersion: 1 as const,
          databaseSchemaVersion: meta.databaseSchemaVersion,
          appVersion: meta.appVersion,
          buildVersion: meta.buildVersion,
          exportedAtUtc: deps.clock.nowUtcMs(),
          locale: meta.locale,
          timeZone: deps.clock.timeZoneId(),
          boards: exportBoards,
          checkIns: exportCheckIns,
          reminders: [] as never[],
          settings: {
            // bootstrap seeds the settings row, so it always exists here
            metricsEducationDismissed: (settings as NonNullable<typeof settings>)
              .metricsEducationDismissed,
          },
        };
      });
      return ok(snapshot);
    } catch (cause) {
      return err(
        'database',
        `The export could not be generated: ${cause instanceof Error ? cause.message : String(cause)}`,
        { retryable: true },
      );
    }
  })();
}

export function serializeExport(snapshot: ExportSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// ripples-export-YYYY-MM-DDTHH-mm-ssZ.json per the spec's naming rule
export function exportFileName(exportedAtUtc: number): string {
  const stamp = new Date(exportedAtUtc)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  return `ripples-export-${stamp}.json`;
}
