import type { WidgetBoardRow } from '@/core/domain/entities';

// props handed to the widget timeline; rows follow active home order and
// carry everything a family needs to render without ad hoc queries
export type WidgetRowProps = {
  boardId: string;
  title: string;
  symbol: string;
  accentHex: string;
  // seven logical days ending today, oldest first; values are counts
  strip: number[];
};

export type RipplesWidgetProps = {
  rows: WidgetRowProps[];
  // set on the entry after the next logical-day boundary: the strip may be
  // stale, and accessibility asks to open the app to refresh
  stale: boolean;
};

// spec row budgets per home screen family
export const WIDGET_ROW_LIMITS = {
  systemSmall: 1,
  systemMedium: 3,
  systemLarge: 7,
  systemExtraLarge: 12,
} as const;

const MAX_ROWS = WIDGET_ROW_LIMITS.systemExtraLarge;

export function widgetPropsFromProjection(rows: WidgetBoardRow[]): RipplesWidgetProps {
  return {
    rows: rows.slice(0, MAX_ROWS).map((row) => ({
      boardId: row.boardId,
      title: row.title,
      symbol: row.symbol,
      accentHex: row.accentHex,
      strip: row.strip,
    })),
    stale: false,
  };
}

// the earliest possible logical-day boundary is local midnight (start-of-day
// shifts only push a board's boundary later), so the stale entry lands there
export function nextWidgetRefreshUtc(nowUtcMs: number, timeZoneId: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    timeZone: timeZoneId,
  }).formatToParts(new Date(nowUtcMs));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsedMs =
    ((value('hour') % 24) * 3600 + value('minute') * 60 + value('second')) * 1000;
  const dayMs = 24 * 3600 * 1000;
  // one extra second keeps the entry safely past the boundary
  return nowUtcMs + (dayMs - elapsedMs) + 1000;
}
