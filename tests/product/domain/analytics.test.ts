import { consistencyBand, consistencyPercent, roundHalfAwayFromZero } from '@/core/analytics/consistency';
import { heatmapIntensity } from '@/core/analytics/heatmap';
import { currentStreak, hasAnyCompletedDay, isCompletedDayEligible, longestStreak, streakSpans } from '@/core/analytics/streaks';
import { monthlyCounts } from '@/core/analytics/timeline';
import { weekdayAnalytics } from '@/core/analytics/weekdays';
import { yearComparison } from '@/core/analytics/year-comparison';
import { addDays } from '@/core/calendar/logical-date';
import { isDateEligible } from '@/core/calendar/periods';
import { createCheckIn } from '@/core/domain/commands';
import type { LogicalDate } from '@/core/domain/ids';
import { getBoardSummary, getConsistencyAnalytics, getStreakAnalytics, getWeekdayAnalytics, getYearComparison } from '@/core/domain/queries';

import { createTestHarness } from '../helpers/test-db';
import { createBoardForTest } from '../helpers/product-fixtures';

const d = (value: string) => value as LogicalDate;

describe('streaks', () => {
  const today = d('2026-08-30');

  it('counts the current streak ending today when today is complete', () => {
    const completed = new Set(['2026-08-28', '2026-08-29', '2026-08-30']);
    expect(currentStreak(completed, today)).toBe(3);
  });

  it('does not break the streak early when today is unfinished', () => {
    const completed = new Set(['2026-08-28', '2026-08-29']);
    expect(currentStreak(completed, today)).toBe(2);
  });

  it('returns zero when yesterday and today are empty', () => {
    const completed = new Set(['2026-08-20']);
    expect(currentStreak(completed, today)).toBe(0);
  });

  it('finds the longest streak across history', () => {
    const completed = new Set([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-08-30',
    ]);
    expect(longestStreak(completed)).toBe(4);
    expect(longestStreak(new Set())).toBe(0);
    expect(hasAnyCompletedDay(completed)).toBe(true);
    expect(hasAnyCompletedDay(new Set())).toBe(false);
  });

  it('collects streak spans intersecting the window', () => {
    const completed = new Set(['2026-08-01', '2026-08-02', '2026-08-20', '2025-01-01']);
    const spans = streakSpans(completed, d('2026-08-01'), d('2026-08-30'));
    expect(spans).toEqual([
      { startDate: '2026-08-01', endDate: '2026-08-02', length: 2 },
      { startDate: '2026-08-20', endDate: '2026-08-20', length: 1 },
    ]);
  });
});

describe('consistency and eligibility', () => {
  const today = d('2026-08-30');
  const periods = [
    { startDate: d('2026-08-01'), endDate: d('2026-08-10') },
    { startDate: d('2026-08-21'), endDate: null },
  ];

  it('excludes archived gaps, pre-creation days, and the future', () => {
    expect(isDateEligible(d('2026-07-31'), periods, today)).toBe(false);
    expect(isDateEligible(d('2026-08-05'), periods, today)).toBe(true);
    expect(isDateEligible(d('2026-08-15'), periods, today)).toBe(false);
    expect(isDateEligible(d('2026-08-25'), periods, today)).toBe(true);
    expect(isDateEligible(d('2026-09-01'), periods, today)).toBe(false);
    expect(isCompletedDayEligible(d('2026-08-05'), periods, today)).toBe(true);
  });

  it('computes completed eligible over elapsed eligible days', () => {
    const completed = new Set(['2026-08-01', '2026-08-02', '2026-08-25']);
    const result = consistencyPercent(completed, periods, d('2026-08-01'), today, today);
    // eligible: aug 1-10 (10 days) + aug 21-30 (10 days) = 20
    expect(result.eligibleDays).toBe(20);
    expect(result.completedEligibleDays).toBe(3);
    expect(result.percent).toBeCloseTo(15);
  });

  it('returns null with no eligible days', () => {
    const result = consistencyPercent(new Set(), [], d('2026-08-01'), today, today);
    expect(result.percent).toBeNull();
  });

  it('bands on the rounded percent with half away from zero', () => {
    expect(consistencyBand(39.4)).toBe('low');
    expect(consistencyBand(39.5)).toBe('average');
    expect(consistencyBand(74.4)).toBe('average');
    expect(consistencyBand(74.5)).toBe('high');
    expect(consistencyBand(100)).toBe('high');
    expect(roundHalfAwayFromZero(0)).toBe(0);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
  });
});

describe('heatmap intensity', () => {
  it('maps counts to bands', () => {
    expect(heatmapIntensity(0)).toBe('empty');
    expect(heatmapIntensity(1)).toBe('low');
    expect(heatmapIntensity(2)).toBe('medium');
    expect(heatmapIntensity(3)).toBe('high');
    expect(heatmapIntensity(9)).toBe('high');
  });
});

