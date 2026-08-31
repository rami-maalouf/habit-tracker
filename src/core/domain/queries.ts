import { consistencyBand, consistencyPercent } from '../analytics/consistency';
import { heatmapIntensity } from '../analytics/heatmap';
import type { HeatmapIntensity } from '../analytics/heatmap';
import { currentStreak, longestStreak, streakSpans } from '../analytics/streaks';
import type { StreakSpan } from '../analytics/streaks';
import { monthlyCounts } from '../analytics/timeline';
import { weekdayAnalytics } from '../analytics/weekdays';
import type { WeekdayAnalytics } from '../analytics/weekdays';
import { yearComparison } from '../analytics/year-comparison';
import type { YearComparison } from '../analytics/year-comparison';
import {
  addDays,
  compareLogicalDates,
  currentLogicalDate,
  daysBetween,
  monthOf,
  parseLogicalDate,
  startOfIsoWeek,
} from '../calendar/logical-date';
import type { ActivityPeriodRange } from '../calendar/periods';
import { isDateEligible } from '../calendar/periods';
import type { SqlDatabase, SqlExecutor } from '../persistence/database';
import { readWidgetRows } from '../persistence/projections/widget-rows';
import {
  getBoardById,
  listActiveBoards as listActiveBoardRows,
  listArchivedBoards as listArchivedBoardRows,
} from '../persistence/repositories/boards';
import {
  allDailyCounts,
  countBoardCheckIns,
  countBoardNotes,
  dailyCounts,
  earliestCheckInDate,
  getCheckInById,
  latestCheckInForDate,
  listBoardCheckIns,
  listBoardCheckInsForDate,
  listBoardJournal,
  monthlyCheckInTotals,
} from '../persistence/repositories/check-ins';
import {
  countEnabledActiveReminders,
  getReminderById as getReminderRow,
  listBoardReminders as listBoardReminderRows,
  listRemindersForReconcile,
} from '../persistence/repositories/reminders';
import { getSettings, getSyncState, listBoardPeriods } from '../persistence/repositories/support';
import type { Board, CheckIn, Reminder, WidgetBoardRow } from './entities';
import type { BoardId, CheckInId, LogicalDate, ReminderId } from './ids';
import type { Clock } from './ports';
import type { DomainResult } from './result';
import { err, ok } from './result';

export type QueryDeps = {
  db: SqlDatabase;
  clock: Clock;
};

async function runQuery<Value>(
  deps: QueryDeps,
  work: (tx: SqlExecutor, now: number, timeZoneId: string) => Promise<Value>,
): Promise<DomainResult<Value>> {
  try {
    // one deferred read transaction per query keeps multi-statement reads on
    // a single consistent snapshot while writers proceed
    const value = await deps.db.withTransactionAsync((tx) =>
      work(tx, deps.clock.nowUtcMs(), deps.clock.timeZoneId()),
    );
    return ok(value);
  } catch (cause) {
    return err('database', `The data could not be loaded: ${message(cause)}`, {
      retryable: true,
    });
  }
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function boardToday(board: Board, now: number, timeZoneId: string): LogicalDate {
  return currentLogicalDate(now, timeZoneId, board.startOfDayMinute);
}

function toPeriodRanges(periods: { startDate: LogicalDate; endDate: LogicalDate | null }[]): ActivityPeriodRange[] {
  return periods.map((period) => ({ startDate: period.startDate, endDate: period.endDate }));
}

// closed activity periods break streaks: only eligible completed days count
function eligibleCompletedDays(
  counts: ReadonlyMap<string, number>,
  periods: ActivityPeriodRange[],
  today: LogicalDate,
): Set<string> {
  const completed = new Set<string>();
  for (const date of counts.keys()) {
    if (isDateEligible(date as LogicalDate, periods, today)) {
      completed.add(date);
    }
  }
  return completed;
}

function eligibleDaysElapsed(periods: ActivityPeriodRange[], today: LogicalDate): number {
  let eligibleDayCount = 0;
  for (const period of periods) {
    const end =
      period.endDate !== null && compareLogicalDates(period.endDate, today) < 0
        ? period.endDate
        : today;
    if (compareLogicalDates(period.startDate, end) <= 0) {
      eligibleDayCount += daysBetweenInclusive(period.startDate, end);
    }
  }
  return eligibleDayCount;
}

// --- boards ------------------------------------------------------------------

export function listActiveBoards(deps: QueryDeps): Promise<DomainResult<Board[]>> {
  return runQuery(deps, (tx) => listActiveBoardRows(tx));
}

export function listArchivedBoards(deps: QueryDeps): Promise<DomainResult<Board[]>> {
  return runQuery(deps, (tx) => listArchivedBoardRows(tx));
}

export async function getBoard(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<Board>> {
  const result = await runQuery(deps, (tx) => getBoardById(tx, boardId));
  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    return err('not_found', 'This board no longer exists.');
  }
  return ok(result.value);
}

export type HomeBoardCard = {
  board: Board;
  today: LogicalDate;
  // seven counts, oldest first, ending today
  strip: number[];
};

export function getHomeBoardProjection(
  deps: QueryDeps,
): Promise<DomainResult<HomeBoardCard[]>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const boards = await listActiveBoardRows(tx);
    const cards: HomeBoardCard[] = [];
    for (const board of boards) {
      const today = boardToday(board, now, timeZoneId);
      const counts = await dailyCounts(tx, board.id, addDays(today, -6), today);
      const strip: number[] = [];
      for (let offset = 6; offset >= 0; offset -= 1) {
        strip.push(counts.get(addDays(today, -offset)) ?? 0);
      }
      cards.push({ board, today, strip });
    }
    return cards;
  });
}

