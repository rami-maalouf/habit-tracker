import { archiveBoard, createCheckIn, deleteBoard, importSnapshot } from '@/core/domain/commands';
import { createReminder } from '@/core/domain/reminder-commands';
import { listBoardReminders } from '@/core/domain/queries';

import { FakeReminderScheduler } from '../helpers/fake-scheduler';
import type { LogicalDate } from '@/core/domain/ids';
import { getBoardSummary, getGroupedCheckInHistory, listActiveBoards, listArchivedBoards } from '@/core/domain/queries';
import {
  exportFileName,
  getExportSnapshot,
  serializeExport,
} from '@/core/export/serialize';
import { parseCsv, parseOwnExport, parseRipplesCsv } from '@/core/export/import-parsers';

import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness } from '../helpers/test-db';

const META = {
  databaseSchemaVersion: 1,
  appVersion: '1.0.0',
  buildVersion: '1',
  locale: 'en-US',
};

// mirrors the structure of a real ripples csv export: unicode apostrophes,
// quoted commas, an amount-kind board, empty cells, and utc instants
const RIPPLES_CSV = `entity,board_id,board_name,board_amountKind,board_tracksCheckinTime,board_tracksPerformanceMetrics,board_defaultAmount,board_dayStartShiftSeconds,board_archivedAt,board_createdAt,checkin_id,checkin_boardId,checkin_amount,checkin_note,checkin_createdAt
Board,0C137BDE-BCB0-465B-8C9B-BE3E71774FA6,"don’t touch stash, ever",,false,true,,0.0,,2026-05-04T02:06:28Z,,,,,
Board,74F893AF-8B5E-4166-8877-A4061D2917FB,"prayers","Prayers",false,true,,1800.0,,2026-08-01T14:31:30Z,,,,,
Board,AAAA0000-0000-4000-8000-000000000001,"retired habit",,true,false,,0.0,2026-07-01T10:00:00Z,2026-06-01T09:00:00Z,,,,,
Checkin,,,,,,,,,,D5EC18C1-F13A-4594-A4F5-9450BC6D6004,0C137BDE-BCB0-465B-8C9B-BE3E71774FA6,,,2026-05-04T15:17:39Z
Checkin,,,,,,,,,,3088B55B-6C39-4B43-B948-ABE97EFFFA53,0C137BDE-BCB0-465B-8C9B-BE3E71774FA6,,,2026-08-23T03:29:26Z
Checkin,,,,,,,,,,81C1F4E1-CE6D-43E9-B517-51235F13BD64,74F893AF-8B5E-4166-8877-A4061D2917FB,2.0,"with focus, twice",2026-08-30T14:32:18Z
Checkin,,,,,,,,,,11111111-1111-4111-8111-111111111111,AAAA0000-0000-4000-8000-000000000001,,,2026-06-20T15:51:34Z
Checkin,,,,,,,,,,22222222-2222-4222-8222-222222222222,MISSING-BOARD,,,2026-06-20T15:51:34Z
`;

function csvRows(text: string): string[][] {
  const parsed = parseCsv(text);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

describe('csv parsing', () => {
  it('handles quotes, embedded commas, doubled quotes, and crlf', () => {
    const rows = csvRows('a,"b,c","""d"" raw"\r\n"line\nbreak",e,f');
    expect(rows[0]).toEqual(['a', 'b,c', '"d" raw']);
    expect(rows[1]).toEqual(['line\nbreak', 'e', 'f']);
  });

  it('rejects malformed quoting instead of silently misreading it', () => {
    // unterminated quoted field
    expect(parseCsv('a,"never closes').ok).toBe(false);
    // quote opening inside an unquoted field
    expect(parseCsv('a,b"c').ok).toBe(false);
    // content after a closing quote
    expect(parseCsv('"a"x,b').ok).toBe(false);
    expect(parseCsv('a,"b" ,c').ok).toBe(false);
    // a lone empty quoted field at end of input still lands in a row
    expect(csvRows('a,""')).toEqual([['a', '']]);
  });

  it('parses the ripples export structure', () => {
    const parsed = parseRipplesCsv(RIPPLES_CSV);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    expect(parsed.value.boards).toHaveLength(3);
    expect(parsed.value.checkIns).toHaveLength(5);
    const [plain, prayers, retired] = parsed.value.boards;
    expect(plain.title).toBe('don’t touch stash, ever');
    expect(plain.tracksAmount).toBe(false);
    expect(prayers.tracksAmount).toBe(true);
    expect(prayers.amountUnit).toBe('Prayers');
    // 1800 seconds rounds onto the 30-minute step
    expect(prayers.startOfDayMinute).toBe(30);
    expect(retired.metricsEnabled).toBe(false);
    expect(retired.tracksTime).toBe(true);
    expect(retired.archivedAtUtc).not.toBeNull();
    const noted = parsed.value.checkIns[2];
    expect(noted.amount).toBe(2);
    expect(noted.note).toBe('with focus, twice');
  });

  it('rejects files that are not ripples exports', () => {
    expect(parseRipplesCsv('a,b,c\n1,2,3').ok).toBe(false);
    expect(parseRipplesCsv('').ok).toBe(false);
    const badEntity = RIPPLES_CSV.replace('Checkin,', 'Widget,');
    expect(parseRipplesCsv(badEntity).ok).toBe(false);
    const headerOnly = RIPPLES_CSV.split('\n')[0];
    expect(parseRipplesCsv(headerOnly).ok).toBe(false);
    const noBoards = `${RIPPLES_CSV.split('\n')[0]}\nCheckin,,,,,,,,,,X,Y,,,2026-06-20T15:51:34Z`;
    expect(parseRipplesCsv(noBoards).ok).toBe(false);
    const badDate = RIPPLES_CSV.replace('2026-05-04T02:06:28Z', 'not-a-date');
    expect(parseRipplesCsv(badDate).ok).toBe(false);
    const noName = RIPPLES_CSV.replace('"don’t touch stash, ever"', '');
    expect(parseRipplesCsv(noName).ok).toBe(false);
    const badCheckIn = RIPPLES_CSV.replace('2026-05-04T15:17:39Z', '');
    expect(parseRipplesCsv(badCheckIn).ok).toBe(false);
  });

  it('propagates csv quoting errors through the ripples parser', () => {
    expect(parseRipplesCsv('a,"broken').ok).toBe(false);
  });

  it('requires the full set of consumed columns', () => {
    // a partial schema would silently import lossy data
    const missingNote = RIPPLES_CSV.replace('checkin_note', 'renamed_note');
    expect(parseRipplesCsv(missingNote).ok).toBe(false);
    const missingArchive = RIPPLES_CSV.replace('board_archivedAt', 'board_archived');
    expect(parseRipplesCsv(missingArchive).ok).toBe(false);
  });

  it('rejects an unreadable non-empty archive date instead of restoring active', () => {
    const garbageArchive = RIPPLES_CSV.replace('2026-07-01T10:00:00Z', 'garbage-date');
    const parsed = parseRipplesCsv(garbageArchive);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.message).toContain('archive date');
    }
  });
});