describe('timeline, weekdays, and year comparison', () => {
  it('sums monthly counts for one year with leap day in february', () => {
    const counts = new Map([
      ['2028-02-29', 2],
      ['2028-02-01', 1],
      ['2028-03-01', 4],
      ['2027-12-31', 9],
    ]);
    expect(monthlyCounts(counts, 2028)).toEqual([0, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('computes weekday aggregates and direction over the rolling year', () => {
    const today = d('2026-08-30'); // sunday
    const counts = new Map<string, number>([
      ['2026-08-24', 2], // monday, latest window
      ['2026-08-29', 1], // saturday, latest window
      [addDays(today, -200), 5], // preceding window
      [addDays(today, -400), 9], // outside window entirely
    ]);
    const result = weekdayAnalytics(counts, today);
    expect(result.weekdayCounts[0]).toBe(2);
    expect(result.weekdayCounts[5]).toBe(1);
    expect(result.workdayCount).toBe(2 + 5);
    expect(result.weekendCount).toBe(1);
    expect(result.workdayPercent).toBeCloseTo((7 / 8) * 100);
    expect(result.direction).toBe('down'); // latest 3 < preceding 5
    const empty = weekdayAnalytics(new Map(), today);
    expect(empty.workdayPercent).toBeNull();
    expect(empty.direction).toBe('neutral');
  });

  it('marks future months unavailable only in the current selected year', () => {
    const counts = new Map([
      ['2026-01-15', 3],
      ['2025-06-01', 2],
    ]);
    const current = yearComparison(counts, 2026, 2026, 8);
    expect(current.selected[0]).toBe(3);
    expect(current.selected[8]).toBeNull();
    expect(current.previous[5]).toBe(2);
    const past = yearComparison(counts, 2025, 2026, 8);
    expect(past.selected.every((month) => month !== null)).toBe(true);
    // a wholly future year has no available months at all
    const future = yearComparison(counts, 2027, 2026, 8);
    expect(future.selected.every((month) => month === null)).toBe(true);
  });
});

describe('analytics queries over the real store', () => {
  it('produces summary, consistency months, streak spans, and weekday data', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    // metrics require seven elapsed eligible days
    harness.clock.advanceDays(7); // today becomes sunday 2026-09-06
    for (const [date, times] of [
      ['2026-09-01', 2],
      ['2026-09-04', 1],
      ['2026-09-05', 1],
      ['2026-09-06', 1],
    ] as const) {
      for (let index = 0; index < times; index += 1) {
        await createCheckIn(harness.deps, {
          commandId: harness.ids.nextCommandId(),
          boardId,
          logicalDate: d(date),
          source: 'app',
        });
      }
    }
    const summary = await getBoardSummary(harness.deps, boardId);
    if (!summary.ok || summary.value === null) {
      throw new Error('summary missing');
    }
    expect(summary.value.metricsReady).toBe(true);
    expect(summary.value.currentStreak).toBe(3);
    expect(summary.value.longestStreak).toBe(3);
    expect(summary.value.currentMonthCount).toBe(5);
    // iso week of monday aug 31 contains all five seeded check-ins
    expect(summary.value.currentWeekCount).toBe(5);
    const weekdays = await getWeekdayAnalytics(harness.deps, boardId);
    // saturday sep 5 plus sunday sep 6
    expect(weekdays.ok && weekdays.value?.weekendCount).toBe(2);
    const years = await getYearComparison(harness.deps, boardId, 2026);
    expect(years.ok && years.value?.selected[8]).toBe(5);
    const consistency = await getConsistencyAnalytics(harness.deps, boardId);
    expect(consistency.ok && consistency.value?.at(-1)?.month).toBe('2026-09');
    const streaks = await getStreakAnalytics(harness.deps, boardId);
    expect(streaks.ok && streaks.value?.allTimeLongest).toBe(3);
    await harness.db.closeAsync();
  });

  it('returns null for weekday and consistency analysis before seven eligible days', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const weekdays = await getWeekdayAnalytics(harness.deps, boardId);
    expect(weekdays.ok && weekdays.value).toBeNull();
    const consistency = await getConsistencyAnalytics(harness.deps, boardId);
    expect(consistency.ok && consistency.value).toBeNull();
    await harness.db.closeAsync();
  });

  it('excludes archived-gap days from streaks even with historical entries', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const { archiveBoard, restoreBoard } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    harness.clock.advanceDays(3); // gap: aug 31 - sep 1; restored sep 2
    await restoreBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    // historical entries inside the archived gap are stored but ineligible
    for (const date of ['2026-08-31', '2026-09-01', '2026-09-02'] as const) {
      await createCheckIn(harness.deps, {
        commandId: harness.ids.nextCommandId(),
        boardId,
        logicalDate: d(date),
        source: 'app',
      });
    }
    const summary = await getBoardSummary(harness.deps, boardId);
    if (!summary.ok || summary.value === null) {
      throw new Error('summary missing');
    }
    // the gap breaks the run: only sep 2 counts toward the current streak
    expect(summary.value.currentStreak).toBe(1);
    expect(summary.value.longestStreak).toBe(1);
    const streaks = await getStreakAnalytics(harness.deps, boardId);
    expect(streaks.ok && streaks.value?.spans.every((span) => span.length === 1)).toBe(true);
    await harness.db.closeAsync();
  });
});