export function getSevenDayStrip(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<{ today: LogicalDate; strip: number[] } | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const today = boardToday(board, now, timeZoneId);
    const counts = await dailyCounts(tx, board.id, addDays(today, -6), today);
    const strip: number[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      strip.push(counts.get(addDays(today, -offset)) ?? 0);
    }
    return { today, strip };
  });
}

// --- heatmap -----------------------------------------------------------------

export type HeatmapCell = {
  date: LogicalDate;
  count: number;
  intensity: HeatmapIntensity;
  isToday: boolean;
  isFuture: boolean;
  eligible: boolean;
};

export type HeatmapWeek = {
  // monday-first column of seven cells
  days: HeatmapCell[];
};

// rolling window ending today, aligned to iso weeks for rendering
export function getBoardHeatmap(
  deps: QueryDeps,
  boardId: BoardId,
  options: { days?: number; endDate?: LogicalDate } = {},
): Promise<DomainResult<{ weeks: HeatmapWeek[]; today: LogicalDate } | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const today = boardToday(board, now, timeZoneId);
    const end = options.endDate ?? today;
    const windowDays = options.days ?? 365;
    const rawStart = addDays(end, -(windowDays - 1));
    const start = startOfIsoWeek(rawStart);
    const counts = await dailyCounts(tx, board.id, start, end);
    const periods = toPeriodRanges(await listBoardPeriods(tx, board.id));
    const weeks: HeatmapWeek[] = [];
    let cursor = start;
    while (compareLogicalDates(cursor, end) <= 0) {
      const days: HeatmapCell[] = [];
      for (let day = 0; day < 7; day += 1) {
        const date = addDays(cursor, day);
        // monday alignment can extend beyond the requested window on both
        // sides; those cells render as outside the window, not as data
        const inWindow =
          compareLogicalDates(date, rawStart) >= 0 && compareLogicalDates(date, end) <= 0;
        const count = inWindow ? (counts.get(date) ?? 0) : 0;
        const isFuture = compareLogicalDates(date, today) > 0;
        days.push({
          date,
          count,
          intensity: isFuture || !inWindow ? 'empty' : heatmapIntensity(count),
          isToday: date === today,
          isFuture,
          eligible:
            inWindow &&
            !isFuture &&
            isDateEligible(date, periods, today),
        });
      }
      weeks.push({ days });
      cursor = addDays(cursor, 7);
    }
    return { weeks, today };
  });
}

// --- history and journal -------------------------------------------------------

export type HistoryDayGroup = {
  date: LogicalDate;
  count: number;
  checkIns: CheckIn[];
};

export type HistoryMonthGroup = {
  month: string;
  count: number;
  days: HistoryDayGroup[];
};