describe('ripples csv import', () => {
  it('imports boards with historical periods and zone-correct logical dates', async () => {
    const harness = await createTestHarness();
    const parsed = parseRipplesCsv(RIPPLES_CSV);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: parsed.value,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.boardsCreated).toBe(3);
    expect(result.value.checkInsCreated).toBe(4);
    // the check-in pointing at an unknown board is skipped, not fatal
    expect(result.value.checkInsSkipped).toBe(1);

    const active = await listActiveBoards(harness.deps);
    const archived = await listArchivedBoards(harness.deps);
    if (!active.ok || !archived.ok) {
      throw new Error('board queries failed');
    }
    expect(active.value.map((board) => board.title).sort()).toEqual([
      'don’t touch stash, ever',
      'prayers',
    ]);
    expect(archived.value[0].title).toBe('retired habit');

    // 2026-08-23T03:29Z is the evening of the 22nd in america/new_york
    const plain = active.value.find((board) => board.title.startsWith('don'));
    const history = await getGroupedCheckInHistory(harness.deps, plain!.id);
    if (!history.ok) {
      throw new Error('history failed');
    }
    const dates = history.value.months.flatMap((month) => month.days.map((day) => day.date));
    expect(dates).toContain('2026-08-22');
    expect(dates).toContain('2026-05-04');

    // eligibility starts at the board's ORIGINAL creation date, so the
    // summary sees months of eligible days, not an import-day period
    const summary = await getBoardSummary(harness.deps, plain!.id);
    if (!summary.ok || summary.value === null) {
      throw new Error('summary failed');
    }
    expect(summary.value.eligibleDayCount).toBeGreaterThan(100);

    // the amount survived on the amount board; the retired board kept its
    // instant because it tracks time
    const prayers = active.value.find((board) => board.title === 'prayers');
    const prayersHistory = await getGroupedCheckInHistory(harness.deps, prayers!.id);
    if (!prayersHistory.ok) {
      throw new Error('history failed');
    }
    expect(prayersHistory.value.months[0].days[0].checkIns[0].amount).toBe(2);
    expect(prayersHistory.value.months[0].days[0].checkIns[0].occurredAtUtc).toBeNull();
    await harness.db.closeAsync();
  });

  it('replays the same import idempotently through the receipt', async () => {
    const harness = await createTestHarness();
    const parsed = parseRipplesCsv(RIPPLES_CSV);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const commandId = harness.ids.nextCommandId();
    const first = await importSnapshot(harness.deps, { commandId, draft: parsed.value });
    const replay = await importSnapshot(harness.deps, { commandId, draft: parsed.value });
    expect(first.ok && replay.ok).toBe(true);
    const active = await listActiveBoards(harness.deps);
    expect(active.ok && active.value).toHaveLength(2);
    await harness.db.closeAsync();
  });

  it('skips invalid boards and future check-ins individually', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'ripples-csv',
        reminders: [],
        boards: [
          {
            sourceId: 'B1',
            title: '',
            symbol: 'star.fill',
            accentHex: '#78D98B',
            usesTintedBackground: true,
            tracksAmount: false,
            amountUnit: null,
            quickAmount: 1,
            tracksTime: false,
            startOfDayMinute: 0,
            metricsEnabled: true,
            createdAtUtc: Date.UTC(2026, 7, 1),
            archivedAtUtc: null,
            preserveId: false,
            periods: null,
            orderKey: null,
          },
          {
            sourceId: 'B2',
            title: 'good board',
            symbol: 'star.fill',
            accentHex: '#78D98B',
            usesTintedBackground: true,
            tracksAmount: false,
            amountUnit: null,
            quickAmount: 1,
            tracksTime: false,
            startOfDayMinute: 0,
            metricsEnabled: true,
            createdAtUtc: Date.UTC(2026, 7, 1),
            archivedAtUtc: Date.UTC(2026, 6, 1),
            preserveId: false,
            periods: null,
            orderKey: null,
          },
        ],
        checkIns: [
          {
            sourceId: null,
            sourceBoardId: 'B2',
            occurredAtUtc: Date.UTC(2027, 0, 1),
            createdAtUtc: Date.UTC(2027, 0, 1),
            amount: null,
            note: null,
            logicalDate: null,
            timeZoneId: null,
            offsetMinutes: null,
            preserveId: false,
          },
          {
            sourceId: null,
            sourceBoardId: 'B2',
            occurredAtUtc: Date.UTC(2026, 7, 10, 12, 0),
            createdAtUtc: Date.UTC(2026, 7, 10, 12, 0),
            amount: 5,
            note: 'x'.repeat(100000),
            logicalDate: null,
            timeZoneId: null,
            offsetMinutes: null,
            preserveId: false,
          },
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.boardsSkipped).toBe(1);
    expect(result.value.boardsCreated).toBe(1);
    expect(result.value.checkInsSkipped).toBe(1);
    expect(result.value.checkInsCreated).toBe(1);

    // the archive clamp keeps the closed period ordered, the giant note is
    // dropped, and the amount is dropped on a non-amount board
    const archived = await listArchivedBoards(harness.deps);
    if (!archived.ok) {
      throw new Error('archived failed');
    }
    const history = await getGroupedCheckInHistory(harness.deps, archived.value[0].id);
    if (!history.ok) {
      throw new Error('history failed');
    }
    const record = history.value.months[0].days[0].checkIns[0];
    expect(record.note).toBeNull();
    expect(record.amount).toBeNull();
    await harness.db.closeAsync();
  });
});

