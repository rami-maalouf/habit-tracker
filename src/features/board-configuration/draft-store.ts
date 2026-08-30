import { useSyncExternalStore } from 'react';

import type { Board } from '@/core/domain/entities';
import { boardPalette, boardSymbolAllowlist } from '@/core/domain/entities';
import type { BoardId } from '@/core/domain/ids';

// one in-flight board draft shared across the create/edit sheet and its
// options screen; sheets read and write the draft, saving commits it
export type BoardDraft = {
  boardId: BoardId | null;
  expectedMutationStamp: string | null;
  title: string;
  symbol: string;
  accentHex: string;
  usesTintedBackground: boolean;
  tracksAmount: boolean;
  amountUnit: string;
  quickAmountText: string;
  tracksTime: boolean;
  startOfDayMinute: number;
  metricsEnabled: boolean;
  dirty: boolean;
};

// a draft session exists only while a form sheet owns it; screens that read
// the draft outside a session (direct navigation to options) must bail out
type DraftState = {
  draft: BoardDraft;
  active: boolean;
  // the react useId of the sheet that seeded the session, so a sheet can
  // verify the live draft is its own without local state or refs
  owner: string | null;
};

export function newBoardDraft(): BoardDraft {
  return {
    boardId: null,
    expectedMutationStamp: null,
    title: '',
    symbol: boardSymbolAllowlist[1],
    accentHex: boardPalette[2].hex,
    usesTintedBackground: true,
    tracksAmount: false,
    amountUnit: '',
    quickAmountText: '1',
    tracksTime: false,
    startOfDayMinute: 0,
    metricsEnabled: true,
    dirty: false,
  };
}

export function draftFromBoard(board: Board): BoardDraft {
  return {
    boardId: board.id,
    expectedMutationStamp: board.mutationStamp,
    title: board.title,
    symbol: board.symbol,
    accentHex: board.accentHex,
    usesTintedBackground: board.usesTintedBackground,
    tracksAmount: board.tracksAmount,
    amountUnit: board.amountUnit ?? '',
    quickAmountText: String(board.quickAmount),
    tracksTime: board.tracksTime,
    startOfDayMinute: board.startOfDayMinute,
    metricsEnabled: board.metricsEnabled,
    dirty: false,
  };
}

let current: DraftState = { draft: newBoardDraft(), active: false, owner: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function startDraft(draft: BoardDraft, owner: string): void {
  current = { draft, active: true, owner };
  emit();
}

// only the owner that started the session may end it; cleanup from a
// stale form must not terminate a newer owner's session
export function endDraft(owner: string): void {
  if (current.owner !== owner) {
    return;
  }
  current = { draft: current.draft, active: false, owner: null };
  emit();
}

export function updateDraft(patch: Partial<BoardDraft>): void {
  current = {
    draft: { ...current.draft, ...patch, dirty: true },
    active: current.active,
    owner: current.owner,
  };
  emit();
}

export function getDraftState(): DraftState {
  return current;
}

export function useDraftState(): DraftState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getDraftState,
    getDraftState,
  );
}

export function useBoardDraft(): BoardDraft {
  return useDraftState().draft;
}