export type GroupedCheckInHistory = {
  months: HistoryMonthGroup[];
  // true whenever records older than the loaded page remain
  hasMore: boolean;
};

export function getGroupedCheckInHistory(
  deps: QueryDeps,
  boardId: BoardId,
  options: { limit?: number } = {},
): Promise<DomainResult<GroupedCheckInHistory>> {
  return runQuery(deps, async (tx) => {
    // one extra row detects an overflowing page; the trailing partial day
    // is trimmed so day counts stay exact, unless it is the only day
    const fetched =
      options.limit === undefined
        ? await listBoardCheckIns(tx, boardId)
        : await listBoardCheckIns(tx, boardId, options.limit + 1);
    let checkIns = fetched;
    if (options.limit !== undefined && fetched.length > options.limit) {
      const bounded = fetched.slice(0, options.limit);
      const lastDate = bounded[bounded.length - 1].logicalDate;
      if (fetched[options.limit].logicalDate !== lastDate) {
        // the overflow row starts an older day: the page ends exactly on a
        // complete day and nothing is trimmed
        checkIns = bounded;
      } else {
        const trimmed = bounded.filter((checkIn) => checkIn.logicalDate !== lastDate);
        // a day larger than the whole page is completed instead of trimmed
        // so its count stays exact
        checkIns =
          trimmed.length > 0 ? trimmed : await listBoardCheckInsForDate(tx, boardId, lastDate);
      }
    }
    const monthTotals =
      options.limit === undefined ? null : await monthlyCheckInTotals(tx, boardId);
    const months: HistoryMonthGroup[] = [];
    for (const checkIn of checkIns) {
      const month = monthOf(checkIn.logicalDate);
      let monthGroup = months[months.length - 1];
      if (!monthGroup || monthGroup.month !== month) {
        monthGroup = { month, count: 0, days: [] };
        months.push(monthGroup);
      }
      monthGroup.count += 1;
      let dayGroup = monthGroup.days[monthGroup.days.length - 1];
      if (!dayGroup || dayGroup.date !== checkIn.logicalDate) {
        dayGroup = { date: checkIn.logicalDate, count: 0, checkIns: [] };
        monthGroup.days.push(dayGroup);
      }
      dayGroup.count += 1;
      dayGroup.checkIns.push(checkIn);
    }
    let hasMore = false;
    if (monthTotals) {
      // month headers always show the true total, not the loaded slice;
      // every loaded month exists in the totals because both read the same
      // rows inside one snapshot
      for (const monthGroup of months) {
        monthGroup.count = monthTotals.get(monthGroup.month) as number;
      }
      let totalRows = 0;
      for (const total of monthTotals.values()) {
        totalRows += total;
      }
      hasMore = checkIns.length < totalRows;
    }
    return { months, hasMore };
  });
}