describe('own export round trip', () => {
  it('exports a consistent snapshot and restores it into a fresh store', async () => {
    const source = await createTestHarness();
    const boardId = await createBoardForTest(source, {
      title: 'travelled board',
      tracksAmount: true,
      amountUnit: 'km',
      quickAmount: 5,
    });
    for (const day of ['2026-08-28', '2026-08-29', '2026-08-30']) {
      const created = await createCheckIn(source.deps, {
        commandId: source.ids.nextCommandId(),
        boardId,
        logicalDate: day as LogicalDate,
        amount: 3,
        note: day === '2026-08-29' ? 'good run' : undefined,
        source: 'app',
      });
      if (!created.ok) {
        throw new Error(created.error.message);
      }
    }
    const reminderScheduler = new FakeReminderScheduler();
    const reminderResult = await createReminder(
      { ...source.deps, scheduler: reminderScheduler },
      {
        commandId: source.ids.nextCommandId(),
        boardId,
        weekdaysMask: 0b0010001,
        minuteOfDay: 540,
        message: 'lace up',
        enabled: true,
      },
    );
    if (!reminderResult.ok) {
      throw new Error(reminderResult.error.message);
    }
    await archiveBoard(source.deps, { commandId: source.ids.nextCommandId(), boardId });

    const snapshot = await getExportSnapshot(source.deps, META);
    if (!snapshot.ok) {
      throw new Error(snapshot.error.message);
    }
    expect(snapshot.value.format).toBe('ripples.export');
    expect(snapshot.value.boards).toHaveLength(1);
    expect(snapshot.value.checkIns).toHaveLength(3);
    expect(snapshot.value.boards[0].periods.length).toBeGreaterThanOrEqual(1);
    // reminder rules and enabled state travel; native state stays behind
    expect(snapshot.value.reminders).toEqual([
      {
        id: reminderResult.value.reminderId,
        boardId,
        weekdaysMask: 0b0010001,
        minuteOfDay: 540,
        message: 'lace up',
        enabled: true,
        createdAtUtc: expect.any(Number),
      },
    ]);

    const serialized = serializeExport(snapshot.value);

    // the serialized file must not leak sync or device internals; every
    // key in the actual json is checked, not just the keys a lenient
    // parser happens to read back
    const keys = new Set<string>();
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          collectKeys(nested);
        }
      }
    };
    collectKeys(JSON.parse(serialized));
    const forbidden = [
      'receipt',
      'outbox',
      'device',
      'tombstone',
      'deleted',
      'mutationstamp',
      'idempotency',
      'hlc',
    ];
    for (const key of keys) {
      for (const fragment of forbidden) {
        expect(key.toLowerCase()).not.toContain(fragment);
      }
    }

    const parsed = parseOwnExport(serialized);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }

    const target = await createTestHarness();
    const imported = await importSnapshot(target.deps, {
      commandId: target.ids.nextCommandId(),
      draft: parsed.value,
    });
    if (!imported.ok) {
      throw new Error(imported.error.message);
    }
    expect(imported.value.boardsCreated).toBe(1);
    expect(imported.value.checkInsCreated).toBe(3);
    expect(imported.value.remindersCreated).toBe(1);

    const restoredReminders = await listBoardReminders(target.deps, boardId);
    if (!restoredReminders.ok) {
      throw new Error('reminders query failed');
    }
    expect(restoredReminders.value[0].id).toBe(reminderResult.value.reminderId);
    expect(restoredReminders.value[0].enabled).toBe(true);
    // the schedule itself is rebuilt by the reconciler, never imported
    expect(restoredReminders.value[0].scheduleState).toBe('idle');

    const restored = await listArchivedBoards(target.deps);
    if (!restored.ok) {
      throw new Error('restored query failed');
    }
    expect(restored.value[0].id).toBe(boardId);
    expect(restored.value[0].amountUnit).toBe('km');
    const history = await getGroupedCheckInHistory(target.deps, boardId);
    if (!history.ok) {
      throw new Error('history failed');
    }
    expect(history.value.months[0].count).toBe(3);
    expect(
      history.value.months[0].days.find((day) => day.date === '2026-08-29')?.checkIns[0].note,
    ).toBe('good run');

    // re-importing the same file is a no-op
    const again = await importSnapshot(target.deps, {
      commandId: target.ids.nextCommandId(),
      draft: parsed.value,
    });
    if (!again.ok) {
      throw new Error(again.error.message);
    }
    expect(again.value.boardsCreated).toBe(0);
    expect(again.value.checkInsCreated).toBe(0);
    expect(again.value.remindersSkipped).toBe(1);
    await source.db.closeAsync();
    await target.db.closeAsync();
  });

  it('rejects foreign or newer json files', () => {
    expect(parseOwnExport('not json').ok).toBe(false);
    expect(parseOwnExport('42').ok).toBe(false);
    expect(parseOwnExport('{"format":"other"}').ok).toBe(false);
    expect(parseOwnExport('{"format":"ripples.export","exportVersion":2}').ok).toBe(false);
  });

  it('skips malformed own-export records instead of rejecting the file', () => {
    const mixed = JSON.stringify({
      format: 'ripples.export',
      exportVersion: 1,
      boards: [
        null,
        {},
        { id: '00000000-0000-4000-8000-0000000000aa', title: 5 },
        {
          id: '00000000-0000-4000-8000-0000000000ab',
          title: 'survivor',
          // malformed period entries are shape-filtered at parse time
          periods: [null, { startDate: 42 }, { startDate: '2026-08-01', endDate: 7 }],
        },
      ],
      checkIns: [
        null,
        {},
        { id: 'x' },
        {
          id: '00000000-0000-4000-8000-0000000000ac',
          boardId: '00000000-0000-4000-8000-0000000000ab',
          logicalDate: '2026-08-01',
        },
      ],
    });
    const parsed = parseOwnExport(mixed);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    expect(parsed.value.boards).toHaveLength(1);
    expect(parsed.value.boards[0].title).toBe('survivor');
    expect(parsed.value.boards[0].periods).toEqual([
      { startDate: '2026-08-01', endDate: null },
    ]);
    expect(parsed.value.checkIns).toHaveLength(1);
  });

  it('names export files by their utc instant', () => {
    expect(exportFileName(Date.UTC(2026, 7, 30, 16, 4, 5))).toBe(
      'ripples-export-2026-08-30T16-04-05Z.json',
    );
  });
});


