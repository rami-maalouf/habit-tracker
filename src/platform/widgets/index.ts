import { addUserInteractionListener } from 'expo-widgets';
import { Platform } from 'react-native';

import { getWidgetProjection } from '@/core/domain/queries';
import type { QueryDeps } from '@/core/domain/queries';
import {
  nextWidgetRefreshUtc,
  widgetPropsFromProjection,
} from '@/features/widgets/widget-props';

import RipplesBoardsWidget from './ripples-boards-widget';

// pushes the current widget projection into the widget timeline: one entry
// now, and one stale-marked entry past the next logical-day boundary so an
// unrefreshed widget asks to be opened instead of showing wrong days
export async function refreshWidgets(deps: QueryDeps): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    const projection = await getWidgetProjection(deps);
    if (!projection.ok) {
      return;
    }
    const props = widgetPropsFromProjection(projection.value);
    const boundary = nextWidgetRefreshUtc(deps.clock.nowUtcMs(), deps.clock.timeZoneId());
    RipplesBoardsWidget.updateTimeline([
      { date: new Date(deps.clock.nowUtcMs()), props },
      { date: new Date(boundary), props: { ...props, stale: true } },
    ]);
  } catch {
    // widget refresh is best effort; the app itself stays authoritative
  }
}

// widget quick-action button presses arrive as interaction events with a
// `quick:<boardId>` target
export function addWidgetQuickActionListener(handler: (boardId: string) => void): () => void {
  if (Platform.OS !== 'ios') {
    return () => {};
  }
  const subscription = addUserInteractionListener((event) => {
    if (typeof event.target === 'string' && event.target.startsWith('quick:')) {
      handler(event.target.slice('quick:'.length));
    }
  });
  return () => subscription.remove();
}