export function getEarliestCheckInDate(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<LogicalDate | null>> {
  return runQuery(deps, async (tx) => {
    const earliest = await earliestCheckInDate(tx, boardId);
    return earliest as LogicalDate | null;
  });
}

export function getJournalTimeline(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<CheckIn[]>> {
  return runQuery(deps, (tx) => listBoardJournal(tx, boardId));
}

export function getCheckIn(
  deps: QueryDeps,
  checkInId: CheckInId,
): Promise<DomainResult<CheckIn | null>> {
  return runQuery(deps, (tx) => getCheckInById(tx, checkInId));
}

export function getLatestCheckInForDate(
  deps: QueryDeps,
  boardId: BoardId,
  logicalDate: LogicalDate,
): Promise<DomainResult<CheckIn | null>> {
  return runQuery(deps, (tx) => latestCheckInForDate(tx, boardId, logicalDate));
}

// --- summary and analytics ------------------------------------------------------

export type BoardSummary = {
  today: LogicalDate;
  eligibleDayCount: number;
  metricsReady: boolean;
  currentStreak: number;
  longestStreak: number;
  // rolling 30 elapsed days ending today
  consistencyPercent: number | null;
  consistencyBand: 'low' | 'average' | 'high' | null;
  currentMonthCount: number;
  currentWeekCount: number;
  // daily counts for the current month, day 1 .. today
  currentMonthDaily: number[];
};

export function getBoardSummary(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<BoardSummary | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const today = boardToday(board, now, timeZoneId);
    const counts = await allDailyCounts(tx, board.id);
    const periods = toPeriodRanges(await listBoardPeriods(tx, board.id));
    const completed = eligibleCompletedDays(counts, periods, today);
    const eligibleDayCount = eligibleDaysElapsed(periods, today);
    const rolling = consistencyPercent(completed, periods, addDays(today, -29), today, today);
    const monthStart = `${monthOf(today)}-01` as LogicalDate;
    const weekStart = startOfIsoWeek(today);
    let currentMonthCount = 0;
    let currentWeekCount = 0;
    const { day: todayDay } = parseLogicalDate(today);
    const currentMonthDaily = new Array<number>(todayDay).fill(0);
    for (const [date, count] of counts) {
      const logical = date as LogicalDate;
      if (compareLogicalDates(logical, monthStart) >= 0 && compareLogicalDates(logical, today) <= 0) {
        currentMonthCount += count;
        currentMonthDaily[parseLogicalDate(logical).day - 1] = count;
      }
      if (compareLogicalDates(logical, weekStart) >= 0 && compareLogicalDates(logical, today) <= 0) {
        currentWeekCount += count;
      }
    }
    return {
      today,
      eligibleDayCount,
      metricsReady: eligibleDayCount >= 7,
      currentStreak: currentStreak(completed, today),
      longestStreak: longestStreak(completed),
      consistencyPercent: rolling.percent,
      consistencyBand: rolling.percent === null ? null : consistencyBand(rolling.percent),
      currentMonthCount,
      currentWeekCount,
      currentMonthDaily,
    };
  });
}

function daysBetweenInclusive(start: LogicalDate, end: LogicalDate): number {
  return daysBetween(start, end) + 1;
}

export function getTimelineAnalytics(
  deps: QueryDeps,
  boardId: BoardId,
  year: number,
): Promise<DomainResult<{ year: number; months: number[] } | null>> {
  return runQuery(deps, async (tx) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const counts = await allDailyCounts(tx, board.id);
    return { year, months: monthlyCounts(counts, year) };
  });
}

export function getWeekdayAnalytics(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<WeekdayAnalytics | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const today = boardToday(board, now, timeZoneId);
    const periods = toPeriodRanges(await listBoardPeriods(tx, board.id));
    // weekday analysis requires seven elapsed eligible days
    if (eligibleDaysElapsed(periods, today) < 7) {
      return null;
    }
    const counts = await allDailyCounts(tx, board.id);
    return weekdayAnalytics(counts, today);
  });
}

export function getYearComparison(
  deps: QueryDeps,
  boardId: BoardId,
  selectedYear: number,
): Promise<DomainResult<YearComparison | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const counts = await allDailyCounts(tx, board.id);
    const today = boardToday(board, now, timeZoneId);
    const { year, month } = parseLogicalDate(today);
    return yearComparison(counts, selectedYear, year, month);
  });
}

export type MonthlyConsistency = {
  month: string;
  percent: number | null;
  band: 'low' | 'average' | 'high' | null;
};