describe('parser and command edge coverage', () => {
  it('applies defaults for minimal own-export records', () => {
    const minimal = JSON.stringify({
      format: 'ripples.export',
      exportVersion: 1,
      boards: [{ id: '00000000-0000-4000-8000-0000000000aa', title: 'bare' }],
      checkIns: [
        {
          id: '00000000-0000-4000-8000-0000000000bb',
          boardId: '00000000-0000-4000-8000-0000000000aa',
          logicalDate: '2026-08-01',
        },
        {
          id: '00000000-0000-4000-8000-0000000000cc',
          boardId: '00000000-0000-4000-8000-0000000000aa',
          logicalDate: '2026-08-02',
          occurredAtUtc: 1780000000000,
          timeZoneId: 'America/New_York',
          offsetMinutes: -240,
          amount: 2,
          note: 'full',
          createdAtUtc: 1780000000000,
        },
      ],
    });
    const parsed = parseOwnExport(minimal);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const board = parsed.value.boards[0];
    expect(board.symbol.length).toBeGreaterThan(0);
    expect(board.accentHex.startsWith('#')).toBe(true);
    expect(board.quickAmount).toBe(1);
    expect(board.startOfDayMinute).toBe(0);
    expect(board.periods).toBeNull();
    expect(board.orderKey).toBeNull();
    const [bare, full] = parsed.value.checkIns;
    expect(bare.occurredAtUtc).toBeNull();
    expect(bare.createdAtUtc).toBe(0);
    expect(full.timeZoneId).toBe('America/New_York');
    expect(full.offsetMinutes).toBe(-240);
  });

  it('covers csv oddities: short rows, bad numbers, and no trailing newline', () => {
    const header = RIPPLES_CSV.split('\n')[0];
    // a truncated board row still parses through the safe cell accessor
    const short = `${header}\nBoard,BB,"short row"`;
    const parsedShort = parseRipplesCsv(short);
    expect(parsedShort.ok).toBe(false);

    const odd = `${header}\nBoard,BB,"odd board",,true,false,abc,notanumber,,2026-05-04T02:06:28Z,,,,,\nCheckin,,,,,,,,,,C1,BB,abc,,2026-05-05T02:06:28Z`;
    const parsedOdd = parseRipplesCsv(odd);
    if (!parsedOdd.ok) {
      throw new Error(parsedOdd.error.message);
    }
    expect(parsedOdd.value.boards[0].startOfDayMinute).toBe(0);
    expect(parsedOdd.value.boards[0].quickAmount).toBe(1);
    expect(parsedOdd.value.boards[0].tracksTime).toBe(true);
    expect(parsedOdd.value.boards[0].metricsEnabled).toBe(false);
    // a non-numeric amount becomes no amount
    expect(parsedOdd.value.checkIns[0].amount).toBeNull();

    const zeroDefault = `${header}\nBoard,BB,"zero default","Cups",false,true,0,0.0,,2026-05-04T02:06:28Z,,,,,`;
    const parsedZero = parseRipplesCsv(zeroDefault);
    if (!parsedZero.ok) {
      throw new Error(parsedZero.error.message);
    }
    expect(parsedZero.value.boards[0].quickAmount).toBe(1);

    expect(csvRows('a,')).toEqual([['a', '']]);
    expect(csvRows('a,b')).toEqual([['a', 'b']]);
  });

  it('skips own-format records with malformed uuids and falls back zones', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          {
            sourceId: 'not-a-uuid',
            title: 'bad id',
            symbol: 'star.fill',
            accentHex: '#78D98B',
            usesTintedBackground: true,
            tracksAmount: false,
            amountUnit: null,
            quickAmount: 1,
            tracksTime: false,
            startOfDayMinute: 0,
            metricsEnabled: true,
            createdAtUtc: Date.UTC(2026, 7, 1),
            archivedAtUtc: null,
            preserveId: true,
            periods: null,
            orderKey: null,
          },
          {
            sourceId: '00000000-0000-4000-8000-0000000000dd',
            title: 'timed restore',
            symbol: 'star.fill',
            accentHex: '#78D98B',
            usesTintedBackground: true,
            tracksAmount: false,
            amountUnit: null,
            quickAmount: 1,
            tracksTime: true,
            startOfDayMinute: 0,
            metricsEnabled: true,
            createdAtUtc: Date.UTC(2026, 7, 1),
            archivedAtUtc: null,
            preserveId: true,
            periods: [{ startDate: '2026-08-01', endDate: '2026-08-10' }],
            orderKey: 'b0',
          },
        ],
        checkIns: [
          {
            sourceId: 'also-not-a-uuid',
            sourceBoardId: '00000000-0000-4000-8000-0000000000dd',
            occurredAtUtc: Date.UTC(2026, 7, 2, 12, 0),
            createdAtUtc: Date.UTC(2026, 7, 2, 12, 0),
            amount: null,
            note: null,
            logicalDate: '2026-08-02',
            timeZoneId: null,
            offsetMinutes: null,
            preserveId: true,
          },
          {
            sourceId: '00000000-0000-4000-8000-0000000000ee',
            sourceBoardId: '00000000-0000-4000-8000-0000000000dd',
            occurredAtUtc: Date.UTC(2026, 7, 3, 12, 0),
            createdAtUtc: Date.UTC(2026, 7, 3, 12, 0),
            amount: null,
            note: null,
            logicalDate: '2026-08-03',
            timeZoneId: null,
            offsetMinutes: null,
            preserveId: true,
          },
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.boardsSkipped).toBe(1);
    expect(result.value.boardsCreated).toBe(1);
    expect(result.value.checkInsSkipped).toBe(1);
    expect(result.value.checkInsCreated).toBe(1);

    // a restored timed check-in without a recorded zone falls back to the
    // device zone and derives its offset
    const history = await getGroupedCheckInHistory(
      harness.deps,
      '00000000-0000-4000-8000-0000000000dd' as never,
    );
    if (!history.ok) {
      throw new Error('history failed');
    }
    const record = history.value.months[0].days[0].checkIns[0];
    expect(record.timeZoneId).toBe('America/New_York');
    expect(record.offsetMinutes).not.toBeNull();
    await harness.db.closeAsync();
  });

  it('covers remaining parser sides: empty arrays, escaped quotes, valid defaults', () => {
    // an export without array fields parses to an empty draft
    const empty = parseOwnExport('{"format":"ripples.export","exportVersion":1}');
    if (!empty.ok) {
      throw new Error(empty.error.message);
    }
    expect(empty.value.boards).toHaveLength(0);
    expect(empty.value.checkIns).toHaveLength(0);
    // a valid-id board with a non-string title is skipped, not fatal
    const badTitle = parseOwnExport(
      '{"format":"ripples.export","exportVersion":1,"boards":[{"id":"x","title":5}],"checkIns":[]}',
    );
    expect(badTitle.ok && badTitle.value.boards).toHaveLength(0);
    // doubled quotes inside a quoted field
    expect(csvRows('"a""b",c')).toEqual([['a"b', 'c']]);

    const header = RIPPLES_CSV.split('\n')[0];
    const validDefault = `${header}\nBoard,BB,"five default","Cups",false,true,5,,,2026-05-04T02:06:28Z,,,,,`;
    const parsed = parseRipplesCsv(validDefault);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    expect(parsed.value.boards[0].quickAmount).toBe(5);
    expect(parsed.value.boards[0].startOfDayMinute).toBe(0);
  });

  it('keeps a restored offset and zone verbatim on a timed board', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          {
            sourceId: '00000000-0000-4000-8000-0000000000f1',
            title: 'zone keeper',
            symbol: 'star.fill',
            accentHex: '#78D98B',
            usesTintedBackground: true,
            tracksAmount: false,
            amountUnit: null,
            quickAmount: 1,
            tracksTime: true,
            startOfDayMinute: 0,
            metricsEnabled: true,
            createdAtUtc: Date.UTC(2026, 7, 1),
            archivedAtUtc: null,
            preserveId: true,
            periods: [{ startDate: '2026-08-01', endDate: null }],
            orderKey: 'c0',
          },
        ],
        checkIns: [
          {
            sourceId: '00000000-0000-4000-8000-0000000000f2',
            sourceBoardId: '00000000-0000-4000-8000-0000000000f1',
            occurredAtUtc: Date.UTC(2026, 7, 2, 12, 0),
            createdAtUtc: Date.UTC(2026, 7, 2, 12, 0),
            amount: null,
            note: null,
            logicalDate: '2026-08-02',
            timeZoneId: 'Europe/Berlin',
            offsetMinutes: 120,
            preserveId: true,
          },
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const history = await getGroupedCheckInHistory(
      harness.deps,
      '00000000-0000-4000-8000-0000000000f1' as never,
    );
    if (!history.ok) {
      throw new Error('history failed');
    }
    const record = history.value.months[0].days[0].checkIns[0];
    expect(record.timeZoneId).toBe('Europe/Berlin');
    expect(record.offsetMinutes).toBe(120);
    await harness.db.closeAsync();
  });

  it('keeps error messages from real export failures', async () => {
    const harness = await createTestHarness();
    const broken = Object.create(harness.db) as typeof harness.db;
    broken.withTransactionAsync = async () => {
      throw new Error('genuine failure');
    };
    const snapshot = await getExportSnapshot({ db: broken, clock: harness.clock }, META);
    expect(snapshot.ok).toBe(false);
    if (!snapshot.ok) {
      expect(snapshot.error.message).toContain('genuine failure');
    }
    await harness.db.closeAsync();
  });

  it('stringifies non-error export failures', async () => {
    const harness = await createTestHarness();
    const broken = Object.create(harness.db) as typeof harness.db;
    broken.withTransactionAsync = async () => {
      throw 'not an error object';
    };
    const snapshot = await getExportSnapshot({ db: broken, clock: harness.clock }, META);
    expect(snapshot.ok).toBe(false);
    if (!snapshot.ok) {
      expect(snapshot.error.message).toContain('not an error object');
    }
    await harness.db.closeAsync();
  });

  it('wraps export failures from a closed store', async () => {
    const harness = await createTestHarness();
    await harness.db.closeAsync();
    const snapshot = await getExportSnapshot(harness.deps, META);
    expect(snapshot.ok).toBe(false);
    if (!snapshot.ok) {
      expect(snapshot.error.message).toContain('The export could not be generated');
    }
  });
});

