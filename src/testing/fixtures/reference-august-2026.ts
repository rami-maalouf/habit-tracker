import {
  importSnapshotInTransaction,
  runCommand,
  type CommandDeps,
  type ImportSummary,
} from '@/core/domain/commands';
import type { CommandId } from '@/core/domain/ids';
import type { DomainResult } from '@/core/domain/result';
import { err } from '@/core/domain/result';
import type { ImportCheckInDraft, ImportDraft } from '@/core/export/import-parsers';
import { hasAnyBoardRows } from '@/core/persistence/repositories/boards';

// these are readable demo labels for visual validation. they are not
// presented as recovered full text from the private reference screenshots.
export const REFERENCE_AUGUST_2026_DEMO_LABELS = [
  'plan your day',
  'morning pages',
  'don’t overeat',
  'in bed at assigned time',
  'dnd until 1 focus session',
  'intentional content',
  'don’t touch stash, ever',
] as const;

const BOARD_IDS = REFERENCE_AUGUST_2026_DEMO_LABELS.map(
  (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);

const ACTIVITY_DATES = [
  ['17', '18', '20', '21', '22', '24', '25', '26', '27', '28', '29', '30'],
  ['17', '19', '21', '23', '25', '27', '29'],
  ['17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '30'],
  ['18', '19', '20', '23', '24', '25', '26', '27', '28', '29', '30'],
  ['17', '18', '19', '20', '22', '24', '25', '26', '28', '30'],
  ['17', '20', '21', '23', '24', '27', '28', '30'],
  ['17', '18', '19', '20', '21', '23', '24', '25', '26', '27', '28', '30'],
] as const;

const SYMBOLS = [
  'calendar',
  'pencil',
  'carrot.fill',
  'bed.double.fill',
  'iphone.slash',
  'play.rectangle.fill',
  'pills.fill',
] as const;

const COLORS = ['#70A7FF', '#8F82FF', '#78D98B', '#E58BA6', '#8E8E93', '#70A7FF', '#F2F2F7'] as const;
const CREATED_AT_UTC = Date.UTC(2026, 7, 1, 16, 0);

function makeCheckIns(): ImportCheckInDraft[] {
  let id = 100;
  return ACTIVITY_DATES.flatMap((dates, boardIndex) =>
    dates.map((day, occurrenceIndex) => {
      id += 1;
      const logicalDate = `2026-08-${day}`;
      const tracksTime = boardIndex === 3;
      return {
        sourceId: `20000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
        sourceBoardId: BOARD_IDS[boardIndex],
        occurredAtUtc: tracksTime ? Date.UTC(2026, 7, Number(day), 14, occurrenceIndex) : null,
        createdAtUtc: Date.UTC(2026, 7, Number(day), 16, occurrenceIndex),
        amount: boardIndex === 1 ? 1 : null,
        note: boardIndex === 0 && day === '30' ? 'ready for the day' : null,
        logicalDate,
        timeZoneId: tracksTime ? 'America/New_York' : null,
        offsetMinutes: tracksTime ? -240 : null,
        preserveId: true,
      };
    }),
  );
}

export const referenceAugust2026Draft: ImportDraft = {
  source: 'own',
  boards: REFERENCE_AUGUST_2026_DEMO_LABELS.map((title, index) => ({
    sourceId: BOARD_IDS[index],
    title,
    symbol: SYMBOLS[index],
    accentHex: COLORS[index],
    usesTintedBackground: true,
    tracksAmount: index === 1,
    amountUnit: index === 1 ? 'pages' : null,
    quickAmount: 1,
    tracksTime: index === 3,
    startOfDayMinute: index === 3 ? 240 : 0,
    metricsEnabled: true,
    createdAtUtc: CREATED_AT_UTC,
    archivedAtUtc: null,
    preserveId: true,
    periods: [{ startDate: '2026-08-01', endDate: null }],
    orderKey: String(index + 1).padStart(4, '0'),
  })),
  checkIns: makeCheckIns(),
  reminders: [],
};

export function seedReferenceAugust2026(
  deps: CommandDeps,
  commandId: CommandId,
): Promise<DomainResult<ImportSummary>> {
  if (!__DEV__) {
    return Promise.resolve(
      err('unavailable', 'Reference demo data is available only in development builds.'),
    );
  }

  return runCommand(deps, commandId, async (context) => {
    if (await hasAnyBoardRows(context.tx)) {
      return err('conflict', 'Demo data can only be added to an empty database.');
    }
    return importSnapshotInTransaction(deps, context, referenceAugust2026Draft);
  });
}