export function getConsistencyAnalytics(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<MonthlyConsistency[] | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const today = boardToday(board, now, timeZoneId);
    const counts = await allDailyCounts(tx, board.id);
    const periods = toPeriodRanges(await listBoardPeriods(tx, board.id));
    // consistency analysis requires seven elapsed eligible days
    if (eligibleDaysElapsed(periods, today) < 7) {
      return null;
    }
    const completed = new Set(counts.keys());
    const months: MonthlyConsistency[] = [];
    const { year, month } = parseLogicalDate(today);
    for (let offset = 11; offset >= 0; offset -= 1) {
      const total = year * 12 + (month - 1) - offset;
      const m = (total % 12) + 1;
      const y = Math.floor(total / 12);
      const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01` as LogicalDate;
      const nextTotal = total + 1;
      const nextStart = `${String(Math.floor(nextTotal / 12)).padStart(4, '0')}-${String((nextTotal % 12) + 1).padStart(2, '0')}-01` as LogicalDate;
      const end = addDays(nextStart, -1);
      const result = consistencyPercent(completed, periods, start, end, today);
      months.push({
        month: start.slice(0, 7),
        percent: result.percent,
        band: result.percent === null ? null : consistencyBand(result.percent),
      });
    }
    return months;
  });
}

export function getStreakAnalytics(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<{ spans: StreakSpan[]; allTimeLongest: number; windowStart: LogicalDate; windowEnd: LogicalDate } | null>> {
  return runQuery(deps, async (tx, now, timeZoneId) => {
    const board = await getBoardById(tx, boardId);
    if (!board) {
      return null;
    }
    const today = boardToday(board, now, timeZoneId);
    const counts = await allDailyCounts(tx, board.id);
    const periods = toPeriodRanges(await listBoardPeriods(tx, board.id));
    const completed = eligibleCompletedDays(counts, periods, today);
    const windowStart = addDays(today, -364);
    return {
      spans: streakSpans(completed, windowStart, today),
      allTimeLongest: longestStreak(completed),
      windowStart,
      windowEnd: today,
    };
  });
}

// --- supporting queries ---------------------------------------------------------

export function getBoardDependentCounts(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<{ checkIns: number; notes: number; reminders: number }>> {
  return runQuery(deps, async (tx) => {
    const checkIns = await countBoardCheckIns(tx, boardId);
    const notes = await countBoardNotes(tx, boardId);
    const reminders = await tx.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM reminders WHERE board_id = ? AND deleted_at IS NULL',
      [boardId],
    );
    return { checkIns, notes, reminders: reminders?.count ?? 0 };
  });
}

export function getWidgetProjection(deps: QueryDeps): Promise<DomainResult<WidgetBoardRow[]>> {
  return runQuery(deps, (tx) => readWidgetRows(tx));
}

export function getMetricsEducationDismissed(
  deps: QueryDeps,
): Promise<DomainResult<BoardId[]>> {
  return runQuery(deps, async (tx) => {
    const settings = await getSettings(tx);
    return settings?.metricsEducationDismissed ?? [];
  });
}

export function getAppSettings(deps: QueryDeps) {
  return runQuery(deps, (tx) => getSettings(tx));
}

export type SyncSummary = {
  enabled: boolean;
  // outbox depth, so the ui can say what is still waiting to upload
  pendingChanges: number;
  lastSuccessAtUtc: number | null;
};

export function getSyncSummary(deps: QueryDeps): Promise<DomainResult<SyncSummary>> {
  return runQuery(deps, async (tx) => {
    const row = await tx.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM mutation_outbox',
    );
    const state = await getSyncState(tx);
    const settings = await getSettings(tx);
    return {
      enabled: settings?.iCloudSyncEnabled === true,
      pendingChanges: row?.total ?? 0,
      lastSuccessAtUtc: state.lastSuccessAtUtc,
    };
  });
}

// --- reminders --------------------------------------------------------------

export function listBoardReminders(
  deps: QueryDeps,
  boardId: BoardId,
): Promise<DomainResult<Reminder[]>> {
  return runQuery(deps, (tx) => listBoardReminderRows(tx, boardId));
}

export function getReminder(
  deps: QueryDeps,
  reminderId: ReminderId,
): Promise<DomainResult<Reminder | null>> {
  return runQuery(deps, (tx) => getReminderRow(tx, reminderId));
}

export type NotificationOverview = {
  enabledReminderCount: number;
  // reminders whose last schedule attempt failed or was denied, for the
  // settings surface
  scheduleErrors: { reminderId: ReminderId; boardTitle: string; code: string }[];
};

export function getNotificationOverview(
  deps: QueryDeps,
): Promise<DomainResult<NotificationOverview>> {
  return runQuery(deps, async (tx) => {
    const enabledReminderCount = await countEnabledActiveReminders(tx);
    const scheduleErrors: NotificationOverview['scheduleErrors'] = [];
    for (const entry of await listRemindersForReconcile(tx)) {
      if (entry.reminder.scheduleState === 'error') {
        scheduleErrors.push({
          reminderId: entry.reminder.id,
          boardTitle: entry.boardTitle,
          code: entry.reminder.lastScheduleError ?? 'unknown',
        });
      }
    }
    return { enabledReminderCount, scheduleErrors };
  });
}