describe('import hardening', () => {
  const boardDraft = (overrides: Record<string, unknown>) => ({
    sourceId: '00000000-0000-4000-8000-0000000000a0',
    title: 'hardened',
    symbol: 'star.fill',
    accentHex: '#78D98B',
    usesTintedBackground: true,
    tracksAmount: false,
    amountUnit: null,
    quickAmount: 1,
    tracksTime: false,
    startOfDayMinute: 0,
    metricsEnabled: true,
    createdAtUtc: Date.UTC(2026, 7, 1, 12),
    archivedAtUtc: null,
    preserveId: true,
    periods: null,
    orderKey: null,
    ...overrides,
  });
  const checkInDraft = (overrides: Record<string, unknown>) => ({
    sourceId: null,
    sourceBoardId: '00000000-0000-4000-8000-0000000000a0',
    occurredAtUtc: null,
    createdAtUtc: Date.UTC(2026, 7, 2, 12),
    amount: null,
    note: null,
    logicalDate: '2026-08-02',
    timeZoneId: null,
    offsetMinutes: null,
    preserveId: true,
    ...overrides,
  });

  it('skips tombstoned ids without aborting the restore', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { title: 'doomed board' });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    const deleted = await deleteBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    if (!deleted.ok) {
      throw new Error(deleted.error.message);
    }

    // restoring a file that still contains the deleted records must not
    // hit the tombstones' primary keys and roll the whole restore back
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [boardDraft({ sourceId: boardId, title: 'doomed board' })],
        checkIns: [
          checkInDraft({ sourceId: created.value.checkInId, sourceBoardId: boardId }),
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000a1',
            sourceBoardId: boardId,
          }),
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.boardsSkipped).toBe(1);
    expect(result.value.boardsCreated).toBe(0);
    // the deleted board is not rerouted, so both check-ins skip
    expect(result.value.checkInsSkipped).toBe(2);
    const active = await listActiveBoards(harness.deps);
    expect(active.ok && active.value).toHaveLength(0);
    await harness.db.closeAsync();
  });

  it('replays coherent restored periods and distrusts incoherent lists', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b1',
            title: 'coherent',
            periods: [
              { startDate: '2026-08-10', endDate: null },
              { startDate: '2026-08-01', endDate: '2026-08-05' },
            ],
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b2',
            title: 'overlapping',
            periods: [
              { startDate: '2026-08-01', endDate: '2026-08-10' },
              { startDate: '2026-08-05', endDate: null },
            ],
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b3',
            title: 'bad dates',
            periods: [{ startDate: '2026-13-40', endDate: null }],
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b4',
            title: 'end before start',
            periods: [{ startDate: '2026-08-10', endDate: '2026-08-01' }],
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b5',
            title: 'open not last',
            periods: [
              { startDate: '2026-08-01', endDate: null },
              { startDate: '2026-08-10', endDate: '2026-08-12' },
            ],
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b6',
            title: 'garbage end',
            periods: [{ startDate: '2026-08-01', endDate: 'soon' }],
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000b7',
            title: 'null entry',
            periods: [null as never],
          }),
        ],
        checkIns: [],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.boardsCreated).toBe(7);

    // the coherent list replays exactly: aug 1-5 and aug 10-today are
    // eligible, the gap is not
    const coherent = await getBoardSummary(
      harness.deps,
      '00000000-0000-4000-8000-0000000000b1' as never,
    );
    if (!coherent.ok || coherent.value === null) {
      throw new Error('summary failed');
    }
    expect(coherent.value.eligibleDayCount).toBe(26);

    // every distrusted list falls back to one derived lifetime period
    // starting at the original creation date (aug 1 -> 30 days)
    for (const id of ['b2', 'b3', 'b4', 'b5', 'b6', 'b7']) {
      const summary = await getBoardSummary(
        harness.deps,
        `00000000-0000-4000-8000-0000000000${id}` as never,
      );
      if (!summary.ok || summary.value === null) {
        throw new Error('summary failed');
      }
      expect(summary.value.eligibleDayCount).toBe(30);
    }
    await harness.db.closeAsync();
  });

  it('drops imported amounts that fail the domain gate', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000c1',
            title: 'amounts',
            tracksAmount: true,
            amountUnit: 'km',
          }),
        ],
        checkIns: [
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000c2',
            sourceBoardId: '00000000-0000-4000-8000-0000000000c1',
            logicalDate: '2026-08-02',
            amount: 2_000_000_000,
          }),
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000c3',
            sourceBoardId: '00000000-0000-4000-8000-0000000000c1',
            logicalDate: '2026-08-03',
            amount: 1.2345,
          }),
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000c4',
            sourceBoardId: '00000000-0000-4000-8000-0000000000c1',
            logicalDate: '2026-08-04',
            amount: -3,
          }),
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000c5',
            sourceBoardId: '00000000-0000-4000-8000-0000000000c1',
            logicalDate: '2026-08-05',
            amount: 2.5,
          }),
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.checkInsCreated).toBe(4);
    const history = await getGroupedCheckInHistory(
      harness.deps,
      '00000000-0000-4000-8000-0000000000c1' as never,
    );
    if (!history.ok) {
      throw new Error('history failed');
    }
    const amounts = new Map(
      history.value.months
        .flatMap((month) => month.days)
        .map((day) => [day.date, day.checkIns[0].amount]),
    );
    expect(amounts.get('2026-08-02' as LogicalDate)).toBeNull();
    expect(amounts.get('2026-08-03' as LogicalDate)).toBeNull();
    expect(amounts.get('2026-08-04' as LogicalDate)).toBeNull();
    expect(amounts.get('2026-08-05' as LogicalDate)).toBe(2.5);
    await harness.db.closeAsync();
  });

  it('skips a record with no usable date at all', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          boardDraft({ sourceId: '00000000-0000-4000-8000-0000000000d8', title: 'dateless' }),
        ],
        checkIns: [
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000d9',
            sourceBoardId: '00000000-0000-4000-8000-0000000000d8',
            logicalDate: 'not-a-date',
            occurredAtUtc: null,
          }),
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.checkInsSkipped).toBe(1);
    expect(result.value.checkInsCreated).toBe(0);
    await harness.db.closeAsync();
  });

  it('clamps same-day future instants to now', async () => {
    const harness = await createTestHarness();
    const now = harness.clock.nowUtcMs();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000d1',
            title: 'clock skew',
            tracksTime: true,
          }),
        ],
        checkIns: [
          checkInDraft({
            sourceId: '00000000-0000-4000-8000-0000000000d2',
            sourceBoardId: '00000000-0000-4000-8000-0000000000d1',
            logicalDate: '2026-08-30',
            occurredAtUtc: now + 5 * 60 * 1000,
          }),
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const history = await getGroupedCheckInHistory(
      harness.deps,
      '00000000-0000-4000-8000-0000000000d1' as never,
    );
    if (!history.ok) {
      throw new Error('history failed');
    }
    expect(history.value.months[0].days[0].checkIns[0].occurredAtUtc).toBe(now);
    await harness.db.closeAsync();
  });

  it('folds preserved order keys into the generator high-water mark', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        reminders: [],
        boards: [
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000e1',
            title: 'late key',
            orderKey: 'z1',
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000e2',
            title: 'early key',
            orderKey: 'a1',
          }),
          boardDraft({
            sourceId: '00000000-0000-4000-8000-0000000000e3',
            title: 'generated key',
            orderKey: null,
          }),
        ],
        checkIns: [],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const active = await listActiveBoards(harness.deps);
    if (!active.ok) {
      throw new Error('boards failed');
    }
    // the generated key must sort after every preserved key
    expect(active.value.map((board) => board.title)).toEqual([
      'early key',
      'late key',
      'generated key',
    ]);
    await harness.db.closeAsync();
  });
});

