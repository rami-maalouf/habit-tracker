import type { QueryDeps } from '@/core/domain/queries';

// android-safe entry: the ios implementation lives in index.ios.ts, so a
// route imported on android never evaluates expo-widgets or SwiftUI. an
// Android Glance widget reading the same projection is future kotlin work
// (see docs/android-readiness.md).
export async function refreshWidgets(_deps: QueryDeps): Promise<void> {
  // no widget host on android in this release
}

export function addWidgetQuickActionListener(_handler: (boardId: string) => void): () => void {
  return () => {};
}
