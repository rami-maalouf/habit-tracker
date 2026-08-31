import type { CheckIn } from '@/core/domain/entities';

// one section per logical day, newest first
export type HistoryDaySection = {
  title: string;
  monthHeader: string | null;
  monthCount: number;
  count: number;
  data: CheckIn[];
};

export type HistoryListProps = {
  sections: HistoryDaySection[];
  boardTitle: string;
  amountUnit: string | null;
  // archived boards render read-only rows: no taps, no deletes
  archived: boolean;
  onOpen: (checkInId: string) => void;
  onDelete: (checkInId: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
};