describe('reminder import edges', () => {
  it('skips reminders with unknown boards or invalid rules', async () => {
    const harness = await createTestHarness();
    const result = await importSnapshot(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      draft: {
        source: 'own',
        boards: [
          {
            sourceId: '00000000-0000-4000-8000-0000000000a1',
            title: 'with reminders',
            symbol: 'star.fill',
            accentHex: '#78D98B',
            usesTintedBackground: true,
            tracksAmount: false,
            amountUnit: null,
            quickAmount: 1,
            tracksTime: false,
            startOfDayMinute: 0,
            metricsEnabled: true,
            createdAtUtc: Date.UTC(2026, 7, 1, 12),
            archivedAtUtc: null,
            preserveId: true,
            periods: null,
            orderKey: null,
          },
        ],
        checkIns: [],
        reminders: [
          {
            sourceId: '00000000-0000-4000-8000-0000000000b1',
            sourceBoardId: 'missing-board',
            weekdaysMask: 1,
            minuteOfDay: 480,
            message: null,
            enabled: true,
            createdAtUtc: 0,
          },
          {
            sourceId: '00000000-0000-4000-8000-0000000000b2',
            sourceBoardId: '00000000-0000-4000-8000-0000000000a1',
            weekdaysMask: 0,
            minuteOfDay: 480,
            message: null,
            enabled: true,
            createdAtUtc: 0,
          },
          {
            sourceId: 'not-a-uuid',
            sourceBoardId: '00000000-0000-4000-8000-0000000000a1',
            weekdaysMask: 1,
            minuteOfDay: 480,
            message: null,
            enabled: true,
            createdAtUtc: 0,
          },
          {
            sourceId: '00000000-0000-4000-8000-0000000000b3',
            sourceBoardId: '00000000-0000-4000-8000-0000000000a1',
            weekdaysMask: 0b0000011,
            minuteOfDay: 600,
            message: 'kept',
            enabled: false,
            createdAtUtc: Date.UTC(2026, 7, 2),
          },
        ],
      },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.remindersCreated).toBe(1);
    expect(result.value.remindersSkipped).toBe(3);
    await harness.db.closeAsync();
  });

  it('parses reminder records from own exports fail-soft', () => {
    const parsed = parseOwnExport(
      JSON.stringify({
        format: 'ripples.export',
        exportVersion: 1,
        boards: [],
        checkIns: [],
        reminders: [
          null,
          {},
          { id: 'x', boardId: 'y', weekdaysMask: 'seven', minuteOfDay: 480 },
          {
            id: '00000000-0000-4000-8000-0000000000c1',
            boardId: '00000000-0000-4000-8000-0000000000c2',
            weekdaysMask: 3,
            minuteOfDay: 610,
            message: 'go',
            enabled: true,
            createdAtUtc: 5,
          },
          {
            id: '00000000-0000-4000-8000-0000000000c3',
            boardId: '00000000-0000-4000-8000-0000000000c2',
            weekdaysMask: 1,
            minuteOfDay: 60,
          },
        ],
      }),
    );
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    expect(parsed.value.reminders).toEqual([
      {
        sourceId: '00000000-0000-4000-8000-0000000000c1',
        sourceBoardId: '00000000-0000-4000-8000-0000000000c2',
        weekdaysMask: 3,
        minuteOfDay: 610,
        message: 'go',
        enabled: true,
        createdAtUtc: 5,
      },
      {
        sourceId: '00000000-0000-4000-8000-0000000000c3',
        sourceBoardId: '00000000-0000-4000-8000-0000000000c2',
        weekdaysMask: 1,
        minuteOfDay: 60,
        message: null,
        enabled: false,
        createdAtUtc: 0,
      },
    ]);
  });
});
