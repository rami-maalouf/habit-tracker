// jest replacement for @/platform/widgets: records refreshes and lets tests
// emit widget quick actions
import type { QueryDeps } from '@/core/domain/queries';

export const widgetsPlatformMock = {
  refreshCalls: 0,
  quickHandlers: new Set<(boardId: string) => void>(),
  reset() {
    this.refreshCalls = 0;
    this.quickHandlers = new Set();
  },
  emitQuickAction(boardId: string) {
    for (const handler of this.quickHandlers) {
      handler(boardId);
    }
  },
};

export async function refreshWidgets(_deps: QueryDeps): Promise<void> {
  widgetsPlatformMock.refreshCalls += 1;
}

export function addWidgetQuickActionListener(handler: (boardId: string) => void): () => void {
  widgetsPlatformMock.quickHandlers.add(handler);
  return () => widgetsPlatformMock.quickHandlers.delete(handler);
}
